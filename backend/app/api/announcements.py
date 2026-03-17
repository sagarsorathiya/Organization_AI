"""Announcements API routes — admin MOTD/notifications for all users."""

import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id, require_admin
from app.models.announcement import Announcement

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/announcements", tags=["Announcements"])


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    content: str = Field(..., min_length=1, max_length=5000)
    type: str = Field("info", pattern=r"^(info|warning|maintenance)$")
    expires_at: str | None = None


class AnnouncementResponse(BaseModel):
    id: str
    title: str
    content: str
    type: str
    is_active: bool
    created_at: str
    expires_at: str | None


@router.get("")
async def list_active_announcements(
    _user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List active announcements for users (non-expired only)."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Announcement)
        .where(
            Announcement.is_active == True,
            or_(Announcement.expires_at.is_(None), Announcement.expires_at > now),
        )
        .order_by(desc(Announcement.created_at))
        .limit(10)
    )
    anns = result.scalars().all()
    return {
        "announcements": [
            AnnouncementResponse(
                id=str(a.id), title=a.title, content=a.content, type=a.type,
                is_active=a.is_active, created_at=a.created_at.isoformat(),
                expires_at=a.expires_at.isoformat() if a.expires_at else None,
            )
            for a in anns
        ]
    }


@router.get("/all")
async def list_all_announcements(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all announcements including inactive."""
    result = await db.execute(
        select(Announcement).order_by(desc(Announcement.created_at)).limit(100)
    )
    anns = result.scalars().all()
    return {
        "announcements": [
            AnnouncementResponse(
                id=str(a.id), title=a.title, content=a.content, type=a.type,
                is_active=a.is_active, created_at=a.created_at.isoformat(),
                expires_at=a.expires_at.isoformat() if a.expires_at else None,
            )
            for a in anns
        ]
    }


@router.post("", response_model=AnnouncementResponse)
async def create_announcement(
    body: AnnouncementCreate,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: create a new announcement."""
    expires = None
    if body.expires_at:
        try:
            expires = datetime.fromisoformat(body.expires_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expires_at format")

    ann = Announcement(
        title=body.title,
        content=body.content,
        type=body.type,
        created_by=admin.id if hasattr(admin, "id") else None,
        expires_at=expires,
    )
    db.add(ann)
    await db.flush()
    return AnnouncementResponse(
        id=str(ann.id), title=ann.title, content=ann.content, type=ann.type,
        is_active=ann.is_active, created_at=ann.created_at.isoformat(),
        expires_at=ann.expires_at.isoformat() if ann.expires_at else None,
    )


@router.patch("/{announcement_id}/toggle")
async def toggle_announcement(
    announcement_id: uuid.UUID,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: toggle announcement active status."""
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    ann.is_active = not ann.is_active
    await db.flush()
    return {"is_active": ann.is_active}


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: uuid.UUID,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: delete an announcement."""
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await db.delete(ann)
    return {"ok": True}
