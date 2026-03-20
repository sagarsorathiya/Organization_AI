"""Memory API routes."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id
from app.services.memory_service import memory_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/memory", tags=["Memory"])


# ─── Schemas ───

class MemoryCreate(BaseModel):
    scope: str = Field(default="user", pattern=r"^(user|department|organization)$")
    category: str = Field(..., min_length=1, max_length=50)
    key: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    department: str | None = None
    expires_at: str | None = None


class MemoryUpdate(BaseModel):
    category: str | None = None
    key: str | None = None
    content: str | None = None
    confidence: float | None = None
    expires_at: str | None = None


def _serialize_memory(m) -> dict:
    return {
        "id": str(m.id),
        "user_id": str(m.user_id) if m.user_id else None,
        "department": m.department,
        "scope": m.scope,
        "category": m.category,
        "key": m.key,
        "content": m.content,
        "confidence": m.confidence,
        "source": m.source,
        "access_count": m.access_count,
        "last_accessed": m.last_accessed.isoformat() if m.last_accessed else None,
        "expires_at": m.expires_at.isoformat() if m.expires_at else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


# ─── User Routes ───

@router.get("")
async def list_memories(
    scope: str | None = Query(None),
    category: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    memories, total = await memory_service.get_user_memories(user_id, db, scope, category, offset, limit)
    return {
        "memories": [_serialize_memory(m) for m in memories],
        "total": total,
    }


@router.post("")
async def create_memory(
    body: MemoryCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["user_id"] = user_id
    data["source"] = "explicit"
    memory = await memory_service.create_memory(data, db)
    return _serialize_memory(memory)


@router.put("/{memory_id}")
async def update_memory(
    memory_id: uuid.UUID,
    body: MemoryUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    memory = await memory_service.update_memory(memory_id, user_id, data, db)
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    return _serialize_memory(memory)


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not await memory_service.delete_memory(memory_id, user_id, db):
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "deleted"}


@router.get("/stats")
async def memory_stats(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await memory_service.get_stats(user_id, db)


# ─── Admin Routes ───

admin_router = APIRouter(prefix="/admin/memory", tags=["Admin - Memory"])


@admin_router.post("/organization")
async def set_org_memory(
    body: MemoryCreate,
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    memory = await memory_service.set_org_memory(data, db)
    return _serialize_memory(memory)


@admin_router.get("/department/{department}")
async def get_department_memories(
    department: str,
    db: AsyncSession = Depends(get_db),
):
    memories = await memory_service.get_department_memories(department, db)
    return {"memories": [_serialize_memory(m) for m in memories]}
