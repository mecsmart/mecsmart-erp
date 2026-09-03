@echo off
title MecSmart ERP - Create Desktop Shortcuts
call "%~dp0_env.bat"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-desktop-shortcuts.ps1"
if errorlevel 1 echo [ERROR] Shortcut creation failed. Make sure Windows PowerShell is installed.
pause
