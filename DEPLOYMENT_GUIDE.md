# Organization AI Assistant — Complete Deployment Guide

> **Version:** 1.0  
> **Target:** 200+ concurrent users, CPU or GPU  
> **Stack:** Python 3.12 + FastAPI | React 18 + Vite | PostgreSQL | Ollama  

---

## Table of Contents

1. [Prerequisites & Server Requirements](#1-prerequisites--server-requirements)  
2. [Install Operating System & Base Packages](#2-install-operating-system--base-packages)  
3. [Install PostgreSQL](#3-install-postgresql)  
4. [Install Python 3.12](#4-install-python-312)  
5. [Install Node.js 20 LTS](#5-install-nodejs-20-lts)  
6. [Install Ollama (LLM Engine)](#6-install-ollama-llm-engine)  
7. [Download & Pull AI Models](#7-download--pull-ai-models)  
8. [Clone / Copy the Application Code](#8-clone--copy-the-application-code)  
9. [Configure the Backend (.env)](#9-configure-the-backend-env)  
10. [Set Up Python Virtual Environment & Install Dependencies](#10-set-up-python-virtual-environment--install-dependencies)  
11. [Create the Database & Run Migrations](#11-create-the-database--run-migrations)  
12. [Install Frontend Dependencies & Build for Production](#12-install-frontend-dependencies--build-for-production)  
13. [Test Everything Locally (Quick Smoke Test)](#13-test-everything-locally-quick-smoke-test)  
14. [Set Up the Backend as a System Service](#14-set-up-the-backend-as-a-system-service)  
15. [Set Up Nginx Reverse Proxy with SSL](#15-set-up-nginx-reverse-proxy-with-ssl)  
16. [Configure Active Directory / LDAP (Optional)](#16-configure-active-directory--ldap-optional)  
17. [Firewall & Network Configuration](#17-firewall--network-configuration)  
18. [First Login & Admin Setup](#18-first-login--admin-setup)  
19. [Docker Deployment (Alternative)](#19-docker-deployment-alternative)  
20. [Windows Server Deployment (Alternative)](#20-windows-server-deployment-alternative)  
21. [Backup & Maintenance](#21-backup--maintenance)  
22. [Troubleshooting](#22-troubleshooting)  
23. [Quick Reference / Cheat Sheet](#23-quick-reference--cheat-sheet)  

---

## 1. Prerequisites & Server Requirements

### Hardware (CPU-only, No GPU)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 16-core / 32-thread | 32-core / 64-thread (AMD EPYC / Intel Xeon) |
| **RAM** | 32 GB | 64 GB – 128 GB |
| **Disk** | 100 GB SSD | 256 GB NVMe SSD |
| **Network** | 1 Gbps | 1 Gbps (internal LAN) |

### Software

| Software | Version |
|----------|---------|
| **OS** | Ubuntu 22.04 LTS / Windows Server 2022 |
| **Python** | 3.12.x |
| **Node.js** | 20.x LTS |
| **PostgreSQL** | 16 or 18 |
| **Ollama** | Latest |
| **Nginx** | Latest (reverse proxy) |

### Network Ports

| Port | Service | Access |
|------|---------|--------|
| 80 | Nginx HTTP (redirects to HTTPS) | Internal network |
| 443 | Nginx HTTPS | Internal network |
| 5432 | PostgreSQL | Localhost only |
| 8000 | FastAPI Backend | Localhost only (proxied via Nginx) |
| 11434 | Ollama LLM | Localhost only |

---

## 2. Install Operating System & Base Packages

### Ubuntu 22.04 LTS (Recommended)

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git build-essential software-properties-common \
    libpq-dev gcc openssl ca-certificates gnupg lsb-release
```

### Windows Server 2022

- Install Windows Server 2022 Standard/Datacenter
- Enable Windows Update and install all patches
- Install Git for Windows from https://git-scm.com/download/win

---

## 3. Install PostgreSQL

### Ubuntu

```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update

# Install PostgreSQL 16
sudo apt install -y postgresql-16

# Start and enable the service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Create the Database and User

```bash
# Switch to postgres user
sudo -u postgres psql
```

Run these SQL commands inside psql:

```sql
-- Create a dedicated user (change the password!)
CREATE USER org_ai_user WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';

-- Create the database
CREATE DATABASE org_ai OWNER org_ai_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE org_ai TO org_ai_user;

-- Exit
\q
```

### Windows

- Download PostgreSQL from https://www.postgresql.org/download/windows/
- Run the installer → choose port 5432 → set the superuser password
- Open pgAdmin or psql and create the database:

```sql
CREATE USER org_ai_user WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';
CREATE DATABASE org_ai OWNER org_ai_user;
GRANT ALL PRIVILEGES ON DATABASE org_ai TO org_ai_user;
```

### Verify PostgreSQL is Running

```bash
sudo systemctl status postgresql   # Ubuntu
# or
pg_isready                          # Any OS
```

Expected output: `localhost:5432 - accepting connections`

---

## 4. Install Python 3.12

### Ubuntu

```bash
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-dev
python3.12 --version
```

Expected output: `Python 3.12.x`

### Windows

- Download Python 3.12 from https://www.python.org/downloads/
- During installation, **check "Add Python to PATH"**
- Verify:

```powershell
python --version
```

---

## 5. Install Node.js 20 LTS

### Ubuntu

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

### Windows

- Download Node.js 20 LTS from https://nodejs.org/
- Run the installer
- Verify:

```powershell
node --version
npm --version
```

---

## 6. Install Ollama (LLM Engine)

### Ubuntu / Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version
```

### Windows

- Download from https://ollama.com/download/windows
- Run the installer
- Verify:

```powershell
ollama --version
```

### Configure Ollama for Production

Set these environment variables for optimal performance:

#### Linux — Create systemd override

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo nano /etc/systemd/system/ollama.service.d/override.conf
```

Add this content:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_NUM_PARALLEL=8"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_MAX_QUEUE=1024"
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

#### Windows — Set system environment variables

```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_NUM_PARALLEL", "8", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_MAX_LOADED_MODELS", "1", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "24h", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_MAX_QUEUE", "1024", "Machine")
```

Restart Ollama after setting variables.

### Verify Ollama is Running

```bash
curl http://localhost:11434/api/tags
```

Expected: JSON response with empty or populated models list.

---

## 7. Download & Pull AI Models

```bash
# Recommended primary model (best for writing, email, Q&A)
ollama pull mistral:7b

# Optional secondary model (good for multilingual tasks)
ollama pull qwen2.5:7b
```

| Model | Disk Space | RAM Required |
|-------|-----------|--------------|
| mistral:7b | ~4.1 GB | ~5.1 GB |
| qwen2.5:7b | ~4.7 GB | ~5.4 GB |
| **Total Disk** | **~8.8 GB** | **~5.4 GB max** (only 1 loaded at a time) |

### Verify Models

```bash
ollama list
```

You should see `mistral:7b` and/or `qwen2.5:7b` listed.

### Quick Model Test

```bash
ollama run mistral:7b "Hello, write a short test email."
```

If you get a response, Ollama and the model are working correctly.

---

## 8. Clone / Copy the Application Code

### Option A: Git Clone (if using Git)

```bash
cd /opt
sudo mkdir org-ai && sudo chown $USER:$USER org-ai
git clone <your-repository-url> org-ai
cd org-ai
```

### Option B: Copy Files Manually

Copy the entire project folder to the server. The folder structure should look like:

```
org-ai/
├── backend/
│   ├── app/
│   ├── alembic/
│   ├── alembic.ini
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── nginx.conf
│   ├── vite.config.ts
│   └── Dockerfile
├── deployment/
│   └── nginx.conf
├── docker-compose.yml
├── package.json
├── .env.example
└── README.md
```

### Set Proper Permissions (Linux)

```bash
sudo chown -R $USER:$USER /opt/org-ai
chmod -R 755 /opt/org-ai
```

---

## 9. Configure the Backend (.env)

```bash
cd /opt/org-ai/backend
cp ../.env.example .env
nano .env
```

Edit the `.env` file with your production values:

```ini
# ============================================================
# Organization AI — PRODUCTION Configuration
# ============================================================

# ---- Application ----
APP_NAME=Organization AI Assistant
APP_ENV=production
SECRET_KEY=<generate-a-64-character-random-string>
CORS_ORIGINS=["https://ai.yourdomain.local"]
ALLOWED_HOSTS=["ai.yourdomain.local","your-server-ip"]

# ---- Database (PostgreSQL) ----
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=org_ai
DATABASE_USER=org_ai_user
DATABASE_PASSWORD=<your-strong-db-password>
DATABASE_POOL_SIZE=40
DATABASE_MAX_OVERFLOW=30

# ---- Active Directory / LDAP ----
AD_ENABLED=true
AD_SERVER=ldap://your-dc.yourdomain.local
AD_PORT=389
AD_USE_SSL=false
AD_DOMAIN=YOURDOMAIN
AD_BASE_DN=DC=yourdomain,DC=local
AD_USER_SEARCH_BASE=OU=Users,DC=yourdomain,DC=local
AD_GROUP_SEARCH_BASE=OU=Groups,DC=yourdomain,DC=local
AD_BIND_USER=CN=svc_ai_app,OU=ServiceAccounts,DC=yourdomain,DC=local
AD_BIND_PASSWORD=<ad-service-account-password>
AD_ADMIN_GROUP=CN=AI-Admins,OU=Groups,DC=yourdomain,DC=local

# ---- LLM Engine (Ollama) ----
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_DEFAULT_MODEL=mistral:7b
LLM_TIMEOUT=120
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.7

# ---- Session / Security ----
SESSION_SECRET=<generate-another-64-character-random-string>
SESSION_EXPIRE_MINUTES=480
SESSION_COOKIE_NAME=org_ai_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_HTTPONLY=true
SESSION_COOKIE_SAMESITE=strict

# ---- Rate Limiting (disabled for internal use) ----
RATE_LIMIT_ENABLED=false
RATE_LIMIT_REQUESTS=0
RATE_LIMIT_WINDOW_SECONDS=0

# ---- Logging ----
LOG_LEVEL=INFO
LOG_FILE=logs/app.log

# ---- Admin ----
ADMIN_GROUPS=["AI-Admins","IT-Admins"]

# ---- Local Admin (break-glass emergency account) ----
LOCAL_ADMIN_ENABLED=true
LOCAL_ADMIN_USERNAME=admin
LOCAL_ADMIN_PASSWORD=<change-this-to-a-strong-password>
LOCAL_ADMIN_DISPLAY_NAME=Local Administrator
LOCAL_ADMIN_EMAIL=admin@yourdomain.local
```

### Generate Random Secret Keys

```bash
# Linux
python3.12 -c "import secrets; print(secrets.token_hex(32))"

# Windows PowerShell
python -c "import secrets; print(secrets.token_hex(32))"
```

Run this twice — once for `SECRET_KEY` and once for `SESSION_SECRET`. Paste the outputs into your `.env` file.

---

## 10. Set Up Python Virtual Environment & Install Dependencies

### Linux

```bash
cd /opt/org-ai/backend

# Create virtual environment
python3.12 -m venv venv

# Activate
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

# Install bcrypt 5.x (overrides passlib's older version)
pip install bcrypt==5.0.0
```

### Windows

```powershell
cd C:\org-ai\backend

# Create virtual environment
python -m venv venv

# Activate
.\venv\Scripts\Activate.ps1

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

# Install bcrypt 5.x
pip install bcrypt==5.0.0
```

### Verify Installation

```bash
pip list | grep -i "fastapi\|uvicorn\|sqlalchemy\|asyncpg\|bcrypt"
```

Expected output should show: fastapi 0.115.0, uvicorn 0.30.0, sqlalchemy 2.0.35, asyncpg 0.29.0, bcrypt 5.0.0

---

## 11. Create the Database & Run Migrations

### Update alembic.ini

Edit `backend/alembic.ini` and update the database connection string:

```ini
sqlalchemy.url = postgresql://org_ai_user:YOUR_DB_PASSWORD@localhost:5432/org_ai
```

### Run Migrations

```bash
cd /opt/org-ai/backend
source venv/bin/activate   # Linux
# .\venv\Scripts\Activate.ps1   # Windows

alembic upgrade head
```

Expected output:

```
INFO  [alembic.runtime.migration] Running upgrade  -> 001, initial schema
INFO  [alembic.runtime.migration] Running upgrade 001 -> 002, add local admin columns
INFO  [alembic.runtime.migration] Running upgrade 002 -> 003, add indexes pinned archived
INFO  [alembic.runtime.migration] Running upgrade 003 -> 004, add file uploads table
INFO  [alembic.runtime.migration] Running upgrade 004 -> 005, add search vector audit retention
INFO  [alembic.runtime.migration] Running upgrade 005 -> 006, add features tables
```

### Verify Tables Were Created

```bash
sudo -u postgres psql -d org_ai -c "\dt"
```

You should see tables like: `users`, `conversations`, `messages`, `system_settings`, `audit_logs`, `file_uploads`, `message_feedback`, `prompt_templates`, `conversation_tags`, `conversation_tag_links`, `announcements`, `shared_conversations`, `message_bookmarks`, `alembic_version`

---

## 12. Install Frontend Dependencies & Build for Production

```bash
cd /opt/org-ai/frontend

# Install dependencies
npm install

# Build for production
npm run build
```

This creates a `frontend/dist/` folder with optimized static files.

### Verify Build

```bash
ls -la dist/
```

You should see `index.html`, `assets/` folder with `.js` and `.css` files.

---

## 13. Test Everything Locally (Quick Smoke Test)

Before setting up services, do a quick sanity check.

### Terminal 1 — Start Backend

```bash
cd /opt/org-ai/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Terminal 2 — Test Backend

```bash
# Health check
curl http://localhost:8000/api/health

# Expected: {"status":"healthy","database":"connected","llm":"connected"}
```

### Terminal 3 — Serve Frontend (temporary test)

```bash
cd /opt/org-ai/frontend
npx serve dist -l 3000
```

Open a browser and go to `http://server-ip:3000`. You should see the login page.

### Test Login

- Username: `admin`
- Password: `your_admin_password` (as configured in LOCAL_ADMIN_PASSWORD in .env)

If login succeeds, all components are working. **Stop all test processes** (Ctrl+C) before proceeding.

---

## 14. Set Up the Backend as a System Service

### Linux (systemd)

```bash
sudo nano /etc/systemd/system/org-ai-backend.service
```

Paste this content:

```ini
[Unit]
Description=Organization AI Backend (FastAPI)
After=network.target postgresql.service ollama.service
Requires=postgresql.service

[Service]
Type=exec
User=www-data
Group=www-data
WorkingDirectory=/opt/org-ai/backend
Environment="PATH=/opt/org-ai/backend/venv/bin"
ExecStart=/opt/org-ai/backend/venv/bin/uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 8 \
    --log-level info
Restart=always
RestartSec=5
StandardOutput=append:/opt/org-ai/backend/logs/app.log
StandardError=append:/opt/org-ai/backend/logs/error.log

[Install]
WantedBy=multi-user.target
```

```bash
# Set ownership
sudo chown -R www-data:www-data /opt/org-ai

# Reload systemd
sudo systemctl daemon-reload

# Start the service
sudo systemctl start org-ai-backend

# Enable on boot
sudo systemctl enable org-ai-backend

# Check status
sudo systemctl status org-ai-backend
```

Expected: Active (running) with 8 worker processes.

### Windows (NSSM — Non-Sucking Service Manager)

1. Download NSSM from https://nssm.cc/download
2. Extract and copy `nssm.exe` to `C:\Windows\System32\`
3. Install the service:

```powershell
nssm install OrgAI-Backend "C:\org-ai\backend\venv\Scripts\uvicorn.exe" "app.main:app --host 0.0.0.0 --port 8000 --workers 8"
nssm set OrgAI-Backend AppDirectory "C:\org-ai\backend"
nssm set OrgAI-Backend Start SERVICE_AUTO_START
nssm start OrgAI-Backend
```

---

## 15. Set Up Nginx Reverse Proxy with SSL

### Install Nginx

```bash
sudo apt install -y nginx
```

### Get SSL Certificate

#### Option A: Internal CA (recommended for enterprise)

Get a certificate from your organization's Certificate Authority for `ai.yourdomain.local`.

Place the files:
- Certificate: `/etc/nginx/ssl/ai.yourdomain.local.crt`
- Private key: `/etc/nginx/ssl/ai.yourdomain.local.key`

```bash
sudo mkdir -p /etc/nginx/ssl
sudo cp your-cert.crt /etc/nginx/ssl/ai.yourdomain.local.crt
sudo cp your-key.key /etc/nginx/ssl/ai.yourdomain.local.key
sudo chmod 600 /etc/nginx/ssl/*
```

#### Option B: Self-signed certificate (for testing only)

```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/ai.yourdomain.local.key \
    -out /etc/nginx/ssl/ai.yourdomain.local.crt \
    -subj "/CN=ai.yourdomain.local"
```

### Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/org-ai
```

Paste this configuration:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name ai.yourdomain.local;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ai.yourdomain.local;

    # SSL
    ssl_certificate     /etc/nginx/ssl/ai.yourdomain.local.crt;
    ssl_certificate_key /etc/nginx/ssl/ai.yourdomain.local.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # API routes → Backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # LLM streaming support
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;

        # Timeout for LLM responses (models can take time)
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Frontend static files
    location / {
        root /opt/org-ai/frontend/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

### Enable & Start Nginx

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/org-ai /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Expected: nginx: configuration file /etc/nginx/nginx.conf test is successful

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### Verify

Open a browser and navigate to `https://ai.yourdomain.local`. You should see the login page.

---

## 16. Configure Active Directory / LDAP (Optional)

If you want staff to log in with their AD credentials, update these values in `backend/.env`:

```ini
AD_ENABLED=true
AD_SERVER=ldap://your-domain-controller.yourdomain.local
AD_PORT=389
AD_USE_SSL=false
AD_DOMAIN=YOURDOMAIN
AD_BASE_DN=DC=yourdomain,DC=local
AD_USER_SEARCH_BASE=OU=Users,DC=yourdomain,DC=local
AD_GROUP_SEARCH_BASE=OU=Groups,DC=yourdomain,DC=local
AD_BIND_USER=CN=svc_ai_app,OU=ServiceAccounts,DC=yourdomain,DC=local
AD_BIND_PASSWORD=<service-account-password>
AD_ADMIN_GROUP=CN=AI-Admins,OU=Groups,DC=yourdomain,DC=local
```

### AD Service Account Requirements

1. Create a service account in AD (e.g., `svc_ai_app`)
2. Grant it **read-only** access to the Users and Groups OUs
3. Password should never expire (set in AD)
4. The account does NOT need admin privileges

### AD Groups for Admin Access

Create an AD group called `AI-Admins`. Any user in this group will have admin privileges in the application.

### Test AD Connection

```bash
cd /opt/org-ai/backend
source venv/bin/activate
python -c "
from ldap3 import Server, Connection
server = Server('ldap://your-dc.yourdomain.local', port=389)
conn = Connection(server, 'CN=svc_ai_app,OU=ServiceAccounts,DC=yourdomain,DC=local', 'password')
print('Connected:', conn.bind())
"
```

### Restart Backend After Changes

```bash
sudo systemctl restart org-ai-backend
```

> **Note:** The local admin account (`admin` / your password) always works even when AD is enabled. This is a break-glass emergency access account.

---

## 17. Firewall & Network Configuration

### Linux (UFW)

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to backend and Ollama from outside
# (they should only be accessed via Nginx on localhost)
sudo ufw deny 8000/tcp
sudo ufw deny 11434/tcp

# Enable firewall
sudo ufw enable
sudo ufw status
```

### Windows Firewall

```powershell
# Allow HTTPS
New-NetFirewallRule -DisplayName "Org AI HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Allow HTTP (for redirect)
New-NetFirewallRule -DisplayName "Org AI HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# Block direct backend access from network
New-NetFirewallRule -DisplayName "Block Backend Direct" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Block -RemoteAddress Any
```

### DNS Configuration

Add a DNS A record pointing `ai.yourdomain.local` to your server's IP address in your internal DNS server.

---

## 18. First Login & Admin Setup

### Step 1: Open the Application

Navigate to `https://ai.yourdomain.local` in your browser.

### Step 2: Login with Local Admin

- **Username:** `admin`
- **Password:** The password you set in `LOCAL_ADMIN_PASSWORD` in `.env`

### Step 3: Change Default Admin Password

Go to **Admin Panel → Settings** and change the `LOCAL_ADMIN_PASSWORD` to a strong password. Click **Save Settings**.

### Step 4: Verify System Health

Go to **Admin Panel → Overview**:
- ✅ Database: Connected
- ✅ LLM: Connected (Ollama)
- ✅ All services green

### Step 5: Configure LLM Model

Go to **Admin Panel → Settings**:
- Set `LLM_DEFAULT_MODEL` to `mistral:7b`
- Verify `LLM_BASE_URL` is `http://localhost:11434`
- Click **Save Settings**

### Step 6: Test Chat

Go to the main chat interface and send a test message:
> "Hello, please write a short professional email to schedule a meeting."

If you get a response, the AI is working correctly.

### Step 7: Configure Enterprise Features

From the **Admin Panel**, set up the new enterprise features:
- **Announcements tab:** Create a welcome announcement for users
- **Templates tab:** Add prompt templates organized by category (e.g., "Email", "Code", "Analysis")
- **Feedback tab:** Monitor user satisfaction metrics once users start rating responses
- **Settings:** Configure data retention policies if needed

### Step 8: Test AD Login (if AD is enabled)

Log out and log in with an AD user account to verify LDAP authentication works.

---

## 19. Docker Deployment (Alternative)

If you prefer Docker instead of bare-metal installation:

### Prerequisites

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install -y docker-compose-plugin
```

### Step 1: Create the root .env file

```bash
cd /opt/org-ai
cp .env.example .env
nano .env
```

Update all values (same as Step 9 above, but change `DATABASE_HOST=db` instead of `localhost`).

### Step 2: Build and Start

```bash
docker compose up -d --build
```

### Step 3: Run Migrations

```bash
docker compose exec backend alembic upgrade head
```

### Step 4: Pull Model into Ollama Container

```bash
docker compose exec ollama ollama pull mistral:7b
```

### Step 5: Verify

```bash
docker compose ps
# All 4 services should be "Up"

curl http://localhost:8000/api/health
# {"status":"healthy"}
```

### Docker Commands Reference

```bash
docker compose up -d          # Start all services
docker compose down           # Stop all services
docker compose logs -f        # View live logs
docker compose logs backend   # View backend logs only
docker compose restart backend # Restart backend only
docker compose exec backend bash # Shell into backend container
```

---

## 20. Windows Server Deployment (Alternative)

If deploying on Windows Server without Docker:

### Step 1: Install All Prerequisites

1. Install PostgreSQL 16+ (Windows installer)
2. Install Python 3.12 (check "Add to PATH")
3. Install Node.js 20 LTS
4. Install Ollama for Windows
5. Install NSSM (for running as Windows services)

### Step 2: Set Up the Application

```powershell
# Copy project to C:\org-ai
cd C:\org-ai\backend

# Create venv and install
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install bcrypt==5.0.0

# Run migrations
alembic upgrade head

# Build frontend
cd C:\org-ai\frontend
npm install
npm run build
```

### Step 3: Create Windows Services

```powershell
# Backend service
nssm install OrgAI-Backend "C:\org-ai\backend\venv\Scripts\uvicorn.exe" "app.main:app --host 0.0.0.0 --port 8000 --workers 8"
nssm set OrgAI-Backend AppDirectory "C:\org-ai\backend"
nssm set OrgAI-Backend Start SERVICE_AUTO_START

# Start the service
nssm start OrgAI-Backend
```

### Step 4: Set Up IIS as Reverse Proxy (instead of Nginx)

1. Install IIS via Server Manager → Add Roles → Web Server (IIS)
2. Install **URL Rewrite** module: https://www.iis.net/downloads/microsoft/url-rewrite
3. Install **Application Request Routing (ARR)**: https://www.iis.net/downloads/microsoft/application-request-routing
4. Create a new website in IIS pointing to `C:\org-ai\frontend\dist`
5. Add URL Rewrite rules to proxy `/api/*` requests to `http://localhost:8000`

### Step 5: Quick Development Mode (without services)

For testing, run from the project root:

```powershell
cd C:\org-ai
npm install
npm run dev
```

This starts both backend and frontend using `concurrently`.

---

## 21. Backup & Maintenance

### Database Backup

#### Daily Automated Backup (Linux cron)

```bash
sudo crontab -e
```

Add this line (backs up daily at 2 AM):

```
0 2 * * * pg_dump -U org_ai_user -h localhost org_ai | gzip > /opt/backups/org_ai_$(date +\%Y\%m\%d).sql.gz
```

```bash
sudo mkdir -p /opt/backups
```

#### Manual Backup

```bash
pg_dump -U org_ai_user -h localhost org_ai > backup_$(date +%Y%m%d).sql
```

#### Restore from Backup

```bash
psql -U org_ai_user -h localhost org_ai < backup_20260225.sql
```

### Application Updates

```bash
# 1. Stop the backend
sudo systemctl stop org-ai-backend

# 2. Pull latest code
cd /opt/org-ai
git pull origin main

# 3. Update Python dependencies
cd backend
source venv/bin/activate
pip install -r requirements.txt

# 4. Run any new migrations
alembic upgrade head

# 5. Rebuild frontend
cd ../frontend
npm install
npm run build

# 6. Restart the backend
sudo systemctl start org-ai-backend
```

### Log Rotation (Linux)

```bash
sudo nano /etc/logrotate.d/org-ai
```

```
/opt/org-ai/backend/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

### Monitor Disk Space

```bash
# Check Ollama models size
du -sh ~/.ollama/models/

# Check database size
sudo -u postgres psql -d org_ai -c "SELECT pg_size_pretty(pg_database_size('org_ai'));"

# Check log sizes
du -sh /opt/org-ai/backend/logs/
```

---

## 22. Troubleshooting

### Backend Won't Start

```bash
# Check service logs
sudo journalctl -u org-ai-backend -n 50 --no-pager

# Check application logs
tail -f /opt/org-ai/backend/logs/app.log

# Common fixes:
# 1. Database not running
sudo systemctl status postgresql

# 2. Wrong database credentials
psql -U org_ai_user -h localhost -d org_ai -c "SELECT 1;"

# 3. Port already in use
sudo lsof -i :8000
```

### Ollama Not Responding

```bash
# Check Ollama service
sudo systemctl status ollama

# Check if model is loaded
curl http://localhost:11434/api/tags

# Restart Ollama
sudo systemctl restart ollama

# Check Ollama logs
journalctl -u ollama -n 50 --no-pager
```

### LLM Responses Are Slow

- This is normal for CPU-only. First request after idle loads the model (~10–30 seconds).
- Subsequent requests: 2–15 seconds depending on complexity.
- Ensure `OLLAMA_KEEP_ALIVE=24h` is set to avoid reloading the model.

### Frontend Shows Blank Page

```bash
# Check if dist folder exists
ls /opt/org-ai/frontend/dist/

# If not, rebuild
cd /opt/org-ai/frontend && npm run build

# Check Nginx config
sudo nginx -t
sudo systemctl restart nginx
```

### "502 Bad Gateway" in Browser

```bash
# Backend is not running
sudo systemctl status org-ai-backend

# Restart it
sudo systemctl restart org-ai-backend

# Verify backend is listening
curl http://localhost:8000/api/health
```

### Database Connection Errors

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -U org_ai_user -h localhost -d org_ai

# Check pool exhaustion (in app logs)
grep -i "pool" /opt/org-ai/backend/logs/app.log | tail -20
```

### Login Fails / Wrong Password

```bash
# Clear Python cache (can cause stale auth code)
find /opt/org-ai/backend -type d -name __pycache__ -exec rm -rf {} +

# Restart
sudo systemctl restart org-ai-backend
```

### AD/LDAP Login Fails

```bash
# Test LDAP connectivity
python3.12 -c "
from ldap3 import Server, Connection
s = Server('ldap://your-dc', port=389)
c = Connection(s, 'CN=svc_ai_app,OU=ServiceAccounts,DC=yourdomain,DC=local', 'password')
print('Bind:', c.bind())
print('Result:', c.result)
"
```

---

## 23. Quick Reference / Cheat Sheet

### Service Commands (Linux)

| Action | Command |
|--------|---------|
| Start backend | `sudo systemctl start org-ai-backend` |
| Stop backend | `sudo systemctl stop org-ai-backend` |
| Restart backend | `sudo systemctl restart org-ai-backend` |
| Backend status | `sudo systemctl status org-ai-backend` |
| Backend logs | `sudo journalctl -u org-ai-backend -f` |
| Start Nginx | `sudo systemctl start nginx` |
| Restart Nginx | `sudo systemctl restart nginx` |
| Start Ollama | `sudo systemctl start ollama` |
| Restart Ollama | `sudo systemctl restart ollama` |
| Start PostgreSQL | `sudo systemctl start postgresql` |

### Service Commands (Windows)

| Action | Command |
|--------|---------|
| Start backend | `nssm start OrgAI-Backend` |
| Stop backend | `nssm stop OrgAI-Backend` |
| Restart backend | `nssm restart OrgAI-Backend` |
| Start Ollama | Start Ollama from Start Menu |
| Quick dev mode | `cd C:\org-ai; npm run dev` |

### Key URLs

| URL | Purpose |
|-----|---------|
| `https://ai.yourdomain.local` | Main application |
| `https://ai.yourdomain.local/admin` | Admin panel |
| `http://localhost:8000/api/health` | Backend health check |
| `http://localhost:8000/api/docs` | API documentation (Swagger) |
| `http://localhost:11434` | Ollama API |

### Key File Locations

| File | Purpose |
|------|---------|
| `/opt/org-ai/backend/.env` | All application configuration |
| `/opt/org-ai/backend/logs/app.log` | Application logs |
| `/opt/org-ai/frontend/dist/` | Built frontend files |
| `/etc/nginx/sites-available/org-ai` | Nginx configuration |
| `/etc/systemd/system/org-ai-backend.service` | Backend service definition |
| `~/.ollama/models/` | Downloaded AI models |

### Default Credentials

| Account | Username | Password |
|---------|----------|----------|
| Local Admin | `admin` | Set in `.env` → `LOCAL_ADMIN_PASSWORD` |
| Database | `org_ai_user` | Set in `.env` → `DATABASE_PASSWORD` |

### Deployment Checklist

- [ ] Server meets hardware requirements (16+ cores, 32+ GB RAM)
- [ ] Ubuntu 22.04 or Windows Server 2022 installed and updated
- [ ] PostgreSQL installed and running
- [ ] Python 3.12 installed
- [ ] Node.js 20 LTS installed
- [ ] Ollama installed and running
- [ ] AI model pulled (`mistral:7b`)
- [ ] Application code copied to server
- [ ] `.env` file configured with production values
- [ ] Secret keys generated (SECRET_KEY, SESSION_SECRET)
- [ ] Database password is strong and unique
- [ ] Local admin password changed from default
- [ ] Python venv created and dependencies installed
- [ ] Database migrations run (`alembic upgrade head`)
- [ ] Frontend built (`npm run build`)
- [ ] Backend service created and enabled
- [ ] Nginx configured with SSL
- [ ] SSL certificate installed
- [ ] DNS record created for `ai.yourdomain.local`
- [ ] Firewall configured (only 80/443 open externally)
- [ ] Backend health check passes
- [ ] Login works (local admin)
- [ ] Chat works (test message gets AI response)
- [ ] AD/LDAP login works (if enabled)
- [ ] Automated database backups configured
- [ ] Log rotation configured

---

**End of Deployment Guide**
