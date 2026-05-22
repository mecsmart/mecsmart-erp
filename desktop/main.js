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

const { app, BrowserWindow, ipcMain, Menu, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
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
//
// IMPORTANT: The publish URL in `package.json` (`updates.mecsmart.local`) is a
// PLACEHOLDER. Until the customer stands up a real update host (an HTTPS server
// hosting `latest.yml` + the `.exe`), auto-update is effectively disabled — we
// detect DNS/connection failures and show a friendly "not configured" message
// instead of a raw `net::ERR_NAME_NOT_RESOLVED`. To enable real updates, point
// `package.json → build.publish[0].url` at the real host and rebuild, OR set
// the `MECSMART_UPDATE_URL` environment variable on the client at runtime
// (overrides the baked-in feed via `autoUpdater.setFeedURL`).

// `ERR_NAME_NOT_RESOLVED` (DNS), `ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT` and
// generic "net::" prefixes all indicate the update host is unreachable rather
// than a real "update broken" condition. Surface a friendly message in that case.
function isNetworkError(err) {
  const m = String((err && (err.message || err.code)) || '').toLowerCase();
  return [
    'err_name_not_resolved',
    'enotfound',
    'econnrefused',
    'etimedout',
    'err_internet_disconnected',
    'err_connection_refused',
    'err_connection_timed_out',
    'getaddrinfo',
    'net::',
  ].some(s => m.includes(s));
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Allow runtime override of the feed URL — handy for IT admins who want to
  // point a fleet at a private update host without rebuilding the installer.
  const overrideUrl = process.env.MECSMART_UPDATE_URL || store.get('updateFeedUrl') || '';
  if (overrideUrl) {
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: overrideUrl, channel: 'latest' });
    } catch (e) {
      console.error('[auto-updater] invalid MECSMART_UPDATE_URL:', e.message);
    }
  }

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
    // update server is unreachable. We log to console for diagnostics only.
    console.error('[auto-updater]', err && err.message);
  });

  // Auto-check on launch ONLY if a real update host is configured. The default
  // `updates.mecsmart.local` host doesn't resolve, so checking it just spams
  // DNS and the console. Once a real URL is set (env var or stored config),
  // the silent background check resumes.
  if (!isDev && overrideUrl) {
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
            const overrideUrl = process.env.MECSMART_UPDATE_URL || store.get('updateFeedUrl') || '';
            try {
              const r = await autoUpdater.checkForUpdates();
              if (!r || !r.updateInfo) {
                dialog.showMessageBox({ type: 'info', message: 'You are on the latest version.' });
              }
            } catch (e) {
              if (isNetworkError(e)) {
                dialog.showMessageBox({
                  type: 'info',
                  title: 'Auto-update not configured',
                  message: 'Auto-update is not available on this installation.',
                  detail: overrideUrl
                    ? `Could not reach the update server (${overrideUrl}). Please check your internet connection or contact your IT admin.`
                    : 'No update server has been configured yet. Please contact your IT admin or MecSmart support to set the update feed URL.',
                });
              } else {
                dialog.showMessageBox({ type: 'error', message: 'Update check failed.', detail: e.message });
              }
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

  // CRITICAL: Force-clear the HTTP cache before loading the server URL.
  // Electron caches the React bundle aggressively across launches — once
  // the bundle is cached, the desktop app continues to render the OLD
  // version even after the on-prem React build is updated on the server.
  // Users reported "Edit not working" (typing into qty/price/etc. produced
  // no state change) because the cached bundle was missing the post-iter-120
  // callback fixes. Clearing the cache on every launch guarantees the latest
  // build is fetched. Small one-time download cost (~few hundred KB),
  // negligible on LAN.
  try {
    mainWindow.webContents.session.clearCache().catch(() => {});
  } catch { /* clearCache may not exist on older Electron — ignore */ }

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

// ─── Credential persistence (Remember me) ───────────────────────────────
// Electron strips Chrome's "Save password?" UI, so we DIY one using
// `safeStorage` — Chromium's wrapper over the OS-native keychain.
//   • Windows: DPAPI (per-user, machine-bound)
//   • macOS: Keychain
//   • Linux: libsecret / kwallet
// We store the encrypted ciphertext in electron-store (config.json), keyed
// by the current server URL so multi-server installs don't collide.
const credKey = () => `creds:${store.get('serverUrl') || 'default'}`;

ipcMain.handle('mecsmart:save-credentials', (_event, { email, password } = {}) => {
  if (!email || !password) return { ok: false, error: 'email + password required' };
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'OS keychain not available — credentials cannot be saved.' };
  }
  try {
    const cipher = safeStorage.encryptString(JSON.stringify({ email, password })).toString('base64');
    store.set(credKey(), cipher);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('mecsmart:load-credentials', () => {
  const cipher = store.get(credKey());
  if (!cipher || !safeStorage.isEncryptionAvailable()) return null;
  try {
    const decrypted = safeStorage.decryptString(Buffer.from(cipher, 'base64'));
    return JSON.parse(decrypted);
  } catch {
    // Cipher may have been encrypted under a different OS user / DPAPI
    // master key (e.g. user copied config.json to another machine). Wipe
    // it so the next save starts clean.
    store.delete(credKey());
    return null;
  }
});

ipcMain.handle('mecsmart:clear-credentials', () => {
  store.delete(credKey());
  return { ok: true };
});

// ─── Native PDF download via Electron's webContents.printToPDF ──────────
// The renderer's PreviewPdfDialog calls this when running inside the
// desktop wrapper. Loading the print HTML into an offscreen BrowserWindow
// and calling printToPDF() produces a vector PDF that is byte-identical
// to the user's "Print → Save as PDF" output — including the repeating
// thead, custom fonts, watermarks, and all CSS @page rules.
//
// Why not the backend Playwright endpoint? It requires a full Chromium
// install on the customer's server which has been crashing with 500s in
// the production deployment. Electron already bundles Chromium so this
// works offline, on the customer's local machine, with zero extra deps.
ipcMain.handle('mecsmart:download-pdf', async (_event, { html, filename } = {}) => {
  if (!html || typeof html !== 'string') {
    return { ok: false, error: 'HTML content is required' };
  }
  const safe = String(filename || 'document.pdf').replace(/[^A-Za-z0-9._-]+/g, '_');
  const finalName = safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;

  // Ask the user where to save FIRST — if they cancel we can skip the
  // entire offscreen render. Better UX than rendering then prompting.
  const focused = BrowserWindow.getFocusedWindow() || mainWindow;
  const saveResult = await dialog.showSaveDialog(focused, {
    title: 'Save PDF',
    defaultPath: finalName,
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, canceled: true };
  }

  let pdfWin = null;
  try {
    // Offscreen window sized to A4 width @ 96dpi (794 CSS-px). Hidden so
    // it never flashes on screen. nodeIntegration off + sandbox on for
    // safety since we're loading arbitrary HTML.
    pdfWin = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: {
        offscreen: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        javascript: true,
      },
    });

    // Load HTML via data URL so we don't have to write a temp file.
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    await pdfWin.loadURL(dataUrl);

    // Give fonts + images a moment to settle. printToPDF doesn't wait
    // for network-idle so any external assets need a small grace period.
    await new Promise(resolve => setTimeout(resolve, 600));

    const pdfBuffer = await pdfWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'default' },
    });

    await fs.promises.writeFile(saveResult.filePath, pdfBuffer);
    return { ok: true, path: saveResult.filePath };
  } catch (err) {
    console.error('[mecsmart:download-pdf]', err);
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    if (pdfWin && !pdfWin.isDestroyed()) {
      try { pdfWin.destroy(); } catch { /* noop */ }
    }
  }
});

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
