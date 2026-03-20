# Production Deployment Guide

**Organization AI Assistant** — On-Premises Enterprise AI Chat Portal

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Requirements](#2-system-requirements)
3. [Pre-Deployment Checklist](#3-pre-deployment-checklist)
4. [Option A: Docker Compose Deployment](#4-option-a-docker-compose-deployment)
5. [Option B: Bare Metal / VM Deployment](#5-option-b-bare-metal--vm-deployment)
6. [Database Migrations](#6-database-migrations)
7. [HTTPS / TLS Configuration](#7-https--tls-configuration)
8. [Active Directory / LDAP Setup](#8-active-directory--ldap-setup)
9. [Ollama LLM Configuration](#9-ollama-llm-configuration)
10. [GPU Acceleration](#10-gpu-acceleration)
11. [Monitoring & Health Checks](#11-monitoring--health-checks)
12. [Backup & Recovery](#12-backup--recovery)
13. [Log Management](#13-log-management)
14. [Scaling Guide](#14-scaling-guide)
15. [Security Hardening](#15-security-hardening)
16. [Troubleshooting](#16-troubleshooting)
17. [Updating / Upgrading](#17-updating--upgrading)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Browser                          │
│                   (React SPA, port 443)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│               Nginx Reverse Proxy                           │
│         (Serves static frontend + proxies /api)             │
│                    Port 80 → 443                            │
└───────┬─────────────────────────────────┬───────────────────┘
        │ /api/*                          │ Static files
┌───────▼───────────┐           ┌─────────▼─────────────────┐
│  FastAPI Backend   │           │  React Frontend (dist/)   │
│  (Uvicorn, 8 wkrs)│           │  Pre-built static HTML/JS │
│  Port 8000         │           └───────────────────────────┘
└───┬───────────┬────┘
    │           │
┌───▼───┐  ┌───▼──────────┐
│ Postgres│  │ Ollama LLM   │
│   16   │  │ (localhost or │
│Port 5432│  │  Docker)      │
└────────┘  │ Port 11434    │
            └───────────────┘
```

**Services:**

| Service | Technology | Default Port | Purpose |
|---------|-----------|-------------|---------|
| Frontend | React 18.3 + TypeScript 5.5 + Vite 5.4 (built to static) | 80/443 | User interface (PWA) |
| Backend | Python 3.12, FastAPI 0.115, Uvicorn | 8000 | REST API (~119 endpoints), auth, chat, agents, RAG, scheduler |
| Database | PostgreSQL 16 (async SQLAlchemy 2.0) | 5432 | 24 tables across 9 Alembic migrations |
| LLM | Ollama | 11434 | Local AI model inference + embeddings |
| Proxy | Nginx | 80/443 | TLS termination, static serving, API proxy |

---

## 2. System Requirements

### Minimum (up to 20 concurrent users)

| Resource | Specification |
|----------|--------------|
| CPU | 8 cores |
| RAM | 16 GB |
| Storage | 100 GB SSD |
| GPU | Optional (CPU inference works, slower) |
| OS | Ubuntu 22.04 LTS / Windows Server 2022 / RHEL 9 |

### Recommended (200+ concurrent users)

| Resource | Specification |
|----------|--------------|
| CPU | 32 cores |
| RAM | 64 GB – 128 GB |
| Storage | 256 GB NVMe SSD |
| GPU | NVIDIA RTX 3090/4090 or A6000 (24GB+ VRAM) |
| OS | Ubuntu 22.04 LTS |
| Network | Gigabit LAN, accessible on corporate network |

### Software Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| Docker | 24+ | Container runtime |
| Docker Compose | v2+ | Service orchestration |
| Git | 2.30+ | Source checkout |
| OpenSSL | 1.1+ | TLS certificate generation |

For bare-metal deployment (no Docker):

| Software | Version |
|----------|---------|
| Python | 3.12+ |
| Node.js | 20 LTS |
| PostgreSQL | 16+ |
| Nginx | 1.24+ |
| Ollama | Latest |

---

## 3. Pre-Deployment Checklist

### 3.1 Generate Secrets

Run these commands on the deployment server and save the outputs:

```bash
# Generate SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# Generate SESSION_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# Generate DATABASE_PASSWORD
openssl rand -base64 32

# Generate LOCAL_ADMIN_PASSWORD
openssl rand -base64 24
```

### 3.2 Create Production .env File

```bash
# From the project root
cp backend/.env.production .env
```

Edit `.env` and fill in **all `[REQUIRED]` fields**:

| Variable | What to Set |
|----------|-------------|
| `SECRET_KEY` | Random 48-char token (generated above) |
| `SESSION_SECRET` | Random 48-char token (generated above) |
| `DATABASE_PASSWORD` | Strong random password (generated above) |
| `LOCAL_ADMIN_PASSWORD` | Strong admin password (generated above) |
| `CORS_ORIGINS` | `["https://ai.yourcompany.com"]` (your production URL) |
| `ALLOWED_HOSTS` | `["ai.yourcompany.com"]` |
| `APP_ENV` | `production` |

### 3.3 Verify Configuration

After setting your `.env`, verify no warnings appear:

```bash
cd backend
python3 -c "from app.config import settings; print('Config OK:', settings.APP_ENV)"
```

If you see warnings about weak passwords or missing secrets, fix them before proceeding.

---

## 4. Option A: Docker Compose Deployment

This is the **recommended** deployment method.

### 4.1 Clone & Configure

```bash
git clone <your-repo-url> /opt/organization-ai
cd /opt/organization-ai

# Create production .env
cp backend/.env.production .env
# Edit .env with your production values (see Section 3.2)
nano .env
```

### 4.2 Build & Start

```bash
# Build all images
docker compose build

# Start all services
docker compose up -d

# Verify all containers are running
docker compose ps
```

Expected output:

```
NAME               STATUS                   PORTS
org_ai_db          Up (healthy)             5432/tcp
org_ai_ollama      Up                       11434/tcp
org_ai_backend     Up                       8000/tcp
org_ai_frontend    Up                       80/tcp → 3005
```

### 4.3 Run Database Migrations

```bash
docker compose exec backend alembic upgrade head
```

### 4.4 Pull an LLM Model

```bash
docker compose exec ollama ollama pull llama3.1:8b
```

Wait for the download to complete. For the default recommended model (4.7 GB):

```bash
# Verify the model is available
docker compose exec ollama ollama list
```

### 4.5 Verify

```bash
# Health check
curl http://localhost:8000/api/health
# Expected: {"status":"ok","service":"Organization AI Assistant"}

# Frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:3005
# Expected: 200
```

### 4.6 Access the Portal

Open `http://<server-ip>:3005` in your browser.

Default login:
- **Username:** `admin`
- **Password:** (the `LOCAL_ADMIN_PASSWORD` you set in `.env`)

---

## 5. Option B: Bare Metal / VM Deployment

### 5.1 Install Dependencies

**Ubuntu 22.04:**

```bash
# System packages
sudo apt update && sudo apt install -y python3.12 python3.12-venv python3-pip \
  postgresql-16 nginx curl git build-essential libpq-dev

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Ollama
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows Server:**

1. Install Python 3.12 from [python.org](https://python.org)
2. Install PostgreSQL 16 from [postgresql.org](https://postgresql.org)
3. Install Node.js 20 LTS from [nodejs.org](https://nodejs.org)
4. Install Ollama from [ollama.com](https://ollama.com)

### 5.2 Set Up PostgreSQL

```bash
sudo -u postgres psql <<EOF
CREATE USER org_ai_user WITH PASSWORD 'YOUR_DB_PASSWORD_HERE';
CREATE DATABASE org_ai OWNER org_ai_user;
GRANT ALL PRIVILEGES ON DATABASE org_ai TO org_ai_user;
EOF
```

### 5.3 Set Up Backend

```bash
cd /opt/organization-ai/backend

# Create virtual environment
python3.12 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and edit production config
cp .env.production .env
nano .env
# Set DATABASE_HOST=localhost (not "db" since not using Docker)
# Set LLM_BASE_URL=http://localhost:11434

# Run migrations
alembic upgrade head

# Test startup
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# Should see: "Organization AI Assistant starting up (env=production)"
# Press Ctrl+C to stop
```

### 5.4 Set Up Frontend

```bash
cd /opt/organization-ai/frontend

npm install
npm run build
# Output goes to dist/
```

### 5.5 Create Systemd Service (Linux)

```bash
sudo tee /etc/systemd/system/org-ai-backend.service > /dev/null <<EOF
[Unit]
Description=Organization AI Backend
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/organization-ai/backend
Environment="PATH=/opt/organization-ai/backend/venv/bin"
EnvironmentFile=/opt/organization-ai/.env
ExecStart=/opt/organization-ai/backend/venv/bin/uvicorn app.main:app \
  --host 127.0.0.1 --port 8000 --workers 8
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable org-ai-backend
sudo systemctl start org-ai-backend
sudo systemctl status org-ai-backend
```

### 5.6 Create Ollama Service

Ollama installs its own systemd service by default. Verify:

```bash
sudo systemctl enable ollama
sudo systemctl start ollama
ollama pull llama3.1:8b
```

### 5.7 Configure Nginx

See [Section 7: HTTPS / TLS Configuration](#7-https--tls-configuration).

---

## 6. Database Migrations

Migrations are managed by Alembic. There are 9 migrations:

| Migration | Purpose |
|-----------|---------|
| `001_initial_schema` | Users, Conversations, Messages, UserSettings, AuditLogs |
| `002_add_local_admin_columns` | password_hash, is_local_account on Users |
| `003_add_indexes_pinned_archived` | Performance indexes, pinned/archived columns, system_prompt |
| `004_add_file_uploads_table` | File attachment support |
| `005_add_search_vector_audit_retention` | Full-text search (TSVECTOR), audit log indexes |
| `006_add_features_tables` | Feedback, templates, tags, bookmarks, announcements, sharing tables |
| `007_add_token_blacklist` | Token blacklist table for JWT revocation |
| `008_add_missing_columns` | Additional columns for existing tables |
| `009_add_v2_tables` | AI agents, memories, skills, knowledge bases, documents, chunks, scheduled tasks, task executions, notifications |

### Run Migrations

**Docker:**

```bash
docker compose exec backend alembic upgrade head
```

**Bare metal:**

```bash
cd /opt/organization-ai/backend
source venv/bin/activate
alembic upgrade head
```

### Check Migration Status

```bash
alembic current   # Shows current revision
alembic history   # Shows all migrations
```

### Rollback (if needed)

```bash
alembic downgrade -1   # Roll back one migration
```

---

## 7. HTTPS / TLS Configuration

### 7.1 Obtain TLS Certificates

**Option A: Internal CA (Enterprise)**

Request a certificate from your IT team for your domain (e.g., `ai.yourcompany.com`). You'll receive:
- `cert.pem` — Server certificate (include intermediate chain)
- `key.pem` — Private key

**Option B: Self-Signed (Testing only)**

```bash
sudo mkdir -p /etc/ssl/org-ai
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/org-ai/key.pem \
  -out /etc/ssl/org-ai/cert.pem \
  -subj "/CN=ai.yourcompany.com"
```

### 7.2 Nginx Configuration (Production)

Replace the default nginx config:

```bash
sudo tee /etc/nginx/sites-available/org-ai > /dev/null <<'EOF'
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name ai.yourcompany.com;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name ai.yourcompany.com;

    # TLS
    ssl_certificate     /etc/ssl/org-ai/cert.pem;
    ssl_certificate_key /etc/ssl/org-ai/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers (backend adds its own, these are for static files)
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Frontend (static files)
    root /opt/organization-ai/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;

        # Cache static assets aggressively
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        # Required for streaming (SSE / NDJSON)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;

        # WebSocket support (if needed in future)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward real client info
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }

    # Request size limit (for file uploads)
    client_max_body_size 15M;
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/org-ai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 7.3 Docker HTTPS Setup

If using Docker, mount certificates into the frontend container. Replace `frontend/nginx.conf` with the HTTPS config above, and update `docker-compose.yml`:

```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - /etc/ssl/org-ai:/etc/ssl/org-ai:ro
```

---

## 8. Active Directory / LDAP Setup

### 8.1 Configuration

Set these values in your `.env`:

```bash
AD_ENABLED=true
AD_SERVER=ldap://your-domain-controller.yourcompany.com
AD_PORT=389                          # or 636 for LDAPS
AD_USE_SSL=false                     # set true for LDAPS
AD_DOMAIN=YOURCOMPANY                # NetBIOS domain name
AD_BASE_DN=DC=yourcompany,DC=com
AD_USER_SEARCH_BASE=OU=Users,DC=yourcompany,DC=com
AD_GROUP_SEARCH_BASE=OU=Groups,DC=yourcompany,DC=com
AD_ADMIN_GROUP=CN=AI-Admins,OU=Groups,DC=yourcompany,DC=com
```

### 8.2 Service Account (Optional)

For environments requiring bind authentication:

```bash
AD_BIND_USER=svc_ai_reader@yourcompany.com
AD_BIND_PASSWORD=<your-service-account-password>
```

The service account only needs **read** access to the directory.

### 8.3 Admin Group

Create an AD group (e.g., `AI-Admins`) and add users who should have admin access to the portal. Set the full DN in `AD_ADMIN_GROUP`.

### 8.4 Test Connection

After deployment, go to **Admin Panel → Settings → Active Directory** and click **Test Connection** to verify LDAP connectivity.

### 8.5 Break-Glass Local Admin

The local admin account (`LOCAL_ADMIN_ENABLED=true`) works **regardless** of AD status. If AD goes down, you can still log in with the local admin credentials to manage the system.

### 8.6 Password Management

- **Local users** can change their own password from **Settings → Change Password**.
- **Admins** can reset any local user's password from **Admin Panel → Users → Reset Password**.
- **AD/LDAP users** manage passwords via Active Directory — the "Change Password" option is hidden for AD accounts.

---

## 9. Ollama LLM Configuration

### 9.1 Pull Models

```bash
# Recommended starter model (4.7 GB, good balance of speed & quality)
ollama pull llama3.1:8b

# Larger model (needs 48GB+ RAM or GPU with 24GB+ VRAM)
ollama pull llama3.3:70b

# Code-specialized model
ollama pull qwen2.5-coder:14b
```

### 9.2 Set Default Model

Via the Admin Panel → Models tab, or in `.env`:

```bash
LLM_DEFAULT_MODEL=llama3.1:8b
```

### 9.3 Performance Tuning

In the Ollama environment:

```bash
OLLAMA_NUM_PARALLEL=8     # Concurrent requests (set to CPU core count ÷ 2)
OLLAMA_MAX_QUEUE=128      # Queue depth
```

Docker users: These are already set in `docker-compose.yml`.

---

## 10. GPU Acceleration

### 10.1 NVIDIA GPU (Docker)

Uncomment the GPU section in `docker-compose.yml`:

```yaml
ollama:
  image: ollama/ollama:latest
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

Prerequisites:
- NVIDIA driver 525+ installed on host
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) installed

### 10.2 NVIDIA GPU (Bare Metal)

Ollama auto-detects NVIDIA GPUs. Just ensure CUDA drivers are installed:

```bash
# Verify GPU detection
nvidia-smi
ollama run llama3.1:8b "hello"  # Should show GPU usage in nvidia-smi
```

### 10.3 CPU-Only Performance

Without a GPU, expect:
- **8B model:** ~5-15 tokens/second (usable for small teams)
- **70B model:** ~0.5-2 tokens/second (not recommended without GPU)

---

## 11. Monitoring & Health Checks

### 11.1 Health Endpoint

```bash
# Backend health
curl https://ai.yourcompany.com/api/health
# Returns: {"status": "ok", "service": "Organization AI Assistant"}
```

### 11.2 Docker Health Monitoring

```bash
# Container status
docker compose ps

# Container logs (last 100 lines)
docker compose logs --tail=100 backend
docker compose logs --tail=100 db

# Resource usage
docker stats
```

### 11.3 Uptime Monitoring

Set up your monitoring tool (Nagios, Zabbix, Uptime Kuma, etc.) to poll:

| Check | URL | Expected |
|-------|-----|----------|
| Backend API | `GET /api/health` | HTTP 200, `{"status":"ok"}` |
| Frontend | `GET /` | HTTP 200 |
| DB Connection | PostgreSQL port 5432 | TCP connect |
| Ollama | `GET http://localhost:11434/api/tags` | HTTP 200 |

### 11.4 Admin Dashboard

The built-in Admin Panel provides real-time monitoring:
- System health (database, LLM service status)
- User activity metrics (active users, messages today)
- Audit logs (all login/logout/admin events)
- Database statistics (table sizes, row counts)
- Model management (installed models, pull/delete)
- Announcements management (create/toggle/delete MOTD banners)
- Prompt template library (create/edit/delete templates with categories)
- Feedback statistics (satisfaction rate, thumbs up/down counts, recent feedback)
- AI Agent management (CRUD, duplicate, toggle active/disabled)
- Knowledge Base / RAG (document upload, chunking, vector search, sync)
- Skills management (CRUD, execution stats, input schemas)
- Scheduled Tasks (CRUD, cron scheduling, run-now, execution history)
- Notification management

---

## 12. Backup & Recovery

### 12.1 Database Backup

**Automated daily backup (cron):**

```bash
sudo tee /etc/cron.daily/org-ai-backup > /dev/null <<'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/org-ai"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Docker:
docker compose -f /opt/organization-ai/docker-compose.yml \
  exec -T db pg_dump -U org_ai_user org_ai | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

# Bare metal:
# pg_dump -U org_ai_user org_ai | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

# Keep last 30 days
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +30 -delete

echo "$(date): Backup completed -> db_${TIMESTAMP}.sql.gz" >> "$BACKUP_DIR/backup.log"
EOF

sudo chmod +x /etc/cron.daily/org-ai-backup
```

**Windows (Task Scheduler):**

```powershell
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "C:\Backups\org-ai"
New-Item -ItemType Directory -Force -Path $backupDir
docker compose exec -T db pg_dump -U org_ai_user org_ai | Out-File "$backupDir\db_$timestamp.sql" -Encoding utf8
```

### 12.2 Built-in Export

The Admin Panel includes a **Database → Export** feature that exports all 24 tables as JSON. Use this for quick manual backups.

Users can also export all their conversations as a **ZIP archive** from **Settings → Bulk Export**. Each conversation is saved as an individual JSON or Markdown file inside the ZIP.

### 12.3 Restore from Backup

```bash
# Docker:
gunzip -c /opt/backups/org-ai/db_20260227.sql.gz | \
  docker compose exec -T db psql -U org_ai_user org_ai

# Bare metal:
gunzip -c /opt/backups/org-ai/db_20260227.sql.gz | psql -U org_ai_user org_ai
```

### 12.4 What to Back Up

| Item | Location | Frequency |
|------|----------|-----------|
| PostgreSQL database | `pg_dump` | Daily |
| `.env` file | `/opt/organization-ai/.env` | On every change |
| Ollama models | Docker volume `ollama_data` | Weekly |
| Application logs | `/opt/organization-ai/logs/` | As needed |

---

## 13. Log Management

### 13.1 Log Locations

| Service | Log Location |
|---------|-------------|
| Backend | `logs/app.log` + stdout |
| Nginx | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` |
| PostgreSQL | Docker logs or `/var/log/postgresql/` |
| Ollama | Docker logs or systemd journal |

### 13.2 Log Levels

Set in `.env`:

```bash
LOG_LEVEL=INFO      # Production (recommended)
LOG_LEVEL=WARNING   # Quiet mode (errors and warnings only)
LOG_LEVEL=DEBUG     # Troubleshooting only (very verbose)
```

### 13.3 Log Rotation

The application logs to `logs/app.log`. Set up logrotate:

```bash
sudo tee /etc/logrotate.d/org-ai > /dev/null <<EOF
/opt/organization-ai/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

### 13.4 Audit Logs

All user actions are logged to the `audit_logs` database table and viewable in **Admin Panel → Audit Logs**. Events include:
- User login / logout
- Conversation creation / deletion
- Admin setting changes
- Model management operations
- Skill executions
- Scheduled task executions
- Knowledge base operations

---

## 14. Scaling Guide

### 14.1 Capacity Planning

| Users | Backend Workers | DB Pool | RAM | Recommended Model |
|-------|----------------|---------|-----|-------------------|
| 1–20 | 4 | 10+5 | 16 GB | llama3.1:8b |
| 20–50 | 8 | 20+10 | 32 GB | llama3.1:8b |
| 50–100 | 8 | 20+10 | 64 GB | llama3.1:8b or :70b with GPU |
| 100+ | 16 (multiple instances) | 30+15 | 128 GB | llama3.3:70b with GPU |

### 14.2 Adjusting Workers

In `backend/Dockerfile`:

```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "8"]
```

Change `"8"` to match your CPU core count.

### 14.3 Adjusting Database Pool

In `.env`:

```bash
DATABASE_POOL_SIZE=20      # Base connections
DATABASE_MAX_OVERFLOW=10   # Burst capacity (total max = 30)
```

Rule of thumb: `pool_size` should equal the number of uvicorn workers × 2.

### 14.4 Ollama Parallelism

```bash
OLLAMA_NUM_PARALLEL=8   # Concurrent inference requests
```

Set to the number of CPU cores ÷ 2 (CPU) or number of models loaded (GPU).

---

## 15. Security Hardening

### 15.1 What's Already Built In

| Feature | Status |
|---------|--------|
| HSTS header (`max-age=31536000`) | Auto-enabled in production |
| Content Security Policy (CSP) | Strict `default-src 'self'` |
| X-Frame-Options: DENY | Prevents clickjacking |
| X-Content-Type-Options: nosniff | Prevents MIME sniffing |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| HttpOnly + Secure + SameSite cookies | Configurable per environment |
| bcrypt password hashing | 12 rounds (industry standard) |
| Constant-time password comparison | `secrets.compare_digest()` |
| SQL injection prevention | SQLAlchemy ORM parameterization |
| Error message sanitization | Stack traces never sent to client |
| Audit logging | All user/admin actions logged |
| Model name validation | Regex validation on all model operations |
| AD server info masking | Sensitive AD details hidden from admin API |
| Per-user data isolation | All queries scoped to authenticated user |

### 15.2 Production .env Security Settings

```bash
APP_ENV=production               # Disables Swagger docs, enables HSTS
SESSION_COOKIE_SECURE=true       # Cookies only sent over HTTPS
SESSION_COOKIE_SAMESITE=strict   # Prevents CSRF
```

### 15.3 Network Security

- **Firewall:** Only expose port 443 (HTTPS) externally. Keep 8000, 5432, 11434 on internal network only.
- **Docker:** In production, remove the `ports` mapping for `db` and `ollama` in `docker-compose.yml` — they only need to be reachable within the Docker network.

```yaml
# In docker-compose.yml, for production, remove these:
# db:
#   ports:
#     - "5432:5432"    # REMOVE — only backend needs access
# ollama:
#   ports:
#     - "11434:11434"  # REMOVE — only backend needs access
```

### 15.4 File Permissions

```bash
# .env contains secrets — restrict access
chmod 600 /opt/organization-ai/.env
chown root:www-data /opt/organization-ai/.env
```

---

## 16. Troubleshooting

### Backend won't start

```bash
# Check logs
docker compose logs backend --tail=50

# Common issues:
# - "DATABASE_PASSWORD must be set" → Set DATABASE_PASSWORD in .env
# - "Connection refused" on port 5432 → Database not ready yet, wait or check db service
# - "SECRET_KEY appears to use a default/weak value" → Generate a proper secret key
```

### Can't connect to the portal

```bash
# 1. Check if all services are running
docker compose ps

# 2. Check backend health
curl http://localhost:8000/api/health

# 3. Check Nginx config
sudo nginx -t

# 4. Check firewall
sudo ufw status
```

### CORS errors in browser

- Verify `CORS_ORIGINS` in `.env` matches your browser URL exactly (including protocol and port)
- Example: if accessing `https://ai.company.com`, set `CORS_ORIGINS=["https://ai.company.com"]`

### LLM responses are slow

```bash
# Check if GPU is being used
nvidia-smi

# Check Ollama logs
docker compose logs ollama --tail=20

# Check loaded models
curl http://localhost:11434/api/ps

# Try a smaller model
ollama pull llama3.2:3b
```

### Database migration fails

```bash
# Check current migration state
docker compose exec backend alembic current

# Check full history
docker compose exec backend alembic history

# If stuck, stamp to a known state and re-run
docker compose exec backend alembic stamp <revision_id>
docker compose exec backend alembic upgrade head
```

### AD/LDAP authentication fails

1. Go to **Admin Panel → Settings → AD/LDAP**
2. Verify all fields match your Active Directory configuration
3. Click **Test Connection**
4. Check backend logs for LDAP error details
5. Ensure the server can reach the AD domain controller on port 389/636

---

## 17. Updating / Upgrading

### 17.1 Standard Update

```bash
cd /opt/organization-ai

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose build
docker compose up -d

# Run any new migrations
docker compose exec backend alembic upgrade head
```

### 17.2 Zero-Downtime (Blue-Green)

For zero-downtime upgrades with a load balancer:

1. Build new containers with a tag: `docker compose build`
2. Start new containers alongside old ones on different ports
3. Run migrations: `alembic upgrade head` (migrations are backwards-compatible)
4. Switch load balancer to new containers
5. Stop old containers

### 17.3 Rollback

```bash
# If something goes wrong, revert to previous state:
git checkout <previous-commit>
docker compose build
docker compose up -d

# Rollback migrations if needed:
docker compose exec backend alembic downgrade -1
```

---

## Quick Start Summary

```bash
# 1. Clone
git clone <repo> /opt/organization-ai && cd /opt/organization-ai

# 2. Configure
cp backend/.env.production .env && nano .env   # Fill in all [REQUIRED] fields

# 3. Deploy
docker compose build && docker compose up -d

# 4. Migrate
docker compose exec backend alembic upgrade head

# 5. Pull model
docker compose exec ollama ollama pull llama3.1:8b

# 6. Access
# Open https://your-domain.com in browser
# Login with admin / <your LOCAL_ADMIN_PASSWORD>
```
