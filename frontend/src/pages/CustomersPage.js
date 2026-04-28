import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { Plus, Users, Edit2, Trash2, Phone, Mail, MapPin, Filter, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export default function CustomersPage() {
  const { user, hasPermission } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  // Admins can switch between "all" customers and "only mine".
  // Non-admin users always see filtered view backend returns (own + assigned).
  const [scopeFilter, setScopeFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    code: '', name: '', gstin: '', state_code: '', contact_person: '',
    email: '', phone: '', address: '', address_line2: '', city: '', state: '', pin_code: '',
    payment_terms: 'Net 30', status: 'active',
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
      const [customersRes, statesRes] = await Promise.all([
        api.get(`/api/customers${qs}`),
        api.get('/api/settings/states'),
      ]);
      setCustomers(customersRes.data);
      setStates(statesRes.data);
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
    setFormData({ code: c.code, name: c.name, gstin: c.gstin || '', state_code: c.state_code || '', contact_person: c.contact_person || '', email: c.email || '', phone: c.phone || '', address: c.address || '', address_line2: c.address_line2 || '', city: c.city || '', state: c.state || '', pin_code: c.pin_code || '', payment_terms: c.payment_terms || 'Net 30', status: c.status });
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
    setFormData({ code: '', name: '', gstin: '', state_code: '', contact_person: '', email: '', phone: '', address: '', address_line2: '', city: '', state: '', pin_code: '', payment_terms: 'Net 30', status: 'active' });
  };

  const getStateName = (code) => {
    const state = states.find(s => s.code === code);
    return state ? state.name : code;
  };

  return (
    <div className="space-y-6" data-testid="customers-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#1D3557]">Customers</h1>
          <p className="text-sm text-[#4B5563]">Manage customers with GST details</p>
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
                <div>
                  <label className="text-sm font-medium">GSTIN</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono uppercase" maxLength={15} placeholder="22AAAAA0000A1Z5" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value.toUpperCase()})} data-testid="customer-gstin-input" />
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
