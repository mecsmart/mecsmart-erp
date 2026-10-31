@echo off
setlocal
title MecSmart ERP - Stop
call "%~dp0_env.bat"

echo [Stop] Stopping MecSmart ERP services...

rem Background service (install-service.bat): end the task first so its restart loop does not revive uvicorn
schtasks /query /tn "MecSmart ERP Server" >nul 2>&1
if not errorlevel 1 (
  echo   ending background service task - it will start again at next boot, or run:  schtasks /run /tn "MecSmart ERP Server"
  schtasks /end /tn "MecSmart ERP Server" >nul 2>&1
)

rem Close launcher windows first (kills the uvicorn reloader parent so it cannot respawn)
taskkill /FI "WINDOWTITLE eq MecSmart - Backend*"  /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MecSmart - Frontend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MecSmart - Server*"   /T /F >nul 2>&1

for %%P in (%BACKEND_PORT% %FRONTEND_PORT%) do (
  for /f "tokens=5" %%I in ('netstat -ano -p TCP ^| findstr /R /C:"^ *TCP *[^ ]*:%%P  *[^ ]*:0 "') do (
    if not "%%I"=="0" (
      echo   killing PID %%I on port %%P
      taskkill /PID %%I /T /F >nul 2>&1
    )
  )
)

if /i "%~1"=="--with-mongo" (
  echo   stopping MongoDB...
  taskkill /FI "WINDOWTITLE eq MecSmart - MongoDB*" /T /F >nul 2>&1
  net stop MongoDB >nul 2>&1
)

echo [Stop] Done.
if /i not "%~1"=="quiet" timeout /t 3 >nul
endlocal
