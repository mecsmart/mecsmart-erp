@echo off
setlocal
title MecSmart ERP - Stop
call "%~dp0_env.bat"

echo [Stop] Stopping MecSmart ERP services...

for %%P in (%BACKEND_PORT% %FRONTEND_PORT%) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    echo   killing PID %%I on port %%P
    taskkill /PID %%I /T /F >nul 2>&1
  )
)

rem Close the launcher console windows if still open
taskkill /FI "WINDOWTITLE eq MecSmart - Backend*"  /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MecSmart - Frontend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MecSmart - Server*"   /T /F >nul 2>&1

if /i "%~1"=="--with-mongo" (
  echo   stopping MongoDB...
  taskkill /FI "WINDOWTITLE eq MecSmart - MongoDB*" /T /F >nul 2>&1
  net stop MongoDB >nul 2>&1
)

echo [Stop] Done.
timeout /t 3 >nul
endlocal
