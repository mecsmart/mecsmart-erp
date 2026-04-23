import React, { useState, useEffect } from 'react';
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
  const [suppliers, setSuppliers] = useState([]);
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
  // Permission-driven visibility: admin always allowed, else granular permissions.
  const canEdit = user?.role === 'admin'
    || hasPermission('suppliers', 'create')
    || hasPermission('suppliers', 'edit');

  useEffect(() => {
    fetchSuppliers();
    fetchStates();
  }, [statusFilter]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await api.put(`/api/suppliers/${editingSupplier.id}`, formData);
      } else {
        await api.post('/api/suppliers', formData);
      }
      setIsDialogOpen(false);
      setEditingSupplier(null);
      resetForm();
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
    <div className="space-y-6" data-testid="suppliers-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Suppliers</h1>
          <p className="text-sm text-[#4B5563]">Manage your supplier database</p>
        </div>
        {canEdit && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingSupplier(null);
              resetForm();
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
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier Code *</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="input-field mono"
                      placeholder="SUP-001"
                      required
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
                    <Select value={formData.payment_terms} onValueChange={(v) => setFormData({ ...formData, payment_terms: v })}>
                      <SelectTrigger data-testid="supplier-terms-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Net 15">Net 15</SelectItem>
                        <SelectItem value="Net 30">Net 30</SelectItem>
                        <SelectItem value="Net 45">Net 45</SelectItem>
                        <SelectItem value="Net 60">Net 60</SelectItem>
                        <SelectItem value="COD">COD</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Pin Code</label>
                    <input type="text" value={formData.pin_code} onChange={(e) => setFormData({ ...formData, pin_code: e.target.value.replace(/\D/g, '') })} className="input-field mono" maxLength={6} placeholder="411019" data-testid="supplier-pincode-input" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">GSTIN</label>
                    <input
                      type="text"
                      value={formData.gstin}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                      className="input-field mono uppercase"
                      maxLength={15}
                      placeholder="22AAAAA0000A1Z5"
                      data-testid="supplier-gstin-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">State</label>
                    <Select value={formData.state_code || undefined} onValueChange={(v) => setFormData({ ...formData, state_code: v })}>
                      <SelectTrigger data-testid="supplier-state-select">
                        <SelectValue placeholder="Select state" />
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

      {/* Filter */}
      <div className="card-flat p-4">
        <div className="flex items-center gap-4">
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-48" data-testid="supplier-status-filter">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {statusFilter && (
            <button onClick={() => setStatusFilter('')} className="btn-secondary flex items-center space-x-1">
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
          )}
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Search suppliers..." className="input-field pl-9 text-sm" data-testid="supplier-search-input" />
        </div>
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
