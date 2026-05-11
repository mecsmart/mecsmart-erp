import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import useResizableColumns from '../hooks/useResizableColumns';
import { formatQty } from '../utils/uomFormat';
import { 
  Plus, 
  Package, 
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  AlertTriangle,
  Filter,
  X,
  Search,
  Edit2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';

const transactionTypes = [
  { value: 'receive', label: 'Receive', icon: ArrowDownRight, color: 'text-[#03543F]' },
  { value: 'issue', label: 'Issue', icon: ArrowUpRight, color: 'text-[#9B1C1C]' },
  { value: 'adjust', label: 'Adjustment', icon: RotateCcw, color: 'text-[#1E429F]' },
];

export default function InventoryPage() {
  const { user, hasPermission } = useAuth();
  const { formatCurrency } = useCompanySettings();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stockByItem, setStockByItem] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stock');
  const [itemGroups, setItemGroups] = useState([]);
  const [groupFilter, setGroupFilter] = useState('');
  const [taxSlabs, setTaxSlabs] = useState([0, 5, 12, 18, 28]);
  // UOM master — needed to render quantities with the configured decimal places.
  const [uoms, setUoms] = useState([]);
  // Sort + resize state for the inventory table.
  const [partNumberSort, setPartNumberSort] = useState(null);
  const tableRef = useRef(null);
  useResizableColumns(tableRef, [inventory.length, loading]);
  const togglePartNumberSort = () => setPartNumberSort(s => (s === 'asc' ? 'desc' : 'asc'));

  // Deep-link: sidebar "Configuration" now has its own route, keep only stock/transactions here
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['stock', 'transactions'].includes(tab)) {
      setActiveTab(tab);
    }
    // Dashboard "Low Stock" KPI deep-link auto-toggles the low-stock filter.
    if (params.get('lowStock') === '1') {
      setShowLowStock(true);
    }
  }, []);
  const [showLowStock, setShowLowStock] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    item_id: '',
    transaction_type: 'receive',
    quantity: 1,
    warehouse_id: '',
    notes: '',
  });

  // Inline stock-edit dialog. Edits stock thresholds + (if items.edit) master
  // fields like name/group/HSN/GST/prices — mirrors the full /items form so the
  // user never has to leave the Inventory page. Backend whitelist enforces the
  // permission tiers regardless of what the client sends.
  const [stockEditDialog, setStockEditDialog] = useState({ open: false, item: null });
  const [stockEditForm, setStockEditForm] = useState({
    // Stock tier
    safety_stock: 0,
    reorder_point: 0,
    lead_time_days: 0,
    current_stock: 0,
    // Master tier (only sent when canEditItemMaster)
    name: '',
    group_id: '',
    hsn_code: '',
    gst_rate: 18,
    purchase_price: 0,
    sale_price: 0,
  });
  const [stockEditSaving, setStockEditSaving] = useState(false);

  const openStockEdit = (item) => {
    setStockEditDialog({ open: true, item });
    setStockEditForm({
      safety_stock: Number(item.safety_stock || 0),
      reorder_point: Number(item.reorder_point || 0),
      lead_time_days: Number(item.lead_time_days || 0),
      current_stock: Number(item.current_stock || 0),
      name: item.name || '',
      group_id: item.group_id || '',
      hsn_code: item.hsn_code || '',
      gst_rate: item.gst_rate != null ? Number(item.gst_rate) : 18,
      purchase_price: Number(item.purchase_price || 0),
      sale_price: Number(item.sale_price || 0),
    });
  };

  const handleStockEditSave = async () => {
    const item = stockEditDialog.item;
    if (!item) return;
    setStockEditSaving(true);
    try {
      // Always send stock fields. Send master fields only if user can edit them
      // (defence-in-depth — backend would silently drop them anyway).
      const payload = {
        safety_stock: stockEditForm.safety_stock,
        reorder_point: stockEditForm.reorder_point,
        lead_time_days: stockEditForm.lead_time_days,
        current_stock: stockEditForm.current_stock,
      };
      if (canEditItemMaster) {
        payload.name = stockEditForm.name;
        payload.group_id = stockEditForm.group_id || null;
        payload.hsn_code = stockEditForm.hsn_code;
        payload.gst_rate = stockEditForm.gst_rate;
        // For raw materials, purchase_price drives unit_cost. For other
        // categories, unit cost is BOM-rolled-up — only sale_price is editable.
        if (item.category === 'raw_material') {
          payload.purchase_price = stockEditForm.purchase_price;
        }
        payload.sale_price = stockEditForm.sale_price;
      }
      const { data: updated } = await api.put(`/api/inventory/items/${item.id}/stock-fields`, payload);
      // Patch the item in place — preserves scroll position so the user
      // doesn't get bounced back to the top after every stock edit.
      setInventory(prev => prev.map(it => it.id === item.id ? { ...it, ...(updated || payload) } : it));
      setStockEditDialog({ open: false, item: null });
      toast.success(`${item.part_number} updated`);
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to save stock changes');
    } finally {
      setStockEditSaving(false);
    }
  };

  const canCreate = ['admin', 'inventory_manager', 'production_manager'].includes(user?.role);
  // Item master rights — `Create Item` requires the FULL item.create perm
  // (a fresh item record demands every field). `Edit` (inline stock fields
  // only) accepts items.edit / items.create OR inventory.edit / inventory.create
  // because stock thresholds are an inventory concern.
  const canCreateItem = user?.role === 'admin' || hasPermission('items', 'create');
  const canEditItem = user?.role === 'admin'
    || hasPermission('items', 'edit')
    || hasPermission('items', 'create')
    || hasPermission('inventory', 'edit')
    || hasPermission('inventory', 'create');
  // Stricter tier — controls visibility of master fields (name, HSN, GST,
  // group, purchase/sale price) inside the inline dialog. Aligns with backend
  // PUT /api/inventory/items/{id}/stock-fields permission gate.
  const canEditItemMaster = user?.role === 'admin'
    || hasPermission('items', 'edit')
    || hasPermission('items', 'create');
  // Price-visibility flags — gate sale/purchase price columns and the
  // corresponding inputs in the stock-edit dialog. Admins always see them.
  const canViewSalePrice = user?.role === 'admin' || user?.is_admin_group || hasPermission('inventory_sale_price', 'view');
  const canViewPurchasePrice = user?.role === 'admin' || user?.is_admin_group || hasPermission('inventory_purchase_price', 'view');

  useEffect(() => {
    fetchData();
  }, [showLowStock, categoryFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showLowStock) params.append('low_stock', 'true');
      if (categoryFilter) params.append('category', categoryFilter);
      
      const [inventoryRes, transactionsRes, warehousesRes, stockByItemRes, groupsRes, gstRes, uomsRes] = await Promise.all([
        api.get(`/api/inventory?${params.toString()}`),
        api.get('/api/inventory/transactions?limit=50'),
        api.get('/api/warehouses'),
        api.get('/api/warehouses/stock/by-item'),
        api.get('/api/item-groups').catch(() => ({ data: [] })),
        api.get('/api/settings/gst-slabs').catch(() => ({ data: [] })),
        api.get('/api/settings/uoms').catch(() => ({ data: [] })),
      ]);
      setInventory(inventoryRes.data);
      setTransactions(transactionsRes.data);
      setWarehouses(warehousesRes.data || []);
      setStockByItem(stockByItemRes.data || {});
      setItemGroups(groupsRes.data || []);
      const slabs = Array.isArray(gstRes.data) && gstRes.data.length ? gstRes.data : [0, 5, 12, 18, 28];
      setTaxSlabs(slabs);
      setUoms(uomsRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransactionSubmit = async (e) => {
    e.preventDefault();
    if (!transactionForm.warehouse_id) {
      alert('Warehouse is required for stock changes. Please select a warehouse.');
      return;
    }
    try {
      await api.post('/api/inventory/transactions', transactionForm);
      setIsTransactionDialogOpen(false);
      resetTransactionForm();
      fetchData();
    } catch (error) {
      console.error('Failed to create transaction:', error);
      alert(error.response?.data?.detail || 'Failed to create transaction');
    }
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      item_id: '',
      transaction_type: 'receive',
      quantity: 1,
      warehouse_id: '',
      notes: '',
    });
  };

  const isLowStock = (item) => item.current_stock <= item.reorder_point;

  const getTransactionIcon = (type) => {
    const txType = transactionTypes.find(t => t.value === type);
    if (!txType) return null;
    const Icon = txType.icon;
    return <Icon className={`w-4 h-4 ${txType.color}`} />;
  };

  const totalValue = inventory.reduce((sum, item) => sum + (item.current_stock * item.unit_cost), 0);
  const lowStockCount = inventory.filter(isLowStock).length;

  return (
    <div className="space-y-6" data-testid="inventory-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Inventory Management</h1>
          <p className="text-sm text-[#4B5563]">Track stock levels and inventory transactions</p>
        </div>
        <div className="flex items-center gap-2">
        {user?.role === 'admin' && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Reconcile all `reserved_stock` values against active Sales Orders and Manufacturing Orders?\n\nThis is safe to run anytime — it removes orphan reservations left over from older cancellations. Click OK to proceed.")) return;
              try {
                const { data } = await api.post('/api/inventory/reconcile-reservations');
                if (data.drift_count === 0) {
                  toast.success(data.message);
                } else {
                  const summary = (data.drift || []).slice(0, 6).map(d => `${d.part_number}: ${d.before} → ${d.after}`).join('\n');
                  toast.success(`${data.message}\n${summary}${data.drift_count > 6 ? `\n…and ${data.drift_count - 6} more` : ''}`, { duration: 8000 });
                  fetchData();
                }
              } catch (err) {
                toast.error(err.response?.data?.detail || 'Reconcile failed');
              }
            }}
            className="btn-secondary flex items-center space-x-2 text-[#723B13] border-[#723B13] hover:bg-[#FEF3C7]"
            data-testid="reconcile-reservations-btn"
            title="Admin tool: recompute reserved_stock from active SOs + MOs"
          >
            <span>Reconcile Reservations</span>
          </button>
        )}
        {canCreateItem && (
          <button
            type="button"
            onClick={() => navigate('/items?action=new')}
            className="btn-secondary flex items-center space-x-2"
            data-testid="inventory-create-item-btn"
            title="Add a new item to the master"
          >
            <Plus className="w-4 h-4" />
            <span>Create Item</span>
          </button>
        )}
        {canCreate && (
          <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-transaction-btn">
                <Plus className="w-4 h-4" />
                <span>New Transaction</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">Record Inventory Transaction</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleTransactionSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Item *</label>
                  <Select 
                    value={transactionForm.item_id} 
                    onValueChange={(v) => setTransactionForm({ ...transactionForm, item_id: v })}
                  >
                    <SelectTrigger data-testid="transaction-item-select">
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventory.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.part_number} - {item.name} (Stock: {item.current_stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Transaction Type *</label>
                  <Select 
                    value={transactionForm.transaction_type} 
                    onValueChange={(v) => setTransactionForm({ ...transactionForm, transaction_type: v })}
                  >
                    <SelectTrigger data-testid="transaction-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {transactionTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Warehouse *</label>
                  <Select 
                    value={transactionForm.warehouse_id} 
                    onValueChange={(v) => setTransactionForm({ ...transactionForm, warehouse_id: v })}
                  >
                    <SelectTrigger data-testid="transaction-warehouse-select">
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.code ? `${w.code} — ` : ''}{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={transactionForm.quantity}
                    onChange={(e) => setTransactionForm({ ...transactionForm, quantity: parseInt(e.target.value) || 1 })}
                    className="input-field mono"
                    required
                    data-testid="transaction-quantity-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
                  <textarea
                    value={transactionForm.notes}
                    onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="Transaction notes..."
                    data-testid="transaction-notes-input"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                  <button type="button" onClick={() => setIsTransactionDialogOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" data-testid="transaction-save-btn">
                    Record Transaction
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Total Items</p>
              <p className="kpi-value">{inventory.length}</p>
            </div>
            <Package className="w-8 h-8 text-[#457B9D]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Low Stock Alerts</p>
              <p className="kpi-value text-[#9B1C1C]">{lowStockCount}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-[#9B1C1C]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Total Inventory Value</p>
              <p className="kpi-value">{formatCurrency(totalValue)}</p>
            </div>
            <Package className="w-8 h-8 text-[#03543F]" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-[#F3F4F6] p-1 rounded-sm">
          <TabsTrigger 
            value="stock" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-stock"
          >
            Stock Levels
          </TabsTrigger>
          <TabsTrigger 
            value="transactions" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-transactions"
          >
            Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          {/* Filters */}
          <div className="card-flat p-4 mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Search by part number or name…"
                  className="search-input text-sm"
                  data-testid="inventory-stock-search"
                />
              </div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLowStock}
                  onChange={(e) => setShowLowStock(e.target.checked)}
                  className="rounded"
                  data-testid="low-stock-filter"
                />
                <span className="text-sm font-medium text-[#111827]">Show Low Stock Only</span>
              </label>
              <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-48" data-testid="inventory-category-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="raw_material">Raw Material</SelectItem>
                  <SelectItem value="component">Component</SelectItem>
                  <SelectItem value="sub_assembly">Sub-Assembly</SelectItem>
                  <SelectItem value="finished_good">Finished Good</SelectItem>
                </SelectContent>
              </Select>
              <Select value={groupFilter || 'all'} onValueChange={(v) => setGroupFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-56 relative" data-testid="inventory-group-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Groups" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {itemGroups.map(g => (
                    <SelectItem key={g.id || g._id || g.code} value={g.id || g._id || g.code}>
                      {g.code ? `${g.code} — ${g.name}` : g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {groupFilter && (
                <button
                  type="button"
                  onClick={() => setGroupFilter('')}
                  className="btn-secondary flex items-center space-x-1 text-xs h-9 -ml-1"
                  title="Clear group filter"
                  data-testid="inventory-group-filter-clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {(showLowStock || categoryFilter || groupFilter || stockSearch) && (
                <button 
                  onClick={() => { setShowLowStock(false); setCategoryFilter(''); setGroupFilter(''); setStockSearch(''); }} 
                  className="btn-secondary flex items-center space-x-1"
                >
                  <X className="w-4 h-4" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : inventory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <Package className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No inventory items found</p>
              </div>
            ) : (
              <div className="overflow-x-auto sticky-header-scroll">
                <table ref={tableRef} className="w-full data-table" data-testid="inventory-table">
                  <thead>
                    <tr>
                      <th
                        onClick={togglePartNumberSort}
                        className={`sortable ${partNumberSort ? 'sorted' : ''}`}
                        data-testid="inventory-th-part-number"
                      >
                        Part Number
                        <span className="sort-chevron">{partNumberSort === 'desc' ? '▼' : '▲'}</span>
                      </th>
                      <th>Name</th>
                      <th>Category</th>
                      <th className="text-right">Current Stock</th>
                      <th>Warehouse</th>
                      <th className="text-right">Safety Stock</th>
                      <th className="text-right">Reorder Point</th>
                      <th className="text-right">Unit Cost</th>
                      {canViewPurchasePrice && <th className="text-right" data-testid="inventory-th-purchase-price">Purchase Price</th>}
                      {canViewSalePrice && <th className="text-right" data-testid="inventory-th-sale-price">Sale Price</th>}
                      <th className="text-right">Value</th>
                      {canEditItem && <th className="text-center">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filtered = inventory.filter(item => {
                        if (groupFilter && item.group_id !== groupFilter) return false;
                        if (!stockSearch.trim()) return true;
                        const q = stockSearch.toLowerCase();
                        const grp = itemGroups.find(g => g.id === item.group_id);
                        return [
                          item.part_number, item.name, item.description, item.hsn_code,
                          item.category, grp?.name, grp?.code,
                        ].some(v => v && String(v).toLowerCase().includes(q));
                      });
                      const sorted = partNumberSort
                        ? [...filtered].sort((a, b) => {
                            const ax = (a.part_number || '').toLowerCase();
                            const bx = (b.part_number || '').toLowerCase();
                            const cmp = ax.localeCompare(bx, undefined, { numeric: true, sensitivity: 'base' });
                            return partNumberSort === 'asc' ? cmp : -cmp;
                          })
                        : filtered;
                      return sorted.map((item) => (
                      <tr key={item.id} className={isLowStock(item) ? 'bg-[#FDE8E8]/30' : ''} data-testid={`inventory-row-${item.part_number}`}>
                        <td className="mono font-medium">{item.part_number}</td>
                        <td>
                          <div className="flex items-center space-x-2">
                            {isLowStock(item) && <AlertTriangle className="w-4 h-4 text-[#9B1C1C]" />}
                            <span>{item.name}</span>
                          </div>
                          {(item.variant_attributes || []).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1" data-testid={`item-variants-${item.part_number}`}>
                              {(item.variant_attributes || []).slice(0, 3).map((attr, ai) => (
                                <span key={ai} className="text-[9px] inline-block px-1 py-0.5 rounded bg-[#EEF2FF] text-[#3730A3]" title={`${attr.name}: ${(attr.values || []).join(', ')}`}>
                                  {attr.name}: {(attr.values || []).slice(0, 3).join('/')}{(attr.values || []).length > 3 ? '…' : ''}
                                </span>
                              ))}
                              {(item.variant_attributes || []).length > 3 && (
                                <span className="text-[9px] text-[#6B7280]">+{(item.variant_attributes || []).length - 3} more</span>
                              )}
                            </div>
                          )}
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
                        <td className={`text-right mono font-medium ${isLowStock(item) ? 'text-[#9B1C1C]' : ''}`}>
                          {formatQty(item.current_stock, item.unit_of_measure, uoms)} {item.unit_of_measure}
                        </td>
                        <td className="text-xs">
                          {(stockByItem[item.id] || []).length === 0 ? (
                            <span className="text-[#9CA3AF] italic">—</span>
                          ) : (
                            <div className="space-y-0.5">
                              {(stockByItem[item.id] || []).map((ws, wi) => (
                                <div key={wi} className="flex gap-1">
                                  <span className="text-[#1E429F] font-medium">{ws.warehouse_code || ws.warehouse_name}:</span>
                                  <span className="mono">{formatQty(ws.quantity, item.unit_of_measure, uoms)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="text-right mono">{formatQty(item.safety_stock, item.unit_of_measure, uoms)}</td>
                        <td className="text-right mono">{formatQty(item.reorder_point, item.unit_of_measure, uoms)}</td>
                        <td className="text-right mono">{formatCurrency(item.unit_cost)}</td>
                        {canViewPurchasePrice && (
                          <td className="text-right mono" data-testid={`inventory-purchase-price-${item.part_number}`}>
                            {item.category === 'raw_material' && item.purchase_price ? formatCurrency(item.purchase_price) : <span className="text-[#9CA3AF]">-</span>}
                          </td>
                        )}
                        {canViewSalePrice && (
                          <td className="text-right mono" data-testid={`inventory-sale-price-${item.part_number}`}>
                            {item.sale_price ? formatCurrency(item.sale_price) : <span className="text-[#9CA3AF]">-</span>}
                          </td>
                        )}
                        <td className="text-right mono">{formatCurrency(item.current_stock * item.unit_cost)}</td>
                        {canEditItem && (
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() => openStockEdit(item)}
                              className="p-1 text-[#4B5563] hover:text-[#1D3557]"
                              title="Edit stock thresholds (safety/reorder/cost)"
                              data-testid={`edit-item-${item.part_number}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <RotateCcw className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No transactions recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="transactions-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Item</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Previous</th>
                      <th className="text-right">New Stock</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} data-testid={`transaction-row-${tx.id}`}>
                        <td className="text-sm text-[#4B5563]">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>
                        <td>
                          <div className="flex items-center space-x-1">
                            {getTransactionIcon(tx.transaction_type)}
                            <span className={`text-sm font-medium ${
                              tx.transaction_type === 'receive' ? 'text-[#03543F]' :
                              tx.transaction_type === 'issue' ? 'text-[#9B1C1C]' :
                              'text-[#1E429F]'
                            }`}>
                              {tx.transaction_type}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="mono text-sm">{tx.item?.part_number || '-'}</span>
                          <p className="text-xs text-[#4B5563]">{tx.item?.name || '-'}</p>
                        </td>
                        <td className={`text-right mono font-medium ${
                          tx.transaction_type === 'receive' ? 'text-[#03543F]' :
                          tx.transaction_type === 'issue' ? 'text-[#9B1C1C]' :
                          'text-[#1E429F]'
                        }`}>
                          {tx.transaction_type === 'receive' ? '+' : tx.transaction_type === 'issue' ? '-' : ''}{tx.quantity}
                        </td>
                        <td className="text-right mono">{tx.previous_stock}</td>
                        <td className="text-right mono font-medium">{tx.new_stock}</td>
                        <td className="text-sm text-[#4B5563] max-w-xs truncate">{tx.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Inline Stock Edit Dialog — keeps the user on Inventory page.
          Stock fields shown to anyone with edit rights. Master fields
          (name/group/HSN/GST/prices) appear only when items.edit is granted.
          Price field set differs by category: RM = purchase + sale; others =
          sale only (unit cost rolls up from BOM for FG/SA/Component). */}
      <Dialog open={stockEditDialog.open} onOpenChange={(open) => { if (!open) setStockEditDialog({ open: false, item: null }); }}>
        <DialogContent className="max-w-2xl" data-testid="inventory-stock-edit-dialog">
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Edit Item — {stockEditDialog.item?.part_number}</DialogTitle>
          </DialogHeader>
          {stockEditDialog.item && (() => {
            const it = stockEditDialog.item;
            const isRM = it.category === 'raw_material';
            const filteredGroups = itemGroups.filter(g => !g.parent_category || g.parent_category === it.category);
            const selectedGroup = itemGroups.find(g => g.id === stockEditForm.group_id);
            const groupLocksHsn = !!(selectedGroup && (selectedGroup.default_hsn_code || selectedGroup.default_gst_rate != null));
            return (
              <div className="space-y-4 mt-2">
                <div className="bg-[#F3F4F6] border border-[#E5E7EB] rounded-sm p-3 text-xs grid grid-cols-3 gap-2">
                  <div><span className="text-[#6B7280]">Part No:</span> <span className="font-medium mono">{it.part_number}</span></div>
                  <div><span className="text-[#6B7280]">Category:</span> <span className="font-medium capitalize">{it.category?.replace('_', ' ')}</span></div>
                  <div><span className="text-[#6B7280]">UoM:</span> <span className="font-medium">{it.unit_of_measure}</span></div>
                </div>

                {/* Master fields — only when items.edit */}
                {canEditItemMaster && (
                  <div className="border border-[#E5E7EB] rounded-sm p-3 space-y-3 bg-[#F9FAFB]" data-testid="stock-edit-master-section">
                    <div className="text-[11px] font-semibold text-[#1D3557] uppercase tracking-wide">Item Master (requires Items edit permission)</div>
                    <div>
                      <label className="block text-xs font-semibold text-[#111827] mb-1">Name *</label>
                      <input type="text"
                        value={stockEditForm.name}
                        onChange={(e) => setStockEditForm({ ...stockEditForm, name: e.target.value })}
                        className="input-field"
                        data-testid="stock-edit-name" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#111827] mb-1">Item Group</label>
                        <Select
                          value={stockEditForm.group_id || '__none__'}
                          onValueChange={(v) => setStockEditForm({ ...stockEditForm, group_id: v === '__none__' ? '' : v })}
                        >
                          <SelectTrigger data-testid="stock-edit-group"><SelectValue placeholder="No group" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">(No group)</SelectItem>
                            {filteredGroups.map(g => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}{g.default_hsn_code ? ` · HSN ${g.default_hsn_code}` : ''}{g.default_gst_rate != null ? ` · ${g.default_gst_rate}%` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#111827] mb-1">
                          HSN Code{groupLocksHsn && selectedGroup?.default_hsn_code && <span className="text-[10px] text-[#1E429F] ml-1">(from group)</span>}
                        </label>
                        <input type="text"
                          value={groupLocksHsn && selectedGroup?.default_hsn_code ? selectedGroup.default_hsn_code : stockEditForm.hsn_code}
                          onChange={(e) => setStockEditForm({ ...stockEditForm, hsn_code: e.target.value })}
                          disabled={!!(groupLocksHsn && selectedGroup?.default_hsn_code)}
                          className={`input-field mono ${groupLocksHsn && selectedGroup?.default_hsn_code ? 'bg-[#F3F4F6] cursor-not-allowed' : ''}`}
                          data-testid="stock-edit-hsn" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#111827] mb-1">
                          GST Rate (%){groupLocksHsn && selectedGroup?.default_gst_rate != null && <span className="text-[10px] text-[#1E429F] ml-1">(from group)</span>}
                        </label>
                        <Select
                          value={String(groupLocksHsn && selectedGroup?.default_gst_rate != null ? selectedGroup.default_gst_rate : stockEditForm.gst_rate)}
                          onValueChange={(v) => setStockEditForm({ ...stockEditForm, gst_rate: parseFloat(v) })}
                          disabled={!!(groupLocksHsn && selectedGroup?.default_gst_rate != null)}
                        >
                          <SelectTrigger data-testid="stock-edit-gst" className={groupLocksHsn && selectedGroup?.default_gst_rate != null ? 'bg-[#F3F4F6] cursor-not-allowed' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {taxSlabs.map(r => (<SelectItem key={r} value={String(r)}>{r}%</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      {isRM ? (
                        <>
                          {canViewPurchasePrice && (
                            <div>
                              <label className="block text-xs font-semibold text-[#111827] mb-1">Purchase Price</label>
                              <input type="number" step="0.01" min="0"
                                value={stockEditForm.purchase_price}
                                onChange={(e) => setStockEditForm({ ...stockEditForm, purchase_price: parseFloat(e.target.value) || 0 })}
                                className="input-field mono"
                                data-testid="stock-edit-purchase-price" />
                              <p className="text-[10px] text-[#6B7280] mt-0.5">Auto-updates from latest PO</p>
                            </div>
                          )}
                          {canViewSalePrice && (
                            <div>
                              <label className="block text-xs font-semibold text-[#111827] mb-1">Sale Price</label>
                              <input type="number" step="0.01" min="0"
                                value={stockEditForm.sale_price}
                                onChange={(e) => setStockEditForm({ ...stockEditForm, sale_price: parseFloat(e.target.value) || 0 })}
                                className="input-field mono"
                                data-testid="stock-edit-sale-price" />
                            </div>
                          )}
                        </>
                      ) : (
                        canViewSalePrice && (
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-[#111827] mb-1">Sale Price</label>
                            <input type="number" step="0.01" min="0"
                              value={stockEditForm.sale_price}
                              onChange={(e) => setStockEditForm({ ...stockEditForm, sale_price: parseFloat(e.target.value) || 0 })}
                              className="input-field mono"
                              data-testid="stock-edit-sale-price" />
                            <p className="text-[10px] text-[#6B7280] mt-0.5">Unit cost is rolled up from BOM for {it.category?.replace('_', ' ')}</p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Variant Attributes — read-only display (managed from BOM dialog) */}
                {(stockEditDialog.item?.variant_attributes || []).length > 0 && (
                  <div className="border border-[#FDE68A] bg-[#FFFBEB] rounded-sm p-3 space-y-2" data-testid="stock-edit-variants-block">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold text-[#723B13] uppercase tracking-wide">Product Variants</div>
                      <span className="text-[10px] text-[#92400E]">Managed from the BOM editor</span>
                    </div>
                    <div className="space-y-1.5">
                      {(stockEditDialog.item?.variant_attributes || []).map((attr, ai) => (
                        <div key={ai} className="flex items-center gap-2 bg-white border border-[#FDE68A] rounded-sm px-2 py-1">
                          <span className="text-xs font-semibold text-[#374151] w-32 truncate" title={attr.name}>{attr.name}</span>
                          <div className="flex flex-wrap gap-1 flex-1">
                            {(attr.values || []).map((v, vi) => (
                              <span key={vi} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#1D3557] text-white">{v}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stock fields — always editable for users with stock or master rights */}
                <div className="border border-[#E5E7EB] rounded-sm p-3 space-y-3">
                  <div className="text-[11px] font-semibold text-[#1D3557] uppercase tracking-wide">Stock Levels</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#111827] mb-1">Current Stock</label>
                      <input type="number" step="any" min="0"
                        value={stockEditForm.current_stock}
                        onChange={(e) => setStockEditForm({ ...stockEditForm, current_stock: parseFloat(e.target.value) || 0 })}
                        className="input-field mono"
                        data-testid="stock-edit-current-stock" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#111827] mb-1">Safety Stock</label>
                      <input type="number" step="any" min="0"
                        value={stockEditForm.safety_stock}
                        onChange={(e) => setStockEditForm({ ...stockEditForm, safety_stock: parseFloat(e.target.value) || 0 })}
                        className="input-field mono"
                        data-testid="stock-edit-safety-stock" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#111827] mb-1">Reorder Point</label>
                      <input type="number" step="any" min="0"
                        value={stockEditForm.reorder_point}
                        onChange={(e) => setStockEditForm({ ...stockEditForm, reorder_point: parseFloat(e.target.value) || 0 })}
                        className="input-field mono"
                        data-testid="stock-edit-reorder-point" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#111827] mb-1">Lead Time (days)</label>
                      <input type="number" step="1" min="0"
                        value={stockEditForm.lead_time_days}
                        onChange={(e) => setStockEditForm({ ...stockEditForm, lead_time_days: parseInt(e.target.value) || 0 })}
                        className="input-field mono"
                        data-testid="stock-edit-lead-time" />
                    </div>
                  </div>
                </div>

                {!canEditItemMaster && (
                  <p className="text-[11px] text-[#6B7280] italic">
                    Need to change name, HSN, GST or prices? Open this item from the
                    <button type="button" onClick={() => navigate(`/items?action=edit&id=${it.id}`)} className="text-[#1D3557] underline hover:text-[#1E429F] ml-1">Items &amp; Parts</button> page.
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
                  <button type="button" className="btn-secondary" onClick={() => setStockEditDialog({ open: false, item: null })}>Cancel</button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleStockEditSave}
                    disabled={stockEditSaving}
                    data-testid="stock-edit-save-btn"
                  >
                    {stockEditSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
