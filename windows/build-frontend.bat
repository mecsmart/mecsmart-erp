@echo off
setlocal
title MecSmart ERP - Build Frontend
call "%~dp0_env.bat"

echo [Build] Creating production build of the React frontend...
> "%FRONTEND%\.env.production.local" echo REACT_APP_BACKEND_URL=
pushd "%FRONTEND%"
set "GENERATE_SOURCEMAP=false"
set "CI=false"
call yarn build
set "RC=%errorlevel%"
popd
if not "%RC%"=="0" (
  echo [Build] ERROR: yarn build failed.
  if "%~1"=="" pause
  exit /b 1
)
echo [Build] Done -> %FRONTEND%\build
if "%~1"=="" pause
endlocal
exit /b 0
