@echo off
setlocal EnableDelayedExpansion
title MecSmart ERP - First-time Setup
call "%~dp0_env.bat"
cd /d "%ROOT%"

echo ==========================================================
echo   MecSmart ERP - Windows setup
echo   Root: %ROOT%
echo ==========================================================
echo.

python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python 3.10+ not found on PATH.
  echo         Install from https://www.python.org/downloads/windows/ and tick "Add python.exe to PATH".
  echo         If you see the Microsoft Store opening, disable the "python.exe" App execution alias in Windows Settings.
  pause & exit /b 1
)
where node >nul 2>&1 || (echo [ERROR] Node.js 20 LTS not found. Install from https://nodejs.org/ & pause & exit /b 1)
where yarn >nul 2>&1 || (echo [Yarn] not found - enabling via corepack... & call corepack enable)
where yarn >nul 2>&1 || (echo [ERROR] yarn still not available. Run "npm install -g yarn" in an Administrator prompt, then re-run setup.bat. & pause & exit /b 1)

echo.
echo [1/5] Python virtual environment + backend dependencies
if not exist "%BACKEND%\venv\Scripts\python.exe" python -m venv "%BACKEND%\venv"
set "PY=%BACKEND%\venv\Scripts\python.exe"
"%PY%" -m pip install --upgrade pip >nul
"%PY%" -m pip install -r "%BACKEND%\requirements-windows.txt"
if errorlevel 1 (echo [ERROR] pip install failed. & pause & exit /b 1)

echo.
echo [2/5] Chromium for PDF printing (playwright)
"%PY%" -m playwright install chromium
if errorlevel 1 echo [WARN] Chromium download failed - PDF export will not work until you run:  "%PY%" -m playwright install chromium

echo.
echo [3/5] Frontend dependencies (yarn install)
pushd "%FRONTEND%"
call yarn install
if errorlevel 1 (echo [ERROR] yarn install failed. & popd & pause & exit /b 1)
popd

echo.
echo [4/5] Environment files
if not exist "%BACKEND%\.env" (
  set "SECRET="
  for /f "usebackq delims=" %%S in (`""%PY%" -c "import secrets;print(secrets.token_hex(32))""`) do set "SECRET=%%S"
  if not defined SECRET (echo [ERROR] could not generate JWT secret. & pause & exit /b 1)
  > "%BACKEND%\.env" (
    echo MONGO_URL=mongodb://127.0.0.1:27017
    echo DB_NAME=mecsmart_erp
    echo CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:8001,http://127.0.0.1:8001
    echo JWT_SECRET=!SECRET!
    echo ADMIN_EMAIL=admin@erp.com
    echo ADMIN_PASSWORD=Admin@123
    echo FRONTEND_URL=http://localhost:3000
    echo APPYFLOW_API_KEY=
  )
  echo   created backend\.env  ^(default admin: admin@erp.com / Admin@123^)
) else (
  echo   backend\.env already exists - kept.
)
if not exist "%FRONTEND%\.env" (
  > "%FRONTEND%\.env" (
    echo REACT_APP_BACKEND_URL=http://localhost:8001
    echo WDS_SOCKET_PORT=3000
  )
  echo   created frontend\.env
) else (
  echo   frontend\.env already exists - kept.
)
rem production build always talks to the same origin it was served from
if not exist "%FRONTEND%\.env.production.local" (>"%FRONTEND%\.env.production.local" echo REACT_APP_BACKEND_URL=)

echo.
echo [5/5] MongoDB data folder
if not exist "%MONGO_DATA%" mkdir "%MONGO_DATA%"

echo.
echo ==========================================================
echo   Setup complete.
echo   Next:  start-prod.bat  (single port 8001, recommended)
echo      or  start-dev.bat   (hot reload, ports 3000 + 8001)
echo   Optional: create-desktop-shortcuts.bat
echo ==========================================================
pause
endlocal
