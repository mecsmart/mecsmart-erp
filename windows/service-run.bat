@echo off
rem Runs the MecSmart backend in the foreground with auto-restart. Used by the
rem Windows background service (install-service.bat). Logs go to data\logs\.
call "%~dp0_env.bat"
set "LOGDIR=%ROOT%\data\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "SVCLOG=%LOGDIR%\service.log"
set "APPLOG=%LOGDIR%\backend.log"

echo [%date% %time%] service-run started as %USERNAME% >> "%SVCLOG%"
call "%~dp0start-mongo.bat" >> "%SVCLOG%" 2>&1

if not exist "%FRONTEND%\build\index.html" (
  echo [%date% %time%] no frontend build found - run build-frontend.bat once >> "%SVCLOG%"
)

cd /d "%BACKEND%"
:loop
rem rotate backend.log above ~50 MB
for %%F in ("%APPLOG%") do if exist "%%~F" if %%~zF gtr 52428800 move /y "%APPLOG%" "%LOGDIR%\backend.old.log" >nul 2>&1
echo [%date% %time%] starting uvicorn on port %BACKEND_PORT% >> "%SVCLOG%"
"%PY%" -m uvicorn server:app --host 0.0.0.0 --port %BACKEND_PORT% >> "%APPLOG%" 2>&1
echo [%date% %time%] uvicorn exited with code %errorlevel% - restarting in 5s >> "%SVCLOG%"
timeout /t 5 /nobreak >nul
goto :loop
