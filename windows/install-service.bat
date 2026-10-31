@echo off
title MecSmart ERP - Install background service
call "%~dp0_env.bat"
cd /d "%ROOT%"

net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Please right-click this file and choose "Run as administrator".
  pause & exit /b 1
)
if not exist "%BACKEND%\venv\Scripts\python.exe" (echo [ERROR] Run setup.bat first. & pause & exit /b 1)
if not exist "%BACKEND%\.env" (echo [ERROR] backend\.env missing - run setup.bat first. & pause & exit /b 1)
if not exist "%FRONTEND%\build\index.html" (
  echo [Frontend] No production build found - building now - takes 2-5 min...
  call "%~dp0build-frontend.bat" quiet || (pause & exit /b 1)
)

echo [Service] stopping any MecSmart started from a user session - including its MongoDB, so the service owns it...
call "%~dp0stop-erp.bat" quiet --with-mongo

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-service.ps1"
if errorlevel 1 (echo [ERROR] Service registration failed. & pause & exit /b 1)

echo.
echo   Waiting for the server to come up...
set /a tries=0
:wait
ping -n 3 127.0.0.1 >nul
curl -s -m 3 http://localhost:%BACKEND_PORT%/api/health 2>nul | findstr /C:"machinery-erp" >nul 2>&1
if not errorlevel 1 goto :ok
set /a tries+=1
if %tries% lss 45 goto :wait
echo [WARN] Server not reachable yet - check data\logs\service.log and data\logs\backend.log
pause & exit /b 1

:ok
echo   MecSmart ERP is running as a background service on http://localhost:%BACKEND_PORT%
echo   It starts automatically with Windows and keeps running after logoff.
echo   To remove: uninstall-service.bat     To stop temporarily: stop-erp.bat
pause
