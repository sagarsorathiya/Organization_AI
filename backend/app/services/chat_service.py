"""Chat service — manages conversations, messages, and LLM interaction."""

import uuid
import logging
import re
import asyncio
import time
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
from app.models.eval_trace import RequestTrace

logger = logging.getLogger(__name__)


class ChatService:
    """Handles chat operations with strict user isolation."""

    async def _trace(
        self,
        db: AsyncSession,
        *,
        request_id: uuid.UUID,
        user_id: uuid.UUID | None,
        conversation_id: uuid.UUID | None,
        message_id: uuid.UUID | None,
        phase: str,
        model: str | None = None,
        latency_ms: int | None = None,
        retry_count: int = 0,
        metadata: dict | None = None,
    ) -> None:
        db.add(
            RequestTrace(
                request_id=request_id,
                user_id=user_id,
                conversation_id=conversation_id,
                message_id=message_id,
                phase=phase,
                model=model,
                latency_ms=latency_ms,
                retry_count=retry_count,
                metadata_=metadata,
            )
        )

    def _suggest_title(self, content: str) -> str:
        """Create intent+entity titles for better conversation discoverability."""
        text = (content or "").strip()
        lowered = text.lower()

        intent_map = [
            ("summarize", "Summary"),
            ("compare", "Comparison"),
            ("analy", "Analysis"),
            ("plan", "Plan"),
            ("debug", "Debug"),
            ("troubleshoot", "Troubleshooting"),
            ("draft", "Draft"),
            ("report", "Report"),
        ]
        intent = "Discussion"
        for key, label in intent_map:
            if key in lowered:
                intent = label
                break

        entity_match = re.search(r"\b(?:for|about|on|regarding)\s+([A-Za-z0-9][A-Za-z0-9\- _]{2,60})", text, re.IGNORECASE)
        entity = entity_match.group(1).strip(" .,:;!?") if entity_match else ""

        if entity:
            title = f"{intent}: {entity}"
        else:
            # Fallback to the first meaningful phrase.
            clipped = text[:72].strip()
            title = clipped.rsplit(" ", 1)[0] if len(clipped) >= 72 else clipped

        return (title or "New Conversation")[:90]

    def _infer_task_policy(self, user_text: str) -> str:
        lowered = (user_text or "").lower()
        if any(k in lowered for k in ("compare", "versus", "vs")):
            return "compare"
        if any(k in lowered for k in ("plan", "roadmap", "timeline", "milestone")):
            return "plan"
        if any(k in lowered for k in ("error", "bug", "fix", "troubleshoot", "exception")):
            return "troubleshoot"
        if any(k in lowered for k in ("summarize", "summary", "tl;dr")):
            return "summarize"
        if any(k in lowered for k in ("explain", "what is", "how does")):
            return "explain"
        return "general"

    def _policy_instruction(self, task_policy: str, deep_analysis: bool) -> str:
        base = "Respond concisely by default. Use short headings and direct action items."
        if deep_analysis:
            base = "Provide a detailed structured response with assumptions, risks, and next steps."

        templates = {
            "explain": "Explain clearly in 3-6 bullets, then one practical example.",
            "compare": "Provide a side-by-side comparison table, then recommendation with rationale.",
            "plan": "Return phased plan: objectives, milestones, owners, risks, and immediate next actions.",
            "troubleshoot": "Return probable causes, diagnostics, fixes, and verification checklist.",
            "summarize": "Return executive summary, key points, and action items.",
            "general": "Answer directly first, then optional deeper detail section.",
        }
        return f"{base} {templates.get(task_policy, templates['general'])}"

    def _apply_quality_guardrails(self, text: str, citations: list[dict]) -> tuple[str, list[str]]:
        """Apply lightweight quality checks and return flagged issues."""
        issues: list[str] = []
        output = text or ""

        banned_placeholders = ["lorem ipsum", "[insert", "todo", "tbd", "xxx"]
        if any(p in output.lower() for p in banned_placeholders):
            issues.append("placeholder_content_detected")
            output = re.sub(r"(?i)lorem ipsum|\[insert[^\]]*\]|\btodo\b|\btbd\b|\bxxx\b", "", output)

        factual_markers = ["according to", "data shows", "%", "compliance", "policy", "regulation"]
        if any(m in output.lower() for m in factual_markers) and not citations:
            issues.append("factual_without_citation")

        if not output.strip():
            output = "I could not produce a reliable response. Please retry with more context."
            issues.append("empty_after_guardrails")

        return output.strip(), issues

    async def _generate_followups(self, user_prompt: str, answer: str, model: str) -> list[str]:
        """Generate 3 practical follow-up suggestions."""
        try:
            raw = await llm_service.generate(
                [
                    {
                        "role": "system",
                        "content": (
                            "Generate exactly 3 short follow-up user questions. "
                            "Return each on a new line. No numbering, no markdown."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"User prompt:\n{user_prompt}\n\nAssistant answer:\n{answer[:1800]}",
                    },
                ],
                model=model,
                max_tokens=120,
                temperature=0.3,
            )
            lines = [l.strip(" -\t") for l in raw.splitlines() if l.strip()]
            dedup: list[str] = []
            for line in lines:
                if line not in dedup:
                    dedup.append(line)
                if len(dedup) >= app_settings.CHAT_SUGGESTED_FOLLOWUPS:
                    break
            return dedup[: app_settings.CHAT_SUGGESTED_FOLLOWUPS]
        except Exception:
            return []

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
        deep_analysis: bool = False,
        vision_images: list[str] | None = None,
    ) -> tuple[Message, Message, Conversation]:
        """Process a user message: save it, get LLM response, save that too."""
        request_id = uuid.uuid4()
        started_at = time.monotonic()

        # Get or create conversation
        if conversation_id:
            conv = await self.get_conversation(conversation_id, user_id, db)
            if not conv:
                raise PermissionError("Conversation not found or access denied")
        else:
            title = self._suggest_title(content)
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
        await self._trace(
            db,
            request_id=request_id,
            user_id=user_id,
            conversation_id=conv.id,
            message_id=user_msg.id,
            phase="received_prompt",
            metadata={"deep_analysis": deep_analysis, "vision_images": len(vision_images or [])},
        )

        # Build message history for context
        history = await self._build_message_history(
            conv.id,
            user_id,
            db,
            agent_id=effective_agent_id,
            deep_analysis=deep_analysis,
        )
        history_messages, citations = history

        resolved_model, route_reason = await llm_service.resolve_model(
            history_messages,
            requested_model=model,
            deep_analysis=deep_analysis,
        )
        logger.info("Chat route selected model=%s reason=%s", resolved_model, route_reason)
        await self._trace(
            db,
            request_id=request_id,
            user_id=user_id,
            conversation_id=conv.id,
            message_id=user_msg.id,
            phase="model_routed",
            model=resolved_model,
            metadata={"reason": route_reason},
        )

        # Get LLM response
        response_content = await llm_service.generate(
            history_messages,
            model=resolved_model,
            vision_images=vision_images,
        )
        quality_issues: list[str] = []
        if app_settings.CHAT_ENABLE_QUALITY_GUARDRAILS:
            response_content, quality_issues = self._apply_quality_guardrails(response_content, citations)

        followups = await self._generate_followups(content, response_content, resolved_model)

        # Save assistant message
        assistant_msg = Message(
            conversation_id=conv.id,
            role="assistant",
            content=response_content,
            model=resolved_model,
        )
        db.add(assistant_msg)
        await db.flush()
        await self._trace(
            db,
            request_id=request_id,
            user_id=user_id,
            conversation_id=conv.id,
            message_id=assistant_msg.id,
            phase="response_completed",
            model=resolved_model,
            latency_ms=int((time.monotonic() - started_at) * 1000),
            metadata={
                "citations": len(citations),
                "quality_issues": quality_issues,
                "followups": len(followups),
            },
        )

        assistant_msg._citations = citations  # type: ignore[attr-defined]
        assistant_msg._quality_issues = quality_issues  # type: ignore[attr-defined]
        assistant_msg._followups = followups  # type: ignore[attr-defined]
        assistant_msg._request_id = str(request_id)  # type: ignore[attr-defined]
        return user_msg, assistant_msg, conv

    async def send_message_stream(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
        content: str,
        model: str | None,
        agent_id: uuid.UUID | None = None,
        deep_analysis: bool = False,
        vision_images: list[str] | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream a response: yields JSON chunks, saves full message at end.

        Uses its own DB session because FastAPI closes the dependency-injected
        session before the StreamingResponse generator finishes.
        """
        import orjson

        async with async_session_factory() as db:
            try:
                request_id = uuid.uuid4()
                started_at = time.monotonic()
                # Get or create conversation
                if conversation_id:
                    conv = await self.get_conversation(conversation_id, user_id, db)
                    if not conv:
                        raise PermissionError("Conversation not found or access denied")
                else:
                    title = self._suggest_title(content)
                    conv = await self.create_conversation(user_id, title, db)
                    if agent_id:
                        conv.agent_id = agent_id

                effective_agent_id = agent_id or conv.agent_id

                # Save user message
                user_msg = Message(conversation_id=conv.id, role="user", content=content)
                db.add(user_msg)
                await db.commit()
                await self._trace(
                    db,
                    request_id=request_id,
                    user_id=user_id,
                    conversation_id=conv.id,
                    message_id=user_msg.id,
                    phase="received_prompt",
                    metadata={"deep_analysis": deep_analysis, "vision_images": len(vision_images or [])},
                )
                await db.commit()

                # Yield conversation info
                yield orjson.dumps({
                    "type": "meta",
                    "conversation_id": str(conv.id),
                    "message_id": str(user_msg.id),
                    "request_id": str(request_id),
                }).decode() + "\n"

                # Build history and stream
                history = await self._build_message_history(
                    conv.id,
                    user_id,
                    db,
                    agent_id=effective_agent_id,
                    deep_analysis=deep_analysis,
                )
                history_messages, citations = history

                resolved_model, route_reason = await llm_service.resolve_model(
                    history_messages,
                    requested_model=model,
                    deep_analysis=deep_analysis,
                )
                logger.info("Stream route selected model=%s reason=%s", resolved_model, route_reason)
                await self._trace(
                    db,
                    request_id=request_id,
                    user_id=user_id,
                    conversation_id=conv.id,
                    message_id=user_msg.id,
                    phase="model_routed",
                    model=resolved_model,
                    metadata={"reason": route_reason},
                )
                await db.commit()
                full_response = []
                token_buffer = []

                fast_model = await llm_service.get_fast_model_candidate()
                draft_used = False
                if (
                    app_settings.LLM_DRAFT_REFINEMENT_ENABLED
                    and not deep_analysis
                    and fast_model
                    and fast_model != resolved_model
                ):
                    try:
                        if app_settings.CHAT_ENABLE_STREAM_PHASES:
                            yield orjson.dumps({"type": "phase", "phase": "Drafting quick answer"}).decode() + "\n"
                        draft_text = await llm_service.generate(
                            history_messages,
                            model=fast_model,
                            max_tokens=app_settings.LLM_DRAFT_MAX_TOKENS,
                            temperature=0.2,
                        )
                        if draft_text.strip():
                            await self._trace(
                                db,
                                request_id=request_id,
                                user_id=user_id,
                                conversation_id=conv.id,
                                message_id=user_msg.id,
                                phase="draft_generated",
                                model=fast_model,
                                metadata={"draft_chars": len(draft_text)},
                            )
                            await db.commit()
                            yield orjson.dumps({"type": "token", "content": draft_text.strip()}).decode() + "\n"
                            yield orjson.dumps({"type": "phase", "phase": "Refining response"}).decode() + "\n"
                            yield orjson.dumps({"type": "reset"}).decode() + "\n"
                            draft_used = True
                    except Exception:
                        draft_used = False

                if app_settings.CHAT_ENABLE_STREAM_PHASES and not draft_used:
                    yield orjson.dumps({"type": "phase", "phase": "Analyzing request"}).decode() + "\n"
                if app_settings.CHAT_ENABLE_STREAM_PHASES and citations:
                    await self._trace(
                        db,
                        request_id=request_id,
                        user_id=user_id,
                        conversation_id=conv.id,
                        message_id=user_msg.id,
                        phase="retrieval_chunks_attached",
                        model=resolved_model,
                        metadata={"citation_count": len(citations)},
                    )
                    await db.commit()
                    yield orjson.dumps({"type": "phase", "phase": "Searching docs"}).decode() + "\n"
                if app_settings.CHAT_ENABLE_STREAM_PHASES:
                    yield orjson.dumps({"type": "phase", "phase": "Drafting answer"}).decode() + "\n"

                async for token in llm_service.generate_stream(
                    history_messages,
                    model=resolved_model,
                    vision_images=vision_images,
                ):
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
                quality_issues: list[str] = []
                if app_settings.CHAT_ENABLE_QUALITY_GUARDRAILS:
                    full_text, quality_issues = self._apply_quality_guardrails(full_text, citations)

                followups = await self._generate_followups(content, full_text, resolved_model)

                assistant_msg = Message(
                    conversation_id=conv.id,
                    role="assistant",
                    content=full_text,
                    model=resolved_model,
                )
                db.add(assistant_msg)
                await db.commit()
                await self._trace(
                    db,
                    request_id=request_id,
                    user_id=user_id,
                    conversation_id=conv.id,
                    message_id=assistant_msg.id,
                    phase="response_completed",
                    model=resolved_model,
                    latency_ms=int((time.monotonic() - started_at) * 1000),
                    metadata={
                        "citations": len(citations),
                        "quality_issues": quality_issues,
                        "followups": len(followups),
                    },
                )
                await db.commit()

                yield orjson.dumps({
                    "type": "done",
                    "message_id": str(assistant_msg.id),
                    "model": resolved_model,
                    "citations": citations,
                    "quality_issues": quality_issues,
                    "followups": followups,
                    "request_id": str(request_id),
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
        deep_analysis: bool = False,
    ) -> tuple[list[dict], list[dict]]:
        """Build the message list for LLM context, prepending system prompt if set.

        Integrates V2 features: agent system prompts, AI memory, and RAG context.
        Limits to the most recent N messages to stay within typical LLM context
        windows and avoid excessive memory / token usage.
        """
        if deep_analysis:
            MAX_CONTEXT_MESSAGES = min(
                app_settings.CHAT_MAX_CONTEXT_MESSAGES * max(1, app_settings.CHAT_DEEP_ANALYSIS_MULTIPLIER),
                app_settings.CHAT_DEEP_ANALYSIS_MAX_CONTEXT_MESSAGES,
            )
            MAX_CONTEXT_CHARS = min(
                app_settings.CHAT_MAX_CONTEXT_CHARS * max(1, app_settings.CHAT_DEEP_ANALYSIS_MULTIPLIER),
                app_settings.CHAT_DEEP_ANALYSIS_MAX_CONTEXT_CHARS,
            )
        else:
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

        # Determine latest user message once for policy/rag context.
        last_msg_q = (
            select(Message.content)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_msg_result = await db.execute(last_msg_q)
        latest_user_text = last_msg_result.scalar_one_or_none() or ""

        async def _load_memory_context() -> str:
            if not app_settings.ENABLE_MEMORY:
                return ""
            try:
                from app.services.memory_service import memory_service
                from app.models.user import User

                user_result = await db.execute(select(User.department).where(User.id == user_id))
                department = user_result.scalar_one_or_none()
                memories = await memory_service.get_relevant_memories(
                    user_id=user_id,
                    user_department=department,
                    limit=10,
                    db=db,
                )
                if not memories:
                    return ""
                memory_lines = [f"- {m.key}: {m.content}" for m in memories]
                return "\n\n[Remembered Context]\n" + "\n".join(memory_lines)
            except Exception as exc:
                logger.warning("Failed to load memories for user %s: %s", user_id, exc)
                return ""

        async def _load_rag_context() -> tuple[str, list[dict]]:
            if not (agent and app_settings.ENABLE_RAG and latest_user_text):
                return "", []

            try:
                from app.services.rag_service import rag_service

                kb_ids: list[uuid.UUID] = []
                if getattr(agent, "knowledge_base_ids", None):
                    for kb_id in agent.knowledge_base_ids:
                        try:
                            kb_ids.append(uuid.UUID(str(kb_id)))
                        except ValueError:
                            continue
                elif agent.knowledge_base_id:
                    kb_ids.append(agent.knowledge_base_id)

                if not kb_ids:
                    return "", []

                per_kb_timeout = max(0.2, app_settings.CHAT_RAG_LATENCY_BUDGET_MS / 1000 / max(1, len(kb_ids)))
                tasks = [
                    asyncio.wait_for(
                        rag_service.search(
                            knowledge_base_id=kb_id,
                            query=latest_user_text,
                            db=db,
                            top_k=app_settings.RAG_TOP_K,
                        ),
                        timeout=per_kb_timeout,
                    )
                    for kb_id in kb_ids
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                contexts: list[str] = []
                local_citations: list[dict] = []
                for result in results:
                    if isinstance(result, Exception) or not result:
                        continue
                    chunks = result
                    contexts.append(
                        "\n\n".join([
                            f"[Source: {c['document']} score={c['score']:.3f}]\n{c['content']}"
                            for c in chunks
                        ])
                    )
                    for c in chunks:
                        local_citations.append({
                            "source": c["document"],
                            "score": round(float(c["score"]), 4),
                            "snippet": c["content"][:280],
                            "document_id": c.get("document_id"),
                        })

                if not contexts:
                    return "", []

                return (
                    "\n\n## Reference Documents:\n"
                    + "\n\n".join(contexts)
                    + "\n\nUse the referenced sources in your answer when relevant.",
                    local_citations,
                )
            except Exception:
                logger.warning("Failed to load RAG context for agent %s", agent_id)
                return "", []

        # Use sequential awaits to avoid concurrent DB access on one AsyncSession.
        memory_context = await _load_memory_context()
        rag_payload = await _load_rag_context()
        rag_context, citations = rag_payload

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
            if deep_analysis:
                full_system += (
                    "\n\n[Deep Analysis Mode]\n"
                    "Use deeper reasoning, provide structured outputs, and include citations when references are available."
                )
            if app_settings.CHAT_ANTI_FLUFF_DEFAULT and not deep_analysis:
                full_system += "\n\n[Style]\nKeep the response concise, practical, and avoid filler wording."
            task_policy = self._infer_task_policy(latest_user_text)
            full_system += "\n\n[Output Policy]\n" + self._policy_instruction(task_policy, deep_analysis)
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
        return history, citations


chat_service = ChatService()
