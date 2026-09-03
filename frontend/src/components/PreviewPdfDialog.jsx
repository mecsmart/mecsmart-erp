// PreviewPdfDialog — IN-PAGE modal preview for printable HTML documents.
//
// Why this exists:
// `window.open('', '_blank')` is blocked by:
//   - Electron's default popup handler
//   - Kiosk-locked browsers
//   - Most popup blockers in corporate environments
//
// Direct `iframe.contentWindow.print()` works but jumps the user straight
// into the native print dialog — no chance to review first, no obvious
// "Download" affordance.
//
// This component renders the printable HTML inside a hidden same-origin
// iframe wrapped in a Radix Dialog modal. The user gets a true preview
// (with all pages rendered, scroll-through, multi-page header repeating)
// AND two clear actions: "Print / Save as PDF" (native dialog) and
// "Download PDF" (forced html2pdf raster). Works inside Electron with no
// desktop rebuild required.

import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Printer, Download, X } from 'lucide-react';
import { downloadHtmlAsPdfWithPageNumbers } from '../utils/pdfPrint';
import { api } from '../context/AuthContext';
import { toast } from 'sonner';

// Global event bridge — callers anywhere in the app can pop the preview
// by dispatching a custom event, so we don't have to thread an
// `openPreview` prop through every page component.
//
// Usage from anywhere:
//   window.dispatchEvent(new CustomEvent('mecsmart:preview', {
//     detail: { html: '<!doctype html>…</html>', filename: 'Quotation-123.pdf' }
//   }));
export function openPdfPreview(html, filename) {
  window.dispatchEvent(new CustomEvent('mecsmart:preview', {
    detail: { html, filename },
  }));
}

export default function PreviewPdfDialog() {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState('');
  const [filename, setFilename] = useState('document.pdf');
  const iframeRef = useRef(null);

  // Listen for global preview events (see openPdfPreview helper above).
  useEffect(() => {
    const handler = (e) => {
      setHtml(e.detail?.html || '');
      setFilename(e.detail?.filename || 'document.pdf');
      setOpen(true);
    };
    window.addEventListener('mecsmart:preview', handler);
    return () => window.removeEventListener('mecsmart:preview', handler);
  }, []);

  // Write the HTML into the iframe whenever it (re)opens. Using
  // contentDocument.write keeps the iframe same-origin so we can later
  // call iframe.contentWindow.print() without cross-origin errors.
  // NOTE: We use a small timeout to ensure the iframe is fully mounted
  // in the DOM before attempting to write content. Without this delay,
  // the iframe's contentDocument may not be ready when the Dialog first
  // opens, resulting in a blank preview.
  useEffect(() => {
    if (!open || !html) return;
    
    const writeContent = () => {
      const ifr = iframeRef.current;
      if (!ifr) return;
      
      try {
        const doc = ifr.contentDocument || ifr.contentWindow?.document;
        if (!doc) {
          console.warn('[PreviewPdfDialog] iframe document not accessible');
          return;
        }
        doc.open();
        doc.write(html);
        doc.close();
        try {
          doc.title = filename.replace(/\.pdf$/i, '');
        } catch { /* noop */ }
      } catch (err) {
        console.warn('[PreviewPdfDialog] failed to write content:', err);
      }
    };
    
    // Small delay to ensure iframe is mounted
    const timer = setTimeout(writeContent, 100);
    return () => clearTimeout(timer);
  }, [open, html, filename]);

  const handlePrint = () => {
    const ifr = iframeRef.current;
    if (!ifr) return;
    try {
      ifr.contentWindow.focus();
      ifr.contentWindow.print();
    } catch (err) {
      console.warn('[PreviewPdfDialog] print() failed', err);
    }
  };

  const handleDownload = async () => {
    // PRIMARY PATH — Electron desktop wrapper (production users).
    // When running inside the desktop app, use the native
    // webContents.printToPDF() IPC bridge. Produces a vector PDF
    // identical to the user's "Print → Save as PDF" output and
    // bypasses the unstable backend Playwright endpoint entirely.
    const desktop = typeof window !== 'undefined' ? window.mecsmart : null;
    const hasDesktopBridge = !!(desktop && typeof desktop.downloadPdf === 'function');
    if (hasDesktopBridge) {
      let ipcError = null;
      try {
        const res = await desktop.downloadPdf(html, filename);
        if (res?.ok) return;                  // saved to disk
        if (res?.canceled) return;            // user cancelled the save dialog
        ipcError = res?.error || 'Unknown Electron error';
      } catch (ipcErr) {
        ipcError = (ipcErr && ipcErr.message) || String(ipcErr);
      }
      // The Electron IPC bridge IS available but the PDF generation
      // itself failed. Surface the error AND fall back to client-side
      // html2pdf with jsPDF page numbers so the user still gets a file.
      console.warn('[PreviewPdfDialog] Electron downloadPdf failed, trying client-side fallback:', ipcError);
      try {
        await downloadHtmlAsPdfWithPageNumbers(html, filename);
        return;
      } catch (clientErr) {
        console.error('[PreviewPdfDialog] client-side fallback also failed:', clientErr);
        toast.error(`Download PDF failed: ${ipcError}. Please use "Print / Save as PDF" instead.`);
        return;
      }
    }

    // FALLBACK — server-side Chromium PDF (browser users, dev preview).
    // Only reached when running OUTSIDE the desktop wrapper (e.g. in a
    // browser tab pointing at the dev server). The backend endpoint may
    // be unstable in production, but works in dev/test.
    // If BOTH backends fail (no Playwright/Chromium on local dev), we
    // fall back to a client-side rasteriser with page-number overlay
    // (html2pdf + jsPDF) so the user always gets a downloadable PDF.
    try {
      const ifr = document.querySelector('[data-testid="pdf-preview-iframe"]');
      const srcHtml = (ifr && ifr.srcdoc) || html;
      const resp = await api.post('/api/print/html-to-pdf', { html: srcHtml, filename }, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      let msg = err?.message || 'Unknown error';
      try {
        const blob = err?.response?.data;
        if (blob && typeof blob.text === 'function') {
          const txt = await blob.text();
          try { msg = JSON.parse(txt).detail || txt; } catch { msg = txt; }
        }
      } catch { /* noop */ }
      console.warn('[PreviewPdfDialog] server PDF failed, trying client-side fallback:', msg);
      // FINAL FALLBACK — client-side html2pdf with jsPDF page-number overlay.
      // This works even when the local backend has no Chromium installed
      // (e.g. user's localhost dev environment). Output is rasterised so
      // quality is lower than the vector path, but every page DOES get a
      // "Page X of Y" footer drawn directly via jsPDF.
      try {
        await downloadHtmlAsPdfWithPageNumbers(html, filename);
      } catch (clientErr) {
        console.error('[PreviewPdfDialog] client-side fallback also failed:', clientErr);
        // eslint-disable-next-line no-alert
        alert(`Download PDF failed.\n\nServer: ${msg}\nClient fallback: ${clientErr?.message || clientErr}\n\nPlease use "Print / Save as PDF" instead.`);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[92vh] p-0 flex flex-col bg-white [&>button:last-child]:hidden"
        data-testid="pdf-preview-dialog"
      >
        <DialogTitle className="sr-only">PDF Preview — {filename}</DialogTitle>
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2">
          <div className="text-sm font-semibold text-[#0F172A] truncate" data-testid="pdf-preview-title">
            {filename.replace(/\.pdf$/i, '')}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1D3557] text-white text-xs font-semibold rounded hover:bg-[#142849]"
              data-testid="pdf-preview-print"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save as PDF
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FEF3C7] text-[#723B13] text-xs font-semibold rounded hover:bg-[#FDE68A] border border-[#FBBF24]"
              data-testid="pdf-preview-download"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 text-[#4B5563] hover:bg-[#E5E7EB] rounded"
              data-testid="pdf-preview-close"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Iframe — fills remaining space */}
        <iframe
          ref={iframeRef}
          title={filename}
          className="flex-1 w-full border-0 bg-[#E5E7EB]"
          data-testid="pdf-preview-iframe"
        />
      </DialogContent>
    </Dialog>
  );
}
