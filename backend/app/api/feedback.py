"""Feedback API routes — thumbs up/down on assistant messages."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id, require_admin
from app.models.message_feedback import MessageFeedback
from app.models.message import Message
from app.models.conversation import Conversation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedback", tags=["Feedback"])


class FeedbackRequest(BaseModel):
    message_id: str
    is_positive: bool
    comment: str | None = Field(None, max_length=1000)


class FeedbackResponse(BaseModel):
    id: str
    message_id: str
    is_positive: bool
    comment: str | None
    created_at: str


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    body: FeedbackRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Submit feedback (thumbs up/down) on an assistant message."""
    try:
        msg_id = uuid.UUID(body.message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message ID")

    # Verify message exists and belongs to user's conversation
    result = await db.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.id == msg_id, Conversation.user_id == user_id, Message.role == "assistant")
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Upsert feedback
    existing = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.message_id == msg_id, MessageFeedback.user_id == user_id
        )
    )
    fb = existing.scalar_one_or_none()
    if fb:
        fb.is_positive = body.is_positive
        fb.comment = body.comment
    else:
        fb = MessageFeedback(
            message_id=msg_id,
            user_id=user_id,
            is_positive=body.is_positive,
            comment=body.comment,
        )
        db.add(fb)
    await db.flush()

    return FeedbackResponse(
        id=str(fb.id),
        message_id=str(fb.message_id),
        is_positive=fb.is_positive,
        comment=fb.comment,
        created_at=fb.created_at.isoformat(),
    )


@router.delete("/{message_id}")
async def remove_feedback(
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove feedback from a message."""
    result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.message_id == message_id, MessageFeedback.user_id == user_id
        )
    )
    fb = result.scalar_one_or_none()
    if fb:
        await db.delete(fb)
    return {"ok": True}


@router.get("/message/{message_id}")
async def get_message_feedback(
    message_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's feedback for a specific message."""
    result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.message_id == message_id, MessageFeedback.user_id == user_id
        )
    )
    fb = result.scalar_one_or_none()
    if not fb:
        return {"feedback": None}
    return {"feedback": {"is_positive": fb.is_positive, "comment": fb.comment}}


@router.get("/conversation/{conversation_id}")
async def get_conversation_feedback(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get all feedback for messages in a conversation."""
    result = await db.execute(
        select(MessageFeedback)
        .join(Message, MessageFeedback.message_id == Message.id)
        .where(Message.conversation_id == conversation_id, MessageFeedback.user_id == user_id)
    )
    feedbacks = result.scalars().all()
    return {
        str(fb.message_id): {"is_positive": fb.is_positive, "comment": fb.comment}
        for fb in feedbacks
    }


@router.get("/stats")
async def get_feedback_stats(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: get aggregate feedback statistics."""
    positive = await db.execute(
        select(func.count()).select_from(MessageFeedback).where(MessageFeedback.is_positive == True)
    )
    negative = await db.execute(
        select(func.count()).select_from(MessageFeedback).where(MessageFeedback.is_positive == False)
    )
    total = await db.execute(select(func.count()).select_from(MessageFeedback))
    return {
        "total": total.scalar() or 0,
        "positive": positive.scalar() or 0,
        "negative": negative.scalar() or 0,
    }
