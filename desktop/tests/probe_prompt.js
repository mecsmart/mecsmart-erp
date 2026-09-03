// Supplementary probe (iteration 154): does window.prompt() survive in Electron
// and is it covered by installDialogShims()? BOMPage.js:500 and
// SettingsPage.js:828 still call the native prompt().
const path = require('path');
const { app, dialog } = require('electron');

const calls = [];
dialog.showMessageBoxSync = (win, opts) => { calls.push({ win: !!win, type: opts.type }); return 0; };

const fail = (m) => { console.log('PROBE_FAIL ' + m); app.exit(1); };
const timer = setTimeout(() => fail('timeout'), 60000);

app.on('browser-window-created', (_e, win) => {
  win.setMinimumSize(800, 600); win.setSize(800, 600);
  win.webContents.on('did-finish-load', async () => {
    if (!win.webContents.getURL().startsWith('http')) return;
    const wc = win.webContents;
    try {
      await new Promise(r => setTimeout(r, 1500));
      const res = await wc.executeJavaScript(`({
        promptIsNative: /native code/.test(String(window.prompt)),
        promptShimmed: window.__mecsmartDialogShim === true && !/native code/.test(String(window.prompt)),
        promptResult: (function(){ try { return JSON.stringify(window.prompt('Enter new revision:', 'B')); } catch (e) { return 'THREW: ' + e.message; } })()
      })`);
      clearTimeout(timer);
      console.log('PROBE_RESULT ' + JSON.stringify(res));
      console.log('PROBE_DIALOG_CALLS ' + JSON.stringify(calls));
      app.exit(0);
    } catch (e) { fail(String(e && e.stack || e)); }
  });
});

require(path.join(__dirname, '..', 'main.js'));
