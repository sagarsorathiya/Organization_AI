"""Notification service — manages in-app notifications."""

import uuid
import logging

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification

logger = logging.getLogger(__name__)


class NotificationService:

    async def get_user_notifications(
        self,
        user_id: uuid.UUID,
        db: AsyncSession,
        unread_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[Notification], int]:
        filters = [Notification.user_id == user_id]
        if unread_only:
            filters.append(Notification.is_read == False)

        total = (await db.execute(
            select(func.count()).select_from(Notification).where(*filters)
        )).scalar() or 0

        result = await db.execute(
            select(Notification)
            .where(*filters)
            .order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(min(limit, 200))
        )
        return list(result.scalars().all()), total

    async def get_unread_count(self, user_id: uuid.UUID, db: AsyncSession) -> int:
        return (await db.execute(
            select(func.count()).select_from(Notification).where(
                Notification.user_id == user_id,
                Notification.is_read == False,
            )
        )).scalar() or 0

    async def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> bool:
        result = await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        notif = result.scalar_one_or_none()
        if not notif:
            return False
        notif.is_read = True
        await db.flush()
        return True

    async def mark_all_read(self, user_id: uuid.UUID, db: AsyncSession) -> int:
        result = await db.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read == False)
            .values(is_read=True)
        )
        return result.rowcount

    async def create_notification(
        self, user_id: uuid.UUID, title: str, content: str,
        type_: str = "info", source: str | None = None, db: AsyncSession = None,
    ) -> Notification:
        notif = Notification(
            user_id=user_id,
            title=title,
            content=content,
            type=type_,
            source=source,
        )
        db.add(notif)
        await db.flush()
        return notif


notification_service = NotificationService()
