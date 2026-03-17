# Organization AI Assistant

> **A self-hosted, enterprise-grade AI chat assistant for organizations.**  
> Runs 100% on-premises — no data ever leaves your network.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

### Core Platform
- **Private & Secure** — All AI inference runs locally via [Ollama](https://ollama.ai). Zero cloud dependency.
- **Active Directory / LDAP** — Authenticate users against your existing AD/LDAP directory.
- **Multi-Model Support** — Download, update, and delete AI models directly from the admin panel.
- **Admin Panel** — Manage users, models, settings, database, announcements, templates, and view audit logs / feedback from a web UI.
- **Streaming Responses** — Real-time token streaming with optimized rendering.
- **Full-Text Search** — PostgreSQL-powered search across all conversations and messages.
- **Custom System Prompts** — Per-user customizable AI behavior and preferences.
- **Dark / Light / System Theme** — User-selectable theme with system auto-detection.
- **Database Management** — Admin tools for export, import, schema inspection, and data maintenance.
- **One-Click Setup** — Automated setup scripts for Windows (`setup.ps1`) and Linux (`setup.sh`).
- **Scales to 200+ Users** — Configurable connection pools, worker counts, and GPU acceleration.
- **Hardware-Agnostic** — Works on CPU-only servers, GPU servers, or mixed environments.

### Enterprise Features (v2)
- **Response Feedback (👍/👎)** — Users can rate AI responses; admins view aggregated feedback stats and satisfaction metrics.
- **Prompt Templates / Library** — Admin-curated prompt templates with categories; users can browse and apply templates in chat.
- **Multi-File Attachments** — Upload multiple files (14+ formats: PDF, DOCX, XLSX, PPTX, CSV, etc.) in a single message.
- **Bulk Export All Chats** — Download all conversations as a ZIP archive from the settings page.
- **Data Retention Enforcement** — Automatic cleanup of old conversations based on admin-configured retention policies.
- **Admin Announcements / MOTD** — Admins create banner announcements displayed to all users; toggle active/inactive.
- **Regenerate Response** — Re-generate the last AI response with a single click.
- **Conversation Tags / Folders** — Create custom tags, assign them to conversations, and filter the sidebar by tag.
- **Keyboard Shortcuts Panel** — Quick-reference modal for all keyboard shortcuts accessible from the header.
- **User Usage Dashboard** — Personal stats: total conversations, messages, monthly activity, top model, uploads.
- **Request ID / Correlation** — Every API request gets a unique `X-Request-ID` header for tracing and debugging.
- **Read-Only Conversation Sharing** — Generate shareable links for conversations; accessible without authentication.
- **Onboarding / Welcome Tour** — Interactive first-time user onboarding walkthrough highlighting key features.
- **Message Bookmarks** — Bookmark important messages and access them from a dedicated bookmarks page.
- **Conversation Management** — Pin, archive (with dedicated archived view), export, rename, and delete conversations.
- **Admin Password Reset** — Admins can reset passwords for local user accounts from the user management panel.

---

## Quick Start

### Prerequisites

| Component    | Version  | Purpose              |
|-------------|----------|----------------------|
| Python      | 3.12+    | Backend runtime      |
| Node.js     | 20 LTS   | Frontend build       |
| PostgreSQL  | 16+      | Database             |
| Ollama      | Latest   | Local LLM runtime    |

### 1. Clone & Configure

```bash
git clone https://github.com/sagarsorathiya/Organization_AI.git
cd organization-ai
cp .env.example .env
# Edit .env — set DATABASE_PASSWORD, SECRET_KEY, SESSION_SECRET at minimum
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb -U postgres org_ai
psql -U postgres -c "CREATE USER org_ai_user WITH PASSWORD 'your_secure_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE org_ai TO org_ai_user;"
```

### 3. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux

pip install -r requirements.txt

# Set environment for dev (creates tables automatically)
set APP_ENV=development  # Windows
# export APP_ENV=development  # Linux

# Run migrations (production)
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Ollama (LLM)

```bash
# Install Ollama (https://ollama.ai)
ollama pull gemma3:4b     # Lightweight, great for most tasks
# Or: ollama pull llama3.1:8b  # Larger, more capable
ollama serve  # Runs on port 11434
```

### 6. Access

Open `http://localhost:3005` in your browser.

---

## Production Deployment

### Option A: Docker Compose (Recommended)

```bash
cp .env.example .env
# Configure .env for production

# CPU-only (works on any server)
docker compose up -d

# With NVIDIA GPU acceleration
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

### Option B: Manual Deployment

#### Backend

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 16
```

#### Frontend

```bash
cd frontend
npm install
npm run build
# Serve dist/ with Nginx or IIS
```

### Reverse Proxy

Copy `deployment/nginx.conf` and adjust:
- Server name to your internal domain
- SSL certificates from your internal CA
- Backend/frontend upstream addresses

---

## Active Directory Configuration

### LDAP Mode (Recommended)

```env
AD_ENABLED=true
AD_SERVER=ldap://dc01.corp.local
AD_PORT=389
AD_USE_SSL=false
AD_DOMAIN=CORP
AD_BASE_DN=DC=corp,DC=local
AD_USER_SEARCH_BASE=OU=Users,DC=corp,DC=local
AD_BIND_USER=CN=svc_ai,OU=ServiceAccounts,DC=corp,DC=local
AD_BIND_PASSWORD=<service_account_password>
AD_ADMIN_GROUP=CN=AI-Admins,OU=Groups,DC=corp,DC=local
```

### LDAPS (Encrypted)

```env
AD_SERVER=ldaps://dc01.corp.local
AD_PORT=636
AD_USE_SSL=true
```

### Development Mode (No AD)

```env
AD_ENABLED=false
```
Any username/password is accepted. User "admin" gets admin rights.

---

## Security Checklist

- [ ] Change `SECRET_KEY` and `SESSION_SECRET` to random 64-char strings
- [ ] Set `APP_ENV=production` (disables Swagger docs)
- [ ] Enable `SESSION_COOKIE_SECURE=true` (requires HTTPS)
- [ ] Configure AD bind account with minimal read-only permissions
- [ ] Set up SSL certificates from internal CA
- [ ] Configure firewall: block all outbound internet from the server
- [ ] Restrict database access to backend server only
- [ ] Set up log rotation for `logs/app.log`
- [ ] Review and adjust rate limiting settings
- [ ] Create AD security group for admin users

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Internal Network                 │
│                                                   │
│  ┌─────────┐   ┌──────────┐   ┌──────────────┐  │
│  │ Browser  │──▶│  Nginx   │──▶│   FastAPI     │  │
│  │ (React)  │   │ (Reverse │   │   Backend     │  │
│  └─────────┘   │  Proxy)  │   │              │  │
│                 └──────────┘   │  ┌──────────┐│  │
│                                │  │  Auth    ││  │
│  ┌──────────┐                 │  │  (LDAP)  ││  │
│  │ Active   │◀────────────────│  └──────────┘│  │
│  │Directory │                 │              │  │
│  └──────────┘                 │  ┌──────────┐│  │
│                                │  │  Chat    ││  │
│  ┌──────────┐                 │  │  Service  ││  │
│  │PostgreSQL│◀────────────────│  └──────────┘│  │
│  │ Database │                 │              │  │
│  └──────────┘                 │  ┌──────────┐│  │
│                                │  │  LLM     ││  │
│  ┌──────────┐                 │  │  Client   ││  │
│  │ Ollama   │◀────────────────│  └──────────┘│  │
│  │ (Local)  │                 └──────────────┘  │
│  └──────────┘                                    │
│                                                   │
│              ❌ No Internet Access                │
└──────────────────────────────────────────────────┘
```

## API Endpoints

### Authentication

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| POST   | /api/auth/login             | Authenticate via AD/local | Public   |
| POST   | /api/auth/logout            | Clear session            | Required |
| GET    | /api/auth/me                | Current user info        | Required |
| POST   | /api/auth/change-password   | Change password (local)  | Required |

### Chat

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| POST   | /api/chat                   | Send message (sync)      | Required |
| POST   | /api/chat/stream            | Send message (streaming) | Required |
| POST   | /api/chat/search            | Search messages          | Required |
| GET    | /api/chat/models            | List available models    | Required |
| GET    | /api/chat/attachments-enabled | Check attachment status | Required |
| POST   | /api/chat/upload            | Upload single file       | Required |
| POST   | /api/chat/upload-multiple   | Upload multiple files    | Required |
| POST   | /api/chat/regenerate        | Regenerate last response | Required |

### Conversations

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| GET    | /api/conversations          | List conversations       | Required |
| POST   | /api/conversations          | Create conversation      | Required |
| GET    | /api/conversations/:id      | Get with messages        | Required |
| PATCH  | /api/conversations/:id      | Rename                   | Required |
| DELETE | /api/conversations/:id      | Delete                   | Required |
| PATCH  | /api/conversations/:id/pin  | Pin/unpin conversation   | Required |
| PATCH  | /api/conversations/:id/archive | Archive conversation  | Required |
| GET    | /api/conversations/:id/export | Export conversation     | Required |
| GET    | /api/conversations/export-all | Bulk export all (ZIP)  | Required |

### Settings

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| GET    | /api/settings               | Get user settings        | Required |
| PATCH  | /api/settings               | Update user settings     | Required |
| GET    | /api/settings/stats         | User usage statistics    | Required |

### Feedback

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| POST   | /api/feedback               | Submit feedback (👍/👎)  | Required |
| DELETE | /api/feedback/:id           | Remove feedback          | Required |
| GET    | /api/feedback/message/:id   | Get feedback for message | Required |
| GET    | /api/feedback/conversation/:id | Get conversation feedback | Required |
| GET    | /api/feedback/stats         | Feedback statistics      | Admin    |

### Prompt Templates

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| GET    | /api/templates              | List all templates       | Required |
| GET    | /api/templates/categories   | List template categories | Required |
| POST   | /api/templates/use/:id      | Record template usage    | Required |
| POST   | /api/templates              | Create template          | Admin    |
| PATCH  | /api/templates/:id          | Update template          | Admin    |
| DELETE | /api/templates/:id          | Delete template          | Admin    |

### Tags

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| GET    | /api/tags                   | List user's tags         | Required |
| POST   | /api/tags                   | Create tag               | Required |
| DELETE | /api/tags/:id               | Delete tag               | Required |
| POST   | /api/tags/link              | Link tag to conversation | Required |
| DELETE | /api/tags/link              | Unlink tag               | Required |
| GET    | /api/tags/conversation/:id  | Tags for conversation    | Required |
| GET    | /api/tags/:id/conversations | Conversations for tag    | Required |

### Bookmarks

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| GET    | /api/bookmarks              | List bookmarks           | Required |
| POST   | /api/bookmarks              | Create bookmark          | Required |
| DELETE | /api/bookmarks/:id          | Delete bookmark          | Required |
| DELETE | /api/bookmarks/message/:id  | Remove by message ID     | Required |
| GET    | /api/bookmarks/check/:id    | Check if bookmarked      | Required |

### Announcements

| Method | Endpoint                       | Description              | Auth     |
|--------|--------------------------------|--------------------------|----------|
| GET    | /api/announcements             | Active announcements     | Required |
| GET    | /api/announcements/all         | All announcements        | Admin    |
| POST   | /api/announcements             | Create announcement      | Admin    |
| PATCH  | /api/announcements/:id/toggle  | Toggle active/inactive   | Admin    |
| DELETE | /api/announcements/:id         | Delete announcement      | Admin    |

### Sharing

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| POST   | /api/sharing/create         | Create shared link       | Required |
| GET    | /api/sharing/:token         | View shared conversation | Public   |
| DELETE | /api/sharing/:id            | Revoke shared link       | Required |
| GET    | /api/sharing/check/:id      | Check sharing status     | Required |

### Admin

| Method | Endpoint                       | Description              | Auth     |
|--------|--------------------------------|--------------------------|----------|
| GET    | /api/admin/health              | System health            | Admin    |
| GET    | /api/admin/metrics             | Usage metrics            | Admin    |
| GET    | /api/admin/settings            | Get system settings      | Admin    |
| PATCH  | /api/admin/settings            | Update system settings   | Admin    |
| POST   | /api/admin/test-ldap           | Test LDAP connection     | Admin    |
| GET    | /api/admin/users               | List users               | Admin    |
| POST   | /api/admin/users               | Create new user          | Admin    |
| PATCH  | /api/admin/users/:id           | Update user              | Admin    |
| GET    | /api/admin/audit-logs          | View audit logs          | Admin    |
| GET    | /api/admin/models              | List LLM models          | Admin    |
| POST   | /api/admin/models/pull         | Download model           | Admin    |
| DELETE | /api/admin/models/:name        | Delete model             | Admin    |
| POST   | /api/admin/models/set-default  | Set default model        | Admin    |
| GET    | /api/admin/database/info       | Database schema info     | Admin    |
| GET    | /api/admin/database/export     | Export data              | Admin    |
| POST   | /api/admin/database/import     | Import data              | Admin    |
| DELETE | /api/admin/database/clear/:table | Clear table data       | Admin    |
| DELETE | /api/admin/database/clear-all  | Clear all data           | Admin    |

---

## Scaling Guide

| Users   | CPU Cores | RAM    | GPU              | Model Recommendation | Key Settings |
|---------|-----------|--------|------------------|---------------------|-------------|
| 1–30    | 4+        | 16 GB  | Optional         | `gemma3:4b`         | `OLLAMA_NUM_PARALLEL=4`, pool=50 |
| 30–80   | 8+        | 32 GB  | 4+ GB VRAM       | `gemma3:4b`         | `OLLAMA_NUM_PARALLEL=8`, pool=50 |
| 80–200  | 16+       | 64 GB  | 8+ GB VRAM       | `llama3.1:8b`       | `OLLAMA_NUM_PARALLEL=12`, pool=100, workers=12 |
| 200+    | 32+       | 128 GB | 16+ GB VRAM      | `llama3.1:8b`       | `OLLAMA_NUM_PARALLEL=16`, pool=100, workers=16 |

See `.env.example` for all tuning parameters with inline documentation.

---

## Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Docker-based production deployment |
| [DEPLOYMENT_WITHOUT_DOCKER.md](DEPLOYMENT_WITHOUT_DOCKER.md) | Bare-metal / VM deployment |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Step-by-step server setup guide |
| [LAPTOP_TESTING_GUIDE.md](LAPTOP_TESTING_GUIDE.md) | Windows laptop testing walkthrough |
| [.env.example](.env.example) | All configuration options with documentation |
| [setup.ps1](setup.ps1) | One-click setup script for Windows |
| [setup.sh](setup.sh) | One-click setup script for Linux / macOS |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
