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
    ) -> str:
        """Export a conversation as markdown or JSON."""
        conv = await self.get_conversation(conversation_id, user_id, db)
        if not conv:
            raise PermissionError("Conversation not found or access denied")

        messages = sorted(conv.messages, key=lambda m: m.created_at)

        if fmt == "json":
            import orjson
            data = {
                "title": conv.title,
                "created_at": conv.created_at.isoformat(),
                "messages": [
                    {
                        "role": m.role,
                        "content": m.content,
                        "model": m.model,
                        "created_at": m.created_at.isoformat(),
                    }
                    for m in messages
                ],
            }
            return orjson.dumps(data, option=orjson.OPT_INDENT_2).decode()
        else:
            # Markdown
            lines = [f"# {conv.title}\n"]
            for m in messages:
                ts = m.created_at.strftime("%Y-%m-%d %H:%M")
                role = "**You**" if m.role == "user" else f"**Assistant** ({m.model or 'unknown'})"
                lines.append(f"### {role} — {ts}\n\n{m.content}\n\n---\n")
            return "\n".join(lines)

    async def send_message(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
        content: str,
        model: str | None,
        db: AsyncSession,
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

        # Save user message
        user_msg = Message(
            conversation_id=conv.id,
            role="user",
            content=content,
        )
        db.add(user_msg)
        await db.flush()

        # Build message history for context
        history = await self._build_message_history(conv.id, user_id, db)

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
                history = await self._build_message_history(conv.id, user_id, db)
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
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
    ) -> list[dict]:
        """Build the message list for LLM context, prepending system prompt if set.

        Limits to the most recent 50 messages to stay within typical LLM context
        windows and avoid excessive memory / token usage.
        """
        MAX_CONTEXT_MESSAGES = app_settings.CHAT_MAX_CONTEXT_MESSAGES
        MAX_CONTEXT_CHARS = app_settings.CHAT_MAX_CONTEXT_CHARS

        # Get user's system prompt
        settings_result = await db.execute(
            select(UserSettings.system_prompt).where(
                UserSettings.user_id == user_id
            )
        )
        system_prompt = settings_result.scalar_one_or_none()

        q = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(MAX_CONTEXT_MESSAGES)
        )
        result = await db.execute(q)
        messages = list(reversed(result.scalars().all()))

        history = []
        if system_prompt:
            history.append({"role": "system", "content": system_prompt})

        # P5: Truncate history to MAX_CONTEXT_CHARS to prevent unbounded token usage
        total_chars = 0
        for m in messages:
            total_chars += len(m.content)
            if total_chars > MAX_CONTEXT_CHARS:
                break
            history.append({"role": m.role, "content": m.content})
        return history


chat_service = ChatService()
