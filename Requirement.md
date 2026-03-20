📌 Project: Internal Private AI Assistant (On-Premise / Air-Gapped)
🎯 Objective

Design and build a fully internal AI assistant platform that runs entirely within the organization’s network with zero data transmission to external AI providers or cloud services.

The system must:

✅ Operate 100% offline / on-premise

✅ Authenticate users via Windows Active Directory (Domain Login / SSO)

✅ Provide strict per-user data isolation

✅ Prevent visibility of one user's conversations/data to others

✅ Maintain enterprise-grade security, auditing, and compliance

✅ Be production-ready, scalable, and maintainable
📊 Implementation Status

| Metric | Value |
|--------|-------|
| **Backend Framework** | Python 3.12 + FastAPI 0.115 |
| **Frontend Framework** | React 18.3 + TypeScript 5.5 + Vite 5.4 |
| **Database** | PostgreSQL 16 (async via SQLAlchemy 2.0 + asyncpg) |
| **AI Runtime** | Ollama (llama3.1:8b default, 27 models cataloged) |
| **API Endpoints** | ~119 across 17 route files |
| **Database Tables** | 24 across 9 Alembic migrations |
| **Backend Services** | 12 (6 V1 + 6 V2) |
| **Frontend Stores** | 11 (7 V1 + 4 V2) |
| **Admin Panel Tabs** | 13 in 3 groups |
| **V2 Feature Flags** | 6 (agents, memory, skills, RAG, scheduler, notifications) |
🔐 Core Security & Privacy Principles

No External Connectivity ✅

No API calls to OpenAI, Google, Anthropic, etc.

No telemetry, analytics, or external tracking

All AI inference performed locally

Per-User Data Isolation ✅

Users can only access their own chats/documents/history

No cross-user visibility

Enforced at API + database level

Enterprise Authentication ✅

Windows Domain Login (Kerberos / NTLM / LDAP / SAML)

True SSO experience inside domain

No separate credentials

Auditability ✅

Full activity logging

Admin-level audit trails

Compliance-friendly design

🏗️ High-Level Architecture

Build a modular enterprise web application with the following components:

1️⃣ Frontend ✅

Framework: React / Next.js (preferred) or Vue → **Implemented: React 18.3 + TypeScript 5.5 + Vite 5.4 + Tailwind CSS 3.4**

Clean enterprise UI (similar to ChatGPT / Copilot)

Responsive but desktop-optimized

✅ Progressive Web App (PWA) with service worker + offline cache

Features:

✅ Chat interface

✅ Conversation history

✅ Search within chats

✅ Dark/light mode

✅ User profile panel

✅ Response Feedback (👍/👎)

✅ Prompt Templates / Library

✅ Multi-file Attachments

✅ Conversation Tags / Folders (with sidebar filtering & tag assignment)

✅ Keyboard Shortcuts Panel

✅ User Usage Dashboard

✅ Onboarding / Welcome Tour

✅ Message Bookmarks

✅ Read-only Conversation Sharing

✅ Admin Announcements Banner

✅ AI Agent Selector (chat bar dropdown with per-conversation agent)

✅ Memory Panel (user preferences, facts, context, skills)

✅ Skills Panel (browse, execute, view results)

✅ Notification Bell (real-time badge, mark read)

2️⃣ Backend API ✅

Framework: Node.js (Express / Fastify) OR Python (FastAPI) → **Implemented: Python 3.12 + FastAPI 0.115**

Responsibilities:

✅ Authentication via Active Directory (LDAP/LDAPS)

✅ Session management (JWT + secure cookies)

✅ User isolation enforcement

✅ Chat processing pipeline

✅ Model inference orchestration

✅ Logging & audit system

✅ Feedback collection & statistics

✅ Prompt template management

✅ Tag & bookmark management

✅ Tag-based conversation filtering

✅ Announcement management

✅ Data retention enforcement

✅ Bulk export (ZIP)

✅ Request ID / correlation tracing

✅ Read-only conversation sharing

✅ AI Agent management (CRUD, duplicate, toggle, usage tracking)

✅ Memory service (user/department/organization scopes)

✅ Skill service (prompt chains, templates, extractions)

✅ RAG service (local embeddings, document chunking, vector search)

✅ Scheduler service (APScheduler, cron tasks, execution logs)

✅ Notification service (info/warning/task_result/alert types)

✅ Feature flag system (6 V2 toggles in config)

3️⃣ Authentication Layer (Critical) ✅

Integrate Windows Active Directory / Domain Login:

Supported mechanisms (choose appropriate):

✅ LDAP / LDAPS

Kerberos / Integrated Windows Authentication (planned)

SAML / ADFS (if present) (planned)

Requirements:

✅ No local password storage (AD users)

Automatic login when user is domain-joined (planned — requires Kerberos)

✅ Extract & store:

✅ username

✅ display name

✅ email

✅ department (optional)

✅ group memberships (optional)

4️⃣ AI Engine (Local Only) ✅

The AI must run locally inside infrastructure. → **Implemented: Ollama**

Possible implementations:

✅ Local LLM runtime (Ollama / llama.cpp / vLLM / LocalAI) → **Using Ollama**

✅ Models: LLaMA / Mistral / Mixtral / Phi / Gemma / Qwen / DeepSeek / CodeLlama + embedding models

✅ 27 popular models cataloged in admin panel with family, params, size, and description

Requirements:

✅ No cloud inference

✅ Backend communicates with local model service only

✅ Support streaming responses

✅ Regenerate response support

✅ Local embeddings via Ollama (nomic-embed-text, mxbai-embed-large)

5️⃣ Database Design ✅

Use PostgreSQL (preferred) for MVP. → **Implemented: PostgreSQL 16 (async via SQLAlchemy 2.0 + asyncpg)**

Strict schema separation:

**V1 Tables (14):**

✅ users

✅ conversations

✅ messages

✅ settings (user_settings)

✅ audit_logs

✅ file_uploads

✅ message_feedback

✅ prompt_templates

✅ conversation_tags / conversation_tag_links

✅ announcements

✅ shared_conversations

✅ message_bookmarks

✅ token_blacklist

**V2 Tables (10) — Migration 009:**

✅ knowledge_bases

✅ knowledge_documents

✅ document_chunks

✅ agents

✅ ai_memories

✅ agent_skills

✅ skill_executions

✅ scheduled_tasks

✅ task_executions

✅ notifications

Rules:

✅ Every conversation linked to a single user_id

✅ Backend must enforce WHERE user_id = session.user_id

✅ No admin bypass except explicit admin panel

6️⃣ Data Privacy Controls ✅

Implement:

✅ User-scoped queries only
✅ No shared memory between users (memory scoped per user/department/organization)
✅ Optional encryption at rest
✅ Secure session tokens
✅ No chat leakage via caching
✅ Data retention enforcement (auto-cleanup)
✅ Knowledge base department-level access control

7️⃣ Audit & Logging System ✅

Log events such as:

✅ login / logout

✅ conversation created

✅ prompt submitted

✅ model response generated

✅ errors / exceptions

✅ admin actions

✅ skill executions

✅ task executions

Logs must include:

✅ timestamp

✅ user

✅ IP / device (optional)

✅ action type

✅ Request ID / correlation ID

8️⃣ Admin Panel (Restricted Access) ✅

Role-based access control with `require_admin` middleware.

**13 tabs organized in 3 groups:**

System Group:
✅ Overview — system health, database, LLM status, uptime, metrics
✅ Settings — LDAP, security, model, retention, memory config
✅ Users — list, create, reset password, toggle admin
✅ Database — info, export, import, clear data
✅ Audit Logs — paginated table with filters

Content Group:
✅ Models — 27 popular models catalog, pull, set default, delete
✅ Announcements — create, toggle active, delete
✅ Templates — create, update, delete prompt templates
✅ Feedback — statistics, satisfaction metrics, recent feedback

AI & Automation Group (V2):
✅ AI Agents — CRUD, duplicate, toggle active, usage stats
✅ Knowledge Base — CRUD, document upload (13 formats), sync, vector search
✅ Skills — CRUD, execution stats, input schemas
✅ Scheduled Tasks — CRUD, cron scheduling, run-now, execution history

Admins can:

✅ View system health

✅ Monitor usage metrics

✅ Manage model settings

✅ View audit logs

✅ Create & manage announcements

✅ Create & manage prompt templates

✅ View feedback statistics & satisfaction metrics

✅ Reset passwords for local user accounts

✅ Manage AI agents, knowledge bases, skills, and scheduled tasks

✅ NOT read user conversations unless explicitly designed

🧩 Functional Features
💬 Chat System ✅

✅ Persistent chat history

✅ Rename/delete conversations

✅ Token streaming support

✅ Markdown rendering

✅ Multi-file attachments (14+ formats)

✅ File upload persistence (database records)

✅ Regenerate last AI response

✅ Response feedback (👍/👎)

✅ Message bookmarks

✅ Conversation tags / folders (with filtering)

✅ Archive / unarchive with dedicated archived view

✅ Read-only conversation sharing

✅ Per-conversation AI agent selection

🤖 AI Agents (V2) ✅

✅ Custom agent personas with system prompts

✅ Configurable temperature and preferred model per agent

✅ Category and icon customization

✅ Role/department-based access control

✅ Knowledge base linking per agent

✅ Agent usage tracking and statistics

✅ Agent duplication and toggle active/disabled

✅ System agents (non-deletable) vs custom agents

🧠 Memory System (V2) ✅

✅ 3 scopes: user, department, organization

✅ 4 categories: preference, fact, context, skill

✅ Confidence scoring per memory

✅ Auto-extraction option from conversations

✅ Memory expiration support

✅ Access tracking (last_accessed, access_count)

✅ Configurable max memories per user (default 500)

✅ Admin department/org memory management

⚡ Skills System (V2) ✅

✅ 3 skill types: prompt_chain, template, extraction

✅ Multi-step skill definitions

✅ Configurable input schemas per skill

✅ Execution tracking with duration and ratings

✅ Agent-skill linking

✅ Admin CRUD with execution statistics

✅ Category-grouped browsable skill list

📚 Knowledge Base / RAG (V2) ✅

✅ 100% local embeddings via Ollama (nomic-embed-text)

✅ Document upload (13 formats: pdf, docx, xlsx, pptx, txt, md, csv, html, json, xml, doc, xls, ppt)

✅ Configurable chunking (size, overlap)

✅ Vector similarity search

✅ Sync / re-embed all documents

✅ Department-scoped knowledge bases

✅ Public and private access levels

✅ Per-document status tracking (processing, ready, failed)

✅ File size limit enforcement and filename sanitization

⏱️ Background Tasks / Scheduler (V2) ✅

✅ Cron-based scheduling via APScheduler

✅ Timezone support per task

✅ Manual run-now trigger

✅ Execution logs with duration and status

✅ Task types: memory_cleanup, usage_report, stale_knowledge_check, custom

✅ Per-task asyncio.Lock concurrency guard

✅ Admin dashboard with task history

✅ Cron expression validation on create/update

🔔 Notifications (V2) ✅

✅ 4 notification types: info, warning, task_result, alert

✅ Mark read / mark all read

✅ Unread count badge in UI

✅ Real-time notification bell component

📱 Progressive Web App (V2) ✅

✅ Web app manifest (standalone display)

✅ Service worker with cache-first for static assets

✅ Network-first for API calls

✅ Offline fallback support

✅ Cache versioning (org-ai-v2)

🔍 Search & Retrieval ✅

✅ Per-user document upload

✅ Local embeddings & vector DB → **Implemented: Ollama nomic-embed-text + PostgreSQL document_chunks**

✅ Retrieval-augmented generation (RAG) → **Implemented: rag_service.py with vector search**

✅ Documents visible only to owner / department-scoped

⚙️ User Settings ✅

✅ Theme preferences

✅ Model selection (if multiple)

✅ Data retention controls

✅ Usage dashboard (stats & metrics)

✅ Bulk export all conversations (ZIP)

✅ Change password (local accounts)

✅ Prompt template library

✅ Keyboard shortcuts panel

✅ Onboarding / welcome tour

🛡️ Security Hardening Requirements ✅

✅ CSRF protection

✅ XSS prevention (HTML tag stripping in user inputs)

✅ Secure cookies

✅ Rate limiting

✅ Input validation (file size limits, filename sanitization, cron validation)

✅ No secrets in frontend

✅ Environment-based configuration

✅ Request ID / correlation tracing

✅ Admin route protection via require_admin middleware

🚀 Deployment Model ✅

Target environment:

✅ Internal network / intranet

✅ Windows domain-joined clients

✅ Reverse proxy support (Nginx / IIS)

✅ Docker optional but not required

Must support:

✅ Single server MVP

Multi-node scalable architecture later (planned)

🎨 UI / UX Expectations ✅

Design style:

✅ Clean enterprise interface

✅ Minimalistic & professional

✅ No flashy consumer visuals

✅ Fast & distraction-free

Key screens:

✅ Login / Auto SSO

✅ Chat workspace (with agent selector)

✅ History sidebar (with tags & bookmarks)

✅ Settings (with usage dashboard & bulk export)

✅ Admin panel (13 tabs in 3 groups: System, Content, AI & Automation)

✅ Bookmarks page

✅ Shared conversation view (public, read-only)

✅ Onboarding tour (first-time users)

✅ Memory panel (sidebar)

✅ Skills panel (sidebar + admin)

✅ Notification bell (header)

❌ Explicit Non-Goals

No internet dependency

No external analytics

No SaaS components

No data sent outside organization

✅ Deliverables

Produce:

✅ Full project structure

✅ Backend API (FastAPI + ~119 endpoints across 17 route files)

✅ AD authentication module (LDAP/LDAPS)

✅ Database schema (24 tables, 9 Alembic migrations)

✅ Chat UI (React 18 + TypeScript + Vite + Tailwind CSS)

✅ Local AI integration (Ollama + local embeddings)

✅ Logging & auditing (with Request ID correlation)

✅ Deployment guide (Docker + Bare Metal + Windows)

✅ V1 enterprise features (feedback, templates, tags, bookmarks, sharing, announcements, data retention, onboarding)

✅ V2 AI features (agents, memory, skills, RAG/knowledge base, scheduler, notifications, PWA)

✅ 12 backend services (auth, chat, LLM, audit, user, AD + agent, memory, skill, RAG, scheduler, notification)

✅ 11 frontend stores (Zustand state management)

✅ 6 V2 feature flags for modular enablement

🧠 Engineering Quality Expectations

Code must be:

Modular

Well-commented

Configurable

Production-grade

Easily maintainable by IT team