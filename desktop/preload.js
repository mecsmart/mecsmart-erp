// preload.js — runs with Node access BEFORE the renderer page loads.
// Exposes a tiny, locked-down API on `window.mecsmart` so the renderer
// (server-config.html or the embedded ERP frontend) can call into the main
// process without enabling full nodeIntegration (which would be a security hole).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mecsmart', {
  // Returns the persisted server URL or '' if the user hasn't picked one yet.
  getServerUrl: () => ipcRenderer.invoke('mecsmart:get-server-url'),

  // Persists a server URL (validated in main). Triggers main window creation.
  saveServerUrl: (url) => ipcRenderer.invoke('mecsmart:save-server-url', url),

  // App version (shown in the bottom-right of the config dialog & Help → About).
  getAppVersion: () => ipcRenderer.invoke('mecsmart:get-app-version'),

  // Lets the ERP page subscribe to "update-available" toasts from main.
  onUpdateAvailable: (cb) => {
    ipcRenderer.on('mecsmart:update-available', (_e, info) => cb(info));
  },

  // ─── Login credential persistence (encrypted via OS keychain) ───────────
  // Electron strips Chrome's built-in "Save password?" UI, so we provide
  // our own "Remember me" feature backed by Electron's safeStorage which
  // encrypts using the system keychain (Windows DPAPI / macOS Keychain /
  // libsecret on Linux). The renderer (LoginPage) checks
  // `window.mecsmart?.loadCredentials` on mount; if present, it pre-fills.
  saveCredentials: (email, password) => ipcRenderer.invoke('mecsmart:save-credentials', { email, password }),
  loadCredentials: () => ipcRenderer.invoke('mecsmart:load-credentials'),
  clearCredentials: () => ipcRenderer.invoke('mecsmart:clear-credentials'),
  // True when running inside Electron — used by the LoginPage to decide
  // whether to render the "Remember me" checkbox at all.
  isDesktopApp: true,
});
