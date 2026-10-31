@echo off
title MecSmart ERP - Remove background service
call "%~dp0_env.bat"

net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Please right-click this file and choose "Run as administrator".
  pause & exit /b 1
)

echo [Service] stopping and removing scheduled task "MecSmart ERP Server"...
schtasks /end /tn "MecSmart ERP Server" >nul 2>&1
schtasks /delete /tn "MecSmart ERP Server" /f >nul 2>&1
call "%~dp0stop-erp.bat" quiet
echo [Service] removed. Use start-prod.bat to run MecSmart manually, or install-service.bat to re-install.
pause
