import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  Truck, 
  Star,
  Edit2, 
  Trash2,
  Phone,
  Mail,
  MapPin,
  Filter,
  X,
  Search
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export default function SuppliersPage() {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  // Persisted grid/table view-mode toggle — same UX as Customers page.
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('suppliers_view_mode') || 'grid'; } catch { return 'grid'; }
  });
  useEffect(() => { try { localStorage.setItem('suppliers_view_mode', viewMode); } catch {} }, [viewMode]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    address_line2: '',
    city: '',
    state: '',
    pin_code: '',
    gstin: '',
    state_code: '',
    payment_terms: 'Net 30',
    lead_time_days: 7,
    rating: 3,
    status: 'active',
  });

  const [states, setStates] = useState([]);
  const getStateName = (code) => {
    const s = (states || []).find(x => x.code === code);
    return s?.name || code || '';
  };
  const canEdit = hasPermission('suppliers', 'create') || hasPermission('suppliers', 'edit') || user?.role === 'admin';
  const canDelete = hasPermission('suppliers', 'delete') || user?.role === 'admin';
  const [gstinLookupLoading, setGstinLookupLoading] = useState(false);
  const [gstinLookupError, setGstinLookupError] = useState('');

  useEffect(() => {
    fetchSuppliers();
    fetchStates();
  }, [statusFilter]);

  // Auto-open Add dialog when arriving via `?action=add` from PO. The same
  // querystring flow used by Customers↔Quotation is reused here so PO users
  // get the FULL supplier form (GSTIN fetch, rating, lead time) without
  // duplicating the dialog inside the PO page.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'add') {
      resetForm();
      setIsDialogOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const fetchStates = async () => {
    try {
      const { data } = await api.get('/api/settings/states');
      setStates(data);
    } catch (error) {
      console.error('Failed to fetch states:', error);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const { data } = await api.get(`/api/suppliers${params}`);
      setSuppliers(data);
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGstinLookup = async (raw) => {
    const gstin = (raw || '').trim().toUpperCase();
    if (!/^[0-9A-Z]{15}$/.test(gstin)) {
      setGstinLookupError('GSTIN must be 15 alphanumeric characters');
      return;
    }
    setGstinLookupLoading(true);
    setGstinLookupError('');
    try {
      const { data } = await api.post('/api/suppliers/lookup-gstin', { gstin });
      // Appyflow free-tier always returns the same demo record (DISHANT MAHAJAN).
      // Do NOT overwrite form fields in that case — warn the user instead.
      if (data.sandbox_mode) {
        alert(
          '⚠️ Appyflow FREE-TIER response detected.\n\n' +
          'Every free-tier lookup returns the same demo record ("DISHANT MAHAJAN / AppyFlow Technologies"), regardless of the GSTIN you entered.\n\n' +
          'To fetch real GSTIN details:\n' +
          '1. Top-up credits at https://dashboard.gstapi.appyflow.in/#/app/buy-credits (minimum ≈ ₹500 → 1,250 lookups at ₹0.40/call)\n' +
          '2. Retry — the existing key will immediately start returning live data.\n\n' +
          'Form fields were NOT auto-filled to prevent dummy data getting saved. The state code (' + gstin.substring(0, 2) + ') has been set from the GSTIN itself.'
        );
        // Still set the state_code from GSTIN (authoritative, derived locally, not from Appyflow)
        setFormData(prev => ({ ...prev, gstin, state_code: gstin.substring(0, 2) || prev.state_code }));
        return;
      }
      const stateCode = data.state_code_from_gstin || '';
      const addr = data.principal_address || {};
      const addrLine1 = [addr.building, addr.street].filter(Boolean).join(', ');
      const addrLine2 = [addr.locality].filter(Boolean).join(', ');
      // Prefer TRADE name as the Company Name. For proprietorship GSTINs,
      // `legal_name` (lgnm) is the proprietor's personal name while `trade_name`
      // (tradeNam) is the actual business/brand name — which is what belongs in
      // the supplier "Company Name" field. Fall back to legal_name only when
      // the trade name is absent (rare, usually private limited / LLP cases).
      const businessName = (data.trade_name || '').trim() || (data.legal_name || '').trim();
      setFormData(prev => ({
        ...prev,
        gstin,
        name: prev.name || businessName,
        state_code: stateCode || prev.state_code,
        state: addr.state_name || prev.state,
        city: addr.city || prev.city,
        pin_code: addr.pin_code || prev.pin_code,
        address: prev.address || addrLine1,
        address_line2: prev.address_line2 || addrLine2,
        // Keep the proprietor's name as the Contact Person if the form doesn't
        // already have one — saves another round of manual typing.
        contact_person: prev.contact_person || (data.legal_name && data.legal_name !== businessName ? data.legal_name : prev.contact_person),
      }));
      if (data.status !== 'active') {
        alert(`⚠️ This GSTIN status is "${data.status}". Please verify before adding as supplier.`);
      }
    } catch (e) {
      setGstinLookupError(e.response?.data?.detail || 'Lookup failed');
    } finally {
      setGstinLookupLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Mandatory GST identity fields
    if (!formData.state_code) {
      alert('State is required for GST compliance (CGST/SGST/IGST logic). Please select a state.');
      return;
    }
    if (!formData.pin_code || !/^\d{6}$/.test(formData.pin_code)) {
      alert('PIN Code is required and must be a valid 6-digit number.');
      return;
    }
    try {
      let savedId = editingSupplier?.id;
      if (editingSupplier) {
        await api.put(`/api/suppliers/${editingSupplier.id}`, formData);
      } else {
        const res = await api.post('/api/suppliers', formData);
        savedId = res.data?.id;
      }
      setIsDialogOpen(false);
      setEditingSupplier(null);
      resetForm();
      // Return to PO page with new supplier auto-selected when launched via
      // /suppliers?action=add&returnTo=po. Cancel path is handled in the
      // Dialog onOpenChange below.
      const params = new URLSearchParams(location.search);
      if (params.get('returnTo') === 'po' && savedId) {
        navigate(`/purchase-orders?newSupplierId=${savedId}`);
        return;
      }
      fetchSuppliers();
    } catch (error) {
      console.error('Failed to save supplier:', error);
      alert(error.response?.data?.detail || 'Failed to save supplier');
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      code: supplier.code,
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      address_line2: supplier.address_line2 || '',
      city: supplier.city || '',
      state: supplier.state || '',
      pin_code: supplier.pin_code || '',
      gstin: supplier.gstin || '',
      state_code: supplier.state_code || '',
      payment_terms: supplier.payment_terms || 'Net 30',
      lead_time_days: supplier.lead_time_days || 7,
      rating: supplier.rating || 3,
      status: supplier.status || 'active',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (supplier) => {
    if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return;
    try {
      await api.delete(`/api/suppliers/${supplier.id}`);
      fetchSuppliers();
    } catch (error) {
      console.error('Failed to delete supplier:', error);
      alert(error.response?.data?.detail || 'Failed to delete supplier');
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      address_line2: '',
      city: '',
      state: '',
      pin_code: '',
      gstin: '',
      state_code: '',
      payment_terms: 'Net 30',
      lead_time_days: 7,
      rating: 3,
      status: 'active',
    });
  };

  const renderStars = (rating) => {
    return Array(5).fill(0).map((_, i) => (
      <Star key={i} className={`w-4 h-4 ${i < rating ? 'text-[#E3A008] fill-[#E3A008]' : 'text-[#E5E7EB]'}`} />
    ));
  };

  return (
    <div className="space-y-4" data-testid="suppliers-page">
      <div className="flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30 bg-white py-2 border-b border-[#E5E7EB] -mx-6 px-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold font-[Chivo] text-[#111827]">Suppliers</h1>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
            <input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Search suppliers…" className="pl-8 pr-2 py-1.5 border border-[#D1D5DB] rounded-sm text-xs w-full focus:outline-none focus:border-[#1D3557]" data-testid="supplier-search-input" />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 h-8 text-xs" data-testid="supplier-status-filter">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {(statusFilter || supplierSearch) && (
            <button onClick={() => { setStatusFilter(''); setSupplierSearch(''); }} className="text-[10px] text-[#9B1C1C] hover:underline">Clear</button>
          )}
          {/* Grid / Table view toggle — view preference persists. */}
          <div className="inline-flex border border-[#D1D5DB] rounded-sm overflow-hidden text-xs" data-testid="supplier-view-toggle">
            <button type="button" onClick={() => setViewMode('grid')} className={`px-2 py-1 ${viewMode === 'grid' ? 'bg-[#1D3557] text-white' : 'bg-white text-[#374151] hover:bg-[#F3F4F6]'}`} data-testid="supplier-view-grid" title="Grid view">Grid</button>
            <button type="button" onClick={() => setViewMode('table')} className={`px-2 py-1 border-l border-[#D1D5DB] ${viewMode === 'table' ? 'bg-[#1D3557] text-white' : 'bg-white text-[#374151] hover:bg-[#F3F4F6]'}`} data-testid="supplier-view-table" title="Table view">Table</button>
          </div>
        </div>
        {canEdit && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingSupplier(null);
              resetForm();
              const params = new URLSearchParams(location.search);
              if (params.get('action') === 'add' && params.get('returnTo') === 'po') {
                navigate('/purchase-orders');
              }
            }
          }}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-supplier-btn">
                <Plus className="w-4 h-4" />
                <span>Add Supplier</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">
                      Supplier Code {editingSupplier ? '*' : <span className="text-[11px] font-normal text-[#6B7280]">(auto-generated if blank)</span>}
                    </label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="input-field mono"
                      placeholder={editingSupplier ? 'SUP-001' : 'Leave blank to auto-generate'}
                      disabled={!!editingSupplier}
                      data-testid="supplier-code-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Company Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input-field"
                      placeholder="Steel Masters Inc."
                      required
                      data-testid="supplier-name-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={formData.contact_person}
                      onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                      className="input-field"
                      placeholder="John Smith"
                      data-testid="supplier-contact-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="input-field"
                      placeholder="john@supplier.com"
                      data-testid="supplier-email-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Phone</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="input-field"
                      placeholder="+1-555-0100"
                      data-testid="supplier-phone-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Payment Terms</label>
                    <input
                      type="text"
                      value={formData.payment_terms}
                      onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                      className="input-field"
                      placeholder="e.g. Net 30, 50% advance + 50% before dispatch, COD"
                      list="supplier-payment-terms-suggestions"
                      data-testid="supplier-terms-input"
                    />
                    <datalist id="supplier-payment-terms-suggestions">
                      <option value="Net 15" />
                      <option value="Net 30" />
                      <option value="Net 45" />
                      <option value="Net 60" />
                      <option value="COD" />
                      <option value="Advance 100%" />
                      <option value="50% advance + 50% on dispatch" />
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Address Line 1</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="input-field"
                    placeholder="Plot/Building/Street"
                    data-testid="supplier-address-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Address Line 2</label>
                  <input
                    type="text"
                    value={formData.address_line2}
                    onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                    className="input-field"
                    placeholder="Area/Locality"
                    data-testid="supplier-address2-input"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">City</label>
                    <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="input-field" placeholder="City" data-testid="supplier-city-input" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">State</label>
                    <input type="text" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="input-field" placeholder="State" data-testid="supplier-state-name-input" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Pin Code *</label>
                    <input type="text" value={formData.pin_code} onChange={(e) => setFormData({ ...formData, pin_code: e.target.value.replace(/\D/g, '') })} className="input-field mono" maxLength={6} placeholder="411019" required data-testid="supplier-pincode-input" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1 flex items-center justify-between">
                      <span>GSTIN</span>
                      {gstinLookupLoading && <span className="text-[11px] text-[#1E429F] font-normal">Verifying…</span>}
                      {gstinLookupError && <span className="text-[11px] text-[#9B1C1C] font-normal">{gstinLookupError}</span>}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formData.gstin}
                        onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                        className="input-field mono uppercase flex-1"
                        maxLength={15}
                        placeholder="22AAAAA0000A1Z5"
                        data-testid="supplier-gstin-input"
                      />
                      <button
                        type="button"
                        onClick={() => handleGstinLookup(formData.gstin)}
                        disabled={gstinLookupLoading || !/^[0-9A-Z]{15}$/.test(formData.gstin || '')}
                        className="btn-secondary text-xs whitespace-nowrap"
                        title="Auto-fill details from GST portal via Appyflow"
                        data-testid="gstin-fetch-btn"
                      >
                        {gstinLookupLoading ? '…' : 'Fetch'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">State * <span className="text-[11px] text-[#6B7280] font-normal">(for GST CGST/SGST/IGST)</span></label>
                    <Select value={formData.state_code || undefined} onValueChange={(v) => setFormData({ ...formData, state_code: v })}>
                      <SelectTrigger data-testid="supplier-state-select">
                        <SelectValue placeholder="Select state (required)" />
                      </SelectTrigger>
                      <SelectContent>
                        {states.map((s) => (
                          <SelectItem key={s.code} value={s.code}>{s.code} - {s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Lead Time (days)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.lead_time_days}
                      onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 0 })}
                      className="input-field mono"
                      data-testid="supplier-leadtime-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Rating</label>
                    <Select value={String(formData.rating)} onValueChange={(v) => setFormData({ ...formData, rating: parseInt(v) })}>
                      <SelectTrigger data-testid="supplier-rating-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((r) => (
                          <SelectItem key={r} value={String(r)}>{r} Star{r > 1 ? 's' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Status</label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger data-testid="supplier-status-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                  <button type="button" onClick={() => setIsDialogOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" data-testid="supplier-save-btn">
                    {editingSupplier ? 'Update Supplier' : 'Add Supplier'}
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Suppliers Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="card-flat flex flex-col items-center justify-center h-48 text-[#4B5563]">
          <Truck className="w-12 h-12 mb-2 text-[#9CA3AF]" />
          <p>No suppliers found</p>
        </div>
      ) : viewMode === 'table' ? (
        (() => {
          const q = (supplierSearch || '').toLowerCase().trim();
          const list = !q ? suppliers : suppliers.filter(s =>
            s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q) || s.contact_person?.toLowerCase().includes(q) || s.gstin?.toLowerCase().includes(q)
          );
          return (
            <div className="card-flat overflow-x-auto" data-testid="suppliers-table-view">
              <table className="w-full text-xs">
                <thead className="bg-[#F3F4F6] text-[#374151]">
                  <tr>
                    <th className="text-left px-2 py-2">Code</th>
                    <th className="text-left px-2 py-2">Name</th>
                    <th className="text-left px-2 py-2">GSTIN</th>
                    <th className="text-left px-2 py-2">Contact</th>
                    <th className="text-left px-2 py-2">Phone</th>
                    <th className="text-left px-2 py-2">City / State</th>
                    <th className="text-center px-2 py-2">Rating</th>
                    <th className="text-center px-2 py-2">Status</th>
                    {canEdit && <th className="text-center px-2 py-2 w-20">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {list.map(s => (
                    <tr key={s.id} className="border-t border-[#E5E7EB] hover:bg-[#F9FAFB]" data-testid={`supplier-row-${s.code}`}>
                      <td className="px-2 py-1.5 mono">{s.code}</td>
                      <td className="px-2 py-1.5 font-medium">{s.name}</td>
                      <td className="px-2 py-1.5 mono">{s.gstin || '-'}</td>
                      <td className="px-2 py-1.5">{s.contact_person || '-'}</td>
                      <td className="px-2 py-1.5">{s.phone || '-'}</td>
                      <td className="px-2 py-1.5">{[s.city, s.state || getStateName(s.state_code)].filter(Boolean).join(', ') || '-'}</td>
                      <td className="px-2 py-1.5 text-center">{s.rating ? '★'.repeat(s.rating) : '-'}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${s.status === 'active' ? 'bg-[#DEF7EC] text-[#03543F]' : 'bg-[#F3F4F6] text-[#4B5563]'}`}>{s.status}</span>
                      </td>
                      {canEdit && (
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => handleEdit(s)} className="text-[#1D3557] hover:bg-[#F3F4F6] p-1 rounded" data-testid={`edit-supplier-${s.code}`}><Edit2 className="w-3.5 h-3.5" /></button>
                          {canDelete && <button onClick={() => handleDelete(s)} className="text-[#9B1C1C] hover:bg-[#FDE8E8] p-1 rounded ml-1" data-testid={`delete-supplier-${s.code}`}><Trash2 className="w-3.5 h-3.5" /></button>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.filter(s => {
            if (!supplierSearch.trim()) return true;
            const q = supplierSearch.toLowerCase();
            return s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q) || s.contact_person?.toLowerCase().includes(q);
          }).map((supplier) => (
            <div key={supplier.id} className="card-flat p-4" data-testid={`supplier-card-${supplier.code}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="mono text-xs text-[#4B5563]">{supplier.code}</span>
                  <h3 className="text-lg font-semibold text-[#111827]">{supplier.name}</h3>
                </div>
                <span className={`status-badge ${supplier.status === 'active' ? 'status-active' : 'status-obsolete'}`}>
                  {supplier.status}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                {supplier.gstin && (
                  <div className="px-2 py-1 bg-[#E1EFFE] rounded-sm">
                    <span className="text-xs text-[#4B5563]">GSTIN: </span>
                    <span className="mono text-sm font-medium text-[#1E429F]" data-testid={`supplier-gstin-${supplier.code}`}>{supplier.gstin}</span>
                  </div>
                )}
                {supplier.contact_person && (
                  <p className="text-sm text-[#4B5563]">{supplier.contact_person}</p>
                )}
                {supplier.email && (
                  <div className="flex items-center space-x-2 text-sm text-[#4B5563]">
                    <Mail className="w-4 h-4" />
                    <span>{supplier.email}</span>
                  </div>
                )}
                {supplier.phone && (
                  <div className="flex items-center space-x-2 text-sm text-[#4B5563]">
                    <Phone className="w-4 h-4" />
                    <span>{supplier.phone}</span>
                  </div>
                )}
                {(supplier.address || supplier.city) && (
                  <div className="flex items-start space-x-2 text-sm text-[#4B5563]">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="line-clamp-3">
                      {supplier.address && <span>{supplier.address}</span>}
                      {supplier.address_line2 && <span>, {supplier.address_line2}</span>}
                      {supplier.city && <><br />{supplier.city}</>}
                      {supplier.state && <>, {supplier.state}</>}
                      {supplier.pin_code && <> - {supplier.pin_code}</>}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#E5E7EB]">
                <div className="flex items-center space-x-1">
                  {renderStars(supplier.rating || 0)}
                </div>
                <div className="text-sm text-[#4B5563]">
                  <span className="mono">{supplier.lead_time_days}d</span> lead time
                </div>
              </div>

              {canEdit && (
                <div className="flex items-center justify-end space-x-2 mt-3 pt-3 border-t border-[#E5E7EB]">
                  <button
                    onClick={() => handleEdit(supplier)}
                    className="p-1 text-[#4B5563] hover:text-[#1D3557]"
                    data-testid={`edit-supplier-${supplier.code}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => handleDelete(supplier)}
                      className="p-1 text-[#4B5563] hover:text-[#9B1C1C]"
                      data-testid={`delete-supplier-${supplier.code}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
