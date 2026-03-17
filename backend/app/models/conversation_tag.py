"""Conversation tag model — user-created tags for organizing conversations."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConversationTag(Base):
    __tablename__ = "conversation_tags"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1")  # hex color
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_tag_user_name"),
    )


class ConversationTagLink(Base):
    __tablename__ = "conversation_tag_links"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversation_tags.id", ondelete="CASCADE"), nullable=False, index=True
    )

    __table_args__ = (
        UniqueConstraint("conversation_id", "tag_id", name="uq_conv_tag"),
    )
