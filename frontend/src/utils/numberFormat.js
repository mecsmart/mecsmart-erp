// Shared number-formatting helpers used inside HTML print templates.
//
// Browser print PDFs are rendered from raw HTML strings, so we can't lean on
// `formatCurrency` from CompanySettingsContext (it uses React hooks). This
// module provides plain functions usable from anywhere — including the
// non-React print template builders in CRMPage / PrintDialogs / BOMPage.

// Indian-style grouping (1,23,456.78) — matches typical Tally / GST invoice
// conventions. Pass `locale='en-US'` if you want plain Western grouping
// (123,456.78) for export documents.
export function fmtAmt(value, { locale = 'en-IN', decimals = 2 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number(0).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return n.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Same as `fmtAmt` but takes a currency code so non-INR documents render with
// Western grouping (US/UK/EU). Indian docs default to en-IN.
export function fmtAmtForCurrency(value, currencyCode = 'INR', decimals = 2) {
  const isIndian = !currencyCode || currencyCode.toUpperCase() === 'INR';
  return fmtAmt(value, { locale: isIndian ? 'en-IN' : 'en-US', decimals });
}

// Quantity formatter — typically 0–4 decimal places, no currency grouping
// requirements. Falls back to fixed(2) when the UOM has no decimal hint.
export function fmtQty(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return (0).toFixed(decimals);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
