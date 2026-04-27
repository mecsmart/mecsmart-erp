import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import useResizableColumns from '../hooks/useResizableColumns';
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
  Upload,
  ChevronDown
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import ConfirmDialog from '../components/ConfirmDialog';

const categories = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'component', label: 'Component' },
  { value: 'sub_assembly', label: 'Sub-Assembly' },
  { value: 'finished_good', label: 'Finished Good' },
];

const FALLBACK_UNITS = ['pcs', 'kg', 'meter', 'sheet', 'kit', 'liter', 'set'];

export default function ItemsPage() {
  const { user, hasPermission } = useAuth();
  const { formatCurrency, currencySymbol } = useCompanySettings();
  // Sort state for the Part Number column. Click cycles ascending → descending.
  const [partNumberSort, setPartNumberSort] = useState(null); // null | 'asc' | 'desc'
  const tableRef = useRef(null);
  const togglePartNumberSort = () => {
    setPartNumberSort(s => (s === 'asc' ? 'desc' : 'asc'));
  };
  const [items, setItems] = useState([]);
  const [itemGroups, setItemGroups] = useState([]);
  const [units, setUnits] = useState(FALLBACK_UNITS);
  const [taxSlabs, setTaxSlabs] = useState([0, 5, 12, 18, 28]);
  const [loading, setLoading] = useState(true);
  
  // Hook for resizable columns - must be after items/loading state declarations
  useResizableColumns(tableRef, [items.length, loading]);
  
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, item: null });
  const [formData, setFormData] = useState({
    part_number: '',
    name: '',
    description: '',
    category: 'raw_material',
    group_id: '',
    unit_of_measure: 'pcs',
    unit_cost: 0,
    purchase_price: 0,
    sale_price: 0,
    lead_time_days: 0,
    safety_stock: 0,
    current_stock: 0,
    reorder_point: 0,
    hsn_code: '',
    gst_rate: 18,
  });

  const canEdit = user?.role === 'admin'
    || hasPermission('items', 'create')
    || hasPermission('items', 'edit')
    || hasPermission('inventory', 'create')
    || hasPermission('inventory', 'edit');
  const canDelete = user?.role === 'admin' || hasPermission('items', 'delete');

  // Debounce search input so fast typing doesn't fire /api/items on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Render pagination — avoid laying out thousands of rows at once.
  const PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [items, debouncedSearch, categoryFilter, groupFilter]);

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, categoryFilter, groupFilter]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/item-groups');
        setItemGroups(data || []);
      } catch (e) {
        console.warn('Failed to fetch item groups:', e);
      }
      try {
        const { data } = await api.get('/api/settings/uoms');
        if (Array.isArray(data) && data.length) {
          setUnits(data.map(u => u.code));
        }
      } catch (e) {
        console.warn('Failed to fetch UOM master, using fallback:', e);
      }
      try {
        const { data } = await api.get('/api/settings/gst-slabs');
        if (Array.isArray(data) && data.length) {
          setTaxSlabs(data.map(r => Number(r)).sort((a, b) => a - b));
        }
      } catch (e) {
        console.warn('Failed to fetch GST slabs, using fallback:', e);
      }
    })();
  }, []);

  // Deep-link: open create dialog (?action=new) or edit dialog (?action=edit&id=...)
  // Used by InventoryPage to delegate item create/edit here without forking the form.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    const id = params.get('id');
    if (action === 'new' && canEdit) {
      resetForm();
      setEditingItem(null);
      setIsDialogOpen(true);
      navigate('/items', { replace: true });
    } else if (action === 'edit' && id && canEdit && items.length > 0) {
      const target = items.find(it => it.id === id);
      if (target) {
        handleEdit(target);
        navigate('/items', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, items.length]);

  const fetchItems = async () => {
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (categoryFilter) params.append('category', categoryFilter);
      if (groupFilter) params.append('group_id', groupFilter);
      
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
      group_id: item.group_id || '',
      unit_of_measure: item.unit_of_measure,
      unit_cost: item.unit_cost,
      purchase_price: item.purchase_price || 0,
      sale_price: item.sale_price || 0,
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
    try {
      await api.delete(`/api/items/${item.id}`);
      fetchItems();
      setDeleteConfirm({ open: false, item: null });
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
      group_id: '',
      unit_of_measure: 'pcs',
      unit_cost: 0,
      purchase_price: 0,
      sale_price: 0,
      lead_time_days: 0,
      safety_stock: 0,
      current_stock: 0,
      reorder_point: 0,
      hsn_code: '',
      gst_rate: 18,
    });
  };

  // Groups matching current category, including "(any)" groups
  const filteredGroupsForForm = itemGroups.filter(g => !g.parent_category || g.parent_category === formData.category);
  const selectedGroup = itemGroups.find(g => g.id === formData.group_id);
  const groupLocksHsn = !!(selectedGroup && (selectedGroup.default_hsn_code || selectedGroup.default_gst_rate != null));

  const isLowStock = (item) => item.current_stock <= item.reorder_point;

  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const EXPORT_CATEGORIES = [
    { value: 'all', label: 'All Items', filename: 'items_master.xlsx' },
    { value: 'raw_material', label: 'Raw Materials (RM)', filename: 'items_raw_materials.xlsx' },
    { value: 'component', label: 'Parts / Components', filename: 'items_parts.xlsx' },
    { value: 'sub_assembly', label: 'Sub-Assemblies', filename: 'items_sub_assemblies.xlsx' },
    { value: 'finished_good', label: 'Finished Goods (FG)', filename: 'items_finished_goods.xlsx' },
  ];

  const handleExport = async (category = 'all') => {
    setExportMenuOpen(false);
    const catMeta = EXPORT_CATEGORIES.find(c => c.value === category) || EXPORT_CATEGORIES[0];
    const apiUrl = api.defaults.baseURL || process.env.REACT_APP_BACKEND_URL || '';
    const qs = category && category !== 'all' ? `?category=${category}` : '';
    const directUrl = `${apiUrl}/api/items/export/excel${qs}`;

    // STRATEGY: open the API URL directly in a new top-level window.
    // This delegates the entire download to the browser:
    //  - Cookies (JWT) flow automatically because it's same-origin per CORS
    //  - `Content-Disposition: attachment` header is honored natively
    //  - No blob URL / iframe sandbox / popup-blocker issues
    // We use window.top (not window.open) to escape the Emergent preview iframe.
    const toastId = toast.loading(`Opening ${catMeta.label} export…`);
    try {
      const topWin = window.top || window;
      const popup = topWin.open(directUrl, '_blank', 'noopener,noreferrer');
      if (!popup) {
        // Popup blocker hit — fall back to hidden iframe trick (keeps user on current page)
        console.warn('[Export] popup blocked, falling back to hidden iframe');
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = directUrl;
        document.body.appendChild(iframe);
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* noop */ } }, 10000);
        toast.success(`${catMeta.label} download triggered — check your browser's downloads`, { id: toastId, duration: 4000 });
        return;
      }
      toast.success(`${catMeta.label} export started — check your browser downloads`, { id: toastId, duration: 4000 });
    } catch (err) {
      console.error('[Export] direct open failed, falling back to blob download', err);
      // Fallback to blob download (original path) — keeps compatibility
      setExporting(true);
      try {
        const response = await api.get(`/api/items/export/excel${qs}`, { responseType: 'blob' });
        if (!response.data || response.data.size === 0) {
          toast.error('Export returned an empty file', { id: toastId });
          return;
        }
        const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = catMeta.filename;
        document.body.appendChild(link);
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        setTimeout(() => { try { document.body.removeChild(link); } catch { /* noop */ } }, 100);
        setTimeout(() => { try { window.URL.revokeObjectURL(url); } catch { /* noop */ } }, 5000);
        toast.success(`${catMeta.label} exported (${(blob.size / 1024).toFixed(1)} KB)`, { id: toastId });
      } catch (blobErr) {
        const msg = blobErr?.response?.data?.detail || blobErr?.message || 'Network/server error';
        toast.error(`Export failed: ${msg}`, { id: toastId });
        console.error('Export error:', blobErr);
      } finally {
        setExporting(false);
      }
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const toastId = toast.loading(`Importing ${file.name}…`);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/api/items/import/excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const created = data.created || 0, updated = data.updated || 0, errCount = data.errors?.length || 0;
      if (errCount > 0) {
        toast.warning(`Import partial: ${created} created, ${updated} updated, ${errCount} errors (see console)`, { id: toastId, duration: 8000 });
        console.warn('Import errors:', data.errors);
      } else {
        toast.success(`Import complete: ${created} created, ${updated} updated`, { id: toastId });
      }
      fetchItems();
    } catch (error) {
      const msg = error?.response?.data?.detail || error?.message || 'Network/server error';
      toast.error(`Import failed: ${msg}`, { id: toastId });
      console.error('Import error:', error);
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
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen(o => !o)}
              disabled={exporting}
              className="btn-secondary flex items-center space-x-1 text-sm disabled:opacity-50"
              data-testid="export-items-btn"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? 'Exporting…' : 'Export'}</span>
              <ChevronDown className="w-3 h-3 ml-1" />
            </button>
            {exportMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-white border border-[#D1D5DB] rounded-sm shadow-lg py-1" data-testid="export-menu">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold">Export by category</div>
                  {EXPORT_CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      onClick={() => handleExport(c.value)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[#F3F4F6] flex items-center justify-between"
                      data-testid={`export-cat-${c.value}`}
                    >
                      <span>{c.label}</span>
                      <Download className="w-3 h-3 text-[#6B7280]" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {canEdit && (
            <>
              <input type="file" ref={fileInputRef} accept=".xlsx,.xls" onChange={handleImport} className="hidden" data-testid="import-items-file" />
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
                    <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v, group_id: '' })}>
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

                {/* Item Group (optional, filters by current category) */}
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">
                    Item Group <span className="text-[#6B7280] font-normal">(optional — groups items like Motors, Bearings, Valves)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={formData.group_id || '__none__'}
                      onValueChange={(v) => setFormData({ ...formData, group_id: v === '__none__' ? '' : v })}
                    >
                      <SelectTrigger data-testid="item-group-select" className="flex-1">
                        <SelectValue placeholder="No group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">(No group)</SelectItem>
                        {filteredGroupsForForm.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-[#6B7280]">No groups defined for this category — create one in Settings → Item Groups</div>
                        ) : filteredGroupsForForm.map(g => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}{g.default_hsn_code ? ` · HSN ${g.default_hsn_code}` : ''}{g.default_gst_rate != null ? ` · ${g.default_gst_rate}%` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {groupLocksHsn && (
                    <p className="text-xs text-[#1E429F] mt-1">
                      HSN/GST are inherited from group <b>{selectedGroup?.name}</b> and cannot be edited here. Change at group level to update all items.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {formData.category === 'raw_material' ? (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Purchase Price ({currencySymbol})</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.purchase_price}
                          onChange={(e) => setFormData({ ...formData, purchase_price: parseFloat(e.target.value) || 0, unit_cost: parseFloat(e.target.value) || formData.unit_cost })}
                          className="input-field mono"
                          placeholder="Initial price — auto-updates from PO"
                          data-testid="item-purchase-price-input"
                        />
                        <p className="text-[10px] text-[#6B7280] mt-0.5">Auto-updates from latest PO</p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Sale Price ({currencySymbol})</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.sale_price}
                          onChange={(e) => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })}
                          className="input-field mono"
                          data-testid="item-sale-price-input"
                        />
                        <p className="text-[10px] text-[#6B7280] mt-0.5">Selling price (for spares/direct sale)</p>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Sale Price ({currencySymbol})</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.sale_price}
                        onChange={(e) => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })}
                        className="input-field mono"
                        data-testid="item-sale-price-input"
                      />
                      <p className="text-[10px] text-[#6B7280] mt-0.5">Selling price to customers</p>
                    </div>
                  )}
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
                </div>
                <div className="grid grid-cols-3 gap-4">
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
                    <label className="block text-sm font-semibold text-[#111827] mb-1">
                      HSN Code {groupLocksHsn && selectedGroup?.default_hsn_code && <span className="text-[10px] text-[#1E429F]">(from group)</span>}
                    </label>
                    <input
                      type="text"
                      value={groupLocksHsn && selectedGroup?.default_hsn_code ? selectedGroup.default_hsn_code : formData.hsn_code}
                      onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                      className={`input-field mono ${groupLocksHsn && selectedGroup?.default_hsn_code ? 'bg-[#F3F4F6] cursor-not-allowed' : ''}`}
                      placeholder="e.g. 7208"
                      disabled={!!(groupLocksHsn && selectedGroup?.default_hsn_code)}
                      data-testid="item-hsn-code-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">
                      GST Rate (%) {groupLocksHsn && selectedGroup?.default_gst_rate != null && <span className="text-[10px] text-[#1E429F]">(from group)</span>}
                    </label>
                    <Select
                      value={String(groupLocksHsn && selectedGroup?.default_gst_rate != null ? selectedGroup.default_gst_rate : formData.gst_rate)}
                      onValueChange={(v) => setFormData({ ...formData, gst_rate: parseFloat(v) })}
                      disabled={!!(groupLocksHsn && selectedGroup?.default_gst_rate != null)}
                    >
                      <SelectTrigger data-testid="item-gst-rate-select" className={groupLocksHsn && selectedGroup?.default_gst_rate != null ? 'bg-[#F3F4F6] cursor-not-allowed' : ''}><SelectValue placeholder="Select rate" /></SelectTrigger>
                      <SelectContent>
                        {taxSlabs.map(r => (
                          <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                        ))}
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
                className="search-input"
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
          <div className="w-48">
            <Select value={groupFilter || undefined} onValueChange={(v) => setGroupFilter(v === 'all' ? '' : v)}>
              <SelectTrigger data-testid="items-group-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                {itemGroups
                  .filter(g => !categoryFilter || !g.parent_category || g.parent_category === categoryFilter)
                  .map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} {g.parent_category ? `(${g.parent_category.replace('_', ' ')})` : ''} · {g.item_count ?? 0}
                    </SelectItem>
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
          <div className="overflow-x-auto sticky-header-scroll">
            <table ref={tableRef} className="w-full data-table" data-testid="items-table">
              <thead>
                <tr>
                  <th
                    onClick={togglePartNumberSort}
                    className={`sortable ${partNumberSort ? 'sorted' : ''}`}
                    data-testid="items-th-part-number"
                  >
                    Part Number
                    <span className="sort-chevron">{partNumberSort === 'desc' ? '▼' : '▲'}</span>
                  </th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Group</th>
                  <th>HSN</th>
                  <th className="text-right">GST%</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Unit Cost</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Apply Part Number sort (case-insensitive, natural-ish via localeCompare with numeric=true)
                  const sortedItems = partNumberSort
                    ? [...items].sort((a, b) => {
                        const ax = (a.part_number || '').toLowerCase();
                        const bx = (b.part_number || '').toLowerCase();
                        const cmp = ax.localeCompare(bx, undefined, { numeric: true, sensitivity: 'base' });
                        return partNumberSort === 'asc' ? cmp : -cmp;
                      })
                    : items;
                  return sortedItems.slice(0, visibleCount).map((item) => {
                  const itemGroup = itemGroups.find(g => g.id === item.group_id);
                  return (
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
                    <td className="text-sm">
                      {itemGroup ? (
                        <span className="px-2 py-0.5 bg-[#EEF2FF] text-[#3730A3] rounded-sm text-xs font-medium">{itemGroup.name}</span>
                      ) : <span className="text-[#9CA3AF]">-</span>}
                    </td>
                    <td className="mono text-sm">{item.hsn_code || '-'}</td>
                    <td className="text-right mono">{item.gst_rate != null ? `${item.gst_rate}%` : '-'}</td>
                    <td className="text-right mono">{item.current_stock} {item.unit_of_measure}</td>
                    <td className="text-right mono">{formatCurrency(item.unit_cost)}</td>
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
                            onClick={() => setDeleteConfirm({ open: true, item })}
                            className="p-1 text-[#4B5563] hover:text-[#9B1C1C]"
                            data-testid={`delete-item-${item.part_number}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                });
                })()}
              </tbody>
            </table>
            {items.length > visibleCount && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#E5E7EB] bg-[#F9FAFB]">
                <span className="text-xs text-[#6B7280]">Showing {visibleCount} of {items.length} items</span>
                <div className="flex gap-2">
                  <button onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, items.length))} className="btn-secondary text-xs" data-testid="items-load-more">Show {Math.min(PAGE_SIZE, items.length - visibleCount)} more</button>
                  <button onClick={() => setVisibleCount(items.length)} className="btn-secondary text-xs" data-testid="items-load-all">Show all</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, item: null })}
        title="Delete Item?"
        message={<>This will permanently delete <strong>{deleteConfirm.item?.part_number}</strong> — {deleteConfirm.item?.name}. The operation will fail if this item is referenced in any BOM, Order, GRN, Invoice or Ticket.</>}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => handleDelete(deleteConfirm.item)}
        testidPrefix="item-delete-confirm"
      />
    </div>
  );
}
