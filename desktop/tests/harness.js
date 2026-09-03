// Headless harness: boots the real main.js, then verifies the alert/confirm shim
// and that keyboard input still reaches inputs after dialogs.
// Run: DISPLAY=:99 XDG_CONFIG_HOME=/tmp/eltest electron tests/harness.js --dev --no-sandbox
const path = require('path');
const { app, dialog, BrowserWindow } = require('electron');

const calls = [];
dialog.showMessageBoxSync = (win, opts) => { calls.push({ win: !!win, type: opts.type, buttons: opts.buttons, message: opts.message }); return 0; };

const results = {};
const fail = (m) => { console.log('HARNESS_FAIL ' + m); app.exit(1); };
const timer = setTimeout(() => fail('timeout'), 60000);

app.on('browser-window-created', (_e, win) => {
  console.log('HARNESS_WIN created');
  // Xvfb software renderer crashes above ~1100px; irrelevant on real desktops.
  win.setMinimumSize(800, 600); win.setSize(800, 600);
  win.webContents.on('did-fail-load', (_x, code, desc, url) => console.log('HARNESS_FAILLOAD', code, desc, url));
  win.webContents.on('did-finish-load', async () => {
    console.log('HARNESS_LOADED', win.webContents.getURL());
    if (!win.webContents.getURL().startsWith('http')) return;
    const wc = win.webContents;
    try {
      await new Promise(r => setTimeout(r, 1500));
      results.shim = await wc.executeJavaScript(`({
        shim: window.__mecsmartDialogShim === true,
        alertNative: /native code/.test(String(window.alert)),
        confirmNative: /native code/.test(String(window.confirm)),
        promptSafe: (function(){ try { return window.prompt('x') === null; } catch (e) { return false; } })(),
        isDesktop: !!(window.mecsmart && window.mecsmart.isDesktopApp),
        url: location.href })`);
      console.log('HARNESS_SHIM', JSON.stringify(results.shim));

      results.confirmOk = await wc.executeJavaScript(`window.confirm('Delete this?')`);
      console.log('HARNESS_CONFIRM', results.confirmOk);
      results.alertRet = await wc.executeJavaScript(`(function(){ window.alert('Saved'); return 'returned'; })()`);
      results.dialogCalls = calls;

      // Typing after dialogs: focus the first input and send real key events.
      await wc.executeJavaScript(`(function(){const e=document.querySelector('input:not([type=hidden])'); e.value=''; e.focus(); return !!e;})()`);
      for (const ch of 'abc') {
        wc.sendInputEvent({ type: 'keyDown', keyCode: ch });
        wc.sendInputEvent({ type: 'char', keyCode: ch });
        wc.sendInputEvent({ type: 'keyUp', keyCode: ch });
      }
      await new Promise(r => setTimeout(r, 400));
      results.typedAfterDialogs = await wc.executeJavaScript(`document.activeElement && document.activeElement.value`);
      results.activeTag = await wc.executeJavaScript(`document.activeElement && document.activeElement.tagName`);

      clearTimeout(timer);
      console.log('HARNESS_RESULT ' + JSON.stringify(results));
      const ok = results.shim.shim && !results.shim.alertNative && !results.shim.confirmNative && results.shim.promptSafe
        && results.confirmOk === true && results.alertRet === 'returned'
        && calls.length === 2 && results.typedAfterDialogs === 'abc';
      console.log(ok ? 'HARNESS_PASS' : 'HARNESS_FAIL checks');
      app.exit(ok ? 0 : 1);
    } catch (e) {
      fail(String(e && e.stack || e));
    }
  });
});

require(path.join(__dirname, '..', 'main.js'));
