"""Memory service — CRUD and retrieval for AI memories."""

import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy import select, func, delete, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_memory import AIMemory
from app.config import settings

logger = logging.getLogger(__name__)


class MemoryService:
    """Manages persistent AI memories with scope-based access."""

    async def get_user_memories(
        self,
        user_id: uuid.UUID,
        db: AsyncSession,
        scope: str | None = None,
        category: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[AIMemory], int]:
        filters = [AIMemory.user_id == user_id]
        if scope:
            filters.append(AIMemory.scope == scope)
        if category:
            filters.append(AIMemory.category == category)

        total = (await db.execute(
            select(func.count()).select_from(AIMemory).where(*filters)
        )).scalar() or 0

        result = await db.execute(
            select(AIMemory)
            .where(*filters)
            .order_by(AIMemory.created_at.desc())
            .offset(offset)
            .limit(min(limit, 200))
        )
        return list(result.scalars().all()), total

    async def get_relevant_memories(
        self,
        user_id: uuid.UUID,
        user_department: str | None,
        db: AsyncSession,
        limit: int = 20,
    ) -> list[AIMemory]:
        """Get all relevant memories for context injection (user + dept + org)."""
        filters = or_(
            and_(AIMemory.user_id == user_id, AIMemory.scope == "user"),
            AIMemory.scope == "organization",
        )
        if user_department:
            filters = or_(
                filters,
                and_(AIMemory.department == user_department, AIMemory.scope == "department"),
            )

        # Exclude expired
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(AIMemory)
            .where(
                filters,
                or_(AIMemory.expires_at.is_(None), AIMemory.expires_at > now),
            )
            .order_by(AIMemory.confidence.desc(), AIMemory.access_count.desc())
            .limit(limit)
        )
        memories = list(result.scalars().all())

        # Update access counts
        for m in memories:
            m.access_count += 1
            m.last_accessed = now
        await db.flush()

        return memories

    async def create_memory(self, data: dict, db: AsyncSession) -> AIMemory:
        memory = AIMemory(**data)
        db.add(memory)
        await db.flush()
        return memory

    async def update_memory(
        self, memory_id: uuid.UUID, user_id: uuid.UUID, data: dict, db: AsyncSession
    ) -> AIMemory | None:
        result = await db.execute(
            select(AIMemory).where(AIMemory.id == memory_id, AIMemory.user_id == user_id)
        )
        memory = result.scalar_one_or_none()
        if not memory:
            return None
        for key, value in data.items():
            if hasattr(memory, key) and key not in ("id", "user_id", "created_at"):
                setattr(memory, key, value)
        await db.flush()
        return memory

    async def delete_memory(self, memory_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> bool:
        result = await db.execute(
            select(AIMemory).where(AIMemory.id == memory_id, AIMemory.user_id == user_id)
        )
        memory = result.scalar_one_or_none()
        if not memory:
            return False
        await db.delete(memory)
        await db.flush()
        return True

    async def get_stats(self, user_id: uuid.UUID, db: AsyncSession) -> dict:
        total = (await db.execute(
            select(func.count()).select_from(AIMemory).where(AIMemory.user_id == user_id)
        )).scalar() or 0
        by_scope = (await db.execute(
            select(AIMemory.scope, func.count())
            .where(AIMemory.user_id == user_id)
            .group_by(AIMemory.scope)
        )).all()
        by_category = (await db.execute(
            select(AIMemory.category, func.count())
            .where(AIMemory.user_id == user_id)
            .group_by(AIMemory.category)
        )).all()
        return {
            "total": total,
            "max_allowed": settings.MAX_MEMORIES_PER_USER,
            "by_scope": {s: c for s, c in by_scope},
            "by_category": {cat: c for cat, c in by_category},
        }

    # Admin: org-level memory
    async def set_org_memory(self, data: dict, db: AsyncSession) -> AIMemory:
        data["scope"] = "organization"
        data["user_id"] = None
        data["source"] = "admin"
        # Upsert by key
        existing = (await db.execute(
            select(AIMemory).where(
                AIMemory.scope == "organization",
                AIMemory.key == data["key"],
            )
        )).scalar_one_or_none()
        if existing:
            for k, v in data.items():
                if hasattr(existing, k) and k not in ("id", "created_at"):
                    setattr(existing, k, v)
            await db.flush()
            return existing
        memory = AIMemory(**data)
        db.add(memory)
        await db.flush()
        return memory

    async def get_department_memories(self, department: str, db: AsyncSession) -> list[AIMemory]:
        result = await db.execute(
            select(AIMemory).where(
                AIMemory.scope == "department",
                AIMemory.department == department,
            ).order_by(AIMemory.created_at.desc())
        )
        return list(result.scalars().all())


memory_service = MemoryService()
