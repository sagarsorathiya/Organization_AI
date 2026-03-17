# Organization AI Assistant

> **A self-hosted, enterprise-grade AI chat assistant for organizations.**  
> Runs 100% on-premises — no data ever leaves your network.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- **Private & Secure** — All AI inference runs locally via [Ollama](https://ollama.ai). Zero cloud dependency.
- **Active Directory / LDAP** — Authenticate users against your existing AD/LDAP directory.
- **Multi-Model Support** — Download, update, and delete AI models directly from the admin panel.
- **Admin Panel** — Manage users, models, settings, database, and view audit logs from a web UI.
- **Streaming Responses** — Real-time token streaming with optimized rendering.
- **File Attachments** — Upload and reference 14+ file formats in chat (PDF, DOCX, XLSX, PPTX, CSV, etc.).
- **Full-Text Search** — PostgreSQL-powered search across all conversations and messages.
- **Conversation Management** — Pin, archive, export, rename, and delete conversations.
- **Custom System Prompts** — Per-user customizable AI behavior and preferences.
- **Dark / Light / System Theme** — User-selectable theme with system auto-detection.
- **Database Management** — Admin tools for export, import, schema inspection, and data maintenance.
- **One-Click Setup** — Automated setup scripts for Windows (`setup.ps1`) and Linux (`setup.sh`).
- **Scales to 200+ Users** — Configurable connection pools, worker counts, and GPU acceleration.
- **Hardware-Agnostic** — Works on CPU-only servers, GPU servers, or mixed environments.

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
| POST   | /api/chat/upload            | Upload file attachment   | Required |

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

### Settings

| Method | Endpoint                    | Description              | Auth     |
|--------|-----------------------------|--------------------------|----------|
| GET    | /api/settings               | Get user settings        | Required |
| PATCH  | /api/settings               | Update user settings     | Required |

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
