@echo off
setlocal
title MecSmart ERP - Stop
call "%~dp0_env.bat"

echo [Stop] Stopping MecSmart ERP services...

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
timeout /t 3 >nul
endlocal
