"""Agent service — CRUD and access control for AI agents."""

import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.config import settings

logger = logging.getLogger(__name__)


class AgentService:
    """Handles agent operations with role/department-based access control."""

    async def list_agents(
        self,
        db: AsyncSession,
        user_department: str | None = None,
        is_admin: bool = False,
        active_only: bool = True,
    ) -> list[Agent]:
        """List agents accessible to the user based on department/role."""
        q = select(Agent)
        if active_only:
            q = q.where(Agent.is_active == True)
        q = q.order_by(Agent.is_default.desc(), Agent.name)
        result = await db.execute(q)
        agents = list(result.scalars().all())

        if is_admin:
            return agents

        # Filter by department/role access
        filtered = []
        for agent in agents:
            if agent.allowed_departments and user_department:
                if user_department not in agent.allowed_departments:
                    continue
            filtered.append(agent)
        return filtered

    async def get_agent(self, agent_id: uuid.UUID, db: AsyncSession) -> Agent | None:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        return result.scalar_one_or_none()

    async def get_agent_by_slug(self, slug: str, db: AsyncSession) -> Agent | None:
        result = await db.execute(select(Agent).where(Agent.slug == slug))
        return result.scalar_one_or_none()

    async def create_agent(self, data: dict, db: AsyncSession) -> Agent:
        agent = Agent(**data)
        db.add(agent)
        await db.flush()
        return agent

    async def update_agent(self, agent_id: uuid.UUID, data: dict, db: AsyncSession) -> Agent | None:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        agent = result.scalar_one_or_none()
        if not agent:
            return None
        for key, value in data.items():
            if hasattr(agent, key):
                setattr(agent, key, value)
        await db.flush()
        return agent

    async def delete_agent(self, agent_id: uuid.UUID, db: AsyncSession) -> bool:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        agent = result.scalar_one_or_none()
        if not agent or agent.is_system:
            return False
        await db.delete(agent)
        await db.flush()
        return True

    async def increment_usage(self, agent_id: uuid.UUID, db: AsyncSession):
        await db.execute(
            update(Agent).where(Agent.id == agent_id).values(usage_count=Agent.usage_count + 1)
        )

    async def duplicate_agent(self, agent_id: uuid.UUID, db: AsyncSession) -> Agent | None:
        original = await self.get_agent(agent_id, db)
        if not original:
            return None
        clone = Agent(
            name=f"{original.name} (Copy)",
            slug=f"{original.slug}-copy-{uuid.uuid4().hex[:6]}",
            description=original.description,
            icon=original.icon,
            category=original.category,
            system_prompt=original.system_prompt,
            temperature=original.temperature,
            preferred_model=original.preferred_model,
            max_tokens=original.max_tokens,
            is_system=False,
            allowed_roles=original.allowed_roles,
            allowed_departments=original.allowed_departments,
            knowledge_base_id=original.knowledge_base_id,
        )
        db.add(clone)
        await db.flush()
        return clone

    async def get_stats(self, db: AsyncSession) -> dict:
        total = (await db.execute(select(func.count()).select_from(Agent))).scalar() or 0
        active = (await db.execute(
            select(func.count()).select_from(Agent).where(Agent.is_active == True)
        )).scalar() or 0
        top_agents = (await db.execute(
            select(Agent.name, Agent.usage_count)
            .order_by(Agent.usage_count.desc())
            .limit(10)
        )).all()
        return {
            "total_agents": total,
            "active_agents": active,
            "top_agents": [{"name": n, "usage_count": c} for n, c in top_agents],
        }


agent_service = AgentService()
