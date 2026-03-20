"""Agent API routes."""

import uuid
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id, get_current_user_token
from app.services.agent_service import agent_service
from app.models.user import User
from sqlalchemy import select

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["Agents"])


# ─── Schemas ───

class AgentResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    icon: str
    category: str
    system_prompt: str
    temperature: float
    preferred_model: str | None
    max_tokens: int
    is_active: bool
    is_default: bool
    is_system: bool
    allowed_roles: list | None
    allowed_departments: list | None
    knowledge_base_id: str | None
    usage_count: int
    created_at: str

    model_config = {"from_attributes": True}


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    description: str = Field(..., min_length=1)
    icon: str = Field(default="🤖", max_length=10)
    category: str = Field(default="general", max_length=50)
    system_prompt: str = Field(..., min_length=1)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    preferred_model: str | None = None
    max_tokens: int = Field(default=4096, ge=256, le=32768)
    is_active: bool = True
    is_default: bool = False
    allowed_roles: list | None = None
    allowed_departments: list | None = None
    knowledge_base_id: str | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    category: str | None = None
    system_prompt: str | None = None
    temperature: float | None = None
    preferred_model: str | None = None
    max_tokens: int | None = None
    is_active: bool | None = None
    is_default: bool | None = None
    allowed_roles: list | None = None
    allowed_departments: list | None = None
    knowledge_base_id: str | None = None


def _serialize_agent(agent) -> dict:
    return {
        "id": str(agent.id),
        "name": agent.name,
        "slug": agent.slug,
        "description": agent.description,
        "icon": agent.icon,
        "category": agent.category,
        "system_prompt": agent.system_prompt,
        "temperature": agent.temperature,
        "preferred_model": agent.preferred_model,
        "max_tokens": agent.max_tokens,
        "is_active": agent.is_active,
        "is_default": agent.is_default,
        "is_system": agent.is_system,
        "allowed_roles": agent.allowed_roles,
        "allowed_departments": agent.allowed_departments,
        "knowledge_base_id": str(agent.knowledge_base_id) if agent.knowledge_base_id else None,
        "usage_count": agent.usage_count,
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
    }


# ─── User Routes ───

@router.get("")
async def list_agents(
    user_id: uuid.UUID = Depends(get_current_user_id),
    token=Depends(get_current_user_token),
    db: AsyncSession = Depends(get_db),
):
    """List agents available to the current user."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    agents = await agent_service.list_agents(
        db,
        user_department=user.department if user else None,
        is_admin=user.is_admin if user else False,
    )
    return {"agents": [_serialize_agent(a) for a in agents]}


@router.get("/{slug}")
async def get_agent(
    slug: str,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get agent by slug."""
    agent = await agent_service.get_agent_by_slug(slug, db)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _serialize_agent(agent)


# ─── Admin Routes ───

admin_router = APIRouter(prefix="/admin/agents", tags=["Admin - Agents"])


@admin_router.post("")
async def create_agent(
    body: AgentCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if body.knowledge_base_id:
        data["knowledge_base_id"] = uuid.UUID(body.knowledge_base_id)
    else:
        data.pop("knowledge_base_id", None)
    data["created_by"] = user_id
    agent = await agent_service.create_agent(data, db)
    return _serialize_agent(agent)


@admin_router.put("/{agent_id}")
async def update_agent(
    agent_id: uuid.UUID,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if "knowledge_base_id" in data and data["knowledge_base_id"]:
        data["knowledge_base_id"] = uuid.UUID(data["knowledge_base_id"])
    agent = await agent_service.update_agent(agent_id, data, db)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _serialize_agent(agent)


@admin_router.delete("/{agent_id}")
async def delete_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    if not await agent_service.delete_agent(agent_id, db):
        raise HTTPException(status_code=404, detail="Agent not found or is a system agent")
    return {"status": "deleted"}


@admin_router.post("/{agent_id}/duplicate")
async def duplicate_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    clone = await agent_service.duplicate_agent(agent_id, db)
    if not clone:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _serialize_agent(clone)


@admin_router.patch("/{agent_id}/active")
async def toggle_agent_active(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    agent = await agent_service.get_agent(agent_id, db)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.is_active = not agent.is_active
    await db.flush()
    return {"id": str(agent.id), "is_active": agent.is_active}


@admin_router.get("/stats")
async def agent_stats(db: AsyncSession = Depends(get_db)):
    return await agent_service.get_stats(db)
