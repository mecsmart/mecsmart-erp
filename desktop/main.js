// MecSmart ERP — Electron main process (v1.0.5, "quiet window" rewrite).
//
// Design rules (learned from the Windows "can't type" bug):
//   • NEVER call webContents.focus()/win.focus() from focus handlers — it loops
//     with the renderer and steals the caret from the active input.
//   • NEVER let the page use Chromium's JS alert()/confirm(): on Windows the
//     renderer loses keyboard input after they close. We replace them with
//     OS message boxes parented to the window (see installDialogShims).
//   • Hidden helper windows (PDF render) are created `focusable: false` so
//     they can never take focus from the main window.

const { app, BrowserWindow, ipcMain, Menu, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const store = new Store({
  name: 'mecsmart-config',
  defaults: { serverUrl: '', windowBounds: { width: 1400, height: 900 } },
});

let mainWindow = null;
let configWindow = null;
const isDev = process.argv.includes('--dev');

// ------------------------------------------------------------------ updater
function isNetworkError(err) {
  const m = String((err && (err.message || err.code)) || '').toLowerCase();
  return ['err_name_not_resolved', 'enotfound', 'econnrefused', 'etimedout', 'err_internet_disconnected',
    'err_connection_refused', 'err_connection_timed_out', 'getaddrinfo', 'net::'].some(s => m.includes(s));
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const overrideUrl = process.env.MECSMART_UPDATE_URL || store.get('updateFeedUrl') || '';
  if (overrideUrl) {
    try { autoUpdater.setFeedURL({ provider: 'generic', url: overrideUrl, channel: 'latest' }); }
    catch (e) { console.error('[auto-updater] invalid MECSMART_UPDATE_URL:', e.message); }
  }
  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('mecsmart:update-available', { version: info.version });
  });
  autoUpdater.on('update-downloaded', (info) => {
    const result = dialog.showMessageBoxSync(mainWindow, {
      type: 'info', buttons: ['Restart Now', 'Install on Quit'], defaultId: 0, cancelId: 1,
      title: 'MecSmart ERP — Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart now to install, or it will be applied automatically the next time you close MecSmart ERP.',
    });
    if (result === 0) autoUpdater.quitAndInstall(false, true);
  });
  autoUpdater.on('error', (err) => console.error('[auto-updater]', err && err.message));
  if (!isDev && overrideUrl) setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6000);
}

// --------------------------------------------------------------------- menu
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
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { type: 'separator' }, { role: 'togglefullscreen' },
        { type: 'separator' }, { role: 'toggleDevTools', visible: isDev },
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
              if (!r || !r.updateInfo) dialog.showMessageBox(mainWindow, { type: 'info', message: 'You are on the latest version.' });
            } catch (e) {
              if (isNetworkError(e)) {
                dialog.showMessageBox(mainWindow, {
                  type: 'info', title: 'Auto-update not configured',
                  message: 'Auto-update is not available on this installation.',
                  detail: overrideUrl
                    ? `Could not reach the update server (${overrideUrl}).`
                    : 'No update server has been configured yet. Please contact your IT admin.',
                });
              } else {
                dialog.showMessageBox(mainWindow, { type: 'error', message: 'Update check failed.', detail: e.message });
              }
            }
          },
        },
        {
          label: 'About MecSmart ERP',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info', title: 'About',
            message: `MecSmart ERP\nVersion ${app.getVersion()}`,
            detail: 'Manufacturing ERP — BOM · MRP · Quality · CRM · GST.',
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------ alert()/confirm() shims
// Replaces the page's native JS dialogs with OS message boxes owned by the
// main window. Runs once per page load (SPA navigations don't reload).
function installDialogShims(wc) {
  const js = `
    (function () {
      if (window.__mecsmartDialogShim || !window.mecsmart) return;
      window.__mecsmartDialogShim = true;
      window.alert = function (m) { try { window.mecsmart.nativeAlert(m === undefined ? '' : String(m)); } catch (e) {} };
      window.confirm = function (m) { try { return !!window.mecsmart.nativeConfirm(m === undefined ? '' : String(m)); } catch (e) { return false; } };
      // Electron has no native prompt() (it throws). Return null so legacy callers no-op.
      window.prompt = function () { console.warn('[mecsmart] window.prompt() is not supported in the desktop app; use promptDialog()'); return null; };
    })();
  `;
  wc.on('dom-ready', () => { wc.executeJavaScript(js).catch(() => {}); });
}

ipcMain.on('mecsmart:native-alert', (event, message) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  dialog.showMessageBoxSync(win, { type: 'info', buttons: ['OK'], title: 'MecSmart ERP', message: String(message || '') });
  event.returnValue = true;
});

ipcMain.on('mecsmart:native-confirm', (event, message) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const r = dialog.showMessageBoxSync(win, {
    type: 'question', buttons: ['OK', 'Cancel'], defaultId: 0, cancelId: 1, noLink: true,
    title: 'MecSmart ERP', message: String(message || ''),
  });
  event.returnValue = r === 0;
});

// ------------------------------------------------------------- main window
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
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  installDialogShims(mainWindow.webContents);

  // Always fetch the latest React bundle from the server.
  try { mainWindow.webContents.session.clearCache().catch(() => {}); } catch { /* noop */ }

  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      store.set('windowBounds', { width: b.width, height: b.height });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).host !== new URL(serverUrl).host) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch { /* noop */ }
    return { action: 'allow' };
  });

  mainWindow.loadURL(serverUrl).catch((err) => {
    dialog.showErrorBox('Cannot reach MecSmart server',
      `Tried: ${serverUrl}\n\n${err.message}\n\nUse File → Switch Server URL to fix.`);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ----------------------------------------------------- server config window
function openServerConfigWindow() {
  configWindow = new BrowserWindow({
    width: 520, height: 380, resizable: false, minimizable: false, maximizable: false,
    title: 'MecSmart ERP — Server Setup',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#1D3557',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') },
  });
  configWindow.setMenu(null);
  configWindow.loadFile(path.join(__dirname, 'server-config.html'));
  configWindow.on('closed', () => { configWindow = null; });
}

// ------------------------------------------------------------------ IPC API
ipcMain.handle('mecsmart:get-server-url', () => store.get('serverUrl'));

ipcMain.handle('mecsmart:save-server-url', (_event, url) => {
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

// Kept for backward compatibility with older frontend builds — intentionally
// a no-op: forcing focus from here is what caused the input-freeze loop.
ipcMain.handle('mecsmart:refocus-main', () => ({ ok: true }));

// --------------------------------------------------- credentials (Remember me)
const credKey = () => `creds:${store.get('serverUrl') || 'default'}`;

ipcMain.handle('mecsmart:save-credentials', (_event, { email, password } = {}) => {
  if (!email || !password) return { ok: false, error: 'email + password required' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'OS keychain not available.' };
  try {
    store.set(credKey(), safeStorage.encryptString(JSON.stringify({ email, password })).toString('base64'));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('mecsmart:load-credentials', () => {
  const cipher = store.get(credKey());
  if (!cipher || !safeStorage.isEncryptionAvailable()) return null;
  try { return JSON.parse(safeStorage.decryptString(Buffer.from(cipher, 'base64'))); }
  catch { store.delete(credKey()); return null; }
});

ipcMain.handle('mecsmart:clear-credentials', () => { store.delete(credKey()); return { ok: true }; });

// --------------------------------------------------------- native PDF export
ipcMain.handle('mecsmart:download-pdf', async (_event, { html, filename } = {}) => {
  if (!html || typeof html !== 'string') return { ok: false, error: 'HTML content is required' };
  const safe = String(filename || 'document.pdf').replace(/[^A-Za-z0-9._-]+/g, '_');
  const finalName = safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF', defaultPath: finalName, filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { ok: false, canceled: true };

  const tmpFile = path.join(os.tmpdir(), `mecsmart-pdf-${Date.now()}-${Math.floor(Math.random() * 1e6)}.html`);
  let pdfWin = null;
  try {
    await fs.promises.writeFile(tmpFile, html, 'utf8');
    pdfWin = new BrowserWindow({
      show: false,
      focusable: false,
      skipTaskbar: true,
      width: 794,
      height: 1123,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    await new Promise((resolve, reject) => {
      const onFail = (_e, code, desc) => reject(new Error(`page load failed: ${desc} (code ${code})`));
      pdfWin.webContents.once('did-finish-load', () => { pdfWin.webContents.removeListener('did-fail-load', onFail); resolve(); });
      pdfWin.webContents.once('did-fail-load', onFail);
      pdfWin.loadFile(tmpFile).catch(reject);
      setTimeout(() => reject(new Error('page load timed out after 25s')), 25000);
    });
    await new Promise(r => setTimeout(r, 600));
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      pageSize: 'A4', printBackground: true, preferCSSPageSize: true, margins: { marginType: 'default' },
      displayHeaderFooter: true, headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="font-family:Helvetica,Arial,sans-serif;font-size:8px;color:#64748b;width:100%;text-align:right;padding:0 8mm 0 0;">' +
        'Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    });
    await fs.promises.writeFile(saveResult.filePath, pdfBuffer);
    return { ok: true, path: saveResult.filePath };
  } catch (err) {
    console.error('[mecsmart:download-pdf] FAILED:', err);
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    if (pdfWin && !pdfWin.isDestroyed()) { try { pdfWin.destroy(); } catch { /* noop */ } }
    try { await fs.promises.unlink(tmpFile); } catch { /* noop */ }
  }
});

// ---------------------------------------------------------------- bootstrap
app.whenReady().then(() => {
  buildMenu();
  configureAutoUpdater();
  const stored = store.get('serverUrl');
  if (stored) createMainWindow(stored); else openServerConfigWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const u = store.get('serverUrl');
      if (u) createMainWindow(u); else openServerConfigWindow();
    }
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
