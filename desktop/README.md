# MecSmart ERP — Windows Desktop App

A native Windows wrapper around the MecSmart ERP web frontend. Users get a
desktop icon, no browser, no URL bar — just **MecSmart.exe**.

## Architecture

```
[ Office Server ]                          [ Shop-Floor PC ]
FastAPI :8001                  LAN          MecSmart ERP.exe (Electron)
MongoDB :27017       <----------------->    └── loads http://server:8001
Frontend (port 3000)                            (the existing React app)
```

* **Connected mode** — every PC ships the same `.exe`; first launch asks for
  your server URL (e.g. `http://192.168.1.50:8001`) and remembers it.
* **Auto-updates** via `electron-updater` — drop a new build on your update
  server and every factory PC pulls it overnight.

## Build prerequisites (Windows host)

1. Install **Node.js 20 LTS** — <https://nodejs.org/>
2. Install **Yarn**: `npm install -g yarn`
3. Open a terminal in this folder.

## First-time install

```cmd
cd \path\to\app\desktop
yarn install
```

## Run in development

```cmd
yarn dev
```

Opens the Electron window pointed at whatever URL you saved last
(or shows the server-picker on first launch).

## Build the Windows installer (.exe)

> **v1.0.5 — "can't type after dialogs" fix.** Chromium's JS `alert()`/`confirm()`
> break keyboard input in Electron on Windows after they close. The wrapper now
> replaces them with OS message boxes owned by the app window, removes all
> focus-forcing (`webContents.focus()` loops) and renders PDFs in a
> `focusable:false` hidden window. Rebuild and reinstall on every client PC.
>
> Headless regression harness (Linux/Xvfb): `DISPLAY=:99 electron tests/harness.js --dev --no-sandbox --disable-gpu`
> (needs `serverUrl` in the electron-store config; prints `HARNESS_PASS`).

```cmd
yarn build:win
```

Output: `dist\MecSmart ERP Setup 1.0.5.exe`

Distribute that single `.exe` to every PC. The installer:
- creates a desktop shortcut + Start-menu entry
- registers an uninstaller
- lets the user pick the install location

## Auto-update setup

The installer reports back to a "generic" update channel (HTTP folder).

1. Pick an HTTPS-reachable folder for hosting updates, e.g.
   `https://updates.mecsmart.local/desktop/`.
2. Edit **`package.json` → `build.publish[0].url`** to that location.
3. Increment `version` in `package.json`, run `yarn build:win`.
4. Upload the contents of `dist/` (`*.exe`, `latest.yml`, `*.blockmap`) to
   that folder.

Every running copy of MecSmart will detect the new build within ~6 seconds
of launch, download it silently, and prompt the user on next quit.

## Switching server URL

If a user needs to repoint to a different server (e.g. office moved):

  **File → Switch Server URL…**

This wipes the saved URL and reopens the picker.

## Customising

| Want to change…                | Edit…                                      |
|--------------------------------|--------------------------------------------|
| App icon                       | `build/icon.ico` (256×256 multi-res)       |
| App name shown to users        | `build.productName` in `package.json`      |
| Default window size            | `windowBounds` defaults in `main.js`       |
| First-run wallpaper colour     | gradient in `server-config.html` `<style>` |
| Update channel URL             | `build.publish[0].url` in `package.json`   |

## Backend health probe

The first-run dialog hits **`GET /api/health`** to verify the server is real.
Make sure that endpoint is unauthenticated (it already is in your FastAPI app).

## Notes

* **No local backend.** This wrapper does NOT bundle FastAPI or MongoDB —
  it just renders the existing web app inside a native window.
  If you also want a fully offline single-PC mode, that's a separate scaffold
  (~2 days of extra work).
* **Browsers required?** No. Electron ships its own Chromium — users do not
  need Chrome / Edge / Firefox on the machine.
* **Code signing.** For a smoother SmartScreen experience on Windows 10/11,
  code-sign the installer with an EV Code Signing certificate (~$300/yr).
  Add `win.certificateFile` + `win.certificatePassword` to `package.json`
  when you have the cert.
