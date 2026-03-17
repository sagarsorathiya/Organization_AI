"""Message / Chat schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=32000)
    conversation_id: str | None = None
    model: str | None = None


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    model: str | None = None
    token_count: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatResponse(BaseModel):
    message: MessageResponse
    conversation_id: str


class ConversationMessages(BaseModel):
    conversation_id: str
    title: str
    messages: list[MessageResponse]


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=20, ge=1, le=100)


class SearchResult(BaseModel):
    conversation_id: str
    conversation_title: str
    message_id: str
    content: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
