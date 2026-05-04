@echo off
chcp 65001 >nul
cd /d %~dp0

echo.
echo ======================================
echo   SonAgent Starting...
echo ======================================
echo.

:: Stop existing node process
echo [1/3] Stopping existing service...
taskkill /F /IM node.exe 2>nul
timeout /t 1 /nobreak >nul

:: Start service
echo [2/3] Starting service...
start "SonAgent" node server.js

timeout /t 2 /nobreak >nul

:: Check if started
tasklist | findstr /i "node.exe" >nul
if %errorlevel% equ 0 (
    echo.
    echo ======================================
    echo   OK! Service started!
    echo   Local: http://localhost:3000
    echo ======================================
    echo.
    start http://localhost:3000
) else (
    echo.
    echo ======================================
    echo   ERROR: Failed to start
    echo ======================================
    pause
)
