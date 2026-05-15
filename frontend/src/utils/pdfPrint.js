// Centralized HTML → PDF download helper.
//
// Why this exists:
// Many enterprise / shop-floor environments block `window.open('', '_blank')`
// (popup blocker) AND blob-URL pop-ups, so the legacy "open print preview in
// a new tab → user hits Ctrl+P" flow fails silently with a blank window or a
// red `Update check failed` style error. We replace that flow with a direct
// PDF download which works inside every popup blocker / kiosk policy.
//
// IMPLEMENTATION:
// 1. Render the print HTML inside a HIDDEN same-origin iframe sized to the
//    A4 print width (794 CSS-px = 210 mm at 96 DPI). The iframe height grows
//    to fit the content so html2canvas can capture every row without
//    truncation.
// 2. We try the native print dialog first (`iframe.contentWindow.print()`)
//    — modern browsers expose a "Save as PDF" destination, which produces a
//    pixel-perfect VECTOR PDF (real selectable text, sharp tables, correct
//    page breaks). The print dialog is NOT a popup, so kiosk popup blockers
//    leave it alone.
// 3. If `forceDownload === true`, OR the browser swallows `window.print()`,
//    we fall back to the html2pdf.js raster pipeline so the user still gets
//    a downloadable PDF (lower quality but never fails).
//
// Usage:
//   import { downloadHtmlAsPdf } from '../utils/pdfPrint';
//   await downloadHtmlAsPdf(html, 'BOM-PN12345.pdf');
//
// `html` should be a complete `<!DOCTYPE html>… </html>` string just like
// what we used to feed to `w.document.write`.

import html2pdf from 'html2pdf.js';
import { toast } from 'sonner';

// A4 width in CSS pixels at 96 DPI. Locking iframe + html2canvas viewport to
// this value preserves the print templates' intended column widths and keeps
// tables from being squished or stretched horizontally.
const A4_WIDTH_PX = 794;

// Reasonable html2pdf defaults. `margin: 0` is critical — every print
// template (BOM, Quotation, PO, Invoice…) ships its own body/page padding,
// so adding additional html2pdf margin produced the "screeched" output the
// user reported (double-padding squashed tables and split rows mid-row).
const DEFAULT_HTML2PDF_OPTS = {
  margin: 0,
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: {
    scale: 2,                 // 2× sharper text/lines on retina + print
    useCORS: true,
    logging: false,
    windowWidth: A4_WIDTH_PX, // force layout viewport ⇒ no horizontal stretch
    letterRendering: true,
  },
  jsPDF: {
    unit: 'pt',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  },
  pagebreak: {
    // `css` honours @page-break-* hints in the template; `legacy` keeps it
    // compatible with templates that haven't migrated to break-* yet. The
    // `avoid` list prevents table rows + headers from splitting mid-row,
    // which was another visible alignment glitch in the user's PDFs.
    mode: ['css', 'legacy'],
    avoid: ['tr', 'thead', '.avoid-break', '.no-break'],
  },
};

function sanitizeFilename(name) {
  const safe = String(name || 'document').replace(/[^A-Za-z0-9._-]+/g, '_');
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

// Inject extra CSS into the rendered HTML so html2canvas + jsPDF behave well:
//   - Force body width to A4 (no horizontal scale-down)
//   - Disable any leftover @media print rules that hide content
//   - Add `print-color-adjust: exact` so colored headers/badges survive
function injectPrintCss(html) {
  const extra = `
    <style id="__pdfprint_overrides__">
      html, body { width: ${A4_WIDTH_PX}px !important; max-width: ${A4_WIDTH_PX}px !important; margin: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      @page { size: A4; margin: 0; }
      .page-break-before { page-break-before: always; break-before: page; }
      .avoid-break { page-break-inside: avoid; break-inside: avoid; }
      tr, thead { page-break-inside: avoid; break-inside: avoid; }
    </style>
  </head>`;
  // Inject before the closing </head>; if no </head>, prepend at top of body.
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, extra);
  return html.replace(/<body[^>]*>/i, m => `<head>${extra.replace('</head>', '')}</head>${m}`);
}

async function fallbackToHtml2Pdf(iframeBody, opts) {
  const merged = { ...DEFAULT_HTML2PDF_OPTS, ...opts };
  await html2pdf().set(merged).from(iframeBody).save();
}

/**
 * Render the given HTML string and trigger a PDF download.
 *
 * Default flow (best quality):
 *   - Build a hidden iframe at A4 width
 *   - Trigger `iframe.contentWindow.print()` so the user gets the browser's
 *     native print dialog with "Save as PDF" already preselected as the
 *     destination on most modern OS / browser combos.
 *
 * Forced-download flow:
 *   - Pass `{ forceDownload: true }` to skip the print dialog and go
 *     straight to the html2pdf.js raster pipeline. Useful for batch
 *     exports / unattended workflows.
 *
 * @param {string} html        Full HTML document string.
 * @param {string} filename    Desired download filename (`.pdf` auto-appended).
 * @param {object} [options]
 * @param {boolean} [options.forceDownload=false]  Skip print dialog, raster-PDF directly.
 * @param {object}  [options.html2pdf]             Extra options to merge with defaults.
 */
export async function downloadHtmlAsPdf(html, filename, options = {}) {
  const cleanFilename = sanitizeFilename(filename);
  const finalHtml = injectPrintCss(html);

  // Build hidden iframe — sits in the corner so it never repaints visible UI.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = `${A4_WIDTH_PX}px`;
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = cleanFilename;          // shown in print dialog as job title
  document.body.appendChild(iframe);

  const cleanup = () => {
    // CRITICAL: `iframe.contentWindow.print()` is non-blocking in modern
    // Chromium/Edge/Firefox when "Save as PDF" is the destination — the
    // browser opens a Print Preview UI and only writes the PDF when the
    // user actually clicks "Save". If we remove the iframe before that
    // happens, the print job loses its source DOM and the saved file is
    // 0 bytes (reported on Quotations specifically because their cover
    // page makes users linger longer in the Print Preview).
    //
    // The reliable signal is the `afterprint` event, which fires on the
    // iframe's window once the dialog closes (regardless of Save/Cancel).
    // We listen and only then remove the iframe. A 5-minute fallback
    // ensures the iframe doesn't leak if the event never fires.
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      try { iframe.remove(); } catch { /* noop */ }
    };
    try { iframe.contentWindow.addEventListener('afterprint', remove, { once: true }); } catch { /* noop */ }
    window.addEventListener('afterprint', remove, { once: true });
    setTimeout(remove, 5 * 60 * 1000); // hard safety: 5 minutes
  };

  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(finalHtml);
    doc.close();

    // Override the iframe document's <title> to our chosen filename (without
    // the `.pdf` extension — the browser appends it). This is what Chrome,
    // Edge, Firefox and Safari prefill in the "Save as PDF" dialog when the
    // user picks the PDF destination, so our naming convention (PO-XXX,
    // Quotation-XXX, BOM-XXX, etc.) carries through end-to-end.
    try {
      const titleNoExt = cleanFilename.replace(/\.pdf$/i, '');
      doc.title = titleNoExt;
    } catch { /* noop */ }

    // Wait for fonts + images inside the iframe.
    await new Promise((resolve) => {
      const finish = () => resolve();
      if (doc.readyState === 'complete') {
        requestAnimationFrame(() => setTimeout(finish, 150));
      } else {
        iframe.addEventListener('load', finish, { once: true });
        setTimeout(finish, 4000); // safety
      }
    });
    if (doc.fonts && doc.fonts.ready) {
      try { await doc.fonts.ready; } catch { /* noop */ }
    }

    // ---- Path A: native print dialog (default) ------------------------------
    if (!options.forceDownload) {
      try {
        // FILENAME PREFILL: Most browsers use the PARENT document's title
        // (not the iframe's title) as the default "Save as PDF" filename
        // when a same-origin iframe calls `print()`. So we swap the parent
        // page title to our desired filename, fire the print dialog, then
        // restore the original title once the user closes the dialog.
        const originalTitle = document.title;
        const titleNoExt = cleanFilename.replace(/\.pdf$/i, '');
        document.title = titleNoExt;
        // Restore the parent title once the print dialog closes. Browsers
        // fire `afterprint` on the iframe's window — and on Chromium /
        // Firefox the parent window also receives it. We listen to BOTH so
        // the title gets restored regardless of which fires first.
        const restoreTitle = () => { try { document.title = originalTitle; } catch { /* noop */ } };
        try { iframe.contentWindow.addEventListener('afterprint', restoreTitle, { once: true }); } catch { /* noop */ }
        window.addEventListener('afterprint', restoreTitle, { once: true });
        // Hard safety: regardless of afterprint reliability, restore after 30s.
        setTimeout(restoreTitle, 30000);

        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        toast.success('Save as PDF in the print dialog to download.', { duration: 3500 });
        cleanup();
        return;
      } catch (printErr) {
        console.warn('[pdfPrint] native print() failed, falling back to html2pdf', printErr);
        // fall through to html2pdf raster pipeline
      }
    }

    // ---- Path B: html2pdf.js fallback (raster but always works) ------------
    await fallbackToHtml2Pdf(doc.body, { ...(options.html2pdf || {}), filename: cleanFilename });
    toast.success(`Downloaded ${cleanFilename}`);
  } catch (e) {
    console.error('[pdfPrint] failed:', e);
    toast.error(`Could not generate PDF: ${e.message || e}`);
    throw e;
  } finally {
    cleanup();
  }
}

export default downloadHtmlAsPdf;
