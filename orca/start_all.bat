@echo off
title ORCA Marine Project Launcher
echo ========================================================
echo   Launching ORCA Marine Reasoning Platform
echo ========================================================
echo.

echo [1/3] Starting Backend Geo on http://127.0.0.1:8000...
start "ORCA - Backend Geo (8000)" cmd /k "cd /d %~dp0backend-geo && (if exist .venv\Scripts\activate call .venv\Scripts\activate) && python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo [2/3] Starting Backend ORCA on http://127.0.0.1:8001...
start "ORCA - Backend ORCA (8001)" cmd /k "cd /d %~dp0backend-orca && (if exist .venv\Scripts\activate call .venv\Scripts\activate) && python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001 --reload"

timeout /t 3 /nobreak >nul

echo [3/3] Starting Frontend Next.js on http://localhost:3000...
start "ORCA - Frontend Next.js (3000)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================================
echo   All 3 services launched!
echo   Open your browser at: http://localhost:3000/dashboard
echo ========================================================
pause
