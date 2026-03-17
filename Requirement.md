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

Framework: React / Next.js (preferred) or Vue → **Implemented: React 18 + TypeScript + Vite**

Clean enterprise UI (similar to ChatGPT / Copilot)

Responsive but desktop-optimized

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

2️⃣ Backend API ✅

Framework: Node.js (Express / Fastify) OR Python (FastAPI) → **Implemented: Python 3.12 + FastAPI**

Responsibilities:

✅ Authentication via Active Directory

✅ Session management

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

✅ Models: LLaMA / Mistral / Mixtral / Phi / etc.

Requirements:

✅ No cloud inference

✅ Backend communicates with local model service only

✅ Support streaming responses

✅ Regenerate response support

5️⃣ Database Design ✅

Use PostgreSQL (preferred) for MVP. → **Implemented: PostgreSQL 16**

Strict schema separation:

Tables:

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

Rules:

✅ Every conversation linked to a single user_id

✅ Backend must enforce WHERE user_id = session.user_id

✅ No admin bypass except explicit admin panel

6️⃣ Data Privacy Controls ✅

Implement:

✅ User-scoped queries only
✅ No shared memory between users
✅ Optional encryption at rest
✅ Secure session tokens
✅ No chat leakage via caching
✅ Data retention enforcement (auto-cleanup)

7️⃣ Audit & Logging System ✅

Log events such as:

✅ login / logout

✅ conversation created

✅ prompt submitted

✅ model response generated

✅ errors / exceptions

✅ admin actions

Logs must include:

✅ timestamp

✅ user

✅ IP / device (optional)

✅ action type

✅ Request ID / correlation ID

8️⃣ Admin Panel (Restricted Access) ✅

Role-based access control.

Admins can:

✅ View system health

✅ Monitor usage metrics

✅ Manage model settings

✅ View audit logs

✅ Create & manage announcements

✅ Create & manage prompt templates

✅ View feedback statistics & satisfaction metrics

✅ Reset passwords for local user accounts

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

🔍 Search & Retrieval (Optional Advanced Phase)

✅ Per-user document upload

Local embeddings & vector DB (planned — RAG phase)

Retrieval-augmented generation (RAG) (planned)

✅ Documents visible only to owner

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

✅ XSS prevention

✅ Secure cookies

✅ Rate limiting

✅ Input validation

✅ No secrets in frontend

✅ Environment-based configuration

✅ Request ID / correlation tracing

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

✅ Chat workspace

✅ History sidebar (with tags & bookmarks)

✅ Settings (with usage dashboard & bulk export)

✅ Admin panel (with announcements, templates, feedback tabs)

✅ Bookmarks page

✅ Shared conversation view (public, read-only)

✅ Onboarding tour (first-time users)

❌ Explicit Non-Goals

No internet dependency

No external analytics

No SaaS components

No data sent outside organization

✅ Deliverables

Produce:

✅ Full project structure

✅ Backend API (FastAPI + 50+ endpoints)

✅ AD authentication module (LDAP/LDAPS)

✅ Database schema (12 tables, 6 Alembic migrations)

✅ Chat UI (React 18 + TypeScript + Vite)

✅ Local AI integration (Ollama)

✅ Logging & auditing (with Request ID correlation)

✅ Deployment guide (Docker + Bare Metal + Windows)

✅ Enterprise features (feedback, templates, tags, bookmarks, sharing, announcements, data retention, onboarding)

🧠 Engineering Quality Expectations

Code must be:

Modular

Well-commented

Configurable

Production-grade

Easily maintainable by IT team