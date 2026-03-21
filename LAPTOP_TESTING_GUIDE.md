# Organization AI — Laptop Testing Guide (Windows)

> **Purpose:** Set up and test the entire application on your Windows laptop before deploying to production.  
> **OS:** Windows 10 / 11  
> **Time needed:** ~30 minutes  

---

## Step 1: Install PostgreSQL

1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Run the installer
   - Set port to **5432** (default)
   - Set superuser password to **postgres123** (or any password you prefer)
   - Keep default data directory
   - Click **Next → Next → Finish**
3. Open **pgAdmin** (installed with PostgreSQL) or open **SQL Shell (psql)** from the Start Menu
4. Create the database:

```sql
CREATE DATABASE org_ai;
```

> If you used a different password, remember it — you'll need it in Step 5.

### Verify

Open a terminal and run:

```powershell
psql -U postgres -h localhost -c "SELECT 1;"
```

If it asks for a password and returns `1`, PostgreSQL is working.

---

## Step 2: Install Python 3.12

1. Download Python 3.12 from https://www.python.org/downloads/
2. Run the installer
   - ✅ **Check "Add Python to PATH"** (very important!)
   - Click **Install Now**
3. Verify:

```powershell
python --version
```

Expected: `Python 3.12.x`

---

## Step 3: Install Node.js 20

1. Download Node.js 20 LTS from https://nodejs.org/
2. Run the installer → click Next through everything
3. Verify:

```powershell
node --version
npm --version
```

---

## Step 4: Install Ollama

1. Download from https://ollama.com/download/windows
2. Run the installer
3. After installation, Ollama runs automatically in the system tray
4. Open a terminal and pull the AI model:

```powershell
ollama pull mistral:7b
```

> This downloads ~4.1 GB. Wait for it to complete.

5. Test the model:

```powershell
ollama run mistral:7b "Say hello in one sentence."
```

If you get a response, Ollama is working.

### Configure Ollama (Optional but Recommended)

Set these environment variables so the model stays loaded in memory:

```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_NUM_PARALLEL", "2", "User")
[System.Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "24h", "User")
```

**Restart Ollama** after setting these (right-click tray icon → Quit, then reopen Ollama).

---

## Step 5: Configure the Application

Open the file `backend\.env` in any text editor (Notepad, VS Code, etc.).

The key settings you may need to change:

| Setting | Current Value | Change If... |
|---------|--------------|--------------|
| `DATABASE_PASSWORD` | `postgres123` | You set a different password in Step 1 |
| `LLM_DEFAULT_MODEL` | `llama3` | Change to `mistral:7b` (the model you pulled) |

**Change `LLM_DEFAULT_MODEL`:**

```ini
LLM_DEFAULT_MODEL=mistral:7b
```

Save the file.

> All other settings are already configured for local development. No changes needed.

---

## Step 6: Set Up Python Backend

Open a terminal in the project folder:

```powershell
cd <PROJECT_ROOT>\backend
```

### Create Virtual Environment (first time only)

```powershell
python -m venv venv
```

### Activate Virtual Environment

```powershell
.\venv\Scripts\Activate.ps1
```

> If you get an error about execution policy, run this first:  
> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### Install Python Dependencies

```powershell
pip install --upgrade pip
pip install -r requirements.txt
pip install bcrypt==5.0.0
```

---

## Step 7: Run Database Migrations

With the virtual environment still active:

```powershell
cd <PROJECT_ROOT>\backend
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

This creates all the database tables (users, conversations, messages, settings, audit_logs, feedback, templates, tags, bookmarks, announcements, sharing, and more).

---

## Step 8: Install Frontend Dependencies

Open a **new terminal** (or deactivate the venv first):

```powershell
cd <PROJECT_ROOT>\frontend
npm install
```

Then install the root-level dependency:

```powershell
cd <PROJECT_ROOT>
npm install
```

---

## Step 9: Start the Application

From the project root folder:

```powershell
cd <PROJECT_ROOT>
npm run dev
```

This starts **both** the backend and frontend together. You should see:

```
[backend] INFO:     Uvicorn running on http://0.0.0.0:8000
[frontend] VITE v5.4.x  ready in xxx ms
[frontend]   ➜  Local:   http://localhost:3005/
```

---

## Step 10: Test the Application

### Open in Browser

Go to: **http://localhost:3005**

### Login

- **Username:** `admin`
- **Password:** `your_admin_password` (as set in your .env file)

### Test Chat

1. After login, you'll see the chat interface
2. Type a message: `Write a short professional email to schedule a meeting tomorrow at 2 PM.`
3. Wait for the AI response (first response may take 10-30 seconds while the model loads)

### Test Admin Panel

1. Click your profile / admin area
2. Check all 8 tabs:
   - **Overview** — shows system health (Database: connected, LLM: connected)
   - **Settings** — all configuration values (editable)
   - **Users** — user management
   - **Audit Logs** — activity logs
   - **Models** — available AI models
   - **Announcements** — create/toggle/delete banners for all users
   - **Templates** — create prompt templates with categories
   - **Feedback** — view satisfaction metrics and recent user feedback

### Test Enterprise Features

1. **Feedback:** Send a chat message, then click the 👍 or 👎 button on the AI response
2. **Templates:** Click the template button in the chat input to browse prompt templates
3. **Tags:** In the sidebar, create a tag using the "+ Tag" button, assign it to a conversation via the tag icon in conversation actions, then click the tag chip to filter conversations by that tag
4. **Bookmarks:** Click the bookmark icon on a message, then check the Bookmarks page
5. **Sharing:** Open a conversation, click Share, and generate a read-only link
6. **Announcements:** Create an announcement in Admin Panel → Announcements tab
7. **Export:** Go to Settings → Bulk Export to download all conversations as ZIP
8. **Usage Dashboard:** Go to Settings to see your personal usage statistics
9. **Archive:** Click the archive icon on a conversation, then switch to the "Archived" tab in the sidebar to see it — click the unarchive icon to restore
10. **File Uploads:** Click the attachment button in the chat input, upload a file (PDF, DOCX, TXT, etc.), and verify it appears in the message
11. **Password Change:** Go to Settings → Change Password section (visible for local accounts only) to change your password
12. **Admin Password Reset:** In Admin Panel → Users, click "Reset Password" on any local user account

### Verify Backend API Directly

Open a new terminal and run:

```powershell
# Health check
Invoke-RestMethod -Uri http://localhost:8000/api/health

# Should return:
# status    : healthy
# database  : connected
# llm       : connected
```

---

## Step 11: Stop the Application

Press **Ctrl+C** in the terminal where `npm run dev` is running.

Or force-stop everything:

```powershell
Get-Process -Name python -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

## Starting Again Later

Every time you want to test, just run:

```powershell
cd <PROJECT_ROOT>
npm run dev
```

Make sure PostgreSQL and Ollama are running first:
- **PostgreSQL**: Starts automatically with Windows (check Services if not)
- **Ollama**: Look for it in system tray. If not there, open Ollama from Start Menu.

Then open **http://localhost:3005** in your browser.

---

## Troubleshooting

### "Cannot connect to database"

PostgreSQL is not running. Open **Services** (Win+R → `services.msc`), find **postgresql**, right-click → Start.

### "LLM not connected" in Admin Panel

Ollama is not running. Open Ollama from the Start Menu. Then verify:

```powershell
curl http://localhost:11434/api/tags
```

### Chat gives no response / timeout

The model may not be pulled. Run:

```powershell
ollama list
```

If `mistral:7b` is not listed, pull it:

```powershell
ollama pull mistral:7b
```

### Frontend shows blank page

Frontend dependencies may be missing:

```powershell
cd <PROJECT_ROOT>\frontend
npm install
```

### "Port 8000 already in use"

A previous backend process is still running. Kill it:

```powershell
Get-Process -Name python -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Login fails even with correct password

Clear Python cache and restart:

```powershell
cd <PROJECT_ROOT>\backend
Get-ChildItem -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
cd ..
npm run dev
```

---

## Quick Reference

| What | Value |
|------|-------|
| **App URL** | http://localhost:3005 |
| **Admin Login** | username: `admin` / password: `your_admin_password` (as set in your .env file) |
| **Backend API** | http://localhost:8000 |
| **API Docs (Swagger)** | http://localhost:8000/api/docs |
| **Database** | localhost:5432 / database: `org_ai` |
| **Ollama** | http://localhost:11434 |
| **AI Model** | `mistral:7b` |
| **Start command** | `npm run dev` (from project root) |
| **Stop command** | Ctrl+C |
| **Project folder** | Your cloned project directory |

---

## What's Different from Production?

| Setting | Laptop (Dev) | Production Server |
|---------|-------------|-------------------|
| `APP_ENV` | development | production |
| `AD_ENABLED` | false | true (LDAP login) |
| `SESSION_COOKIE_SECURE` | false | true (HTTPS) |
| `LOG_LEVEL` | DEBUG | INFO |
| Backend | 1 worker (with --reload) | 8 workers |
| Frontend | Vite dev server | Built static files + Nginx |
| SSL/HTTPS | No | Yes |
| Reverse Proxy | No (direct access) | Nginx |

Once everything works on your laptop, follow [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) to deploy to the production server.
