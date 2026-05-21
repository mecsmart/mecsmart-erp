import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

/**
 * Drop-in replacement for `window.prompt()`.
 *
 * Electron's renderer process and React 18 strict mode have deprecated/
 * disabled the native `prompt()` API — calling it throws
 * `prompt() is and will not be supported`. This component renders a
 * styled modal that resolves a Promise with the user's input (or null
 * on cancel), so the call-site signature stays one-line:
 *
 *   const reason = await promptDialog({ title, message, defaultValue });
 *
 * Internally a module-level singleton listens for a `mecsmart:prompt`
 * custom event and shows the dialog, so any page in the app can call
 * `promptDialog(...)` without importing or mounting anything.
 */

export function PromptDialog() {
  const [state, setState] = useState({ open: false, title: '', message: '', value: '', resolve: null });
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      const { title, message, defaultValue, multiline, resolve } = e.detail || {};
      setState({ open: true, title: title || 'Input required', message: message || '', value: defaultValue || '', multiline: !!multiline, resolve });
    };
    window.addEventListener('mecsmart:prompt', handler);
    return () => window.removeEventListener('mecsmart:prompt', handler);
  }, []);

  useEffect(() => {
    if (state.open && inputRef.current) {
      // Autofocus + select default value so the user can just type to replace.
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select?.(); }, 50);
    }
  }, [state.open]);

  const handleConfirm = () => {
    if (state.resolve) state.resolve(state.value);
    setState({ open: false, title: '', message: '', value: '', resolve: null });
  };
  const handleCancel = () => {
    if (state.resolve) state.resolve(null);
    setState({ open: false, title: '', message: '', value: '', resolve: null });
  };

  return (
    <Dialog open={state.open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-md" data-testid="prompt-dialog">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          {state.message ? (
            <DialogDescription className="whitespace-pre-line text-sm text-[#4B5563]">
              {state.message}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="mt-2">
          {state.multiline ? (
            <textarea ref={inputRef} value={state.value} onChange={(e) => setState(s => ({ ...s, value: e.target.value }))}
              rows={4} className="w-full border border-[#D1D5DB] rounded-sm p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3557]"
              data-testid="prompt-dialog-input" />
          ) : (
            <input ref={inputRef} type="text" value={state.value} onChange={(e) => setState(s => ({ ...s, value: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } }}
              className="w-full border border-[#D1D5DB] rounded-sm p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3557]"
              data-testid="prompt-dialog-input" />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={handleCancel} className="btn-secondary px-4 py-1.5 text-sm" data-testid="prompt-dialog-cancel">Cancel</button>
          <button onClick={handleConfirm} className="btn-primary px-4 py-1.5 text-sm" data-testid="prompt-dialog-ok">OK</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Imperative API. Resolves to the entered string, or null if user cancels.
 */
export function promptDialog({ title, message, defaultValue = '', multiline = false } = {}) {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent('mecsmart:prompt', {
      detail: { title, message, defaultValue, multiline, resolve },
    }));
  });
}

export default PromptDialog;
