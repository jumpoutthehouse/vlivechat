@echo off
setlocal enabledelayedexpansion
echo ============================================
echo  vlivechat - Setup Database PostgreSQL
echo ============================================
echo.

:: Find PostgreSQL bin directory (try common versions)
set PG_BIN=
for %%v in (17 16 15 14 13) do (
  if exist "C:\Program Files\PostgreSQL\%%v\bin\psql.exe" (
    set PG_BIN=C:\Program Files\PostgreSQL\%%v\bin
    echo Ditemukan PostgreSQL %%v di: !PG_BIN!
    goto :found_pg
  )
)

:not_found
echo [ERROR] PostgreSQL tidak ditemukan!
echo Pastikan PostgreSQL sudah terinstall via:
echo   winget install --id PostgreSQL.PostgreSQL.17
pause
exit /b 1

:found_pg
echo.
set /p PG_SUPERPASS=Masukkan password postgres (default: postgres): 
if "!PG_SUPERPASS!"=="" set PG_SUPERPASS=postgres
set PGPASSWORD=!PG_SUPERPASS!

echo.
echo [1] Testing koneksi ke PostgreSQL...
"!PG_BIN!\psql" -U postgres -c "SELECT version();" 2>&1
if errorlevel 1 (
  echo [ERROR] Tidak bisa terhubung ke PostgreSQL!
  echo Coba jalankan PostgreSQL service terlebih dahulu.
  pause
  exit /b 1
)

echo.
echo [2] Membuat user 'vlcuser'...
"!PG_BIN!\psql" -U postgres -c "CREATE USER vlcuser WITH PASSWORD 'vlcpassword123';" 2>&1

echo.
echo [3] Membuat database 'vlivechat'...
"!PG_BIN!\psql" -U postgres -c "CREATE DATABASE vlivechat OWNER vlcuser;" 2>&1
"!PG_BIN!\psql" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE vlivechat TO vlcuser;" 2>&1
"!PG_BIN!\psql" -U postgres -c "ALTER DATABASE vlivechat OWNER TO vlcuser;" 2>&1
"!PG_BIN!\psql" -U postgres -d vlivechat -c "GRANT ALL ON SCHEMA public TO vlcuser;" 2>&1

echo.
echo [4] Menjalankan migrasi schema...
cd /d "%~dp0"
set PGPASSWORD=vlcpassword123
node src\db\migrate.js
if errorlevel 1 (
  echo [ERROR] Migrasi gagal! Cek output di atas.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  Setup Selesai!
echo ============================================
echo.
echo  Database : vlivechat
echo  User     : vlcuser
echo  Password : vlcpassword123
echo.
echo  Login Dashboard:
echo  URL      : http://localhost:5173
echo  Email    : superadmin@vlivechat.com
echo  Password : SuperAdmin@2024!
echo.
echo  Sekarang jalankan: start-all.bat
echo ============================================
echo.
pause
