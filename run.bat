@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is required. Install it from https://nodejs.org/ and reopen this window.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm is required. Install Node.js from https://nodejs.org/ and reopen this window.
    pause
    exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
    echo Dependencies are missing. Installing them now...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
)

echo Starting Echobriar...
call npm run dev -- --open
if errorlevel 1 (
    echo [ERROR] The development server stopped with an error.
    pause
    exit /b 1
)

endlocal
