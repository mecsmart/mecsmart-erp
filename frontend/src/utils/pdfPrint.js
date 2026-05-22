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
//   - NOTE: The diagonal "DRAFT COPY" watermark was removed per user
//     request (Round 17). Draft documents now ONLY get a small red
//     "Draft Copy" badge below the document number — see
//     `printInvoiceDoc()` in CRMPage.js where the badge is injected into
//     the doc header HTML when `doc.status === 'draft'`.
function injectPrintCss(html /*, opts */) {
  // Watermark removed per user request (Round 17).
  const draftWatermark = '';
  const extra = `
    <style id="__pdfprint_overrides__">
      /* Keep colors / backgrounds in saved PDF — browsers strip these by
         default in print to save toner. CRITICAL for the DRAFT watermark
         to be preserved through the print → Save-as-PDF pipeline. */
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      /* Only enforce paper size — let each template control its own
         margins. Forcing a 0-margin here previously pushed table content
         past the printer's non-printable edge, clipping the rightmost
         columns (GST / Total on Quotations). */
      @page { size: A4; }
      /* Constrain content to the printable column so wide tables wrap
         rather than overflow the right edge. */
      html, body { max-width: 210mm !important; margin: 0 auto !important; }
      table { max-width: 100% !important; box-sizing: border-box; }
      td, th { word-break: break-word; overflow-wrap: anywhere; }
      .page-break-before { page-break-before: always; break-before: page; }
      .avoid-break { page-break-inside: avoid; break-inside: avoid; }
      tr, thead { page-break-inside: avoid; break-inside: avoid; }
      ${draftWatermark}
    </style>
  </head>`;
  // Inject before the closing </head>; if no </head>, prepend at top of body.
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, extra);
  return html.replace(/<body[^>]*>/i, m => `<head>${extra.replace('</head>', '')}</head>${m}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Client-side PDF generation with page-number overlay.
// Used by PreviewPdfDialog as a fallback when the server Playwright endpoint
// fails (typically on local dev machines without Chromium installed) AND when
// running outside Electron (so no IPC bridge available).
//
// Why this is the final fallback (not the primary path):
//   - html2pdf rasterises the HTML via html2canvas → loses vector text quality
//   - File size is ~3x larger than vector PDFs
//   - But it works EVERYWHERE: no server deps, no Electron deps, just browser
//
// Page numbers are drawn via jsPDF AFTER html2pdf finishes rasterising every
// page — guaranteed to appear regardless of @page CSS support.
// ────────────────────────────────────────────────────────────────────────────
export async function downloadHtmlAsPdfWithPageNumbers(html, filename) {
  const safeName = sanitizeFilename(filename || 'document.pdf');
  // Render the HTML into a hidden, A4-width iframe so html2canvas captures
  // the layout at the correct paper width.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-99999px';
  iframe.style.top = '0';
  iframe.style.width = `${A4_WIDTH_PX}px`;
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(injectPrintCss(html));
    doc.close();
    // Wait for fonts + images
    await new Promise(r => setTimeout(r, 400));
    if (doc.fonts && doc.fonts.ready) {
      try { await doc.fonts.ready; } catch { /* noop */ }
    }
    const body = doc.body;
    const merged = { ...DEFAULT_HTML2PDF_OPTS, filename: safeName, margin: [4, 4, 14, 4] };
    const worker = html2pdf().set(merged).from(body).toPdf();
    const pdfObj = await worker.get('pdf');
    const total = pdfObj.internal.getNumberOfPages();
    const pageW = pdfObj.internal.pageSize.getWidth();
    const pageH = pdfObj.internal.pageSize.getHeight();
    // Draw "Page X of Y" bottom-right on every page.
    for (let p = 1; p <= total; p++) {
      pdfObj.setPage(p);
      pdfObj.setFont('helvetica', 'normal');
      pdfObj.setFontSize(8);
      pdfObj.setTextColor(100, 116, 139);  // #64748b
      pdfObj.text(`Page ${p} of ${total}`, pageW - 6, pageH - 4, { align: 'right' });
    }
    pdfObj.save(safeName);
  } finally {
    try { document.body.removeChild(iframe); } catch { /* noop */ }
  }
}

async function fallbackToHtml2Pdf(iframeBody, opts) {
  const merged = { ...DEFAULT_HTML2PDF_OPTS, ...opts };
  // ----- Running header support (every page) ------------------------------
  // When opts.runningHeader is provided we post-process the generated PDF
  // and draw a header (logo + name + multi-line address + GSTIN + invoice no)
  // on every page > 1. CSS @page margin boxes only accept strings + counters
  // (no images), so the only way to put a logo on each printed page is to
  // render the PDF and overlay the header via jsPDF directly.
  const hdr = opts.runningHeader;
  // Watermark removed per user request — `wantWatermark` always false now.
  const wantWatermark = false;
  // Fast path — no header, no watermark → just save directly.
  if (!hdr && !wantWatermark) {
    await html2pdf().set(merged).from(iframeBody).save();
    return;
  }
  // Reserve top margin only when running-header overlay needs room.
  if (hdr) merged.margin = [64, 14, 18, 14];
  const worker = html2pdf().set(merged).from(iframeBody).toPdf();
  const pdfObj = await worker.get('pdf');
  const total = pdfObj.internal.getNumberOfPages();
  const pageW = pdfObj.internal.pageSize.getWidth();
  const pageH = pdfObj.internal.pageSize.getHeight();

  // ----- DRAFT COPY watermark on every page -------------------------------
  // The SVG-background approach in injectPrintCss works for the native
  // print path (Path A) but html2canvas (used by html2pdf) does NOT
  // reliably rasterise data:image/svg+xml background-images. So when the
  // user clicks "Download PDF" from the preview dialog (which forces
  // Path B → html2pdf raster) the watermark was missing. We now overlay
  // it directly via jsPDF rotated text on every page — guaranteed to
  // render because it's drawn AFTER html2pdf is done generating pages.
  // Use a darker, more opaque red so it's clearly visible over white
  // tables (users complained the previous shade was too faded).
  if (wantWatermark) {
    for (let p = 1; p <= total; p++) {
      pdfObj.setPage(p);
      pdfObj.saveGraphicsState();
      pdfObj.setFont('helvetica', 'bold');
      pdfObj.setFontSize(110);
      // Light faded red (rgba(220, 38, 38, 0.18)-ish equivalent). jsPDF
      // doesn't have native alpha for text, but we can simulate it with a
      // GState if available, falling back to a lighter solid colour.
      try {
        const GState = pdfObj.GState;
        if (typeof GState === 'function') {
          const gs = new GState({ opacity: 0.22 });
          pdfObj.setGState(gs);
          pdfObj.setTextColor(220, 38, 38);
        } else {
          pdfObj.setTextColor(245, 200, 200);
        }
      } catch {
        pdfObj.setTextColor(245, 200, 200);
      }
      // Rotate -30° around the page centre.
      pdfObj.text('DRAFT COPY', pageW / 2, pageH / 2, {
        align: 'center',
        baseline: 'middle',
        angle: 30,
      });
      pdfObj.restoreGraphicsState();
    }
  }

  // No running header → save and return after watermark.
  if (!hdr) {
    pdfObj.save(merged.filename || 'document.pdf');
    return;
  }

  // eslint-disable-next-line no-console
  console.info('[pdfPrint] running-header path engaged', {
    pages: total, hasLogo: !!hdr.logoDataUrl, addrLines: (hdr.addressLines || []).length, companyName: hdr.companyName,
  });

  // Pre-rasterize the logo into a PNG data URL via an offscreen canvas.
  // jsPDF.addImage is finicky about formats and refuses SVG outright, so we
  // route EVERY logo (PNG/JPEG/WEBP/SVG) through the canvas to normalise it
  // to PNG. This eliminates a whole class of "logo silently disappears"
  // bugs the user reported. Doing this ONCE before the per-page loop is
  // critical for perf on large invoices.
  let imgPayload = null;
  if (hdr.logoDataUrl && typeof hdr.logoDataUrl === 'string' && hdr.logoDataUrl.startsWith('data:image/')) {
    try {
      const png = await rasterizeImageToPng(hdr.logoDataUrl, 256, 96);
      if (png) imgPayload = { dataUrl: png, fmt: 'PNG' };
      else console.warn('[pdfPrint] running-header logo rasterize returned null — using text-only header');
    } catch (e) {
      console.warn('[pdfPrint] running-header logo preprocessing skipped:', e?.message || e);
    }
  }

  for (let p = 1; p <= total; p++) {
    pdfObj.setPage(p);
    // Page numbers on every page (bottom right).
    pdfObj.setFont('helvetica', 'normal');
    pdfObj.setFontSize(8);
    pdfObj.setTextColor(100);
    pdfObj.text(`Page ${p} of ${total}`, pageW - 24, pageH - 14, { align: 'right' });
    // Skip overlay on page 1 — the in-flow brand block already lives
    // there. Overlay only appears from page 2 onwards.
    if (p === 1) continue;
    const top = 14;
    // ---- Logo ----------------------------------------------------------
    let logoBottom = top;
    if (imgPayload) {
      try {
        // 56×40pt logo box — large enough to be recognisable, small enough
        // to leave room for company name + multi-line address to its right.
        pdfObj.addImage(imgPayload.dataUrl, imgPayload.fmt, 22, top, 56, 40, undefined, 'FAST');
        logoBottom = top + 40;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[pdfPrint] running-header logo addImage failed:', e?.message || e);
      }
    }
    const textX = imgPayload ? 88 : 22;
    // ---- Company name --------------------------------------------------
    pdfObj.setFont('helvetica', 'bold');
    pdfObj.setFontSize(12);
    pdfObj.setTextColor(45, 62, 80);
    pdfObj.text(hdr.companyName || '', textX, top + 8);
    // ---- Address (multi-line) -----------------------------------------
    //
    // Strategy (defensive — many callers / older browser bundles may pass
    // different shapes of address data, so we accept ALL of them):
    //   1. hdr.addressLines (Array<string>) — preferred
    //   2. Individual fields hdr.addr1 / hdr.addr2 / hdr.phoneEmail — fallback
    //   3. hdr.addressLine (single string) — legacy fallback, will be wrapped
    pdfObj.setFont('helvetica', 'normal');
    pdfObj.setFontSize(8);
    pdfObj.setTextColor(85);
    const addrMaxW = pageW - textX - 140;
    let addrLines = [];
    if (Array.isArray(hdr.addressLines) && hdr.addressLines.length) {
      hdr.addressLines.forEach(line => {
        if (!line) return;
        const wrapped = pdfObj.splitTextToSize(String(line), addrMaxW);
        wrapped.forEach(w => addrLines.push(w));
      });
    }
    // Fallback: individual fields if array path produced nothing.
    if (addrLines.length === 0) {
      [hdr.addr1, hdr.addr2, hdr.phoneEmail].forEach(line => {
        if (!line) return;
        const wrapped = pdfObj.splitTextToSize(String(line), addrMaxW);
        wrapped.forEach(w => addrLines.push(w));
      });
    }
    // Final legacy fallback: single-line summary.
    if (addrLines.length === 0 && hdr.addressLine) {
      addrLines = pdfObj.splitTextToSize(String(hdr.addressLine), addrMaxW);
    }
    let yCursor = top + 16;
    addrLines.slice(0, 4).forEach(line => {
      pdfObj.text(line, textX, yCursor);
      yCursor += 9;
    });
    // ---- GSTIN ---------------------------------------------------------
    if (hdr.gstin) {
      pdfObj.setFont('helvetica', 'bold');
      pdfObj.setFontSize(8);
      pdfObj.setTextColor(45, 62, 80);
      pdfObj.text(`GSTIN: ${hdr.gstin}`, textX, yCursor);
      yCursor += 9;
    }
    // Right side: doc title + number
    pdfObj.setFont('helvetica', 'bold');
    pdfObj.setFontSize(10);
    pdfObj.setTextColor(45, 62, 80);
    pdfObj.text(hdr.docTitle || '', pageW - 22, top + 8, { align: 'right' });
    pdfObj.setFont('courier', 'normal');
    pdfObj.setFontSize(9);
    pdfObj.setTextColor(85);
    pdfObj.text(hdr.docNo || '', pageW - 22, top + 18, { align: 'right' });
    // ---- Divider line --------------------------------------------------
    const dividerY = Math.max(logoBottom, yCursor) + 4;
    pdfObj.setDrawColor(45, 62, 80);
    pdfObj.setLineWidth(0.5);
    pdfObj.line(22, dividerY, pageW - 22, dividerY);
  }
  pdfObj.save(merged.filename || 'document.pdf');
}

// Rasterize ANY image data URL (PNG/JPEG/WEBP/SVG) into a normalised PNG
// data URL via an offscreen <canvas>. jsPDF.addImage is finicky about
// formats (rejects SVG outright, and we've seen failures on certain
// PNG/JPEG combos in the wild), so we route every logo through this
// helper to guarantee a clean, embeddable PNG. Returns null if the
// browser can't decode the image.
async function rasterizeImageToPng(dataUrl, targetW = 256, targetH = 96) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          // Preserve aspect ratio: fit inside the target box with letterboxing.
          const iw = img.width || img.naturalWidth || targetW;
          const ih = img.height || img.naturalHeight || targetH;
          const ar = iw / ih || 1;
          const boxAr = targetW / targetH;
          let drawW, drawH, dx, dy;
          if (ar > boxAr) { drawW = targetW; drawH = targetW / ar; dx = 0; dy = (targetH - drawH) / 2; }
          else { drawH = targetH; drawW = targetH * ar; dy = 0; dx = (targetW - drawW) / 2; }
          ctx.clearRect(0, 0, targetW, targetH);
          ctx.drawImage(img, dx, dy, drawW, drawH);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          console.warn('[pdfPrint] canvas rasterize failed:', e?.message || e);
          resolve(null);
        }
      };
      img.onerror = (err) => {
        console.warn('[pdfPrint] image load failed for rasterize:', err?.message || err);
        resolve(null);
      };
      img.src = dataUrl;
    } catch (e) {
      console.warn('[pdfPrint] rasterizeImageToPng exception:', e?.message || e);
      resolve(null);
    }
  });
}

// Legacy alias — some callers may still reference this; keep as thin proxy.
async function svgDataUrlToPngDataUrl(dataUrl, targetW = 256, targetH = 96) {
  return rasterizeImageToPng(dataUrl, targetW, targetH);
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
  // Always run HTML through injectPrintCss for A4 sizing + table word-wrap.
  // (Watermark CSS was removed in Round 17 — `draft` flag now no-op here.)
  const drafted = injectPrintCss(html);
  // Preview mode → dispatch a global event for the in-page PreviewPdfDialog
  // to pick up. We deliberately don't import the dialog component here to
  // avoid a circular import; the App-level dialog listens for this event.
  // Callers that want to FORCE direct-download even when preview was the
  // original intent can pass `options.forceDownload = true` (used by the
  // dialog's own "Download PDF" button).
  if (options.preview && !options.forceDownload) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mecsmart:preview', {
        detail: { html: drafted, filename: cleanFilename },
      }));
    }
    return;
  }
  const finalHtml = drafted;

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

    // ---- Path A: native print dialog (default — skipped when a
    //              runningHeader is requested because the @page margin
    //              boxes can't carry images; html2pdf+jsPDF post-processing
    //              is the only reliable way to draw a logo on each page) --
    if (!options.forceDownload && !options.runningHeader) {
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

    // ---- Path B: html2pdf.js raster pipeline ------------
    //  - Used when forceDownload=true OR a runningHeader config is supplied
    //    (so we can post-process pages with jsPDF.addImage to draw the logo).
    await fallbackToHtml2Pdf(doc.body, {
      ...(options.html2pdf || {}),
      filename: cleanFilename,
      runningHeader: options.runningHeader,
      draft: !!options.draft,
    });
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
