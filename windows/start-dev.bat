@echo off
setlocal
title MecSmart ERP (Dev)
call "%~dp0_env.bat"
cd /d "%ROOT%"

echo ==========================================================
echo   MecSmart ERP  -  DEVELOPMENT  (hot reload)
echo   backend :%BACKEND_PORT%   frontend :%FRONTEND_PORT%
echo ==========================================================

if not exist "%BACKEND%\.env" (
  echo [ERROR] backend\.env missing. Run setup.bat first.
  pause & exit /b 1
)

call "%~dp0start-mongo.bat" || (pause & exit /b 1)

netstat -ano | findstr /R /C:":%BACKEND_PORT% .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [Backend] Port %BACKEND_PORT% already in use - run stop-erp.bat first.
  pause & exit /b 1
)

echo [Backend] starting uvicorn --reload ...
start "MecSmart - Backend (8001)" /min cmd /k ""%PY%" -m uvicorn server:app --host 0.0.0.0 --port %BACKEND_PORT% --reload --app-dir "%BACKEND%""

echo [Frontend] starting yarn start ...
start "MecSmart - Frontend (3000)" /min cmd /k "cd /d "%FRONTEND%" && set BROWSER=none&& set PORT=%FRONTEND_PORT%&& yarn start"

set /a tries=0
:wait
timeout /t 2 /nobreak >nul
netstat -ano | findstr /R /C:":%FRONTEND_PORT% .*LISTENING" >nul 2>&1
if %errorlevel%==0 goto :ready
set /a tries+=1
if %tries% lss 90 goto :wait
echo [Frontend] ERROR: dev server did not start. Check the "MecSmart - Frontend" window.
pause & exit /b 1

:ready
echo.
echo   MecSmart ERP (dev) is running at http://localhost:%FRONTEND_PORT%
echo.
start "" "http://localhost:%FRONTEND_PORT%"
timeout /t 5 >nul
endlocal
