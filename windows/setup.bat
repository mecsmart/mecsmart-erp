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

rem ---- Pick a Python interpreter: prefer stable 3.12 / 3.13 via the "py" launcher,
rem      then 3.11, 3.14, 3.15; finally whatever "python" is on PATH.
set "PYEXE="
set "PYVER="
for %%V in (3.12 3.13 3.11 3.14 3.15) do (
  if not defined PYEXE for /f "tokens=1,2 delims=|" %%P in ('py -%%V windows\pyinfo.py 2^>nul') do (set "PYEXE=%%P" & set "PYVER=%%Q")
)
if not defined PYEXE for /f "tokens=1,2 delims=|" %%P in ('python windows\pyinfo.py 2^>nul') do (set "PYEXE=%%P" & set "PYVER=%%Q")
if not defined PYEXE (
  echo [ERROR] Python not found on PATH.
  echo         Install Python 3.12 64-bit from https://www.python.org/downloads/windows/ and tick "Add python.exe to PATH".
  echo         If you see the Microsoft Store opening, disable the "python.exe" App execution alias in Windows Settings.
  pause & exit /b 1
)
echo   Python !PYVER! detected: !PYEXE!
if "!PYVER!"=="3.15" echo   [WARN] Python 3.15 is a pre-release. If "pip install" fails below, install Python 3.12 alongside it and re-run setup.bat - it will be picked automatically.
if "!PYVER!"=="3.14" echo   [WARN] Python 3.14 is very new. If "pip install" fails below, install Python 3.12 alongside it and re-run setup.bat.
if "!PYVER:~0,2!"=="3." if !PYVER:~2! lss 10 (
  echo [ERROR] Python !PYVER! is too old. Install Python 3.12 from https://www.python.org/downloads/windows/
  pause & exit /b 1
)

node -v >nul 2>&1
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
node -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. "node -v" failed in this window.
  echo         Install the 64-bit LTS .msi from https://nodejs.org/ - keep "Add to PATH" ticked.
  echo         If you just installed it, CLOSE this window and open a NEW cmd/PowerShell, then re-run setup.bat.
  pause & exit /b 1
)
for /f "delims=" %%V in ('node -v') do echo   Node.js %%V detected.
call yarn -v >nul 2>&1
if errorlevel 1 (echo [Yarn] not found - enabling via corepack... & call corepack enable)
call yarn -v >nul 2>&1
if errorlevel 1 (echo [ERROR] yarn still not available. Run "npm install -g yarn" in an Administrator prompt, then re-run setup.bat. & pause & exit /b 1)

echo.
echo [1/5] Python virtual environment + backend dependencies
set "PY=%BACKEND%\venv\Scripts\python.exe"
set "VENVVER="
if exist "%PY%" for /f "tokens=1,2 delims=|" %%P in ('backend\venv\Scripts\python.exe windows\pyinfo.py 2^>nul') do set "VENVVER=%%Q"
if exist "%PY%" if not "!VENVVER!"=="!PYVER!" (
  echo   Existing venv uses Python !VENVVER! - recreating it with Python !PYVER!...
  rmdir /s /q "%BACKEND%\venv"
)
if not exist "%PY%" "!PYEXE!" -m venv "%BACKEND%\venv"
if not exist "%PY%" (echo [ERROR] could not create the virtual environment. & pause & exit /b 1)
"%PY%" -m pip install --upgrade pip >nul
"%PY%" -m pip install --only-binary=:all: -r "%BACKEND%\requirements-windows.txt"
if errorlevel 1 (
  echo.
  echo [ERROR] pip install failed. Usually this means no pre-built wheel exists for Python !PYVER!.
  echo         Fix: install Python 3.12 64-bit from https://www.python.org/downloads/windows/ - it can coexist -
  echo         then re-run setup.bat - it prefers 3.12 automatically.
  pause & exit /b 1
)

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
set "SECRET="
if not exist "%BACKEND%\.env" for /f "delims=" %%S in ('backend\venv\Scripts\python.exe windows\gen_secret.py') do set "SECRET=%%S"
if not exist "%BACKEND%\.env" (
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
  echo   created backend\.env - default admin: admin@erp.com / Admin@123
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
