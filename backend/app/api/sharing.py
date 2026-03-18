"""Sharing API routes — read-only conversation sharing via unique links."""

import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.api.deps import get_current_user_id
from app.models.shared_conversation import SharedConversation
from app.models.conversation import Conversation
from app.models.message import Message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/share", tags=["Sharing"])


@router.post("/{conversation_id}")
async def share_conversation(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a share link for a conversation."""
    # Verify ownership
    conv = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    if not conv.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check if already shared
    existing = await db.execute(
        select(SharedConversation).where(
            SharedConversation.conversation_id == conversation_id,
            SharedConversation.user_id == user_id,
        )
    )
    share = existing.scalar_one_or_none()
    if not share:
        share = SharedConversation(conversation_id=conversation_id, user_id=user_id)
        db.add(share)
        await db.flush()

    return {"share_token": share.share_token, "share_url": f"/shared/{share.share_token}"}


@router.delete("/{conversation_id}")
async def unshare_conversation(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove share link for a conversation."""
    result = await db.execute(
        select(SharedConversation).where(
            SharedConversation.conversation_id == conversation_id,
            SharedConversation.user_id == user_id,
        )
    )
    share = result.scalar_one_or_none()
    if share:
        await db.delete(share)
    return {"ok": True}


@router.get("/status/{conversation_id}")
async def get_share_status(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Check if a conversation is shared."""
    result = await db.execute(
        select(SharedConversation).where(
            SharedConversation.conversation_id == conversation_id,
            SharedConversation.user_id == user_id,
        )
    )
    share = result.scalar_one_or_none()
    if share:
        return {"shared": True, "share_token": share.share_token}
    return {"shared": False}


@router.get("/view/{share_token}")
async def view_shared_conversation(
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    """View a shared conversation (no auth required, read-only)."""
    result = await db.execute(
        select(SharedConversation).where(SharedConversation.share_token == share_token)
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Shared conversation not found")

    # Check expiration
    if share.expires_at and datetime.now(timezone.utc) > share.expires_at:
        raise HTTPException(status_code=410, detail="This share link has expired")

    conv_result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == share.conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "title": conv.title,
        "created_at": conv.created_at.isoformat(),
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "model": m.model,
                "created_at": m.created_at.isoformat(),
            }
            for m in sorted(conv.messages, key=lambda m: m.created_at)
        ],
    }
