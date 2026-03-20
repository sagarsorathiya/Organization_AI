"""Scheduler service — executes background tasks on cron schedules."""

import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scheduled_task import ScheduledTask, TaskExecution
from app.models.notification import Notification
from app.database import async_session_factory
from app.config import settings

logger = logging.getLogger(__name__)

# Task handler registry
TASK_HANDLERS: dict = {}


def register_task_handler(task_type: str):
    """Decorator to register a task handler."""
    def decorator(func):
        TASK_HANDLERS[task_type] = func
        return func
    return decorator


class TaskSchedulerService:
    """Manages scheduled background tasks using asyncio."""

    def __init__(self):
        self._scheduler = None
        self._running = False

    async def start(self):
        """Load active tasks and start the scheduler."""
        if not settings.ENABLE_SCHEDULER:
            logger.info("Scheduler disabled by config")
            return

        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            from apscheduler.triggers.cron import CronTrigger

            self._scheduler = AsyncIOScheduler(timezone=settings.SCHEDULER_TIMEZONE)

            async with async_session_factory() as db:
                result = await db.execute(
                    select(ScheduledTask).where(ScheduledTask.is_active == True)
                )
                tasks = result.scalars().all()
                for task in tasks:
                    try:
                        trigger = CronTrigger.from_crontab(
                            task.cron_expression, timezone=task.timezone or settings.SCHEDULER_TIMEZONE
                        )
                        self._scheduler.add_job(
                            self._execute_task,
                            trigger=trigger,
                            id=str(task.id),
                            args=[task.id],
                            replace_existing=True,
                        )
                    except Exception as e:
                        logger.error("Failed to schedule task %s: %s", task.name, str(e))

            self._scheduler.start()
            self._running = True
            logger.info("Task scheduler started with %d tasks", len(tasks) if tasks else 0)
        except ImportError:
            logger.warning("APScheduler not installed — scheduler disabled")
        except Exception as e:
            logger.error("Failed to start scheduler: %s", str(e))

    async def stop(self):
        if self._scheduler and self._running:
            self._scheduler.shutdown(wait=False)
            self._running = False
            logger.info("Task scheduler stopped")

    async def _execute_task(self, task_id: uuid.UUID):
        """Execute a scheduled task with audit trail."""
        async with async_session_factory() as db:
            task = await db.get(ScheduledTask, task_id)
            if not task:
                return

            execution = TaskExecution(task_id=task_id, status="running")
            db.add(execution)
            await db.commit()

            try:
                handler = TASK_HANDLERS.get(task.task_type)
                if not handler:
                    raise ValueError(f"No handler registered for task type: {task.task_type}")

                result = await handler(task, db)
                execution.status = "success"
                execution.result_summary = str(result.get("summary", ""))[:2000] if isinstance(result, dict) else str(result)[:2000]
                execution.affected_users = result.get("affected_count", 0) if isinstance(result, dict) else 0
                task.last_status = "success"
                task.last_error = None

            except Exception as e:
                logger.error("Task %s failed: %s", task.name, str(e))
                execution.status = "failed"
                execution.error_message = str(e)[:2000]
                task.last_status = "failed"
                task.last_error = str(e)[:2000]

            finally:
                now = datetime.now(timezone.utc)
                execution.completed_at = now
                if execution.started_at:
                    execution.duration_ms = int(
                        (now - execution.started_at).total_seconds() * 1000
                    )
                task.last_run_at = now
                task.run_count = (task.run_count or 0) + 1
                await db.commit()

    async def run_task_now(self, task_id: uuid.UUID):
        """Manually trigger a task immediately."""
        await self._execute_task(task_id)

    async def reload_task(self, task: ScheduledTask):
        """Reload a single task's schedule."""
        if not self._scheduler:
            return
        try:
            from apscheduler.triggers.cron import CronTrigger
            # Remove old job if exists
            try:
                self._scheduler.remove_job(str(task.id))
            except Exception:
                pass
            if task.is_active:
                trigger = CronTrigger.from_crontab(
                    task.cron_expression, timezone=task.timezone or settings.SCHEDULER_TIMEZONE
                )
                self._scheduler.add_job(
                    self._execute_task,
                    trigger=trigger,
                    id=str(task.id),
                    args=[task.id],
                    replace_existing=True,
                )
        except Exception as e:
            logger.error("Failed to reload task %s: %s", task.name, str(e))


scheduler_service = TaskSchedulerService()


# ─── Built-in Task Handlers ───

@register_task_handler("memory_cleanup")
async def handle_memory_cleanup(task: ScheduledTask, db: AsyncSession) -> dict:
    """Clean up expired memories."""
    from app.models.ai_memory import AIMemory
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(AIMemory).where(
            AIMemory.expires_at.isnot(None),
            AIMemory.expires_at < now,
        )
    )
    expired = result.scalars().all()
    for mem in expired:
        await db.delete(mem)
    await db.commit()
    return {"summary": f"Cleaned up {len(expired)} expired memories", "affected_count": len(expired)}


@register_task_handler("usage_report")
async def handle_usage_report(task: ScheduledTask, db: AsyncSession) -> dict:
    """Generate platform usage report notification for admins."""
    from sqlalchemy import func as sqlfunc
    from app.models.user import User
    from app.models.conversation import Conversation
    from app.models.message import Message

    total_users = (await db.execute(select(sqlfunc.count()).select_from(User))).scalar() or 0
    total_convos = (await db.execute(select(sqlfunc.count()).select_from(Conversation))).scalar() or 0
    total_msgs = (await db.execute(select(sqlfunc.count()).select_from(Message))).scalar() or 0

    summary = f"Users: {total_users}, Conversations: {total_convos}, Messages: {total_msgs}"

    # Notify admins
    admins = (await db.execute(
        select(User).where(User.is_admin == True, User.is_active == True)
    )).scalars().all()
    for admin in admins:
        db.add(Notification(
            user_id=admin.id,
            title="Weekly Usage Report",
            content=f"Platform Stats:\n• {total_users} total users\n• {total_convos} conversations\n• {total_msgs} messages",
            type="info",
            source=task.name,
        ))
    await db.commit()

    return {"summary": summary, "affected_count": len(admins)}


@register_task_handler("stale_knowledge_check")
async def handle_stale_knowledge_check(task: ScheduledTask, db: AsyncSession) -> dict:
    """Flag knowledge base documents not updated in 90+ days."""
    from app.models.knowledge_base import KnowledgeDocument
    from datetime import timedelta

    threshold = datetime.now(timezone.utc) - timedelta(days=90)
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.updated_at < threshold)
    )
    stale_docs = result.scalars().all()
    return {
        "summary": f"Found {len(stale_docs)} stale documents (>90 days old)",
        "affected_count": len(stale_docs),
    }


@register_task_handler("custom")
async def handle_custom_task(task: ScheduledTask, db: AsyncSession) -> dict:
    """Execute a custom task defined by config."""
    config = task.config or {}
    prompt = config.get("prompt", "Generate a brief status update.")
    from app.services.llm_service import llm_service
    result = await llm_service.generate([
        {"role": "system", "content": "You are a helpful assistant running a scheduled task."},
        {"role": "user", "content": prompt},
    ])
    return {"summary": result[:500], "affected_count": 0}
