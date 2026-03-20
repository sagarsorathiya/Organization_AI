"""Scheduled Tasks & Notifications API routes."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.deps import get_current_user_id
from app.services.notification_service import notification_service
from app.models.scheduled_task import ScheduledTask, TaskExecution

logger = logging.getLogger(__name__)


# ─── Notification Routes (User) ───

notification_router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _serialize_notification(n) -> dict:
    return {
        "id": str(n.id),
        "title": n.title,
        "content": n.content,
        "type": n.type,
        "source": n.source,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@notification_router.get("")
async def list_notifications(
    unread_only: bool = Query(False),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    notifications, total = await notification_service.get_user_notifications(
        user_id, db, unread_only=unread_only, offset=offset, limit=limit
    )
    unread_count = await notification_service.get_unread_count(user_id, db)
    return {
        "notifications": [_serialize_notification(n) for n in notifications],
        "total": total,
        "unread_count": unread_count,
    }


@notification_router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not await notification_service.mark_read(notification_id, user_id, db):
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "read"}


@notification_router.patch("/read-all")
async def mark_all_read(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    count = await notification_service.mark_all_read(user_id, db)
    return {"marked_read": count}


# ─── Admin Task Routes ───

task_router = APIRouter(prefix="/admin/tasks", tags=["Admin - Tasks"])


class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    task_type: str = Field(..., max_length=30)
    cron_expression: str = Field(..., max_length=100)
    timezone: str = Field(default="UTC", max_length=50)
    config: dict = Field(default_factory=dict)
    agent_id: str | None = None
    target_users: list | None = None
    target_departments: list | None = None
    is_active: bool = True


class TaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    cron_expression: str | None = None
    timezone: str | None = None
    config: dict | None = None
    is_active: bool | None = None
    target_users: list | None = None
    target_departments: list | None = None


def _serialize_task(t) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "task_type": t.task_type,
        "cron_expression": t.cron_expression,
        "timezone": t.timezone,
        "config": t.config,
        "agent_id": str(t.agent_id) if t.agent_id else None,
        "target_users": t.target_users,
        "target_departments": t.target_departments,
        "is_active": t.is_active,
        "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
        "last_status": t.last_status,
        "last_error": t.last_error,
        "next_run_at": t.next_run_at.isoformat() if t.next_run_at else None,
        "run_count": t.run_count,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _serialize_execution(e) -> dict:
    return {
        "id": str(e.id),
        "task_id": str(e.task_id),
        "status": e.status,
        "started_at": e.started_at.isoformat() if e.started_at else None,
        "completed_at": e.completed_at.isoformat() if e.completed_at else None,
        "duration_ms": e.duration_ms,
        "result_summary": e.result_summary,
        "error_message": e.error_message,
        "affected_users": e.affected_users,
    }


@task_router.get("")
async def list_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ScheduledTask).order_by(ScheduledTask.created_at.desc()))
    tasks = result.scalars().all()
    return {"tasks": [_serialize_task(t) for t in tasks]}


@task_router.post("")
async def create_task(
    body: TaskCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if body.agent_id:
        data["agent_id"] = uuid.UUID(body.agent_id)
    else:
        data.pop("agent_id", None)
    data["created_by"] = user_id
    task = ScheduledTask(**data)
    db.add(task)
    await db.flush()

    # Reload scheduler
    try:
        from app.services.scheduler_service import scheduler_service
        await scheduler_service.reload_task(task)
    except Exception:
        pass

    return _serialize_task(task)


@task_router.patch("/{task_id}")
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ScheduledTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    data = body.model_dump(exclude_none=True)
    for key, value in data.items():
        if hasattr(task, key):
            setattr(task, key, value)
    await db.flush()

    try:
        from app.services.scheduler_service import scheduler_service
        await scheduler_service.reload_task(task)
    except Exception:
        pass

    return _serialize_task(task)


@task_router.delete("/{task_id}")
async def delete_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    task = await db.get(ScheduledTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.flush()
    return {"status": "deleted"}


@task_router.post("/{task_id}/run-now")
async def run_task_now(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    task = await db.get(ScheduledTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    from app.services.scheduler_service import scheduler_service
    await scheduler_service.run_task_now(task_id)
    return {"status": "triggered"}


@task_router.get("/{task_id}/executions")
async def list_task_executions(
    task_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskExecution)
        .where(TaskExecution.task_id == task_id)
        .order_by(TaskExecution.started_at.desc())
        .limit(limit)
    )
    executions = result.scalars().all()
    return {"executions": [_serialize_execution(e) for e in executions]}


@task_router.get("/dashboard")
async def task_dashboard(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func
    total = (await db.execute(select(func.count()).select_from(ScheduledTask))).scalar() or 0
    active = (await db.execute(
        select(func.count()).select_from(ScheduledTask).where(ScheduledTask.is_active == True)
    )).scalar() or 0
    total_executions = (await db.execute(
        select(func.count()).select_from(TaskExecution)
    )).scalar() or 0
    failed = (await db.execute(
        select(func.count()).select_from(TaskExecution).where(TaskExecution.status == "failed")
    )).scalar() or 0
    return {
        "total_tasks": total,
        "active_tasks": active,
        "total_executions": total_executions,
        "failed_executions": failed,
    }
