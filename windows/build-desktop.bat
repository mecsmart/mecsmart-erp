@echo off
setlocal
title MecSmart ERP - Build Desktop Installer
call "%~dp0_env.bat"
set "DESKTOP=%ROOT%\desktop"
cd /d "%DESKTOP%" || (echo [ERROR] desktop folder not found at %DESKTOP% & pause & exit /b 1)

echo ==========================================================
echo   MecSmart ERP - Build Windows desktop installer (.exe)
echo ==========================================================

node -v >nul 2>&1 || (echo [ERROR] Node.js not found. Install Node 20 LTS from https://nodejs.org/ & pause & exit /b 1)
call yarn -v >nul 2>&1 || (echo [Yarn] not found - enabling via corepack... & call corepack enable)

echo.
echo [1/3] Installing desktop dependencies - Electron download is ~110 MB, be patient...
call yarn install --network-timeout 600000
if errorlevel 1 (echo [ERROR] yarn install failed. Check your internet / proxy and re-run. & pause & exit /b 1)
if not exist "node_modules\electron\package.json" (
  echo [ERROR] Electron was not installed into node_modules.
  echo         If you use Yarn 2+, make sure desktop\.yarnrc.yml contains:  nodeLinker: node-modules
  echo         Then delete desktop\node_modules and re-run this script.
  pause & exit /b 1
)
for /f "tokens=2 delims=:, " %%V in ('findstr /C:"\"version\"" node_modules\electron\package.json') do echo   Electron %%~V installed.

echo.
echo [2/3] Building installer with electron-builder...
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
call yarn build:win
if errorlevel 1 (
  echo.
  echo [ERROR] electron-builder failed.
  echo         - "Cannot create symbolic link" / EPERM  : run this script as Administrator once, or enable Windows Developer Mode.
  echo         - download errors                        : check internet / proxy, then re-run.
  pause & exit /b 1
)

echo.
echo [3/3] Done. Installer:
dir /b "%DESKTOP%\dist\*.exe" 2>nul
echo   Location: %DESKTOP%\dist
echo   Copy the "MecSmart ERP Setup x.y.z.exe" to each shop-floor PC and run it.
pause
endlocal
