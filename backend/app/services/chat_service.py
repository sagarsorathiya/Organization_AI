"""Chat service — manages conversations, messages, and LLM interaction."""

import uuid
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import select, func, desc, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user_settings import UserSettings
from app.services.llm_service import llm_service
from app.database import async_session_factory
from app.config import settings as app_settings

logger = logging.getLogger(__name__)


class ChatService:
    """Handles chat operations with strict user isolation."""

    async def create_conversation(
        self, user_id: uuid.UUID, title: str, db: AsyncSession
    ) -> Conversation:
        conv = Conversation(user_id=user_id, title=title)
        db.add(conv)
        await db.flush()
        return conv

    async def get_conversations(
        self,
        user_id: uuid.UUID,
        db: AsyncSession,
        offset: int = 0,
        limit: int = 50,
        include_archived: bool = False,
    ) -> tuple[list[dict], int]:
        limit = min(limit, 200)  # hard cap

        # Base filter
        filters = [Conversation.user_id == user_id]
        if not include_archived:
            filters.append(Conversation.archived_at.is_(None))

        # Count total
        count_q = select(func.count()).select_from(Conversation).where(*filters)
        total = (await db.execute(count_q)).scalar() or 0

        # Subquery for last message preview
        last_msg_sq = (
            select(Message.content)
            .where(Message.conversation_id == Conversation.id)
            .order_by(desc(Message.created_at))
            .limit(1)
            .correlate(Conversation)
            .scalar_subquery()
        )

        # Fetch conversations with message count and last message
        q = (
            select(
                Conversation,
                func.count(Message.id).label("message_count"),
                last_msg_sq.label("last_message"),
            )
            .outerjoin(Message, Message.conversation_id == Conversation.id)
            .where(*filters)
            .group_by(Conversation.id)
            .order_by(desc(Conversation.is_pinned), desc(Conversation.updated_at))
            .offset(offset)
            .limit(limit)
        )
        result = await db.execute(q)
        rows = result.all()

        conversations = []
        for conv, msg_count, last_msg in rows:
            preview = None
            if last_msg:
                preview = last_msg[:120] + ("..." if len(last_msg) > 120 else "")
            conversations.append({
                "id": str(conv.id),
                "title": conv.title,
                "created_at": conv.created_at,
                "updated_at": conv.updated_at,
                "message_count": msg_count,
                "is_pinned": conv.is_pinned,
                "archived_at": conv.archived_at,
                "last_message_preview": preview,
            })

        return conversations, total

    async def get_conversation(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
    ) -> Conversation | None:
        """Get a single conversation — enforces user_id ownership."""
        result = await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def update_conversation_title(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, title: str, db: AsyncSession
    ) -> Conversation | None:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        )
        conv = result.scalar_one_or_none()
        if conv:
            conv.title = title
            await db.flush()
        return conv

    async def pin_conversation(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, is_pinned: bool, db: AsyncSession
    ) -> Conversation | None:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        )
        conv = result.scalar_one_or_none()
        if conv:
            conv.is_pinned = is_pinned
            await db.flush()
        return conv

    async def archive_conversation(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
    ) -> Conversation | None:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        )
        conv = result.scalar_one_or_none()
        if conv:
            conv.archived_at = datetime.now(timezone.utc) if conv.archived_at is None else None
            await db.flush()
        return conv

    async def delete_conversation(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
    ) -> bool:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        )
        conv = result.scalar_one_or_none()
        if conv:
            await db.delete(conv)
            await db.flush()
            return True
        return False

    async def export_conversation(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, fmt: str, db: AsyncSession
    ) -> str | bytes:
        """Export a conversation as markdown or PDF."""
        conv = await self.get_conversation(conversation_id, user_id, db)
        if not conv:
            raise PermissionError("Conversation not found or access denied")

        messages = sorted(conv.messages, key=lambda m: m.created_at)

        if fmt == "pdf":
            return self._export_pdf(conv.title, messages)
        else:
            # Markdown
            lines = [f"# {conv.title}\n"]
            for m in messages:
                ts = m.created_at.strftime("%Y-%m-%d %H:%M")
                role = "**You**" if m.role == "user" else f"**Assistant** ({m.model or 'unknown'})"
                lines.append(f"### {role} — {ts}\n\n{m.content}\n\n---\n")
            return "\n".join(lines)

    def _export_pdf(self, title: str, messages: list) -> bytes:
        """Generate a PDF export of the conversation."""
        from fpdf import FPDF

        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_page()

        # Title
        pdf.set_font("Helvetica", "B", 18)
        pdf.cell(0, 12, title, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        for m in messages:
            ts = m.created_at.strftime("%Y-%m-%d %H:%M")
            role_label = "You" if m.role == "user" else f"Assistant ({m.model or 'unknown'})"

            # Role header
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(33, 99, 186) if m.role == "assistant" else pdf.set_text_color(60, 60, 60)
            pdf.cell(0, 7, f"{role_label}  -  {ts}", new_x="LMARGIN", new_y="NEXT")

            # Message body
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(30, 30, 30)
            # multi_cell handles long text and wrapping
            content = m.content or ""
            # fpdf2 handles UTF-8 with standard fonts via latin-1 fallback;
            # replace chars that can't be encoded to avoid errors
            safe_content = content.encode("latin-1", errors="replace").decode("latin-1")
            pdf.multi_cell(0, 5.5, safe_content)
            pdf.ln(3)

            # Separator line
            pdf.set_draw_color(200, 200, 200)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
            pdf.ln(4)

        return pdf.output()

    async def send_message(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
        content: str,
        model: str | None,
        db: AsyncSession,
        agent_id: uuid.UUID | None = None,
    ) -> tuple[Message, Message, Conversation]:
        """Process a user message: save it, get LLM response, save that too."""

        # Get or create conversation
        if conversation_id:
            conv = await self.get_conversation(conversation_id, user_id, db)
            if not conv:
                raise PermissionError("Conversation not found or access denied")
        else:
            # Auto-title from first message — safe UTF-8 truncation (F7)
            title = content[:80].rsplit(' ', 1)[0] if len(content) > 80 else content
            if len(content) > 80:
                title += "..."
            conv = await self.create_conversation(user_id, title, db)
            if agent_id:
                conv.agent_id = agent_id

        effective_agent_id = agent_id or conv.agent_id

        # Save user message
        user_msg = Message(
            conversation_id=conv.id,
            role="user",
            content=content,
        )
        db.add(user_msg)
        await db.flush()

        # Build message history for context
        history = await self._build_message_history(
            conv.id,
            user_id,
            db,
            agent_id=effective_agent_id,
        )

        # Get LLM response
        response_content = await llm_service.generate(history, model=model)

        # Save assistant message
        assistant_msg = Message(
            conversation_id=conv.id,
            role="assistant",
            content=response_content,
            model=model or llm_service.default_model,
        )
        db.add(assistant_msg)
        await db.flush()

        return user_msg, assistant_msg, conv

    async def send_message_stream(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
        content: str,
        model: str | None,
        agent_id: uuid.UUID | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream a response: yields JSON chunks, saves full message at end.

        Uses its own DB session because FastAPI closes the dependency-injected
        session before the StreamingResponse generator finishes.
        """
        import orjson

        async with async_session_factory() as db:
            try:
                # Get or create conversation
                if conversation_id:
                    conv = await self.get_conversation(conversation_id, user_id, db)
                    if not conv:
                        raise PermissionError("Conversation not found or access denied")
                else:
                    title = content[:80].rsplit(' ', 1)[0] if len(content) > 80 else content
                    if len(content) > 80:
                        title += "..."
                    conv = await self.create_conversation(user_id, title, db)
                    if agent_id:
                        conv.agent_id = agent_id

                effective_agent_id = agent_id or conv.agent_id

                # Save user message
                user_msg = Message(conversation_id=conv.id, role="user", content=content)
                db.add(user_msg)
                await db.commit()

                # Yield conversation info
                yield orjson.dumps({
                    "type": "meta",
                    "conversation_id": str(conv.id),
                    "message_id": str(user_msg.id),
                }).decode() + "\n"

                # Build history and stream
                history = await self._build_message_history(
                    conv.id,
                    user_id,
                    db,
                    agent_id=effective_agent_id,
                )
                full_response = []
                token_buffer = []

                async for token in llm_service.generate_stream(history, model=model):
                    full_response.append(token)
                    token_buffer.append(token)
                    # Flush every 2 tokens for responsive streaming
                    if len(token_buffer) >= 2:
                        yield orjson.dumps({"type": "token", "content": "".join(token_buffer)}).decode() + "\n"
                        token_buffer = []

                # Flush remaining tokens
                if token_buffer:
                    yield orjson.dumps({"type": "token", "content": "".join(token_buffer)}).decode() + "\n"

                # Save complete assistant response
                full_text = "".join(full_response)
                assistant_msg = Message(
                    conversation_id=conv.id,
                    role="assistant",
                    content=full_text,
                    model=model or llm_service.default_model,
                )
                db.add(assistant_msg)
                await db.commit()

                yield orjson.dumps({
                    "type": "done",
                    "message_id": str(assistant_msg.id),
                }).decode() + "\n"
            except Exception as exc:
                import traceback
                logger.error("Stream error: %s", traceback.format_exc())
                # F4: Emit an error chunk so the client knows streaming failed
                yield orjson.dumps({
                    "type": "error",
                    "content": "An error occurred while generating the response.",
                }).decode() + "\n"
                await db.rollback()
                return

    async def search_messages(
        self, user_id: uuid.UUID, query: str, limit: int, db: AsyncSession
    ) -> list[dict]:
        """Search messages using full-text search with fallback to ILIKE."""
        limit = min(limit, 100)  # hard cap

        # Try full-text search first using the search_vector column (P2/P3/F2)
        ts_query = func.plainto_tsquery("english", query)
        q = (
            select(Message, Conversation)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(
                Conversation.user_id == user_id,
                Message.search_vector.op("@@")(ts_query),
            )
            .order_by(desc(Message.created_at))
            .limit(limit)
        )
        result = await db.execute(q)
        rows = result.all()

        # Fallback to ILIKE if no full-text results
        if not rows:
            # Escape SQL LIKE wildcards to prevent pattern injection
            escaped = query.replace("%", "\\%").replace("_", "\\_")
            q = (
                select(Message, Conversation)
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.user_id == user_id,
                    Message.content.ilike(f"%{escaped}%"),
                )
                .order_by(desc(Message.created_at))
                .limit(limit)
            )
            result = await db.execute(q)
            rows = result.all()

        return [
            {
                "conversation_id": str(conv.id),
                "conversation_title": conv.title,
                "message_id": str(msg.id),
                "content": msg.content,
                "role": msg.role,
                "created_at": msg.created_at,
            }
            for msg, conv in rows
        ]

    async def _build_message_history(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession,
        agent_id: uuid.UUID | None = None,
    ) -> list[dict]:
        """Build the message list for LLM context, prepending system prompt if set.

        Integrates V2 features: agent system prompts, AI memory, and RAG context.
        Limits to the most recent N messages to stay within typical LLM context
        windows and avoid excessive memory / token usage.
        """
        MAX_CONTEXT_MESSAGES = app_settings.CHAT_MAX_CONTEXT_MESSAGES
        MAX_CONTEXT_CHARS = app_settings.CHAT_MAX_CONTEXT_CHARS

        system_prompt = None
        agent = None

        # V2: Load agent if specified — agent system_prompt overrides user prompt
        if agent_id and app_settings.ENABLE_AGENTS:
            try:
                from app.models.agent import Agent
                agent_result = await db.execute(
                    select(Agent).where(Agent.id == agent_id, Agent.is_active == True)
                )
                agent = agent_result.scalar_one_or_none()
                if agent:
                    system_prompt = agent.system_prompt
            except Exception:
                logger.warning("Failed to load agent %s", agent_id)

        # Fallback to user's custom system prompt
        if not system_prompt:
            settings_result = await db.execute(
                select(UserSettings.system_prompt).where(
                    UserSettings.user_id == user_id
                )
            )
            system_prompt = settings_result.scalar_one_or_none()

        # V2: Inject AI Memory context
        memory_context = ""
        if app_settings.ENABLE_MEMORY:
            try:
                from app.services.memory_service import memory_service
                # Get user info for department-scoped memories
                from app.models.user import User
                user_result = await db.execute(select(User.department).where(User.id == user_id))
                department = user_result.scalar_one_or_none()

                memories = await memory_service.get_relevant_memories(
                    user_id=user_id, user_department=department, limit=10, db=db
                )
                if memories:
                    memory_lines = [f"- {m.key}: {m.content}" for m in memories]
                    memory_context = "\n\n[Remembered Context]\n" + "\n".join(memory_lines)
            except Exception as e:
                logger.warning("Failed to load memories for user %s: %s", user_id, e)

        # V2: Inject RAG context if agent has a knowledge base
        rag_context = ""
        if agent and app_settings.ENABLE_RAG:
            try:
                from app.services.rag_service import rag_service
                # Get the last user message for RAG query
                last_msg_q = (
                    select(Message.content)
                    .where(Message.conversation_id == conversation_id)
                    .order_by(Message.created_at.desc())
                    .limit(1)
                )
                last_msg_result = await db.execute(last_msg_q)
                query_text = last_msg_result.scalar_one_or_none()
                if query_text:
                    kb_ids: list[uuid.UUID] = []
                    if getattr(agent, "knowledge_base_ids", None):
                        for kb_id in agent.knowledge_base_ids:
                            try:
                                kb_ids.append(uuid.UUID(str(kb_id)))
                            except ValueError:
                                continue
                    elif agent.knowledge_base_id:
                        kb_ids.append(agent.knowledge_base_id)

                    contexts: list[str] = []
                    for kb_id in kb_ids:
                        ctx = await rag_service.augmented_context(
                            knowledge_base_id=kb_id,
                            query=query_text,
                            db=db,
                        )
                        if ctx:
                            contexts.append(ctx)
                    if contexts:
                        rag_context = "\n\n".join(contexts)
            except Exception:
                logger.warning("Failed to load RAG context for agent %s", agent_id)

        # Fetch recent messages (newest first)
        q = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(MAX_CONTEXT_MESSAGES)
        )
        result = await db.execute(q)
        messages_desc = result.scalars().all()

        history = []
        if system_prompt:
            full_system = system_prompt
            if memory_context:
                full_system += memory_context
            if rag_context:
                full_system += rag_context
            history.append({"role": "system", "content": full_system})
        elif memory_context or rag_context:
            # No system prompt but we have memory/RAG context
            history.append({"role": "system", "content": (memory_context + rag_context).strip()})

        # P5: Truncate history to MAX_CONTEXT_CHARS while always keeping the newest message.
        # This avoids dropping the user's latest instruction when attachments are large.
        selected_desc: list[dict] = []
        total_chars = 0
        for m in messages_desc:
            content = m.content or ""
            remaining = MAX_CONTEXT_CHARS - total_chars
            if remaining <= 0:
                break

            if len(content) <= remaining:
                selected_desc.append({"role": m.role, "content": content})
                total_chars += len(content)
                continue

            # Message does not fit fully: keep the tail of the newest message so the
            # most recent user intent (typically at the end) is still available.
            if not selected_desc:
                kept_tail = content[-remaining:] if remaining > 0 else ""
                if kept_tail:
                    selected_desc.append({
                        "role": m.role,
                        "content": "[Earlier content truncated due to context limit]\n" + kept_tail,
                    })
            break

        history.extend(reversed(selected_desc))
        return history


chat_service = ChatService()
