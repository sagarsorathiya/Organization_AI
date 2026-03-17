#!/usr/bin/env bash
# ============================================================
#  Organization AI — One-Click Setup (Linux / macOS)
# ============================================================
#  Run:  chmod +x setup.sh && ./setup.sh
# ============================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# ─── Colors ────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

banner()  { echo -e "\n${CYAN}  ╔══════════════════════════════════════════════╗"; echo "  ║       Organization AI — Setup Wizard         ║"; echo -e "  ╚══════════════════════════════════════════════╝${NC}\n"; }
step()    { echo -e "  ${YELLOW}[$1]${NC} $2"; }
ok()      { echo -e "   ${GREEN}✓${NC} $1"; }
warn()    { echo -e "   ${YELLOW}⚠${NC} $1"; }
fail()    { echo -e "   ${RED}✗${NC} $1"; }

confirm() {
    read -rp "  $1 (Y/n) " ans
    if [[ -n "$ans" && "${ans,,}" != "y" ]]; then
        echo -e "  ${RED}Aborted by user.${NC}"
        exit 0
    fi
}

generate_secret() {
    python3 -c "import secrets; print(secrets.token_urlsafe($1))" 2>/dev/null \
        || openssl rand -base64 "$1" 2>/dev/null \
        || head -c "$1" /dev/urandom | base64 | tr -d '=+/' | head -c "$1"
}

# ═══════════════════════════════════════════════
#  HARDWARE DETECTION
# ═══════════════════════════════════════════════
detect_hardware() {
    echo -e "\n  ${MAGENTA}─── Hardware Detection ───${NC}\n"

    # CPU
    if [[ -f /proc/cpuinfo ]]; then
        CPU_NAME=$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | xargs)
        CORES=$(grep -c "^processor" /proc/cpuinfo)
        PHYSICAL_CORES=$(grep "core id" /proc/cpuinfo | sort -u | wc -l)
        [[ "$PHYSICAL_CORES" -eq 0 ]] && PHYSICAL_CORES=$CORES
    elif command -v sysctl &>/dev/null; then
        CPU_NAME=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Unknown")
        CORES=$(sysctl -n hw.logicalcpu 2>/dev/null || echo "?")
        PHYSICAL_CORES=$(sysctl -n hw.physicalcpu 2>/dev/null || echo "?")
    else
        CPU_NAME="Unknown"
        CORES="?"
        PHYSICAL_CORES="?"
    fi
    echo -e "  ${WHITE}CPU:      ${CPU_NAME}${NC}"
    echo -e "  ${WHITE}Cores:    ${PHYSICAL_CORES} physical / ${CORES} logical${NC}"

    # RAM
    if [[ -f /proc/meminfo ]]; then
        RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        RAM_GB=$(awk "BEGIN {printf \"%.1f\", $RAM_KB/1048576}")
    elif command -v sysctl &>/dev/null; then
        RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
        RAM_GB=$(awk "BEGIN {printf \"%.1f\", $RAM_BYTES/1073741824}")
    else
        RAM_GB="0"
    fi
    echo -e "  ${WHITE}RAM:      ${RAM_GB} GB${NC}"

    # GPU
    GPU_NAME="None detected"
    VRAM_GB=0
    HAS_NVIDIA=false

    if command -v nvidia-smi &>/dev/null; then
        GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null || true)
        if [[ -n "$GPU_INFO" ]]; then
            GPU_NAME=$(echo "$GPU_INFO" | cut -d, -f1 | xargs)
            VRAM_MB=$(echo "$GPU_INFO" | cut -d, -f2 | xargs)
            VRAM_GB=$(awk "BEGIN {printf \"%.1f\", $VRAM_MB/1024}")
            HAS_NVIDIA=true
        fi
    fi
    echo -e "  ${WHITE}GPU:      ${GPU_NAME}${NC}"
    [[ "$VRAM_GB" != "0" ]] && echo -e "  ${WHITE}VRAM:     ${VRAM_GB} GB${NC}"

    # Disk
    FREE_GB=$(df -BG "$PROJECT_ROOT" 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}')
    [[ -z "$FREE_GB" ]] && FREE_GB="?"
    echo -e "  ${WHITE}Disk:     ${FREE_GB} GB free${NC}"

    # Recommendation
    echo -e "\n  ${MAGENTA}─── Recommended Configuration ───${NC}\n"

    VRAM_INT=${VRAM_GB%.*}
    RAM_INT=${RAM_GB%.*}

    if [[ "$VRAM_INT" -ge 16 ]]; then
        REC_MODEL="llama3.1:8b"; REC_PARALLEL=16; REC_POOL=100; REC_WORKERS=16
        ok "High-end GPU — Recommended: llama3.1:8b (200+ parallel users)"
    elif [[ "$VRAM_INT" -ge 6 ]]; then
        REC_MODEL="llama3.1:8b"; REC_PARALLEL=12; REC_POOL=100; REC_WORKERS=12
        ok "Mid-range GPU — Recommended: llama3.1:8b (80-200 parallel users)"
    elif [[ "$VRAM_INT" -ge 3 ]]; then
        REC_MODEL="gemma3:4b"; REC_PARALLEL=8; REC_POOL=50; REC_WORKERS=8
        ok "Entry GPU — Recommended: gemma3:4b (30-80 parallel users)"
    elif [[ "$RAM_INT" -ge 16 ]]; then
        REC_MODEL="gemma3:4b"; REC_PARALLEL=4; REC_POOL=50; REC_WORKERS=8
        warn "CPU-only with ${RAM_GB}GB RAM — Recommended: gemma3:4b (1-30 parallel users)"
    else
        REC_MODEL="gemma3:1b"; REC_PARALLEL=2; REC_POOL=20; REC_WORKERS=4
        warn "Limited hardware — Recommended: gemma3:1b (1-10 users)"
    fi

    [[ "$RAM_INT" -lt 8 ]] && fail "WARNING: Less than 8GB RAM. Performance will be very limited."
    [[ "${FREE_GB}" != "?" && "$FREE_GB" -lt 10 ]] && fail "WARNING: Less than 10GB free disk space."

    GPU_LAYERS=0
    [[ "$HAS_NVIDIA" == "true" ]] && GPU_LAYERS=-1

    echo ""
    echo -e "  ${CYAN}Model:              ${REC_MODEL}${NC}"
    echo -e "  ${CYAN}Parallel requests:  ${REC_PARALLEL}${NC}"
    echo -e "  ${CYAN}DB pool size:       ${REC_POOL}${NC}"
    echo -e "  ${CYAN}Backend workers:    ${REC_WORKERS}${NC}"
    if [[ "$HAS_NVIDIA" == "true" ]]; then
        echo -e "  ${CYAN}GPU acceleration:   Enabled (NVIDIA)${NC}"
    else
        echo -e "  ${CYAN}GPU acceleration:   Disabled (CPU-only)${NC}"
    fi
    echo ""
}

# ═══════════════════════════════════════════════
#  PREREQUISITE CHECKS
# ═══════════════════════════════════════════════
PYTHON_CMD=""
PG_AVAILABLE=false
OLLAMA_AVAILABLE=false

check_prerequisites() {
    echo -e "  ${MAGENTA}─── Checking Prerequisites ───${NC}\n"

    ALL_OK=true

    # Python
    for cmd in python3 python; do
        if command -v "$cmd" &>/dev/null; then
            PY_VER=$("$cmd" --version 2>&1)
            if [[ "$PY_VER" =~ Python\ 3\.([0-9]+) ]]; then
                MINOR="${BASH_REMATCH[1]}"
                if [[ "$MINOR" -ge 11 ]]; then
                    PYTHON_CMD="$cmd"
                    ok "Python: $PY_VER"
                    break
                fi
            fi
        fi
    done
    if [[ -z "$PYTHON_CMD" ]]; then
        fail "Python 3.11+ not found. Install: sudo apt install python3 python3-venv python3-pip"
        ALL_OK=false
    fi

    # Node.js
    if command -v node &>/dev/null; then
        NODE_VER=$(node --version)
        if [[ "$NODE_VER" =~ v([0-9]+) && "${BASH_REMATCH[1]}" -ge 18 ]]; then
            ok "Node.js: $NODE_VER"
        else
            fail "Node.js $NODE_VER found but v18+ required"
            ALL_OK=false
        fi
    else
        fail "Node.js not found. Install: https://nodejs.org/ or: sudo apt install nodejs npm"
        ALL_OK=false
    fi

    # PostgreSQL
    if command -v psql &>/dev/null; then
        PG_VER=$(psql --version 2>&1)
        ok "PostgreSQL: $PG_VER"
        PG_AVAILABLE=true
    elif systemctl is-active --quiet postgresql 2>/dev/null; then
        ok "PostgreSQL: Service running (psql not in PATH)"
        PG_AVAILABLE=true
    else
        fail "PostgreSQL not found. Install: sudo apt install postgresql postgresql-contrib"
        ALL_OK=false
    fi

    # Ollama
    if command -v ollama &>/dev/null; then
        ok "Ollama: Installed"
        OLLAMA_AVAILABLE=true
    else
        fail "Ollama not found. Install: curl -fsSL https://ollama.com/install.sh | sh"
        ALL_OK=false
    fi

    echo ""
    if [[ "$ALL_OK" != "true" ]]; then
        fail "Some prerequisites are missing. Install them and run this script again."
        exit 1
    fi
}

# ═══════════════════════════════════════════════
#  ENVIRONMENT CONFIGURATION
# ═══════════════════════════════════════════════
setup_environment() {
    step 1 "Configuring environment..."

    ENV_FILE="$PROJECT_ROOT/backend/.env"

    if [[ -f "$ENV_FILE" ]]; then
        ok "backend/.env already exists"
        read -rp "   Overwrite with fresh config? (y/N) " overwrite
        if [[ "${overwrite,,}" != "y" ]]; then
            ok "Keeping existing .env"
            return
        fi
    fi

    SECRET_KEY=$(generate_secret 48)
    SESSION_SECRET=$(generate_secret 48)

    echo ""
    read -rp "   Enter a PostgreSQL password (for new DB user 'org_ai_user'): " DB_PASSWORD
    if [[ -z "$DB_PASSWORD" ]]; then
        DB_PASSWORD=$(generate_secret 20)
        warn "No password entered. Auto-generated: $DB_PASSWORD"
        warn "Save this password — you'll need it if you reconfigure later."
    fi

    read -rp "   Enter a password for the local admin account: " ADMIN_PASSWORD
    if [[ -z "$ADMIN_PASSWORD" ]]; then
        ADMIN_PASSWORD=$(generate_secret 16)
        warn "No password entered. Auto-generated: $ADMIN_PASSWORD"
        warn "Username: admin / Password: $ADMIN_PASSWORD"
    fi

    POOL_OVERFLOW=$(( REC_POOL / 2 ))
    [[ "$POOL_OVERFLOW" -lt 5 ]] && POOL_OVERFLOW=5

    cat > "$ENV_FILE" << ENVEOF
# ============================================================
# Organization AI — Generated by setup.sh
# Generated: $(date '+%Y-%m-%d %H:%M:%S')
# ============================================================

# ---- Application ----
APP_NAME=Organization AI Assistant
APP_ENV=development
SECRET_KEY=${SECRET_KEY}
CORS_ORIGINS=["http://localhost:3000","http://localhost:3005"]
ALLOWED_HOSTS=["localhost","127.0.0.1"]

# ---- Database (PostgreSQL) ----
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=org_ai
DATABASE_USER=org_ai_user
DATABASE_PASSWORD=${DB_PASSWORD}
DATABASE_POOL_SIZE=${REC_POOL}
DATABASE_MAX_OVERFLOW=${POOL_OVERFLOW}

# ---- Active Directory / LDAP ----
AD_ENABLED=false
AD_SERVER=ldap://your-dc.domain.local
AD_PORT=389
AD_USE_SSL=false
AD_DOMAIN=YOURDOMAIN
AD_BASE_DN=DC=yourdomain,DC=local
AD_USER_SEARCH_BASE=OU=Users,DC=yourdomain,DC=local
AD_GROUP_SEARCH_BASE=OU=Groups,DC=yourdomain,DC=local
AD_BIND_USER=
AD_BIND_PASSWORD=
AD_ADMIN_GROUP=CN=AI-Admins,OU=Groups,DC=yourdomain,DC=local

# ---- LLM Engine (Ollama) ----
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_DEFAULT_MODEL=${REC_MODEL}
LLM_TIMEOUT=300
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.7
LLM_NUM_CTX=4096
LLM_NUM_GPU=${GPU_LAYERS}
LLM_NUM_THREAD=0

# ---- Chat Performance ----
CHAT_MAX_CONTEXT_MESSAGES=20
CHAT_MAX_CONTEXT_CHARS=16000

# ---- Session / Security ----
SESSION_SECRET=${SESSION_SECRET}
SESSION_EXPIRE_MINUTES=480
SESSION_COOKIE_NAME=org_ai_session
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_HTTPONLY=true
SESSION_COOKIE_SAMESITE=lax

# ---- Rate Limiting ----
RATE_LIMIT_ENABLED=false
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_WINDOW_SECONDS=60

# ---- File Attachments ----
ATTACHMENTS_ENABLED=true

# ---- Logging ----
LOG_LEVEL=INFO
LOG_FILE=logs/app.log

# ---- Admin Groups ----
ADMIN_GROUPS=["AI-Admins","IT-Admins"]

# ---- Local Admin (break-glass account) ----
LOCAL_ADMIN_ENABLED=true
LOCAL_ADMIN_USERNAME=admin
LOCAL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
LOCAL_ADMIN_DISPLAY_NAME=Local Administrator
LOCAL_ADMIN_EMAIL=admin@local
ENVEOF

    ok "backend/.env created with hardware-optimized settings"
}

# ═══════════════════════════════════════════════
#  PYTHON SETUP
# ═══════════════════════════════════════════════
setup_python() {
    step 2 "Setting up Python backend..."

    VENV_DIR="$PROJECT_ROOT/backend/venv"

    if [[ ! -f "$VENV_DIR/bin/python" ]]; then
        echo -e "   ${GRAY}Creating virtual environment...${NC}"
        "$PYTHON_CMD" -m venv "$VENV_DIR"
        ok "Virtual environment created"
    else
        ok "Virtual environment exists"
    fi

    echo -e "   ${GRAY}Installing Python dependencies (this may take 1-2 minutes)...${NC}"
    "$VENV_DIR/bin/pip" install --upgrade pip -q 2>/dev/null
    if ! "$VENV_DIR/bin/pip" install -r "$PROJECT_ROOT/backend/requirements.txt" -q 2>/dev/null; then
        "$VENV_DIR/bin/pip" install -r "$PROJECT_ROOT/backend/requirements.txt"
    fi
    ok "Python dependencies installed"
}

# ═══════════════════════════════════════════════
#  NODE SETUP
# ═══════════════════════════════════════════════
setup_node() {
    step 3 "Setting up Node.js frontend..."

    echo -e "   ${GRAY}Installing frontend dependencies...${NC}"
    (cd "$PROJECT_ROOT/frontend" && npm install --silent 2>/dev/null || npm install)

    echo -e "   ${GRAY}Installing root dependencies...${NC}"
    (cd "$PROJECT_ROOT" && npm install --silent 2>/dev/null || npm install)

    ok "Node.js dependencies installed"
}

# ═══════════════════════════════════════════════
#  DATABASE SETUP
# ═══════════════════════════════════════════════
setup_database() {
    step 4 "Setting up database..."

    # Read vars from .env
    DB_PASSWORD=$(grep "^DATABASE_PASSWORD=" "$PROJECT_ROOT/backend/.env" | cut -d= -f2)
    DB_USER=$(grep "^DATABASE_USER=" "$PROJECT_ROOT/backend/.env" | cut -d= -f2)
    DB_NAME=$(grep "^DATABASE_NAME=" "$PROJECT_ROOT/backend/.env" | cut -d= -f2)

    if [[ "$PG_AVAILABLE" == "true" ]] && command -v psql &>/dev/null; then
        echo -e "   ${GRAY}Creating database and user...${NC}"

        # Try peer auth first (common on Linux), fall back to password
        if sudo -u postgres psql -tAc "SELECT 1" &>/dev/null 2>&1; then
            # Peer authentication available
            USER_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null || true)
            if [[ "$USER_EXISTS" != "1" ]]; then
                sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null
                ok "Database user '$DB_USER' created"
            else
                sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null
                ok "Database user '$DB_USER' already exists (password updated)"
            fi

            DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || true)
            if [[ "$DB_EXISTS" != "1" ]]; then
                sudo -u postgres createdb -O "$DB_USER" "$DB_NAME" 2>/dev/null
                ok "Database '$DB_NAME' created"
            else
                ok "Database '$DB_NAME' already exists"
            fi
            sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null
        else
            warn "Could not connect to PostgreSQL via peer auth."
            warn "Please create the database manually:"
            echo ""
            echo -e "   ${GRAY}sudo -u postgres psql${NC}"
            echo -e "   ${GRAY}CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';${NC}"
            echo -e "   ${GRAY}CREATE DATABASE $DB_NAME OWNER $DB_USER;${NC}"
            echo -e "   ${GRAY}GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;${NC}"
            echo ""
            read -rp "   Press Enter after creating the database "
        fi
    else
        warn "psql not available. Please create the database manually."
        read -rp "   Press Enter after creating the database "
    fi

    # Run migrations
    echo -e "   ${GRAY}Running database migrations...${NC}"
    ALEMBIC="$PROJECT_ROOT/backend/venv/bin/alembic"

    (cd "$PROJECT_ROOT/backend" && "$ALEMBIC" upgrade head 2>&1 | grep -i "running upgrade" | while read -r line; do
        echo -e "   ${GRAY}$line${NC}"
    done)

    if [[ "${PIPESTATUS[0]:-0}" -eq 0 ]]; then
        ok "Database migrations complete"
    else
        fail "Migration failed — check database connection settings in backend/.env"
    fi
}

# ═══════════════════════════════════════════════
#  OLLAMA MODEL
# ═══════════════════════════════════════════════
setup_ollama_model() {
    step 5 "Setting up Ollama AI model..."

    # Start Ollama if not running
    if ! pgrep -x ollama &>/dev/null; then
        echo -e "   ${GRAY}Starting Ollama...${NC}"
        ollama serve &>/dev/null &
        sleep 3
    fi

    MODEL_LIST=$(ollama list 2>/dev/null || true)
    if echo "$MODEL_LIST" | grep -q "$REC_MODEL"; then
        ok "Model '$REC_MODEL' already available"
        return
    fi

    echo -e "   ${GRAY}Downloading model '$REC_MODEL' (this may take 5-15 minutes)...${NC}"
    echo -e "   ${GRAY}Model size: ~2-5 GB depending on model${NC}"
    echo ""

    if ollama pull "$REC_MODEL"; then
        ok "Model '$REC_MODEL' downloaded successfully"
    else
        fail "Failed to download model '$REC_MODEL'"
        warn "You can download it later with: ollama pull $REC_MODEL"
    fi
}

# ═══════════════════════════════════════════════
#  LOG DIRECTORIES
# ═══════════════════════════════════════════════
setup_logs() {
    mkdir -p "$PROJECT_ROOT/logs" "$PROJECT_ROOT/backend/logs"
}

# ═══════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════
banner

# 1. Detect hardware
detect_hardware
confirm "Proceed with setup using these settings?"

# 2. Check prerequisites
check_prerequisites
confirm "All prerequisites found. Start installation?"

echo -e "\n  ${MAGENTA}─── Installing ───${NC}\n"

# 3. Configure .env
setup_environment

# 4. Python backend
setup_python

# 5. Node.js frontend
setup_node

# 6. Log directories
setup_logs

# 7. Database
setup_database

# 8. Ollama model
[[ "$OLLAMA_AVAILABLE" == "true" ]] && setup_ollama_model

# ─── DONE ──────────────────────────────────────
echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║         Setup Complete!                      ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${WHITE}To start the application:${NC}"
echo ""
echo -e "  ${CYAN}  cd $PROJECT_ROOT${NC}"
echo -e "  ${CYAN}  npm run dev${NC}"
echo ""
echo -e "  ${WHITE}Then open: http://localhost:3000${NC}"
echo ""
echo -e "  ${WHITE}Login:${NC}"
echo -e "  ${GRAY}  Username: admin${NC}"
echo -e "  ${GRAY}  Password: (the admin password you set during setup)${NC}"
echo ""
echo -e "  ${GRAY}For production deployment, see DEPLOYMENT.md${NC}"
echo ""
