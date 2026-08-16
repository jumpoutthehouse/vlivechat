@echo off
setlocal
title vlivechat — Start All Services
echo.
echo  ==========================================
echo   vlivechat — Starting Services
echo  ==========================================
echo.

set ROOT=%~dp0
set PG_BIN=%ROOT%backend\pgsql\bin
set PG_DATA=%ROOT%backend\pgsql\data
set REDIS_EXE=%ROOT%backend\redis\redis-server.exe
set PG_LOG=%ROOT%backend\pgsql\logfile

:: ── 0. Cleanup proses lama ────────────────────────────────────
echo [0/4] Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
  taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
  taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5174 " ^| findstr "LISTENING"') do (
  taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo        Done.

:: ── 1. PostgreSQL ─────────────────────────────────────────────
echo [1/3] Starting PostgreSQL 16...
"%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -l "%PG_LOG%" start >nul 2>&1
timeout /t 2 /nobreak >nul
netstat -an 2>nul | find "5432" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] PostgreSQL failed to start! Check: %PG_LOG%
  pause
  exit /b 1
)
echo        PostgreSQL OK — port 5432

:: ── 2. Redis ──────────────────────────────────────────────────
echo [2/3] Starting Redis...
netstat -an 2>nul | find "6379" >nul 2>&1
if not errorlevel 1 (
  echo        Redis already running — port 6379
) else (
  start /b "" "%REDIS_EXE%" --port 6379 --daemonize no
  timeout /t 2 /nobreak >nul
  netstat -an 2>nul | find "6379" >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Redis failed to start!
    pause
    exit /b 1
  )
  echo        Redis OK — port 6379
)

:: ── 3. Backend ────────────────────────────────────────────────
echo [3/3] Starting Backend...
start "vlivechat Backend" cmd /c "cd /d %ROOT%backend && npm run dev"
timeout /t 3 /nobreak >nul

:: ── 4. Dashboard ──────────────────────────────────────────────
echo [4/4] Starting Dashboard...
start "vlivechat Dashboard" cmd /c "cd /d %ROOT%dashboard && npx vite --port 5173"
timeout /t 4 /nobreak >nul

echo.
echo  ==========================================
echo   All services started!
echo  ==========================================
echo.
echo   Backend API : http://localhost:3001/api/v1
echo   Health      : http://localhost:3001/health
echo   Dashboard   : http://localhost:5173
echo   Widget Demo : http://localhost:3001/widget/livechat-widget.html?w=demo_workspace^&apiBase=http://localhost:3001
echo.
echo   Login Superadmin:
echo     Email    : superadmin@vlivechat.com
echo     Password : SuperAdmin@2024!
echo.
echo   Login Admin Demo:
echo     Email    : admin@demo.com
echo     Password : Admin@2024!
echo.
timeout /t 3 /nobreak >nul
start http://localhost:5173
endlocal
