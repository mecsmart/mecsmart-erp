// MecSmart ERP — Electron main process.
//
// What this does (at a high level):
//   1. On first launch, asks the user for their MecSmart server URL
//      (e.g. http://192.168.1.50:8001 — the central FastAPI host).
//   2. Persists the URL to disk via electron-store so subsequent launches
//      open the app directly.
//   3. Loads that URL inside a frameless BrowserWindow with a custom title
//      bar — looks and feels like a native Windows app, NO browser chrome.
//   4. Auto-checks for app updates on launch (electron-updater) and downloads
//      them silently in the background. User is prompted once the update is
//      ready and the next launch installs it.

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// --------------------------------------------------------------------- store
// Persists user preferences (server URL, window bounds) across launches.
const store = new Store({
  name: 'mecsmart-config',
  defaults: {
    serverUrl: '',          // populated by first-run config dialog
    windowBounds: { width: 1400, height: 900 },
  },
});

let mainWindow = null;       // points at the live ERP window once configured
let configWindow = null;     // first-run server-URL picker

const isDev = process.argv.includes('--dev');

// ----------------------------------------------------------- updater plumbing
//
// electron-updater fires events for every step of the silent update lifecycle.
// We only surface the user-visible bits ("update available" / "ready to install")
// so the agent stays out of the way.
function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('mecsmart:update-available', { version: info.version });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    const result = dialog.showMessageBoxSync({
      type: 'info',
      buttons: ['Restart Now', 'Install on Quit'],
      defaultId: 0,
      cancelId: 1,
      title: 'MecSmart ERP — Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart now to install, or it will be applied automatically the next time you close MecSmart ERP.',
    });
    if (result === 0) autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('error', (err) => {
    // Silent failure — auto-updater should never break the app even if the
    // update server is unreachable.
    console.error('[auto-updater]', err && err.message);
  });

  if (!isDev) {
    // Slight delay so the main window mounts first.
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6000);
  }
}

// -------------------------------------------------------------------- helpers
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'reload', label: 'Reload (Ctrl+R)' },
        { role: 'forceReload' },
        { type: 'separator' },
        {
          label: 'Switch Server URL…',
          click: () => {
            // Allow the user to re-pick a server (useful when migrating from
            // dev → prod LAN). Closes the main window and re-opens the picker.
            store.set('serverUrl', '');
            if (mainWindow) mainWindow.close();
            openServerConfigWindow();
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools', visible: isDev },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: async () => {
            try {
              const r = await autoUpdater.checkForUpdates();
              if (!r || !r.updateInfo) {
                dialog.showMessageBox({ type: 'info', message: 'You are on the latest version.' });
              }
            } catch (e) {
              dialog.showMessageBox({ type: 'error', message: 'Update check failed.', detail: e.message });
            }
          },
        },
        {
          label: 'About MecSmart ERP',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About',
              message: `MecSmart ERP\nVersion ${app.getVersion()}`,
              detail: 'Manufacturing ERP — BOM · MRP · Quality · CRM · GST.',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// -------------------------------------------------------- main ERP window
function createMainWindow(serverUrl) {
  const bounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    width: bounds.width || 1400,
    height: bounds.height || 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'MecSmart ERP',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#0F172A',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Persist window size on resize.
  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      store.set('windowBounds', { width: b.width, height: b.height });
    }
  });

  // External links (mailto, http://something-else) open in the user's
  // default browser, NOT inside the ERP window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      const home = new URL(serverUrl);
      if (target.host !== home.host) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch { /* malformed URL → fall through */ }
    return { action: 'allow' };
  });

  mainWindow.loadURL(serverUrl).catch((err) => {
    dialog.showErrorBox(
      'Cannot reach MecSmart server',
      `Tried: ${serverUrl}\n\n${err.message}\n\nUse File → Switch Server URL to fix.`,
    );
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ----------------------------------------------------- first-run config window
function openServerConfigWindow() {
  configWindow = new BrowserWindow({
    width: 520,
    height: 380,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'MecSmart ERP — Server Setup',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#1D3557',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  configWindow.setMenu(null);
  configWindow.loadFile(path.join(__dirname, 'server-config.html'));
  configWindow.on('closed', () => { configWindow = null; });
}

// ------------------------------------------------------------------ IPC API
ipcMain.handle('mecsmart:get-server-url', () => store.get('serverUrl'));

ipcMain.handle('mecsmart:save-server-url', (_event, url) => {
  // Sanity-check that the URL is reachable before we commit it. The renderer
  // already does a fetch() probe but a defensive parse here means a manually
  // hand-edited config can't crash the loader on next boot.
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Protocol must be http or https');
    store.set('serverUrl', parsed.toString().replace(/\/+$/, ''));
    if (configWindow) configWindow.close();
    createMainWindow(store.get('serverUrl'));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('mecsmart:get-app-version', () => app.getVersion());

// ---------------------------------------------------------------- bootstrap
app.whenReady().then(() => {
  buildMenu();
  configureAutoUpdater();

  const stored = store.get('serverUrl');
  if (stored) {
    createMainWindow(stored);
  } else {
    openServerConfigWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const u = store.get('serverUrl');
      u ? createMainWindow(u) : openServerConfigWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
