import React, { useState, useEffect, useRef } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  Search, 
  Package, 
  Edit2, 
  Trash2,
  Filter,
  X,
  AlertTriangle,
  Download,
  Upload
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const categories = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'component', label: 'Component' },
  { value: 'sub_assembly', label: 'Sub-Assembly' },
  { value: 'finished_good', label: 'Finished Good' },
];

const units = ['pcs', 'kg', 'meter', 'sheet', 'kit', 'liter', 'set'];

export default function ItemsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    part_number: '',
    name: '',
    description: '',
    category: 'raw_material',
    unit_of_measure: 'pcs',
    unit_cost: 0,
    lead_time_days: 0,
    safety_stock: 0,
    current_stock: 0,
    reorder_point: 0,
    hsn_code: '',
    gst_rate: 18,
  });

  const canEdit = ['admin', 'production_manager', 'inventory_manager'].includes(user?.role);
  const canDelete = user?.role === 'admin';

  useEffect(() => {
    fetchItems();
  }, [search, categoryFilter]);

  const fetchItems = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryFilter) params.append('category', categoryFilter);
      
      const { data } = await api.get(`/api/items?${params.toString()}`);
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await api.put(`/api/items/${editingItem.id}`, formData);
      } else {
        await api.post('/api/items', formData);
      }
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
      fetchItems();
    } catch (error) {
      console.error('Failed to save item:', error);
      alert(error.response?.data?.detail || 'Failed to save item');
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      part_number: item.part_number,
      name: item.name,
      description: item.description || '',
      category: item.category,
      unit_of_measure: item.unit_of_measure,
      unit_cost: item.unit_cost,
      lead_time_days: item.lead_time_days,
      safety_stock: item.safety_stock,
      current_stock: item.current_stock,
      reorder_point: item.reorder_point,
      hsn_code: item.hsn_code || '',
      gst_rate: item.gst_rate != null ? item.gst_rate : 18,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete item "${item.name}"?`)) return;
    try {
      await api.delete(`/api/items/${item.id}`);
      fetchItems();
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert(error.response?.data?.detail || 'Failed to delete item');
    }
  };

  const resetForm = () => {
    setFormData({
      part_number: '',
      name: '',
      description: '',
      category: 'raw_material',
      unit_of_measure: 'pcs',
      unit_cost: 0,
      lead_time_days: 0,
      safety_stock: 0,
      current_stock: 0,
      reorder_point: 0,
      hsn_code: '',
      gst_rate: 18,
    });
  };

  const isLowStock = (item) => item.current_stock <= item.reorder_point;

  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    try {
      const response = await api.get('/api/items/export/excel', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'items_master.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert('Failed to export items');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/api/items/import/excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert(`Import complete!\nCreated: ${data.created}\nUpdated: ${data.updated}${data.errors?.length ? `\nErrors: ${data.errors.length}` : ''}`);
      fetchItems();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to import items');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6" data-testid="items-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Items & Parts</h1>
          <p className="text-sm text-[#4B5563]">Manage your inventory items and parts catalog</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={handleExport} className="btn-secondary flex items-center space-x-1 text-sm" data-testid="export-items-btn">
            <Download className="w-4 h-4" /><span>Export</span>
          </button>
          {canEdit && (
            <>
              <input type="file" ref={fileInputRef} accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn-secondary flex items-center space-x-1 text-sm" data-testid="import-items-btn">
                <Upload className="w-4 h-4" /><span>{importing ? 'Importing...' : 'Import'}</span>
              </button>
            </>
          )}
          {canEdit && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingItem(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-item-btn">
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">{editingItem ? 'Edit Item' : 'Add New Item'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Part Number *</label>
                    <input
                      type="text"
                      value={formData.part_number}
                      onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                      className="input-field mono"
                      placeholder="RM-001"
                      required
                      disabled={!!editingItem}
                      data-testid="item-part-number-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input-field"
                      placeholder="Steel Sheet 4mm"
                      required
                      data-testid="item-name-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="Item description..."
                    data-testid="item-description-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Category *</label>
                    <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                      <SelectTrigger data-testid="item-category-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Unit of Measure</label>
                    <Select value={formData.unit_of_measure} onValueChange={(v) => setFormData({ ...formData, unit_of_measure: v })}>
                      <SelectTrigger data-testid="item-uom-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Unit Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.unit_cost}
                      onChange={(e) => setFormData({ ...formData, unit_cost: parseFloat(e.target.value) || 0 })}
                      className="input-field mono"
                      data-testid="item-unit-cost-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Lead Time (days)</label>
                    <input
                      type="number"
                      value={formData.lead_time_days}
                      onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 0 })}
                      className="input-field mono"
                      data-testid="item-lead-time-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Safety Stock</label>
                    <input
                      type="number"
                      value={formData.safety_stock}
                      onChange={(e) => setFormData({ ...formData, safety_stock: parseInt(e.target.value) || 0 })}
                      className="input-field mono"
                      data-testid="item-safety-stock-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Current Stock</label>
                    <input
                      type="number"
                      value={formData.current_stock}
                      onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value) || 0 })}
                      className="input-field mono"
                      data-testid="item-current-stock-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Reorder Point</label>
                    <input
                      type="number"
                      value={formData.reorder_point}
                      onChange={(e) => setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 0 })}
                      className="input-field mono"
                      data-testid="item-reorder-point-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">HSN Code</label>
                    <input
                      type="text"
                      value={formData.hsn_code}
                      onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                      className="input-field mono"
                      placeholder="e.g. 7208"
                      data-testid="item-hsn-code-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">GST Rate (%)</label>
                    <Select value={String(formData.gst_rate)} onValueChange={(v) => setFormData({ ...formData, gst_rate: parseFloat(v) })}>
                      <SelectTrigger data-testid="item-gst-rate-select"><SelectValue placeholder="Select rate" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="12">12%</SelectItem>
                        <SelectItem value="18">18%</SelectItem>
                        <SelectItem value="28">28%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                  <button type="button" onClick={() => setIsDialogOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" data-testid="item-save-btn">
                    {editingItem ? 'Update Item' : 'Create Item'}
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {/* Filters */}
      <div className="card-flat p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-10"
                placeholder="Search by part number or name..."
                data-testid="items-search-input"
              />
            </div>
          </div>
          <div className="w-48">
            <Select value={categoryFilter || undefined} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
              <SelectTrigger data-testid="items-category-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {categoryFilter && (
            <button onClick={() => setCategoryFilter('')} className="btn-secondary flex items-center space-x-1">
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Items Table */}
      <div className="card-flat overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
            <Package className="w-12 h-12 mb-2 text-[#9CA3AF]" />
            <p>No items found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table" data-testid="items-table">
              <thead>
                <tr>
                  <th>Part Number</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>HSN</th>
                  <th className="text-right">GST%</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Unit Cost</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={isLowStock(item) ? 'bg-[#FDE8E8]/30' : ''} data-testid={`item-row-${item.part_number}`}>
                    <td className="mono font-medium">{item.part_number}</td>
                    <td>
                      <div className="flex items-center space-x-2">
                        {isLowStock(item) && <AlertTriangle className="w-4 h-4 text-[#9B1C1C]" />}
                        <span>{item.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${
                        item.category === 'raw_material' ? 'bg-[#E1EFFE] text-[#1E429F]' :
                        item.category === 'component' ? 'bg-[#DEF7EC] text-[#03543F]' :
                        item.category === 'sub_assembly' ? 'bg-[#FDF6B2] text-[#723B13]' :
                        'bg-[#F3F4F6] text-[#4B5563]'
                      }`}>
                        {item.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="mono text-sm">{item.hsn_code || '-'}</td>
                    <td className="text-right mono">{item.gst_rate != null ? `${item.gst_rate}%` : '-'}</td>
                    <td className="text-right mono">{item.current_stock} {item.unit_of_measure}</td>
                    <td className="text-right mono">${item.unit_cost.toFixed(2)}</td>
                    <td>
                      <div className="flex items-center space-x-2">
                        {canEdit && (
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-1 text-[#4B5563] hover:text-[#1D3557]"
                            data-testid={`edit-item-${item.part_number}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1 text-[#4B5563] hover:text-[#9B1C1C]"
                            data-testid={`delete-item-${item.part_number}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
