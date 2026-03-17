"""Admin schemas."""

from datetime import datetime
from pydantic import BaseModel, Field


class AuditLogEntry(BaseModel):
    id: str
    user_id: str | None = None
    username: str | None = None
    action: str
    resource_type: str | None = None
    resource_id: str | None = None
    details: str | None = None
    ip_address: str | None = None
    timestamp: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogEntry]
    total: int


class SystemHealthResponse(BaseModel):
    status: str
    database: str
    llm_service: str
    active_users_24h: int
    total_conversations: int
    total_messages: int
    uptime_seconds: float


class UsageMetrics(BaseModel):
    total_users: int
    active_users_today: int
    active_users_week: int
    total_conversations: int
    total_messages: int
    messages_today: int
    avg_messages_per_conversation: float


class ModelInfo(BaseModel):
    name: str
    size: str | None = None
    size_bytes: int | None = None
    modified_at: str | None = None
    digest: str | None = None
    family: str | None = None
    parameter_size: str | None = None
    quantization_level: str | None = None


class ModelsListResponse(BaseModel):
    models: list[ModelInfo]
    default_model: str


class ModelPullRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class ModelDeleteRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)


class SystemSettingsResponse(BaseModel):
    """Non-sensitive system configuration for admin dashboard."""

    # Application
    app_name: str
    app_env: str

    # AD / LDAP
    ad_enabled: bool
    ad_server: str
    ad_port: int
    ad_use_ssl: bool
    ad_domain: str
    ad_base_dn: str
    ad_user_search_base: str
    ad_group_search_base: str
    ad_bind_user: str
    ad_admin_group: str

    # LLM Engine
    llm_provider: str
    llm_base_url: str
    llm_default_model: str
    llm_timeout: int
    llm_max_tokens: int
    llm_temperature: float

    # Session / Security
    session_expire_minutes: int
    session_cookie_secure: bool
    session_cookie_samesite: str

    # Rate Limiting
    rate_limit_requests: int
    rate_limit_window_seconds: int

    # Attachments
    attachments_enabled: bool
    attachments_max_size_mb: int
    attachments_max_extract_chars: int

    # Logging
    log_level: str

    # Chat Context
    chat_max_context_messages: int
    chat_max_context_chars: int

    # Local Admin
    local_admin_enabled: bool
    local_admin_username: str


class SystemSettingsUpdate(BaseModel):
    """Partial update for system settings — all fields optional."""

    # Application
    app_name: str | None = None

    # AD / LDAP
    ad_enabled: bool | None = None
    ad_server: str | None = None
    ad_port: int | None = Field(None, ge=1, le=65535)
    ad_use_ssl: bool | None = None
    ad_domain: str | None = None
    ad_base_dn: str | None = None
    ad_user_search_base: str | None = None
    ad_group_search_base: str | None = None
    ad_bind_user: str | None = None
    ad_bind_password: str | None = None
    ad_admin_group: str | None = None

    # LLM Engine
    llm_provider: str | None = None
    llm_base_url: str | None = None
    llm_default_model: str | None = None
    llm_timeout: int | None = Field(None, ge=10, le=600)
    llm_max_tokens: int | None = Field(None, ge=256, le=128000)
    llm_temperature: float | None = Field(None, ge=0.0, le=2.0)

    # Session / Security
    session_expire_minutes: int | None = Field(None, ge=5, le=10080)
    session_cookie_secure: bool | None = None
    session_cookie_samesite: str | None = None

    # Rate Limiting
    rate_limit_requests: int | None = Field(None, ge=1, le=10000)
    rate_limit_window_seconds: int | None = Field(None, ge=1, le=3600)

    # Attachments
    attachments_enabled: bool | None = None
    attachments_max_size_mb: int | None = Field(None, ge=1, le=100)
    attachments_max_extract_chars: int | None = Field(None, ge=1000, le=500000)

    # Logging
    log_level: str | None = None

    # Chat Context
    chat_max_context_messages: int | None = Field(None, ge=1, le=100)
    chat_max_context_chars: int | None = Field(None, ge=1000, le=200000)

    # Local Admin
    local_admin_enabled: bool | None = None
    local_admin_username: str | None = None


class UserUpdateRequest(BaseModel):
    """Admin update for a user."""
    display_name: str | None = Field(None, min_length=1, max_length=256)
    email: str | None = None
    department: str | None = None
    is_admin: bool | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=8, max_length=128)


class CreateUserRequest(BaseModel):
    """Admin create local user."""
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=256)
    email: str | None = Field(None, max_length=256)
    department: str | None = Field(None, max_length=256)
    is_admin: bool = False
