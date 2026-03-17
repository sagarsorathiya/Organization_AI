"""Conversation schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    title: str = Field(default="New Conversation", max_length=1024)


class ConversationUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=1024)


class ConversationPinRequest(BaseModel):
    is_pinned: bool


class ConversationResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    is_pinned: bool = False
    archived_at: datetime | None = None
    last_message_preview: str | None = None

    model_config = {"from_attributes": True}


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]
    total: int
