// QuickAddPartyDialog
// =====================
// Reusable inline create/edit dialog for Suppliers and Customers, used inside
// PO and Quotation forms so the user doesn't have to navigate away to add a
// missing party. Mirrors the most-used fields from /suppliers and /customers
// pages — power users still go to those pages for advanced features (rating,
// salesperson assignments, bulk import). For 95% of "I need to add this
// vendor right now" moments, this is enough.
//
// Props:
//   open: boolean — dialog open state
//   onOpenChange: (bool) => void
//   kind: 'supplier' | 'customer'
//   editing: party object (or null for create mode)
//   onSaved: (savedParty) => void  ← parent uses this to auto-select the
//                                    new/updated record in its dropdown.

import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { X, Search, Loader2 } from 'lucide-react';

const blank = {
  code: '',
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  gstin: '',
  state_code: '',
  state: '',
  city: '',
  pin_code: '',
  address: '',
  address_line2: '',
  payment_terms: 'Net 30',
  status: 'active',
  // supplier-only
  lead_time_days: 7,
  rating: 3,
};

export function QuickAddPartyDialog({ open, onOpenChange, kind = 'supplier', editing, onSaved }) {
  const [form, setForm] = useState(blank);
  const [states, setStates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [gstinLookupLoading, setGstinLookupLoading] = useState(false);
  const [gstinLookupError, setGstinLookupError] = useState('');
  const isSupplier = kind === 'supplier';
  const partyLabel = isSupplier ? 'Supplier / Vendor' : 'Customer';
  const apiBase = isSupplier ? '/api/suppliers' : '/api/customers';

  useEffect(() => {
    if (!open) return;
    api.get('/api/settings/states').then(r => setStates(r.data || [])).catch(() => {});
    setGstinLookupError('');
    if (editing) {
      setForm({ ...blank, ...editing });
    } else {
      setForm(blank);
    }
  }, [open, editing]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Pull supplier/customer details from Appyflow GSTIN API. Same endpoint
  // used by the standalone Suppliers/Customers pages — saves typing.
  //
  // RESPONSE SHAPE (from /api/{suppliers,customers}/lookup-gstin):
  //   {legal_name, trade_name, state_code_from_gstin,
  //    principal_address: {building, street, locality, city, pin_code,
  //                        state_name, full}, sandbox_mode, status}
  // Earlier this method tried `data.state` / `data.city` / `data.pin_code`,
  // which never matched — fields stayed empty on the PO/Quotation party
  // dialogs while the standalone Customers/Suppliers pages worked fine.
  const lookupGstin = async () => {
    const g = (form.gstin || '').trim().toUpperCase();
    if (!g || g.length < 15) {
      setGstinLookupError('Enter a valid 15-character GSTIN');
      return;
    }
    setGstinLookupLoading(true);
    setGstinLookupError('');
    try {
      const endpoint = isSupplier ? '/api/suppliers/lookup-gstin' : '/api/customers/lookup-gstin';
      const { data } = await api.post(endpoint, { gstin: g });
      const addr = data?.principal_address || {};
      // Map state name → 2-letter code from our /api/settings/states list
      // when the GSTIN-derived code isn't present.
      let stCode = data?.state_code_from_gstin || '';
      if (!stCode && addr.state_name) {
        const m = states.find(s => (s.name || '').toLowerCase() === (addr.state_name || '').toLowerCase());
        if (m) stCode = m.code;
      }
      const composedAddr = [addr.building, addr.street, addr.locality].filter(Boolean).join(', ') || addr.full || '';
      setForm(f => ({
        ...f,
        name: f.name || data?.legal_name || data?.trade_name || f.name,
        state: f.state || addr.state_name || f.state,
        state_code: f.state_code || stCode || f.state_code,
        city: f.city || addr.city || f.city,
        pin_code: f.pin_code || (addr.pin_code ? String(addr.pin_code).replace(/\D/g, '').slice(0, 6) : '') || f.pin_code,
        address: f.address || composedAddr,
        gstin: g,
      }));
      if (data?.sandbox_mode) {
        toast.warning('Appyflow returned a SANDBOX/free-tier sample. Verify or upgrade plan for real data.');
      } else {
        toast.success('GSTIN details fetched');
      }
    } catch (e) {
      setGstinLookupError(e.response?.data?.detail || 'GSTIN lookup failed');
    } finally {
      setGstinLookupLoading(false);
    }
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.name?.trim()) { toast.error('Name is required'); return; }
    if (!form.state_code?.trim()) { toast.error('State code is required (for GST CGST/SGST/IGST logic)'); return; }
    const pin = (form.pin_code || '').trim();
    if (!pin || !/^\d{6}$/.test(pin)) { toast.error('PIN code must be a 6-digit number'); return; }
    setSaving(true);
    try {
      const payload = { ...form, gstin: (form.gstin || '').trim().toUpperCase() };
      let saved;
      if (editing?.id) {
        const { data } = await api.put(`${apiBase}/${editing.id}`, payload);
        saved = data;
        toast.success(`${partyLabel} updated`);
      } else {
        const { data } = await api.post(apiBase, payload);
        saved = data;
        toast.success(`${partyLabel} created`);
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid={`quick-${kind}-dialog`}>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${partyLabel}` : `Add ${partyLabel}`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          {/* GSTIN with lookup */}
          <div>
            <label className="block text-xs font-semibold mb-1">GSTIN</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => update('gstin', e.target.value.toUpperCase())}
                placeholder="27AAACX1234A1Z5"
                maxLength={15}
                className="form-input flex-1 mono uppercase"
                data-testid={`quick-${kind}-gstin`}
              />
              <button
                type="button"
                onClick={lookupGstin}
                disabled={gstinLookupLoading || !form.gstin}
                className="btn-secondary text-xs flex items-center gap-1 disabled:opacity-50"
                data-testid={`quick-${kind}-gstin-lookup`}
              >
                {gstinLookupLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                Fetch
              </button>
            </div>
            {gstinLookupError && <p className="text-xs text-[#9B1C1C] mt-1">{gstinLookupError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} required className="form-input w-full" data-testid={`quick-${kind}-name`} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Code</label>
              <input type="text" value={form.code} onChange={(e) => update('code', e.target.value)} placeholder="Auto-generated if blank" className="form-input w-full" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Contact Person</label>
              <input type="text" value={form.contact_person} onChange={(e) => update('contact_person', e.target.value)} className="form-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="form-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={(e) => update('phone', e.target.value)} className="form-input w-full" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Address Line 1</label>
            <input type="text" value={form.address} onChange={(e) => update('address', e.target.value)} className="form-input w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Address Line 2</label>
            <input type="text" value={form.address_line2} onChange={(e) => update('address_line2', e.target.value)} className="form-input w-full" />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">City</label>
              <input type="text" value={form.city} onChange={(e) => update('city', e.target.value)} className="form-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">State *</label>
              <Select
                value={form.state_code || ''}
                onValueChange={(v) => {
                  const s = states.find(st => st.code === v);
                  setForm(f => ({ ...f, state_code: v, state: s?.name || f.state }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {states.map(s => (
                    <SelectItem key={s.code} value={s.code}>{s.code} · {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">PIN Code *</label>
              <input type="text" value={form.pin_code} onChange={(e) => update('pin_code', e.target.value)} maxLength={6} placeholder="6-digit" className="form-input w-full mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Payment Terms</label>
              <input type="text" value={form.payment_terms} onChange={(e) => update('payment_terms', e.target.value)} className="form-input w-full" />
            </div>
          </div>

          {isSupplier && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Lead Time (days)</label>
                <input type="number" min={0} value={form.lead_time_days} onChange={(e) => update('lead_time_days', parseInt(e.target.value, 10) || 0)} className="form-input w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Rating (1-5)</label>
                <input type="number" min={1} max={5} value={form.rating} onChange={(e) => update('rating', Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 3)))} className="form-input w-full" />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
            <button type="button" onClick={() => onOpenChange(false)} className="btn-secondary" data-testid={`quick-${kind}-cancel`}>
              <X className="w-3 h-3 mr-1 inline" />Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50" data-testid={`quick-${kind}-save`}>
              {saving ? <Loader2 className="w-3 h-3 mr-1 inline animate-spin" /> : null}
              {editing ? 'Update' : 'Create'} {partyLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default QuickAddPartyDialog;
