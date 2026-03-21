"""User service — user-related database operations."""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_settings import UserSettings
from app.models.conversation import Conversation
from app.models.message import Message


class UserService:
    async def get_user_by_id(self, user_id: uuid.UUID, db: AsyncSession) -> User | None:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_user_settings(self, user_id: uuid.UUID, db: AsyncSession) -> UserSettings | None:
        result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def update_user_settings(
        self, user_id: uuid.UUID, updates: dict, db: AsyncSession
    ) -> UserSettings:
        result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )
        settings_obj = result.scalar_one_or_none()

        if not settings_obj:
            settings_obj = UserSettings(user_id=user_id, **updates)
            db.add(settings_obj)
        else:
            for key, value in updates.items():
                if value is not None:
                    setattr(settings_obj, key, value)

        await db.flush()
        return settings_obj

    async def create_user(
        self,
        username: str,
        password: str,
        display_name: str,
        db: AsyncSession,
        email: str | None = None,
        department: str | None = None,
        is_admin: bool = False,
        company_id: str | None = None,
        department_id: str | None = None,
        designation_id: str | None = None,
    ) -> User:
        """Create a new local user account (admin function)."""
        # Check uniqueness
        existing = await db.execute(select(User).where(User.username == username))
        if existing.scalar_one_or_none():
            raise ValueError(f"Username '{username}' already exists")

        password_hash = _bcrypt.hashpw(
            password.encode("utf-8"), _bcrypt.gensalt()
        ).decode("utf-8")

        user = User(
            username=username,
            display_name=display_name,
            email=email,
            department=department,
            is_admin=is_admin,
            is_local_account=True,
            password_hash=password_hash,
            company_id=uuid.UUID(company_id) if company_id else None,
            department_id=uuid.UUID(department_id) if department_id else None,
            designation_id=uuid.UUID(designation_id) if designation_id else None,
        )
        db.add(user)
        await db.flush()
        db.add(UserSettings(user_id=user.id))
        await db.flush()
        return user

    async def list_users(
        self, db: AsyncSession, offset: int = 0, limit: int = 50
    ) -> tuple[list[User], int]:
        count_q = select(func.count()).select_from(User)
        total = (await db.execute(count_q)).scalar() or 0

        q = (
            select(User)
            .options(
                selectinload(User.company),
                selectinload(User.department_obj),
                selectinload(User.designation_obj),
            )
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await db.execute(q)
        users = list(result.scalars().all())
        return users, total

    async def get_usage_metrics(self, db: AsyncSession) -> dict:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)

        total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
        active_today = (
            await db.execute(
                select(func.count()).select_from(User).where(User.last_login >= today_start)
            )
        ).scalar() or 0
        active_week = (
            await db.execute(
                select(func.count()).select_from(User).where(User.last_login >= week_ago)
            )
        ).scalar() or 0
        total_convs = (
            await db.execute(select(func.count()).select_from(Conversation))
        ).scalar() or 0
        total_msgs = (
            await db.execute(select(func.count()).select_from(Message))
        ).scalar() or 0
        msgs_today = (
            await db.execute(
                select(func.count()).select_from(Message).where(Message.created_at >= today_start)
            )
        ).scalar() or 0
        avg_msgs = round(total_msgs / total_convs, 1) if total_convs > 0 else 0.0

        return {
            "total_users": total_users,
            "active_users_today": active_today,
            "active_users_week": active_week,
            "total_conversations": total_convs,
            "total_messages": total_msgs,
            "messages_today": msgs_today,
            "avg_messages_per_conversation": avg_msgs,
        }


user_service = UserService()
