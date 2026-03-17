# Bare Metal Deployment Guide (Without Docker)

**Organization AI Assistant** — Direct Installation on Linux or Windows Server

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Requirements](#2-system-requirements)
3. [Deployment on Ubuntu / Linux](#3-deployment-on-ubuntu--linux)
   - [3.1 Install Prerequisites](#31-install-prerequisites)
   - [3.2 Install & Configure PostgreSQL](#32-install--configure-postgresql)
   - [3.3 Install & Configure Ollama](#33-install--configure-ollama)
   - [3.4 Deploy Backend (FastAPI)](#34-deploy-backend-fastapi)
   - [3.5 Build & Deploy Frontend (React)](#35-build--deploy-frontend-react)
   - [3.6 Configure Nginx (Reverse Proxy + HTTPS)](#36-configure-nginx-reverse-proxy--https)
   - [3.7 Create Systemd Services](#37-create-systemd-services)
   - [3.8 Firewall Configuration](#38-firewall-configuration)
   - [3.9 Verify Deployment](#39-verify-deployment)
4. [Deployment on Windows Server](#4-deployment-on-windows-server)
   - [4.1 Install Prerequisites](#41-install-prerequisites)
   - [4.2 Install & Configure PostgreSQL](#42-install--configure-postgresql)
   - [4.3 Install & Configure Ollama](#43-install--configure-ollama)
   - [4.4 Deploy Backend (FastAPI)](#44-deploy-backend-fastapi)
   - [4.5 Build & Deploy Frontend (React)](#45-build--deploy-frontend-react)
   - [4.6 Configure IIS Reverse Proxy](#46-configure-iis-reverse-proxy)
   - [4.7 Create Windows Services](#47-create-windows-services)
   - [4.8 Firewall Configuration](#48-firewall-configuration)
   - [4.9 Verify Deployment](#49-verify-deployment)
5. [Environment Configuration (.env)](#5-environment-configuration-env)
6. [Database Migrations (Alembic)](#6-database-migrations-alembic)
7. [Pull LLM Models](#7-pull-llm-models)
8. [HTTPS / TLS Certificates](#8-https--tls-certificates)
9. [Active Directory / LDAP Setup](#9-active-directory--ldap-setup)
10. [Backup & Recovery](#10-backup--recovery)
11. [Log Management](#11-log-management)
12. [Monitoring & Health Checks](#12-monitoring--health-checks)
13. [Performance Tuning](#13-performance-tuning)
14. [Security Hardening](#14-security-hardening)
15. [Updating / Upgrading](#15-updating--upgrading)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Overview

This guide covers deploying the Organization AI Assistant **without Docker** — directly on a Linux or Windows Server. All four services run natively:

| Service | Technology | Port | Process |
|---------|-----------|------|---------|
| **Backend** | Python 3.12, FastAPI, Uvicorn | 8000 | `uvicorn app.main:app` |
| **Frontend** | React 18 (pre-built static files) | — | Served by Nginx/IIS |
| **Database** | PostgreSQL 16 | 5432 | `postgresql` service |
| **LLM Engine** | Ollama | 11434 | `ollama serve` |
| **Reverse Proxy** | Nginx (Linux) / IIS (Windows) | 80/443 | Terminates TLS, serves frontend, proxies /api |

```
Browser ──HTTPS──▶ Nginx/IIS (443)
                      ├── Static files (frontend/dist/)
                      └── /api/* ──▶ Uvicorn (8000)
                                        ├── PostgreSQL (5432)
                                        └── Ollama (11434)
```

---

## 2. System Requirements

### Hardware

| Resource | Minimum (≤30 users) | Recommended (30–200+ users) |
|----------|---------------------|---------------------------|
| CPU | 8 cores | 16 cores |
| RAM | 16 GB | 32 GB (64 GB for 70B models) |
| Storage | 100 GB SSD | 256 GB NVMe SSD |
| GPU | Optional | NVIDIA RTX 3090/4090 (24GB VRAM) |
| Network | 100 Mbps LAN | Gigabit LAN |

### Software

| Software | Linux | Windows |
|----------|-------|---------|
| OS | Ubuntu 22.04 LTS / RHEL 9 | Windows Server 2019 / 2022 |
| Python | 3.12+ | 3.12+ |
| PostgreSQL | 16+ | 16+ |
| Node.js | 20 LTS | 20 LTS |
| Nginx / IIS | Nginx 1.24+ | IIS 10 with ARR + URL Rewrite |
| Ollama | Latest | Latest |
| Git | 2.30+ | 2.30+ |
| OpenSSL | 1.1+ | (bundled with Git for Windows) |

---

## 3. Deployment on Ubuntu / Linux

### 3.1 Install Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install build essentials
sudo apt install -y build-essential curl git wget software-properties-common

# Install Python 3.12
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-dev

# Verify
python3.12 --version
# Python 3.12.x

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version   # v20.x.x
npm --version    # 10.x.x

# Install Nginx
sudo apt install -y nginx

# Install PostgreSQL 16
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-16 postgresql-client-16 libpq-dev
```

### 3.2 Install & Configure PostgreSQL

```bash
# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<'SQL'
-- Create the application user
CREATE USER org_ai_user WITH PASSWORD 'YOUR_STRONG_DB_PASSWORD';

-- Create the database
CREATE DATABASE org_ai OWNER org_ai_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE org_ai TO org_ai_user;

-- Connect to the database and grant schema privileges
\c org_ai
GRANT ALL ON SCHEMA public TO org_ai_user;
SQL
```

**Verify connectivity:**

```bash
psql -h localhost -U org_ai_user -d org_ai -c "SELECT version();"
# Should show PostgreSQL 16.x
```

**Tune PostgreSQL** for production (edit `/etc/postgresql/16/main/postgresql.conf`):

```ini
# Memory (adjust based on available RAM)
shared_buffers = 4GB              # 25% of total RAM
effective_cache_size = 12GB       # 75% of total RAM  
work_mem = 64MB
maintenance_work_mem = 512MB

# Connections
max_connections = 100

# WAL
wal_buffers = 64MB
checkpoint_completion_target = 0.9

# Logging
log_min_duration_statement = 1000  # Log queries slower than 1s
```

Restart after changes:

```bash
sudo systemctl restart postgresql
```

### 3.3 Install & Configure Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version

# Start the service
sudo systemctl enable ollama
sudo systemctl start ollama
```

**Configure Ollama for concurrent requests** — edit the systemd override:

```bash
sudo systemctl edit ollama
```

Add:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_NUM_PARALLEL=8"
Environment="OLLAMA_MAX_QUEUE=1024"
```

Restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

**Pull a model:**

```bash
ollama pull llama3.1:8b
# Wait for download (~4.7 GB)

# Verify
ollama list
```

### 3.4 Deploy Backend (FastAPI)

```bash
# Create application directory
sudo mkdir -p /opt/organization-ai
sudo chown $USER:$USER /opt/organization-ai

# Clone or copy the project
git clone <your-repo-url> /opt/organization-ai
# OR copy the project files:
# cp -r /path/to/Organization_AI/* /opt/organization-ai/

cd /opt/organization-ai/backend

# Create Python virtual environment
python3.12 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

**Create production .env:**

```bash
cp .env.production .env
nano .env
```

**Critical settings for bare metal** (these differ from Docker):

```bash
# ---- MUST CHANGE for bare metal ----
DATABASE_HOST=localhost            # NOT "db" (Docker name)
LLM_BASE_URL=http://localhost:11434  # NOT "http://ollama:11434"

# ---- Fill these in ----
SECRET_KEY=<generated-secret>
SESSION_SECRET=<generated-secret>
DATABASE_PASSWORD=<your-db-password>
LOCAL_ADMIN_PASSWORD=<your-admin-password>
CORS_ORIGINS=["https://ai.yourcompany.com"]
ALLOWED_HOSTS=["ai.yourcompany.com"]
```

Generate secrets:

```bash
python3 -c "import secrets; print('SECRET_KEY:', secrets.token_urlsafe(48))"
python3 -c "import secrets; print('SESSION_SECRET:', secrets.token_urlsafe(48))"
```

**Run database migrations:**

```bash
cd /opt/organization-ai/backend
source venv/bin/activate
alembic upgrade head
```

**Test the backend:**

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
# Should see: "Organization AI Assistant starting up (env=production)"
# Test: curl http://localhost:8000/api/health
# Expected: {"status":"ok","service":"Organization AI Assistant"}
# Press Ctrl+C to stop
```

**Create logs directory:**

```bash
mkdir -p /opt/organization-ai/backend/logs
```

### 3.5 Build & Deploy Frontend (React)

```bash
cd /opt/organization-ai/frontend

# Install Node.js dependencies
npm ci

# Build production static files
npm run build
# Output: frontend/dist/ directory

# Verify build
ls -la dist/
# Should contain: index.html, assets/ folder
```

### 3.6 Configure Nginx (Reverse Proxy + HTTPS)

```bash
sudo tee /etc/nginx/sites-available/org-ai > /dev/null <<'NGINX'
# ── Redirect HTTP → HTTPS ──
server {
    listen 80;
    server_name ai.yourcompany.com;
    return 301 https://$host$request_uri;
}

# ── Main HTTPS Server ──
server {
    listen 443 ssl http2;
    server_name ai.yourcompany.com;

    # ── TLS Certificates ──
    ssl_certificate     /etc/ssl/org-ai/cert.pem;
    ssl_certificate_key /etc/ssl/org-ai/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # ── Security Headers ──
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # ── Frontend Static Files ──
    root /opt/organization-ai/frontend/dist;
    index index.html;

    # SPA routing: serve index.html for all non-file routes
    location / {
        try_files $uri $uri/ /index.html;

        # Cache static assets (JS, CSS, images)
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # ── Backend API Proxy ──
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        # Streaming support (SSE for chat responses)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Forward client info
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # ── Block hidden files ──
    location ~ /\. {
        deny all;
    }

    # ── File upload size limit ──
    client_max_body_size 15M;
}
NGINX

# Enable the site
sudo ln -sf /etc/nginx/sites-available/org-ai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
```

### 3.7 Create Systemd Services

**Backend service:**

```bash
sudo tee /etc/systemd/system/org-ai-backend.service > /dev/null <<'EOF'
[Unit]
Description=Organization AI - FastAPI Backend
After=network.target postgresql.service ollama.service
Requires=postgresql.service
Wants=ollama.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/organization-ai/backend
Environment="PATH=/opt/organization-ai/backend/venv/bin:/usr/bin:/bin"
EnvironmentFile=/opt/organization-ai/backend/.env
ExecStart=/opt/organization-ai/backend/venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 8 \
    --log-level warning
Restart=always
RestartSec=5
StandardOutput=append:/opt/organization-ai/backend/logs/uvicorn.log
StandardError=append:/opt/organization-ai/backend/logs/uvicorn-error.log

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/opt/organization-ai/backend/logs

[Install]
WantedBy=multi-user.target
EOF
```

**Set file ownership:**

```bash
sudo chown -R www-data:www-data /opt/organization-ai/backend/logs
sudo chmod 600 /opt/organization-ai/backend/.env
sudo chown root:www-data /opt/organization-ai/backend/.env
```

**Enable and start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable org-ai-backend
sudo systemctl start org-ai-backend

# Check status
sudo systemctl status org-ai-backend
```

**Quick reference — start/stop/restart all services:**

```bash
# Start everything
sudo systemctl start postgresql ollama org-ai-backend nginx

# Stop everything
sudo systemctl stop org-ai-backend nginx

# Restart backend only
sudo systemctl restart org-ai-backend

# View backend logs
sudo journalctl -u org-ai-backend -f --no-pager
```

### 3.8 Firewall Configuration

```bash
# Allow only HTTPS and SSH from external
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 80/tcp     # HTTP (redirects to HTTPS)

# Do NOT expose these externally:
# 8000 (backend)  — only Nginx connects to it locally
# 5432 (postgres) — only backend connects to it locally
# 11434 (ollama)  — only backend connects to it locally

sudo ufw enable
sudo ufw status
```

### 3.9 Verify Deployment

```bash
# 1. Check all services are running
sudo systemctl status postgresql ollama org-ai-backend nginx

# 2. Backend health check
curl http://localhost:8000/api/health
# Expected: {"status":"ok","service":"Organization AI Assistant"}

# 3. Frontend via Nginx
curl -sk https://localhost/ | head -20
# Should return HTML with React app

# 4. API via Nginx
curl -sk https://localhost/api/health
# Expected: {"status":"ok","service":"Organization AI Assistant"}

# 5. Ollama
curl http://localhost:11434/api/tags
# Should list installed models
```

Open `https://ai.yourcompany.com` in a browser and log in:
- **Username:** `admin`
- **Password:** (value of `LOCAL_ADMIN_PASSWORD` from your `.env`)

---

## 4. Deployment on Windows Server

### 4.1 Install Prerequisites

Download and install these (all with default settings unless noted):

| Software | Download URL | Notes |
|----------|-------------|-------|
| **Python 3.12** | https://python.org/downloads/ | Check "Add to PATH" during install |
| **PostgreSQL 16** | https://www.postgresql.org/download/windows/ | Remember the superuser password |
| **Node.js 20 LTS** | https://nodejs.org/ | Includes npm |
| **Git** | https://git-scm.com/download/win | Includes OpenSSL |
| **Ollama** | https://ollama.com/download/windows | Installs to `%LOCALAPPDATA%\Programs\Ollama` |

**Verify installations** (open PowerShell as Administrator):

```powershell
python --version       # Python 3.12.x
node --version         # v20.x.x
npm --version          # 10.x.x
git --version          # git version 2.x.x
ollama --version       # ollama version x.x.x
```

### 4.2 Install & Configure PostgreSQL

Open **pgAdmin** or **psql** (installed with PostgreSQL) and run:

```sql
-- Create the application user
CREATE USER org_ai_user WITH PASSWORD 'YOUR_STRONG_DB_PASSWORD';

-- Create the database
CREATE DATABASE org_ai OWNER org_ai_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE org_ai TO org_ai_user;

-- Connect to org_ai and grant schema
\c org_ai
GRANT ALL ON SCHEMA public TO org_ai_user;
```

**Or via PowerShell:**

```powershell
# Assuming PostgreSQL bin is in PATH (usually C:\Program Files\PostgreSQL\16\bin)
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE USER org_ai_user WITH PASSWORD 'YOUR_STRONG_DB_PASSWORD';"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE org_ai OWNER org_ai_user;"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE org_ai TO org_ai_user;"
```

**Verify:**

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -U org_ai_user -d org_ai -c "SELECT version();"
```

**Tune PostgreSQL** — edit `C:\Program Files\PostgreSQL\16\data\postgresql.conf`:

```ini
shared_buffers = 4GB
effective_cache_size = 12GB
work_mem = 64MB
max_connections = 100
```

Restart the PostgreSQL service from **Services** (`services.msc`) or:

```powershell
Restart-Service postgresql-x64-16
```

### 4.3 Install & Configure Ollama

Ollama runs as a background process on Windows. After installation:

```powershell
# Set environment variables for concurrent requests
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_NUM_PARALLEL", "8", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_MAX_QUEUE", "128", "Machine")

# Restart Ollama (close from system tray, then reopen)
# Or restart the computer for env vars to take effect

# Pull a model
ollama pull llama3.1:8b

# Verify
ollama list
```

**Find your Ollama path** (needed for the startup script):

```powershell
Get-Command ollama | Select-Object Source
# Typical: C:\Users\<user>\AppData\Local\Programs\Ollama\ollama.exe
```

### 4.4 Deploy Backend (FastAPI)

```powershell
# Create application directory
New-Item -ItemType Directory -Force -Path "D:\Apps\organization-ai"
Set-Location "D:\Apps\organization-ai"

# Clone or copy project files
git clone <your-repo-url> .
# OR copy files manually

# Navigate to backend
Set-Location backend

# Create virtual environment
python -m venv venv

# Activate
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

**Create production .env:**

```powershell
Copy-Item .env.production .env
notepad .env
```

**Critical settings for bare metal on Windows:**

```bash
# ---- MUST CHANGE for bare metal ----
APP_ENV=production
DATABASE_HOST=localhost
LLM_BASE_URL=http://localhost:11434

# ---- Generate and fill these ----
SECRET_KEY=<generated>
SESSION_SECRET=<generated>
DATABASE_PASSWORD=<your-db-password>
DATABASE_USER=org_ai_user
DATABASE_NAME=org_ai
LOCAL_ADMIN_PASSWORD=<your-admin-password>
CORS_ORIGINS=["https://ai.yourcompany.com"]
ALLOWED_HOSTS=["ai.yourcompany.com"]

# ---- Session ----
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict

# ---- Logging ----
LOG_LEVEL=INFO
LOG_FILE=logs/app.log
```

Generate secrets:

```powershell
python -c "import secrets; print('SECRET_KEY:', secrets.token_urlsafe(48))"
python -c "import secrets; print('SESSION_SECRET:', secrets.token_urlsafe(48))"
```

**Run database migrations:**

```powershell
Set-Location D:\Apps\organization-ai\backend
.\venv\Scripts\Activate.ps1
alembic upgrade head
```

**Create logs directory and test:**

```powershell
New-Item -ItemType Directory -Force -Path "logs"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# Should see: "Organization AI Assistant starting up (env=production)"
# Test: Invoke-RestMethod http://localhost:8000/api/health
# Press Ctrl+C to stop
```

### 4.5 Build & Deploy Frontend (React)

```powershell
Set-Location D:\Apps\organization-ai\frontend

# Install dependencies
npm ci

# Build production static files
npm run build

# Verify build output
Get-ChildItem dist\
# Should contain: index.html, assets\ folder
```

### 4.6 Configure IIS Reverse Proxy

**Option A: IIS with ARR (Application Request Routing)**

1. **Install IIS** (if not already installed):

```powershell
Install-WindowsFeature -Name Web-Server -IncludeManagementTools
```

2. **Install ARR and URL Rewrite:**

Download and install:
- [Application Request Routing 3.0](https://www.iis.net/downloads/microsoft/application-request-routing)
- [URL Rewrite Module 2.1](https://www.iis.net/downloads/microsoft/url-rewrite)

3. **Enable ARR Proxy:**

```powershell
# Enable proxy in ARR
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
    -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'
```

4. **Create IIS Site:**

   - Open **IIS Manager**
   - Right-click **Sites** → **Add Website**
   - **Site name:** `OrganizationAI`
   - **Physical path:** `D:\Apps\organization-ai\frontend\dist`
   - **Binding:** HTTPS, port 443, hostname `ai.yourcompany.com`, select your TLS certificate

5. **Add URL Rewrite rules** — create `D:\Apps\organization-ai\frontend\dist\web.config`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <!-- Proxy /api/* to backend -->
                <rule name="API Proxy" stopProcessing="true">
                    <match url="^api/(.*)" />
                    <action type="Rewrite" url="http://127.0.0.1:8000/api/{R:1}" />
                    <serverVariables>
                        <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
                        <set name="HTTP_X_FORWARDED_PROTO" value="https" />
                    </serverVariables>
                </rule>

                <!-- SPA routing: serve index.html for non-file routes -->
                <rule name="SPA Fallback" stopProcessing="true">
                    <match url=".*" />
                    <conditions logicalGrouping="MatchAll">
                        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                    </conditions>
                    <action type="Rewrite" url="/index.html" />
                </rule>
            </rules>
        </rewrite>

        <!-- Disable response buffering for streaming -->
        <httpProtocol>
            <customHeaders>
                <add name="X-Content-Type-Options" value="nosniff" />
                <add name="X-Frame-Options" value="DENY" />
            </customHeaders>
        </httpProtocol>

        <!-- Static file caching -->
        <staticContent>
            <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="30.00:00:00" />
        </staticContent>

        <!-- Request size limit for file uploads (15 MB) -->
        <security>
            <requestFiltering>
                <requestLimits maxAllowedContentLength="15728640" />
            </requestFiltering>
        </security>
    </system.webServer>
</configuration>
```

6. **Allow server variables** (required for proxy headers):

In IIS Manager → `OrganizationAI` site → **URL Rewrite** → **View Server Variables** → Add:
- `HTTP_X_FORWARDED_FOR`
- `HTTP_X_FORWARDED_PROTO`

**Option B: Nginx on Windows** (simpler alternative)

Download Nginx for Windows from https://nginx.org/en/download.html and use the same config as [Section 3.6](#36-configure-nginx-reverse-proxy--https), adjusting paths:

```nginx
root D:/Apps/organization-ai/frontend/dist;
ssl_certificate     D:/certs/org-ai/cert.pem;
ssl_certificate_key D:/certs/org-ai/key.pem;
```

### 4.7 Create Windows Services

**Option A: NSSM (Recommended — Non-Sucking Service Manager)**

Download NSSM from https://nssm.cc/download

```powershell
# Install backend as a Windows service
nssm install OrgAI-Backend "D:\Apps\organization-ai\backend\venv\Scripts\uvicorn.exe"
nssm set OrgAI-Backend AppParameters "app.main:app --host 127.0.0.1 --port 8000 --workers 8"
nssm set OrgAI-Backend AppDirectory "D:\Apps\organization-ai\backend"
nssm set OrgAI-Backend AppStdout "D:\Apps\organization-ai\backend\logs\uvicorn.log"
nssm set OrgAI-Backend AppStderr "D:\Apps\organization-ai\backend\logs\uvicorn-error.log"
nssm set OrgAI-Backend Description "Organization AI - FastAPI Backend"
nssm set OrgAI-Backend Start SERVICE_AUTO_START
nssm set OrgAI-Backend AppRestartDelay 5000
nssm set OrgAI-Backend DependOnService postgresql-x64-16

# Set environment variables for the service
nssm set OrgAI-Backend AppEnvironmentExtra "APP_ENV=production"

# Start the service
nssm start OrgAI-Backend
```

**Option B: PowerShell startup script** (simpler, no additional software)

Create `D:\Apps\organization-ai\start-backend.ps1`:

```powershell
# Start Organization AI Backend
Set-Location "D:\Apps\organization-ai\backend"
& ".\venv\Scripts\uvicorn.exe" app.main:app --host 127.0.0.1 --port 8000 --workers 8
```

Create a scheduled task to run at startup:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "D:\Apps\organization-ai\backend\venv\Scripts\python.exe" `
    -Argument "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 8" `
    -WorkingDirectory "D:\Apps\organization-ai\backend"

$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit 0

Register-ScheduledTask `
    -TaskName "OrgAI-Backend" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Organization AI FastAPI Backend"
```

**Ollama on Windows** runs automatically on startup (system tray). If you need to configure it as a service:

```powershell
# Create Ollama startup script
$ollamaPath = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (-not $ollamaPath) {
    $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
}

$action = New-ScheduledTaskAction -Execute $ollamaPath -Argument "serve"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0

Register-ScheduledTask `
    -TaskName "OrgAI-Ollama" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Ollama LLM Server"
```

### 4.8 Firewall Configuration

```powershell
# Allow HTTPS inbound
New-NetFirewallRule -DisplayName "Organization AI - HTTPS" `
    -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Allow HTTP (for redirect to HTTPS)
New-NetFirewallRule -DisplayName "Organization AI - HTTP" `
    -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# Do NOT create rules for these (internal only):
# Port 8000 (backend)
# Port 5432 (PostgreSQL)
# Port 11434 (Ollama)
```

### 4.9 Verify Deployment

```powershell
# 1. Check services
Get-Service postgresql-x64-16 | Select-Object Status, Name
Get-ScheduledTask OrgAI-Backend | Select-Object State, TaskName

# 2. Backend health check
Invoke-RestMethod http://localhost:8000/api/health
# Expected: status=ok, service=Organization AI Assistant

# 3. Frontend
Invoke-WebRequest -Uri https://localhost/ -SkipCertificateCheck | Select-Object StatusCode
# Expected: 200

# 4. API via reverse proxy
Invoke-RestMethod -Uri https://localhost/api/health -SkipCertificateCheck
# Expected: status=ok

# 5. Ollama models
Invoke-RestMethod http://localhost:11434/api/tags
```

Open `https://ai.yourcompany.com` in a browser and log in:
- **Username:** `admin`
- **Password:** (value of `LOCAL_ADMIN_PASSWORD` from your `.env`)

---

## 5. Environment Configuration (.env)

The backend reads all configuration from `backend/.env`. Here is the **complete reference**:

### Required Settings (MUST change before deployment)

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_ENV` | Environment mode | `production` |
| `SECRET_KEY` | JWT signing key (48+ chars) | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `SESSION_SECRET` | Cookie signing key (48+ chars) | Same generation method |
| `DATABASE_PASSWORD` | PostgreSQL password | `openssl rand -base64 32` |
| `LOCAL_ADMIN_PASSWORD` | Break-glass admin password | Strong, min 12 chars |
| `CORS_ORIGINS` | Allowed frontend URLs | `["https://ai.yourcompany.com"]` |
| `ALLOWED_HOSTS` | Allowed hostnames | `["ai.yourcompany.com"]` |

### Database Settings

| Variable | Default | Bare Metal Value |
|----------|---------|-----------------|
| `DATABASE_HOST` | `localhost` | `localhost` |
| `DATABASE_PORT` | `5432` | `5432` |
| `DATABASE_NAME` | `org_ai` | `org_ai` |
| `DATABASE_USER` | `org_ai_user` | `org_ai_user` |
| `DATABASE_POOL_SIZE` | `20` | `20` (adjust per scaling table) |
| `DATABASE_MAX_OVERFLOW` | `10` | `10` |

### LLM Settings

| Variable | Default | Notes |
|----------|---------|-------|
| `LLM_PROVIDER` | `ollama` | Only `ollama` supported currently |
| `LLM_BASE_URL` | `http://localhost:11434` | Use `localhost` for bare metal |
| `LLM_DEFAULT_MODEL` | `llama3` | Set to `llama3.1:8b` |
| `LLM_TIMEOUT` | `120` | Seconds per request |
| `LLM_MAX_TOKENS` | `4096` | Max tokens per response |
| `LLM_TEMPERATURE` | `0.7` | 0.0–1.0 |

### Session Settings

| Variable | Default | Production Value |
|----------|---------|-----------------|
| `SESSION_EXPIRE_MINUTES` | `480` | `480` (8 hours) |
| `SESSION_COOKIE_SECURE` | `true` | `true` (requires HTTPS) |
| `SESSION_COOKIE_HTTPONLY` | `true` | `true` |
| `SESSION_COOKIE_SAMESITE` | `strict` | `strict` |

### Other Settings

| Variable | Default | Notes |
|----------|---------|-------|
| `ATTACHMENTS_ENABLED` | `true` | Enable file upload in chat |
| `RATE_LIMIT_ENABLED` | `false` | Internal app — usually disabled |
| `LOG_LEVEL` | `INFO` | `INFO` for production |
| `LOG_FILE` | `logs/app.log` | Relative to backend dir |
| `LOCAL_ADMIN_ENABLED` | `true` | Break-glass admin account |
| `LOCAL_ADMIN_USERNAME` | `admin` | Admin login username |

### Production Behavior

When `APP_ENV=production`:
- Swagger/Redoc API docs are **disabled** (not accessible)
- HSTS header is **enabled** (`max-age=31536000`)
- Auto table creation is **disabled** (use Alembic migrations)
- Error messages are **sanitized** (no stack traces to clients)
- Startup **warns** if SECRET_KEY/SESSION_SECRET contain weak values

---

## 6. Database Migrations (Alembic)

**IMPORTANT:** In production, database tables are NOT created automatically. You **must** run Alembic migrations.

### Initial Setup

```bash
cd /opt/organization-ai/backend    # Linux
# or
cd D:\Apps\organization-ai\backend  # Windows

# Activate venv
source venv/bin/activate             # Linux
.\venv\Scripts\Activate.ps1          # Windows

# Run all migrations
alembic upgrade head
```

### Migration Reference

| # | Migration | What It Creates |
|---|-----------|----------------|
| 1 | `001_initial_schema` | users, conversations, messages, user_settings, audit_logs |
| 2 | `002_add_local_admin_columns` | password_hash, is_local_account columns on users |
| 3 | `003_add_indexes_pinned_archived` | Performance indexes, pinned/archived columns, system_prompt |
| 4 | `004_add_file_uploads_table` | file_uploads table for attachment support |
| 5 | `005_add_search_vector_audit_retention` | Full-text search vector (TSVECTOR), GIN index, audit indexes |
| 6 | `006_add_features_tables` | message_feedback, prompt_templates, conversation_tags, conversation_tag_links, announcements, shared_conversations, message_bookmarks |

### Common Commands

```bash
alembic current              # Show current migration version
alembic history              # Show all migration versions
alembic upgrade head         # Apply all pending migrations
alembic upgrade +1           # Apply next migration only
alembic downgrade -1         # Rollback last migration
alembic stamp head           # Mark DB as fully migrated (without running)
```

---

## 7. Pull LLM Models

After Ollama is running, pull the models you want:

```bash
# Recommended starter (4.7 GB download, good for most use cases)
ollama pull llama3.1:8b

# Lightweight model (2 GB, fastest responses)
ollama pull llama3.2:3b

# Code-focused model (9 GB)
ollama pull qwen2.5-coder:14b

# Large model (40 GB, requires GPU with 24GB+ VRAM or 64GB+ RAM)
ollama pull llama3.3:70b

# List installed models
ollama list

# Test a model
ollama run llama3.1:8b "Hello, what can you do?"
```

Set the default model in your `.env`:

```bash
LLM_DEFAULT_MODEL=llama3.1:8b
```

Or change it at runtime via **Admin Panel → Models**.

---

## 8. HTTPS / TLS Certificates

### Option A: Enterprise Internal CA (Recommended)

Request a certificate from your IT/PKI team for your hostname (e.g., `ai.yourcompany.com`).

You'll receive:
- **Certificate file** (`.crt` or `.pem`) — include the full chain (server + intermediate CAs)
- **Private key file** (`.key` or `.pem`)

Place them:

```bash
# Linux
sudo mkdir -p /etc/ssl/org-ai
sudo cp your-cert.pem /etc/ssl/org-ai/cert.pem
sudo cp your-key.pem /etc/ssl/org-ai/key.pem
sudo chmod 600 /etc/ssl/org-ai/key.pem
```

```powershell
# Windows — Import into IIS or place for Nginx
New-Item -ItemType Directory -Force -Path "D:\certs\org-ai"
Copy-Item your-cert.pem D:\certs\org-ai\cert.pem
Copy-Item your-key.pem D:\certs\org-ai\key.pem
```

### Option B: Self-Signed (Testing / Internal Only)

```bash
# Linux
sudo mkdir -p /etc/ssl/org-ai
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/org-ai/key.pem \
    -out /etc/ssl/org-ai/cert.pem \
    -subj "/CN=ai.yourcompany.com" \
    -addext "subjectAltName=DNS:ai.yourcompany.com"
```

```powershell
# Windows (PowerShell as Admin)
$cert = New-SelfSignedCertificate `
    -DnsName "ai.yourcompany.com" `
    -CertStoreLocation "Cert:\LocalMachine\My" `
    -NotAfter (Get-Date).AddYears(1)

# Export for IIS binding
Write-Host "Certificate Thumbprint: $($cert.Thumbprint)"
```

After creating the certificate, bind it to your Nginx config (Linux, Section 3.6) or IIS site (Windows, Section 4.6).

---

## 9. Active Directory / LDAP Setup

Add these to your `.env`:

```bash
AD_ENABLED=true
AD_SERVER=ldap://your-dc.yourcompany.com
AD_PORT=389
AD_USE_SSL=false
AD_DOMAIN=YOURCOMPANY
AD_BASE_DN=DC=yourcompany,DC=com
AD_USER_SEARCH_BASE=OU=Users,DC=yourcompany,DC=com
AD_GROUP_SEARCH_BASE=OU=Groups,DC=yourcompany,DC=com
AD_ADMIN_GROUP=CN=AI-Admins,OU=Groups,DC=yourcompany,DC=com

# Optional: Service account for LDAP bind
AD_BIND_USER=svc_ai_reader@yourcompany.com
AD_BIND_PASSWORD=<service-account-password>
```

**For LDAPS (encrypted, port 636):**

```bash
AD_SERVER=ldaps://your-dc.yourcompany.com
AD_PORT=636
AD_USE_SSL=true
```

**Admin group:** Users in the `AD_ADMIN_GROUP` get admin privileges in the portal. Create the group in AD and add the appropriate users.

**Break-glass access:** The local admin account (`LOCAL_ADMIN_ENABLED=true`) always works — even if Active Directory is down or misconfigured.

**Test after deployment:** Admin Panel → Settings → Active Directory → **Test Connection**

---

## 10. Backup & Recovery

### 10.1 Automated Database Backup

**Linux (cron):**

```bash
sudo tee /etc/cron.daily/org-ai-backup > /dev/null <<'SCRIPT'
#!/bin/bash
BACKUP_DIR="/opt/backups/org-ai"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

pg_dump -U org_ai_user -h localhost org_ai | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

# Keep last 30 days
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +30 -delete

echo "$(date): Backup -> db_${TIMESTAMP}.sql.gz" >> "$BACKUP_DIR/backup.log"
SCRIPT

sudo chmod +x /etc/cron.daily/org-ai-backup
```

**Windows (Scheduled Task):**

Create `D:\Apps\organization-ai\backup-db.ps1`:

```powershell
$backupDir = "D:\Backups\org-ai"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$pgDump = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

# Set PGPASSWORD environment variable
$env:PGPASSWORD = "YOUR_DB_PASSWORD"

& $pgDump -U org_ai_user -h localhost org_ai | Out-File "$backupDir\db_$timestamp.sql" -Encoding utf8

# Clean up old backups (keep 30 days)
Get-ChildItem "$backupDir\db_*.sql" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item

Add-Content "$backupDir\backup.log" "$(Get-Date): Backup -> db_$timestamp.sql"
```

Register as a scheduled task:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File D:\Apps\organization-ai\backup-db.ps1"

$trigger = New-ScheduledTaskTrigger -Daily -At "2:00AM"
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount

Register-ScheduledTask -TaskName "OrgAI-DB-Backup" `
    -Action $action -Trigger $trigger -Principal $principal `
    -Description "Daily backup of Organization AI database"
```

### 10.2 Restore Database

```bash
# Linux
gunzip -c /opt/backups/org-ai/db_20260227_020000.sql.gz | psql -U org_ai_user -h localhost org_ai
```

```powershell
# Windows
$env:PGPASSWORD = "YOUR_DB_PASSWORD"
Get-Content "D:\Backups\org-ai\db_20260227_020000.sql" | & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U org_ai_user -h localhost org_ai
```

### 10.3 What to Back Up

| Item | Location | Frequency |
|------|----------|-----------|
| PostgreSQL database | pg_dump | Daily |
| `.env` file | `backend/.env` | After each change |
| Ollama models | `~/.ollama/models/` (Linux) or `%USERPROFILE%\.ollama\models\` (Windows) | Weekly |
| Application logs | `backend/logs/` | As needed |
| TLS certificates | `/etc/ssl/org-ai/` or `D:\certs\` | After renewal |

---

## 11. Log Management

### Log Locations

| Service | Linux | Windows |
|---------|-------|---------|
| Backend app | `backend/logs/app.log` | `backend\logs\app.log` |
| Uvicorn | `backend/logs/uvicorn.log` | `backend\logs\uvicorn.log` |
| Nginx | `/var/log/nginx/access.log` | `C:\nginx\logs\access.log` |
| PostgreSQL | `/var/log/postgresql/` | `C:\Program Files\PostgreSQL\16\data\log\` |
| Ollama | `journalctl -u ollama` | Event Viewer or `%LOCALAPPDATA%\Ollama\` |

### Log Levels

Set `LOG_LEVEL` in `.env`:

| Level | Use Case |
|-------|----------|
| `INFO` | Production (default, recommended) |
| `WARNING` | Quiet mode — only errors and warnings |
| `DEBUG` | Troubleshooting only (very verbose, not for production) |

### Log Rotation (Linux)

```bash
sudo tee /etc/logrotate.d/org-ai > /dev/null <<'EOF'
/opt/organization-ai/backend/logs/*.log {
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

### Audit Logs

All user actions are stored in the `audit_logs` database table and viewable in **Admin Panel → Audit Logs**:
- Login / logout events
- Conversation creation / deletion
- Admin setting changes
- Model management operations

---

## 12. Monitoring & Health Checks

### Health Endpoint

```bash
curl https://ai.yourcompany.com/api/health
# {"status": "ok", "service": "Organization AI Assistant"}
```

### Service Status

**Linux:**

```bash
sudo systemctl status postgresql ollama org-ai-backend nginx
```

**Windows:**

```powershell
Get-Service postgresql-x64-16 | Format-Table Status, Name, DisplayName
Get-ScheduledTask OrgAI-Backend | Format-Table State, TaskName
Get-Process uvicorn -ErrorAction SilentlyContinue
Test-NetConnection -ComputerName localhost -Port 8000 -InformationLevel Quiet
Test-NetConnection -ComputerName localhost -Port 11434 -InformationLevel Quiet
```

### Uptime Monitoring

Configure your monitoring tool (Nagios, Zabbix, Uptime Kuma, PRTG) to check:

| Check | Target | Expected |
|-------|--------|----------|
| Backend API | `GET /api/health` | HTTP 200, `{"status":"ok"}` |
| Frontend | `GET /` | HTTP 200 |
| PostgreSQL | TCP port 5432 | Connection accepted |
| Ollama | `GET http://localhost:11434/api/tags` | HTTP 200 |

---

## 13. Performance Tuning

### Capacity Table

| Concurrent Users | Uvicorn Workers | DB Pool Size + Overflow | RAM | Model |
|-----------------|----------------|------------------------|-----|-------|
| 1–30 | 4 | 20 + 10 | 16 GB | gemma3:4b |
| 30–80 | 8 | 50 + 20 | 32 GB | gemma3:4b |
| 80–200 | 12 | 100 + 50 | 64 GB | llama3.1:8b |
| 200+ | 16 | 100 + 50 | 128 GB | llama3.1:8b |

### Uvicorn Workers

Adjust the `--workers` parameter in your service definition:

```bash
# Rule of thumb: workers = CPU cores
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 8
```

### Database Pool

In `.env`:

```bash
DATABASE_POOL_SIZE=20      # workers × 2
DATABASE_MAX_OVERFLOW=10   # burst headroom
```

### Ollama Parallelism

```bash
OLLAMA_NUM_PARALLEL=8      # CPU cores ÷ 2 (CPU) or num loaded models (GPU)
OLLAMA_MAX_QUEUE=128       # queue depth for burst traffic
```

### GPU Acceleration

Ollama auto-detects NVIDIA GPUs. Verify:

```bash
nvidia-smi                              # Check GPU is detected
ollama run llama3.1:8b "test"           # Watch GPU usage in nvidia-smi
```

Expected performance:

| Hardware | 8B Model | 70B Model |
|----------|----------|-----------|
| CPU only (16 cores) | 5–15 tok/s | 0.5–2 tok/s |
| NVIDIA RTX 3090 (24GB) | 60–100 tok/s | 5–10 tok/s (partial offload) |
| NVIDIA A6000 (48GB) | 80–120 tok/s | 20–40 tok/s |

---

## 14. Security Hardening

### Built-in Security Features

| Feature | Details |
|---------|---------|
| HSTS | Auto-enabled when `APP_ENV=production` (31536000s) |
| CSP | `default-src 'self'` |
| X-Frame-Options | DENY (prevents clickjacking) |
| X-Content-Type-Options | nosniff |
| Secure cookies | HttpOnly + Secure + SameSite=Strict |
| bcrypt | 12-round password hashing |
| Constant-time comparison | `secrets.compare_digest()` |
| SQL injection prevention | SQLAlchemy ORM parameterization |
| Error sanitization | No stack traces in responses |
| API docs disabled | Swagger/Redoc hidden in production |
| Audit logging | All user/admin actions logged |

### Additional Hardening Steps

1. **File permissions** (Linux):

```bash
chmod 600 /opt/organization-ai/backend/.env
chown root:www-data /opt/organization-ai/backend/.env
chmod 750 /opt/organization-ai/backend/
```

2. **Network isolation:** Only ports 80 and 443 should be reachable from outside. Backend (8000), PostgreSQL (5432), and Ollama (11434) should only be accessible on `127.0.0.1`.

3. **PostgreSQL hardening** — edit `pg_hba.conf`:

```
# Only local connections from the app user
local   org_ai   org_ai_user   scram-sha-256
host    org_ai   org_ai_user   127.0.0.1/32   scram-sha-256
# Deny everything else
host    all      all           0.0.0.0/0      reject
```

4. **Ollama binding:** Ensure Ollama only listens on localhost:

```bash
OLLAMA_HOST=127.0.0.1:11434   # NOT 0.0.0.0 in production
```

5. **Regular updates:**

```bash
# Linux
sudo apt update && sudo apt upgrade -y
pip install --upgrade -r requirements.txt

# Windows
winget upgrade --all
pip install --upgrade -r requirements.txt
```

---

## 15. Updating / Upgrading

### Standard Update

**Linux:**

```bash
cd /opt/organization-ai

# Pull latest code
git pull origin main

# Update backend dependencies
cd backend
source venv/bin/activate
pip install --upgrade -r requirements.txt

# Run new migrations
alembic upgrade head

# Rebuild frontend
cd ../frontend
npm ci
npm run build

# Restart backend
sudo systemctl restart org-ai-backend

# Reload Nginx (if nginx config changed)
sudo nginx -t && sudo systemctl reload nginx
```

**Windows:**

```powershell
Set-Location D:\Apps\organization-ai

# Pull latest code
git pull origin main

# Update backend
Set-Location backend
.\venv\Scripts\Activate.ps1
pip install --upgrade -r requirements.txt
alembic upgrade head
deactivate

# Rebuild frontend
Set-Location ..\frontend
npm ci
npm run build

# Restart backend service
nssm restart OrgAI-Backend
# or via Task Scheduler:
# Stop-ScheduledTask OrgAI-Backend; Start-ScheduledTask OrgAI-Backend
```

### Rollback

```bash
# Revert code
git checkout <previous-commit-hash>

# Rebuild frontend
cd frontend && npm ci && npm run build

# Rollback migration if needed
cd backend
source venv/bin/activate
alembic downgrade -1

# Restart
sudo systemctl restart org-ai-backend
```

---

## 16. Troubleshooting

### Backend won't start

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ModuleNotFoundError` | Missing dependency | `pip install -r requirements.txt` |
| `Connection refused` on 5432 | PostgreSQL not running | `sudo systemctl start postgresql` |
| `SECRET_KEY appears weak` | Default secret in .env | Generate proper secret (see Section 5) |
| `DATABASE_PASSWORD must be set` | Empty password in .env | Set `DATABASE_PASSWORD` in `.env` |
| `Address already in use` | Port 8000 occupied | `lsof -i :8000` or `netstat -tlnp \| grep 8000` |

### Frontend shows blank page

| Symptom | Cause | Fix |
|---------|-------|-----|
| White screen, no errors | Build not run | `cd frontend && npm run build` |
| 404 on page refresh | Nginx SPA routing missing | Add `try_files $uri $uri/ /index.html;` |
| API calls fail (CORS) | Wrong CORS_ORIGINS | Match exactly: `["https://ai.yourcompany.com"]` |

### LLM responses are slow or fail

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Connection refused` on 11434 | Ollama not running | `sudo systemctl start ollama` or launch from system tray |
| Very slow responses | No GPU / large model | Use `llama3.1:8b` or add GPU |
| Timeout errors | LLM_TIMEOUT too low | Increase `LLM_TIMEOUT=300` in `.env` |
| "Model not found" | Model not pulled | `ollama pull llama3.1:8b` |

### Database migration fails

```bash
# Check current state
alembic current
alembic history

# If corrupted, stamp and retry
alembic stamp <last-known-good-revision>
alembic upgrade head
```

### AD/LDAP authentication fails

1. Verify AD settings in **Admin Panel → Settings → AD/LDAP**
2. Click **Test Connection**
3. Check `backend/logs/app.log` for LDAP errors
4. Ensure the server can reach the domain controller: `telnet your-dc.company.com 389`
5. Local admin account (`admin`) always works as a fallback

### Windows-specific issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `uvicorn` not found | venv not activated / not in PATH | Use full path: `D:\Apps\...\venv\Scripts\uvicorn.exe` |
| PostgreSQL service won't start | Port conflict | Check `netstat -an \| findstr 5432` |
| IIS 502 Bad Gateway | Backend not running on 8000 | Start the backend service first |
| IIS 500 on `/api/*` | ARR not installed | Install Application Request Routing |
| Ollama not responding | Not running / wrong host | Check system tray, set `OLLAMA_HOST=0.0.0.0:11434` |

---

## Quick Start Cheat Sheet

### Linux — 5 Steps

```bash
# 1. Install: Python 3.12, PostgreSQL 16, Node.js 20, Nginx, Ollama
# 2. Setup DB
sudo -u postgres psql -c "CREATE USER org_ai_user WITH PASSWORD 'StrongPass'; CREATE DATABASE org_ai OWNER org_ai_user;"
# 3. Deploy backend
cd /opt/organization-ai/backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.production .env && nano .env   # Set DATABASE_HOST=localhost, LLM_BASE_URL=http://localhost:11434, fill secrets
alembic upgrade head
# 4. Build frontend
cd ../frontend && npm ci && npm run build
# 5. Start
ollama pull llama3.1:8b
sudo systemctl start org-ai-backend nginx
```

### Windows — 5 Steps

```powershell
# 1. Install: Python 3.12, PostgreSQL 16, Node.js 20, Ollama
# 2. Setup DB (via pgAdmin or psql)
# 3. Deploy backend
cd D:\Apps\organization-ai\backend
python -m venv venv; .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.production .env; notepad .env   # Set localhost hosts, fill secrets
alembic upgrade head
# 4. Build frontend 
cd ..\frontend; npm ci; npm run build
# 5. Start
ollama pull llama3.1:8b
.\venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --workers 8
```

Then open `https://ai.yourcompany.com` → Login with `admin` / your `LOCAL_ADMIN_PASSWORD`.
