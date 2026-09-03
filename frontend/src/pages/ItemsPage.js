import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import useResizableColumns from '../hooks/useResizableColumns';
import { formatQty } from '../utils/uomFormat';
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
import { SearchableSelect } from '../components/SearchableSelect';
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
  // Variants rollup memoized — hides retired variant children, groups variants
  // by parent_item_id. Heavy compute over 1000s of items, recomputed only when
  // `items` changes.
  const variantsRollup = useMemo(() => {
    const variantsByParent = {};
    for (const it of items) {
      if (it.is_variant && it.parent_item_id && it.is_active !== false) {
        if (!variantsByParent[it.parent_item_id]) variantsByParent[it.parent_item_id] = [];
        variantsByParent[it.parent_item_id].push(it);
      }
    }
    const baseItems = items.filter(it => !it.is_variant);
    return { variantsByParent, baseItems };
  }, [items]);
  const [uoms, setUoms] = useState([]);
  const [itemGroups, setItemGroups] = useState([]);
  const [units, setUnits] = useState(FALLBACK_UNITS);
  const [taxSlabs, setTaxSlabs] = useState([0, 5, 12, 18, 28]);
  const [loading, setLoading] = useState(true);
  
  // Hook for resizable columns - must be after items/loading state declarations
  useResizableColumns(tableRef, [items.length, loading]);
  
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  // Low Stock filter — when ON, only items where current_stock <= reorder_point
  // (or any of their variant children fall below their own reorder_point) are
  // shown. The classic "what do I urgently need to order?" view.
  const [lowStockOnly, setLowStockOnly] = useState(false);
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
    variant_attributes: [],
  });

  // Inherited (read-only) variant view for FG/SG items — fetched from
  // /api/items/{id}/effective-variants when the user opens an existing FG/SG.
  const [inheritedVariants, setInheritedVariants] = useState([]);
  const [inheritedSource, setInheritedSource] = useState('none');
  // Per-variant stock editor — populated when an item with variants is opened
  // for edit. Keyed by variant.id → current_stock number. Saved on submit
  // alongside the item update so users don't need two dialogs.
  const [variantStockEdits, setVariantStockEdits] = useState({});

  const canEdit = user?.role === 'admin'
    || hasPermission('items', 'create')
    || hasPermission('items', 'edit')
    || hasPermission('inventory', 'create')
    || hasPermission('inventory', 'edit');
  const canDelete = user?.role === 'admin' || hasPermission('items', 'delete');
  // Import requires `items.create` (mirrors backend `_require_access`). Without
  // this, lower-tier users would see a phantom Import button that 403s on click.
  const canCreateItems = user?.role === 'admin' || hasPermission('items', 'create') || hasPermission('inventory', 'create');
  // Price-visibility flags — gate sale/purchase price form fields. Admins always see them.
  const canViewSalePrice = user?.role === 'admin' || user?.is_admin_group || hasPermission('inventory_sale_price', 'view');
  const canViewPurchasePrice = user?.role === 'admin' || user?.is_admin_group || hasPermission('inventory_purchase_price', 'view');

  // Debounce search input so fast typing doesn't fire /api/items on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Render pagination — avoid laying out thousands of rows at once.
  const PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Reset pagination ONLY when the user actively narrows the dataset
  // (search/filter change). Editing an item triggers a setItems() call which
  // creates a new array reference — we must NOT reset visibleCount there,
  // else any item past row 100 disappears after a quick edit.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [debouncedSearch, categoryFilter, groupFilter]);

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, categoryFilter, groupFilter]);

  // Refetched on mount + after every import so newly-created groups appear in
  // the item-row group display immediately (no refresh required).
  const fetchItemGroups = async () => {
    try {
      const { data } = await api.get('/api/item-groups');
      setItemGroups(data || []);
    } catch (e) {
      console.warn('Failed to fetch item groups:', e);
    }
  };

  useEffect(() => {
    // Fire on-mount static-master fetches in parallel (was 3 sequential
    // awaits — caused ~1s lag on every screen entry).
    (async () => {
      const [groupsR, uomsR, gstR] = await Promise.allSettled([
        api.get('/api/item-groups'),
        api.get('/api/settings/uoms'),
        api.get('/api/settings/gst-slabs'),
      ]);
      if (groupsR.status === 'fulfilled') setItemGroups(groupsR.value.data || []);
      if (uomsR.status === 'fulfilled' && Array.isArray(uomsR.value.data) && uomsR.value.data.length) {
        setUnits(uomsR.value.data.map(u => u.code));
        setUoms(uomsR.value.data);
      }
      if (gstR.status === 'fulfilled' && Array.isArray(gstR.value.data) && gstR.value.data.length) {
        setTaxSlabs(gstR.value.data.map(r => Number(r)).sort((a, b) => a - b));
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
      // `lite=1` returns only the fields the table + edit dialog need —
      // ~30% smaller payload, dramatically faster on large catalogues.
      params.append('lite', '1');

      const { data } = await api.get(`/api/items?${params.toString()}`);
      setItems(data);
      // UOM master is small; cache it once for decimal-place lookups in the table.
      if (uoms.length === 0) {
        try {
          const { data: u } = await api.get('/api/settings/uoms');
          setUoms(u || []);
        } catch (_e) { /* non-fatal */ }
      }
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Persist the current form state to the parent item BEFORE running the
  // variant generator. Without this, edits to description/name/category
  // would NOT be reflected in the newly-created variant children (which
  // copy fields from the persisted parent record).
  const persistParentForGenerate = async () => {
    if (!editingItem) return;
    const cleanedVariantAttrs = (formData.variant_attributes || [])
      .map(a => ({
        name: (a.name || '').trim(),
        values: (a.values || []).map(v => {
          const value = (typeof v === 'string' ? v : (v?.value || '')).trim();
          const sc = (typeof v === 'object' && v?.short_code) ? String(v.short_code) : value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
          return { value, short_code: sc.slice(0, 4) };
        }).filter(v => v.value),
      }))
      .filter(a => a.name && a.values.length > 0);
    const payload = { ...formData, variant_attributes: cleanedVariantAttrs };
    const { data: updated } = await api.put(`/api/items/${editingItem.id}`, payload);
    setItems(prev => prev.map(it => it.id === editingItem.id ? { ...it, ...updated } : it));
    return updated;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Mandatory: UOM (matches backend validation so the user gets immediate feedback).
    if (!(formData.unit_of_measure || '').trim()) {
      toast.error('Unit of Measure (UOM) is required');
      return;
    }
    // Clean variant_attributes — drop empty rows, trim values, derive short_code.
    const cleanedVariantAttrs = (formData.variant_attributes || [])
      .map(a => ({
        name: (a.name || '').trim(),
        values: (a.values || []).map(v => {
          const value = (typeof v === 'string' ? v : (v?.value || '')).trim();
          const sc = (typeof v === 'object' && v?.short_code) ? String(v.short_code) : value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
          return { value, short_code: sc.slice(0, 4) };
        }).filter(v => v.value),
      }))
      .filter(a => a.name && a.values.length > 0);
    const payload = { ...formData, variant_attributes: cleanedVariantAttrs };
    try {
      let savedItem;
      if (editingItem) {
        const { data: updated } = await api.put(`/api/items/${editingItem.id}`, payload);
        savedItem = updated;
        setItems(prev => prev.map(it => it.id === editingItem.id ? { ...it, ...updated } : it));
        // Server returns _variant_prune when CP/RM variants were removed
        // — show the user exactly what happened. Hard-block errors are
        // surfaced via the catch path with the explicit "Cannot remove…"
        // message from the backend.
        const prune = updated && updated._variant_prune;
        if (prune && prune.deleted_skus?.length) {
          toast.success(`Item ${updated?.part_number || ''} updated — ${prune.deleted_skus.length} variant${prune.deleted_skus.length > 1 ? 's' : ''} deleted`);
          fetchItems().catch(() => {});
        } else {
          toast.success(`Item ${updated?.part_number || ''} updated`);
        }
      } else {
        const { data: created } = await api.post('/api/items', payload);
        savedItem = created;
        setItems(prev => [created, ...prev]);
        toast.success(`Item ${created?.part_number || ''} created`);
      }
      // Auto-generate variant children when the item has variant
      // attributes defined. PUT already pruned obsolete ones — this call
      // creates any NEW combos. Skip entirely when there are no attrs
      // (PUT's prune already handled the "remove all variants" path).
      const isLeaf = savedItem && (savedItem.category === 'component' || savedItem.category === 'raw_material');
      if (isLeaf && cleanedVariantAttrs.length > 0 && savedItem.id) {
        try {
          const { data: result } = await api.post(`/api/items/${savedItem.id}/generate-variants`, {});
          toast.success(result.message);
          // Refresh items so newly-generated children show up in the rollup.
          fetchItems().catch(() => {});
        } catch (genErr) {
          toast.error(genErr.response?.data?.detail || 'Variant generation failed — open the item again to retry.');
        }
      }
      // Push variant-level stock edits whenever the parent has variant
      // children. Only PUT variants whose value actually changed so the
      // audit trail (inventory_transactions) stays clean.
      if (editingItem) {
        const changedVariants = Object.entries(variantStockEdits || {})
          .map(([vid, newVal]) => {
            const orig = items.find(it => it.id === vid);
            return { vid, oldVal: Number(orig?.current_stock || 0), newVal: Number(newVal || 0) };
          })
          .filter(v => Math.abs(v.oldVal - v.newVal) > 1e-9);
        for (const cv of changedVariants) {
          try {
            const { data: uv } = await api.put(`/api/inventory/items/${cv.vid}/stock-fields`, { current_stock: cv.newVal });
            setItems(prev => prev.map(it => it.id === cv.vid ? { ...it, ...(uv || { current_stock: cv.newVal }) } : it));
          } catch (vErr) {
            console.error('Variant stock update failed for', cv.vid, vErr);
            toast.error(`Variant ${cv.vid} stock update failed`);
          }
        }
        if (changedVariants.length) {
          toast.success(`${changedVariants.length} variant stock${changedVariants.length > 1 ? 's' : ''} updated`);
        }
      }
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
    } catch (error) {
      console.error('Failed to save item:', error);
      toast.error(error.response?.data?.detail || 'Failed to save item');
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
      variant_attributes: (item.variant_attributes || []).map(a => ({
        name: a.name || '',
        values: (a.values || []).map(v => typeof v === 'string'
          ? { value: v, short_code: (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) }
          : { value: v.value || '', short_code: (v.short_code || (v.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)) }
        ),
      })),
    });
    setIsDialogOpen(true);
    // Initialize variant stock edit map — for parents that have variant
    // children we surface a green inline editor (matches Inventory page
    // behaviour) so the user can adjust each variant's opening/current stock.
    const childVariants = items.filter(it => it.is_variant && it.parent_item_id === item.id);
    const vmap = {};
    childVariants.forEach(v => { vmap[v.id] = Number(v.current_stock || 0); });
    setVariantStockEdits(vmap);
    // For FG/SG, also load inherited variants from BOM components so the
    // user can see what variant SKUs they can produce.
    setInheritedVariants([]);
    setInheritedSource('none');
    if (item.category === 'finished_good' || item.category === 'sub_assembly') {
      api.get(`/api/items/${item.id}/effective-variants`).then(({ data }) => {
        setInheritedVariants(data?.variant_attributes || []);
        setInheritedSource(data?.source || 'none');
      }).catch(() => { /* non-blocking */ });
    }
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
      variant_attributes: [],
    });
  };

  // Item-group dropdown — previously filtered groups by `parent_category`,
  // which hid groups defined for other categories. Users complained the
  // "full item group list" wasn't showing. We now render ALL groups so the
  // user can pick any group; a small category badge in the option label
  // keeps the context (so a "Bearings (component)" group is clearly tagged
  // even on a raw-material item form).
  const filteredGroupsForForm = itemGroups;
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

  const handleExport = async (category = 'all', groupId = '') => {
    setExportMenuOpen(false);
    const catMeta = EXPORT_CATEGORIES.find(c => c.value === category) || EXPORT_CATEGORIES[0];
    const grpMeta = groupId ? itemGroups.find(g => g.id === groupId) : null;
    const apiUrl = api.defaults.baseURL || process.env.REACT_APP_BACKEND_URL || '';
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);
    if (groupId) params.set('group_id', groupId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const directUrl = `${apiUrl}/api/items/export/excel${qs}`;
    const exportLabel = grpMeta ? `${grpMeta.name} - ${catMeta.label}` : catMeta.label;
    // Filename: prefix group name when scoped to a group.
    const safeGrp = grpMeta ? `_${grpMeta.code || grpMeta.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '_') : '';
    const downloadFilename = grpMeta ? `items${safeGrp}_${catMeta.filename}` : catMeta.filename;

    // STRATEGY: trigger the download via a hidden iframe, which delegates the
    // download to the browser without opening a new window/tab. Cookies (JWT)
    // flow automatically because it's same-origin per CORS, and
    // `Content-Disposition: attachment` is honored natively. This works even
    // when the user's environment blocks popup windows entirely.
    const toastId = toast.loading(`Opening ${exportLabel} export…`);
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = directUrl;
      document.body.appendChild(iframe);
      setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* noop */ } }, 10000);
      toast.success(`${exportLabel} download triggered — check your browser's downloads`, { id: toastId, duration: 4000 });
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
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        setTimeout(() => { try { document.body.removeChild(link); } catch { /* noop */ } }, 100);
        setTimeout(() => { try { window.URL.revokeObjectURL(url); } catch { /* noop */ } }, 5000);
        toast.success(`${exportLabel} exported (${(blob.size / 1024).toFixed(1)} KB)`, { id: toastId });
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
      // Re-pull item groups too — Excel import auto-creates any unknown
      // groups, and without this refresh those new groups don't appear in the
      // row's "Group" cell until the user reloads the page.
      fetchItemGroups();
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
    <div className="space-y-4" data-testid="items-page">
      <div className="flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30 bg-white py-2 border-b border-[#E5E7EB] -mx-6 px-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold font-[Chivo] text-[#111827]">Items & Parts</h1>
          </div>
          {/* Search + Category + Group inline with the header (single line). */}
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-2 py-1.5 border border-[#D1D5DB] rounded-sm text-xs w-full focus:outline-none focus:border-[#1D3557]"
              placeholder="Search part number / name…"
              data-testid="items-search-input"
            />
          </div>
          <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 h-8 text-xs" data-testid="items-category-filter">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-44">
            <Select value={groupFilter || 'all'} onValueChange={(v) => setGroupFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="items-group-filter">
                <Filter className="w-3 h-3 mr-1" />
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
            {groupFilter && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setGroupFilter(''); }}
                className="absolute right-7 top-1/2 -translate-y-1/2 p-0.5 text-[#9CA3AF] hover:text-[#9B1C1C] z-10"
                title="Clear group filter"
                data-testid="items-group-filter-clear"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {(categoryFilter || groupFilter) && (
            <button onClick={() => { setCategoryFilter(''); setGroupFilter(''); }} className="text-[10px] text-[#9B1C1C] hover:underline">Clear</button>
          )}
          <label className="flex items-center space-x-1 cursor-pointer text-xs text-[#111827]" title="Show only items at/below their reorder point">
            <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} className="rounded" data-testid="items-low-stock-filter" />
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-[#9B1C1C]" /> Low Stock Only
            </span>
          </label>
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
                <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-white border border-[#D1D5DB] rounded-sm shadow-lg py-1 max-h-[70vh] overflow-y-auto" data-testid="export-menu">
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
                  {itemGroups.length > 0 && (
                    <>
                      <div className="border-t border-[#E5E7EB] my-1" />
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold">Export by item group</div>
                      {itemGroups.map(g => (
                        <button
                          key={g.id}
                          onClick={() => handleExport('all', g.id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[#F3F4F6] flex items-center justify-between"
                          data-testid={`export-group-${g.code || g.id}`}
                        >
                          <span className="truncate">{g.name}{g.code ? ` (${g.code})` : ''}</span>
                          <Download className="w-3 h-3 text-[#6B7280] flex-shrink-0 ml-2" />
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          {canCreateItems && (
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
              // Two long-standing issues bite when the Item dialog closes:
              //   1) Radix Dialog occasionally leaves `pointer-events: none`
              //      on document.body if a state update happens during the
              //      close animation (e.g. a toast). Subsequent clicks/typing
              //      land on nothing. See radix-ui/primitives#1241.
              //   2) On the Windows desktop (Electron) build, OS focus
              //      doesn't reliably return to the webContents after the
              //      Radix focus-trap releases — inputs across the page
              //      silently swallow keystrokes until the user reopens
              //      the app.
              // The cleanup below addresses both: clear body styles + ping
              // the Electron main window to refocus. Safe no-op in the
              // browser preview.
              // Aggressive cleanup loop — Radix Dialog's close animation
              // runs ~300ms; during that window it can re-apply
              // pointer-events:none and aria-hidden if any state update
              // happens (toast, refetch, etc.). We run the cleanup 5 times
              // across the first 600ms so we catch every re-apply.
              const cleanupOnce = () => {
                try {
                  if (document.body.style.pointerEvents === 'none') document.body.style.pointerEvents = '';
                  if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
                  document.body.removeAttribute('aria-hidden');
                  document.body.removeAttribute('data-scroll-locked');
                  // Move focus to body so no orphan element holds keyboard focus.
                  if (document.activeElement && document.activeElement !== document.body) {
                    try { document.activeElement.blur(); } catch { /* noop */ }
                  }
                  document.body.focus({ preventScroll: true });
                } catch { /* noop */ }
              };
              [50, 150, 300, 450, 700].forEach(d => setTimeout(cleanupOnce, d));
            }
          }}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-item-btn">
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </DialogTrigger>
            <DialogContent
              className="max-w-2xl max-h-[90vh] overflow-y-auto"
              // Block Radix's default focus-restore on close. When the items
              // list refetches after Update Item, the trigger button (Edit
              // pencil in the row) may unmount before Radix tries to focus
              // it — leaving the page in a focus-trap limbo where every
              // input swallows keystrokes. `preventDefault` here tells Radix
              // not to restore focus at all; we manually refocus body /
              // electron main window in `onOpenChange`.
              onCloseAutoFocus={(e) => e.preventDefault()}
              onEscapeKeyDown={() => { /* default close handled by Radix */ }}
            >
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
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Unit of Measure <span className="text-[#9B1C1C]">*</span></label>
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
                    <div className="flex-1" data-testid="item-group-select">
                      {filteredGroupsForForm.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[#6B7280] border border-[#E5E7EB] rounded-sm bg-[#F9FAFB]">No groups defined — create one in Settings → Item Groups</div>
                      ) : (
                        <SearchableSelect
                          options={filteredGroupsForForm}
                          value={formData.group_id || ''}
                          onChange={(id) => setFormData({ ...formData, group_id: id || '' })}
                          getLabel={(g) => g.name}
                          getSecondary={(g) => [
                            g.parent_category ? g.parent_category.replace('_', ' ') : '',
                            g.default_hsn_code ? `HSN ${g.default_hsn_code}` : '',
                            g.default_gst_rate != null ? `${g.default_gst_rate}%` : '',
                          ].filter(Boolean).join(' · ')}
                          matchFields={['name', 'parent_category', 'default_hsn_code']}
                          placeholder="Search group (e.g. Motors, Bearings)…"
                          testId="item-group-search"
                        />
                      )}
                    </div>
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
                      {canViewPurchasePrice && (
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
                      )}
                      {canViewSalePrice && (
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
                      )}
                    </>
                  ) : (
                    canViewSalePrice && (
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
                    )
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
                    {(() => {
                      const childVariants = editingItem ? items.filter(it => it.is_variant && it.parent_item_id === editingItem.id) : [];
                      const hasVariants = childVariants.length > 0;
                      const consolidated = hasVariants
                        ? childVariants.reduce((s, v) => s + (Number(variantStockEdits[v.id] ?? v.current_stock) || 0), 0)
                        : null;
                      return (
                        <>
                          <label className="block text-sm font-semibold text-[#111827] mb-1">
                            Current Stock
                            {hasVariants && <span className="text-[10px] text-[#065F46] ml-1 font-normal">(Σ variants — readonly)</span>}
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={hasVariants ? consolidated : formData.current_stock}
                            onChange={(e) => !hasVariants && setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })}
                            readOnly={hasVariants}
                            className={`input-field mono ${hasVariants ? 'bg-[#F3F4F6] cursor-not-allowed text-[#374151]' : ''}`}
                            data-testid="item-current-stock-input"
                          />
                        </>
                      );
                    })()}
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

                {/* Per-variant stock editor — appears when editing a parent
                    item that already has generated variant children. Matches
                    the green block on the Inventory page so users see the
                    same UX in either place. */}
                {editingItem && (() => {
                  const childVariants = items.filter(it => it.is_variant && it.parent_item_id === editingItem.id);
                  if (!childVariants.length) return null;
                  const variantTotal = childVariants.reduce((s, v) => s + (Number(variantStockEdits[v.id] ?? v.current_stock) || 0), 0);
                  return (
                    <div className="border border-[#A7F3D0] bg-[#ECFDF5] rounded-sm p-3 space-y-2" data-testid="item-variant-stock-block">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-semibold text-[#065F46] uppercase tracking-wide">Variant Stock (Opening / Adjust)</div>
                        <span className="text-[10px] text-[#047857]">Total across variants: <strong className="mono">{formatQty(variantTotal, editingItem.unit_of_measure, uoms)}</strong></span>
                      </div>
                      <div className="bg-white border border-[#A7F3D0] rounded-sm overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-[#D1FAE5]">
                            <tr>
                              <th className="text-left px-2 py-1.5 font-semibold text-[#065F46]">Variant Part No</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-[#065F46]">Variant</th>
                              <th className="text-right px-2 py-1.5 font-semibold text-[#065F46] w-32">Current Stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {childVariants.map(v => {
                              const labels = Object.entries(v.variant_values || v.variant_short_codes || {}).map(([k, val]) => `${k}: ${val}`).join(' · ');
                              return (
                                <tr key={v.id} className="border-t border-[#D1FAE5]" data-testid={`item-variant-stock-row-${v.id}`}>
                                  <td className="px-2 py-1 mono text-[11px]">{v.part_number}</td>
                                  <td className="px-2 py-1 text-[11px] text-[#374151]">{labels || '-'}</td>
                                  <td className="px-2 py-1 text-right">
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={variantStockEdits[v.id] ?? 0}
                                      onChange={(e) => setVariantStockEdits(prev => ({ ...prev, [v.id]: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))}
                                      className="input-field mono text-right h-7 text-xs"
                                      data-testid={`item-variant-stock-input-${v.id}`}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-[#065F46]">Tip: variant stocks are tracked independently. Any change logs an "adjust" entry in stock transactions.</p>
                    </div>
                  );
                })()}

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

                {/* ====== Product Variants ====== */}
                {/* Editable: only for Component / Raw Material (the leaf items
                    whose physical variants drive parent BOMs).
                    Read-only inherited view: for Finished Good / Sub-Assembly
                    — variants flow up from their variant-bearing BOM components. */}
                {(formData.category === 'component' || formData.category === 'raw_material') && (
                  <div className="border border-[#FDE68A] rounded-sm bg-[#FFFBEB] px-3 py-2.5 space-y-2" data-testid="item-variant-attrs-block">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-[#723B13] uppercase tracking-wide">
                        Product Variants <span className="font-normal text-[#92400E]">(optional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, variant_attributes: [...(p.variant_attributes || []), { name: '', values: [] }] }))}
                        className="text-[10px] px-2 py-0.5 rounded border border-[#723B13] text-[#723B13] hover:bg-[#FEF3C7]"
                        data-testid="item-add-variant-attr"
                      >+ Add Attribute</button>
                    </div>
                    {(formData.variant_attributes || []).length === 0 ? (
                      <div className="text-[11px] text-[#9CA3AF] py-1 italic">No variants. Add an attribute (e.g. Grit Size) and its values (16GT, 24GT) to generate child SKUs.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {(formData.variant_attributes || []).map((attr, ai) => {
                          const updateAttr = (patch) => setFormData(p => {
                            const next = [...(p.variant_attributes || [])];
                            next[ai] = { ...next[ai], ...patch };
                            return { ...p, variant_attributes: next };
                          });
                          const updateVals = (newVals) => updateAttr({ values: newVals });
                          return (
                            <div key={ai} className="flex items-start gap-2 bg-white border border-[#FDE68A] rounded-sm px-2 py-1.5" data-testid={`item-variant-attr-row-${ai}`}>
                              <input
                                type="text"
                                placeholder="Attribute name (e.g. Motor Power)"
                                value={attr.name || ''}
                                onChange={(e) => updateAttr({ name: e.target.value })}
                                className="input-field text-xs flex-1"
                                data-testid={`item-variant-attr-name-${ai}`}
                              />
                              <div className="flex-1 flex items-center flex-wrap gap-1 px-1.5 py-1 bg-white border border-[#D1D5DB] rounded-sm min-h-[28px]">
                                {(attr.values || []).map((v, vi) => (
                                  <span key={vi} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#1D3557] text-white">
                                    {v.value}
                                    <input
                                      type="text"
                                      maxLength={4}
                                      minLength={4}
                                      value={v.short_code || ''}
                                      onChange={(e) => {
                                        const sc = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
                                        const newVals = (attr.values || []).map((x, j) => j === vi ? { ...x, short_code: sc } : x);
                                        updateVals(newVals);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className={`w-12 text-[9px] bg-white/20 text-white border ${(v.short_code || '').length === 4 ? 'border-transparent' : 'border-[#FECDD3]'} px-1 py-0 rounded outline-none placeholder-white/60 text-center`}
                                      title="Short code for SKU suffix (must be exactly 4 characters)"
                                      placeholder="CODE"
                                      data-testid={`item-variant-attr-shortcode-${ai}-${vi}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateVals((attr.values || []).filter((_, i) => i !== vi))}
                                      className="text-white hover:text-[#FECDD3]"
                                    >×</button>
                                  </span>
                                ))}
                                <input
                                  type="text"
                                  maxLength={4}
                                  placeholder={(attr.values || []).length === 0 ? '4-char value + Enter (e.g. 1HP1, 30GT)' : ''}
                                  onKeyDown={(e) => {
                                    if (e.key === ',' || e.key === 'Enter' || e.key === 'Tab') {
                                      // Enforce EXACTLY 4 characters — value AND short_code share
                                      // the same length so SKU suffixes are consistent.
                                      const raw = (e.currentTarget.value || '').trim().slice(0, 4);
                                      if (raw.length < 4) {
                                        if (raw.length > 0 && (e.key === ',' || e.key === 'Enter')) {
                                          e.preventDefault();
                                          // Show a brief title-tooltip via the title attribute on the parent
                                          // (toast feels heavy here). For now just refuse silently — the
                                          // maxLength + title hints already nudge the user.
                                        }
                                        return;
                                      }
                                      e.preventDefault();
                                      const cur = attr.values || [];
                                      if (!cur.find(x => x.value === raw)) {
                                        const sc = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
                                        updateVals([...cur, { value: raw, short_code: sc }]);
                                      }
                                      e.currentTarget.value = '';
                                    } else if (e.key === 'Backspace' && !e.currentTarget.value) {
                                      const cur = attr.values || [];
                                      if (cur.length > 0) updateVals(cur.slice(0, -1));
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const raw = (e.currentTarget.value || '').trim().slice(0, 4);
                                    const cur = attr.values || [];
                                    // Only commit when the value is the full 4 chars.
                                    if (raw.length === 4 && !cur.find(x => x.value === raw)) {
                                      const sc = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
                                      updateVals([...cur, { value: raw, short_code: sc }]);
                                    }
                                    e.currentTarget.value = '';
                                  }}
                                  className="flex-1 min-w-[120px] outline-none text-xs bg-transparent border-0 p-0"
                                  data-testid={`item-variant-attr-values-input-${ai}`}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => setFormData(p => ({ ...p, variant_attributes: (p.variant_attributes || []).filter((_, i) => i !== ai) }))}
                                className="text-[#9B1C1C] hover:bg-[#FDE8E8] rounded px-1"
                                data-testid={`item-variant-attr-remove-${ai}`}
                                title="Remove attribute"
                              ><X className="w-3.5 h-3.5" /></button>
                            </div>
                          );
                        })}
                        {/* "Generate Variant Items" button removed per user
                            request — Update Item already creates / prunes
                            variants atomically via the auto-generate hook
                            in handleSubmit. Keeping a separate button was
                            the source of the recurring "can't type" focus
                            bug, so the cleaner UX is to let the standard
                            Save flow do everything. */}
                        {(formData.variant_attributes || []).some(a => (a.values || []).length > 0) && (
                          <div className="pt-1.5 border-t border-[#FDE68A] text-[10px] text-[#92400E]">
                            <span className="font-semibold">Tip:</span> click <span className="font-semibold">{editingItem ? 'Update Item' : 'Add Item'}</span> to save — variant SKUs (e.g. <span className="mono">{formData.part_number || 'FG-001'}-1HP1-220V</span>) are created automatically for every combination.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ====== Inherited Variants (FG / SG — read-only) ====== */}
                {(formData.category === 'finished_good' || formData.category === 'sub_assembly') && editingItem && (
                  <div className="border border-[#FDE68A] rounded-sm bg-[#FFFBEB] px-3 py-2.5 space-y-2" data-testid="item-inherited-variants-block">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-[#723B13] uppercase tracking-wide">
                        Product Variants
                        <span className="ml-1 font-normal text-[#92400E]">
                          ({inheritedSource === 'own' ? 'legacy — defined on this item' : 'inherited from BOM components — read-only'})
                        </span>
                      </label>
                      {inheritedVariants.length > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              // Save full form first so description/name/etc edits propagate
                              // to newly-generated variant children (which copy from parent).
                              await persistParentForGenerate();
                              const { data: preview } = await api.post(`/api/items/${editingItem.id}/preview-variants`);
                              const total = preview.combinations.length;
                              const sample = preview.combinations.slice(0, 6).map(r => `  • ${r.sku} — ${r.label}${r.exists ? ' (exists)' : ' (NEW)'}`).join('\n');
                              const more = total > 6 ? `\n  …and ${total - 6} more` : '';
                              if (window.confirm(`Generate ${total} variant${total > 1 ? 's' : ''}?\n\n${preview.existing_count} already exist, ${preview.new_count} would be created.\n\n${sample}${more}\n\nClick OK to proceed (all combinations).`)) {
                                const { data: result } = await api.post(`/api/items/${editingItem.id}/generate-variants`, {});
                                toast.success(result.message);
                                // Auto-close — same focus-trap defence as the
                                // removed CP/RM button.
                                setIsDialogOpen(false);
                                setEditingItem(null);
                                resetForm();
                                fetchItems().catch(() => {});
                              }
                            } catch (err) {
                              toast.error(err.response?.data?.detail || 'Failed to generate variants');
                            }
                          }}
                          className="text-[10px] px-2 py-0.5 rounded border border-[#723B13] text-[#723B13] hover:bg-[#FEF3C7] font-semibold"
                          data-testid="item-generate-variants-from-inherited-btn"
                        >Generate FG Variant SKUs</button>
                      )}
                    </div>
                    {inheritedVariants.length === 0 ? (
                      <div className="text-[11px] text-[#9CA3AF] py-1 italic">No variants found. Variants flow up from BOM components that have their own variants — define them on the Component / Raw Material items.</div>
                    ) : (
                      <div className="space-y-1">
                        {inheritedVariants.map((attr, ai) => (
                          <div key={ai} className="flex items-center gap-2 bg-white border border-[#FDE68A] rounded-sm px-2 py-1.5" data-testid={`item-inherited-variant-row-${ai}`}>
                            <span className="text-xs font-semibold text-[#374151] w-40 truncate" title={attr.name}>{attr.name}</span>
                            <div className="flex flex-wrap gap-1 flex-1">
                              {(attr.values || []).map((v, vi) => (
                                <span key={vi} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#1D3557] text-white">{v.value || v}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="text-[10px] text-[#92400E] pt-1">Producing this item with a variant selection (in MO/SO) will save stock against the variant SKU (e.g. <span className="mono">{formData.part_number || 'FG-1'}-16GT</span>).</div>
                      </div>
                    )}
                  </div>
                )}

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
                  <th style={{ minWidth: '180px' }}>Group</th>
                  <th>HSN</th>
                  <th className="text-right">GST%</th>
                  <th className="text-right" style={{ minWidth: '220px' }}>Stock</th>
                  <th className="text-right">Unit Cost</th>
                  {canViewPurchasePrice && <th className="text-right" data-testid="items-th-purchase-price">Purchase Price</th>}
                  {canViewSalePrice && <th className="text-right" data-testid="items-th-sale-price">Sale Price</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Variants rollup pre-computed via useMemo (cached on `items`)
                  // — was running on every render which made BOM → Items
                  // navigation jank for ~600 items.
                  const { variantsByParent, baseItems } = variantsRollup;
                  // Apply Low Stock filter — item itself OR any of its variant
                  // children sitting at/below their reorder point qualifies.
                  const filteredItems = lowStockOnly
                    ? baseItems.filter(it => {
                        const selfLow = (parseFloat(it.current_stock) || 0) <= (parseFloat(it.reorder_point) || 0);
                        const variants = variantsByParent[it.id] || [];
                        const anyVariantLow = variants.some(v => (parseFloat(v.current_stock) || 0) <= (parseFloat(v.reorder_point) || 0));
                        return selfLow || anyVariantLow;
                      })
                    : baseItems;
                  // Apply Part Number sort (case-insensitive, natural-ish via localeCompare with numeric=true)
                  const sortedItems = partNumberSort
                    ? [...filteredItems].sort((a, b) => {
                        const ax = (a.part_number || '').toLowerCase();
                        const bx = (b.part_number || '').toLowerCase();
                        const cmp = ax.localeCompare(bx, undefined, { numeric: true, sensitivity: 'base' });
                        return partNumberSort === 'asc' ? cmp : -cmp;
                      })
                    : filteredItems;
                  return sortedItems.slice(0, visibleCount).map((item) => {
                  const itemGroup = itemGroups.find(g => g.id === item.group_id);
                  const variants = variantsByParent[item.id] || [];
                  const variantTotal = variants.reduce((s, v) => s + (parseFloat(v.current_stock) || 0), 0);
                  // When a parent has variant children, the parent's own
                  // current_stock is ignored — variants are the single source
                  // of truth. (Backend's generate-variants endpoint also
                  // zeroes the parent after first variant creation so this
                  // is just defensive on the UI side for stale data.)
                  const totalStock = variants.length > 0 ? variantTotal : (parseFloat(item.current_stock) || 0);
                  return (
                  <tr key={item.id} className={isLowStock(item) ? 'bg-[#FDE8E8]/30' : ''} data-testid={`item-row-${item.part_number}`}>
                    <td className="mono font-medium">{item.part_number}</td>
                    <td>
                      <div className="flex items-center space-x-2">
                        {isLowStock(item) && <AlertTriangle className="w-4 h-4 text-[#9B1C1C]" />}
                        <span>{item.name}</span>
                      </div>
                    </td>
                    <td className="text-sm">
                      {itemGroup ? (
                        <span className="px-2 py-0.5 bg-[#EEF2FF] text-[#3730A3] rounded-sm text-xs font-medium">{itemGroup.name}</span>
                      ) : <span className="text-[#9CA3AF]">-</span>}
                    </td>
                    <td className="mono text-sm">{item.hsn_code || '-'}</td>
                    <td className="text-right mono">{item.gst_rate != null ? `${item.gst_rate}%` : '-'}</td>
                    <td className="text-right mono" style={{ minWidth: '220px' }}>
                      {formatQty(totalStock, item.unit_of_measure, uoms)} {item.unit_of_measure}
                      {variants.length > 0 && (
                        <div className="mt-1 space-y-0.5 text-[10px] font-normal" data-testid={`item-variant-stock-${item.part_number}`}>
                          {variants.map(v => {
                            const suffix = (v.part_number || '').startsWith(item.part_number + '-')
                              ? v.part_number.slice(item.part_number.length + 1)
                              : v.part_number;
                            const vStock = parseFloat(v.current_stock) || 0;
                            // Stock health colour for the variant row:
                            //   * Zero stock         → maroon  (#7F1D1D)
                            //   * Any positive stock → green   (#15803D)
                            const cls = vStock === 0 ? 'text-[#7F1D1D]' : 'text-[#15803D]';
                            return (
                              <div key={v.id} className={`flex items-center justify-end gap-1 ${cls}`}>
                                <span className="mono text-[10px] font-semibold">{suffix}:</span>
                                <span className="mono text-[10px] font-semibold">{formatQty(vStock, v.unit_of_measure, uoms)} {v.unit_of_measure}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="text-right mono">{formatCurrency(item.unit_cost)}</td>
                    {canViewPurchasePrice && (
                      <td className="text-right mono" data-testid={`item-purchase-price-${item.part_number}`}>
                        {item.category === 'raw_material' && item.purchase_price ? formatCurrency(item.purchase_price) : <span className="text-[#9CA3AF]">-</span>}
                      </td>
                    )}
                    {canViewSalePrice && (
                      <td className="text-right mono" data-testid={`item-sale-price-${item.part_number}`}>
                        {item.sale_price ? formatCurrency(item.sale_price) : <span className="text-[#9CA3AF]">-</span>}
                      </td>
                    )}
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
