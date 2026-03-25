"""Data retention enforcement — background task to delete old conversations."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.user_settings import UserSettings
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.generated_file import GeneratedFile

logger = logging.getLogger(__name__)


def _is_db_permission_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "insufficientprivilege" in msg or "permission denied" in msg


async def enforce_data_retention():
    """Delete conversations older than each user's data_retention_days setting."""
    logger.info("Running data retention enforcement...")
    total_deleted = 0
    total_generated_files_deleted = 0

    # Phase 1: conversation/message retention
    async with async_session_factory() as db:
        # Get all user settings with retention configured
        result = await db.execute(
            select(UserSettings).where(UserSettings.data_retention_days.isnot(None))
        )
        settings_list = result.scalars().all()

        for us in settings_list:
            cutoff = datetime.now(timezone.utc) - timedelta(days=us.data_retention_days)

            # Find old conversations for this user
            old_convs = await db.execute(
                select(Conversation.id).where(
                    Conversation.user_id == us.user_id,
                    Conversation.updated_at < cutoff,
                )
            )
            conv_ids = [row[0] for row in old_convs.fetchall()]

            if conv_ids:
                # Delete messages first (FK constraint)
                await db.execute(
                    delete(Message).where(Message.conversation_id.in_(conv_ids))
                )
                # Delete conversations
                await db.execute(
                    delete(Conversation).where(Conversation.id.in_(conv_ids))
                )
                total_deleted += len(conv_ids)
                logger.info(
                    "Deleted %d old conversations for user %s (retention=%d days)",
                    len(conv_ids), us.user_id, us.data_retention_days,
                )

        await db.commit()

    # Phase 2: generated file retention by age policy.
    # Files tied to deleted conversations are already removed via FK cascade.
    async with async_session_factory() as db:
        result = await db.execute(
            select(UserSettings).where(UserSettings.data_retention_days.isnot(None))
        )
        settings_list = result.scalars().all()

        for us in settings_list:
            cutoff = datetime.now(timezone.utc) - timedelta(days=us.data_retention_days)
            try:
                generated_result = await db.execute(
                    delete(GeneratedFile).where(
                        GeneratedFile.user_id == us.user_id,
                        GeneratedFile.created_at < cutoff,
                    )
                )
                total_generated_files_deleted += generated_result.rowcount or 0
            except Exception as exc:
                if _is_db_permission_error(exc):
                    logger.warning(
                        "Skipping generated_files retention due to DB permissions: %s",
                        exc,
                    )
                    await db.rollback()
                    break
                raise

        await db.commit()

    # Clean up expired token blacklist entries (tokens already past their exp)
    async with async_session_factory() as db:
        from app.models.token_blacklist import TokenBlacklist
        now = datetime.now(timezone.utc)
        result = await db.execute(
            delete(TokenBlacklist).where(TokenBlacklist.expires_at < now)
        )
        if result.rowcount:
            logger.info("Purged %d expired token blacklist entries", result.rowcount)
        await db.commit()

    logger.info(
        "Data retention complete. Deleted %d conversations and %d generated files total.",
        total_deleted,
        total_generated_files_deleted,
    )
    return total_deleted
