@echo off
rem Ensures MongoDB is listening on 27017. Called via `call start-mongo.bat`.
call "%~dp0_env.bat"

netstat -ano | findstr /R /C:":27017 .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [Mongo] already running on port 27017.
  exit /b 0
)

rem 1) Installed as a Windows service?
sc query MongoDB >nul 2>&1
if %errorlevel%==0 (
  echo [Mongo] starting Windows service "MongoDB"...
  net start MongoDB >nul 2>&1
  goto :wait
)

rem 2) Find mongod.exe
if not defined MONGOD (
  for /f "delims=" %%P in ('where mongod 2^>nul') do if not defined MONGOD set "MONGOD=%%P"
)
if not defined MONGOD (
  for /d %%D in ("%ProgramFiles%\MongoDB\Server\*") do if exist "%%D\bin\mongod.exe" set "MONGOD=%%D\bin\mongod.exe"
)
if not defined MONGOD (
  echo [Mongo] ERROR: mongod.exe not found.
  echo         Install MongoDB Community Server from https://www.mongodb.com/try/download/community
  echo         or create windows\config.bat with:  set MONGOD=C:\path\to\mongod.exe
  exit /b 1
)

if not exist "%MONGO_DATA%" mkdir "%MONGO_DATA%"
echo [Mongo] starting %MONGOD%
start "MecSmart - MongoDB" /min "%MONGOD%" --dbpath "%MONGO_DATA%" --port 27017 --bind_ip 127.0.0.1 --logpath "%MONGO_LOG%" --logappend

:wait
set /a tries=0
:loop
timeout /t 1 /nobreak >nul
netstat -ano | findstr /R /C:":27017 .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [Mongo] ready.
  exit /b 0
)
set /a tries+=1
if %tries% lss 30 goto :loop
echo [Mongo] ERROR: MongoDB did not start within 30s. Check %MONGO_LOG%
exit /b 1
