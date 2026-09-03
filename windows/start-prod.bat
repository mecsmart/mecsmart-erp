@echo off
setlocal
title MecSmart ERP Server
call "%~dp0_env.bat"
cd /d "%ROOT%"

echo ==========================================================
echo   MecSmart ERP  -  PRODUCTION  (single port %BACKEND_PORT%)
echo ==========================================================

if not exist "%BACKEND%\.env" (
  echo [ERROR] backend\.env missing. Run setup.bat first.
  pause & exit /b 1
)

call "%~dp0start-mongo.bat" || (pause & exit /b 1)

if not exist "%FRONTEND%\build\index.html" (
  echo [Frontend] No production build found - building now - first run only, takes 2-5 min...
  call "%~dp0build-frontend.bat" quiet || (pause & exit /b 1)
)

netstat -ano -p TCP | findstr /R /C:"^ *TCP *[^ ]*:%BACKEND_PORT%  *[^ ]*:0 " >nul 2>&1
if %errorlevel%==0 (
  echo [Server] Port %BACKEND_PORT% is already in use - MecSmart may already be running. Use stop-erp.bat first.
  pause & exit /b 1
)

echo [Server] starting backend + frontend on http://localhost:%BACKEND_PORT% ...
start "MecSmart - Server (8001)" /min cmd /k "cd /d "%BACKEND%" && "%PY%" -m uvicorn server:app --host 0.0.0.0 --port %BACKEND_PORT%"

set /a tries=0
:wait
timeout /t 1 /nobreak >nul
netstat -ano -p TCP | findstr /R /C:"^ *TCP *[^ ]*:%BACKEND_PORT%  *[^ ]*:0 " >nul 2>&1
if %errorlevel%==0 goto :ready
set /a tries+=1
if %tries% lss 60 goto :wait
echo [Server] ERROR: backend did not start. Check the "MecSmart - Server" window.
pause & exit /b 1

:ready
set "LANIP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4"') do call :pick_ip %%A
echo.
echo   MecSmart ERP is running.
echo     This PC : http://localhost:%BACKEND_PORT%
if defined LANIP echo     LAN     : http://%LANIP%:%BACKEND_PORT%   - use this in the desktop app / other PCs
echo.
start "" "http://localhost:%BACKEND_PORT%"
timeout /t 5 >nul
endlocal
exit /b 0

:pick_ip
set "IP=%~1"
if defined LANIP exit /b 0
if "%IP:~0,4%"=="127." exit /b 0
if "%IP:~0,8%"=="169.254." exit /b 0
if "%IP:~0,11%"=="192.168.56." exit /b 0
set "LANIP=%IP%"
exit /b 0
