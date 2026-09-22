@echo off
REM Start the system on Windows with one command (Docker Desktop must be running)
REM   run.bat        Appliance mode
REM   run.bat saas   SaaS mode (HTTPS via Caddy)
chcp 65001 >nul
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-env.ps1
if errorlevel 1 exit /b 1

echo Building and starting containers...
if /I "%1"=="saas" (
    docker compose --profile saas up -d --build
) else (
    docker compose up -d --build
)
if errorlevel 1 exit /b 1

echo.
echo Started. Dashboard: http://localhost:3000   (SaaS mode: https://DOMAIN from .env)
echo Syslog: UDP/TCP port 514
echo Accounts: admin / viewerA / viewerB - passwords are in .env (ADMIN_PASSWORD, VIEWERA_PASSWORD, VIEWERB_PASSWORD)
echo API keys are in .env (API_KEYS)
pause
