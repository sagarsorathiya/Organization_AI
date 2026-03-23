"""FastAPI application entry point."""

import logging
import os
import asyncio

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
from app.api import agents as agents_api, memory as memory_api, skills as skills_api
from app.api import tasks as tasks_api, knowledge as knowledge_api
from app.api import organization as org_api

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
_data_retention_task: asyncio.Task | None = None


def _is_db_permission_error(exc: Exception) -> bool:
    """Return True when an exception indicates DB privilege issues."""
    msg = str(exc).lower()
    return "insufficientprivilege" in msg or "permission denied" in msg


async def _run_startup_seed(name: str, func):
    """Run a seed task without crashing startup on permission errors."""
    try:
        await func()
    except Exception as exc:
        if _is_db_permission_error(exc):
            logger.warning(
                "Skipping startup seed '%s' due to database permissions: %s",
                name,
                exc,
            )
            return
        raise


async def _data_retention_loop(interval_seconds: int = 24 * 60 * 60):
    """Run data retention periodically in the background."""
    while True:
        try:
            from app.tasks.data_retention import enforce_data_retention
            deleted = await enforce_data_retention()
            if deleted:
                logger.info("Data retention: deleted %d expired conversations", deleted)
        except Exception:
            logger.exception("Periodic data retention task failed")
        await asyncio.sleep(interval_seconds)

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
    # Production: strict origin enforcement, no wildcard
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID"],
        max_age=3600,
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
app.include_router(org_api.router, prefix="/api")
app.include_router(org_api.admin_router, prefix="/api")

# V2 Routers
if settings.ENABLE_AGENTS:
    app.include_router(agents_api.router, prefix="/api")
    app.include_router(agents_api.admin_router, prefix="/api")
if settings.ENABLE_MEMORY:
    app.include_router(memory_api.router, prefix="/api")
    app.include_router(memory_api.admin_router, prefix="/api")
if settings.ENABLE_SKILLS:
    app.include_router(skills_api.router, prefix="/api")
    app.include_router(skills_api.admin_router, prefix="/api")
if settings.ENABLE_RAG:
    app.include_router(knowledge_api.router, prefix="/api")
if settings.ENABLE_NOTIFICATIONS:
    app.include_router(tasks_api.notification_router, prefix="/api")
if settings.ENABLE_SCHEDULER:
    app.include_router(tasks_api.task_router, prefix="/api")


# ---- Health Check ----
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": settings.APP_NAME}


# ---- Startup / Shutdown Events ----
@app.on_event("startup")
async def on_startup():
    global _data_retention_task
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
            KnowledgeBase, KnowledgeDocument, DocumentChunk,
            Agent, AIMemory, AgentSkill, SkillExecution,
            ScheduledTask, TaskExecution, Notification,
        )

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Dev mode: database tables created")

    # Seed local admin account if enabled
    if settings.LOCAL_ADMIN_ENABLED:
        await _seed_local_admin()

    # Seed default prompt templates
    await _run_startup_seed("default_templates", _seed_default_templates)

    # Seed default agents, skills, and knowledge bases
    if settings.ENABLE_AGENTS:
        await _run_startup_seed("default_agents", _seed_default_agents)
    if settings.ENABLE_SKILLS:
        await _run_startup_seed("default_skills", _seed_default_skills)
    await _run_startup_seed("default_knowledge_bases", _seed_default_knowledge_bases)

    # Start background task scheduler
    if settings.ENABLE_SCHEDULER:
        try:
            from app.services.scheduler_service import scheduler_service
            await scheduler_service.start()
        except Exception:
            logger.exception("Failed to start task scheduler")

    # Run data retention enforcement on startup
    try:
        from app.tasks.data_retention import enforce_data_retention
        deleted = await enforce_data_retention()
        if deleted:
            logger.info("Data retention: deleted %d expired conversations", deleted)
    except Exception:
        logger.exception("Data retention task failed")

    # Keep retention enforcement running periodically without requiring restarts
    if _data_retention_task is None or _data_retention_task.done():
        _data_retention_task = asyncio.create_task(_data_retention_loop())


@app.on_event("shutdown")
async def on_shutdown():
    global _data_retention_task
    if _data_retention_task and not _data_retention_task.done():
        _data_retention_task.cancel()
        try:
            await _data_retention_task
        except asyncio.CancelledError:
            pass


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


# ---- Default Agents ----
_DEFAULT_AGENTS = [
    {
        "name": "HR Policy Assistant",
        "slug": "hr-policy",
        "description": "Expert on company HR policies, employee handbook, benefits, and workplace guidelines.",
        "icon": "👥",
        "category": "Human Resources",
        "system_prompt": "You are an expert HR Policy Assistant for the organization. You help employees understand company policies, benefits, leave procedures, workplace guidelines, and employee handbook contents. Always cite specific policy sections when possible. If you're unsure about a policy, say so and recommend contacting HR directly. Be professional, empathetic, and clear.",
        "temperature": 0.3,
    },
    {
        "name": "IT Helpdesk",
        "slug": "it-helpdesk",
        "description": "Technical support for common IT issues, software setup, and troubleshooting.",
        "icon": "🖥️",
        "category": "IT Support",
        "system_prompt": "You are an IT Helpdesk Assistant. Help users troubleshoot technical issues, set up software, resolve connectivity problems, and follow IT best practices. Provide step-by-step instructions. Always ask for error messages and system details when relevant. Recommend escalation to the IT team for hardware issues or security incidents.",
        "temperature": 0.2,
    },
    {
        "name": "Code Review Assistant",
        "slug": "code-review",
        "description": "Reviews code for bugs, security vulnerabilities, performance, and best practices.",
        "icon": "🔍",
        "category": "Development",
        "system_prompt": "You are a senior Code Review Assistant. Analyze code for bugs, security vulnerabilities (OWASP Top 10), performance issues, and adherence to best practices. Provide specific suggestions with code examples. Rate severity as Critical/High/Medium/Low. Focus on actionable feedback.",
        "temperature": 0.2,
    },
    {
        "name": "Document Writer",
        "slug": "document-writer",
        "description": "Creates professional documents, reports, proposals, and business communications.",
        "icon": "📝",
        "category": "Writing",
        "system_prompt": "You are a professional Document Writer. Create well-structured, clear, and professional documents including reports, proposals, memos, SOPs, and business communications. Follow standard document formatting with proper headings, sections, and executive summaries. Adapt tone to the audience and purpose.",
        "temperature": 0.5,
    },
    {
        "name": "Data Analyst",
        "slug": "data-analyst",
        "description": "Helps analyze data, create SQL queries, interpret results, and build reports.",
        "icon": "📊",
        "category": "Analytics",
        "system_prompt": "You are a Data Analyst Assistant. Help users write SQL queries, analyze datasets, interpret statistical results, and create data-driven reports. Explain complex concepts simply. Always consider data quality, potential biases, and statistical significance. Suggest appropriate visualizations.",
        "temperature": 0.2,
    },
    {
        "name": "Meeting Summarizer",
        "slug": "meeting-summarizer",
        "description": "Converts meeting notes into structured summaries with action items and decisions.",
        "icon": "📋",
        "category": "Productivity",
        "system_prompt": "You are a Meeting Summarizer. Convert raw meeting notes into structured summaries with: Key Decisions, Action Items (with owners and deadlines), Discussion Points, and Next Steps. Be concise and focus on actionable outcomes. Flag any unclear items that need follow-up.",
        "temperature": 0.3,
    },
    {
        "name": "Email Composer",
        "slug": "email-composer",
        "description": "Drafts professional emails with appropriate tone, structure, and etiquette.",
        "icon": "✉️",
        "category": "Communication",
        "system_prompt": "You are a Professional Email Composer. Draft clear, concise, and professional emails. Adapt tone based on the recipient (executive, colleague, client, vendor). Include appropriate subject lines, greetings, body structure, and closings. Ask for context if needed. Provide multiple versions for different tones when appropriate.",
        "temperature": 0.5,
    },
    {
        "name": "Compliance Reviewer",
        "slug": "compliance-reviewer",
        "description": "Reviews documents and processes for regulatory compliance and risk.",
        "icon": "⚖️",
        "category": "Legal & Compliance",
        "system_prompt": "You are a Compliance Review Assistant. Help review documents, processes, and policies for regulatory compliance. Identify potential compliance risks and suggest remediation. Note: Your analysis is advisory only and should not replace professional legal counsel. Always recommend consulting the legal team for critical decisions.",
        "temperature": 0.2,
    },
    {
        "name": "Onboarding Buddy",
        "slug": "onboarding-buddy",
        "description": "Helps new employees navigate the organization, tools, and processes.",
        "icon": "🎯",
        "category": "Human Resources",
        "system_prompt": "You are a friendly Onboarding Buddy for new employees. Help them understand the organization structure, tools, processes, and culture. Answer questions about getting started, setting up accounts, finding resources, and meeting team members. Be welcoming, patient, and encouraging.",
        "temperature": 0.5,
    },
    {
        "name": "Project Planner",
        "slug": "project-planner",
        "description": "Helps plan projects with timelines, milestones, resource allocation, and risk assessment.",
        "icon": "🗂️",
        "category": "Project Management",
        "system_prompt": "You are a Project Planning Assistant. Help create project plans with clear objectives, work breakdown structures, timelines, milestones, resource allocation, dependencies, and risk assessments. Use standard PM methodologies. Suggest tools and templates. Flag potential risks and suggest mitigations.",
        "temperature": 0.3,
    },
]


async def _seed_default_agents():
    """Seed default AI agents if none exist."""
    from sqlalchemy import select, func
    from app.database import async_session_factory
    from app.models.agent import Agent

    async with async_session_factory() as db:
        count = (await db.execute(
            select(func.count()).select_from(Agent).where(Agent.is_system == True)
        )).scalar() or 0

        if count > 0:
            return

        for agent_data in _DEFAULT_AGENTS:
            db.add(Agent(
                name=agent_data["name"],
                slug=agent_data["slug"],
                description=agent_data["description"],
                icon=agent_data["icon"],
                category=agent_data["category"],
                system_prompt=agent_data["system_prompt"],
                temperature=agent_data["temperature"],
                is_active=True,
                is_system=True,
                is_default=False,
            ))

        await db.commit()
        logger.info("Seeded %d default AI agents", len(_DEFAULT_AGENTS))


# ---- Default Skills ----
_DEFAULT_SKILLS = [
    {
        "name": "Email from Notes",
        "slug": "email-from-notes",
        "description": "Convert rough notes into a professional email",
        "icon": "✉️",
        "category": "Communication",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Convert these rough notes into a professional email. Notes: {input}\n\nWrite a clear, well-structured email with subject line, greeting, body, and closing.", "output_key": "email"}
        ],
        "input_schema": {"input": {"type": "text", "label": "Your rough notes"}},
        "output_format": "markdown",
    },
    {
        "name": "Meeting Minutes",
        "slug": "meeting-minutes",
        "description": "Transform meeting notes into structured minutes",
        "icon": "📋",
        "category": "Productivity",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Transform these meeting notes into structured meeting minutes with: Attendees, Agenda Items, Key Decisions, Action Items (with owners), and Next Steps.\n\nNotes: {input}", "output_key": "minutes"}
        ],
        "input_schema": {"input": {"type": "text", "label": "Meeting notes"}},
        "output_format": "markdown",
    },
    {
        "name": "Code Explainer",
        "slug": "code-explainer",
        "description": "Explain complex code in simple terms",
        "icon": "💡",
        "category": "Development",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Explain this code in simple terms. Break down what it does, how it works step by step, and key concepts used:\n\n```\n{input}\n```", "output_key": "explanation"}
        ],
        "input_schema": {"input": {"type": "text", "label": "Paste your code"}},
        "output_format": "markdown",
    },
    {
        "name": "SWOT Analysis",
        "slug": "swot-analysis",
        "description": "Generate a SWOT analysis for any topic",
        "icon": "📊",
        "category": "Analysis",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Create a comprehensive SWOT analysis for: {input}\n\nFormat as four sections: Strengths, Weaknesses, Opportunities, Threats. Include 4-6 points per section with brief explanations.", "output_key": "analysis"}
        ],
        "input_schema": {"input": {"type": "text", "label": "Topic or business to analyze"}},
        "output_format": "markdown",
    },
    {
        "name": "Bug Report Writer",
        "slug": "bug-report",
        "description": "Create a structured bug report from a description",
        "icon": "🐛",
        "category": "Development",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Create a structured bug report from this description: {input}\n\nInclude: Title, Severity, Steps to Reproduce, Expected Behavior, Actual Behavior, Environment, and Suggested Fix (if obvious).", "output_key": "report"}
        ],
        "input_schema": {"input": {"type": "text", "label": "Describe the bug"}},
        "output_format": "markdown",
    },
    {
        "name": "Text Summarizer",
        "slug": "text-summarizer",
        "description": "Summarize long text into key points",
        "icon": "📝",
        "category": "Productivity",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Summarize the following text into key points. Provide an executive summary (2-3 sentences) followed by bullet points of the main ideas:\n\n{input}", "output_key": "summary"}
        ],
        "input_schema": {"input": {"type": "text", "label": "Text to summarize"}},
        "output_format": "markdown",
    },
    {
        "name": "SQL Query Builder",
        "slug": "sql-builder",
        "description": "Generate SQL queries from natural language",
        "icon": "🗃️",
        "category": "Development",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Generate a SQL query for: {input}\n\nProvide the query with comments explaining each section. Include any necessary JOINs, WHERE clauses, and ORDER BY. Mention any assumptions about table structure.", "output_key": "query"}
        ],
        "input_schema": {"input": {"type": "text", "label": "Describe what data you need"}},
        "output_format": "markdown",
    },
    {
        "name": "Translate & Localize",
        "slug": "translate",
        "description": "Translate text between languages with context awareness",
        "icon": "🌐",
        "category": "Communication",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Translate the following text to {language}. Maintain tone and meaning. Adapt idioms and cultural references appropriately.\n\nText: {input}", "output_key": "translation"}
        ],
        "input_schema": {"input": {"type": "text", "label": "Text to translate"}, "language": {"type": "text", "label": "Target language"}},
        "output_format": "markdown",
    },
    {
        "name": "Risk Assessment",
        "slug": "risk-assessment",
        "description": "Assess risks for a project or decision",
        "icon": "⚠️",
        "category": "Analysis",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Perform a risk assessment for: {input}\n\nFor each risk identified, provide: Risk Description, Likelihood (High/Medium/Low), Impact (High/Medium/Low), Risk Score, and Mitigation Strategy. Format as a table.", "output_key": "assessment"}
        ],
        "input_schema": {"input": {"type": "text", "label": "Project or decision to assess"}},
        "output_format": "markdown",
    },
    {
        "name": "API Documentation",
        "slug": "api-docs",
        "description": "Generate API documentation from code or descriptions",
        "icon": "📚",
        "category": "Development",
        "skill_type": "prompt_chain",
        "steps": [
            {"prompt": "Generate comprehensive API documentation for: {input}\n\nInclude: Endpoint, Method, Description, Request Parameters, Request Body (with JSON example), Response (with JSON example), Error Codes, and Usage Example.", "output_key": "docs"}
        ],
        "input_schema": {"input": {"type": "text", "label": "API details or code"}},
        "output_format": "markdown",
    },
]


async def _seed_default_skills():
    """Seed default skills if none exist."""
    from sqlalchemy import select, func
    from app.database import async_session_factory
    from app.models.agent_skill import AgentSkill

    async with async_session_factory() as db:
        count = (await db.execute(
            select(func.count()).select_from(AgentSkill).where(AgentSkill.is_system == True)
        )).scalar() or 0

        if count > 0:
            return

        for skill_data in _DEFAULT_SKILLS:
            db.add(AgentSkill(
                name=skill_data["name"],
                slug=skill_data["slug"],
                description=skill_data["description"],
                icon=skill_data["icon"],
                category=skill_data["category"],
                skill_type=skill_data["skill_type"],
                steps=skill_data["steps"],
                input_schema=skill_data["input_schema"],
                output_format=skill_data["output_format"],
                is_active=True,
                is_system=True,
            ))

        await db.commit()
        logger.info("Seeded %d default skills", len(_DEFAULT_SKILLS))


# ---- Default Knowledge Bases ----
_DEFAULT_KNOWLEDGE_BASES = [
    {
        "name": "Company Policies & Handbook",
        "description": "Central repository for HR policies, employee handbook, workplace guidelines, code of conduct, and benefits documentation. Upload your organization's policy documents here.",
        "department": "Human Resources",
        "is_public": True,
        "chunk_size": 500,
        "chunk_overlap": 50,
    },
    {
        "name": "IT Documentation",
        "description": "Technical documentation, setup guides, troubleshooting runbooks, network diagrams, and standard operating procedures for IT infrastructure and software.",
        "department": "IT",
        "is_public": True,
        "chunk_size": 500,
        "chunk_overlap": 50,
    },
    {
        "name": "Onboarding & Training",
        "description": "New employee onboarding materials, training guides, tool setup instructions, organizational charts, and role-specific orientation documents.",
        "department": None,
        "is_public": True,
        "chunk_size": 400,
        "chunk_overlap": 50,
    },
    {
        "name": "Product & Engineering",
        "description": "Product specifications, architecture docs, API references, development standards, and engineering best practices. Upload ADRs, RFCs, and technical design documents.",
        "department": "Engineering",
        "is_public": False,
        "chunk_size": 600,
        "chunk_overlap": 75,
    },
    {
        "name": "Legal & Compliance",
        "description": "Regulatory compliance documents, data privacy policies, contract templates, audit procedures, and legal guidelines (GDPR, HIPAA, SOC 2, etc.).",
        "department": "Legal",
        "is_public": False,
        "chunk_size": 500,
        "chunk_overlap": 50,
    },
    {
        "name": "Sales & Marketing",
        "description": "Sales playbooks, marketing materials, brand guidelines, competitive analysis, case studies, and customer-facing presentation templates.",
        "department": "Sales",
        "is_public": False,
        "chunk_size": 400,
        "chunk_overlap": 50,
    },
    {
        "name": "Finance & Procurement",
        "description": "Financial policies, procurement procedures, expense guidelines, budget templates, vendor management docs, and approval workflows.",
        "department": "Finance",
        "is_public": False,
        "chunk_size": 500,
        "chunk_overlap": 50,
    },
    {
        "name": "Project Management",
        "description": "Project management templates, methodology guides (Agile, Scrum, Waterfall), status report formats, risk registers, and PM best practices.",
        "department": None,
        "is_public": True,
        "chunk_size": 400,
        "chunk_overlap": 50,
    },
]


async def _seed_default_knowledge_bases():
    """Seed default knowledge bases if none exist."""
    from sqlalchemy import select, func
    from app.database import async_session_factory
    from app.models.knowledge_base import KnowledgeBase

    async with async_session_factory() as db:
        count = (await db.execute(
            select(func.count()).select_from(KnowledgeBase)
        )).scalar() or 0

        if count > 0:
            return

        for kb_data in _DEFAULT_KNOWLEDGE_BASES:
            db.add(KnowledgeBase(
                name=kb_data["name"],
                description=kb_data["description"],
                department=kb_data["department"],
                is_public=kb_data["is_public"],
                chunk_size=kb_data["chunk_size"],
                chunk_overlap=kb_data["chunk_overlap"],
            ))

        await db.commit()
        logger.info("Seeded %d default knowledge bases", len(_DEFAULT_KNOWLEDGE_BASES))


@app.on_event("shutdown")
async def on_shutdown():
    from app.database import engine
    from app.services.llm_service import llm_service

    # Stop scheduler
    if settings.ENABLE_SCHEDULER:
        try:
            from app.services.scheduler_service import scheduler_service
            await scheduler_service.stop()
        except Exception:
            logger.exception("Error stopping scheduler")

    await llm_service.close()
    await engine.dispose()
    logger.info("Application shut down")
