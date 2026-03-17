# ============================================================
# Organization AI - Production Deployment Package Builder
# ============================================================
# Run: .\build-production-zip.ps1
# Output: Organization_AI_Production_<date>.zip
# ============================================================

$timestamp = Get-Date -Format "dd.MM.yyyy"
$projectRoot = $PSScriptRoot
$zipName = "Organization_AI_Production_$timestamp.zip"
$zipPath = Join-Path $projectRoot $zipName
$stagingDir = Join-Path $env:TEMP "org-ai-production-build"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Organization AI - Production Package Builder" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Clean previous staging ──
if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

$stageRoot = Join-Path $stagingDir "Organization_AI"
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

# ── Step 1: Build Frontend ──
Write-Host "[1/5] Building frontend..." -ForegroundColor Yellow
$frontendDir = Join-Path $projectRoot "frontend"

Push-Location $frontendDir
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing npm dependencies..." -ForegroundColor Gray
        & npm ci --silent 2>&1 | Out-Null
    }
    Write-Host "  Running production build (npm run build)..." -ForegroundColor Gray
    & npm run build 2>&1 | Out-String | Out-Null
    if (-not (Test-Path "dist\index.html")) {
        throw "Frontend build failed - dist/index.html not found"
    }
    Write-Host "  Frontend built successfully." -ForegroundColor Green
} finally {
    Pop-Location
}

# ── Step 2: Copy Backend ──
Write-Host "[2/5] Copying backend files..." -ForegroundColor Yellow
$backendDest = Join-Path $stageRoot "backend"
New-Item -ItemType Directory -Path $backendDest -Force | Out-Null

# Backend app code
Copy-Item (Join-Path $projectRoot "backend\app") $backendDest -Recurse -Force
# Remove __pycache__
Get-ChildItem $backendDest -Directory -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force

# Alembic migrations
Copy-Item (Join-Path $projectRoot "backend\alembic") $backendDest -Recurse -Force
Get-ChildItem (Join-Path $backendDest "alembic") -Directory -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force
Copy-Item (Join-Path $projectRoot "backend\alembic.ini") $backendDest -Force

# Requirements
Copy-Item (Join-Path $projectRoot "backend\requirements.txt") $backendDest -Force

# Production .env template (NOT the dev .env with real passwords)
Copy-Item (Join-Path $projectRoot "backend\.env.production") $backendDest -Force

# Dockerfile (in case they want Docker later)
if (Test-Path (Join-Path $projectRoot "backend\Dockerfile")) {
    Copy-Item (Join-Path $projectRoot "backend\Dockerfile") $backendDest -Force
}

# Create empty logs directory
New-Item -ItemType Directory -Path (Join-Path $backendDest "logs") -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $backendDest "logs\.gitkeep") -Force | Out-Null

Write-Host "  Backend copied." -ForegroundColor Green

# ── Step 3: Copy Frontend Build ──
Write-Host "[3/5] Copying frontend files..." -ForegroundColor Yellow
$frontendDest = Join-Path $stageRoot "frontend"
New-Item -ItemType Directory -Path $frontendDest -Force | Out-Null

# Pre-built static files (ready to serve)
Copy-Item (Join-Path $projectRoot "frontend\dist") $frontendDest -Recurse -Force

# Source files (for rebuilding if needed)
$frontendSrcDest = Join-Path $frontendDest "src"
Copy-Item (Join-Path $projectRoot "frontend\src") $frontendSrcDest -Recurse -Force
Copy-Item (Join-Path $projectRoot "frontend\public") $frontendDest -Recurse -Force
Copy-Item (Join-Path $projectRoot "frontend\index.html") $frontendDest -Force
Copy-Item (Join-Path $projectRoot "frontend\package.json") $frontendDest -Force
Copy-Item (Join-Path $projectRoot "frontend\package-lock.json") $frontendDest -Force
Copy-Item (Join-Path $projectRoot "frontend\vite.config.ts") $frontendDest -Force
Copy-Item (Join-Path $projectRoot "frontend\tsconfig.json") $frontendDest -Force
Copy-Item (Join-Path $projectRoot "frontend\tailwind.config.js") $frontendDest -Force
Copy-Item (Join-Path $projectRoot "frontend\postcss.config.js") $frontendDest -Force

# Dockerfile
if (Test-Path (Join-Path $projectRoot "frontend\Dockerfile")) {
    Copy-Item (Join-Path $projectRoot "frontend\Dockerfile") $frontendDest -Force
}
if (Test-Path (Join-Path $projectRoot "frontend\nginx.conf")) {
    Copy-Item (Join-Path $projectRoot "frontend\nginx.conf") $frontendDest -Force
}

Write-Host "  Frontend copied (dist/ + source)." -ForegroundColor Green

# ── Step 4: Copy Root Files ──
Write-Host "[4/5] Copying configuration & docs..." -ForegroundColor Yellow

# Docker Compose
if (Test-Path (Join-Path $projectRoot "docker-compose.yml")) {
    Copy-Item (Join-Path $projectRoot "docker-compose.yml") $stageRoot -Force
}

# Deployment configs
if (Test-Path (Join-Path $projectRoot "deployment")) {
    Copy-Item (Join-Path $projectRoot "deployment") $stageRoot -Recurse -Force
}

# .env example
if (Test-Path (Join-Path $projectRoot ".env.example")) {
    Copy-Item (Join-Path $projectRoot ".env.example") $stageRoot -Force
}

# Ollama start script
if (Test-Path (Join-Path $projectRoot "start-ollama.bat")) {
    Copy-Item (Join-Path $projectRoot "start-ollama.bat") $stageRoot -Force
}

# Documentation
$docs = @("README.md", "DEPLOYMENT.md", "DEPLOYMENT_WITHOUT_DOCKER.md", "DEPLOYMENT_GUIDE.md", "LAPTOP_TESTING_GUIDE.md", "Requirement.md")
foreach ($doc in $docs) {
    $docPath = Join-Path $projectRoot $doc
    if (Test-Path $docPath) {
        Copy-Item $docPath $stageRoot -Force
    }
}

Write-Host "  Config & docs copied." -ForegroundColor Green

# ── Step 5: Create ZIP ──
Write-Host "[5/5] Creating ZIP archive..." -ForegroundColor Yellow

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path $stageRoot -DestinationPath $zipPath -CompressionLevel Optimal

# Clean up staging
Remove-Item $stagingDir -Recurse -Force

# ── Summary ──
$zipSize = (Get-Item $zipPath).Length
$zipSizeMB = [math]::Round($zipSize / 1MB, 2)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " BUILD COMPLETE" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Output: $zipPath" -ForegroundColor White
Write-Host "  Size:   $zipSizeMB MB" -ForegroundColor White
Write-Host ""
Write-Host "  Contents:" -ForegroundColor White
Write-Host "    backend/         - Python app + Alembic migrations + requirements.txt" -ForegroundColor Gray
Write-Host "    backend/.env.production - Production config template" -ForegroundColor Gray
Write-Host "    frontend/dist/   - Pre-built static files (ready to serve)" -ForegroundColor Gray
Write-Host "    frontend/src/    - Source code (for rebuilding)" -ForegroundColor Gray
Write-Host "    deployment/      - Nginx config" -ForegroundColor Gray
Write-Host "    docker-compose.yml" -ForegroundColor Gray
Write-Host "    DEPLOYMENT.md    - Docker deployment guide" -ForegroundColor Gray
Write-Host "    DEPLOYMENT_WITHOUT_DOCKER.md - Bare metal guide" -ForegroundColor Gray
Write-Host ""
Write-Host "  NOT included (by design):" -ForegroundColor DarkYellow
Write-Host "    backend/.env             - Dev secrets" -ForegroundColor DarkYellow
Write-Host "    backend/venv/            - Python venv (recreate on server)" -ForegroundColor DarkYellow
Write-Host "    frontend/node_modules/   - npm packages (run npm ci on server)" -ForegroundColor DarkYellow
Write-Host "    __pycache__/             - Python bytecode" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "  Deploy: Copy ZIP to server, extract, follow DEPLOYMENT_WITHOUT_DOCKER.md" -ForegroundColor Cyan
Write-Host ""
