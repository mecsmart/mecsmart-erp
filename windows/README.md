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
| `create-desktop-shortcuts.bat` | Puts **MecSmart ERP Server**, **MecSmart ERP (Dev)** and **Stop MecSmart ERP** icons on the Desktop |

## Prerequisites (install once)
1. **Python 3.11+** — https://www.python.org/downloads/windows/ (tick *Add python.exe to PATH*)
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

## Auto-start with Windows
Press `Win+R` → `shell:startup` → copy the **MecSmart ERP Server** shortcut into that folder.
