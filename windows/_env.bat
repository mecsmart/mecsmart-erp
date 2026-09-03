@echo off
rem Shared environment for all MecSmart launcher scripts. Called via `call _env.bat`.
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"
set "MONGO_DATA=%ROOT%\data\db"
set "MONGO_LOG=%ROOT%\data\mongod.log"
set "BACKEND_PORT=8001"
set "FRONTEND_PORT=3000"

if exist "%BACKEND%\venv\Scripts\python.exe" (
  set "PY=%BACKEND%\venv\Scripts\python.exe"
) else (
  set "PY=python"
)

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"

rem Optional overrides (e.g. custom mongod.exe path) — create windows\config.bat with `set MONGOD=...`
if exist "%~dp0config.bat" call "%~dp0config.bat"
exit /b 0
