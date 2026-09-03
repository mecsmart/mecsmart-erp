// preload.js — exposes a small, locked-down API on `window.mecsmart`.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mecsmart', {
  getServerUrl: () => ipcRenderer.invoke('mecsmart:get-server-url'),
  saveServerUrl: (url) => ipcRenderer.invoke('mecsmart:save-server-url', url),
  getAppVersion: () => ipcRenderer.invoke('mecsmart:get-app-version'),
  onUpdateAvailable: (cb) => { ipcRenderer.on('mecsmart:update-available', (_e, info) => cb(info)); },

  // Remember-me credentials (encrypted with the OS keychain / DPAPI).
  saveCredentials: (email, password) => ipcRenderer.invoke('mecsmart:save-credentials', { email, password }),
  loadCredentials: () => ipcRenderer.invoke('mecsmart:load-credentials'),
  clearCredentials: () => ipcRenderer.invoke('mecsmart:clear-credentials'),

  // Native vector PDF export via Chromium printToPDF.
  downloadPdf: (html, filename) => ipcRenderer.invoke('mecsmart:download-pdf', { html, filename }),

  // Synchronous OS message boxes — replace Chromium's JS alert()/confirm()
  // which break keyboard input on Windows after they close.
  nativeAlert: (message) => ipcRenderer.sendSync('mecsmart:native-alert', message),
  nativeConfirm: (message) => ipcRenderer.sendSync('mecsmart:native-confirm', message),

  // Backward-compatible no-op (older frontend builds still call it).
  refocusMain: () => ipcRenderer.invoke('mecsmart:refocus-main'),
  isDesktopApp: true,
});
