@echo off
title Ollama Server
echo ============================================
echo   Starting Ollama Server
echo ============================================
echo.

if "%OLLAMA_NUM_PARALLEL%"=="" set OLLAMA_NUM_PARALLEL=8
set OLLAMA_HOST=0.0.0.0:11434

echo  OLLAMA_NUM_PARALLEL = %OLLAMA_NUM_PARALLEL%
echo  OLLAMA_HOST         = %OLLAMA_HOST%
echo.

REM Auto-detect Ollama installation
where ollama >nul 2>&1
if %errorlevel%==0 (
    ollama serve
) else (
    echo ERROR: ollama not found in PATH.
    echo Install Ollama from https://ollama.com
    echo Then add it to your system PATH.
    pause
    exit /b 1
)
pause
