📌 Project: Internal Private AI Assistant (On-Premise / Air-Gapped)
🎯 Objective

Design and build a fully internal AI assistant platform that runs entirely within the organization’s network with zero data transmission to external AI providers or cloud services.

The system must:

Operate 100% offline / on-premise

Authenticate users via Windows Active Directory (Domain Login / SSO)

Provide strict per-user data isolation

Prevent visibility of one user’s conversations/data to others

Maintain enterprise-grade security, auditing, and compliance

Be production-ready, scalable, and maintainable

🔐 Core Security & Privacy Principles

No External Connectivity

No API calls to OpenAI, Google, Anthropic, etc.

No telemetry, analytics, or external tracking

All AI inference performed locally

Per-User Data Isolation

Users can only access their own chats/documents/history

No cross-user visibility

Enforced at API + database level

Enterprise Authentication

Windows Domain Login (Kerberos / NTLM / LDAP / SAML)

True SSO experience inside domain

No separate credentials

Auditability

Full activity logging

Admin-level audit trails

Compliance-friendly design

🏗️ High-Level Architecture

Build a modular enterprise web application with the following components:

1️⃣ Frontend

Framework: React / Next.js (preferred) or Vue

Clean enterprise UI (similar to ChatGPT / Copilot)

Responsive but desktop-optimized

Features:

Chat interface

Conversation history

Search within chats

Dark/light mode

User profile panel

2️⃣ Backend API

Framework: Node.js (Express / Fastify) OR Python (FastAPI)

Responsibilities:

Authentication via Active Directory

Session management

User isolation enforcement

Chat processing pipeline

Model inference orchestration

Logging & audit system

3️⃣ Authentication Layer (Critical)

Integrate Windows Active Directory / Domain Login:

Supported mechanisms (choose appropriate):

LDAP / LDAPS

Kerberos / Integrated Windows Authentication

SAML / ADFS (if present)

Requirements:

No local password storage

Automatic login when user is domain-joined

Extract & store:

username

display name

email

department (optional)

group memberships (optional)

4️⃣ AI Engine (Local Only)

The AI must run locally inside infrastructure.

Possible implementations:

Local LLM runtime (Ollama / llama.cpp / vLLM / LocalAI)

Models: LLaMA / Mistral / Mixtral / Phi / etc.

Requirements:

No cloud inference

Backend communicates with local model service only

Support streaming responses

5️⃣ Database Design

Use PostgreSQL (preferred) for MVP.

Strict schema separation:

Tables:

users

conversations

messages

settings

audit_logs

Rules:

Every conversation linked to a single user_id

Backend must enforce WHERE user_id = session.user_id

No admin bypass except explicit admin panel

6️⃣ Data Privacy Controls

Implement:

✔ User-scoped queries only
✔ No shared memory between users
✔ Optional encryption at rest
✔ Secure session tokens
✔ No chat leakage via caching

7️⃣ Audit & Logging System

Log events such as:

login / logout

conversation created

prompt submitted

model response generated

errors / exceptions

admin actions

Logs must include:

timestamp

user

IP / device (optional)

action type

8️⃣ Admin Panel (Restricted Access)

Role-based access control.

Admins can:

View system health

Monitor usage metrics

Manage model settings

View audit logs

NOT read user conversations unless explicitly designed

🧩 Functional Features
💬 Chat System

Persistent chat history

Rename/delete conversations

Token streaming support

Markdown rendering

🔍 Search & Retrieval (Optional Advanced Phase)

Per-user document upload

Local embeddings & vector DB

Retrieval-augmented generation (RAG)

Documents visible only to owner

⚙️ User Settings

Theme preferences

Model selection (if multiple)

Data retention controls

🛡️ Security Hardening Requirements

CSRF protection

XSS prevention

Secure cookies

Rate limiting

Input validation

No secrets in frontend

Environment-based configuration

🚀 Deployment Model

Target environment:

Internal network / intranet

Windows domain-joined clients

Reverse proxy support (Nginx / IIS)

Docker optional but not required

Must support:

Single server MVP

Multi-node scalable architecture later

🎨 UI / UX Expectations

Design style:

Clean enterprise interface

Minimalistic & professional

No flashy consumer visuals

Fast & distraction-free

Key screens:

Login / Auto SSO

Chat workspace

History sidebar

Settings

Admin panel

❌ Explicit Non-Goals

No internet dependency

No external analytics

No SaaS components

No data sent outside organization

✅ Deliverables

Produce:

Full project structure

Backend API

AD authentication module

Database schema

Chat UI

Local AI integration

Logging & auditing

Deployment guide

🧠 Engineering Quality Expectations

Code must be:

Modular

Well-commented

Configurable

Production-grade

Easily maintainable by IT team