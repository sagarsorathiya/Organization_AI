"""Skills API routes."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id
from app.services.skill_service import skill_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/skills", tags=["Skills"])


# ─── Schemas ───

class SkillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    description: str = Field(..., min_length=1)
    icon: str = Field(default="⚡", max_length=10)
    category: str = Field(default="general", max_length=50)
    skill_type: str = Field(..., pattern=r"^(prompt_chain|template|extraction)$")
    steps: list = Field(...)
    input_schema: dict | None = None
    output_format: str = Field(default="markdown")
    agent_id: str | None = None
    is_active: bool = True
    requires_approval: bool = False


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    category: str | None = None
    steps: list | None = None
    input_schema: dict | None = None
    output_format: str | None = None
    is_active: bool | None = None
    requires_approval: bool | None = None


class SkillExecuteRequest(BaseModel):
    inputs: dict = Field(default_factory=dict)


def _serialize_skill(s) -> dict:
    return {
        "id": str(s.id),
        "agent_id": str(s.agent_id) if s.agent_id else None,
        "name": s.name,
        "slug": s.slug,
        "description": s.description,
        "icon": s.icon,
        "category": s.category,
        "skill_type": s.skill_type,
        "steps": s.steps,
        "input_schema": s.input_schema,
        "output_format": s.output_format,
        "is_active": s.is_active,
        "is_system": s.is_system,
        "requires_approval": s.requires_approval,
        "usage_count": s.usage_count,
        "avg_rating": s.avg_rating,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _serialize_execution(e) -> dict:
    return {
        "id": str(e.id),
        "skill_id": str(e.skill_id),
        "user_id": str(e.user_id),
        "status": e.status,
        "inputs": e.inputs,
        "result": e.result,
        "error_message": e.error_message,
        "duration_ms": e.duration_ms,
        "started_at": e.started_at.isoformat() if e.started_at else None,
        "completed_at": e.completed_at.isoformat() if e.completed_at else None,
    }


# ─── User Routes ───

@router.get("")
async def list_skills(
    agent_id: str | None = Query(None),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        aid = uuid.UUID(agent_id) if agent_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid agent_id format")
    skills = await skill_service.list_skills(db, agent_id=aid)
    return {"skills": [_serialize_skill(s) for s in skills]}


@router.get("/executions")
async def list_executions(
    skill_id: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        sid = uuid.UUID(skill_id) if skill_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid skill_id format")
    executions = await skill_service.get_executions(user_id, db, skill_id=sid, limit=limit)
    return {"executions": [_serialize_execution(e) for e in executions]}


@router.get("/{slug}")
async def get_skill(
    slug: str,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    skill = await skill_service.get_skill_by_slug(slug, db)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return _serialize_skill(skill)


@router.post("/{slug}/execute")
async def execute_skill(
    slug: str,
    body: SkillExecuteRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    skill = await skill_service.get_skill_by_slug(slug, db)
    if not skill or not skill.is_active:
        raise HTTPException(status_code=404, detail="Skill not found or inactive")
    execution = await skill_service.execute_skill(skill, user_id, body.inputs, db)
    return _serialize_execution(execution)


# ─── Admin Routes ───

admin_router = APIRouter(prefix="/admin/skills", tags=["Admin - Skills"])


@admin_router.post("")
async def create_skill(
    body: SkillCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if body.agent_id:
        try:
            data["agent_id"] = uuid.UUID(body.agent_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid agent_id format")
    else:
        data.pop("agent_id", None)
    data["created_by"] = user_id
    skill = await skill_service.create_skill(data, db)
    return _serialize_skill(skill)


@admin_router.put("/{skill_id}")
async def update_skill(
    skill_id: uuid.UUID,
    body: SkillUpdate,
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    skill = await skill_service.update_skill(skill_id, data, db)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return _serialize_skill(skill)


@admin_router.delete("/{skill_id}")
async def delete_skill(skill_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    if not await skill_service.delete_skill(skill_id, db):
        raise HTTPException(status_code=404, detail="Skill not found or is system skill")
    return {"status": "deleted"}


@admin_router.get("/stats")
async def skill_stats(db: AsyncSession = Depends(get_db)):
    return await skill_service.get_stats(db)
