// UOM-aware quantity formatter.
//
// Each UOM in the master can carry a `decimal_places` value (0..6). This helper
// formats a numeric quantity using the UOM's configured precision so that the
// SAME number renders consistently across Stock, BOM, Transactions and
// printable docs.
//
// Usage:
//   import { formatQty } from '../utils/uomFormat';
//   formatQty(12.5, 'kg', uomsList)        → "12.500"
//   formatQty(7,    'pcs', uomsList)       → "7"
//   formatQty(3.456, undefined, [])        → "3.46"  // sane fallback (2 dp)

const DEFAULT_DP = 2;

function lookupDecimals(uomCode, uomsList) {
  if (!Array.isArray(uomsList) || uomsList.length === 0) return DEFAULT_DP;
  if (!uomCode) return DEFAULT_DP;
  const code = String(uomCode).trim().toLowerCase();
  const match = uomsList.find(u => String(u?.code || '').trim().toLowerCase() === code);
  if (!match) return DEFAULT_DP;
  const dp = parseInt(match.decimal_places, 10);
  if (Number.isNaN(dp)) return DEFAULT_DP;
  return Math.max(0, Math.min(6, dp));
}

export function getUomDecimalPlaces(uomCode, uomsList) {
  return lookupDecimals(uomCode, uomsList);
}

export function formatQty(qty, uomCode, uomsList) {
  const num = Number(qty);
  if (!Number.isFinite(num)) return '0';
  const dp = lookupDecimals(uomCode, uomsList);
  return num.toFixed(dp);
}

// Convenience: format and append the UOM code (e.g. "12.500 kg").
export function formatQtyWithUom(qty, uomCode, uomsList) {
  const formatted = formatQty(qty, uomCode, uomsList);
  return uomCode ? `${formatted} ${uomCode}` : formatted;
}
