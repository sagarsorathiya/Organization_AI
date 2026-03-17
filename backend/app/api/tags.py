"""Conversation tags API routes — user-created tags for organizing conversations."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id
from app.models.conversation_tag import ConversationTag, ConversationTagLink
from app.models.conversation import Conversation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tags", tags=["Tags"])


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    color: str = Field("#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")


class TagResponse(BaseModel):
    id: str
    name: str
    color: str


@router.get("")
async def list_tags(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all tags for the current user."""
    result = await db.execute(
        select(ConversationTag).where(ConversationTag.user_id == user_id).order_by(ConversationTag.name)
    )
    tags = result.scalars().all()
    return {"tags": [TagResponse(id=str(t.id), name=t.name, color=t.color) for t in tags]}


@router.get("/{tag_id}/conversations")
async def get_tag_conversations(
    tag_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get all conversation IDs that have a specific tag."""
    # Verify tag ownership
    tag = await db.execute(
        select(ConversationTag).where(ConversationTag.id == tag_id, ConversationTag.user_id == user_id)
    )
    if not tag.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tag not found")
    result = await db.execute(
        select(ConversationTagLink.conversation_id).where(ConversationTagLink.tag_id == tag_id)
    )
    ids = [str(row[0]) for row in result.all()]
    return {"conversation_ids": ids}
@router.post("", response_model=TagResponse)
async def create_tag(
    body: TagCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tag."""
    # Check for duplicate name
    existing = await db.execute(
        select(ConversationTag).where(
            ConversationTag.user_id == user_id, ConversationTag.name == body.name
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Tag already exists")

    tag = ConversationTag(user_id=user_id, name=body.name, color=body.color)
    db.add(tag)
    await db.flush()
    return TagResponse(id=str(tag.id), name=tag.name, color=tag.color)


@router.delete("/{tag_id}")
async def delete_tag(
    tag_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a tag and all its links."""
    result = await db.execute(
        select(ConversationTag).where(ConversationTag.id == tag_id, ConversationTag.user_id == user_id)
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.delete(tag)
    return {"ok": True}


@router.post("/link")
async def link_tag(
    conversation_id: str,
    tag_id: str,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Link a tag to a conversation."""
    conv_uuid = uuid.UUID(conversation_id)
    tag_uuid = uuid.UUID(tag_id)

    # Verify ownership
    conv = await db.execute(
        select(Conversation).where(Conversation.id == conv_uuid, Conversation.user_id == user_id)
    )
    if not conv.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")
    tag = await db.execute(
        select(ConversationTag).where(ConversationTag.id == tag_uuid, ConversationTag.user_id == user_id)
    )
    if not tag.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tag not found")

    # Check existing link
    existing = await db.execute(
        select(ConversationTagLink).where(
            ConversationTagLink.conversation_id == conv_uuid,
            ConversationTagLink.tag_id == tag_uuid,
        )
    )
    if existing.scalar_one_or_none():
        return {"ok": True}

    link = ConversationTagLink(conversation_id=conv_uuid, tag_id=tag_uuid)
    db.add(link)
    return {"ok": True}


@router.delete("/link")
async def unlink_tag(
    conversation_id: str,
    tag_id: str,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove a tag from a conversation."""
    conv_uuid = uuid.UUID(conversation_id)
    tag_uuid = uuid.UUID(tag_id)
    await db.execute(
        delete(ConversationTagLink).where(
            ConversationTagLink.conversation_id == conv_uuid,
            ConversationTagLink.tag_id == tag_uuid,
        )
    )
    return {"ok": True}


@router.get("/conversation/{conversation_id}")
async def get_conversation_tags(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get all tags for a conversation."""
    result = await db.execute(
        select(ConversationTag)
        .join(ConversationTagLink, ConversationTagLink.tag_id == ConversationTag.id)
        .where(
            ConversationTagLink.conversation_id == conversation_id,
            ConversationTag.user_id == user_id,
        )
    )
    tags = result.scalars().all()
    return {"tags": [TagResponse(id=str(t.id), name=t.name, color=t.color) for t in tags]}
