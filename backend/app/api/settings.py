"""User settings API routes."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id
from app.schemas.settings import UserSettingsUpdate, UserSettingsResponse
from app.services.user_service import user_service
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.file_upload import FileUpload

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=UserSettingsResponse)
async def get_settings(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's settings."""
    s = await user_service.get_user_settings(user_id, db)
    if not s:
        return UserSettingsResponse()
    return UserSettingsResponse(
        theme=s.theme,
        preferred_model=s.preferred_model,
        data_retention_days=s.data_retention_days,
        system_prompt=s.system_prompt,
    )


@router.patch("", response_model=UserSettingsResponse)
async def update_settings(
    body: UserSettingsUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's settings."""
    updates = body.model_dump(exclude_none=True)
    s = await user_service.update_user_settings(user_id, updates, db)
    return UserSettingsResponse(
        theme=s.theme,
        preferred_model=s.preferred_model,
        data_retention_days=s.data_retention_days,
        system_prompt=s.system_prompt,
    )


@router.get("/stats")
async def get_user_stats(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get usage statistics for the current user."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    # Total conversations
    total_convs = (await db.execute(
        select(func.count()).select_from(Conversation).where(Conversation.user_id == user_id)
    )).scalar() or 0

    # Total messages
    total_msgs = (await db.execute(
        select(func.count()).select_from(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user_id)
    )).scalar() or 0

    # Messages this week
    msgs_week = (await db.execute(
        select(func.count()).select_from(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user_id, Message.created_at >= week_ago)
    )).scalar() or 0

    # Messages this month
    msgs_month = (await db.execute(
        select(func.count()).select_from(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user_id, Message.created_at >= month_ago)
    )).scalar() or 0

    # Files uploaded
    total_uploads = (await db.execute(
        select(func.count()).select_from(FileUpload).where(FileUpload.user_id == user_id)
    )).scalar() or 0

    # Most used models
    model_rows = (await db.execute(
        select(Message.model, func.count().label("cnt"))
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user_id, Message.role == "assistant", Message.model.isnot(None))
        .group_by(Message.model)
        .order_by(func.count().desc())
        .limit(5)
    )).all()

    return {
        "total_conversations": total_convs,
        "total_messages": total_msgs,
        "messages_this_week": msgs_week,
        "messages_this_month": msgs_month,
        "total_uploads": total_uploads,
        "top_models": [{"model": r[0], "count": r[1]} for r in model_rows],
    }
