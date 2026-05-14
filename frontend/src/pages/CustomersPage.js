import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { Plus, Users, Edit2, Trash2, Phone, Mail, MapPin, Filter, X, Search, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export default function CustomersPage() {
  const { user, hasPermission } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [states, setStates] = useState([]);
  const [users, setUsers] = useState([]);  // All users, used to populate the Salesperson multi-select (admin only)
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  // GSTIN-lookup UI state
  const [gstinLookup, setGstinLookup] = useState({ loading: false, error: '', notice: '' });
  // Admins can switch between "all" customers and "only mine".
  // Non-admin users always see filtered view backend returns (own + assigned).
  const [scopeFilter, setScopeFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    code: '', name: '', gstin: '', state_code: '', contact_person: '',
    email: '', phone: '', address: '', address_line2: '', city: '', state: '', pin_code: '',
    payment_terms: 'Net 30', status: 'active', assigned_user_ids: [],
  });

  const isAdmin = user?.role === 'admin' || user?.is_admin_group;
  const canCreate = hasPermission('customers', 'create');
  const canEditAny = hasPermission('customers', 'edit') || canCreate;
  const canDelete = hasPermission('customers', 'delete') || isAdmin;

  useEffect(() => { fetchData(); }, [statusFilter, scopeFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      // Only admins can request the "mine" filter — backend ignores `mine` for non-admins
      // because they're already restricted to their own/assigned set.
      if (isAdmin && scopeFilter === 'mine') params.append('mine', 'true');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const reqs = [
        api.get(`/api/customers${qs}`),
        api.get('/api/settings/states'),
      ];
      // Only admins need the users list for salesperson assignment
      if (isAdmin) reqs.push(api.get('/api/users').catch(() => ({ data: [] })));
      const [customersRes, statesRes, usersRes] = await Promise.all(reqs);
      setCustomers(customersRes.data);
      setStates(statesRes.data);
      if (usersRes) setUsers(usersRes.data || []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    try {
      if (editingCustomer) {
        await api.put(`/api/customers/${editingCustomer.id}`, formData);
      } else {
        await api.post('/api/customers', formData);
      }
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save customer');
    }
  };

  const handleEdit = (c) => {
    setEditingCustomer(c);
    setFormData({ code: c.code, name: c.name, gstin: c.gstin || '', state_code: c.state_code || '', contact_person: c.contact_person || '', email: c.email || '', phone: c.phone || '', address: c.address || '', address_line2: c.address_line2 || '', city: c.city || '', state: c.state || '', pin_code: c.pin_code || '', payment_terms: c.payment_terms || 'Net 30', status: c.status, assigned_user_ids: c.assigned_user_ids || [] });
    setIsDialogOpen(true);
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete customer "${c.name}"?`)) return;
    try {
      await api.delete(`/api/customers/${c.id}`);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete customer');
    }
  };

  const resetForm = () => {
    setEditingCustomer(null);
    setFormData({ code: '', name: '', gstin: '', state_code: '', contact_person: '', email: '', phone: '', address: '', address_line2: '', city: '', state: '', pin_code: '', payment_terms: 'Net 30', status: 'active', assigned_user_ids: [] });
  };

  // Toggle a single salesperson user id in assigned_user_ids
  const toggleAssignedUser = (uid) => {
    setFormData(prev => {
      const list = prev.assigned_user_ids || [];
      const next = list.includes(uid) ? list.filter(x => x !== uid) : [...list, uid];
      return { ...prev, assigned_user_ids: next };
    });
  };

  const getStateName = (code) => {
    const state = states.find(s => s.code === code);
    return state ? state.name : code;
  };

  // GSTIN lookup — calls backend Appyflow proxy and pre-fills name + state +
  // PIN + address from the public GST registry. State_code is taken from the
  // FIRST 2 DIGITS of the GSTIN (authoritative for CGST/SGST/IGST routing).
  const fetchFromGstin = async () => {
    const gstin = (formData.gstin || '').trim().toUpperCase();
    if (gstin.length !== 15) {
      setGstinLookup({ loading: false, error: 'Enter a 15-character GSTIN first', notice: '' });
      return;
    }
    setGstinLookup({ loading: true, error: '', notice: '' });
    try {
      const r = await api.post('/api/customers/lookup-gstin', { gstin });
      const d = r.data || {};
      const addr = d.principal_address || {};
      // Map state name (e.g., "Maharashtra") to our state-code list when state code from GSTIN is unknown.
      let stCode = d.state_code_from_gstin || '';
      if (!stCode && addr.state_name) {
        const m = states.find(s => (s.name || '').toLowerCase() === (addr.state_name || '').toLowerCase());
        if (m) stCode = m.code;
      }
      setFormData(prev => ({
        ...prev,
        gstin,
        name: prev.name || d.trade_name || d.legal_name || '',
        state_code: stCode || prev.state_code,
        state: addr.state_name || prev.state,
        city: addr.city || prev.city,
        pin_code: (addr.pin_code || '').toString().replace(/\D/g, '').slice(0, 6) || prev.pin_code,
        address: prev.address || [addr.building, addr.street, addr.locality].filter(Boolean).join(', ') || addr.full || '',
        status: d.status === 'active' ? 'active' : prev.status,
      }));
      setGstinLookup({
        loading: false,
        error: '',
        notice: d.sandbox_mode
          ? 'Appyflow returned a SANDBOX/free-tier sample. Verify or upgrade plan for real data.'
          : (d.provider_message || ''),
      });
    } catch (e) {
      setGstinLookup({
        loading: false,
        error: e.response?.data?.detail || 'GSTIN lookup failed',
        notice: '',
      });
    }
  };

  return (
    <div className="space-y-4" data-testid="customers-page">
      <div className="flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30 bg-white py-2 border-b border-[#E5E7EB] -mx-6 px-6">
        <div>
          <h1 className="text-xl font-bold font-[Chivo] text-[#1D3557]">Customers</h1>
        </div>
        {canCreate && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-customer-btn">
                <Plus className="w-4 h-4" /><span>Add Customer</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="text-sm font-medium">Code *</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} disabled={!!editingCustomer} data-testid="customer-code-input" />
                </div>
                <div>
                  <label className="text-sm font-medium">Name *</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} data-testid="customer-name-input" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    GSTIN
                    <span className="text-[10px] text-[#6B7280] font-normal italic">— click Fetch to auto-fill name, state &amp; address</span>
                  </label>
                  <div className="mt-1 flex items-stretch gap-2">
                    <input
                      type="text"
                      className="flex-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono uppercase"
                      maxLength={15}
                      placeholder="22AAAAA0000A1Z5"
                      value={formData.gstin}
                      onChange={e => setFormData({...formData, gstin: e.target.value.toUpperCase()})}
                      data-testid="customer-gstin-input"
                    />
                    <button
                      type="button"
                      onClick={fetchFromGstin}
                      disabled={gstinLookup.loading || (formData.gstin || '').length !== 15}
                      className="btn-secondary flex items-center gap-1 px-3 disabled:opacity-50"
                      data-testid="customer-gstin-fetch-btn"
                    >
                      {gstinLookup.loading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Search className="w-4 h-4" />}
                      <span>{gstinLookup.loading ? 'Fetching…' : 'Fetch'}</span>
                    </button>
                  </div>
                  {gstinLookup.error && (
                    <div className="mt-1 text-[11px] text-[#9B1C1C]" data-testid="customer-gstin-error">{gstinLookup.error}</div>
                  )}
                  {gstinLookup.notice && !gstinLookup.error && (
                    <div className="mt-1 text-[11px] text-[#723B13] bg-[#FDF6B2] px-2 py-1 rounded-sm" data-testid="customer-gstin-notice">
                      {gstinLookup.notice}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">State</label>
                  <Select value={formData.state_code} onValueChange={v => setFormData({...formData, state_code: v})}>
                    <SelectTrigger data-testid="customer-state-select"><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>
                      {states.map(s => <SelectItem key={s.code} value={s.code}>{s.code} - {s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Contact Person</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} data-testid="customer-contact-input" />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <input type="email" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} data-testid="customer-email-input" />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} data-testid="customer-phone-input" />
                </div>
                <div>
                  <label className="text-sm font-medium">Payment Terms</label>
                  <Select value={formData.payment_terms} onValueChange={v => setFormData({...formData, payment_terms: v})}>
                    <SelectTrigger data-testid="customer-terms-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Net 30">Net 30</SelectItem>
                      <SelectItem value="Net 45">Net 45</SelectItem>
                      <SelectItem value="Net 60">Net 60</SelectItem>
                      <SelectItem value="Advance">Advance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Address Line 1</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" placeholder="Plot/Building/Street" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} data-testid="customer-address-input" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Address Line 2</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" placeholder="Area/Locality" value={formData.address_line2} onChange={e => setFormData({...formData, address_line2: e.target.value})} data-testid="customer-address2-input" />
                </div>
                <div>
                  <label className="text-sm font-medium">City</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} data-testid="customer-city-input" />
                </div>
                <div>
                  <label className="text-sm font-medium">State</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} data-testid="customer-state-name-input" />
                </div>
                <div>
                  <label className="text-sm font-medium">Pin Code</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono" maxLength={6} placeholder="411019" value={formData.pin_code} onChange={e => setFormData({...formData, pin_code: e.target.value.replace(/\D/g, '')})} data-testid="customer-pincode-input" />
                </div>
                {/* Admin-only: assign one or more salespeople to this customer.
                    Non-admin users will only see customers where they're listed here. */}
                {isAdmin && (
                  <div className="col-span-2 pt-3 mt-2 border-t border-[#E5E7EB]">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-[#111827]">
                        Assigned Salespersons
                        <span className="text-[11px] font-normal text-[#6B7280] ml-1">
                          — users who can see this customer (beyond those who created it)
                        </span>
                      </label>
                      <span className="text-[11px] text-[#1D3557] font-mono">
                        {(formData.assigned_user_ids || []).length} selected
                      </span>
                    </div>
                    <div className="border border-[#E5E7EB] rounded-sm max-h-40 overflow-y-auto bg-[#F9FAFB]">
                      {users.length === 0 ? (
                        <div className="p-3 text-xs text-[#9CA3AF] italic text-center">No users available.</div>
                      ) : (
                        users.map(u => {
                          const checked = (formData.assigned_user_ids || []).includes(u.id);
                          return (
                            <label key={u.id} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-[#F3F4F6] cursor-pointer border-b border-[#F3F4F6] last:border-0" data-testid={`customer-salesperson-row-${u.email}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAssignedUser(u.id)}
                                data-testid={`customer-salesperson-checkbox-${u.email}`}
                              />
                              <span className="font-medium text-[#111827] flex-1 truncate">{u.name || u.email}</span>
                              <span className="text-[10px] text-[#6B7280] hidden sm:inline truncate">{u.email}</span>
                              <span className="text-[10px] text-[#1D3557] uppercase tracking-wide shrink-0">{u.role}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-2 mt-4">
                <button className="btn-secondary" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</button>
                <button className="btn-primary" onClick={handleSubmit} data-testid="save-customer-btn">{editingCustomer ? 'Update' : 'Create'} Customer</button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-48" data-testid="customer-status-filter"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="w-48" data-testid="customer-scope-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contacts</SelectItem>
              <SelectItem value="mine">Own Contacts</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>
        ) : customers.length === 0 ? (
          <div className="col-span-3 flex flex-col items-center justify-center h-48 text-[#4B5563]">
            <Users className="w-12 h-12 mb-2 text-[#9CA3AF]" />
            <p>No customers found</p>
          </div>
        ) : customers.map(c => (
          <div key={c.id} className="card-flat p-4 hover:shadow-md transition-shadow" data-testid={`customer-card-${c.code}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-[#1D3557]">{c.name}</h3>
                <p className="mono text-sm text-[#4B5563]">{c.code}</p>
              </div>
              <span className={`status-badge ${c.status === 'active' ? 'bg-[#DEF7EC] text-[#03543F]' : 'bg-[#F3F4F6] text-[#4B5563]'}`}>{c.status}</span>
            </div>
            {c.gstin && (
              <div className="mb-2 px-2 py-1 bg-[#E1EFFE] rounded-sm">
                <span className="text-xs text-[#4B5563]">GSTIN: </span>
                <span className="mono text-sm font-medium text-[#1E429F]">{c.gstin}</span>
              </div>
            )}
            {c.state_code && (
              <div className="mb-2 flex items-center text-sm text-[#4B5563]">
                <MapPin className="w-3 h-3 mr-1" />{c.city ? `${c.city}, ` : ''}{c.state || getStateName(c.state_code)}{c.pin_code ? ` - ${c.pin_code}` : ''}
              </div>
            )}
            <div className="space-y-1 text-sm text-[#4B5563]">
              {c.contact_person && <div className="flex items-center"><Users className="w-3 h-3 mr-2" />{c.contact_person}</div>}
              {c.phone && <div className="flex items-center"><Phone className="w-3 h-3 mr-2" />{c.phone}</div>}
              {c.email && <div className="flex items-center"><Mail className="w-3 h-3 mr-2" />{c.email}</div>}
            </div>
            {isAdmin && (c.assigned_user_ids || []).length > 0 && (
              <div className="mt-2 flex items-start gap-1 text-[11px]" data-testid={`customer-salespersons-${c.code}`}>
                <span className="text-[#6B7280] uppercase tracking-wide shrink-0">Salespersons:</span>
                <div className="flex flex-wrap gap-1">
                  {(c.assigned_user_ids || []).map(uid => {
                    const u = users.find(x => x.id === uid);
                    return (
                      <span key={uid} className="inline-flex items-center px-1.5 py-0.5 bg-[#E1EFFE] text-[#1E429F] rounded-sm text-[10px] font-medium">
                        {u ? (u.name || u.email) : uid.slice(0, 6)}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {canEditAny && (
              <div className="flex space-x-2 mt-3 pt-3 border-t border-[#E5E7EB]">
                <button onClick={() => handleEdit(c)} className="text-[#1D3557] hover:bg-[#F3F4F6] p-1 rounded" data-testid={`edit-customer-${c.code}`}><Edit2 className="w-4 h-4" /></button>
                {canDelete && <button onClick={() => handleDelete(c)} className="text-[#9B1C1C] hover:bg-[#FDE8E8] p-1 rounded" data-testid={`delete-customer-${c.code}`}><Trash2 className="w-4 h-4" /></button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
