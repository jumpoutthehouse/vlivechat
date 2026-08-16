@echo off
setlocal
title vlivechat — Stop All Services
echo.
echo  ==========================================
echo   vlivechat — Stopping Services
echo  ==========================================
echo.

set ROOT=%~dp0
set PG_BIN=%ROOT%backend\pgsql\bin
set PG_DATA=%ROOT%backend\pgsql\data

echo [1/3] Stopping Backend...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| find "3001"') do taskkill /f /pid %%a >nul 2>&1
echo        Done.

echo [2/3] Stopping Dashboard (Vite)...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| find "5173"') do taskkill /f /pid %%a >nul 2>&1
echo        Done.

echo [3/3] Stopping PostgreSQL...
"%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" stop -m fast >nul 2>&1
echo        Done.

echo [4/4] Stopping Redis...
taskkill /f /im redis-server.exe >nul 2>&1
echo        Done.

echo.
echo  All services stopped.
echo.
pause
endlocal
