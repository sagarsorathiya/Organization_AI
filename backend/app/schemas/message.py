"""Message / Chat schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=20_000_000)
    conversation_id: str | None = None
    model: str | None = None
    agent_id: str | None = None
    deep_analysis: bool = False
    vision_images: list[str] = []


class GenerateFileRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=20_000_000)
    format: str = Field(..., pattern="^(pdf|doc|docx|excel|xlsx|html)$")
    conversation_id: str
    message_id: str
    filename: str | None = None


class AttachmentMeta(BaseModel):
    name: str
    type: str = "document"
    url: str


class CitationMeta(BaseModel):
    source: str
    score: float
    snippet: str
    document_id: str | None = None


class GenerateFileResponse(BaseModel):
    id: str
    name: str
    type: str = "document"
    url: str


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    model: str | None = None
    token_count: int | None = None
    attachments: list[AttachmentMeta] = []
    citations: list[CitationMeta] = []
    quality_issues: list[str] = []
    followups: list[str] = []
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
