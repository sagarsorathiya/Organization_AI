"""FastAPI application entry point."""

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.middleware.security import SecurityHeadersMiddleware, RequestLoggingMiddleware
from app.middleware.rate_limit import limiter
from app.api import auth, chat, conversations, settings as settings_api, admin

# ---- Logging Setup ----
os.makedirs(os.path.dirname(settings.LOG_FILE) or "logs", exist_ok=True)

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(settings.LOG_FILE, encoding="utf-8"),
    ],
)

logger = logging.getLogger(__name__)

# ---- App Instance ----
app = FastAPI(
    title=settings.APP_NAME,
    description="Internal Private AI Assistant — 100% On-Premise",
    version="1.0.0",
    docs_url="/api/docs" if settings.APP_ENV != "production" else None,
    redoc_url="/api/redoc" if settings.APP_ENV != "production" else None,
    openapi_url="/api/openapi.json" if settings.APP_ENV != "production" else None,
)

# ---- Middleware (order matters: last added = first executed) ----

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
if settings.APP_ENV == "development":
    # In development, allow configured origins plus common LAN patterns
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# Request logging
app.add_middleware(RequestLoggingMiddleware)


# ---- Global Exception Handler ----
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ---- Routers ----
app.include_router(auth.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


# ---- Health Check ----
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": settings.APP_NAME}


# ---- Startup / Shutdown Events ----
@app.on_event("startup")
async def on_startup():
    logger.info("🚀 %s starting up (env=%s)", settings.APP_NAME, settings.APP_ENV)

    # Warn about insecure default secrets
    _weak_markers = {"change_me", "changeme", "dev_secret", "dev_session"}
    for key_name, key_val in [("SECRET_KEY", settings.SECRET_KEY.get_secret_value()), ("SESSION_SECRET", settings.SESSION_SECRET.get_secret_value())]:
        if any(marker in key_val.lower() for marker in _weak_markers):
            logger.warning(
                "⚠️  %s appears to use a default/weak value. "
                "Generate a strong random key before deploying to production.",
                key_name,
            )

    # Create tables if they don't exist (for dev; use Alembic in production)
    if settings.APP_ENV == "development":
        from app.database import engine, Base
        from app.models import User, Conversation, Message, AuditLog, UserSettings

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Dev mode: database tables created")

    # Seed local admin account if enabled
    if settings.LOCAL_ADMIN_ENABLED:
        await _seed_local_admin()


async def _seed_local_admin():
    """Ensure the local admin account exists in the database."""
    import bcrypt as _bcrypt
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.user import User
    from app.models.user_settings import UserSettings

    def _hash_pw(pw: str) -> str:
        return _bcrypt.hashpw(pw.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

    def _verify_pw(pw: str, hashed: str) -> bool:
        try:
            return _bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False

    async with async_session_factory() as db:
        # Check if user with this username already exists (local or not)
        result = await db.execute(
            select(User).where(User.username == settings.LOCAL_ADMIN_USERNAME)
        )
        user = result.scalar_one_or_none()

        if user is None:
            # Create fresh local admin
            user = User(
                username=settings.LOCAL_ADMIN_USERNAME,
                display_name=settings.LOCAL_ADMIN_DISPLAY_NAME,
                email=settings.LOCAL_ADMIN_EMAIL,
                is_admin=True,
                is_local_account=True,
                password_hash=_hash_pw(settings.LOCAL_ADMIN_PASSWORD.get_secret_value()),
            )
            db.add(user)
            await db.flush()
            db.add(UserSettings(user_id=user.id))
            await db.commit()
            logger.info("Local admin account '%s' created", settings.LOCAL_ADMIN_USERNAME)
        else:
            # Upgrade existing user to local admin if needed
            changed = False
            if not user.is_local_account:
                user.is_local_account = True
                changed = True
            if not user.is_admin:
                user.is_admin = True
                changed = True
            user.display_name = settings.LOCAL_ADMIN_DISPLAY_NAME
            user.email = settings.LOCAL_ADMIN_EMAIL
            admin_pw = settings.LOCAL_ADMIN_PASSWORD.get_secret_value()
            if not user.password_hash or not _verify_pw(admin_pw, user.password_hash):
                user.password_hash = _hash_pw(admin_pw)
                changed = True
            if changed:
                await db.commit()
                logger.info("Local admin account '%s' updated", settings.LOCAL_ADMIN_USERNAME)


@app.on_event("shutdown")
async def on_shutdown():
    from app.database import engine
    from app.services.llm_service import llm_service
    await llm_service.close()
    await engine.dispose()
    logger.info("Application shut down")
