@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Play Store Proxy Server
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    pause
    exit /b
)

echo Starting server on http://localhost:3001
echo.
start http://localhost:3001
node playstore-server.js --serve
pause
