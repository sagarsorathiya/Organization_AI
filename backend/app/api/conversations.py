"""Conversation management API routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id, get_current_user_token, get_client_ip
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    ConversationPinRequest,
    ConversationResponse,
    ConversationListResponse,
)
from app.schemas.message import ConversationMessages, MessageResponse
from app.services.chat_service import chat_service
from app.services.audit_service import audit_service

router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    offset: int = 0,
    limit: int = 50,
    archived: bool = False,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all conversations for the current user."""
    conversations, total = await chat_service.get_conversations(
        user_id, db, offset, limit, include_archived=archived
    )
    return ConversationListResponse(
        conversations=[ConversationResponse(**c) for c in conversations],
        total=total,
    )


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    request: Request,
    user_id: uuid.UUID = Depends(get_current_user_id),
    token=Depends(get_current_user_token),
    db: AsyncSession = Depends(get_db),
):
    """Create a new conversation."""
    conv = await chat_service.create_conversation(user_id, body.title, db)

    await audit_service.log(
        db,
        action="conversation_created",
        user_id=user_id,
        username=token.username,
        resource_type="conversation",
        resource_id=str(conv.id),
        ip_address=get_client_ip(request),
    )

    return ConversationResponse(
        id=str(conv.id),
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=0,
    )


@router.get("/{conversation_id}", response_model=ConversationMessages)
async def get_conversation(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a conversation with all messages — user-scoped."""
    conv = await chat_service.get_conversation(conversation_id, user_id, db)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return ConversationMessages(
        conversation_id=str(conv.id),
        title=conv.title,
        messages=[
            MessageResponse(
                id=str(m.id),
                conversation_id=str(m.conversation_id),
                role=m.role,
                content=m.content,
                model=m.model,
                token_count=m.token_count,
                created_at=m.created_at,
            )
            for m in conv.messages
        ],
    )


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Rename a conversation."""
    conv = await chat_service.update_conversation_title(
        conversation_id, user_id, body.title, db
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return ConversationResponse(
        id=str(conv.id),
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Depends(get_current_user_id),
    token=Depends(get_current_user_token),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation and all its messages."""
    deleted = await chat_service.delete_conversation(conversation_id, user_id, db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await audit_service.log(
        db,
        action="conversation_deleted",
        user_id=user_id,
        username=token.username,
        resource_type="conversation",
        resource_id=str(conversation_id),
        ip_address=get_client_ip(request),
    )


@router.patch("/{conversation_id}/pin", response_model=ConversationResponse)
async def pin_conversation(
    conversation_id: uuid.UUID,
    body: ConversationPinRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Pin or unpin a conversation."""
    conv = await chat_service.pin_conversation(conversation_id, user_id, body.is_pinned, db)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationResponse(
        id=str(conv.id), title=conv.title,
        created_at=conv.created_at, updated_at=conv.updated_at,
        is_pinned=conv.is_pinned, archived_at=conv.archived_at,
    )


@router.patch("/{conversation_id}/archive", response_model=ConversationResponse)
async def archive_conversation(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Toggle archive status of a conversation."""
    conv = await chat_service.archive_conversation(conversation_id, user_id, db)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationResponse(
        id=str(conv.id), title=conv.title,
        created_at=conv.created_at, updated_at=conv.updated_at,
        is_pinned=conv.is_pinned, archived_at=conv.archived_at,
    )


@router.get("/{conversation_id}/export")
async def export_conversation(
    conversation_id: uuid.UUID,
    fmt: str = Query(default="markdown", pattern="^(markdown|json)$"),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Export a conversation as markdown or JSON."""
    try:
        content = await chat_service.export_conversation(conversation_id, user_id, fmt, db)
    except PermissionError:
        raise HTTPException(status_code=404, detail="Conversation not found")

    media_type = "application/json" if fmt == "json" else "text/markdown"
    return PlainTextResponse(content=content, media_type=media_type)
