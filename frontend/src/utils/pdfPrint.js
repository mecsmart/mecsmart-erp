// Centralized HTML → PDF download helper.
//
// Why this exists:
// Many enterprise / shop-floor environments block `window.open('', '_blank')`
// (popup blocker) AND blob-URL pop-ups, so the legacy "open print preview in
// a new tab → user hits Ctrl+P" flow fails silently with a blank window or a
// red `Update check failed` style error. We replace that flow with a direct
// PDF download (a same-origin `<a download>` click) which is allowed by every
// popup blocker / kiosk policy because it isn't a navigation event.
//
// Usage:
//   import { downloadHtmlAsPdf } from '../utils/pdfPrint';
//   await downloadHtmlAsPdf(html, 'BOM-PN12345.pdf');
//
// `html` should be a complete `<!DOCTYPE html>… </html>` string just like
// what we used to feed to `w.document.write`. The helper renders it inside a
// hidden iframe (so external CSS, page styles and `@media print` rules apply
// normally) then hands it to html2pdf.js for the conversion.

import html2pdf from 'html2pdf.js';
import { toast } from 'sonner';

// Reasonable defaults for A4 letterhead docs (BOM, Quotation, Invoice, etc.).
const DEFAULT_OPTS = {
  margin: [10, 10, 10, 10],   // mm
  image: { type: 'jpeg', quality: 0.95 },
  html2canvas: { scale: 2, useCORS: true, logging: false },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
};

function sanitizeFilename(name) {
  const safe = String(name || 'document').replace(/[^A-Za-z0-9._-]+/g, '_');
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

/**
 * Render the given HTML string and trigger a PDF download in the user's
 * browser. Returns a Promise that resolves once the PDF has been saved.
 *
 * @param {string} html        Full HTML document string.
 * @param {string} filename    Desired download filename (`.pdf` auto-appended).
 * @param {object} [optsOverride]  Optional html2pdf options to merge.
 */
export async function downloadHtmlAsPdf(html, filename, optsOverride = {}) {
  const opts = { ...DEFAULT_OPTS, ...optsOverride, filename: sanitizeFilename(filename) };

  // Mount a hidden, isolated iframe so the document's CSS/font sizing applies
  // exactly as it would in a real print preview. We can't simply parse the
  // HTML into a div on the current page — that would inherit Tailwind/global
  // styles and break the carefully-tuned A4 templates.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for fonts + images inside the iframe to settle before snapshotting.
    await new Promise((resolve) => {
      const onLoad = () => resolve();
      if (doc.readyState === 'complete') {
        // Give one extra animation frame for late-binding images / @font-face.
        requestAnimationFrame(() => setTimeout(resolve, 100));
      } else {
        iframe.addEventListener('load', onLoad, { once: true });
        // Safety net: never wait more than 4 s — html2canvas will still fire
        // and any missing images simply render as broken icons, same as print.
        setTimeout(resolve, 4000);
      }
    });

    // Wait for any document.fonts, when supported.
    if (doc.fonts && doc.fonts.ready) {
      try { await doc.fonts.ready; } catch { /* noop */ }
    }

    const root = doc.body;
    await html2pdf().set(opts).from(root).save();
    toast.success(`Downloaded ${opts.filename}`);
  } catch (e) {
    console.error('[pdfPrint] failed:', e);
    toast.error(`Could not generate PDF: ${e.message || e}`);
    throw e;
  } finally {
    // Always clean up the hidden iframe so we don't leak DOM nodes.
    setTimeout(() => { try { iframe.remove(); } catch { /* noop */ } }, 200);
  }
}

export default downloadHtmlAsPdf;
