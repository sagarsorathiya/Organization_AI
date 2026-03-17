"""Audit logging service — records all security-relevant events."""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


class AuditService:
    """Creates immutable audit log entries."""

    async def log(
        self,
        db: AsyncSession,
        action: str,
        user_id: uuid.UUID | None = None,
        username: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        details: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        entry = AuditLog(
            user_id=user_id,
            username=username,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(entry)
        await db.flush()
        logger.info(
            "AUDIT: action=%s user=%s resource=%s/%s",
            action,
            username or "system",
            resource_type or "-",
            resource_id or "-",
        )


audit_service = AuditService()
