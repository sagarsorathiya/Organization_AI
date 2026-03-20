"""Agent model — specialized AI personas with domain knowledge."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, Float, Integer, Text, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str] = mapped_column(String(10), default="🤖")
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)

    # Behavior
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    preferred_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096)

    # Access Control
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    allowed_roles: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    allowed_departments: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Knowledge Base Link
    knowledge_base_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_bases.id", ondelete="SET NULL"), nullable=True
    )

    # Metadata
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    knowledge_base = relationship("KnowledgeBase", back_populates="agents", lazy="selectin")
    skills = relationship("AgentSkill", back_populates="agent", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="agent")
