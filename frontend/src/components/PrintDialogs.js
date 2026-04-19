import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { Printer, Eye, Settings2, FileText, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const TEMPLATES = [
  { id: 'standard', name: 'Standard', desc: 'Clean layout with item table and totals' },
  { id: 'detailed', name: 'Detailed GST', desc: 'Full GST breakup per line with discount' },
  { id: 'compact', name: 'Compact', desc: 'Minimal columns: Item, Qty, Rate, Amount' },
  { id: 'modern', name: 'Modern', desc: 'Contemporary design with color accents' },
];

const PAPER_SIZES = [
  { id: 'a4', name: 'A4', w: '210mm', h: '297mm' },
  { id: 'letter', name: 'Letter', w: '8.5in', h: '11in' },
  { id: 'a5', name: 'A5', w: '148mm', h: '210mm' },
];

const CURRENCY_SYMBOLS = { INR: '\u20B9', USD: '$' };

function formatFullAddress(obj) {
  if (!obj) return '';
  const parts = [obj.address, obj.address_line2].filter(Boolean);
  const cityLine = [obj.city, obj.state].filter(Boolean).join(', ');
  if (obj.pin_code) {
    parts.push(cityLine ? `${cityLine} - ${obj.pin_code}` : obj.pin_code);
  } else if (cityLine) {
    parts.push(cityLine);
  }
  return parts.join(', ');
}

function getCurrencySymbol(company) {
  return CURRENCY_SYMBOLS[company?.primary_currency] || CURRENCY_SYMBOLS.INR;
}

const defaultOpts = {
  template: 'standard',
  paperSize: 'a4',
  showLetterhead: true,
  showLogo: true,
  showGSTBreakup: true,
  showDiscount: true,
  showHSN: true,
  showAdditionalCharges: true,
  showTerms: true,
  showSignatures: true,
  showQtyWords: false,
  termsText: '',
};

export function POPrintDialog({ po, open, onClose }) {
  const [opts, setOpts] = useState({ ...defaultOpts });
  const [printData, setPrintData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && po) {
      setLoading(true);
      api.get(`/api/purchase-orders/${po.id}/print-data`)
        .then(res => setPrintData(res.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, po]);

  const toggle = (key) => setOpts({ ...opts, [key]: !opts[key] });

  const numberToWords = (num, currencyName) => {
    if (num === 0) return 'Zero';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const scales = ['','Thousand','Lakh','Crore'];
    const groups = [];
    let n = Math.floor(num);
    groups.push(n % 1000); n = Math.floor(n / 1000);
    while (n > 0) { groups.push(n % 100); n = Math.floor(n / 100); }
    const convertGroup = (g, isFirst) => {
      if (g === 0) return '';
      if (g < 20) return ones[g];
      if (g < 100) return tens[Math.floor(g / 10)] + (g % 10 ? ' ' + ones[g % 10] : '');
      return ones[Math.floor(g / 100)] + ' Hundred' + (g % 100 ? ' and ' + convertGroup(g % 100, false) : '');
    };
    const parts = groups.map((g, i) => g ? convertGroup(g, i === 0) + (scales[i] ? ' ' + scales[i] : '') : '').filter(Boolean).reverse();
    const mainUnit = currencyName === 'USD' ? 'Dollars' : 'Rupees';
    const subUnit = currencyName === 'USD' ? 'Cents' : 'Paise';
    const main = parts.join(' ');
    const decimal = Math.round((num - Math.floor(num)) * 100);
    return main + ' ' + mainUnit + (decimal > 0 ? ' and ' + convertGroup(decimal) + ' ' + subUnit : '') + ' Only';
  };

  const buildHTML = () => {
    if (!printData) return '';
    const d = printData;
    const company = d.company || {};
    const supplier = d.supplier || {};
    const lines = d.lines || [];
    const charges = d.additional_charges || [];
    
    // Compute GST totals from line items if not already set
    if (!d.total_cgst && !d.total_sgst && !d.total_igst) {
      let totalTax = 0;
      lines.forEach(l => {
        const gross = (l.quantity||0) * (l.unit_price||0);
        const disc = l.discount_amount || (l.discount_type === 'percentage' ? gross * (l.discount_value||0)/100 : (l.discount_value||0));
        const net = gross - disc;
        totalTax += net * (l.gst_rate||0)/100;
      });
      if (d.is_inter_state) {
        d.total_igst = totalTax;
      } else {
        d.total_cgst = totalTax / 2;
        d.total_sgst = totalTax / 2;
      }
      d.total_tax = totalTax;
      if (!d.subtotal) d.subtotal = lines.reduce((s, l) => s + ((l.quantity||0) * (l.unit_price||0)), 0);
      if (!d.total_amount || d.total_amount === d.subtotal) d.total_amount = (d.subtotal||0) + totalTax;
    }
    const paper = PAPER_SIZES.find(p => p.id === opts.paperSize) || PAPER_SIZES[0];
    const isModern = opts.template === 'modern';
    const accent = '#1D3557';
    const accentLight = '#E8EDF3';

    const baseStyles = `
      @page { size: ${paper.w} ${paper.h}; margin: 12mm; }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Segoe UI',Arial,sans-serif; font-size:10.5px; color:#222; line-height:1.5; }
      .page { max-width:${paper.w}; margin:0 auto; padding:${isModern ? '0' : '15px'}; }
      ${isModern ? `.page { border:2px solid ${accent}; }` : ''}
      .letterhead { text-align:center; padding:15px 20px; ${isModern ? `background:${accent}; color:white;` : `border-bottom:2px solid ${accent};`} margin-bottom:15px; }
      .letterhead .logo-row { display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:4px; }
      .letterhead .logo-row img { max-height:48px; max-width:120px; object-fit:contain; }
      .letterhead h1 { font-size:18px; font-weight:700; ${isModern ? 'color:white;' : `color:${accent};`} letter-spacing:0.5px; margin:0; }
      .letterhead .tagline { font-size:9px; ${isModern ? 'color:#ccd6e0;' : 'color:#888;'} font-style:italic; margin-top:1px; letter-spacing:0.3px; }
      .letterhead .sub { font-size:9.5px; ${isModern ? 'color:#ccd6e0;' : 'color:#666;'} margin-top:2px; }
      .doc-title { font-size:14px; font-weight:700; color:${accent}; text-transform:uppercase; padding:8px 15px; ${isModern ? `background:${accentLight};` : `border-bottom:1px solid ${accent};`} margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; }
      .doc-title .rev { font-size:10px; color:#666; font-weight:normal; }
      .info-section { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:0 15px; margin-bottom:14px; }
      .info-block { ${isModern ? `border-left:3px solid ${accent}; padding-left:10px;` : 'border:1px solid #ddd; padding:8px 10px; border-radius:2px;'} }
      .info-block .label { font-size:8.5px; color:#888; text-transform:uppercase; letter-spacing:0.5px; font-weight:600; }
      .info-block .value { font-size:11px; font-weight:600; color:#111; margin-top:1px; }
      .info-block .detail { font-size:9.5px; color:#555; }
      table { width:calc(100% - 30px); margin:0 15px 12px; border-collapse:collapse; }
      th { background:${isModern ? accent : '#2C3E50'}; color:white; padding:6px 8px; font-size:9px; text-transform:uppercase; letter-spacing:0.3px; text-align:left; }
      td { padding:6px 8px; border-bottom:1px solid #e0e0e0; font-size:10.5px; vertical-align:top; }
      tbody tr:nth-child(even) { background:#f8f9fa; }
      ${isModern ? 'tbody tr:hover { background:#eef1f5; }' : ''}
      .text-right { text-align:right; } .text-center { text-align:center; }
      .mono { font-family:'Courier New',monospace; font-size:10px; }
      .total-row { background:${accentLight} !important; font-weight:700; }
      .grand-total { font-size:12px; color:${accent}; }
      .section-title { font-size:11px; font-weight:700; color:${accent}; text-transform:uppercase; padding:4px 15px; margin:8px 0; ${isModern ? `border-left:3px solid ${accent};` : ''} }
      .totals-box { width:280px; margin-left:auto; margin-right:15px; margin-bottom:15px; }
      .totals-box table { width:100%; margin:0; }
      .totals-box td { padding:4px 8px; border:none; font-size:10.5px; }
      .totals-box .label-cell { color:#555; text-align:right; }
      .totals-box .val-cell { text-align:right; font-weight:600; font-family:'Courier New',monospace; }
      .totals-box .grand { border-top:2px solid ${accent}; }
      .terms { padding:8px 15px; font-size:9.5px; color:#444; border-top:1px dashed #ccc; margin-top:10px; }
      .terms strong { color:#222; }
      .amount-words { padding:4px 15px; font-size:9.5px; color:#333; font-style:italic; margin-bottom:8px; }
      .signatures { display:grid; grid-template-columns:1fr 1fr 1fr; gap:30px; padding:30px 15px 15px; margin-top:20px; }
      .sign-block { text-align:center; }
      .sign-line { border-top:1px solid #333; padding-top:5px; font-size:9px; color:#555; font-weight:600; }
      .footer-note { text-align:center; font-size:8px; color:#aaa; padding:8px 0; ${isModern ? `border-top:2px solid ${accent};` : 'border-top:1px solid #eee;'} margin-top:10px; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    `;

    // Build letterhead
    let letterhead = '';
    const companyAddr = formatFullAddress(company);
    const sym = getCurrencySymbol(company);
    if (opts.showLetterhead) {
      const logoHTML = (opts.showLogo && company.logo_data) ? `<img src="${company.logo_data}" alt="Logo" />` : '';
      letterhead = `<div class="letterhead">
        <div class="logo-row">${logoHTML}<h1>${company.company_name || 'Company Name'}</h1></div>
        ${company.tagline ? `<div class="tagline">${company.tagline}</div>` : ''}
        <div class="sub">${[companyAddr, company.phone ? `Ph: ${company.phone}` : '', company.email].filter(Boolean).join(' | ')}</div>
        ${company.gstin ? `<div class="sub">GSTIN: ${company.gstin}${company.pan ? ` | PAN: ${company.pan}` : ''}</div>` : ''}
      </div>`;
    } else {
      // Even without letterhead, we need the currency symbol
    }

    // Info blocks
    const supplierAddr = formatFullAddress(supplier);
    let infoHTML = `<div class="info-section">
      <div class="info-block"><div class="label">Supplier</div><div class="value">${supplier.name || ''}</div><div class="detail">${supplier.code || ''}${supplier.gstin ? ` | GSTIN: ${supplier.gstin}` : ''}</div>${supplierAddr ? `<div class="detail">${supplierAddr}</div>` : ''}</div>
      <div class="info-block"><div class="label">PO Date / Expected</div><div class="value">${d.created_at ? new Date(d.created_at).toLocaleDateString() : '-'}</div><div class="detail">Expected: ${d.expected_date ? new Date(d.expected_date).toLocaleDateString() : '-'}</div></div>
      ${d.quotation_ref ? `<div class="info-block"><div class="label">Vendor Quotation</div><div class="value mono">${d.quotation_ref}</div>${d.quotation_date ? `<div class="detail">Dated: ${new Date(d.quotation_date).toLocaleDateString()}</div>` : ''}</div>` : ''}
      ${d.delivery_address ? `<div class="info-block"><div class="label">Delivery Address</div><div class="detail">${d.delivery_address}</div></div>` : ''}
    </div>`;

    // Item table
    let tableHTML = '';
    if (opts.template === 'compact') {
      tableHTML = `<table><thead><tr><th style="width:30px">SN</th><th>Item</th><th class="text-right">Qty</th><th>UOM</th><th class="text-right">Rate</th><th class="text-right">Amount</th></tr></thead><tbody>`;
      lines.forEach((l, i) => {
        const net = l.line_amount || (l.quantity * l.unit_price);
        tableHTML += `<tr><td>${i+1}</td><td><span class="mono">${l.item?.part_number || ''}</span> ${l.item?.name || ''}</td><td class="text-right mono">${l.quantity}</td><td>${l.uom || 'pcs'}</td><td class="text-right mono">${(l.unit_price||0).toFixed(2)}</td><td class="text-right mono">${net.toFixed(2)}</td></tr>`;
      });
      tableHTML += `</tbody></table>`;
    } else if (opts.template === 'detailed') {
      const cols = ['SN','Item Code','Description'];
      if (opts.showHSN) cols.push('HSN');
      cols.push('Qty','UOM','Rate');
      if (opts.showDiscount) cols.push('Discount');
      cols.push('Net Amt');
      if (opts.showGSTBreakup) cols.push('GST%','GST Amt');
      cols.push('Total');
      tableHTML = `<table><thead><tr>${cols.map((c,i) => `<th${i >= cols.length - 4 ? ' class="text-right"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>`;
      lines.forEach((l, i) => {
        const gross = (l.quantity||0) * (l.unit_price||0);
        const disc = l.discount_amount || (l.discount_type === 'percentage' ? gross * (l.discount_value||0)/100 : (l.discount_value||0));
        const net = gross - disc;
        const tax = l.tax_amount || (net * (l.gst_rate||0)/100);
        let row = `<td>${i+1}</td><td class="mono">${l.item?.part_number||''}</td><td>${l.item?.name||''}</td>`;
        if (opts.showHSN) row += `<td class="mono">${l.hsn_code||''}</td>`;
        row += `<td class="text-right mono">${l.quantity}</td><td>${l.uom||'pcs'}</td><td class="text-right mono">${(l.unit_price||0).toFixed(2)}</td>`;
        if (opts.showDiscount) row += `<td class="text-right mono">${disc > 0 ? disc.toFixed(2) : '-'}</td>`;
        row += `<td class="text-right mono">${net.toFixed(2)}</td>`;
        if (opts.showGSTBreakup) row += `<td class="text-right">${l.gst_rate||0}%</td><td class="text-right mono">${tax.toFixed(2)}</td>`;
        row += `<td class="text-right mono">${(net+tax).toFixed(2)}</td>`;
        tableHTML += `<tr>${row}</tr>`;
      });
      tableHTML += `</tbody></table>`;
    } else {
      // standard / modern
      const cols = ['SN','Item Code','Description'];
      if (opts.showHSN) cols.push('HSN');
      cols.push('Qty','UOM','Rate');
      if (opts.showDiscount) cols.push('Disc');
      cols.push('Amount');
      tableHTML = `<table><thead><tr>${cols.map((c,i) => `<th${i >= cols.length - 2 ? ' class="text-right"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>`;
      lines.forEach((l, i) => {
        const gross = (l.quantity||0) * (l.unit_price||0);
        const disc = l.discount_amount || (l.discount_type === 'percentage' ? gross * (l.discount_value||0)/100 : (l.discount_value||0));
        const net = gross - disc;
        let row = `<td>${i+1}</td><td class="mono">${l.item?.part_number||''}</td><td>${l.item?.name||''}</td>`;
        if (opts.showHSN) row += `<td class="mono">${l.hsn_code||''}</td>`;
        row += `<td class="text-right mono">${l.quantity}</td><td>${l.uom||'pcs'}</td><td class="text-right mono">${(l.unit_price||0).toFixed(2)}</td>`;
        if (opts.showDiscount) row += `<td class="text-right mono">${disc > 0 ? disc.toFixed(2) : '-'}</td>`;
        row += `<td class="text-right mono">${net.toFixed(2)}</td>`;
        tableHTML += `<tr>${row}</tr>`;
      });
      tableHTML += `</tbody></table>`;
    }

    // Charges
    let chargesHTML = '';
    if (opts.showAdditionalCharges && charges.length > 0) {
      chargesHTML = `<div class="section-title">Additional Charges</div>
        <table><thead><tr><th>Charge</th><th>HSN</th><th class="text-right">Amount</th>${opts.showGSTBreakup ? '<th class="text-right">GST%</th><th class="text-right">GST Amt</th>' : ''}</tr></thead><tbody>`;
      charges.forEach(c => {
        chargesHTML += `<tr><td>${c.name||''}</td><td class="mono">${c.hsn_code||''}</td><td class="text-right mono">${(c.amount||0).toFixed(2)}</td>${opts.showGSTBreakup ? `<td class="text-right">${c.gst_rate||0}%</td><td class="text-right mono">${(c.tax_amount||0).toFixed(2)}</td>` : ''}</tr>`;
      });
      chargesHTML += `</tbody></table>`;
    }

    // Totals
    let totalsHTML = `<div class="totals-box"><table>
      <tr><td class="label-cell">Subtotal</td><td class="val-cell">${sym}${(d.subtotal||0).toFixed(2)}</td></tr>`;
    if ((d.charges_subtotal||0) > 0) totalsHTML += `<tr><td class="label-cell">Charges</td><td class="val-cell">${sym}${(d.charges_subtotal||0).toFixed(2)}</td></tr>`;
    if (opts.showGSTBreakup) {
      if (d.is_inter_state) {
        totalsHTML += `<tr><td class="label-cell">IGST</td><td class="val-cell">${sym}${(d.total_igst||0).toFixed(2)}</td></tr>`;
      } else {
        totalsHTML += `<tr><td class="label-cell">CGST</td><td class="val-cell">${sym}${(d.total_cgst||0).toFixed(2)}</td></tr>`;
        totalsHTML += `<tr><td class="label-cell">SGST</td><td class="val-cell">${sym}${(d.total_sgst||0).toFixed(2)}</td></tr>`;
      }
    } else {
      totalsHTML += `<tr><td class="label-cell">Tax</td><td class="val-cell">${sym}${(d.total_tax||0).toFixed(2)}</td></tr>`;
    }
    totalsHTML += `<tr class="grand"><td class="label-cell grand-total">Grand Total</td><td class="val-cell grand-total">${sym}${(d.total_amount||0).toFixed(2)}</td></tr></table></div>`;

    // Amount in words
    let wordsHTML = '';
    if (opts.showQtyWords) {
      wordsHTML = `<div class="amount-words"><strong>Amount in words:</strong> ${numberToWords(d.total_amount || 0, company?.primary_currency)}</div>`;
    }

    // Terms
    let termsHTML = '';
    if (opts.showTerms && opts.termsText) {
      termsHTML = `<div class="terms"><strong>Terms & Conditions:</strong><br/>${opts.termsText.replace(/\n/g, '<br/>')}</div>`;
    }

    // Signatures
    let sigHTML = '';
    if (opts.showSignatures) {
      sigHTML = `<div class="signatures">
        <div class="sign-block"><div class="sign-line">Prepared By</div></div>
        <div class="sign-block"><div class="sign-line">Authorized Signatory</div></div>
        <div class="sign-block"><div class="sign-line">Supplier Acceptance</div></div>
      </div>`;
    }

    return `<!DOCTYPE html><html><head><title>PO ${d.po_number}</title><style>${baseStyles}</style></head><body>
      <div class="page">
        ${letterhead}
        <div class="doc-title">
          <span>Purchase Order: ${d.po_number}</span>
          ${d.revision > 0 ? `<span class="rev">Revision ${d.revision}</span>` : ''}
        </div>
        ${infoHTML}
        <div class="section-title">Order Items</div>
        ${tableHTML}
        ${chargesHTML}
        ${totalsHTML}
        ${wordsHTML}
        ${termsHTML}
        ${sigHTML}
        <div class="footer-note">This is a computer-generated document. Printed on ${new Date().toLocaleString()}</div>
      </div>
    </body></html>`;
  };

  const handlePrint = () => {
    const html = buildHTML();
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const handlePreview = () => {
    const html = buildHTML();
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-[Chivo] flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#1D3557]" />
            Print Purchase Order {po?.po_number}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
          </div>
        ) : (
          <div className="space-y-5 mt-3" data-testid="po-print-dialog">
            {/* Template Selection */}
            <div>
              <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2 block">Print Format</label>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setOpts({ ...opts, template: t.id })}
                    className={`text-left p-3 rounded-sm border-2 transition-all ${opts.template === t.id ? 'border-[#1D3557] bg-[#F0F4F8]' : 'border-[#E5E7EB] hover:border-[#9CA3AF]'}`}
                    data-testid={`template-${t.id}`}>
                    <span className="text-sm font-semibold block">{t.name}</span>
                    <span className="text-xs text-[#6B7280]">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Paper & Layout */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-1 block">Paper Size</label>
                <Select value={opts.paperSize} onValueChange={(v) => setOpts({ ...opts, paperSize: v })}>
                  <SelectTrigger data-testid="paper-size-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAPER_SIZES.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Toggle Options */}
            <div>
              <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2 block flex items-center gap-1">
                <Settings2 className="w-3 h-3" /> Display Options
              </label>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  ['showLetterhead', 'Company Letterhead'],
                  ['showGSTBreakup', 'GST Breakup (CGST/SGST/IGST)'],
                  ['showDiscount', 'Discount Column'],
                  ['showHSN', 'HSN Code Column'],
                  ['showAdditionalCharges', 'Additional Charges Section'],
                  ['showQtyWords', 'Amount in Words (Indian)'],
                  ['showSignatures', 'Signature Blocks'],
                  ['showTerms', 'Terms & Conditions'],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none" data-testid={`opt-${key}`}>
                    <input type="checkbox" checked={opts[key]} onChange={() => toggle(key)} className="rounded-sm w-4 h-4 accent-[#1D3557]" />
                    <span className="text-[#374151]">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Terms & Conditions */}
            {opts.showTerms && (
              <div>
                <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-1 block">Terms & Conditions</label>
                <textarea value={opts.termsText} onChange={(e) => setOpts({ ...opts, termsText: e.target.value })} className="input-field text-xs" rows={3} placeholder="1. Delivery within 7 working days&#10;2. Payment: 30 days net&#10;3. Quality as per approved sample" data-testid="terms-input" />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-[#E5E7EB]">
              <button onClick={onClose} className="btn-secondary flex items-center gap-1">
                <X className="w-4 h-4" /> Close
              </button>
              <div className="flex items-center gap-2">
                <button onClick={handlePreview} className="btn-secondary flex items-center gap-1" data-testid="po-preview-btn">
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button onClick={handlePrint} className="btn-primary flex items-center gap-1" data-testid="po-print-btn">
                  <Printer className="w-4 h-4" /> Print
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// GRN Print Dialog - same style
export function GRNPrintDialog({ grn, open, onClose }) {
  const [opts, setOpts] = useState({
    template: 'standard',
    paperSize: 'a4',
    showLetterhead: true,
    showGSTBreakup: false,
    showMismatch: true,
    showSignatures: true,
    showNotes: true,
  });
  const [printData, setPrintData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && grn) {
      setLoading(true);
      api.get(`/api/grn/${grn.id}/print-data`)
        .then(res => setPrintData(res.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, grn]);

  const toggle = (key) => setOpts({ ...opts, [key]: !opts[key] });

  const buildGRNHTML = () => {
    if (!printData) return '';
    const d = printData;
    const company = d.company || {};
    const supplier = d.supplier || {};
    const lines = d.lines || [];
    const wh = d.warehouse || {};
    const paper = PAPER_SIZES.find(p => p.id === opts.paperSize) || PAPER_SIZES[0];
    const accent = '#1D3557';
    const accentLight = '#E8EDF3';

    const styles = `
      @page { size: ${paper.w} ${paper.h}; margin: 12mm; }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Segoe UI',Arial,sans-serif; font-size:10.5px; color:#222; line-height:1.5; }
      .page { max-width:${paper.w}; margin:0 auto; padding:15px; }
      .letterhead { text-align:center; padding:15px 20px; border-bottom:2px solid ${accent}; margin-bottom:15px; }
      .letterhead .logo-row { display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:4px; }
      .letterhead .logo-row img { max-height:48px; max-width:120px; object-fit:contain; }
      .letterhead h1 { font-size:18px; font-weight:700; color:${accent}; margin:0; }
      .letterhead .tagline { font-size:9px; color:#888; font-style:italic; margin-top:1px; }
      .letterhead .sub { font-size:9.5px; color:#666; margin-top:2px; }
      .doc-title { font-size:14px; font-weight:700; color:#03543F; text-transform:uppercase; padding:8px 15px; background:#DEF7EC; margin-bottom:12px; }
      .info-section { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:0 15px; margin-bottom:14px; }
      .info-block { border:1px solid #ddd; padding:8px 10px; border-radius:2px; }
      .info-block .label { font-size:8.5px; color:#888; text-transform:uppercase; letter-spacing:0.5px; font-weight:600; }
      .info-block .value { font-size:11px; font-weight:600; color:#111; margin-top:1px; }
      .info-block .detail { font-size:9.5px; color:#555; }
      table { width:calc(100% - 30px); margin:0 15px 12px; border-collapse:collapse; }
      th { background:#2C3E50; color:white; padding:6px 8px; font-size:9px; text-transform:uppercase; text-align:left; }
      td { padding:6px 8px; border-bottom:1px solid #e0e0e0; font-size:10.5px; }
      tbody tr:nth-child(even) { background:#f8f9fa; }
      .text-right { text-align:right; } .text-center { text-align:center; }
      .mono { font-family:'Courier New',monospace; font-size:10px; }
      .mismatch { color:#B45309; font-weight:600; }
      .ok { color:#03543F; font-weight:600; }
      .total-row { background:${accentLight} !important; font-weight:700; }
      .signatures { display:grid; grid-template-columns:1fr 1fr 1fr; gap:30px; padding:30px 15px 15px; margin-top:20px; }
      .sign-block { text-align:center; } .sign-line { border-top:1px solid #333; padding-top:5px; font-size:9px; color:#555; font-weight:600; }
      .footer-note { text-align:center; font-size:8px; color:#aaa; padding:8px 0; border-top:1px solid #eee; margin-top:10px; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    `;

    let letterhead = '';
    if (opts.showLetterhead) {
      const companyAddr = formatFullAddress(company);
      const logoHTML = company.logo_data ? `<img src="${company.logo_data}" alt="Logo" />` : '';
      letterhead = `<div class="letterhead"><div class="logo-row">${logoHTML}<h1>${company.company_name || ''}</h1></div>
        ${company.tagline ? `<div class="tagline">${company.tagline}</div>` : ''}
        <div class="sub">${[companyAddr, company.phone ? `Ph: ${company.phone}` : '', company.email].filter(Boolean).join(' | ')}</div>
        ${company.gstin ? `<div class="sub">GSTIN: ${company.gstin}</div>` : ''}</div>`;
    }

    const isJW = !!d.is_jw;
    const jwOrder = d.jw_order || {};
    const dc = d.dc || {};

    let tableHTML = '';
    if (opts.template === 'detailed' || opts.showMismatch) {
      // For JW GRNs, "PO" columns become "Sent" columns (from DC/JW). For PO GRNs, stays as PO.
      const qtyColLabel = isJW ? 'Sent Qty' : 'PO Qty';
      const priceColLabel = isJW ? 'Rate/Unit' : 'PO Price';
      tableHTML = `<table><thead><tr><th>SN</th><th>Item Code</th><th>Description</th><th>HSN</th><th class="text-right">${qtyColLabel}</th><th class="text-right">Recd Qty</th><th>UOM</th><th class="text-right">${priceColLabel}</th><th class="text-right">Verified</th><th class="text-center">Status</th></tr></thead><tbody>`;
      lines.forEach((l, i) => {
        const sentQty = isJW ? (l.jw_sent_quantity || 0) : (l.po_quantity || 0);
        const refPrice = isJW ? (l.jw_rate || 0) : (l.po_price || 0);
        const verifiedPrice = isJW ? (l.verified_price || l.jw_rate || 0) : (l.verified_price || 0);
        const qM = l.received_quantity === sentQty;
        const pM = verifiedPrice === refPrice;
        tableHTML += `<tr><td>${i+1}</td><td class="mono">${l.item?.part_number||''}</td><td>${l.item?.name||''}</td><td class="mono">${l.hsn_code||''}</td><td class="text-right mono">${sentQty}</td><td class="text-right mono ${!qM?'mismatch':''}">${l.received_quantity}</td><td>${l.uom||'pcs'}</td><td class="text-right mono">${refPrice.toFixed(2)}</td><td class="text-right mono ${!pM?'mismatch':''}">${verifiedPrice.toFixed(2)}</td><td class="text-center">${qM&&pM?'<span class="ok">OK</span>':'<span class="mismatch">Mismatch</span>'}</td></tr>`;
      });
      tableHTML += `</tbody></table>`;
    } else {
      tableHTML = `<table><thead><tr><th>SN</th><th>Item Code</th><th>Description</th><th class="text-right">Recd Qty</th><th>UOM</th><th class="text-right">Price</th><th class="text-right">Amount</th></tr></thead><tbody>`;
      let total = 0;
      lines.forEach((l, i) => {
        const price = isJW ? (l.jw_rate || l.verified_price || 0) : (l.verified_price || 0);
        const amt = l.received_quantity * price;
        total += amt;
        tableHTML += `<tr><td>${i+1}</td><td class="mono">${l.item?.part_number||''}</td><td>${l.item?.name||''}</td><td class="text-right mono">${l.received_quantity}</td><td>${l.uom||'pcs'}</td><td class="text-right mono">${price.toFixed(2)}</td><td class="text-right mono">${amt.toFixed(2)}</td></tr>`;
      });
      tableHTML += `<tr class="total-row"><td colspan="6" class="text-right">Total</td><td class="text-right mono">${total.toFixed(2)}</td></tr></tbody></table>`;
    }

    // Reference box — right side. Shows JW + DC numbers for JW GRNs, or PO for PO GRNs.
    const refBoxHtml = isJW
      ? `<div class="info-block"><div class="label">Job Work Reference</div>
          <div class="value mono">JW: ${jwOrder.order_number || '-'}</div>
          ${dc.dc_number ? `<div class="detail mono">DC: ${dc.dc_number}${dc.dc_date ? ` · Sent: ${new Date(dc.dc_date).toLocaleDateString()}` : ''}</div>` : ''}
          ${jwOrder.subcontract_type ? `<div class="detail">Type: ${jwOrder.subcontract_type === 'with_material' ? 'With Material' : 'Processing only'}</div>` : ''}</div>`
      : `<div class="info-block"><div class="label">PO Reference</div><div class="value mono">${d.po_number||'-'}</div></div>`;

    return `<!DOCTYPE html><html><head><title>GRN ${d.grn_number}</title><style>${styles}</style></head><body>
      <div class="page">${letterhead}
        <div class="doc-title">Goods Receipt Note: ${d.grn_number}${isJW ? ' (Job Work Receipt)' : ''}</div>
        <div class="info-section">
          <div class="info-block"><div class="label">Supplier</div><div class="value">${supplier.name||''}</div><div class="detail">${supplier.code||''}${supplier.gstin ? ` | GSTIN: ${supplier.gstin}` : ''}</div>${(supplier.address || supplier.city) ? `<div class="detail">${formatFullAddress(supplier)}</div>` : ''}</div>
          ${refBoxHtml}
          <div class="info-block"><div class="label">Supplier Invoice / Doc Ref</div><div class="value mono">${d.supplier_invoice_no||'-'}</div>${d.supplier_invoice_date ? `<div class="detail">Dated: ${new Date(d.supplier_invoice_date).toLocaleDateString()}</div>` : ''}</div>
          <div class="info-block"><div class="label">Receiving Warehouse</div><div class="value">${wh.name||''} ${wh.code ? `(${wh.code})` : ''}</div>${wh.address ? `<div class="detail">${wh.address}</div>` : ''}</div>
        </div>
        ${tableHTML}
        ${opts.showNotes && d.notes ? `<div style="padding:8px 15px;font-size:9.5px;"><strong>Notes:</strong> ${d.notes}</div>` : ''}
        ${opts.showSignatures ? `<div class="signatures"><div class="sign-block"><div class="sign-line">Received By (Stores)</div></div><div class="sign-block"><div class="sign-line">Inspected By (QC)</div></div><div class="sign-block"><div class="sign-line">Approved By</div></div></div>` : ''}
        <div class="footer-note">This is a computer-generated document. Printed on ${new Date().toLocaleString()}</div>
      </div></body></html>`;
  };

  const handlePrint = () => { const w = window.open('','_blank','width=900,height=700'); w.document.write(buildGRNHTML()); w.document.close(); w.focus(); w.print(); };
  const handlePreview = () => { const w = window.open('','_blank','width=900,height=700'); w.document.write(buildGRNHTML()); w.document.close(); };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-[Chivo] flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#03543F]" />
            Print GRN {grn?.grn_number}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>
        ) : (
          <div className="space-y-5 mt-3" data-testid="grn-print-dialog">
            <div>
              <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-2 block">Format</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ id:'standard', name:'Standard', desc:'Simple receipt with amounts' },{ id:'detailed', name:'Detailed Verification', desc:'PO vs Received comparison' }].map(t => (
                  <button key={t.id} onClick={() => setOpts({...opts, template: t.id})}
                    className={`text-left p-3 rounded-sm border-2 transition-all ${opts.template===t.id ? 'border-[#03543F] bg-[#DEF7EC]' : 'border-[#E5E7EB] hover:border-[#9CA3AF]'}`}
                    data-testid={`grn-template-${t.id}`}>
                    <span className="text-sm font-semibold block">{t.name}</span>
                    <span className="text-xs text-[#6B7280]">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {[['showLetterhead','Company Letterhead'],['showMismatch','Highlight Mismatches'],['showSignatures','Signature Blocks'],['showNotes','Notes']].map(([key,label]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={opts[key]} onChange={() => toggle(key)} className="rounded-sm w-4 h-4 accent-[#1D3557]" />
                  <span className="text-[#374151]">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-[#E5E7EB]">
              <button onClick={onClose} className="btn-secondary flex items-center gap-1"><X className="w-4 h-4" /> Close</button>
              <div className="flex items-center gap-2">
                <button onClick={handlePreview} className="btn-secondary flex items-center gap-1" data-testid="grn-preview-btn"><Eye className="w-4 h-4" /> Preview</button>
                <button onClick={handlePrint} className="btn-primary flex items-center gap-1" data-testid="grn-print-btn"><Printer className="w-4 h-4" /> Print</button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
