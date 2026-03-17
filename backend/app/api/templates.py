"""Prompt templates API routes — admin-managed reusable prompts."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id, require_admin
from app.models.prompt_template import PromptTemplate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/templates", tags=["Templates"])


class TemplateCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    content: str = Field(..., min_length=1, max_length=10000)
    category: str = Field("General", max_length=100)


class TemplateUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=256)
    content: str | None = Field(None, min_length=1, max_length=10000)
    category: str | None = Field(None, max_length=100)


class TemplateResponse(BaseModel):
    id: str
    title: str
    content: str
    category: str
    is_system: bool
    usage_count: int
    created_at: str


@router.get("")
async def list_templates(
    category: str | None = None,
    _user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all prompt templates (available to all authenticated users)."""
    q = select(PromptTemplate).order_by(desc(PromptTemplate.usage_count))
    if category:
        q = q.where(PromptTemplate.category == category)
    result = await db.execute(q)
    templates = result.scalars().all()
    return {
        "templates": [
            TemplateResponse(
                id=str(t.id), title=t.title, content=t.content,
                category=t.category, is_system=t.is_system,
                usage_count=t.usage_count, created_at=t.created_at.isoformat(),
            )
            for t in templates
        ]
    }


@router.get("/categories")
async def list_categories(
    _user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all unique template categories."""
    result = await db.execute(
        select(PromptTemplate.category, func.count(PromptTemplate.id))
        .group_by(PromptTemplate.category)
        .order_by(PromptTemplate.category)
    )
    return {"categories": [{"name": cat, "count": cnt} for cat, cnt in result.all()]}


@router.post("/use/{template_id}")
async def use_template(
    template_id: uuid.UUID,
    _user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Increment usage count when a user selects a template."""
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    t.usage_count += 1
    await db.flush()
    return {"content": t.content}


@router.post("", response_model=TemplateResponse)
async def create_template(
    body: TemplateCreate,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: create a new prompt template."""
    t = PromptTemplate(
        title=body.title,
        content=body.content,
        category=body.category,
        is_system=True,
        created_by=admin.id if hasattr(admin, "id") else None,
    )
    db.add(t)
    await db.flush()
    return TemplateResponse(
        id=str(t.id), title=t.title, content=t.content,
        category=t.category, is_system=t.is_system,
        usage_count=t.usage_count, created_at=t.created_at.isoformat(),
    )


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: update a prompt template."""
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.title is not None:
        t.title = body.title
    if body.content is not None:
        t.content = body.content
    if body.category is not None:
        t.category = body.category
    await db.flush()
    return TemplateResponse(
        id=str(t.id), title=t.title, content=t.content,
        category=t.category, is_system=t.is_system,
        usage_count=t.usage_count, created_at=t.created_at.isoformat(),
    )


@router.delete("/{template_id}")
async def delete_template(
    template_id: uuid.UUID,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: delete a prompt template."""
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    return {"ok": True}
