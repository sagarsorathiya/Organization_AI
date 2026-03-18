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
from app.middleware.request_id import RequestIDMiddleware
from app.api import auth, chat, conversations, settings as settings_api, admin
from app.api import feedback, templates, tags, bookmarks, announcements, sharing

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

# Request ID
app.add_middleware(RequestIDMiddleware)

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
app.include_router(feedback.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(bookmarks.router, prefix="/api")
app.include_router(announcements.router, prefix="/api")
app.include_router(sharing.router, prefix="/api")


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
        from app.models import (
            User, Conversation, Message, AuditLog, UserSettings,
            MessageFeedback, PromptTemplate, ConversationTag, ConversationTagLink,
            Announcement, SharedConversation, MessageBookmark,
        )

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Dev mode: database tables created")

    # Seed local admin account if enabled
    if settings.LOCAL_ADMIN_ENABLED:
        await _seed_local_admin()

    # Seed default prompt templates
    await _seed_default_templates()

    # Run data retention enforcement on startup
    try:
        from app.tasks.data_retention import enforce_data_retention
        deleted = await enforce_data_retention()
        if deleted:
            logger.info("Data retention: deleted %d expired conversations", deleted)
    except Exception:
        logger.exception("Data retention task failed")


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


# ---- Default Prompt Templates ----
_DEFAULT_TEMPLATES = [
    # --- Writing ---
    {
        "title": "Professional Email",
        "content": "Write a professional email about {topic}. Include a clear subject line, greeting, body with key points, and a polite closing. Keep the tone formal but approachable.",
        "category": "Writing",
    },
    {
        "title": "Meeting Summary",
        "content": "Summarize the following meeting notes into a clear, structured format with:\n- Key decisions made\n- Action items (with owners if mentioned)\n- Next steps and deadlines\n\nMeeting notes:\n{notes}",
        "category": "Writing",
    },
    {
        "title": "Report Writer",
        "content": "Write a concise report on {topic}. Structure it with:\n1. Executive Summary\n2. Key Findings\n3. Analysis\n4. Recommendations\n\nKeep it professional and data-driven.",
        "category": "Writing",
    },
    # --- Coding ---
    {
        "title": "Code Review",
        "content": "Review the following code for:\n- Bugs and potential issues\n- Security vulnerabilities\n- Performance improvements\n- Code style and best practices\n\nProvide specific suggestions with examples.\n\n```\n{code}\n```",
        "category": "Coding",
    },
    {
        "title": "Explain Code",
        "content": "Explain the following code in simple terms. Break down:\n- What it does (overall purpose)\n- How it works (step by step)\n- Key concepts used\n\n```\n{code}\n```",
        "category": "Coding",
    },
    {
        "title": "Write Unit Tests",
        "content": "Write comprehensive unit tests for the following code. Include:\n- Happy path tests\n- Edge cases\n- Error handling tests\n\nUse appropriate assertions and descriptive test names.\n\n```\n{code}\n```",
        "category": "Coding",
    },
    {
        "title": "Debug Helper",
        "content": "I'm encountering this error:\n\n{error}\n\nIn this code:\n\n```\n{code}\n```\n\nPlease:\n1. Explain what's causing the error\n2. Provide the fix\n3. Explain how to prevent it in the future",
        "category": "Coding",
    },
    # --- Analysis ---
    {
        "title": "Pros and Cons",
        "content": "Analyze {topic} by listing:\n\n**Pros:**\n- (advantages, benefits, strengths)\n\n**Cons:**\n- (disadvantages, risks, weaknesses)\n\n**Recommendation:**\nProvide a balanced conclusion.",
        "category": "Analysis",
    },
    {
        "title": "Compare Options",
        "content": "Compare the following options: {options}\n\nFor each option, evaluate:\n- Key features and capabilities\n- Cost and resource implications\n- Ease of implementation\n- Long-term maintainability\n\nProvide a recommendation with reasoning.",
        "category": "Analysis",
    },
    {
        "title": "Root Cause Analysis",
        "content": "Perform a root cause analysis for the following problem:\n\n{problem}\n\nUse the 5 Whys technique:\n1. Why did this happen?\n2. Why? (dig deeper)\n3. Why?\n4. Why?\n5. Why? (root cause)\n\nThen suggest preventive measures.",
        "category": "Analysis",
    },
    # --- Productivity ---
    {
        "title": "Simplify Text",
        "content": "Rewrite the following text in simpler, clearer language. Maintain the key information but make it easy to understand for a general audience:\n\n{text}",
        "category": "Productivity",
    },
    {
        "title": "Translate",
        "content": "Translate the following text to {language}. Maintain the original tone and meaning. If there are idioms or cultural references, adapt them appropriately:\n\n{text}",
        "category": "Productivity",
    },
    {
        "title": "Brainstorm Ideas",
        "content": "Brainstorm 10 creative ideas for {topic}. For each idea, provide:\n- A short title\n- A one-sentence description\n- Why it could work\n\nThink outside the box and include both practical and innovative suggestions.",
        "category": "Productivity",
    },
    {
        "title": "Create Action Plan",
        "content": "Create a detailed action plan for: {goal}\n\nInclude:\n1. Clear objectives\n2. Step-by-step tasks with priorities\n3. Timeline estimates\n4. Required resources\n5. Potential risks and mitigations",
        "category": "Productivity",
    },
    # --- IT / Technical ---
    {
        "title": "Troubleshoot Issue",
        "content": "Help me troubleshoot this technical issue:\n\n**System/Application:** {system}\n**Problem:** {problem}\n**Steps already tried:** {steps}\n\nProvide a systematic troubleshooting approach with potential solutions ranked by likelihood.",
        "category": "IT Support",
    },
    {
        "title": "SQL Query Builder",
        "content": "Write a SQL query to: {requirement}\n\nDatabase details:\n- Tables: {tables}\n- Key relationships: {relationships}\n\nProvide the query with:\n- Proper JOINs if needed\n- WHERE clauses for filtering\n- Comments explaining each section\n- Performance considerations",
        "category": "IT Support",
    },
    {
        "title": "Documentation Writer",
        "content": "Write technical documentation for {topic}. Include:\n\n1. Overview / Purpose\n2. Prerequisites\n3. Step-by-step instructions\n4. Configuration options\n5. Troubleshooting / FAQ\n\nUse clear headings, code blocks where appropriate, and keep it concise.",
        "category": "IT Support",
    },
]


async def _seed_default_templates():
    """Seed default prompt templates if none exist yet."""
    from sqlalchemy import select, func
    from app.database import async_session_factory
    from app.models.prompt_template import PromptTemplate

    async with async_session_factory() as db:
        count = (await db.execute(
            select(func.count()).select_from(PromptTemplate).where(PromptTemplate.is_system == True)
        )).scalar() or 0

        if count > 0:
            return  # Templates already seeded

        for tpl in _DEFAULT_TEMPLATES:
            db.add(PromptTemplate(
                title=tpl["title"],
                content=tpl["content"],
                category=tpl["category"],
                is_system=True,
            ))

        await db.commit()
        logger.info("Seeded %d default prompt templates", len(_DEFAULT_TEMPLATES))


@app.on_event("shutdown")
async def on_shutdown():
    from app.database import engine
    from app.services.llm_service import llm_service
    await llm_service.close()
    await engine.dispose()
    logger.info("Application shut down")
