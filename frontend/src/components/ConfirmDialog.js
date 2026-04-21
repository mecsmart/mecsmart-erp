import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { AlertTriangle } from 'lucide-react';

/**
 * Reusable confirmation dialog.
 * Props:
 *  - open (bool), onOpenChange (fn)
 *  - title, message (strings or ReactNode)
 *  - confirmLabel (default 'Confirm'), cancelLabel (default 'Cancel')
 *  - onConfirm (async fn)
 *  - variant: 'danger' | 'primary' (default 'danger')
 *  - testidPrefix: string prefix for data-testids (default 'confirm')
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'danger',
  testidPrefix = 'confirm',
}) {
  const [busy, setBusy] = React.useState(false);
  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  const iconColor = variant === 'danger' ? 'text-[#9B1C1C]' : 'text-[#1D3557]';
  const btnClass = variant === 'danger' ? 'btn-primary !bg-[#9B1C1C] hover:!bg-[#7a1515]' : 'btn-primary';

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md" data-testid={`${testidPrefix}-dialog`}>
        <DialogHeader>
          <DialogTitle className="font-[Chivo] flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${iconColor}`} />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-3 text-sm text-[#374151]" data-testid={`${testidPrefix}-message`}>
          {message}
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <button className="btn-secondary" onClick={() => onOpenChange(false)} disabled={busy} data-testid={`${testidPrefix}-cancel-btn`}>{cancelLabel}</button>
          <button className={btnClass} onClick={handleConfirm} disabled={busy} data-testid={`${testidPrefix}-confirm-btn`}>{busy ? 'Working...' : confirmLabel}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
