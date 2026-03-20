# Organization AI — V2 Implementation Plan
## Enterprise AI Agents + OpenClaw-Inspired Intelligence Layer

> **Vision**: Transform Organization AI from a chat-with-AI tool into a **proactive, intelligent enterprise AI platform** — agents that know your organization, remember your context, evolve with usage, and act autonomously on schedules — all running 100% on-premise with zero external connections.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 1: Persistent AI Memory](#3-phase-1-persistent-ai-memory)
4. [Phase 2: Enterprise AI Agents](#4-phase-2-enterprise-ai-agents)
5. [Phase 3: Skills & Workflow Engine](#5-phase-3-skills--workflow-engine)
6. [Phase 4: Proactive Background Tasks](#6-phase-4-proactive-background-tasks)
7. [Phase 5: Knowledge Base & RAG](#7-phase-5-knowledge-base--rag)
8. [Phase 6: Internal Communication Hub](#8-phase-6-internal-communication-hub)
9. [Database Schema (Migrations 009–015)](#9-database-schema-migrations-009015)
10. [API Specification](#10-api-specification)
11. [Frontend Components](#11-frontend-components)
12. [Security Architecture](#12-security-architecture)
13. [Deployment & Scaling](#13-deployment--scaling)
14. [Implementation Timeline](#14-implementation-timeline)

---

## 1. Executive Summary

### What We Have (V1 — Completed)
| Area | Status | Details |
|------|--------|---------|
| Chat System | ✅ Complete | Streaming, attachments, search, bookmarks, feedback |
| Authentication | ✅ Complete | AD/LDAP + local admin, JWT with blacklist, brute-force protection |
| Admin Panel | ✅ Complete | Users, models, templates, announcements, audit logs, feedback stats |
| Security | ✅ Hardened | Rate limiting, SSRF protection, filename sanitization, CSP headers |
| Database | ✅ Optimized | 13 models, 8 migrations, full-text search with TSVECTOR |
| LLM Integration | ✅ Complete | Ollama with connection pooling, multi-model support |

### What V2 Adds (OpenClaw-Inspired)

| Feature | Enterprise Value | OpenClaw Inspiration |
|---------|-----------------|---------------------|
| **Persistent AI Memory** | AI remembers each user's role, preferences, past context | Per-user memory that evolves |
| **Enterprise AI Agents** | 10+ specialized agents (HR, IT, Legal, etc.) with domain knowledge | Personality + skills per agent |
| **Skills & Workflows** | Multi-step automated workflows that chain AI actions | Self-extending skill system |
| **Proactive Background Tasks** | Scheduled AI jobs (briefings, compliance checks, alerts) | Cron jobs, heartbeats, proactive check-ins |
| **Knowledge Base + RAG** | Department knowledge bases with local vector search | Persistent context, document processing |
| **Internal Communication Hub** | Self-hosted bot interfaces for internal messaging | Chat app integration (but on-prem only) |

### Non-Goals (Security Boundaries)
- ❌ No external chat apps (WhatsApp, Telegram, Discord) — data would leave the network
- ❌ No cloud-hosted skill marketplaces — untrusted code execution risk
- ❌ No browser automation on external sites — SSRF / data exfiltration risk
- ❌ No external embedding APIs — all vector operations local via Ollama
- ❌ No telemetry, analytics, or external connections of any kind

---

## 2. Architecture Overview

### System Architecture (V2)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORGANIZATION NETWORK (AIR-GAPPED)            │
│                                                                 │
│  ┌──────────────┐     ┌──────────────────────────────────────┐  │
│  │   Frontend    │     │            Backend (FastAPI)          │  │
│  │  React + TS   │────▶│                                      │  │
│  │  Vite + TW    │     │  ┌─────────┐  ┌──────────────────┐  │  │
│  │               │     │  │ Auth    │  │ Agent Router      │  │  │
│  │  Agent Picker │     │  │ Module  │  │                    │  │  │
│  │  Memory Panel │     │  └────┬────┘  │ ┌──────────────┐  │  │  │
│  │  Skills UI    │     │       │       │ │ HR Agent     │  │  │  │
│  │  Task Monitor │     │       │       │ │ IT Agent     │  │  │  │
│  └──────────────┘     │       │       │ │ Legal Agent  │  │  │  │
│                        │       │       │ │ Code Agent   │  │  │  │
│  ┌──────────────┐     │       │       │ │ Data Agent   │  │  │  │
│  │   Ollama      │     │       │       │ │ Doc Agent    │  │  │  │
│  │  (LLM Engine) │◀────│       │       │ │ Email Agent  │  │  │  │
│  │               │     │       │       │ │ Meeting Agent│  │  │  │
│  │  llama3       │     │       │       │ │ Compliance   │  │  │  │
│  │  mistral      │     │       │       │ │ Onboarding   │  │  │  │
│  │  nomic-embed  │     │       │       │ └──────────────┘  │  │  │
│  │  codellama    │     │       │       └──────────────────┘  │  │  │
│  └──────────────┘     │       │                              │  │  │
│                        │  ┌────▼──────────────────────────┐   │  │
│  ┌──────────────┐     │  │        Service Layer           │   │  │
│  │  PostgreSQL   │◀────│  │  Memory │ Skills │ Scheduler   │   │  │
│  │               │     │  │  RAG    │ Tasks  │ Knowledge   │   │  │
│  │  13+ Tables   │     │  └─────────────────────────────┘   │  │
│  │  Vector Store │     │                                      │  │
│  │  (pgvector)   │     └──────────────────────────────────────┘  │
│  └──────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Additions

| Component | Current V1 | V2 Addition | Purpose |
|-----------|-----------|-------------|---------|
| Vector DB | — | pgvector extension | Local embeddings for RAG |
| Embeddings | — | Ollama `nomic-embed-text` | Generate embeddings locally |
| Scheduler | — | APScheduler | Background task scheduling |
| Queue | — | asyncio.Queue + DB | Task queue for background jobs |
| Caching | — | Redis (optional) or in-memory | Agent memory hot cache |

---

## 3. Phase 1: Persistent AI Memory

### Concept
Every user interaction builds a persistent memory that the AI carries across conversations. The AI *remembers* who you are, what you work on, your preferences, and past decisions.

### Memory Architecture

```
┌─────────────────────────────────────────┐
│              Memory Scopes              │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────┐  Scope: User         │
│  │ User Memory   │  "Prefers tables"    │
│  │               │  "Works in Finance"  │
│  │ Auto-learned  │  "Uses Python"       │
│  │ + Explicit    │  "Reviews Q3 data"   │
│  └───────┬───────┘                      │
│          │                              │
│  ┌───────▼───────┐  Scope: Department   │
│  │ Dept Memory   │  "Finance team uses  │
│  │               │   SAP + Excel"       │
│  │ Shared within │  "Monthly close on   │
│  │ department    │   5th business day"  │
│  └───────┬───────┘                      │
│          │                              │
│  ┌───────▼───────┐  Scope: Organization │
│  │ Org Memory    │  "Company: Acme Inc" │
│  │               │  "Fiscal year: Apr"  │
│  │ Admin-managed │  "Office locations:  │
│  │ global facts  │   NY, London, HYD"   │
│  └───────────────┘                      │
└─────────────────────────────────────────┘
```

### Database Model: `ai_memory`

```python
class AIMemory(Base):
    __tablename__ = "ai_memories"
    
    id          = Column(UUID, primary_key=True, default=uuid4)
    user_id     = Column(UUID, ForeignKey("users.id"), nullable=True)   # NULL = org-level
    department  = Column(String(100), nullable=True)                     # NULL = user/org level
    scope       = Column(String(20), nullable=False)                     # 'user' | 'department' | 'organization'
    category    = Column(String(50), nullable=False)                     # 'preference', 'fact', 'context', 'skill'
    key         = Column(String(200), nullable=False)                    # Short identifier
    content     = Column(Text, nullable=False)                           # Memory content
    confidence  = Column(Float, default=1.0)                             # 0.0-1.0 (AI-set)
    source      = Column(String(20), default="auto")                     # 'auto' | 'explicit' | 'admin'
    access_count = Column(Integer, default=0)                            # Usage tracking
    last_accessed = Column(DateTime, nullable=True)
    expires_at  = Column(DateTime, nullable=True)                        # Optional TTL
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, onupdate=func.now())
    
    # Composite index for efficient scoped queries
    __table_args__ = (
        Index('idx_memory_user_scope', 'user_id', 'scope', 'category'),
        Index('idx_memory_dept', 'department', 'scope'),
        UniqueConstraint('user_id', 'scope', 'key', name='uq_memory_user_key'),
    )
```

### How Memory Works

#### Auto-Learning (Passive)
After each conversation, a lightweight extraction runs:
```python
async def extract_memories(user_id: UUID, messages: list[Message]) -> list[AIMemory]:
    """
    Post-conversation memory extraction.
    Uses Ollama to identify key facts from the conversation.
    """
    extraction_prompt = """
    Analyze this conversation and extract key facts about the user.
    Return JSON array of memories:
    - preferences (output format, communication style, tools used)
    - facts (role, department, projects, expertise)
    - context (what they're working on, recurring topics)
    
    Only extract HIGH-CONFIDENCE facts. Do not speculate.
    Format: [{"category": "...", "key": "...", "content": "...", "confidence": 0.0-1.0}]
    """
    # Run against Ollama locally
    result = await llm_service.generate(extraction_prompt + conversation_text)
    return parse_and_deduplicate(result, existing_memories)
```

#### Explicit Memory (Active)
Users can tell the AI to remember things:
- "Remember that I prefer bullet points over paragraphs"
- "My project deadline is March 30th"
- "I'm the finance lead for APAC region"

#### Memory Injection (At Chat Time)
```python
async def build_context_with_memory(user_id: UUID, agent_id: UUID, messages: list) -> str:
    """Build system prompt with relevant memories injected."""
    
    # 1. Get agent base prompt
    agent = await get_agent(agent_id)
    system_prompt = agent.system_prompt
    
    # 2. Retrieve relevant memories (user + dept + org)
    memories = await get_relevant_memories(user_id, query=messages[-1].content)
    
    # 3. Inject memory context
    if memories:
        memory_block = "\n".join([f"- {m.key}: {m.content}" for m in memories])
        system_prompt += f"\n\n## What you know about this user:\n{memory_block}"
    
    return system_prompt
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memory` | List user's memories (paginated, filterable) |
| POST | `/api/memory` | Manually add a memory |
| PUT | `/api/memory/{id}` | Edit a memory |
| DELETE | `/api/memory/{id}` | Delete a memory |
| GET | `/api/memory/stats` | Memory usage statistics |
| POST | `/api/admin/memory/organization` | Admin: set org-level memories |
| GET | `/api/admin/memory/department/{dept}` | Admin: view dept memories |

### Frontend: Memory Panel
- New sidebar tab: "AI Memory" — shows what the AI knows about you
- Categories with toggle: Preferences, Facts, Context
- Edit/delete any memory
- "Forget this" button on any memory entry
- Memory confidence indicator (color-coded)
- Admin view: Organization + Department memories management

---

## 4. Phase 2: Enterprise AI Agents

### Concept
Specialized AI personas with domain-specific knowledge, custom system prompts, tool access, and behavioral rules. Users select an agent based on their task — like choosing which department to ask.

### 10 Enterprise Agents

| # | Agent | Icon | Purpose | Default Model |
|---|-------|------|---------|---------------|
| 1 | **HR Policy Assistant** | 👥 | Leave policies, benefits, employee handbook Q&A | llama3 |
| 2 | **IT Helpdesk** | 🖥️ | Troubleshooting, software guides, password procedures | llama3 |
| 3 | **Code Review Assistant** | 🔍 | Code analysis, best practices, security review | codellama |
| 4 | **Document Writer** | 📝 | Reports, proposals, SOPs, memos, formal writing | llama3 |
| 5 | **Data Analyst** | 📊 | Data interpretation, SQL help, chart recommendations | llama3 |
| 6 | **Meeting Summarizer** | 🎯 | Meeting notes → structured summaries + action items | llama3 |
| 7 | **Email Composer** | ✉️ | Professional email drafting, tone adjustment | llama3 |
| 8 | **Compliance Reviewer** | ⚖️ | Policy compliance checks, regulatory guidance | llama3 |
| 9 | **Onboarding Buddy** | 🎓 | New employee orientation, company culture, FAQs | llama3 |
| 10 | **Project Planner** | 📋 | Task breakdown, timeline estimation, resource planning | llama3 |

### Database Model: `agents`

```python
class Agent(Base):
    __tablename__ = "agents"
    
    id              = Column(UUID, primary_key=True, default=uuid4)
    name            = Column(String(100), nullable=False)
    slug            = Column(String(50), unique=True, nullable=False)      # URL-friendly identifier
    description     = Column(Text, nullable=False)
    icon            = Column(String(10), default="🤖")                     # Emoji icon
    category        = Column(String(50), nullable=False)                   # 'general', 'technical', 'business', 'hr'
    system_prompt   = Column(Text, nullable=False)                         # Core personality + rules
    
    # Behavior Configuration
    temperature     = Column(Float, default=0.7)
    preferred_model = Column(String(100), nullable=True)                   # Override default model
    max_tokens      = Column(Integer, default=4096)
    
    # Access Control
    is_active       = Column(Boolean, default=True)
    is_default      = Column(Boolean, default=False)                       # One default agent
    is_system       = Column(Boolean, default=False)                       # Cannot be deleted
    allowed_roles   = Column(JSON, nullable=True)                          # null = everyone, ["admin", "hr"] = restricted
    allowed_departments = Column(JSON, nullable=True)                      # null = everyone
    
    # Knowledge Base Link
    knowledge_base_id = Column(UUID, ForeignKey("knowledge_bases.id"), nullable=True)
    
    # Metadata
    usage_count     = Column(Integer, default=0)
    created_by      = Column(UUID, ForeignKey("users.id"), nullable=True)  # null = system
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    # Relationships
    knowledge_base  = relationship("KnowledgeBase", back_populates="agents")
    skills          = relationship("AgentSkill", back_populates="agent", cascade="all, delete-orphan")
    conversations   = relationship("Conversation", back_populates="agent")
```

### Agent System Prompts (Examples)

#### HR Policy Assistant
```
You are the HR Policy Assistant for {organization_name}. 

ROLE:
- Answer questions about company policies, leave procedures, benefits, and employee handbook topics
- Guide employees through HR processes (leave requests, expense claims, grievance procedures)
- Provide accurate information based on the knowledge base

RULES:
- Always cite which policy document your answer comes from
- If unsure, say "I recommend checking with your HR representative for confirmation"
- Never make up policy details — only reference what's in your knowledge base
- Be empathetic and professional
- Do NOT provide legal advice — direct legal questions to the Legal team
- Respect confidentiality — never reference other employees' situations

RESPONSE FORMAT:
- Use clear headers for multi-part answers
- Include relevant policy section numbers when available
- End with "Need more help? Contact HR at [internal extension]" when appropriate
```

#### Code Review Assistant
```
You are the Code Review Assistant — a senior engineer who reviews code for quality, security, and best practices.

ROLE:
- Analyze code for bugs, security vulnerabilities, performance issues
- Suggest improvements following SOLID principles and clean code practices
- Check for common security issues (OWASP Top 10)
- Review architecture decisions

RULES:
- Rate severity: 🔴 Critical | 🟡 Warning | 🔵 Suggestion
- Always explain WHY something is an issue, not just WHAT
- Provide corrected code examples
- Consider the team's tech stack and conventions
- Be constructive, never dismissive

RESPONSE FORMAT:
## Summary
[Overall assessment]

## Findings
### 🔴 Critical Issues
### 🟡 Warnings  
### 🔵 Suggestions

## Corrected Code
[If applicable]
```

### Conversation ↔ Agent Linking

```python
# Updated Conversation model
class Conversation(Base):
    __tablename__ = "conversations"
    # ... existing fields ...
    agent_id = Column(UUID, ForeignKey("agents.id"), nullable=True)  # NULL = general chat
    agent = relationship("Agent", back_populates="conversations")
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List available agents (filtered by user's role/dept) |
| GET | `/api/agents/{slug}` | Get agent details |
| POST | `/api/admin/agents` | Admin: create agent |
| PUT | `/api/admin/agents/{id}` | Admin: update agent |
| DELETE | `/api/admin/agents/{id}` | Admin: delete agent (not system agents) |
| POST | `/api/admin/agents/{id}/duplicate` | Admin: clone an agent |
| GET | `/api/admin/agents/stats` | Admin: agent usage statistics |
| POST | `/api/chat/send` | Updated: accepts `agent_id` parameter |
| POST | `/api/chat/stream` | Updated: accepts `agent_id` parameter |

### Frontend: Agent Selector

```
┌──────────────────────────────────────────────────────────┐
│  Choose an Agent                                    ✕    │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │    👥      │  │    🖥️      │  │    🔍      │        │
│  │  HR Policy │  │ IT Helpdesk│  │ Code Review│        │
│  │  Assistant │  │            │  │  Assistant │        │
│  │            │  │ Troubleshoot│ │ Security + │        │
│  │ Policies,  │  │ guides,    │  │ quality    │        │
│  │ benefits   │  │ procedures │  │ analysis   │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │    📝      │  │    📊      │  │    🎯      │        │
│  │  Document  │  │    Data    │  │  Meeting   │        │
│  │   Writer   │  │  Analyst   │  │ Summarizer │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │    ✉️      │  │    ⚖️      │  │    🎓      │        │
│  │   Email    │  │ Compliance │  │ Onboarding │        │
│  │  Composer  │  │  Reviewer  │  │   Buddy    │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│                                                          │
│  ┌────────────┐                    [🤖 General Chat]    │
│  │    📋      │                    (no agent, free)     │
│  │  Project   │                                         │
│  │  Planner   │                                         │
│  └────────────┘                                         │
└──────────────────────────────────────────────────────────┘
```

**UI Behavior:**
- Agent selector appears on "New Conversation" or from header dropdown
- Selected agent shown as badge in conversation header
- Agent icon appears next to AI messages in that conversation
- User can switch agents mid-conversation (creates new context marker)
- General Chat option always available (no agent, current V1 behavior)

---

## 5. Phase 3: Skills & Workflow Engine

### Concept
Skills are reusable multi-step AI workflows that go beyond single prompts. Like macros powered by AI — an admin defines the steps, the AI executes them.

### Database Model: `agent_skills`

```python
class AgentSkill(Base):
    __tablename__ = "agent_skills"
    
    id              = Column(UUID, primary_key=True, default=uuid4)
    agent_id        = Column(UUID, ForeignKey("agents.id"), nullable=True)   # NULL = available to all
    name            = Column(String(100), nullable=False)
    slug            = Column(String(50), unique=True, nullable=False)
    description     = Column(Text, nullable=False)
    icon            = Column(String(10), default="⚡")
    category        = Column(String(50), default="general")
    
    # Skill Definition
    skill_type      = Column(String(20), nullable=False)                    # 'prompt_chain' | 'template' | 'extraction'
    steps           = Column(JSON, nullable=False)                           # Ordered list of steps
    input_schema    = Column(JSON, nullable=True)                            # Expected user inputs
    output_format   = Column(String(20), default="markdown")                # 'markdown' | 'json' | 'csv' | 'html'
    
    # Configuration
    is_active       = Column(Boolean, default=True)
    is_system       = Column(Boolean, default=False)
    requires_approval = Column(Boolean, default=False)                      # Admin must approve output
    
    # Metadata
    usage_count     = Column(Integer, default=0)
    avg_rating      = Column(Float, nullable=True)
    created_by      = Column(UUID, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    agent           = relationship("Agent", back_populates="skills")
```

### Skill Step Definition (JSON Schema)

```json
{
  "name": "Generate Monthly Compliance Report",
  "steps": [
    {
      "step": 1,
      "action": "query_conversations",
      "description": "Find all compliance-related conversations this month",
      "params": {
        "search_query": "compliance OR policy OR audit OR violation",
        "date_range": "last_30_days",
        "scope": "department"
      }
    },
    {
      "step": 2,
      "action": "llm_summarize",
      "description": "Summarize findings into structured report",
      "params": {
        "prompt": "Summarize these compliance-related conversations into a monthly report with: 1) Key Issues Raised, 2) Resolutions, 3) Pending Items, 4) Recommendations",
        "input_from": "step_1",
        "temperature": 0.3
      }
    },
    {
      "step": 3,
      "action": "format_output",
      "description": "Format as professional document",
      "params": {
        "template": "compliance_report",
        "format": "markdown",
        "include_metadata": true
      }
    }
  ]
}
```

### 15 Pre-Built Enterprise Skills

| # | Skill | Agent | Steps | Description |
|---|-------|-------|-------|-------------|
| 1 | Generate SOP | Document Writer | 3 | Input topic → research → structured SOP document |
| 2 | Code Security Audit | Code Review | 4 | Paste code → OWASP check → vulnerability report → fix suggestions |
| 3 | Meeting Minutes | Meeting Summarizer | 3 | Paste transcript → extract decisions + actions → formatted minutes |
| 4 | Email Draft Suite | Email Composer | 2 | Input context → generate formal/casual/follow-up variants |
| 5 | Data Report | Data Analyst | 3 | Paste data → analysis → narrative summary with recommendations |
| 6 | Policy Lookup | HR Policy | 2 | Query → search knowledge base → cited answer |
| 7 | Incident Response | IT Helpdesk | 4 | Describe issue → categorize → troubleshoot steps → escalation path |
| 8 | Compliance Check | Compliance | 3 | Input document/process → cross-check policies → gap analysis |
| 9 | Project Kickoff | Project Planner | 4 | Describe project → WBS → timeline → resource estimation |
| 10 | New Hire Checklist | Onboarding | 3 | Role input → customized 30/60/90 day plan → checklist |
| 11 | Risk Assessment | Compliance | 3 | Describe scenario → identify risks → mitigation strategies |
| 12 | Technical RFC | Code Review | 4 | Describe proposal → pros/cons → architecture → RFC document |
| 13 | Weekly Status Report | Project Planner | 3 | Input updates → structured report → highlights + blockers |
| 14 | Leave Calculator | HR Policy | 2 | Input dates → calculate business days → policy check |
| 15 | Training Plan | Onboarding | 3 | Skill gaps input → learning path → timeline → resources |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skills` | List available skills (filtered by user access) |
| GET | `/api/skills/{slug}` | Get skill details + input schema |
| POST | `/api/skills/{slug}/execute` | Execute a skill with inputs |
| GET | `/api/skills/{slug}/executions` | History of skill executions |
| POST | `/api/admin/skills` | Admin: create skill |
| PUT | `/api/admin/skills/{id}` | Admin: update skill |
| DELETE | `/api/admin/skills/{id}` | Admin: delete skill |
| GET | `/api/admin/skills/stats` | Admin: skill usage analytics |

---

## 6. Phase 4: Proactive Background Tasks

### Concept
AI doesn't just respond — it **acts proactively** on schedules. Daily briefings, compliance monitoring, document expiry alerts, all running as background jobs entirely on-premise.

### Database Model: `scheduled_tasks`

```python
class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"
    
    id              = Column(UUID, primary_key=True, default=uuid4)
    name            = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)
    task_type       = Column(String(30), nullable=False)
    # Types: 'daily_briefing', 'compliance_check', 'document_expiry', 
    #        'usage_report', 'memory_cleanup', 'knowledge_sync', 'custom'
    
    # Schedule (cron-style)
    cron_expression = Column(String(100), nullable=False)              # "0 8 * * 1-5" (weekdays 8am)
    timezone        = Column(String(50), default="UTC")
    
    # Configuration
    config          = Column(JSON, nullable=False, default={})          # Task-specific config
    agent_id        = Column(UUID, ForeignKey("agents.id"), nullable=True)
    target_users    = Column(JSON, nullable=True)                       # null = all, [user_ids] = specific
    target_departments = Column(JSON, nullable=True)
    
    # State
    is_active       = Column(Boolean, default=True)
    last_run_at     = Column(DateTime, nullable=True)
    last_status     = Column(String(20), nullable=True)                # 'success' | 'failed' | 'partial'
    last_error      = Column(Text, nullable=True)
    next_run_at     = Column(DateTime, nullable=True)
    run_count       = Column(Integer, default=0)
    
    # Audit
    created_by      = Column(UUID, ForeignKey("users.id"))
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())


class TaskExecution(Base):
    __tablename__ = "task_executions"
    
    id              = Column(UUID, primary_key=True, default=uuid4)
    task_id         = Column(UUID, ForeignKey("scheduled_tasks.id", ondelete="CASCADE"))
    status          = Column(String(20), nullable=False)               # 'running' | 'success' | 'failed'
    started_at      = Column(DateTime, server_default=func.now())
    completed_at    = Column(DateTime, nullable=True)
    duration_ms     = Column(Integer, nullable=True)
    result_summary  = Column(Text, nullable=True)
    error_message   = Column(Text, nullable=True)
    affected_users  = Column(Integer, default=0)
    
    task            = relationship("ScheduledTask")
```

### Pre-Built Scheduled Tasks

| Task | Schedule | Description |
|------|----------|-------------|
| **Daily Briefing** | Mon-Fri 8:00 AM | AI generates personalized summary of yesterday's activity per user |
| **Weekly Usage Report** | Monday 9:00 AM | Admin gets platform adoption metrics (active users, conversations, popular agents) |
| **Document Expiry Alert** | Daily 7:00 AM | Checks knowledge base for documents nearing review dates |
| **Compliance Digest** | Weekly Friday 4:00 PM | Summarizes all compliance-related queries and flags patterns |
| **Memory Consolidation** | Daily 2:00 AM | Merges short-term memories into long-term, prunes duplicates |
| **Stale Knowledge Check** | Monthly 1st | Flags knowledge base articles not updated in 90+ days |
| **User Onboarding Check** | Daily 10:00 AM | Identifies users who haven't completed onboarding tour |
| **Feedback Analysis** | Weekly Monday 8:00 AM | Analyzes negative feedback patterns, suggests improvements |

### Task Scheduler Service

```python
# backend/app/services/scheduler_service.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

class TaskSchedulerService:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        
    async def start(self):
        """Load active tasks from DB and schedule them."""
        async with get_session() as db:
            tasks = await db.execute(
                select(ScheduledTask).where(ScheduledTask.is_active == True)
            )
            for task in tasks.scalars():
                self._schedule_task(task)
        self.scheduler.start()
    
    def _schedule_task(self, task: ScheduledTask):
        """Register a task with APScheduler."""
        trigger = CronTrigger.from_crontab(task.cron_expression, timezone=task.timezone)
        self.scheduler.add_job(
            self._execute_task,
            trigger=trigger,
            id=str(task.id),
            args=[task.id],
            replace_existing=True
        )
    
    async def _execute_task(self, task_id: UUID):
        """Execute a scheduled task with full audit trail."""
        execution = TaskExecution(task_id=task_id, status="running")
        async with get_session() as db:
            db.add(execution)
            await db.commit()
            
            try:
                task = await db.get(ScheduledTask, task_id)
                handler = TASK_HANDLERS[task.task_type]
                result = await handler(task, db)
                
                execution.status = "success"
                execution.result_summary = result.summary
                execution.affected_users = result.affected_count
            except Exception as e:
                execution.status = "failed"
                execution.error_message = str(e)
                logger.error(f"Task {task_id} failed: {e}")
            finally:
                execution.completed_at = datetime.utcnow()
                execution.duration_ms = int((execution.completed_at - execution.started_at).total_seconds() * 1000)
                await db.commit()
```

### Notification Delivery (Internal Only)

Task results are delivered through **existing internal channels only**:
1. **Dashboard Notifications** — New bell icon in header with unread count
2. **Announcement System** — Reuse existing announcements for org-wide alerts
3. **Chat Message Injection** — Task results appear as a special system message in user's most recent conversation
4. **Admin Dashboard Widget** — Real-time task execution monitor

NO external notifications (email, SMS, push) — all stays within the platform.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | User's notifications (from background tasks) |
| PUT | `/api/notifications/{id}/read` | Mark notification as read |
| GET | `/api/admin/tasks` | List all scheduled tasks |
| POST | `/api/admin/tasks` | Create scheduled task |
| PUT | `/api/admin/tasks/{id}` | Update task configuration |
| DELETE | `/api/admin/tasks/{id}` | Delete task |
| POST | `/api/admin/tasks/{id}/run-now` | Manually trigger a task |
| GET | `/api/admin/tasks/{id}/executions` | Task execution history |
| GET | `/api/admin/tasks/dashboard` | Real-time task monitor |

---

## 7. Phase 5: Knowledge Base & RAG

### Concept
Department-specific knowledge bases that agents can search and cite. Uses local embeddings (Ollama) + pgvector for entirely on-premise Retrieval-Augmented Generation.

### Architecture

```
Document Upload → Text Extraction → Chunking → Local Embedding → pgvector Storage
                                                     │
User Query → Embed Query → Vector Similarity Search ──┘
                                │
                     Top K Chunks + Agent System Prompt → Ollama → Cited Response
```

### Database Models

```python
class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"
    
    id              = Column(UUID, primary_key=True, default=uuid4)
    name            = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)
    department      = Column(String(100), nullable=True)            # null = organization-wide
    
    # Access Control
    is_public       = Column(Boolean, default=False)                # Visible to all users
    allowed_roles   = Column(JSON, nullable=True)                   # null = department only
    
    # Configuration
    embedding_model = Column(String(100), default="nomic-embed-text")
    chunk_size      = Column(Integer, default=500)                  # characters per chunk
    chunk_overlap   = Column(Integer, default=50)
    
    # Metadata
    document_count  = Column(Integer, default=0)
    total_chunks    = Column(Integer, default=0)
    last_synced_at  = Column(DateTime, nullable=True)
    created_by      = Column(UUID, ForeignKey("users.id"))
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    documents       = relationship("KnowledgeDocument", back_populates="knowledge_base", cascade="all, delete-orphan")
    agents          = relationship("Agent", back_populates="knowledge_base")


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    
    id              = Column(UUID, primary_key=True, default=uuid4)
    knowledge_base_id = Column(UUID, ForeignKey("knowledge_bases.id", ondelete="CASCADE"))
    
    title           = Column(String(300), nullable=False)
    file_name       = Column(String(255), nullable=False)
    file_type       = Column(String(20), nullable=False)            # pdf, docx, txt, md, html
    file_size       = Column(Integer, nullable=False)
    file_hash       = Column(String(64), nullable=False)            # SHA-256 for dedup
    
    # Processing State
    status          = Column(String(20), default="pending")         # pending | processing | ready | failed
    chunk_count     = Column(Integer, default=0)
    error_message   = Column(Text, nullable=True)
    
    # Review Tracking
    review_date     = Column(DateTime, nullable=True)               # When to review this doc
    last_reviewed_by = Column(UUID, ForeignKey("users.id"), nullable=True)
    version         = Column(Integer, default=1)
    
    # Metadata
    uploaded_by     = Column(UUID, ForeignKey("users.id"))
    created_at      = Column(DateTime, server_default=func.now())
    updated_at      = Column(DateTime, onupdate=func.now())

    knowledge_base  = relationship("KnowledgeBase", back_populates="documents")
    chunks          = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    
    id              = Column(UUID, primary_key=True, default=uuid4)
    document_id     = Column(UUID, ForeignKey("knowledge_documents.id", ondelete="CASCADE"))
    
    content         = Column(Text, nullable=False)                   # Chunk text
    chunk_index     = Column(Integer, nullable=False)                # Position in document
    metadata        = Column(JSON, nullable=True)                    # section, page, heading
    
    # pgvector embedding (1536 dimensions for nomic-embed-text, or model-specific)
    embedding       = Column(Vector(768), nullable=False)            # nomic-embed-text = 768 dims
    
    created_at      = Column(DateTime, server_default=func.now())

    document        = relationship("KnowledgeDocument", back_populates="chunks")
    
    __table_args__ = (
        Index('idx_chunk_embedding', 'embedding', postgresql_using='ivfflat',
              postgresql_with={'lists': 100}, postgresql_ops={'embedding': 'vector_cosine_ops'}),
    )
```

### RAG Pipeline

```python
# backend/app/services/rag_service.py

class RAGService:
    """Retrieval-Augmented Generation — 100% local."""
    
    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding using Ollama locally."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.LLM_BASE_URL}/api/embeddings",
                json={"model": "nomic-embed-text", "prompt": text}
            )
            return response.json()["embedding"]
    
    async def ingest_document(self, doc: KnowledgeDocument, content: str):
        """Process document into embedded chunks."""
        # 1. Split into chunks
        chunks = self._chunk_text(content, size=doc.knowledge_base.chunk_size,
                                  overlap=doc.knowledge_base.chunk_overlap)
        
        # 2. Generate embeddings for each chunk (batched)
        for i, chunk_text in enumerate(chunks):
            embedding = await self.embed_text(chunk_text)
            chunk = DocumentChunk(
                document_id=doc.id,
                content=chunk_text,
                chunk_index=i,
                embedding=embedding
            )
            db.add(chunk)
        
        doc.status = "ready"
        doc.chunk_count = len(chunks)
        await db.commit()
    
    async def search(self, knowledge_base_id: UUID, query: str, top_k: int = 5) -> list[dict]:
        """Vector similarity search — purely local."""
        query_embedding = await self.embed_text(query)
        
        results = await db.execute(
            select(DocumentChunk, KnowledgeDocument)
            .join(KnowledgeDocument)
            .where(KnowledgeDocument.knowledge_base_id == knowledge_base_id)
            .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
            .limit(top_k)
        )
        
        return [
            {
                "content": chunk.content,
                "document": doc.title,
                "score": 1 - distance,  # Convert distance to similarity
                "metadata": chunk.metadata
            }
            for chunk, doc in results
        ]
    
    async def augmented_generate(self, agent: Agent, user_message: str, memories: list) -> str:
        """Full RAG pipeline: retrieve → augment → generate."""
        # 1. Search knowledge base
        context_chunks = []
        if agent.knowledge_base_id:
            context_chunks = await self.search(agent.knowledge_base_id, user_message)
        
        # 2. Build augmented prompt
        system_prompt = agent.system_prompt
        
        if context_chunks:
            context_block = "\n\n".join([
                f"[Source: {c['document']}]\n{c['content']}" 
                for c in context_chunks
            ])
            system_prompt += f"\n\n## Reference Documents:\n{context_block}\n\nCite your sources when using this information."
        
        if memories:
            memory_block = "\n".join([f"- {m.key}: {m.content}" for m in memories])
            system_prompt += f"\n\n## User Context:\n{memory_block}"
        
        # 3. Generate response via Ollama (local)
        return await llm_service.generate_stream(system_prompt, user_message)
```

### Supported Document Formats
(Reuse existing file extractors from V1)
| Format | Extractor |
|--------|-----------|
| PDF | pdfplumber |
| DOCX | python-docx |
| XLSX | openpyxl |
| PPTX | python-pptx |
| CSV | csv module |
| TXT/MD | Direct read |
| HTML | BeautifulSoup |
| JSON/XML | Structured parsers |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/knowledge-bases` | List all knowledge bases |
| POST | `/api/admin/knowledge-bases` | Create knowledge base |
| PUT | `/api/admin/knowledge-bases/{id}` | Update knowledge base |
| DELETE | `/api/admin/knowledge-bases/{id}` | Delete KB + all documents + chunks |
| POST | `/api/admin/knowledge-bases/{id}/documents` | Upload document(s) |
| DELETE | `/api/admin/knowledge-bases/{id}/documents/{doc_id}` | Remove document |
| POST | `/api/admin/knowledge-bases/{id}/sync` | Re-process all documents |
| GET | `/api/admin/knowledge-bases/{id}/search?q=` | Test search against KB |
| GET | `/api/admin/knowledge-bases/stats` | KB statistics (docs, chunks, storage) |

---

## 8. Phase 6: Internal Communication Hub

### Concept
Provide mobile/remote access to the AI platform through **self-hosted, internal-only** channels. No external services — everything stays on the organization network.

### Option A: Progressive Web App (PWA) — Recommended

Convert the existing React frontend into an installable PWA:
- Works on phones/tablets via internal WiFi or VPN
- Offline-capable (cached UI shell)
- Push notifications via Service Worker (internal only)
- Install as "app" on home screen
- Zero external dependencies

```json
// manifest.json additions
{
  "name": "Organization AI Assistant",
  "short_name": "OrgAI",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "theme_color": "#4F46E5",
  "background_color": "#0F172A",
  "icons": [...]
}
```

### Option B: Self-Hosted Matrix/Element Bridge (Advanced)

For organizations wanting a dedicated chat experience:
- Deploy **Synapse** (Matrix server) on internal network
- Connect via **Element** app (self-hosted)
- AI bot runs as a Matrix user
- End-to-end encrypted
- Works on any Matrix-compatible client

### Option C: Internal REST API for Custom Integrations

Expose a simple, documented API that internal tools can use:
```
POST /api/v2/external/chat
Authorization: Bearer <service-token>
Content-Type: application/json

{
  "service_id": "internal-ticketing-system",
  "user_id": "john.doe",
  "agent": "it-helpdesk",
  "message": "My VPN keeps disconnecting",
  "context": {"ticket_id": "INC-4521"}
}
```

This lets **internal systems** (ticketing, intranet, SharePoint workflows) call the AI without any external exposure.

---

## 9. Database Schema (Migrations 009–015)

### Migration Map

| Migration | Tables | Phase |
|-----------|--------|-------|
| **009** | `agents`, update `conversations` (add `agent_id` FK) | Phase 2: Agents |
| **010** | `ai_memories` | Phase 1: Memory |
| **011** | `agent_skills`, `skill_executions` | Phase 3: Skills |
| **012** | `scheduled_tasks`, `task_executions`, `notifications` | Phase 4: Background Tasks |
| **013** | Enable pgvector extension | Phase 5: RAG (prerequisite) |
| **014** | `knowledge_bases`, `knowledge_documents`, `document_chunks` | Phase 5: RAG |
| **015** | Seed default agents + skills + scheduled tasks | Phase 2+3+4: Seed data |

### Entity Relationship (V2 Additions)

```
agents (1:N conversations, 1:N skills, N:1 knowledge_base)
   │
   ├── conversations.agent_id (FK)
   ├── agent_skills.agent_id (FK)
   └── knowledge_bases.id (FK)

ai_memories (N:1 users)
   └── users.id (FK)

knowledge_bases (1:N documents, 1:N agents)
   └── knowledge_documents (1:N chunks)
       └── document_chunks (vector indexed)

scheduled_tasks (1:N executions)
   └── task_executions

notifications (N:1 users)
```

---

## 10. API Specification

### Complete V2 API Surface

**Existing V1 Endpoints (Unchanged):** 50+ endpoints across auth, chat, conversations, settings, templates, admin, feedback, bookmarks, tags, sharing, announcements.

**New V2 Endpoints:**

#### Agents (8 endpoints)
```
GET    /api/agents                          # List available agents
GET    /api/agents/{slug}                   # Agent details
POST   /api/admin/agents                    # Create agent
PUT    /api/admin/agents/{id}               # Update agent
DELETE /api/admin/agents/{id}               # Delete agent
POST   /api/admin/agents/{id}/duplicate     # Clone agent
GET    /api/admin/agents/stats              # Usage statistics
PATCH  /api/admin/agents/{id}/active        # Toggle active
```

#### Memory (7 endpoints)
```
GET    /api/memory                          # User's memories
POST   /api/memory                          # Add memory
PUT    /api/memory/{id}                     # Edit memory
DELETE /api/memory/{id}                     # Delete memory
GET    /api/memory/stats                    # Memory stats
POST   /api/admin/memory/organization       # Set org memory
GET    /api/admin/memory/department/{dept}   # View dept memory
```

#### Skills (8 endpoints)
```
GET    /api/skills                          # Available skills
GET    /api/skills/{slug}                   # Skill details
POST   /api/skills/{slug}/execute           # Execute skill
GET    /api/skills/executions               # Execution history
POST   /api/admin/skills                    # Create skill
PUT    /api/admin/skills/{id}               # Update skill
DELETE /api/admin/skills/{id}               # Delete skill
GET    /api/admin/skills/stats              # Usage analytics
```

#### Scheduled Tasks (8 endpoints)
```
GET    /api/notifications                   # User notifications
PUT    /api/notifications/{id}/read         # Mark read
GET    /api/admin/tasks                     # List tasks
POST   /api/admin/tasks                     # Create task
PUT    /api/admin/tasks/{id}                # Update task
DELETE /api/admin/tasks/{id}                # Delete task
POST   /api/admin/tasks/{id}/run-now        # Manual trigger
GET    /api/admin/tasks/{id}/executions     # History
```

#### Knowledge Base (9 endpoints)
```
GET    /api/admin/knowledge-bases           # List KBs
POST   /api/admin/knowledge-bases           # Create KB
PUT    /api/admin/knowledge-bases/{id}      # Update KB
DELETE /api/admin/knowledge-bases/{id}      # Delete KB
POST   /api/admin/knowledge-bases/{id}/documents    # Upload doc
DELETE /api/admin/knowledge-bases/{id}/documents/{d} # Remove doc
POST   /api/admin/knowledge-bases/{id}/sync          # Re-process
GET    /api/admin/knowledge-bases/{id}/search        # Test search
GET    /api/admin/knowledge-bases/stats              # Statistics
```

**V2 Total: ~90+ endpoints** (50 existing + 40 new)

### Updated Chat Endpoints (V2 Changes)

```python
# POST /api/chat/send — Updated schema
class ChatSendRequest(BaseModel):
    message: str
    conversation_id: Optional[UUID] = None
    agent_id: Optional[UUID] = None          # NEW: which agent to use
    skill_id: Optional[UUID] = None          # NEW: execute a skill
    model: Optional[str] = None
    
# POST /api/chat/stream — Updated schema  
class ChatStreamRequest(BaseModel):
    message: str
    conversation_id: Optional[UUID] = None
    agent_id: Optional[UUID] = None          # NEW
    model: Optional[str] = None
```

---

## 11. Frontend Components

### New Pages

| Page | Route | Description |
|------|-------|-------------|
| Agent Hub | `/agents` | Browse & select agents |
| Memory Panel | Sidebar tab | View/edit AI memories |
| Skills Library | `/skills` | Browse & execute skills |
| Knowledge Base | `/admin/knowledge` | Admin: manage KBs + documents |
| Task Monitor | `/admin/tasks` | Admin: scheduled tasks dashboard |

### Updated Components

```
src/
├── components/
│   ├── Agents/
│   │   ├── AgentSelector.tsx          # Grid of agent cards
│   │   ├── AgentCard.tsx              # Individual agent card (icon, name, description)
│   │   ├── AgentBadge.tsx             # Small pill showing active agent in header
│   │   └── AgentConfigForm.tsx        # Admin: create/edit agent form
│   │
│   ├── Memory/
│   │   ├── MemoryPanel.tsx            # Sidebar panel listing memories
│   │   ├── MemoryItem.tsx             # Individual memory with edit/delete
│   │   ├── MemoryCategory.tsx         # Collapsible category group
│   │   └── MemoryStats.tsx            # Memory usage overview
│   │
│   ├── Skills/
│   │   ├── SkillsLibrary.tsx          # Browse skills grid
│   │   ├── SkillCard.tsx              # Skill card with execute button
│   │   ├── SkillExecutor.tsx          # Form to provide inputs + run
│   │   ├── SkillResultView.tsx        # Display skill output
│   │   └── SkillConfigForm.tsx        # Admin: create/edit skill
│   │
│   ├── Knowledge/
│   │   ├── KnowledgeBaseList.tsx       # Admin: list of KBs
│   │   ├── KnowledgeBaseForm.tsx       # Admin: create/edit KB
│   │   ├── DocumentUploader.tsx        # Drag-drop document upload
│   │   ├── DocumentList.tsx            # List of docs in a KB
│   │   └── SearchPreview.tsx           # Test RAG search results
│   │
│   ├── Tasks/
│   │   ├── TaskDashboard.tsx           # Admin: task monitor
│   │   ├── TaskCard.tsx               # Individual task with status
│   │   ├── TaskConfigForm.tsx         # Admin: create/edit task
│   │   ├── ExecutionHistory.tsx        # Task execution log
│   │   └── CronBuilder.tsx            # Visual cron expression builder
│   │
│   ├── Notifications/
│   │   ├── NotificationBell.tsx        # Header bell icon + unread count
│   │   ├── NotificationPanel.tsx       # Dropdown list of notifications
│   │   └── NotificationItem.tsx        # Individual notification
│   │
│   └── Chat/
│       ├── ChatWindow.tsx              # UPDATED: agent context + memory injection
│       ├── ChatInput.tsx               # UPDATED: agent selector + skill trigger
│       └── MessageBubble.tsx           # UPDATED: agent icon + source citations
│
├── store/
│   ├── agentStore.ts                   # Agent state management
│   ├── memoryStore.ts                  # Memory state management
│   ├── skillStore.ts                   # Skills state management
│   ├── notificationStore.ts           # Notifications state management
│   └── knowledgeStore.ts              # Knowledge base state (admin)
│
└── types/
    ├── agent.ts                        # Agent interfaces
    ├── memory.ts                       # Memory interfaces
    ├── skill.ts                        # Skill interfaces
    ├── task.ts                         # Scheduled task interfaces
    ├── notification.ts                 # Notification interfaces
    └── knowledge.ts                    # Knowledge base interfaces
```

### UI Wireframe: Enhanced Chat Window

```
┌──────────────────────────────────────────────────────────────┐
│ 🔔(3) │ Organization AI          │  🤖 IT Helpdesk ▼  │ ⚙️ │
├──────────┬───────────────────────────────────────────────────┤
│ Sidebar  │                                                   │
│          │  ┌─────────────────────────────────────────────┐  │
│ 💬 Chats │  │ 🖥️ IT Helpdesk                              │  │
│ 🧠 Memory│  │                                             │  │
│ ⚡ Skills │  │ You: My VPN keeps disconnecting              │  │
│          │  │                                             │  │
│ ──────── │  │ 🖥️ IT Helpdesk:                              │  │
│ Recent:  │  │ Based on your setup (Windows 11, Cisco      │  │
│ ▸ VPN    │  │ AnyConnect), here are the steps:            │  │
│   issue  │  │                                             │  │
│ ▸ Code   │  │ 1. Check DNS settings [Source: IT-KB-042]   │  │
│   review │  │ 2. Reset VPN profile...                     │  │
│ ▸ Leave  │  │ 3. If persists, run diagnostics...          │  │
│   policy │  │                                             │  │
│          │  │ 📎 Sources: IT-KB-042, IT-SOP-015           │  │
│ ──────── │  │                                             │  │
│ Pinned:  │  │ 💡 I remember you had a similar issue last  │  │
│ ▸ ...    │  │   month — did the DNS fix work then?        │  │
│          │  │                                             │  │
│          │  └─────────────────────────────────────────────┘  │
│          │                                                   │
│          │  ┌─────────────────────────────────┐  ┌────────┐ │
│          │  │ Type a message...                │  │ Send ▶ │ │
│          │  │                     📎 ⚡Skills  │  └────────┘ │
│          │  └─────────────────────────────────┘              │
└──────────┴───────────────────────────────────────────────────┘
```

---

## 12. Security Architecture

### Security Principles (Unchanged from V1)

| Principle | Implementation |
|-----------|---------------|
| **Zero External Connections** | All AI inference via local Ollama, all embeddings via local Ollama, all data in local PostgreSQL |
| **Per-User Data Isolation** | Every query includes `WHERE user_id = session.user_id` — agents respect user scope |
| **No Cross-User Visibility** | User A's memories, conversations with Agent X are invisible to User B |
| **Audit Everything** | Agent usage, skill executions, knowledge base queries all logged to audit_logs |
| **Rate Limiting** | All new endpoints protected by existing rate limiter |
| **Input Validation** | All new schemas use Pydantic with strict validation |
| **Admin-Only operations** | Agent CRUD, KB management, task scheduling require admin role |

### New Security Considerations

| Risk | Mitigation |
|------|-----------|
| **Prompt Injection via Knowledge Base** | Sanitize uploaded documents, strip executable content, validate file types |
| **Memory Poisoning** | Max memories per user (500), auto-learned memories capped confidence, admin review for org memories |
| **Skill Code Injection** | Skills are declarative JSON only (no arbitrary code execution), admin-only creation |
| **Background Task Abuse** | Only admins can create scheduled tasks, execution capped at 10 min, rate-limited |
| **Vector DB Resource Exhaustion** | Per-KB document limits, chunk count caps, embedding queue with backpressure |
| **Agent System Prompt Injection** | Agent prompts stored server-side, user input never modifies system prompt directly |
| **Knowledge Base Data Leakage** | Department-scoped KBs enforce user's department at query time, not just at API level |

### Updated RBAC Matrix

| Action | Regular User | Admin |
|--------|-------------|-------|
| Use agents | ✅ (role/dept filtered) | ✅ (all) |
| View own memory | ✅ | ✅ |
| Edit own memory | ✅ | ✅ |
| View org memory | ✅ (read-only) | ✅ (read/write) |
| Execute skills | ✅ (allowed skills) | ✅ (all) |
| Create skills | ❌ | ✅ |
| View notifications | ✅ (own) | ✅ (all) |
| Manage scheduled tasks | ❌ | ✅ |
| Manage knowledge bases | ❌ | ✅ |
| Upload to knowledge base | ❌ (configurable per KB) | ✅ |
| CRUD agents | ❌ | ✅ |

---

## 13. Deployment & Scaling

### Minimum Requirements (V2)

| Resource | V1 Requirement | V2 Requirement | Notes |
|----------|---------------|----------------|-------|
| CPU | 4 cores | 8 cores | Background tasks + embedding generation |
| RAM | 16 GB | 32 GB | Ollama needs ~4GB per model, pgvector indexing |
| GPU | Optional | Recommended | Embedding generation 10x faster with GPU |
| Storage | 50 GB | 200 GB+ | Knowledge base documents + vector indices |
| PostgreSQL | 16+ | 16+ with pgvector | `CREATE EXTENSION vector;` |

### Docker Compose (V2 Additions)

```yaml
# docker-compose.v2.yml additions
services:
  backend:
    environment:
      - ENABLE_AGENTS=true
      - ENABLE_MEMORY=true
      - ENABLE_SKILLS=true
      - ENABLE_RAG=true
      - ENABLE_SCHEDULER=true
      - EMBEDDING_MODEL=nomic-embed-text
      - MAX_MEMORIES_PER_USER=500
      - MAX_KB_DOCUMENTS=1000
      - SCHEDULER_TIMEZONE=Asia/Kolkata
    
  postgres:
    image: pgvector/pgvector:pg16
    # Uses pgvector-enabled PostgreSQL image instead of vanilla postgres
    
  ollama:
    # Pull additional models
    volumes:
      - ollama_data:/root/.ollama
    # Pre-pull: llama3, codellama, nomic-embed-text
```

### Feature Flags

All V2 features are behind environment flags for gradual rollout:

```env
# V2 Feature Flags
ENABLE_AGENTS=true           # Agent system
ENABLE_MEMORY=true           # Persistent AI memory
ENABLE_SKILLS=true           # Skills & workflows
ENABLE_RAG=true              # Knowledge base + RAG
ENABLE_SCHEDULER=true        # Background tasks
ENABLE_NOTIFICATIONS=true    # Notification system
```

---

## 14. Implementation Timeline

### Phase Breakdown

```
PHASE 1: Persistent AI Memory                    ████████░░░░░░░░░░░░
├── Migration 010 (ai_memories table)
├── Memory service (extract, store, retrieve, inject)
├── Memory API (7 endpoints)
├── Memory frontend (panel, CRUD UI)
└── Integration with chat pipeline

PHASE 2: Enterprise AI Agents                     ░░░░████████░░░░░░░░
├── Migration 009 (agents table, conversation FK)
├── Agent service + 10 default agents
├── Agent API (8 endpoints)
├── Agent selector UI + conversation integration
├── Updated chat pipeline (agent context injection)
└── Admin: agent management panel

PHASE 3: Skills & Workflow Engine                 ░░░░░░░░████████░░░░
├── Migration 011 (agent_skills, skill_executions)
├── Skill execution engine
├── 15 pre-built skills
├── Skills API (8 endpoints)
├── Skills library UI + executor
└── Admin: skill management

PHASE 4: Proactive Background Tasks               ░░░░░░░░░░░░████░░░░
├── Migration 012 (scheduled_tasks, task_executions, notifications)
├── APScheduler integration
├── 8 pre-built tasks
├── Task API (8 endpoints) + Notification API (2)
├── Notification bell UI + task monitor
└── Admin: task dashboard

PHASE 5: Knowledge Base & RAG                     ░░░░░░░░░░░░░░░░████
├── Migration 013 (enable pgvector)
├── Migration 014 (knowledge_bases, documents, chunks)
├── Embedding service (Ollama nomic-embed-text)
├── RAG pipeline (ingest, chunk, embed, search, augment)
├── Knowledge API (9 endpoints)
├── Admin: KB management UI + document uploader
└── Integration with agents (cited responses)

PHASE 6: Communication Hub (Optional)             ░░░░░░░░░░░░░░░░░░░░
├── PWA manifest + service worker
├── OR Matrix/Element bridge
├── OR External API for internal systems
└── Mobile-responsive optimizations

SEED DATA (Migration 015)                         ────────────────────
├── 10 default enterprise agents
├── 15 pre-built skills
├── 8 default scheduled tasks
└── Sample org-level memories
```

### Dependency Graph

```
Phase 1 (Memory) ──────┐
                        ├──▶ Phase 2 (Agents) ──▶ Phase 3 (Skills)
                        │                              │
                        │                              ▼
                        └──────────────────────▶ Phase 4 (Tasks)
                                                       │
Phase 5 (RAG) ◀───── requires Phase 2 (Agents) ◀──────┘
                                                       
Phase 6 (Comms) ←── independent, can start anytime
```

### Files to Create/Modify

| Action | File | Phase |
|--------|------|-------|
| **CREATE** | `backend/app/models/agent.py` | 2 |
| **CREATE** | `backend/app/models/ai_memory.py` | 1 |
| **CREATE** | `backend/app/models/agent_skill.py` | 3 |
| **CREATE** | `backend/app/models/scheduled_task.py` | 4 |
| **CREATE** | `backend/app/models/knowledge_base.py` | 5 |
| **CREATE** | `backend/app/models/notification.py` | 4 |
| **CREATE** | `backend/app/api/agents.py` | 2 |
| **CREATE** | `backend/app/api/memory.py` | 1 |
| **CREATE** | `backend/app/api/skills.py` | 3 |
| **CREATE** | `backend/app/api/tasks.py` | 4 |
| **CREATE** | `backend/app/api/knowledge.py` | 5 |
| **CREATE** | `backend/app/api/notifications.py` | 4 |
| **CREATE** | `backend/app/services/memory_service.py` | 1 |
| **CREATE** | `backend/app/services/agent_service.py` | 2 |
| **CREATE** | `backend/app/services/skill_service.py` | 3 |
| **CREATE** | `backend/app/services/scheduler_service.py` | 4 |
| **CREATE** | `backend/app/services/rag_service.py` | 5 |
| **CREATE** | `backend/app/services/notification_service.py` | 4 |
| **MODIFY** | `backend/app/main.py` | All (add routers + startup) |
| **MODIFY** | `backend/app/models/__init__.py` | All (register models) |
| **MODIFY** | `backend/app/services/chat_service.py` | 1+2 (inject memory + agent) |
| **MODIFY** | `backend/app/services/llm_service.py` | 5 (add embedding method) |
| **MODIFY** | `backend/app/api/chat.py` | 2 (agent_id param) |
| **MODIFY** | `backend/app/config.py` | All (feature flags + new settings) |
| **CREATE** | 7 Alembic migrations (009–015) | All |
| **CREATE** | `frontend/src/components/Agents/*` (4 files) | 2 |
| **CREATE** | `frontend/src/components/Memory/*` (4 files) | 1 |
| **CREATE** | `frontend/src/components/Skills/*` (5 files) | 3 |
| **CREATE** | `frontend/src/components/Knowledge/*` (5 files) | 5 |
| **CREATE** | `frontend/src/components/Tasks/*` (5 files) | 4 |
| **CREATE** | `frontend/src/components/Notifications/*` (3 files) | 4 |
| **CREATE** | `frontend/src/store/agent|memory|skill|notification|knowledgeStore.ts` (5 files) | All |
| **CREATE** | `frontend/src/types/agent|memory|skill|task|notification|knowledge.ts` (6 files) | All |
| **MODIFY** | `frontend/src/App.tsx` | All (new routes) |
| **MODIFY** | `frontend/src/components/Layout/Sidebar.tsx` | 1+3 (memory + skills tabs) |
| **MODIFY** | `frontend/src/components/Layout/Header.tsx` | 2+4 (agent badge + notifications) |
| **MODIFY** | `frontend/src/components/Chat/ChatWindow.tsx` | 1+2 (memory + agent context) |
| **MODIFY** | `frontend/src/components/Chat/ChatInput.tsx` | 2+3 (agent selector + skill trigger) |
| **MODIFY** | `frontend/src/components/Chat/MessageBubble.tsx` | 2+5 (agent icon + citations) |

**Total: ~50 new files + ~15 modified files**

---

## Summary

| Metric | V1 (Current) | V2 (Planned) |
|--------|-------------|-------------- |
| API Endpoints | ~50 | ~90+ |
| Database Tables | 13 | 22+ |
| Alembic Migrations | 8 | 15 |
| Backend Files | ~30 | ~50 |
| Frontend Components | ~25 | ~50 |
| Zustand Stores | 7 | 12 |
| Default Agents | 0 | 10 |
| Pre-built Skills | 0 | 15 |
| Scheduled Tasks | 0 | 8 |
| Security Model | ✅ Hardened | ✅ Extended (agent RBAC, memory isolation, RAG sanitization) |
| External Connections | ❌ Zero | ❌ Zero (unchanged) |

> **This transforms Organization AI from a "ChatGPT clone" into a true enterprise AI platform — agents that know your business, remember your people, work proactively, and cite their sources — all running on YOUR hardware, YOUR network, YOUR rules.**
