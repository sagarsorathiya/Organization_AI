"""Application configuration loaded from environment variables."""

import secrets
import os
from typing import List
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings
from pydantic import Field, SecretStr, model_validator
from sqlalchemy import URL


def _require_env(var: str) -> str:
    """Return a sentinel that triggers validation if the env var is missing."""
    return os.environ.get(var, "")


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Organization AI Assistant"
    APP_ENV: str = "production"
    SECRET_KEY: SecretStr = SecretStr(secrets.token_urlsafe(48))
    CORS_ORIGINS: List[str] = ["http://localhost:3005"]
    ALLOWED_HOSTS: List[str] = ["localhost", "127.0.0.1"]

    # Database
    DATABASE_HOST: str = "localhost"
    DATABASE_PORT: int = 5432
    DATABASE_NAME: str = "org_ai"
    DATABASE_USER: str = "org_ai_user"
    DATABASE_PASSWORD: SecretStr = SecretStr("")
    DATABASE_POOL_SIZE: int = 100
    DATABASE_MAX_OVERFLOW: int = 50

    # Active Directory / LDAP
    AD_ENABLED: bool = True
    AD_SERVER: str = "ldap://your-dc.domain.local"
    AD_PORT: int = 389
    AD_USE_SSL: bool = False
    AD_DOMAIN: str = "DOMAIN"
    AD_BASE_DN: str = "DC=domain,DC=local"
    AD_USER_SEARCH_BASE: str = "OU=Users,DC=domain,DC=local"
    AD_GROUP_SEARCH_BASE: str = "OU=Groups,DC=domain,DC=local"
    AD_BIND_USER: str = ""
    AD_BIND_PASSWORD: SecretStr = SecretStr("")
    AD_ADMIN_GROUP: str = "CN=AI-Admins,OU=Groups,DC=domain,DC=local"

    # LLM Engine
    LLM_PROVIDER: str = "ollama"
    LLM_BASE_URL: str = "http://localhost:11434"
    LLM_DEFAULT_MODEL: str = "llama3"
    LLM_TIMEOUT: int = 300
    LLM_MAX_TOKENS: int = 4096
    LLM_TEMPERATURE: float = 0.7
    LLM_NUM_CTX: int = 4096           # Context window size (tokens) — lower = faster first-token
    LLM_NUM_GPU: int = -1             # GPU layers: -1=auto (all), 0=CPU-only, N=specific layers
    LLM_NUM_THREAD: int = 0           # CPU threads: 0=auto (all cores)

    # Chat context limits
    CHAT_MAX_CONTEXT_MESSAGES: int = 20
    CHAT_MAX_CONTEXT_CHARS: int = 16000  # ~4K tokens

    # Session / Security
    SESSION_SECRET: SecretStr = SecretStr(secrets.token_urlsafe(48))
    SESSION_EXPIRE_MINUTES: int = 480
    SESSION_COOKIE_NAME: str = "org_ai_session"
    SESSION_COOKIE_SECURE: bool = True
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: str = "strict"

    # Rate Limiting (disabled for internal enterprise use)
    RATE_LIMIT_ENABLED: bool = False
    RATE_LIMIT_REQUESTS: int = 0
    RATE_LIMIT_WINDOW_SECONDS: int = 0

    # Attachments
    ATTACHMENTS_ENABLED: bool = True
    ATTACHMENTS_MAX_SIZE_MB: int = 10
    ATTACHMENTS_MAX_EXTRACT_CHARS: int = 50000

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/app.log"

    # V2 Feature Flags
    ENABLE_AGENTS: bool = True
    ENABLE_MEMORY: bool = True
    ENABLE_SKILLS: bool = True
    ENABLE_RAG: bool = True
    ENABLE_SCHEDULER: bool = True
    ENABLE_NOTIFICATIONS: bool = True

    # V2 Memory
    MAX_MEMORIES_PER_USER: int = 500
    MEMORY_AUTO_EXTRACT: bool = True

    # V2 RAG / Embeddings
    EMBEDDING_MODEL: str = "nomic-embed-text"
    EMBEDDING_LOCAL_FALLBACK_ENABLED: bool = True
    EMBEDDING_LOCAL_FALLBACK_DIM: int = 384
    RAG_CHUNK_SIZE: int = 500
    RAG_CHUNK_OVERLAP: int = 50
    RAG_TOP_K: int = 5
    MAX_KB_DOCUMENTS: int = 1000

    # OCR (for scanned/image-only documents)
    OCR_ENABLED: bool = True
    OCR_LANGUAGE: str = "eng"
    OCR_PDF_RENDER_SCALE: float = 2.0
    OCR_MAX_PAGES: int = 50
    OCR_TESSERACT_CMD: str = ""

    # V2 Scheduler
    SCHEDULER_TIMEZONE: str = "UTC"

    # Admin
    ADMIN_GROUPS: List[str] = ["AI-Admins", "IT-Admins"]

    # Local Admin (works even when AD/LDAP is enabled — break-glass account)
    LOCAL_ADMIN_ENABLED: bool = True
    LOCAL_ADMIN_USERNAME: str = "admin"
    LOCAL_ADMIN_PASSWORD: SecretStr = SecretStr("")
    LOCAL_ADMIN_DISPLAY_NAME: str = "Local Administrator"
    LOCAL_ADMIN_EMAIL: str = "admin@local"

    @model_validator(mode="after")
    def _validate_required_secrets(self) -> "Settings":
        """Validate secrets — warn in dev, block in production."""
        import logging
        _log = logging.getLogger("config")

        _weak_markers = {"change_me", "changeme", "dev_only", "dev_secret",
                         "your_postgres", "password_here", "CHANGE_ME"}
        is_prod = self.APP_ENV == "production"

        # Database password
        pw = self.DATABASE_PASSWORD.get_secret_value()
        if not pw or any(m in pw for m in _weak_markers):
            msg = "DATABASE_PASSWORD is empty or uses a placeholder — set a strong value in .env"
            if is_prod:
                raise ValueError(msg)
            _log.warning(msg)

        # Admin password — always require a reasonable password
        admin_pw = self.LOCAL_ADMIN_PASSWORD.get_secret_value()
        if self.LOCAL_ADMIN_ENABLED:
            if not admin_pw or len(admin_pw) < 8:
                msg = "LOCAL_ADMIN_PASSWORD must be at least 8 characters — set a strong value in .env"
                if is_prod:
                    raise ValueError(msg)
                _log.warning(msg)
            elif any(m in admin_pw for m in _weak_markers):
                msg = "LOCAL_ADMIN_PASSWORD uses a placeholder — change it in .env"
                if is_prod:
                    raise ValueError(msg)
                _log.warning(msg)

        # Secret key
        sk = self.SECRET_KEY.get_secret_value()
        if not sk or any(m in sk.lower() for m in _weak_markers):
            msg = "SECRET_KEY is weak or uses a placeholder — generate with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            if is_prod:
                raise ValueError(msg)
            _log.warning(msg)

        # Session secret
        ss = self.SESSION_SECRET.get_secret_value()
        if not ss or any(m in ss.lower() for m in _weak_markers):
            msg = "SESSION_SECRET is weak or uses a placeholder — generate a strong random value"
            if is_prod:
                raise ValueError(msg)
            _log.warning(msg)

        return self

    @property
    def database_url(self) -> URL:
        """Async database URL — password hidden from repr/logs."""
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.DATABASE_USER,
            password=self.DATABASE_PASSWORD.get_secret_value(),
            host=self.DATABASE_HOST,
            port=self.DATABASE_PORT,
            database=self.DATABASE_NAME,
        )

    @property
    def database_url_sync(self) -> URL:
        """Sync database URL — password hidden from repr/logs."""
        return URL.create(
            drivername="postgresql",
            username=self.DATABASE_USER,
            password=self.DATABASE_PASSWORD.get_secret_value(),
            host=self.DATABASE_HOST,
            port=self.DATABASE_PORT,
            database=self.DATABASE_NAME,
        )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
