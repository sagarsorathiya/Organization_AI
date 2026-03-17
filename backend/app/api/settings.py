"""User settings API routes."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id
from app.schemas.settings import UserSettingsUpdate, UserSettingsResponse
from app.services.user_service import user_service

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=UserSettingsResponse)
async def get_settings(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's settings."""
    s = await user_service.get_user_settings(user_id, db)
    if not s:
        return UserSettingsResponse()
    return UserSettingsResponse(
        theme=s.theme,
        preferred_model=s.preferred_model,
        data_retention_days=s.data_retention_days,
        system_prompt=s.system_prompt,
    )


@router.patch("", response_model=UserSettingsResponse)
async def update_settings(
    body: UserSettingsUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's settings."""
    updates = body.model_dump(exclude_none=True)
    s = await user_service.update_user_settings(user_id, updates, db)
    return UserSettingsResponse(
        theme=s.theme,
        preferred_model=s.preferred_model,
        data_retention_days=s.data_retention_days,
        system_prompt=s.system_prompt,
    )
