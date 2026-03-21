"""Admin panel API routes — restricted to admin users only."""

import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, desc, text, inspect, and_, Table
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, engine
from app.api.deps import require_admin
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user_settings import UserSettings
from app.models.file_upload import FileUpload
from app.models.announcement import Announcement
from app.models.conversation_tag import ConversationTag, ConversationTagLink
from app.models.message_bookmark import MessageBookmark
from app.models.message_feedback import MessageFeedback
from app.models.prompt_template import PromptTemplate
from app.models.shared_conversation import SharedConversation
from app.models.token_blacklist import TokenBlacklist
from app.models.knowledge_base import KnowledgeBase, KnowledgeDocument, DocumentChunk
from app.models.agent import Agent
from app.models.ai_memory import AIMemory
from app.models.agent_skill import AgentSkill, SkillExecution
from app.models.scheduled_task import ScheduledTask, TaskExecution
from app.models.notification import Notification
from app.models.company import Company
from app.models.department import Department, company_departments, department_designations
from app.models.designation import Designation
from app.schemas.admin import (
    AuditLogEntry,
    AuditLogListResponse,
    SystemHealthResponse,
    UsageMetrics,
    ModelsListResponse,
    ModelInfo,
    ModelPullRequest,
    ModelDeleteRequest,
    SystemSettingsResponse,
    SystemSettingsUpdate,
    UserUpdateRequest,
    CreateUserRequest,
)
from app.schemas.user import UserResponse, UserListResponse
from app.services.llm_service import llm_service
from app.services.user_service import user_service
from app.services.ad_service import ad_service
from app.config import settings as app_settings

router = APIRouter(prefix="/admin", tags=["Admin"])


def _user_response(u: User) -> UserResponse:
    """Build a UserResponse with resolved org names."""
    return UserResponse(
        id=str(u.id),
        username=u.username,
        display_name=u.display_name,
        email=u.email,
        department=u.department,
        is_admin=u.is_admin,
        is_active=u.is_active,
        is_local_account=u.is_local_account,
        last_login=u.last_login,
        created_at=u.created_at,
        company_id=str(u.company_id) if u.company_id else None,
        company_name=u.company.name if u.company_id and u.company else None,
        department_id=str(u.department_id) if u.department_id else None,
        department_name=u.department_obj.name if u.department_id and u.department_obj else None,
        designation_id=str(u.designation_id) if u.designation_id else None,
        designation_name=u.designation_obj.name if u.designation_id and u.designation_obj else None,
    )

# Track app start time
_app_start_time = time.time()


@router.get("/settings", response_model=SystemSettingsResponse)
async def get_system_settings(
    _admin=Depends(require_admin),
):
    """Return non-sensitive system configuration for the admin dashboard."""
    # S5: Mask AD server details — only show whether AD is enabled + domain
    ad_server_masked = "***" if app_settings.AD_SERVER else ""
    ad_bind_user_masked = "***" if app_settings.AD_BIND_USER else ""
    return SystemSettingsResponse(
        app_name=app_settings.APP_NAME,
        app_env=app_settings.APP_ENV,
        ad_enabled=app_settings.AD_ENABLED,
        ad_server=ad_server_masked,
        ad_port=0,
        ad_use_ssl=app_settings.AD_USE_SSL,
        ad_domain=app_settings.AD_DOMAIN,
        ad_base_dn="***",
        ad_user_search_base="***",
        ad_group_search_base="***",
        ad_bind_user=ad_bind_user_masked,
        ad_admin_group=app_settings.AD_ADMIN_GROUP,
        llm_provider=app_settings.LLM_PROVIDER,
        llm_base_url=app_settings.LLM_BASE_URL,
        llm_default_model=app_settings.LLM_DEFAULT_MODEL,
        llm_timeout=app_settings.LLM_TIMEOUT,
        llm_max_tokens=app_settings.LLM_MAX_TOKENS,
        llm_temperature=app_settings.LLM_TEMPERATURE,
        session_expire_minutes=app_settings.SESSION_EXPIRE_MINUTES,
        session_cookie_secure=app_settings.SESSION_COOKIE_SECURE,
        session_cookie_samesite=app_settings.SESSION_COOKIE_SAMESITE,
        rate_limit_requests=app_settings.RATE_LIMIT_REQUESTS,
        rate_limit_window_seconds=app_settings.RATE_LIMIT_WINDOW_SECONDS,
        attachments_enabled=app_settings.ATTACHMENTS_ENABLED,
        attachments_max_size_mb=app_settings.ATTACHMENTS_MAX_SIZE_MB,
        attachments_max_extract_chars=app_settings.ATTACHMENTS_MAX_EXTRACT_CHARS,
        log_level=app_settings.LOG_LEVEL,
        chat_max_context_messages=app_settings.CHAT_MAX_CONTEXT_MESSAGES,
        chat_max_context_chars=app_settings.CHAT_MAX_CONTEXT_CHARS,
        local_admin_enabled=app_settings.LOCAL_ADMIN_ENABLED,
        local_admin_username=app_settings.LOCAL_ADMIN_USERNAME,
    )


# Mapping from schema field name → Settings attribute name (uppercase .env key)
_SETTING_KEY_MAP = {
    "app_name": "APP_NAME",
    "ad_enabled": "AD_ENABLED",
    "ad_server": "AD_SERVER",
    "ad_port": "AD_PORT",
    "ad_use_ssl": "AD_USE_SSL",
    "ad_domain": "AD_DOMAIN",
    "ad_base_dn": "AD_BASE_DN",
    "ad_user_search_base": "AD_USER_SEARCH_BASE",
    "ad_group_search_base": "AD_GROUP_SEARCH_BASE",
    "ad_bind_user": "AD_BIND_USER",
    "ad_bind_password": "AD_BIND_PASSWORD",
    "ad_admin_group": "AD_ADMIN_GROUP",
    "llm_provider": "LLM_PROVIDER",
    "llm_base_url": "LLM_BASE_URL",
    "llm_default_model": "LLM_DEFAULT_MODEL",
    "llm_timeout": "LLM_TIMEOUT",
    "llm_max_tokens": "LLM_MAX_TOKENS",
    "llm_temperature": "LLM_TEMPERATURE",
    "session_expire_minutes": "SESSION_EXPIRE_MINUTES",
    "session_cookie_secure": "SESSION_COOKIE_SECURE",
    "session_cookie_samesite": "SESSION_COOKIE_SAMESITE",
    "rate_limit_requests": "RATE_LIMIT_REQUESTS",
    "rate_limit_window_seconds": "RATE_LIMIT_WINDOW_SECONDS",
    "attachments_enabled": "ATTACHMENTS_ENABLED",
    "attachments_max_size_mb": "ATTACHMENTS_MAX_SIZE_MB",
    "attachments_max_extract_chars": "ATTACHMENTS_MAX_EXTRACT_CHARS",
    "log_level": "LOG_LEVEL",
    "chat_max_context_messages": "CHAT_MAX_CONTEXT_MESSAGES",
    "chat_max_context_chars": "CHAT_MAX_CONTEXT_CHARS",
    "local_admin_enabled": "LOCAL_ADMIN_ENABLED",
    "local_admin_username": "LOCAL_ADMIN_USERNAME",
}

# Regex to validate Ollama model names (alphanumeric, dash, dot, colon, slash)
_MODEL_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.:\-/]{0,255}$")


def _validate_model_name(name: str) -> str:
    """Validate model name to prevent injection / path traversal."""
    if not _MODEL_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid model name")
    if ".." in name:
        raise HTTPException(status_code=400, detail="Invalid model name")
    return name


logger = logging.getLogger(__name__)


def _update_env_file(updates: dict[str, str]) -> None:
    """Update .env file with new values, preserving comments and order."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if not os.path.isfile(env_path):
        return
    # Audit: log which keys are being written (never log values)
    logger.info("Persisting %d setting(s) to .env: %s", len(updates), list(updates.keys()))

    with open(env_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    keys_written: set[str] = set()
    new_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        # Preserve comments and blanks
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue

        # Parse KEY=VALUE
        if "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                val = updates[key]
                new_lines.append(f"{key}={val}\n")
                keys_written.add(key)
                continue

        new_lines.append(line)

    # Append any updates that weren't in the file
    for key, val in updates.items():
        if key not in keys_written:
            new_lines.append(f"{key}={val}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)


@router.patch("/settings", response_model=SystemSettingsResponse)
async def update_system_settings(
    body: SystemSettingsUpdate,
    _admin=Depends(require_admin),
):
    """Update system settings in-memory and persist to .env."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No settings provided")

    # Validate log_level if provided
    if "log_level" in updates:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if updates["log_level"].upper() not in allowed:
            raise HTTPException(status_code=400, detail=f"log_level must be one of {allowed}")
        updates["log_level"] = updates["log_level"].upper()

    # S14: Validate AD server URL format
    if "ad_server" in updates:
        ad_val = updates["ad_server"]
        if ad_val and not re.match(r"^ldaps?://[a-zA-Z0-9._-]+$", ad_val):
            raise HTTPException(status_code=400, detail="ad_server must be a valid ldap:// or ldaps:// URL")

    # S14: Validate AD domain format
    if "ad_domain" in updates:
        domain_val = updates["ad_domain"]
        if domain_val and not re.match(r"^[a-zA-Z0-9._-]+$", domain_val):
            raise HTTPException(status_code=400, detail="ad_domain contains invalid characters")

    # Validate session_cookie_samesite if provided
    if "session_cookie_samesite" in updates:
        allowed_ss = {"strict", "lax", "none"}
        if updates["session_cookie_samesite"].lower() not in allowed_ss:
            raise HTTPException(status_code=400, detail=f"session_cookie_samesite must be one of {allowed_ss}")
        updates["session_cookie_samesite"] = updates["session_cookie_samesite"].lower()

    # Validate llm_base_url format (prevent SSRF)
    if "llm_base_url" in updates:
        from urllib.parse import urlparse
        llm_url = updates["llm_base_url"]
        if llm_url:
            try:
                parsed = urlparse(llm_url)
                if parsed.scheme not in ("http", "https"):
                    raise ValueError("scheme must be http or https")
                if not parsed.hostname:
                    raise ValueError("hostname is required")
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Invalid llm_base_url: {exc}")

    # Apply to in-memory settings object AND build .env updates
    env_updates: dict[str, str] = {}
    for field_name, value in updates.items():
        env_key = _SETTING_KEY_MAP.get(field_name)
        if not env_key:
            continue
        # Update in-memory — handle SecretStr fields
        from pydantic import SecretStr
        current = getattr(app_settings, env_key, None)
        if isinstance(current, SecretStr):
            setattr(app_settings, env_key, SecretStr(str(value)))
        else:
            setattr(app_settings, env_key, value)
        # Format for .env
        if isinstance(value, bool):
            env_updates[env_key] = str(value).lower()
        else:
            env_updates[env_key] = str(value)

    # Persist to .env
    if env_updates:
        _update_env_file(env_updates)
        logger.info("Admin settings updated: %s", list(env_updates.keys()))

    # Reload services that cache config values
    llm_keys = {"LLM_BASE_URL", "LLM_DEFAULT_MODEL", "LLM_TIMEOUT", "LLM_MAX_TOKENS", "LLM_TEMPERATURE"}
    ad_keys = {"AD_SERVER", "AD_PORT", "AD_USE_SSL", "AD_DOMAIN", "AD_BASE_DN",
               "AD_USER_SEARCH_BASE", "AD_GROUP_SEARCH_BASE", "AD_BIND_USER", "AD_BIND_PASSWORD",
               "AD_ADMIN_GROUP", "AD_ENABLED"}
    if env_updates.keys() & llm_keys:
        await llm_service.reload()
    if env_updates.keys() & ad_keys:
        ad_service.reload()

    # Return updated settings
    return await get_system_settings(_admin=_admin)


@router.post("/test-ldap")
async def test_ldap_connection(_admin=Depends(require_admin)):
    """Test connectivity to the configured LDAP/AD server."""
    if not app_settings.AD_ENABLED:
        return {"success": False, "message": "AD/LDAP is not enabled. Enable it first in settings."}
    result = ad_service.test_connection()
    return result


@router.patch("/users/{user_id}")
async def update_user(
    body: UserUpdateRequest,
    user_id: str = Path(...),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Toggle admin/active status on a user."""
    import uuid as _uuid
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .where(User.id == uid)
        .options(
            selectinload(User.company),
            selectinload(User.department_obj),
            selectinload(User.designation_obj),
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changed = False
    if body.display_name is not None and user.display_name != body.display_name:
        user.display_name = body.display_name
        changed = True
    if body.email is not None and user.email != body.email:
        user.email = body.email or None
        changed = True
    if body.department is not None and user.department != body.department:
        user.department = body.department or None
        changed = True
    if body.is_admin is not None and user.is_admin != body.is_admin:
        user.is_admin = body.is_admin
        changed = True
    if body.is_active is not None and user.is_active != body.is_active:
        user.is_active = body.is_active
        changed = True
    if body.password is not None and user.is_local_account:
        from app.services.auth_service import _hash_password
        user.password_hash = _hash_password(body.password)
        changed = True
    if body.company_id is not None:
        new_cid = _uuid.UUID(body.company_id) if body.company_id else None
        if user.company_id != new_cid:
            user.company_id = new_cid
            changed = True
    if body.department_id is not None:
        new_did = _uuid.UUID(body.department_id) if body.department_id else None
        if user.department_id != new_did:
            user.department_id = new_did
            changed = True
    if body.designation_id is not None:
        new_desid = _uuid.UUID(body.designation_id) if body.designation_id else None
        if user.designation_id != new_desid:
            user.designation_id = new_desid
            changed = True

    if changed:
        await db.flush()
        # Re-load relationships after flush
        await db.refresh(user, attribute_names=["company", "department_obj", "designation_obj"])

    return _user_response(user)


@router.get("/health", response_model=SystemHealthResponse)
async def system_health(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get system health status."""
    # Check DB
    try:
        await db.execute(select(func.count()).select_from(User))
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    # Check LLM
    llm_ok = await llm_service.health_check()

    # Metrics
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)

    active_24h = (
        await db.execute(
            select(func.count()).select_from(User).where(User.last_login >= day_ago)
        )
    ).scalar() or 0

    total_convs = (
        await db.execute(select(func.count()).select_from(Conversation))
    ).scalar() or 0

    total_msgs = (
        await db.execute(select(func.count()).select_from(Message))
    ).scalar() or 0

    return SystemHealthResponse(
        status="healthy" if db_status == "healthy" and llm_ok else "degraded",
        database=db_status,
        llm_service="healthy" if llm_ok else "unhealthy",
        active_users_24h=active_24h,
        total_conversations=total_convs,
        total_messages=total_msgs,
        uptime_seconds=round(time.time() - _app_start_time, 1),
    )


@router.get("/metrics", response_model=UsageMetrics)
async def usage_metrics(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get platform usage metrics."""
    return UsageMetrics(**(await user_service.get_usage_metrics(db)))


@router.get("/users", response_model=UserListResponse)
async def list_users(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only)."""
    users, total = await user_service.list_users(db, offset, limit)
    return UserListResponse(
        users=[_user_response(u) for u in users],
        total=total,
    )


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    action: str | None = None,
    username: str | None = None,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Query audit logs with optional filters."""
    q = select(AuditLog).order_by(desc(AuditLog.timestamp))
    count_q = select(func.count()).select_from(AuditLog)

    if action:
        q = q.where(AuditLog.action == action)
        count_q = count_q.where(AuditLog.action == action)
    if username:
        q = q.where(AuditLog.username == username)
        count_q = count_q.where(AuditLog.username == username)

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(q.offset(offset).limit(limit))
    logs = result.scalars().all()

    return AuditLogListResponse(
        logs=[
            AuditLogEntry(
                id=str(log.id),
                user_id=str(log.user_id) if log.user_id else None,
                username=log.username,
                action=log.action,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                details=log.details,
                ip_address=log.ip_address,
                timestamp=log.timestamp,
            )
            for log in logs
        ],
        total=total,
    )


@router.get("/models", response_model=ModelsListResponse)
async def list_models(
    _admin=Depends(require_admin),
):
    """List available LLM models."""
    models = await llm_service.list_models()
    return ModelsListResponse(
        models=[
            ModelInfo(
                name=m.get("name", "unknown"),
                size=str(m.get("size", "")),
                size_bytes=m.get("size"),
                modified_at=m.get("modified_at"),
                digest=m.get("digest", "")[:16] if m.get("digest") else None,
                family=m.get("details", {}).get("family"),
                parameter_size=m.get("details", {}).get("parameter_size"),
                quantization_level=m.get("details", {}).get("quantization_level"),
            )
            for m in models
        ],
        default_model=llm_service.default_model,
    )


@router.post("/models/pull")
async def pull_model(
    body: ModelPullRequest,
    _admin=Depends(require_admin),
):
    """Pull (download) a model from Ollama registry. Streams progress as NDJSON."""
    _validate_model_name(body.name)

    async def _stream():
        try:
            async for chunk in llm_service.pull_model_stream(body.name):
                yield chunk + "\n"
        except Exception as e:
            import orjson
            yield orjson.dumps({"error": str(e)}).decode() + "\n"

    return StreamingResponse(
        _stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/models/{model_name:path}")
async def delete_model(
    model_name: str,
    _admin=Depends(require_admin),
):
    """Delete a model from Ollama."""
    model_name = _validate_model_name(model_name)
    success = await llm_service.delete_model(model_name)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete model '{model_name}'")
    return {"success": True, "message": f"Model '{model_name}' deleted"}


@router.post("/models/set-default")
async def set_default_model(
    body: ModelPullRequest,
    _admin=Depends(require_admin),
):
    """Set the default model used for chat."""
    # Update in-memory
    setattr(app_settings, "LLM_DEFAULT_MODEL", body.name)
    llm_service.default_model = body.name

    # Persist to .env file
    _update_env_file({"LLM_DEFAULT_MODEL": body.name})

    return {"success": True, "default_model": body.name}


@router.post("/users", status_code=201)
async def create_user(
    body: CreateUserRequest,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new local user account (admin only)."""
    try:
        user = await user_service.create_user(
            username=body.username,
            password=body.password,
            display_name=body.display_name,
            db=db,
            email=body.email,
            department=body.department,
            is_admin=body.is_admin,
            company_id=body.company_id,
            department_id=body.department_id,
            designation_id=body.designation_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    # Eagerly load org relationships for the response
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .where(User.id == user.id)
        .options(
            selectinload(User.company),
            selectinload(User.department_obj),
            selectinload(User.designation_obj),
        )
    )
    user = result.scalar_one()
    return _user_response(user)


# ============================================================
# Database Management Endpoints
# ============================================================

_TABLE_MODELS = {
    # Core tables
    "users": User,
    "user_settings": UserSettings,
    "conversations": Conversation,
    "messages": Message,
    "audit_logs": AuditLog,
    "file_uploads": FileUpload,
    "announcements": Announcement,
    "conversation_tags": ConversationTag,
    "conversation_tag_links": ConversationTagLink,
    "message_bookmarks": MessageBookmark,
    "message_feedback": MessageFeedback,
    "prompt_templates": PromptTemplate,
    "shared_conversations": SharedConversation,
    "token_blacklist": TokenBlacklist,
    # V2 tables
    "knowledge_bases": KnowledgeBase,
    "knowledge_documents": KnowledgeDocument,
    "document_chunks": DocumentChunk,
    "agents": Agent,
    "ai_memories": AIMemory,
    "agent_skills": AgentSkill,
    "skill_executions": SkillExecution,
    "scheduled_tasks": ScheduledTask,
    "task_executions": TaskExecution,
    "notifications": Notification,
    # V3 — Organization
    "companies": Company,
    "departments": Department,
    "designations": Designation,
    "company_departments": company_departments,
    "department_designations": department_designations,
}


@router.get("/database/info")
async def database_info(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return database configuration and table statistics."""
    tables = {}
    for table_name, model in _TABLE_MODELS.items():
        count = (await db.execute(select(func.count()).select_from(model))).scalar() or 0
        tables[table_name] = count

    try:
        size_result = await db.execute(
            text("SELECT pg_size_pretty(pg_database_size(current_database()))")
        )
        db_size = size_result.scalar() or "unknown"
    except Exception:
        db_size = "unknown"

    try:
        ver_result = await db.execute(text("SELECT version()"))
        db_version = ver_result.scalar() or "unknown"
    except Exception:
        db_version = "unknown"

    return {
        "host": app_settings.DATABASE_HOST,
        "port": app_settings.DATABASE_PORT,
        "name": app_settings.DATABASE_NAME,
        "user": app_settings.DATABASE_USER,
        "pool_size": app_settings.DATABASE_POOL_SIZE,
        "max_overflow": app_settings.DATABASE_MAX_OVERFLOW,
        "db_size": db_size,
        "db_version": db_version,
        "tables": tables,
        "total_rows": sum(tables.values()),
    }


def _serialize_row(row, columns: list[str]) -> dict:
    """Convert a SQLAlchemy row to a JSON-safe dict.

    Excludes sensitive fields (e.g. password_hash) from serialisation.
    """
    _SENSITIVE_COLUMNS = {"password_hash"}
    obj = {}
    for col in columns:
        if col in _SENSITIVE_COLUMNS:
            continue
        val = getattr(row, col, None)
        if val is None:
            obj[col] = None
        elif isinstance(val, datetime):
            obj[col] = val.isoformat()
        elif hasattr(val, "hex"):  # UUID
            obj[col] = str(val)
        else:
            obj[col] = val
    return obj


def _serialize_mapping_row(row: dict, columns: list[str]) -> dict:
    """Convert a SQLAlchemy mapping row to a JSON-safe dict."""
    obj = {}
    for col in columns:
        val = row.get(col)
        if val is None:
            obj[col] = None
        elif isinstance(val, datetime):
            obj[col] = val.isoformat()
        elif hasattr(val, "hex"):  # UUID
            obj[col] = str(val)
        else:
            obj[col] = val
    return obj


@router.get("/database/export")
async def database_export(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Export all database tables as a JSON download."""
    import io

    export_data: dict = {"exported_at": datetime.now(timezone.utc).isoformat(), "tables": {}}

    for table_name, model in _TABLE_MODELS.items():
        if isinstance(model, Table):
            result = await db.execute(select(model))
            rows = result.mappings().all()
            columns = [c.name for c in model.columns]
            export_data["tables"][table_name] = [_serialize_mapping_row(r, columns) for r in rows]
        else:
            result = await db.execute(select(model))
            rows = result.scalars().all()
            columns = [c.key for c in inspect(model).mapper.column_attrs]
            export_data["tables"][table_name] = [_serialize_row(r, columns) for r in rows]

    json_bytes = json.dumps(export_data, indent=2, ensure_ascii=False).encode("utf-8")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"org_ai_backup_{timestamp}.json"

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/database/import")
async def database_import(
    file: UploadFile = File(...),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Import database from a previously exported JSON file.

    Merges data — existing rows with the same primary key are skipped.
    """
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Only .json files are accepted")

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:  # 100 MB limit
        raise HTTPException(status_code=400, detail="File too large (max 100 MB)")

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    if "tables" not in data:
        raise HTTPException(status_code=400, detail="Invalid backup format: missing 'tables' key")

    imported_counts: dict[str, int] = {}
    import_order = [
        # Phase 0 — Organization structure (no FK deps)
        "companies", "departments", "designations",
        # Phase 0.5 — Organization mappings
        "company_departments", "department_designations",
        # Phase 1 — no FK dependencies
        "users", "user_settings", "token_blacklist", "announcements",
        "prompt_templates", "audit_logs",
        # Phase 2 — depend on users
        "conversations", "knowledge_bases", "ai_memories", "notifications",
        # Phase 3 — depend on conversations / knowledge_bases
        "messages", "file_uploads", "conversation_tags",
        "conversation_tag_links", "shared_conversations",
        "message_bookmarks", "message_feedback",
        "knowledge_documents", "agents",
        # Phase 4 — depend on agents / knowledge_documents
        "document_chunks", "agent_skills", "scheduled_tasks",
        # Phase 5 — depend on skills / tasks
        "skill_executions", "task_executions",
    ]

    for table_name in import_order:
        rows = data["tables"].get(table_name, [])
        if not rows:
            imported_counts[table_name] = 0
            continue

        model = _TABLE_MODELS.get(table_name)
        if not model:
            continue

        count = 0
        for row_data in rows:
            if isinstance(model, Table):
                columns = {c.name for c in model.columns}
            else:
                pk_val = row_data.get("id")
                if pk_val:
                    import uuid as _uuid
                    try:
                        uid = _uuid.UUID(pk_val)
                    except ValueError:
                        continue
                    exists = (await db.execute(select(model).where(model.id == uid))).scalar_one_or_none()
                    if exists:
                        continue
                columns = {c.key for c in inspect(model).mapper.column_attrs}

            clean = {}
            for k, v in row_data.items():
                if k not in columns:
                    continue
                if v is None:
                    clean[k] = None
                elif k == "id" or k.endswith("_id"):
                    import uuid as _uuid
                    try:
                        clean[k] = _uuid.UUID(v) if v else None
                    except (ValueError, AttributeError):
                        clean[k] = None
                elif k.endswith("_at") or k in ("timestamp", "review_date"):
                    try:
                        clean[k] = datetime.fromisoformat(v) if v else None
                    except (ValueError, TypeError):
                        clean[k] = None
                else:
                    clean[k] = v

            try:
                if isinstance(model, Table):
                    pk_cols = [c.name for c in model.primary_key.columns]
                    if pk_cols and all(pk in clean for pk in pk_cols):
                        where_clause = and_(*[model.c[pk] == clean[pk] for pk in pk_cols])
                        exists = (await db.execute(select(model).where(where_clause))).first()
                        if exists:
                            continue
                    await db.execute(model.insert().values(**clean))
                else:
                    obj = model(**clean)
                    db.add(obj)
                await db.flush()
                count += 1
            except Exception as e:
                logger.warning("Import skip row in %s: %s", table_name, str(e))
                await db.rollback()
                continue

        imported_counts[table_name] = count

    await db.commit()
    logger.info("Database import completed: %s", imported_counts)
    return {"message": "Import completed", "imported": imported_counts}


@router.delete("/database/clear/{table_name}")
async def clear_table(
    table_name: str = Path(...),
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete all rows from a specific table."""
    allowed_tables = {"conversations", "messages", "audit_logs", "file_uploads"}
    if table_name not in allowed_tables:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot clear '{table_name}'. Allowed: {sorted(allowed_tables)}"
        )

    if table_name == "conversations":
        count = (await db.execute(select(func.count()).select_from(Conversation))).scalar() or 0
        await db.execute(Message.__table__.delete())
        await db.execute(Conversation.__table__.delete())
        await db.commit()
        return {"message": f"Cleared {count} conversations and all their messages"}

    model = _TABLE_MODELS[table_name]
    count = (await db.execute(select(func.count()).select_from(model))).scalar() or 0
    await db.execute(model.__table__.delete())
    await db.commit()
    return {"message": f"Cleared {count} rows from {table_name}"}


@router.delete("/database/clear-all")
async def clear_all_data(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete ALL data from all tables. This is irreversible."""
    counts = {}
    for table_name in ["file_uploads", "messages", "conversations", "user_settings", "audit_logs", "users"]:
        model = _TABLE_MODELS[table_name]
        count = (await db.execute(select(func.count()).select_from(model))).scalar() or 0
        counts[table_name] = count
        await db.execute(model.__table__.delete())

    await db.commit()
    logger.warning("ALL database data cleared by admin: %s", counts)
    return {"message": "All data cleared", "deleted": counts}
