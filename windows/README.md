# MecSmart ERP — Windows launcher scripts

One-click start/stop for the office server (backend + frontend + MongoDB).
Works from **cmd**, **PowerShell**, double-click, or a Desktop shortcut.

| Script | What it does |
|---|---|
| `setup.bat` | **Run once.** Creates Python venv, installs backend + frontend deps, writes `backend\.env` / `frontend\.env`, creates `data\db` |
| `start-prod.bat` | Starts MongoDB → FastAPI on **:8001** which also serves the built React app. Builds the frontend automatically on first run. Opens `http://localhost:8001` |
| `start-dev.bat` | Starts MongoDB → uvicorn `--reload` on :8001 → `yarn start` on :3000 (hot reload). Opens `http://localhost:3000` |
| `build-frontend.bat` | Rebuilds the production frontend (run after pulling new code, then restart `start-prod.bat`) |
| `stop-erp.bat` | Kills everything on ports 8001/3000. Add `--with-mongo` to also stop MongoDB |
| `build-desktop.bat` | Builds the Windows desktop installer (`desktop\dist\MecSmart ERP Setup x.y.z.exe`) — runs `yarn install` + `electron-builder` with checks |
| `install-service.bat` *(Run as administrator)* | Registers MecSmart as a **background service** (Task Scheduler, SYSTEM account): starts at boot, no login needed, keeps running after logoff / idle session timeout, auto-restarts on crash. Logs in `data\logs\` |
| `uninstall-service.bat` *(Run as administrator)* | Removes the background service |
| `create-desktop-shortcuts.bat` | Puts **MecSmart ERP Server**, **MecSmart ERP (Dev)** and **Stop MecSmart ERP** icons on the Desktop |

## Prerequisites (install once)
1. **Python 3.12 (64-bit, recommended; 3.11–3.15 also work)** — https://www.python.org/downloads/windows/ (tick *Add python.exe to PATH*). If several Pythons are installed, `setup.bat` picks 3.12 automatically. Pre-release Pythons (3.15) only work when all packages ship wheels for them — if `pip install` fails, install 3.12 alongside and re-run.
2. **Node.js 20 LTS** — https://nodejs.org/
3. **MongoDB Community Server** — https://www.mongodb.com/try/download/community
   *Installed as a service?* → the scripts start the service. *Zip/portable?* → scripts find `mongod.exe` in `Program Files\MongoDB` or on `PATH`, otherwise create `windows\config.bat` containing
   `set MONGOD=D:\mongo\bin\mongod.exe`

## First run
```cmd
cd \path\to\app\windows
setup.bat
start-prod.bat
create-desktop-shortcuts.bat
```
Default login: `admin@erp.com` / `Admin@123` (change in `backend\.env` before first start).

## From PowerShell
```powershell
cd \path\to\app\windows
.\start-prod.bat
.\stop-erp.bat
```

## LAN access / Desktop (Electron) app
`start-prod.bat` prints the LAN URL (e.g. `http://192.168.1.50:8001`). Enter that URL in the
MecSmart desktop app's server picker on every shop-floor PC. Allow port 8001 in Windows Firewall:
```cmd
netsh advfirewall firewall add rule name="MecSmart ERP" dir=in action=allow protocol=TCP localport=8001
```
For **dev mode** over LAN add your IP to `CORS_ORIGINS` in `backend\.env`
(e.g. `,http://192.168.1.50:3000`) and set `REACT_APP_BACKEND_URL=http://192.168.1.50:8001` in `frontend\.env`.

## Run as a background service (recommended for the office server)
`start-prod.bat` runs inside your login session, so Windows ends it when the session is logged off or times out.
For an always-on server use the service instead:
```cmd
cd c:\mecsmart-erp\windows
install-service.bat      ← right-click → Run as administrator
```
- Starts automatically with Windows, before anyone logs in; survives logoff and idle-session termination
- Auto-restarts if the backend crashes; logs in `data\logs\service.log` and `data\logs\backend.log`
- Stop temporarily: `stop-erp.bat` (it starts again at next boot, or run `schtasks /run /tn "MecSmart ERP Server"`)
- Remove: `uninstall-service.bat`
- After pulling new code: `build-frontend.bat`, then `stop-erp.bat` and `schtasks /run /tn "MecSmart ERP Server"`

Windows Task Scheduler → Task Scheduler Library → **MecSmart ERP Server** shows status/history.
