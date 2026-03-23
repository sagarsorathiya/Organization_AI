"""Knowledge Base & RAG service — document ingestion, chunking, and retrieval."""

import uuid
import hashlib
import logging
import math
from datetime import datetime, timezone

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import KnowledgeBase, KnowledgeDocument, DocumentChunk
from app.services.llm_service import llm_service
from app.config import settings

logger = logging.getLogger(__name__)


class RAGService:
    """Retrieval-Augmented Generation — 100% local via Ollama embeddings."""

    def __init__(self):
        self._embedding_api_unavailable = False
        self._embedding_api_unavailable_logged = False

    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding using Ollama locally."""
        import httpx

        if self._embedding_api_unavailable:
            return []

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                # Compatibility: support classic Ollama endpoints and OpenAI-compatible endpoint.
                endpoint_attempts: list[tuple[str, dict]] = [
                    ("/api/embeddings", {"model": settings.EMBEDDING_MODEL, "prompt": text}),
                    ("/api/embed", {"model": settings.EMBEDDING_MODEL, "input": text}),
                    ("/v1/embeddings", {"model": settings.EMBEDDING_MODEL, "input": text}),
                    ("/embeddings", {"model": settings.EMBEDDING_MODEL, "input": text}),
                ]

                response = None
                for path, payload in endpoint_attempts:
                    candidate = await client.post(f"{settings.LLM_BASE_URL}{path}", json=payload)
                    if candidate.status_code == 404:
                        continue
                    response = candidate
                    break

                if response is None:
                    self._embedding_api_unavailable = True
                    if not self._embedding_api_unavailable_logged:
                        logger.error(
                            "Embedding API unavailable at %s. Expected one of: /api/embeddings, /api/embed, /v1/embeddings, /embeddings.",
                            settings.LLM_BASE_URL,
                        )
                        self._embedding_api_unavailable_logged = True
                    return []

                response.raise_for_status()
                payload = response.json()
                embedding = payload.get("embedding")
                if isinstance(embedding, list):
                    return embedding

                embeddings = payload.get("embeddings")
                if isinstance(embeddings, list) and embeddings:
                    first = embeddings[0]
                    if isinstance(first, list):
                        return first

                # OpenAI-compatible shape: {"data":[{"embedding":[...]}], ...}
                data_items = payload.get("data")
                if isinstance(data_items, list) and data_items:
                    first_item = data_items[0]
                    if isinstance(first_item, dict):
                        openai_embedding = first_item.get("embedding")
                        if isinstance(openai_embedding, list):
                            return openai_embedding

                return []
        except Exception as e:
            logger.error("Embedding generation failed: %s", str(e))
            return []

    def chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
        """Split text into overlapping chunks."""
        if not text:
            return []
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            if chunk.strip():
                chunks.append(chunk.strip())
            start += chunk_size - overlap
        return chunks

    async def ingest_document(
        self, doc: KnowledgeDocument, content: str, db: AsyncSession
    ):
        """Process document text into embedded chunks."""
        kb = await db.get(KnowledgeBase, doc.knowledge_base_id)
        chunk_size = kb.chunk_size if kb else settings.RAG_CHUNK_SIZE
        chunk_overlap = kb.chunk_overlap if kb else settings.RAG_CHUNK_OVERLAP

        # Delete existing chunks for re-ingestion
        await db.execute(
            delete(DocumentChunk).where(DocumentChunk.document_id == doc.id)
        )

        chunks = self.chunk_text(content, chunk_size, chunk_overlap)
        doc.status = "processing"
        await db.flush()

        if not chunks:
            doc.status = "failed"
            doc.error_message = "No usable text chunks generated from document"
            doc.chunk_count = 0
            await db.flush()
            return

        first_embedding = await self.embed_text(chunks[0])
        if not first_embedding:
            doc.status = "failed"
            doc.error_message = (
                "Embedding generation unavailable. Ensure your LLM endpoint exposes /api/embeddings, /api/embed, /v1/embeddings, or /embeddings, "
                f"and embedding model '{settings.EMBEDDING_MODEL}' is available (for example: ollama pull {settings.EMBEDDING_MODEL})."
            )[:500]
            doc.chunk_count = 0
            await db.flush()
            return

        embedded_count = 0
        db.add(DocumentChunk(
            document_id=doc.id,
            content=chunks[0],
            chunk_index=0,
            embedding=first_embedding,
            metadata_={"chunk_index": 0, "total_chunks": len(chunks)},
        ))
        embedded_count += 1

        for i, chunk_text in enumerate(chunks[1:], start=1):
            embedding = await self.embed_text(chunk_text)
            if not embedding:
                continue
            chunk = DocumentChunk(
                document_id=doc.id,
                content=chunk_text,
                chunk_index=i,
                embedding=embedding,
                metadata_={"chunk_index": i, "total_chunks": len(chunks)},
            )
            db.add(chunk)
            embedded_count += 1

        if embedded_count == 0:
            doc.status = "failed"
            doc.error_message = "No chunks could be embedded"
            doc.chunk_count = 0
            await db.flush()
            return

        doc.status = "ready"
        doc.chunk_count = embedded_count

        # Update KB counts
        if kb:
            total_docs = (await db.execute(
                select(func.count()).select_from(KnowledgeDocument)
                .where(KnowledgeDocument.knowledge_base_id == kb.id)
            )).scalar() or 0
            total_chunks = (await db.execute(
                select(func.count()).select_from(DocumentChunk)
                .join(KnowledgeDocument)
                .where(KnowledgeDocument.knowledge_base_id == kb.id)
            )).scalar() or 0
            kb.document_count = total_docs
            kb.total_chunks = total_chunks
            kb.last_synced_at = datetime.now(timezone.utc)

        await db.flush()

    async def search(
        self, knowledge_base_id: uuid.UUID, query: str, db: AsyncSession, top_k: int = 5
    ) -> list[dict]:
        """Search for relevant chunks using cosine similarity on embeddings."""
        query_embedding = await self.embed_text(query)
        if not query_embedding:
            return []

        # Fetch all chunks for this KB (for smaller KBs; production would use pgvector)
        result = await db.execute(
            select(DocumentChunk, KnowledgeDocument)
            .join(KnowledgeDocument, DocumentChunk.document_id == KnowledgeDocument.id)
            .where(KnowledgeDocument.knowledge_base_id == knowledge_base_id)
            .where(DocumentChunk.embedding.isnot(None))
        )
        rows = result.all()

        # Compute cosine similarity in Python
        scored = []
        for chunk, doc in rows:
            if not chunk.embedding:
                continue
            sim = self._cosine_similarity(query_embedding, chunk.embedding)
            scored.append({
                "content": chunk.content,
                "document": doc.title,
                "document_id": str(doc.id),
                "score": sim,
                "chunk_index": chunk.chunk_index,
                "metadata": chunk.metadata_,
            })

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two vectors."""
        if len(a) != len(b) or not a:
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    async def augmented_context(
        self,
        knowledge_base_id: uuid.UUID | None,
        query: str,
        db: AsyncSession,
    ) -> str:
        """Build RAG context block from relevant chunks."""
        if not knowledge_base_id:
            return ""
        chunks = await self.search(knowledge_base_id, query, db, top_k=settings.RAG_TOP_K)
        if not chunks:
            return ""
        context_block = "\n\n".join([
            f"[Source: {c['document']}]\n{c['content']}"
            for c in chunks
        ])
        return f"\n\n## Reference Documents:\n{context_block}\n\nCite your sources when using this information."

    @staticmethod
    def compute_file_hash(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()


# Knowledge Base CRUD

class KnowledgeBaseService:

    async def list_knowledge_bases(self, db: AsyncSession) -> list[KnowledgeBase]:
        result = await db.execute(
            select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_knowledge_base(self, kb_id: uuid.UUID, db: AsyncSession) -> KnowledgeBase | None:
        return await db.get(KnowledgeBase, kb_id)

    async def create_knowledge_base(self, data: dict, db: AsyncSession) -> KnowledgeBase:
        kb = KnowledgeBase(**data)
        db.add(kb)
        await db.flush()
        return kb

    async def update_knowledge_base(self, kb_id: uuid.UUID, data: dict, db: AsyncSession) -> KnowledgeBase | None:
        kb = await db.get(KnowledgeBase, kb_id)
        if not kb:
            return None
        for key, value in data.items():
            if hasattr(kb, key) and key not in ("id", "created_at"):
                setattr(kb, key, value)
        await db.flush()
        return kb

    async def delete_knowledge_base(self, kb_id: uuid.UUID, db: AsyncSession) -> bool:
        kb = await db.get(KnowledgeBase, kb_id)
        if not kb:
            return False
        await db.delete(kb)
        await db.flush()
        return True

    async def get_kb_stats(self, db: AsyncSession) -> dict:
        total_kbs = (await db.execute(select(func.count()).select_from(KnowledgeBase))).scalar() or 0
        total_docs = (await db.execute(select(func.count()).select_from(KnowledgeDocument))).scalar() or 0
        total_chunks = (await db.execute(select(func.count()).select_from(DocumentChunk))).scalar() or 0
        return {
            "total_knowledge_bases": total_kbs,
            "total_documents": total_docs,
            "total_chunks": total_chunks,
        }


rag_service = RAGService()
kb_service = KnowledgeBaseService()
