"""Bookmarks API routes — save specific messages for quick reference."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id
from app.models.message_bookmark import MessageBookmark
from app.models.message import Message
from app.models.conversation import Conversation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bookmarks", tags=["Bookmarks"])


class BookmarkCreate(BaseModel):
    message_id: str
    note: str | None = Field(None, max_length=512)


class BookmarkResponse(BaseModel):
    id: str
    message_id: str
    conversation_id: str
    content_preview: str
    note: str | None
    created_at: str


@router.get("")
async def list_bookmarks(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all bookmarks for the current user."""
    result = await db.execute(
        select(MessageBookmark, Message, Conversation)
        .join(Message, MessageBookmark.message_id == Message.id)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(MessageBookmark.user_id == user_id)
        .order_by(desc(MessageBookmark.created_at))
    )
    rows = result.all()
    return {
        "bookmarks": [
            BookmarkResponse(
                id=str(bm.id),
                message_id=str(bm.message_id),
                conversation_id=str(conv.id),
                content_preview=msg.content[:200] + ("..." if len(msg.content) > 200 else ""),
                note=bm.note,
                created_at=bm.created_at.isoformat(),
            )
            for bm, msg, conv in rows
        ]
    }


@router.post("", response_model=BookmarkResponse)
async def create_bookmark(
    body: BookmarkCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Bookmark a message."""
    try:
        msg_id = uuid.UUID(body.message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message ID")

    # Verify message belongs to user's conversation
    result = await db.execute(
        select(Message, Conversation)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.id == msg_id, Conversation.user_id == user_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    msg, conv = row

    # Check existing
    existing = await db.execute(
        select(MessageBookmark).where(
            MessageBookmark.user_id == user_id, MessageBookmark.message_id == msg_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already bookmarked")

    bm = MessageBookmark(user_id=user_id, message_id=msg_id, note=body.note)
    db.add(bm)
    await db.flush()
    return BookmarkResponse(
        id=str(bm.id),
        message_id=str(bm.message_id),
        conversation_id=str(conv.id),
        content_preview=msg.content[:200] + ("..." if len(msg.content) > 200 else ""),
        note=bm.note,
        created_at=bm.created_at.isoformat(),
    )


@router.delete("/{bookmark_id}")
async def delete_bookmark(
    bookmark_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove a bookmark."""
    result = await db.execute(
        select(MessageBookmark).where(
            MessageBookmark.id == bookmark_id, MessageBookmark.user_id == user_id
        )
    )
    bm = result.scalar_one_or_none()
    if not bm:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    await db.delete(bm)
    return {"ok": True}


@router.delete("/message/{message_id}")
async def delete_bookmark_by_message(
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove bookmark by message ID."""
    result = await db.execute(
        select(MessageBookmark).where(
            MessageBookmark.message_id == message_id, MessageBookmark.user_id == user_id
        )
    )
    bm = result.scalar_one_or_none()
    if bm:
        await db.delete(bm)
    return {"ok": True}


@router.get("/check/{message_id}")
async def check_bookmark(
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Check if a message is bookmarked."""
    result = await db.execute(
        select(MessageBookmark).where(
            MessageBookmark.message_id == message_id, MessageBookmark.user_id == user_id
        )
    )
    bm = result.scalar_one_or_none()
    return {"bookmarked": bm is not None}
