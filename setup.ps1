# ============================================================
#  Organization AI -- One-Click Setup (Windows)
# ============================================================
#  Run: Right-click -> "Run with PowerShell"
#  Or:  powershell -ExecutionPolicy Bypass -File setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Write-Banner {
    Write-Host ""
    Write-Host "  +----------------------------------------------+" -ForegroundColor Cyan
    Write-Host "  |       Organization AI -- Setup Wizard         |" -ForegroundColor Cyan
    Write-Host "  |       Enterprise AI Chat Assistant            |" -ForegroundColor Cyan
    Write-Host "  +----------------------------------------------+" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($num, $text) {
    Write-Host "  [$num] $text" -ForegroundColor Yellow
}

function Write-Ok($text) {
    Write-Host "   [OK] $text" -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host "   [!!] $text" -ForegroundColor DarkYellow
}

function Write-Fail($text) {
    Write-Host "   [XX] $text" -ForegroundColor Red
}

function Confirm-Continue($message) {
    $answer = Read-Host "  $message (Y/n)"
    if ($answer -and $answer.ToLower() -ne "y") {
        Write-Host "  Aborted by user." -ForegroundColor Red
        exit 0
    }
}

# ---------------------------------------------------
#  HARDWARE DETECTION
# ---------------------------------------------------
function Get-HardwareInfo {
    Write-Host ""
    Write-Host "  --- Hardware Detection ---" -ForegroundColor Magenta
    Write-Host ""

    # CPU
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $cpuName = $cpu.Name.Trim()
    $cores = $cpu.NumberOfCores
    $threads = $cpu.NumberOfLogicalProcessors
    Write-Host "  CPU:      $cpuName" -ForegroundColor White
    Write-Host "  Cores:    $cores physical / $threads logical" -ForegroundColor White

    # RAM
    $ramBytes = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
    $ramGB = [math]::Round($ramBytes / 1GB, 1)
    Write-Host "  RAM:      $ramGB GB" -ForegroundColor White

    # GPU
    $gpuName = "None detected"
    $vramGB = 0
    $hasNvidiaGpu = $false
    try {
        $nvsmi = & "nvidia-smi" --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null
        if ($LASTEXITCODE -eq 0 -and $nvsmi) {
            $parts = $nvsmi.Split(",")
            $gpuName = $parts[0].Trim()
            $vramGB = [math]::Round([double]$parts[1].Trim() / 1024, 1)
            $hasNvidiaGpu = $true
        }
    } catch {}

    if (-not $hasNvidiaGpu) {
        $wmiGpu = Get-CimInstance Win32_VideoController | Where-Object { $_.AdapterRAM -gt 0 } | Select-Object -First 1
        if ($wmiGpu) {
            $gpuName = $wmiGpu.Name
            $vramGB = [math]::Round($wmiGpu.AdapterRAM / 1GB, 1)
        }
    }

    Write-Host "  GPU:      $gpuName" -ForegroundColor White
    if ($vramGB -gt 0) {
        Write-Host "  VRAM:     $vramGB GB" -ForegroundColor White
    }

    # Disk free space
    $drive = (Get-Item $ProjectRoot).PSDrive
    $freeGB = [math]::Round($drive.Free / 1GB, 1)
    Write-Host "  Disk:     $freeGB GB free on $($drive.Name):\" -ForegroundColor White

    # Recommendation
    Write-Host ""
    Write-Host "  --- Recommended Configuration ---" -ForegroundColor Magenta
    Write-Host ""

    $recommendedModel = ""
    $recommendedParallel = 4
    $recommendedPoolSize = 50
    $recommendedWorkers = 8

    if ($vramGB -ge 16) {
        $recommendedModel = "llama3.1:8b"
        $recommendedParallel = 16
        $recommendedPoolSize = 100
        $recommendedWorkers = 16
        Write-Ok 'High-end GPU -- Recommended: llama3.1:8b (200 plus parallel users)'
    } elseif ($vramGB -ge 6) {
        $recommendedModel = "llama3.1:8b"
        $recommendedParallel = 12
        $recommendedPoolSize = 100
        $recommendedWorkers = 12
        Write-Ok 'Mid-range GPU -- Recommended: llama3.1:8b (80-200 parallel users)'
    } elseif ($vramGB -ge 3) {
        $recommendedModel = "gemma3:4b"
        $recommendedParallel = 8
        $recommendedPoolSize = 50
        $recommendedWorkers = 8
        Write-Ok 'Entry GPU -- Recommended: gemma3:4b (30-80 parallel users)'
    } elseif ($ramGB -ge 16) {
        $recommendedModel = "gemma3:4b"
        $recommendedParallel = 4
        $recommendedPoolSize = 50
        $recommendedWorkers = 8
        Write-Warn ("CPU-only with " + $ramGB + "GB RAM -- Recommended: gemma3:4b (1-30 parallel users)")
    } else {
        $recommendedModel = "gemma3:1b"
        $recommendedParallel = 2
        $recommendedPoolSize = 20
        $recommendedWorkers = 4
        Write-Warn 'Limited hardware -- Recommended: gemma3:1b (1-10 users)'
    }

    if ($ramGB -lt 8) {
        Write-Fail 'WARNING: Less than 8GB RAM. Performance will be very limited.'
    }

    if ($freeGB -lt 10) {
        Write-Fail 'WARNING: Less than 10GB free disk space. Model download requires 3-8GB.'
    }

    Write-Host ""
    Write-Host "  Model:              $recommendedModel" -ForegroundColor Cyan
    Write-Host "  Parallel requests:  $recommendedParallel" -ForegroundColor Cyan
    Write-Host "  DB pool size:       $recommendedPoolSize" -ForegroundColor Cyan
    Write-Host "  Backend workers:    $recommendedWorkers" -ForegroundColor Cyan
    if ($hasNvidiaGpu) {
        Write-Host "  GPU acceleration:   Enabled (NVIDIA)" -ForegroundColor Cyan
    } else {
        Write-Host "  GPU acceleration:   Disabled (CPU-only)" -ForegroundColor Cyan
    }
    Write-Host ""

    return @{
        RamGB = $ramGB
        VramGB = $vramGB
        Cores = $cores
        Threads = $threads
        FreeGB = $freeGB
        HasNvidiaGpu = $hasNvidiaGpu
        Model = $recommendedModel
        Parallel = $recommendedParallel
        PoolSize = $recommendedPoolSize
        Workers = $recommendedWorkers
        GpuLayers = $(if ($hasNvidiaGpu) { -1 } else { 0 })
    }
}

# ---------------------------------------------------
#  PREREQUISITE CHECKS
# ---------------------------------------------------
function Test-Prerequisites {
    Write-Host "  --- Checking Prerequisites ---" -ForegroundColor Magenta
    Write-Host ""

    $allOk = $true

    # Python
    $pythonCmd = $null
    foreach ($cmd in @("python", "python3")) {
        try {
            $ver = & $cmd --version 2>&1
            if ($ver -match "Python 3\.(\d+)") {
                $minor = [int]$Matches[1]
                if ($minor -ge 11) {
                    $pythonCmd = $cmd
                    Write-Ok "Python: $ver"
                    break
                } else {
                    Write-Fail "Python $ver found but 3.11+ required"
                }
            }
        } catch {}
    }
    if (-not $pythonCmd) {
        Write-Fail "Python 3.11+ not found. Download: https://www.python.org/downloads/"
        Write-Fail "  -> Make sure 'Add Python to PATH' is checked during install"
        $allOk = $false
    }

    # Node.js
    try {
        $nodeVer = & node --version 2>&1
        if ($nodeVer -match "v(\d+)") {
            $major = [int]$Matches[1]
            if ($major -ge 18) {
                Write-Ok "Node.js: $nodeVer"
            } else {
                Write-Fail "Node.js $nodeVer found but v18+ required"
                $allOk = $false
            }
        }
    } catch {
        Write-Fail "Node.js not found. Download: https://nodejs.org/"
        $allOk = $false
    }

    # PostgreSQL
    $pgAvailable = $false
    try {
        $pgVer = & psql --version 2>&1
        if ($pgVer -match "(\d+\.\d+)") {
            Write-Ok "PostgreSQL: $pgVer"
            $pgAvailable = $true
        }
    } catch {}
    if (-not $pgAvailable) {
        $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
        if ($pgService -and $pgService.Status -eq "Running") {
            Write-Ok "PostgreSQL: Service running (psql not in PATH)"
            $pgAvailable = $true
        } else {
            Write-Fail "PostgreSQL not found. Download: https://www.postgresql.org/download/windows/"
            $allOk = $false
        }
    }

    # Ollama
    $ollamaAvailable = $false
    try {
        $ollamaCheck = & ollama --version 2>&1
        Write-Ok "Ollama: Installed"
        $ollamaAvailable = $true
    } catch {
        Write-Fail "Ollama not found. Download: https://ollama.com/download/windows"
        $allOk = $false
    }

    Write-Host ""
    return @{
        AllOk = $allOk
        PythonCmd = $pythonCmd
        PgAvailable = $pgAvailable
        OllamaAvailable = $ollamaAvailable
    }
}

# ---------------------------------------------------
#  ENVIRONMENT CONFIGURATION
# ---------------------------------------------------
function Set-Environment($hw) {
    Write-Step 1 "Configuring environment..."

    $envFile = Join-Path $ProjectRoot "backend\.env"
    $envExample = Join-Path $ProjectRoot ".env.example"

    if (Test-Path $envFile) {
        Write-Ok "backend\.env already exists"
        $overwrite = Read-Host "   Overwrite with fresh config? (y/N)"
        if ($overwrite.ToLower() -ne "y") {
            Write-Ok "Keeping existing .env"
            return
        }
    }

    # Generate secrets
    $secretKey = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    $sessionSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object { [char]$_ })

    # Ask for database password
    Write-Host ""
    $dbPassword = Read-Host "   Enter a PostgreSQL password (for new DB user 'org_ai_user')"
    if (-not $dbPassword) {
        $dbPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 20 | ForEach-Object { [char]$_ })
        Write-Warn "No password entered. Auto-generated: $dbPassword"
        Write-Warn "Save this password -- you will need it if you reconfigure later."
    }

    # Ask for admin password
    $adminPassword = Read-Host "   Enter a password for the local admin account"
    if (-not $adminPassword) {
        $adminPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
        Write-Warn "No password entered. Auto-generated: $adminPassword"
        Write-Warn "Username: admin / Password: $adminPassword"
    }

    # Determine GPU settings
    $gpuLayers = $hw.GpuLayers
    $numThread = 0  # auto-detect

    $envContent = @"
# ============================================================
# Organization AI -- Generated by setup.ps1
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# ============================================================

# ---- Application ----
APP_NAME=Organization AI Assistant
APP_ENV=development
SECRET_KEY=$secretKey
CORS_ORIGINS=["http://localhost:3000","http://localhost:3005"]
ALLOWED_HOSTS=["localhost","127.0.0.1"]

# ---- Database (PostgreSQL) ----
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=org_ai
DATABASE_USER=org_ai_user
DATABASE_PASSWORD=$dbPassword
DATABASE_POOL_SIZE=$($hw.PoolSize)
DATABASE_MAX_OVERFLOW=$([math]::Max(5, [int]($hw.PoolSize / 2)))

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
LLM_DEFAULT_MODEL=$($hw.Model)
LLM_TIMEOUT=300
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.7
LLM_NUM_CTX=4096
LLM_NUM_GPU=$gpuLayers
LLM_NUM_THREAD=$numThread

# ---- Chat Performance ----
CHAT_MAX_CONTEXT_MESSAGES=20
CHAT_MAX_CONTEXT_CHARS=16000

# ---- Session / Security ----
SESSION_SECRET=$sessionSecret
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
LOCAL_ADMIN_PASSWORD=$adminPassword
LOCAL_ADMIN_DISPLAY_NAME=Local Administrator
LOCAL_ADMIN_EMAIL=admin@local
"@

    Set-Content -Path $envFile -Value $envContent -Encoding UTF8 -NoNewline
    Write-Ok "backend\.env created with hardware-optimized settings"
}

# ---------------------------------------------------
#  PYTHON SETUP
# ---------------------------------------------------
function Install-PythonDeps($pythonCmd) {
    Write-Step 2 "Setting up Python backend..."

    $venvPath = Join-Path $ProjectRoot "backend\venv"

    if (-not (Test-Path (Join-Path $venvPath "Scripts\python.exe"))) {
        Write-Host "   Creating virtual environment..." -ForegroundColor Gray
        & $pythonCmd -m venv $venvPath
        Write-Ok "Virtual environment created"
    } else {
        Write-Ok "Virtual environment exists"
    }

    $pip = Join-Path $venvPath "Scripts\pip.exe"
    $python = Join-Path $venvPath "Scripts\python.exe"

    Write-Host "   Installing Python dependencies (this may take 2-5 minutes)..." -ForegroundColor Gray
    $ErrorActionPreference_Bak = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & $pip install --upgrade pip --quiet --timeout 120 2>&1 | Out-Null
    & $pip install -r (Join-Path $ProjectRoot "backend\requirements.txt") --quiet --timeout 120 2>&1 | Out-Null
    $pipExit = $LASTEXITCODE
    $ErrorActionPreference = $ErrorActionPreference_Bak
    if ($pipExit -ne 0) {
        Write-Host "   Retrying with verbose output..." -ForegroundColor Yellow
        & $pip install -r (Join-Path $ProjectRoot "backend\requirements.txt") --timeout 120
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Failed to install Python dependencies"
            exit 1
        }
    }
    Write-Ok "Python dependencies installed"
}

# ---------------------------------------------------
#  NODE SETUP
# ---------------------------------------------------
function Install-NodeDeps {
    Write-Step 3 "Setting up Node.js frontend..."

    Push-Location (Join-Path $ProjectRoot "frontend")
    Write-Host "   Installing frontend dependencies..." -ForegroundColor Gray
    $ErrorActionPreference_Bak = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & npm install --silent 2>&1 | Out-Null
    $npmExit = $LASTEXITCODE
    $ErrorActionPreference = $ErrorActionPreference_Bak
    if ($npmExit -ne 0) {
        & npm install
    }
    Pop-Location

    Push-Location $ProjectRoot
    Write-Host "   Installing root dependencies..." -ForegroundColor Gray
    $ErrorActionPreference_Bak = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & npm install --silent 2>&1 | Out-Null
    $npmExit = $LASTEXITCODE
    $ErrorActionPreference = $ErrorActionPreference_Bak
    if ($npmExit -ne 0) {
        & npm install
    }
    Pop-Location

    Write-Ok "Node.js dependencies installed"
}

# ---------------------------------------------------
#  DATABASE SETUP
# ---------------------------------------------------
function Initialize-Database {
    Write-Step 4 "Setting up database..."

    $envFile = Join-Path $ProjectRoot "backend\.env"
    $dbPassword = ""
    $dbUser = "org_ai_user"
    $dbName = "org_ai"
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^DATABASE_PASSWORD=(.+)$") { $dbPassword = $Matches[1] }
        if ($_ -match "^DATABASE_USER=(.+)$") { $dbUser = $Matches[1] }
        if ($_ -match "^DATABASE_NAME=(.+)$") { $dbName = $Matches[1] }
    }

    # Try creating DB using psql
    $psqlAvailable = $false
    try {
        & psql --version 2>$null | Out-Null
        $psqlAvailable = $LASTEXITCODE -eq 0
    } catch {}

    if ($psqlAvailable) {
        Write-Host "   Creating database and user..." -ForegroundColor Gray
        $pgPassword = Read-Host "   Enter your PostgreSQL superuser (postgres) password"

        $env:PGPASSWORD = $pgPassword
        try {
            $userExists = & psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='$dbUser'" 2>$null
            if ($userExists -ne "1") {
                & psql -U postgres -h localhost -c "CREATE USER $dbUser WITH PASSWORD '$dbPassword';" 2>$null
                Write-Ok "Database user '$dbUser' created"
            } else {
                & psql -U postgres -h localhost -c "ALTER USER $dbUser WITH PASSWORD '$dbPassword';" 2>$null
                Write-Ok "Database user '$dbUser' already exists (password updated)"
            }

            $dbExists = & psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'" 2>$null
            if ($dbExists -ne "1") {
                & psql -U postgres -h localhost -c "CREATE DATABASE $dbName OWNER $dbUser;" 2>$null
                Write-Ok "Database '$dbName' created"
            } else {
                Write-Ok "Database '$dbName' already exists"
            }

            & psql -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE $dbName TO $dbUser;" 2>$null
        } finally {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
    } else {
        Write-Warn "psql not in PATH. Please create the database manually:"
        Write-Host ""
        Write-Host "   CREATE USER $dbUser WITH PASSWORD '$dbPassword';" -ForegroundColor Gray
        Write-Host "   CREATE DATABASE $dbName OWNER $dbUser;" -ForegroundColor Gray
        Write-Host "   GRANT ALL PRIVILEGES ON DATABASE $dbName TO $dbUser;" -ForegroundColor Gray
        Write-Host ""
        Read-Host "   Press Enter after creating the database"
    }

    # Run migrations
    Write-Host "   Running database migrations..." -ForegroundColor Gray
    $python = Join-Path $ProjectRoot "backend\venv\Scripts\python.exe"
    $alembic = Join-Path $ProjectRoot "backend\venv\Scripts\alembic.exe"

    Push-Location (Join-Path $ProjectRoot "backend")
    $ErrorActionPreference_Bak = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $migrationOutput = & $alembic upgrade head 2>&1
    $migrationExit = $LASTEXITCODE
    $ErrorActionPreference = $ErrorActionPreference_Bak

    if ($migrationExit -eq 0) {
        $migrationOutput | ForEach-Object {
            if ("$_" -match "Running upgrade") { Write-Host "   $_" -ForegroundColor Gray }
        }
        Write-Ok "Database migrations complete"
    } else {
        Write-Fail "Migration failed. Error details:"
        $migrationOutput | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
        Write-Host ""
        Write-Host "   Common fixes:" -ForegroundColor Yellow
        Write-Host "   - Ensure PostgreSQL is running (check Services)" -ForegroundColor Gray
        Write-Host "   - Ensure password in backend\.env matches the DB user password" -ForegroundColor Gray
        Write-Host "   - Try manually: cd backend && venv\Scripts\alembic.exe upgrade head" -ForegroundColor Gray
    }
    Pop-Location
}

# ---------------------------------------------------
#  OLLAMA MODEL PULL
# ---------------------------------------------------
function Install-OllamaModel($hw) {
    Write-Step 5 "Setting up Ollama AI model..."

    # Start Ollama if not running
    $ollamaRunning = Get-Process ollama -ErrorAction SilentlyContinue
    if (-not $ollamaRunning) {
        Write-Host "   Starting Ollama..." -ForegroundColor Gray
        $si = New-Object System.Diagnostics.ProcessStartInfo
        $si.FileName = (Get-Command ollama).Source
        $si.Arguments = "serve"
        $si.WindowStyle = "Hidden"
        $si.UseShellExecute = $true
        [System.Diagnostics.Process]::Start($si) | Out-Null
        Start-Sleep 3
    }

    # Check if model is already pulled
    $model = $hw.Model
    $modelList = & ollama list 2>$null
    if ($modelList -match [regex]::Escape($model)) {
        Write-Ok "Model '$model' already available"
        return
    }

    Write-Host "   Downloading model '$model' (this may take 5-15 minutes)..." -ForegroundColor Gray
    Write-Host "   Model size: ~2-5 GB depending on model" -ForegroundColor Gray
    Write-Host ""
    & ollama pull $model
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Model '$model' downloaded successfully"
    } else {
        Write-Fail "Failed to download model '$model'"
        Write-Warn "You can download it later with: ollama pull $model"
    }
}

# ---------------------------------------------------
#  LOGS DIRECTORY
# ---------------------------------------------------
function Initialize-Logs {
    $logsDir = Join-Path $ProjectRoot "logs"
    if (-not (Test-Path $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    }
    $backendLogs = Join-Path $ProjectRoot "backend\logs"
    if (-not (Test-Path $backendLogs)) {
        New-Item -ItemType Directory -Path $backendLogs -Force | Out-Null
    }
}

# ===================================================
#  MAIN
# ===================================================
Write-Banner

# 1. Detect hardware
$hw = Get-HardwareInfo
Confirm-Continue "Proceed with setup using these settings?"

# 2. Check prerequisites
$prereqs = Test-Prerequisites
if (-not $prereqs.AllOk) {
    Write-Host ""
    Write-Fail "Some prerequisites are missing. Install them and run this script again."
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

Confirm-Continue "All prerequisites found. Start installation?"

Write-Host ""
Write-Host "  --- Installing ---" -ForegroundColor Magenta
Write-Host ""

# 3. Configure .env
Set-Environment $hw

# 4. Python backend
Install-PythonDeps $prereqs.PythonCmd

# 5. Node.js frontend
Install-NodeDeps

# 6. Create log directories
Initialize-Logs

# 7. Database
Initialize-Database

# 8. Ollama model
if ($prereqs.OllamaAvailable) {
    Install-OllamaModel $hw
}

# ---------------------------------------------------
#  DONE
# ---------------------------------------------------
Write-Host ""
Write-Host "  +----------------------------------------------+" -ForegroundColor Green
Write-Host "  |         Setup Complete!                       |" -ForegroundColor Green
Write-Host "  +----------------------------------------------+" -ForegroundColor Green
Write-Host ""
Write-Host "  To start the application:" -ForegroundColor White
Write-Host ""
Write-Host "    cd $ProjectRoot" -ForegroundColor Cyan
Write-Host "    npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Then open: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "  Login:" -ForegroundColor White
Write-Host "    Username: admin" -ForegroundColor Gray
Write-Host "    Password: (the admin password you set during setup)" -ForegroundColor Gray
Write-Host ""
Write-Host "  For production deployment, see DEPLOYMENT.md" -ForegroundColor Gray
Write-Host ""

Read-Host "  Press Enter to exit"
