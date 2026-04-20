// Shared letterhead helpers — used by every print template (PO, GRN, DC, Job Card, BOM, etc.)
// Layout per user spec:
//   LEFT (≈35% width) : Logo + "Company tagline" caption
//   RIGHT (≈65% width): Company Name (bold) + multi-line address + Phone + Email/Web + GSTIN

export function letterheadCSS(accentColor = '#1D3557') {
  return `
    .lh-wrap { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; border-bottom:2px solid ${accentColor}; padding-bottom:14px; margin-bottom:16px; }
    .lh-left { flex:0 0 34%; display:flex; flex-direction:column; align-items:flex-start; }
    .lh-left img { max-height:78px; max-width:210px; object-fit:contain; }
    .lh-left .lh-tagline { font-size:10px; color:#6b7280; font-style:italic; margin-top:6px; letter-spacing:0.3px; }
    .lh-right { flex:1 1 auto; text-align:left; font-size:11px; color:#111827; line-height:1.55; }
    .lh-right .lh-name { font-size:17px; font-weight:700; color:${accentColor}; margin-bottom:6px; line-height:1.2; }
    .lh-right .lh-addr { color:#374151; white-space:pre-line; }
    .lh-right .lh-contact { margin-top:4px; color:#374151; }
    .lh-right .lh-gst { margin-top:6px; font-weight:600; color:#111827; }
    .lh-docmeta { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:14px; }
    .lh-docmeta .lh-doc-title { font-size:16px; font-weight:700; color:${accentColor}; text-transform:uppercase; letter-spacing:0.5px; }
    .lh-docmeta .lh-doc-no { font-family:'Courier New',monospace; font-size:12px; color:#374151; }
    .lh-docmeta .lh-doc-date { font-size:11px; color:#6b7280; margin-top:2px; }
  `;
}

function escapeHTML(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Build the 2-column letterhead block. Safe with partial company settings.
export function buildLetterheadHTML(company = {}) {
  const logoSrc = company.logo_data || '';
  const name = escapeHTML(company.company_name || 'Manufacturing Company Private Limited');
  const tagline = escapeHTML(company.tagline || 'Company tagline');

  // Address — build multi-line block. Format:
  //   <address line 1>
  //   <address line 2 optional>
  //   <city> - <pin>. (<state/country>)
  const l1 = escapeHTML(company.address || '');
  const l2 = escapeHTML(company.address_line2 || '');
  const city = escapeHTML(company.city || '');
  const state = escapeHTML(company.state || '');
  const pin = escapeHTML(company.pin_code || '');
  const country = escapeHTML(company.country || 'India');

  const addrLines = [];
  if (l1) addrLines.push(l1);
  if (l2) addrLines.push(l2);
  const cityLine = [city, pin && `- ${pin}`].filter(Boolean).join(' ');
  const stateLine = state ? `(${state}${country ? `, ${country}` : ''})` : (country ? `(${country})` : '');
  const cityState = [cityLine, stateLine].filter(Boolean).join('. ');
  if (cityState) addrLines.push(cityState);

  const phone = escapeHTML(company.phone || '');
  const email = escapeHTML(company.email || '');
  const website = escapeHTML(company.website || '');
  const gstin = escapeHTML(company.gstin || '');
  const pan = escapeHTML(company.pan || '');

  const contactBits = [];
  if (phone) contactBits.push(`Phone: ${phone}`);
  if (email) contactBits.push(`Email: <a href="mailto:${email}" style="color:#1D4ED8;text-decoration:underline;">${email}</a>`);
  if (website) contactBits.push(`Web: ${website}`);

  const leftLogo = logoSrc
    ? `<img src="${logoSrc}" alt="Logo" />`
    : `<div style="width:180px;height:72px;display:flex;align-items:center;justify-content:center;border:1px dashed #D1D5DB;color:#9CA3AF;font-size:11px;">[ Company Logo ]</div>`;

  return `
    <div class="lh-wrap">
      <div class="lh-left">
        ${leftLogo}
        <div class="lh-tagline">${tagline}</div>
      </div>
      <div class="lh-right">
        <div class="lh-name">${name}</div>
        ${addrLines.length ? `<div class="lh-addr">${addrLines.join('<br/>')}</div>` : ''}
        ${contactBits.length ? `<div class="lh-contact">${contactBits.join('<br/>')}</div>` : ''}
        ${gstin ? `<div class="lh-gst">GSTIN: ${gstin}${pan ? ` &nbsp;|&nbsp; PAN: ${pan}` : ''}</div>` : ''}
      </div>
    </div>
  `;
}

// Optional doc-meta strip (title + number + date) rendered below the letterhead.
export function buildDocMetaHTML({ title = '', number = '', date = '' } = {}) {
  const d = date ? new Date(date) : null;
  const dateStr = d && !isNaN(d) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  return `
    <div class="lh-docmeta">
      <div class="lh-doc-title">${escapeHTML(title)}</div>
      <div style="text-align:right;">
        ${number ? `<div class="lh-doc-no">${escapeHTML(number)}</div>` : ''}
        ${dateStr ? `<div class="lh-doc-date">${dateStr}</div>` : ''}
      </div>
    </div>
  `;
}
