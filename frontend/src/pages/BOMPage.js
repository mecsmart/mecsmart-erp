import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { letterheadCSS, buildLetterheadHTML } from '../utils/printHeader';
import { formatQty } from '../utils/uomFormat';
import { downloadHtmlAsPdf } from '../utils/pdfPrint';
import { fmtAmt } from '../utils/numberFormat';
import { ItemHoverCard } from '../components/ItemHoverCard';
import { 
  Plus, 
  FileStack, 
  ChevronRight,
  ChevronDown,
  Edit2, 
  Trash2,
  Copy,
  Eye,
  X,
  GitBranch,
  AlertCircle,
  Download,
  Upload,
  RefreshCw,
  Search,
  Printer
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { SearchableItemSelect } from '../components/SearchableItemSelect';
import { toast } from 'sonner';

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'obsolete', label: 'Obsolete' },
];

export default function BOMPage() {
  const { user, hasPermission } = useAuth();
  const { formatCurrency, currencySymbol, companySettings } = useCompanySettings();
  // Cost visibility — TWO independent permissions:
  //   • `bom_process_cost.view`  → user sees PROCESS-cost columns/tags (per-row
  //     process cost, FG Process tag, routing cost parentheticals).
  //   • `bom_rollup_cost.view`   → user sees ROLLUP/material/total cost columns
  //     and the bottom-line "Total Cost" summary.
  // Admins / admin role-groups always see both.
  const isAdminLike = user?.role === 'admin' || user?.is_admin_group === true;
  const canSeeProcessCost = isAdminLike || hasPermission('bom_process_cost', 'view');
  const canSeeRollupCost = isAdminLike || hasPermission('bom_rollup_cost', 'view');
  const [boms, setBoms] = useState([]);
  const [items, setItems] = useState([]);
  const [uoms, setUoms] = useState([]);
  // Sentinel for auto-scrolling to the bottom of the components list after
  // adding a new row inside the BOM creation/edit dialog.
  const componentsEndRef = useRef(null);
  // Direct ref to the Dialog's scroll container — addComponent() falls back to
  // hard-scrolling this element to the very bottom if scrollIntoView under-shoots
  // (Radix Dialog content sometimes computes layout before the new row mounts).
  const dialogScrollRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBom, setEditingBom] = useState(null);
  // Stack of parent BOM edit contexts. When the user clicks "Edit <child> BOM"
  // from inside an open BOM edit dialog, we push the current {bom, formData}
  // here, then load the child BOM into the SAME dialog (no close/reopen flicker).
  // When the child save/cancel completes we pop the stack and restore the parent's
  // editing state, so the user lands back on the parent BOM edit screen.
  const [bomEditStack, setBomEditStack] = useState([]);
  const [viewBom, setViewBom] = useState(null);
  const [bomExplosion, setBomExplosion] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  // Top-level BOM panels: collapsed by default for ALL parent categories (FG, SG, CP, RM).
  // Stores `true` for explicitly-EXPANDED panels; missing key === collapsed.
  const [expandedBomPanels, setExpandedBomPanels] = useState({});
  const [allExplosions, setAllExplosions] = useState({});
  const [bomSearch, setBomSearch] = useState('');

  // Deep-link: dashboard quick action sends ?action=new to open Create dialog.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new' && (user?.role === 'admin' || (user?.permissions?.bom || []).includes('create'))) {
      setEditingBom(null);
      setIsDialogOpen(true);
      navigate('/bom', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  
  const [formData, setFormData] = useState({
    parent_item_id: '',
    name: '',
    description: '',
    revision: 'A',
    status: 'draft',
    effectivity_date: '',
    components: [],
    parent_routings: [],
  });

  // Phase 2 — variant attributes for the parent FG/SG item.
  // Edited inline in the BOM dialog. Persisted to the parent item via PUT /api/items/{id}.
  const [parentVariantAttrs, setParentVariantAttrs] = useState([]);  // [{name, values: []}]
  // Per-component breakdown (only used by the read-only BOM dialog block so
  // the user can see WHICH component contributes which axis when multiple
  // components are variant-bearing on different axes).
  const [parentVariantSources, setParentVariantSources] = useState([]);
  const [appliesToDialog, setAppliesToDialog] = useState({ open: false, componentIdx: -1 });

  // Permission gating — always trust the granular permissions object (falls
  // back to the legacy role list only when the user has NO permissions map set,
  // so seed/admin still works).
  const isAdmin = user?.role === 'admin' || user?.is_admin_group;
  const canCreate = hasPermission ? hasPermission('bom', 'create') : isAdmin;
  const canEdit = (hasPermission ? hasPermission('bom', 'edit') : false) || canCreate;
  const canDelete = (hasPermission ? hasPermission('bom', 'delete') : false) || isAdmin;
  const [routingOptions, setRoutingOptions] = useState([]);

  // AbortController scoped to the BOM page lifecycle. Cancels the background
  // /explode flood when the user navigates away — otherwise hundreds of
  // in-flight requests saturate the network and the next page (e.g. Items)
  // waits in line for its /api/items?lite=1 call. Recreated on each
  // statusFilter change so a refilter still works.
  const fetchAbortRef = useRef(null);

  useEffect(() => {
    // Abort any prior background fetches when statusFilter changes OR unmount.
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = new AbortController();
    fetchBoms();
    fetchItems();
    fetchRoutings();
    return () => {
      // On unmount (navigation away), kill all in-flight explosion calls.
      fetchAbortRef.current?.abort();
    };
  }, [statusFilter]);

  // Lazy-load explosion data for a single BOM (used by inline rollup cost,
  // panel expansion, and the Print button). Caches in `allExplosions` so
  // repeated views don't refetch.
  const ensureExplosion = async (bomId) => {
    if (!bomId) return null;
    if (allExplosions[bomId]) return allExplosions[bomId];
    try {
      const { data } = await api.get(`/api/bom/${bomId}/explode`);
      setAllExplosions(prev => ({ ...prev, [bomId]: data }));
      return data;
    } catch {
      const empty = { explosion: [], total_rollup_cost: 0 };
      setAllExplosions(prev => ({ ...prev, [bomId]: empty }));
      return empty;
    }
  };

  const fetchRoutings = async () => {
    try {
      const { data } = await api.get('/api/routings?status=active');
      setRoutingOptions(data);
    } catch (e) { console.error('Failed to fetch routings:', e); }
  };

  const fetchBoms = async ({ skipExplosions = false } = {}) => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const signal = fetchAbortRef.current?.signal;
      const { data } = await api.get(`/api/bom${params}`, { signal });
      setBoms(data);
      setLoading(false); // Show the table immediately — don't block on explosions

      if (skipExplosions) return;

      // Background-load explosions for every active BOM so inline rollup +
      // process-cost tags appear on each panel header without the user
      // having to expand it. We cap concurrency with a sliding window
      // (`MAX_PARALLEL` simultaneous in-flight requests) and update state
      // as soon as EACH response arrives — UI fills in row-by-row instead of
      // chunk-by-chunk, so the user sees progress immediately.
      // Workers abort early if the AbortController has been triggered (user
      // navigated away), so the next page's API calls aren't blocked behind
      // a flood of stale explosion calls.
      const activeBoms = data.filter(b => b.status === 'active');
      const MAX_PARALLEL = 8;
      let cursor = 0;
      const explosions = {};
      const runOne = async () => {
        while (cursor < activeBoms.length) {
          if (signal?.aborted) return;
          const idx = cursor++;
          const bom = activeBoms[idx];
          try {
            const { data: expData } = await api.get(`/api/bom/${bom.id}/explode`, { signal });
            explosions[bom.id] = expData;
          } catch (e) {
            if (signal?.aborted || e?.code === 'ERR_CANCELED') return; // Bail entire worker.
            explosions[bom.id] = { explosion: [], total_rollup_cost: 0 };
          }
          if (signal?.aborted) return;
          // Flush per-BOM so inline costs paint as soon as the response
          // lands instead of waiting for the whole chunk to settle.
          setAllExplosions(prev => ({ ...prev, [bom.id]: explosions[bom.id] }));
        }
      };
      const workers = Array.from({ length: Math.min(MAX_PARALLEL, activeBoms.length) }, runOne);
      // Don't await — let workers run in the background while the user
      // interacts with the page. Errors are already swallowed inside runOne.
      Promise.all(workers).catch(() => {});
    } catch (error) {
      if (error?.code === 'ERR_CANCELED') return;
      console.error('Failed to fetch BOMs:', error);
      setLoading(false);
    }
  };

  // After-save reload: only refresh the BOM list and trigger explosions in the
  // background. The previous flow awaited every active BOM's /explode call
  // before resolving — turning a save into a multi-second wait when the list
  // grew. Now save returns instantly and explosions populate in the
  // background, mirroring the table's natural lazy fetch behavior.
  const reloadBomsBackground = async () => {
    await fetchBoms({ skipExplosions: true });
    // Defer explosion refresh — they update the inline rollup costs only.
    setTimeout(() => { fetchBoms().catch(() => {}); }, 0);
  };

  const fetchItems = async () => {
    try {
      // `lite=1` returns only picker-relevant fields → 3–5x smaller payload on
      // large catalogues. Speeds up BOM dialog open from seconds → ms.
      const { data } = await api.get('/api/items?lite=1');
      setItems(data);
      // UOM master needed to honor decimal places when displaying quantities.
      try {
        const { data: u } = await api.get('/api/settings/uoms');
        setUoms(u || []);
      } catch (_e) { /* non-fatal */ }
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  };

  const fetchBomExplosion = async (bomId) => {
    try {
      const { data } = await api.get(`/api/bom/${bomId}/explode`);
      setBomExplosion(data);
      setExpandedItems({});
    } catch (error) {
      console.error('Failed to fetch BOM explosion:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ── Pre-flight validation (visible via toast, NOT silent alert) ──
    if (!formData.parent_item_id) {
      toast.error('Please select a Parent Item before saving the BOM.');
      return;
    }
    if (!formData.name?.trim()) {
      toast.error('BOM Name is required.');
      return;
    }
    // Make sure the selected parent_item_id actually exists in the items list.
    // (Guards against stale/orphan ids if the items cache was out of sync.)
    const parentExists = items.some(i => i.id === formData.parent_item_id);
    if (!parentExists) {
      toast.error('Selected parent item is no longer available. Please pick again.');
      setFormData(fd => ({ ...fd, parent_item_id: '' }));
      return;
    }

    const toastId = toast.loading(editingBom ? 'Updating BOM…' : 'Creating BOM…');
    try {
      const payload = {
        ...formData,
        effectivity_date: formData.effectivity_date ? new Date(formData.effectivity_date).toISOString() : null,
      };
      // Ensure components have routings field
      if (payload.components) {
        payload.components = payload.components.map(c => ({
          ...c,
          routings: c.routings || [],
        }));
      }

      // Auto-merge duplicate components as a final safety net before send.
      // Same logic as `mergeDuplicateComponents` above (we re-run it here
      // since the user may have added more duplicates AFTER opening the
      // dialog and the load-time merge ran).
      if (payload.components && payload.components.length > 0) {
        const before = payload.components.length;
        payload.components = mergeDuplicateComponents(payload.components);
        const after = payload.components.length;
        if (after < before) {
          toast.message(`Merged ${before - after} duplicate component row${before - after === 1 ? '' : 's'} (quantities summed).`);
        }
      }

      // Variant attributes are now managed exclusively on the Item itself
      // (see ItemsPage variant block). BOM Save no longer touches the parent
      // item's variant_attributes, so opening a BOM and saving never clobbers
      // variants the user defined in the Item dialog.
      const promises = [];
      if (editingBom) {
        promises.push(api.put(`/api/bom/${editingBom.id}`, payload));
      } else {
        promises.push(api.post('/api/bom', payload));
      }
      await Promise.all(promises);
      toast.success(`BOM "${payload.name}" ${editingBom ? 'updated' : 'created'}`, { id: toastId });
      // If the user was editing a child BOM (via the "Edit <child> BOM" button
      // inside a parent edit), pop the stack and restore the parent's edit
      // state — keeping the dialog open. Only when the stack is empty do we
      // actually close the dialog.
      // Background refresh — don't block the dialog close.
      reloadBomsBackground().catch(() => {});
      // Refresh items in the BACKGROUND (non-blocking) so the dialog closes immediately.
      // The next time a BOM is edited, items will already be fresh.
      fetchItems().catch(() => {});
      if (bomEditStack.length > 0) {
        const parent = bomEditStack[bomEditStack.length - 1];
        setBomEditStack(s => s.slice(0, -1));
        setEditingBom(parent.bom);
        setFormData(parent.formData);
      } else {
        setIsDialogOpen(false);
        setEditingBom(null);
        resetForm();
      }
      if (viewBom?.id) {
        await fetchBomExplosion(viewBom.id);
      }
    } catch (error) {
      console.error('Failed to save BOM:', error?.response?.data || error);
      const detail = error?.response?.data?.detail || error?.response?.data || error?.message || 'Unknown error';
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      toast.error(`Failed to save BOM: ${msg}`, { id: toastId, duration: 8000 });
    }
  };

  // Sort BOM components for the edit dialog: SG → CP → RM, then numeric part_number.
  // This mirrors the explosion-table sort so the user sees a consistent ordering
  // when they expand a BOM panel and when they edit it. Components without a
  // resolved item (newly added empty rows) sink to the bottom.
  const sortBomComponentsForEdit = (components, itemMaster) => {
    const cat = { sub_assembly: 0, component: 1, raw_material: 2 };
    const lookup = new Map((itemMaster || []).map(i => [i.id, i]));
    return [...(components || [])].sort((a, b) => {
      const ia = lookup.get(a.item_id);
      const ib = lookup.get(b.item_id);
      // Empty rows always last, preserving relative order
      if (!ia && !ib) return 0;
      if (!ia) return 1;
      if (!ib) return -1;
      const ra = (cat[ia.category] === undefined) ? 99 : cat[ia.category];
      const rb = (cat[ib.category] === undefined) ? 99 : cat[ib.category];
      if (ra !== rb) return ra - rb;
      return (ia.part_number || '').localeCompare(
        ib.part_number || '',
        undefined,
        { numeric: true, sensitivity: 'base' }
      );
    });
  };

  // ── Shared "merge duplicate components" helper ────────────────────────
  // Returns a new array where rows with identical (item_id + is_alternate)
  // are collapsed into a single line and quantities are SUMMED. Routings
  // from each duplicate are unioned (de-duped by id). Used by both:
  //   • handleEdit (auto-clean on dialog open so the user sees a tidy list
  //     even for legacy BOMs that were saved before this client check)
  //   • handleSubmit (safety net before sending to the server)
  // We keep alternate components separate from primaries because they serve
  // different supply roles (`is_alternate=true` vs `false`).
  const mergeDuplicateComponents = (components) => {
    if (!components || components.length === 0) return components || [];
    const merged = new Map();
    for (const c of components) {
      if (!c.item_id) { continue; }
      const key = `${c.item_id}__${c.is_alternate ? 1 : 0}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity = (Number(existing.quantity) || 0) + (Number(c.quantity) || 0);
        const seen = new Set((existing.routings || []).map(r => r?.id || r?.routing_id || r));
        for (const r of (c.routings || [])) {
          const rid = r?.id || r?.routing_id || r;
          if (!seen.has(rid)) { existing.routings.push(r); seen.add(rid); }
        }
      } else {
        merged.set(key, { ...c, routings: [...(c.routings || [])] });
      }
    }
    return Array.from(merged.values());
  };

  const handleEdit = (bom) => {
    setEditingBom(bom);
    // Auto-merge duplicates the moment we open an existing BOM for edit so
    // legacy data created before client-side de-dupe was added gets cleaned
    // immediately. Saving the form persists the merged set.
    const sorted = sortBomComponentsForEdit(bom.components || [], items);
    const beforeCount = sorted.length;
    const cleaned = mergeDuplicateComponents(sorted);
    if (cleaned.length < beforeCount) {
      toast.message(`Merged ${beforeCount - cleaned.length} duplicate component row${beforeCount - cleaned.length === 1 ? '' : 's'} found in this BOM. Click Save to persist.`);
    }
    setFormData({
      parent_item_id: bom.parent_item_id,
      name: bom.name,
      description: bom.description || '',
      revision: bom.revision,
      status: bom.status,
      effectivity_date: bom.effectivity_date ? bom.effectivity_date.split('T')[0] : '',
      components: cleaned,
      parent_routings: bom.parent_routings || [],
    });
    // Load EFFECTIVE variants for display — own (legacy) for CP/RM items,
    // INHERITED (union from variant-bearing BOM components) for FG/SG.
    (async () => {
      try {
        const { data } = await api.get(`/api/items/${bom.parent_item_id}/effective-variants`);
        setParentVariantAttrs(data?.variant_attributes || []);
        setParentVariantSources(data?.variant_sources || []);
      } catch {
        const parentItem = items.find(it => it.id === bom.parent_item_id);
        setParentVariantAttrs(parentItem?.variant_attributes || []);
        setParentVariantSources([]);
      }
    })();
    setIsDialogOpen(true);
  };

  const handleView = async (bom) => {
    setViewBom(bom);
    await fetchBomExplosion(bom.id);
  };

  const handleRevise = async (bom) => {
    const newRevision = prompt('Enter new revision (e.g., B, C, D):', 
      String.fromCharCode(bom.revision.charCodeAt(0) + 1));
    if (!newRevision) return;
    
    try {
      await api.post(`/api/bom/${bom.id}/revise?new_revision=${newRevision}`);
      fetchBoms();
    } catch (error) {
      console.error('Failed to revise BOM:', error);
      alert(error.response?.data?.detail || 'Failed to create revision');
    }
  };

  const handleDelete = async (bom) => {
    if (!window.confirm(`Delete BOM "${bom.name}"?`)) return;
    try {
      await api.delete(`/api/bom/${bom.id}`);
      fetchBoms();
    } catch (error) {
      console.error('Failed to delete BOM:', error);
      alert(error.response?.data?.detail || 'Failed to delete BOM');
    }
  };

  const addComponent = () => {
    setFormData((fd) => ({
      ...fd,
      components: [...fd.components, { item_id: '', quantity: 1, unit_of_measure: 'pcs', is_alternate: false, routings: [] }],
    }));
    // After the new row mounts, scroll the Dialog so the new component sits
    // near the TOP of the visible area — that way the 500px breathing-room
    // spacer below it stays fully visible, giving the search dropdown its
    // promised room. (Previously we scrolled to the absolute bottom, which
    // squashed the new row's available dropdown space.)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Find the newly-mounted last component row by data-testid pattern.
        const scrollEl = dialogScrollRef.current;
        if (!scrollEl) return;
        const rows = scrollEl.querySelectorAll('[data-testid^="component-item-select-"]');
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
          // Position the new row ~80px from the top of the dialog viewport
          // (leaves the dialog header / sticky top untouched, but the row
          // itself + ALL 500px of bottom space stays below the fold).
          const rowTop = lastRow.getBoundingClientRect().top;
          const dialogTop = scrollEl.getBoundingClientRect().top;
          scrollEl.scrollBy({ top: rowTop - dialogTop - 80, behavior: 'smooth' });
        } else if (componentsEndRef.current) {
          componentsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      });
    });
  };

  const removeComponent = (index) => {
    setFormData({
      ...formData,
      components: formData.components.filter((_, i) => i !== index),
    });
  };

  const updateComponent = (index, field, value) => {
    const newComponents = [...formData.components];
    newComponents[index] = { ...newComponents[index], [field]: value };
    setFormData({ ...formData, components: newComponents });
  };

  const bomFileRef = useRef(null);
  const [bomImporting, setBomImporting] = useState(false);

  const handleBomExport = async (bomId = null) => {
    const apiUrl = api.defaults.baseURL || process.env.REACT_APP_BACKEND_URL || '';
    const url = bomId ? `/api/bom/export/excel?bom_id=${bomId}` : '/api/bom/export/excel';
    const directUrl = `${apiUrl}${url}`;
    const toastId = toast.loading(bomId ? 'Opening BOM export…' : 'Opening all BOMs export…');
    try {
      const topWin = window.top || window;
      const popup = topWin.open(directUrl, '_blank', 'noopener,noreferrer');
      if (!popup) {
        console.warn('[BOM Export] popup blocked, falling back to hidden iframe');
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = directUrl;
        document.body.appendChild(iframe);
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* noop */ } }, 10000);
        toast.success('BOM download triggered — check your browser downloads', { id: toastId, duration: 4000 });
        return;
      }
      toast.success('BOM export started — check your browser downloads', { id: toastId, duration: 4000 });
    } catch (err) {
      console.error('[BOM Export] direct open failed, falling back to blob', err);
      try {
        const response = await api.get(url, { responseType: 'blob' });
        if (!response.data || response.data.size === 0) {
          toast.error('Export returned an empty file', { id: toastId });
          return;
        }
        const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const filename = bomId ? `bom_${bomId.slice(0,8)}.xlsx` : 'bom_data.xlsx';
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        setTimeout(() => { try { document.body.removeChild(link); } catch { /* noop */ } }, 100);
        setTimeout(() => { try { window.URL.revokeObjectURL(blobUrl); } catch { /* noop */ } }, 5000);
        toast.success(`BOM exported (${(blob.size / 1024).toFixed(1)} KB)`, { id: toastId });
      } catch (blobErr) {
        const msg = blobErr?.response?.data?.detail || blobErr?.message || 'Network/server error';
        toast.error(`BOM export failed: ${msg}`, { id: toastId });
        console.error('BOM export error:', blobErr);
      }
    }
  };

  const handleBomImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBomImporting(true);
    const toastId = toast.loading(`Importing ${file.name}…`);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/api/bom/import/excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const created = data.created || 0, updated = data.updated || 0, errCount = data.errors?.length || 0;
      if (errCount > 0) {
        toast.warning(`BOM import partial: ${created} created, ${updated} updated, ${errCount} errors (see console)`, { id: toastId, duration: 8000 });
        console.warn('BOM import errors:', data.errors);
      } else {
        toast.success(`BOM import complete: ${created} created, ${updated} updated`, { id: toastId });
      }
      fetchBoms();
    } catch (error) {
      const msg = error?.response?.data?.detail || error?.message || 'Network/server error';
      toast.error(`BOM import failed: ${msg}`, { id: toastId });
      console.error('BOM import error:', error);
    } finally {
      setBomImporting(false);
      if (bomFileRef.current) bomFileRef.current.value = '';
    }
  };

  const resetForm = () => {
    setFormData({
      parent_item_id: '',
      name: '',
      description: '',
      revision: 'A',
      status: 'draft',
      effectivity_date: '',
      components: [],
      parent_routings: [],
    });
    setParentVariantAttrs([]);
    setParentVariantSources([]);
  };

  const toggleExpanded = (key) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const printBomExplosion = (parentItem, explosion, totalCost, bomInfo, fgProcessCost = 0, componentsCost = 0) => {
    const catLabel = (cat) => cat === 'finished_good' ? 'FG' : cat === 'sub_assembly' ? 'SG' : cat === 'raw_material' ? 'RM' : cat === 'component' ? 'CP' : 'PT';
    // Same sibling sort the on-screen table uses (SG → CP → RM, then numeric
    // part_number) so the printed PDF matches what the user sees.
    const printCatOrder = { sub_assembly: 0, component: 1, raw_material: 2 };
    const sortPrintSiblings = (nodes) => {
      const arr = [...(nodes || [])];
      arr.sort((a, b) => {
        const ca = printCatOrder[a.item?.category];
        const cb = printCatOrder[b.item?.category];
        const ra = (ca === undefined) ? 99 : ca;
        const rb = (cb === undefined) ? 99 : cb;
        if (ra !== rb) return ra - rb;
        return (a.item?.part_number || '').localeCompare(
          b.item?.part_number || '',
          undefined,
          { numeric: true, sensitivity: 'base' }
        );
      });
      return arr;
    };
    // Sibling merge — same logic as the on-screen explosion view, applied
    // to the PDF print HTML so duplicate rows (legacy BOMs saved before
    // de-dupe) appear merged in the printout instead of repeating.
    const mergePrintSiblings = (nodes) => {
      if (!nodes || nodes.length === 0) return nodes || [];
      const map = new Map();
      const order = [];
      for (const n of nodes) {
        const itemId = n.item?.id || n.item_id || (n.item?.part_number || '');
        const key = `${itemId}__${n.is_alternate ? 1 : 0}`;
        if (!map.has(key)) {
          map.set(key, { ...n, quantity: Number(n.quantity || 0), extended_cost: Number(n.extended_cost || 0), routings: [...(n.routings || [])], children: [...(n.children || [])] });
          order.push(key);
        } else {
          const ex = map.get(key);
          ex.quantity = (Number(ex.quantity) || 0) + Number(n.quantity || 0);
          ex.extended_cost = (Number(ex.extended_cost) || 0) + Number(n.extended_cost || 0);
          const seen = new Set((ex.routings || []).map(r => `${r?.name}|${r?.cost}`));
          for (const r of (n.routings || [])) {
            const rk = `${r?.name}|${r?.cost}`;
            if (!seen.has(rk)) { ex.routings.push(r); seen.add(rk); }
          }
          ex.children = [...(ex.children || []), ...(n.children || [])];
        }
      }
      return order.map(k => {
        const m = map.get(k);
        m.children = mergePrintSiblings(m.children || []);
        return m;
      });
    };

    const renderPrintRows = (nodes, level = 0) => {
      let html = '';
      sortPrintSiblings(mergePrintSiblings(nodes)).forEach((node, idx) => {
        const item = node.item || {};
        const indent = level * 20;
        const bgColor = item.category === 'sub_assembly' ? '#FEF3C7' : item.category === 'raw_material' ? '#DBEAFE' : item.category === 'component' ? '#FEE2E2' : '#F3F4F6';
        const routingsText = (node.routings || []).map(r => {
          const n = typeof r === 'string' ? r : r.name;
          const c = typeof r === 'string' ? 0 : (r.cost || 0);
          return canSeeProcessCost && c > 0 ? `${n} (${fmtAmt(c)})` : n;
        }).join(', ') || '-';
        html += `<tr style="background:${bgColor}">
          <td style="padding:4px 8px;padding-left:${indent + 8}px;font-size:10px;font-weight:600;">${catLabel(item.category || '')}</td>
          <td style="padding:4px 8px;font-family:monospace;font-size:11px;">${item.part_number || '-'}</td>
          <td style="padding:4px 8px;font-size:11px;">${item.name || '-'}${node.is_alternate ? ' (alt)' : ''}</td>
          <td style="padding:4px 8px;font-size:10px;color:#1E429F;">${routingsText}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px;">${node.quantity}</td>
          <td style="padding:4px 8px;font-size:11px;">${item.unit_of_measure || '-'}</td>
          ${canSeeRollupCost ? `<td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px;">${node.unit_cost != null ? fmtAmt(node.unit_cost) : '-'}</td>` : ''}
          ${canSeeProcessCost ? `<td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px;color:#723B13;">${node.process_cost_per_unit != null && node.process_cost_per_unit > 0 ? fmtAmt(node.process_cost_per_unit) : '-'}</td>` : ''}
          ${canSeeRollupCost ? `<td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px;font-weight:600;">${node.extended_cost != null ? fmtAmt(node.extended_cost) : '-'}</td>` : ''}
        </tr>`;
        if (node.children && node.children.length > 0) {
          // TOP-LEVEL ONLY: when this node is itself a sub-assembly with its
          // own BOM (`child_bom_id`), DON'T explode its sub-tree into the
          // parent's print. The SG keeps its own one-line entry; the user
          // exports the SG separately via the per-SG PDF button. Other
          // children (e.g., raw materials grouped under a phantom parent)
          // continue to render as before.
          const skipSubTree = node.cat === 'sub_assembly' || (node.item?.category === 'sub_assembly') || node.child_bom_id;
          if (!skipSubTree) {
            html += renderPrintRows(node.children, level + 1);
          }
        }
      });
      return html;
    };
    const parentRoutingsText = (bomInfo?.parent_routings || []).map(r => {
      const n = typeof r === 'string' ? r : r.name;
      const c = typeof r === 'string' ? 0 : (r.cost || 0);
      return c > 0 ? `${n} (${fmtAmt(c)})` : n;
    }).join(', ');
    const html = `<!DOCTYPE html><html><head><title>BOM - ${parentItem?.part_number || ''}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;font-size:11px;padding:20px}
    ${letterheadCSS('#1D3557')}
    h1{font-size:16px;color:#1D3557;margin-bottom:4px}h2{font-size:12px;color:#555;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#1D3557;color:white;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase}
    td{border-bottom:1px solid #ddd;font-size:11px}
    .summary{margin-top:14px;padding:10px;background:#F9FAFB;border:1px solid #E5E7EB;font-size:11px}
    .summary .row{display:flex;justify-content:space-between;padding:2px 0}
    .summary .row.total{font-size:13px;font-weight:700;color:#1D3557;border-top:2px solid #1D3557;padding-top:6px;margin-top:6px}
    @media print{body{padding:10px}}</style></head><body>
    ${buildLetterheadHTML(companySettings || {})}
    <h1>${parentItem?.part_number || ''} - ${parentItem?.name || ''}</h1>
    <h2>BOM Explosion | Rev ${bomInfo?.revision || '-'} | ${bomInfo?.status || '-'}${parentRoutingsText ? ' | FG Routings: ' + parentRoutingsText : ''}</h2>
    <table><thead><tr><th>Type</th><th>Part Number</th><th>Description</th><th>Routings${canSeeProcessCost ? ' (cost)' : ''}</th><th style="text-align:right">QTY</th><th>UOM</th>${canSeeRollupCost ? '<th style="text-align:right">Material Cost/Unit</th>' : ''}${canSeeProcessCost ? '<th style="text-align:right">Process Cost/Unit</th>' : ''}${canSeeRollupCost ? '<th style="text-align:right">Extended Cost</th>' : ''}</tr></thead>
    <tbody>${renderPrintRows(explosion)}</tbody></table>
    ${canSeeRollupCost ? `<div class="summary">
      <div class="row"><span>Components Cost (material + component process):</span><span style="font-family:monospace">${formatCurrency(componentsCost)}</span></div>
      <div class="row"><span>FG Parent Process Cost (${parentRoutingsText || '—'}):</span><span style="font-family:monospace;color:#723B13">${formatCurrency(fgProcessCost)}</span></div>
      <div class="row total"><span>Total Rollup Cost:</span><span style="font-family:monospace">${formatCurrency(totalCost)}</span></div>
    </div>` : ''}
    <p style="text-align:center;font-size:9px;color:#aaa;margin-top:30px">Printed on ${new Date().toLocaleString()}</p>
    </body></html>`;
    downloadHtmlAsPdf(html, `BOM-${parentItem?.part_number || 'print'}.pdf`);
  };

  const renderExplosionTree = (items, parentKey = '', level = 0) => {
    // Sibling-level duplicate merge — same logic as the inline expanded
    // panel and the print HTML. Without this, the View BOM dialog still
    // showed legacy duplicate rows side-by-side. We merge here at every
    // recursion level so child sub-trees collapse too.
    const mergeViewSiblings = (nodes) => {
      if (!nodes || nodes.length === 0) return nodes || [];
      const map = new Map();
      const order = [];
      for (const n of nodes) {
        const itemId = n.item?.id || n.item_id || (n.item?.part_number || '');
        const key = `${itemId}__${n.is_alternate ? 1 : 0}`;
        if (!map.has(key)) {
          map.set(key, { ...n, quantity: Number(n.quantity || 0), extended_cost: Number(n.extended_cost || 0), routings: [...(n.routings || [])], children: [...(n.children || [])] });
          order.push(key);
        } else {
          const ex = map.get(key);
          ex.quantity = (Number(ex.quantity) || 0) + Number(n.quantity || 0);
          ex.extended_cost = (Number(ex.extended_cost) || 0) + Number(n.extended_cost || 0);
          const seen = new Set((ex.routings || []).map(r => `${r?.name}|${r?.cost}`));
          for (const r of (n.routings || [])) {
            const rk = `${r?.name}|${r?.cost}`;
            if (!seen.has(rk)) { ex.routings.push(r); seen.add(rk); }
          }
          ex.children = [...(ex.children || []), ...(n.children || [])];
        }
      }
      return order.map(k => {
        const m = map.get(k);
        m.children = mergeViewSiblings(m.children || []);
        return m;
      });
    };
    return mergeViewSiblings(items).map((item, index) => {
      const key = `${parentKey}-${index}`;
      const isExpanded = expandedItems[key];
      const hasChildren = item.children && item.children.length > 0;
      
      return (
        <React.Fragment key={key}>
          <tr className="bom-tree-row" data-testid={`bom-tree-row-${level}-${index}`}>
            <td className="py-2 px-3">
              <div className="flex items-center" style={{ paddingLeft: `${level * 24}px` }}>
                {hasChildren ? (
                  <button
                    onClick={() => toggleExpanded(key)}
                    className="mr-2 p-0.5 hover:bg-[#F3F4F6] rounded"
                    data-testid={`bom-tree-expand-${level}-${index}`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-[#4B5563]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#4B5563]" />
                    )}
                  </button>
                ) : (
                  <span className="w-6"></span>
                )}
                <span className="mono text-sm">{item.item?.part_number || 'N/A'}</span>
              </div>
            </td>
            <td className="py-2 px-3 text-sm">{item.item?.name || 'Unknown'}</td>
            <td className="py-2 px-3 text-sm text-right mono">{formatQty(item.quantity, item.item?.unit_of_measure, uoms)}</td>
            <td className="py-2 px-3 text-sm">{item.item?.unit_of_measure || '-'}</td>
            {canSeeRollupCost && <td className="py-2 px-3 text-sm text-right mono">{item.unit_cost != null ? formatCurrency(item.unit_cost) : '-'}</td>}
            {canSeeRollupCost && <td className="py-2 px-3 text-sm text-right mono font-medium">{item.extended_cost != null ? formatCurrency(item.extended_cost) : '-'}</td>}
            <td className="py-2 px-3">
              {item.is_alternate && (
                <span className="status-badge bg-[#FDF6B2] text-[#723B13]">Alternate</span>
              )}
            </td>
          </tr>
          {hasChildren && isExpanded && renderExplosionTree(item.children, key, level + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="space-y-3" data-testid="bom-page">
      <div className="flex items-center justify-between sticky top-0 z-30 bg-white py-2 border-b border-[#E5E7EB] -mx-6 px-6">
        <div>
          <h1 className="text-xl font-bold font-[Chivo] text-[#111827]">Bill of Materials</h1>
          <p className="text-xs text-[#4B5563]">Manage product structures and component relationships</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={handleBomExport} className="btn-secondary flex items-center space-x-1 text-sm" data-testid="export-bom-btn">
            <Download className="w-4 h-4" /><span>Export</span>
          </button>
          {canCreate && (
            <>
              <input type="file" ref={bomFileRef} accept=".xlsx,.xls" onChange={handleBomImport} className="hidden" />
              <button onClick={() => bomFileRef.current?.click()} disabled={bomImporting} className="btn-secondary flex items-center space-x-1 text-sm" data-testid="import-bom-btn">
                <Upload className="w-4 h-4" /><span>{bomImporting ? 'Importing...' : 'Import'}</span>
              </button>
            </>
          )}
        {canCreate && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            // Closing the dialog (Esc, X, click-outside) — if the user was
            // editing a child BOM, pop back to the parent instead of closing
            // the dialog entirely. This keeps the parent BOM edit screen
            // visible after the user dismisses the child window.
            if (!open && bomEditStack.length > 0) {
              const parent = bomEditStack[bomEditStack.length - 1];
              setBomEditStack(s => s.slice(0, -1));
              setEditingBom(parent.bom);
              setFormData(parent.formData);
              return;
            }
            setIsDialogOpen(open);
            if (!open) {
              setEditingBom(null);
              setBomEditStack([]);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-bom-btn">
                <Plus className="w-4 h-4" />
                <span>Create BOM</span>
              </button>
            </DialogTrigger>
            <DialogContent
              ref={dialogScrollRef}
              className="max-w-6xl max-h-[92vh] overflow-y-auto bom-dialog-scroll"
              onEscapeKeyDown={(e) => e.preventDefault()}
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
            >
              {/* Visible scrollbar styling (Fix 3) — overrides ultra-thin default. */}
              <style>{`
                .bom-dialog-scroll::-webkit-scrollbar { width: 14px; height: 14px; }
                .bom-dialog-scroll::-webkit-scrollbar-track { background: #E5E7EB; border-radius: 4px; }
                .bom-dialog-scroll::-webkit-scrollbar-thumb { background: #6B7280; border-radius: 4px; border: 2px solid #E5E7EB; }
                .bom-dialog-scroll::-webkit-scrollbar-thumb:hover { background: #374151; }
                .bom-dialog-scroll { scrollbar-width: auto; scrollbar-color: #6B7280 #E5E7EB; }
              `}</style>
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">{editingBom ? 'Edit BOM' : 'Create New BOM'}</DialogTitle>
                {bomEditStack.length > 0 && (
                  <div className="text-[11px] text-[#6B7280] mt-1 flex items-center gap-1" data-testid="bom-edit-breadcrumb">
                    <span className="text-[#9CA3AF] uppercase tracking-wide">Editing nested:</span>
                    {bomEditStack.map((p, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="mono font-semibold text-[#1D3557]">
                          {(items.find(it => it.id === p.bom?.parent_item_id) || {}).part_number || p.bom?.name}
                        </span>
                        <span className="text-[#9CA3AF]">›</span>
                      </span>
                    ))}
                    <span className="mono font-semibold text-[#723B13]">
                      {(items.find(it => it.id === editingBom?.parent_item_id) || {}).part_number || editingBom?.name}
                    </span>
                  </div>
                )}
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                {/* Sticky top action bar — Save / Cancel always visible (Fix 4). */}
                <div className="sticky top-0 z-20 -mx-6 px-6 py-2 bg-white/95 backdrop-blur border-b border-[#E5E7EB] flex justify-end space-x-2" data-testid="bom-sticky-actions">
                  <button
                    type="button"
                    onClick={() => {
                      if (bomEditStack.length > 0) {
                        const parent = bomEditStack[bomEditStack.length - 1];
                        setBomEditStack(s => s.slice(0, -1));
                        setEditingBom(parent.bom);
                        setFormData(parent.formData);
                        return;
                      }
                      setIsDialogOpen(false);
                    }}
                    className="btn-secondary text-xs"
                    data-testid="bom-cancel-btn-top"
                  >
                    {bomEditStack.length > 0 ? 'Back to Parent BOM' : 'Cancel'}
                  </button>
                  <button type="submit" className="btn-primary text-xs" data-testid="bom-save-btn-top">
                    {editingBom ? 'Update BOM' : 'Create BOM'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">
                      Parent Item <span className="text-[#9B1C1C]">*</span>
                      {items.length === 0 && <span className="ml-2 text-xs text-[#9B1C1C] font-normal">(loading items…)</span>}
                    </label>
                    <div className={!formData.parent_item_id ? 'ring-1 ring-transparent hover:ring-[#9B1C1C] rounded-sm' : ''}>
                      <SearchableItemSelect
                        items={items}
                        value={formData.parent_item_id}
                        onChange={(v) => {
                          setFormData({ ...formData, parent_item_id: v });
                          // Phase 2 — pre-load existing variant_attributes when picking the parent.
                          const it = items.find(i => i.id === v);
                          setParentVariantAttrs(it?.variant_attributes || []);
                        }}
                        placeholder={items.length === 0 ? 'Items still loading…' : 'Type part number or name to search…'}
                        testId="bom-parent-item-select"
                        disabled={items.length === 0}
                      />
                    </div>
                    {!formData.parent_item_id && items.length > 0 && (
                      <p className="text-[10px] text-[#6B7280] mt-1">Required — pick the FG / SA / Component this BOM builds.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">BOM Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input-field"
                      placeholder="Hydraulic Press 50T BOM"
                      required
                      data-testid="bom-name-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Revision</label>
                    <input
                      type="text"
                      value={formData.revision}
                      onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                      className="input-field mono"
                      placeholder="A"
                      data-testid="bom-revision-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Status</label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger data-testid="bom-status-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Effectivity Date</label>
                    <input
                      type="date"
                      value={formData.effectivity_date}
                      onChange={(e) => setFormData({ ...formData, effectivity_date: e.target.value })}
                      className="input-field"
                      data-testid="bom-effectivity-date-input"
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
                    placeholder="BOM description..."
                    data-testid="bom-description-input"
                  />
                </div>

                {/* ========== VARIANT ATTRIBUTES (read-only — managed on the Item itself) ========== */}
                {formData.parent_item_id && (parentVariantAttrs || []).length > 0 && (
                  <div className="border border-[#FDE68A] rounded-sm bg-[#FFFBEB] px-3 py-2.5" data-testid="bom-variant-attrs-block">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-[#723B13]">
                        Product Variants <span className="font-normal text-[#92400E]">(inherited from BOM components — read-only)</span>
                      </label>
                      <span className="text-[10px] text-[#92400E]">Generate child SKUs from the Item edit dialog</span>
                    </div>
                    <div className="space-y-1.5">
                      {/* When the parent item INHERITS variants from BOM components, prefer the
                          per-component breakdown so the user sees WHICH component contributes WHICH
                          axis. Falls back to the merged union (for legacy items with own variants
                          or when the breakdown is empty for some reason). */}
                      {(parentVariantSources && parentVariantSources.length > 0) ? (
                        parentVariantSources.map((src, si) => (
                          <div key={si} className="bg-white border border-[#FDE68A] rounded-sm px-2 py-1.5" data-testid={`bom-variant-source-${si}`}>
                            <div className="text-[10px] mono font-semibold text-[#723B13] mb-1" title={src.component_name || ''}>
                              {src.component_part_number}<span className="ml-1 text-[#92400E] font-normal">— {src.component_name || ''}</span>
                            </div>
                            <div className="space-y-1">
                              {(src.variant_attributes || []).map((attr, ai) => {
                                const vals = (attr.values || []).map(v => typeof v === 'string' ? v : (v?.value || v?.short_code || ''));
                                return (
                                  <div key={ai} className="flex items-center gap-2" data-testid={`bom-variant-source-${si}-attr-${ai}`}>
                                    <span className="text-xs font-semibold text-[#374151] w-32 truncate" title={attr.name}>{attr.name || '—'}</span>
                                    <div className="flex flex-wrap gap-1 flex-1">
                                      {vals.map((v, vi) => (
                                        <span key={vi} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#1D3557] text-white">{v}</span>
                                      ))}
                                      {vals.length === 0 && <span className="text-[10px] text-[#9CA3AF] italic">no values</span>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      ) : (
                        (parentVariantAttrs || []).map((attr, ai) => {
                          const vals = (attr.values || []).map(v => typeof v === 'string' ? v : (v?.value || v?.short_code || ''));
                          return (
                            <div key={ai} className="flex items-center gap-2 bg-white border border-[#FDE68A] rounded-sm px-2 py-1.5" data-testid={`bom-variant-attr-row-${ai}`}>
                              <span className="text-xs font-semibold text-[#374151] w-40 truncate" title={attr.name}>{attr.name || '—'}</span>
                              <div className="flex flex-wrap gap-1 flex-1">
                                {vals.map((v, vi) => (
                                  <span key={vi} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#1D3557] text-white">{v}</span>
                                ))}
                                {vals.length === 0 && <span className="text-[10px] text-[#9CA3AF] italic">no values</span>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Parent Item Routings */}
                <div className="border-t border-[#E5E7EB] pt-4">
                  <label className="block text-sm font-semibold text-[#111827] mb-2">Parent Item Routings</label>
                  <p className="text-xs text-[#6B7280] mb-2">Operations for the FG/SA item itself (e.g., Assembly, Powder Coating). Enter cost/unit per operation.</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {routingOptions.map(r => {
                      const cur = formData.parent_routings || [];
                      const sel = cur.some(cr => (typeof cr === 'string' ? cr : cr.name) === r.name);
                      return (
                        <button key={r.id} type="button" onClick={() => {
                          setFormData({
                            ...formData,
                            parent_routings: sel
                              ? cur.filter(cr => (typeof cr === 'string' ? cr : cr.name) !== r.name)
                              : [...cur, { name: r.name, cost: 0 }]
                          });
                        }} className={`px-2.5 py-1 text-xs rounded-sm border transition-all ${sel ? 'bg-[#1D3557] text-white border-[#1D3557]' : 'bg-white text-[#4B5563] border-[#D1D5DB] hover:border-[#1D3557]'}`} data-testid={`parent-routing-${r.name}`}>
                          {r.name}
                        </button>
                      );
                    })}
                    {routingOptions.length === 0 && <p className="text-xs text-[#9CA3AF] italic">No operation types defined. Create them in Manufacturing → Routings tab first.</p>}
                  </div>
                  {(formData.parent_routings || []).length > 0 && (
                    <div className="flex flex-col gap-1 pl-2 mt-1">
                      {(formData.parent_routings || []).map((pr, pi) => {
                        const pName = typeof pr === 'string' ? pr : pr.name;
                        const pCost = typeof pr === 'string' ? 0 : (pr.cost || 0);
                        return (
                          <div key={pi} className="flex items-center gap-2 text-xs" data-testid={`parent-routing-cost-row-${pi}`}>
                            <span className="w-40 text-[#1D3557] font-medium">{pName}</span>
                            <span className="text-[#6B7280]">Cost/Unit:</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={pCost}
                              onChange={(e) => {
                                const cur = [...(formData.parent_routings || [])];
                                const val = parseFloat(e.target.value) || 0;
                                cur[pi] = typeof cur[pi] === 'string' ? { name: cur[pi], cost: val } : { ...cur[pi], cost: val };
                                setFormData({ ...formData, parent_routings: cur });
                              }}
                              className="input-field mono bg-white text-xs w-24 py-1"
                              placeholder="0.00"
                              data-testid={`parent-routing-cost-${pi}`}
                            />
                            <span className="text-[10px] text-[#9CA3AF]">{currencySymbol}</span>
                          </div>
                        );
                      })}
                      {(() => {
                        const total = (formData.parent_routings || []).reduce((s, pr) => s + (typeof pr === 'string' ? 0 : (pr.cost || 0)), 0);
                        return total > 0 ? (
                          <div className="flex items-center gap-2 text-xs pt-1 border-t border-[#D1D5DB]">
                            <span className="w-40 text-[#111827] font-semibold">Process Cost / Unit:</span>
                            <span className="mono font-semibold text-[#03543F]">{currencySymbol}{total.toFixed(2)}</span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>

                {/* Components */}
                <div className="border-t border-[#E5E7EB] pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-[#111827]">Components</label>
                    <button type="button" onClick={addComponent} className="btn-secondary text-xs flex items-center space-x-1" data-testid="add-component-btn">
                      <Plus className="w-3 h-3" /><span>Add Component</span>
                    </button>
                  </div>
                  
                  {formData.components.length === 0 ? (
                    <div className="text-center py-6 text-[#4B5563] bg-[#F3F4F6] rounded-sm">
                      <FileStack className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" />
                      <p className="text-sm">No components added yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formData.components.map((comp, index) => {
                        const compItem = items.find(i => i.id === comp.item_id);
                        const isRM = compItem?.category === 'raw_material';
                        return (
                          <div key={index} className="p-2.5 bg-[#F3F4F6] rounded-sm space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <SearchableItemSelect
                                  items={items}
                                  value={comp.item_id}
                                  onChange={(v) => updateComponent(index, 'item_id', v)}
                                  placeholder="Type part no. or name…"
                                  testId={`component-item-select-${index}`}
                                />
                              </div>
                              <div className="w-24">
                                <input type="number" min="0.01" step="0.01" value={comp.quantity} onChange={(e) => updateComponent(index, 'quantity', parseFloat(e.target.value) || 0)} className="input-field mono bg-white" placeholder="Qty" data-testid={`component-qty-input-${index}`} />
                              </div>
                              <label className="flex items-center space-x-1 text-xs text-[#4B5563]">
                                <input type="checkbox" checked={comp.is_alternate} onChange={(e) => updateComponent(index, 'is_alternate', e.target.checked)} className="rounded" />
                                <span>Alt</span>
                              </label>
                              {/* Show the COMPONENT ITEM's own variant values (read-only, from
                                  Item.variant_attributes). In the new architecture, components
                                  define their own variants and the production picker (MO/SO)
                                  chooses which variant to consume — no per-row BOM filter needed. */}
                              {(() => {
                                const cAttrs = compItem?.variant_attributes;
                                if (!cAttrs || cAttrs.length === 0) return null;
                                // Flatten all values into chips: "16GT 24GT 30GT" (across attrs).
                                const chips = [];
                                for (const a of cAttrs) {
                                  for (const v of (a.values || [])) {
                                    const label = typeof v === 'string' ? v : (v?.value || v?.short_code || '');
                                    if (label) chips.push(label);
                                  }
                                }
                                if (chips.length === 0) return null;
                                const title = cAttrs.map(a => `${a.name}: ${(a.values || []).map(v => typeof v === 'string' ? v : (v?.value || v?.short_code || '')).join(', ')}`).join(' · ');
                                return (
                                  <div className="flex flex-wrap gap-1 max-w-[180px]" title={title} data-testid={`component-variant-chips-${index}`}>
                                    {chips.slice(0, 6).map((c, ci) => (
                                      <span key={ci} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1D3557] text-white">{c}</span>
                                    ))}
                                    {chips.length > 6 && <span className="text-[10px] text-[#6B7280]">+{chips.length - 6}</span>}
                                  </div>
                                );
                              })()}
                              <button type="button" onClick={() => removeComponent(index)} className="p-1 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded"><X className="w-4 h-4" /></button>
                            </div>
                            {/* Routings with per-operation cost (non-RM components only) */}
                            {comp.item_id && !isRM && (() => {
                              const childBom = boms.find(b => b.parent_item_id === comp.item_id);
                              if (childBom) {
                                // Child has its own BOM — process cost must be set on that BOM's parent_routings.
                                const childRoutings = childBom.parent_routings || [];
                                const total = childRoutings.reduce((s, cr) => s + (typeof cr === 'string' ? 0 : (cr.cost || 0)), 0);
                                const names = childRoutings.map(cr => typeof cr === 'string' ? cr : cr.name).join(', ');
                                return (
                                  <div className="pl-1 text-[10px] text-[#6B7280] italic bg-[#F9FAFB] border border-[#E5E7EB] rounded-sm px-2 py-1 flex items-center justify-between gap-2" data-testid={`comp-${index}-has-child-bom`}>
                                    <span>
                                      Process cost is set on <span className="font-semibold text-[#1E429F]">{compItem?.part_number}</span>'s own BOM (Parent Item Routings): <span className="mono">{names || 'none'}</span> = <span className="mono font-semibold">{formatCurrency(total)}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        // Push the current parent context onto the stack so we
                                        // can return to it after the child save/cancel — keep
                                        // the dialog open and just swap content.
                                        if (editingBom) {
                                          setBomEditStack(s => [...s, { bom: editingBom, formData: formData }]);
                                        }
                                        setEditingBom(childBom);
                                        setFormData({
                                          parent_item_id: childBom.parent_item_id,
                                          name: childBom.name,
                                          description: childBom.description || '',
                                          revision: childBom.revision,
                                          status: childBom.status,
                                          effectivity_date: childBom.effectivity_date ? childBom.effectivity_date.split('T')[0] : '',
                                          components: sortBomComponentsForEdit(childBom.components || [], items),
                                          parent_routings: childBom.parent_routings || [],
                                        });
                                      }}
                                      className="text-[10px] text-[#1D3557] underline hover:no-underline flex items-center gap-0.5"
                                      data-testid={`comp-${index}-goto-child-bom`}
                                    >
                                      <Edit2 className="w-3 h-3" />Edit {compItem?.part_number} BOM
                                    </button>
                                  </div>
                                );
                              }
                              return (
                              <div className="pl-1 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-semibold text-[#6B7280] uppercase">Routings:</span>
                                  {routingOptions.map(r => {
                                    const cur = comp.routings || [];
                                    const sel = cur.some(cr => (typeof cr === 'string' ? cr : cr.name) === r.name);
                                    return (
                                      <button key={r.id} type="button" onClick={() => {
                                        const comps = [...formData.components];
                                        const curR = comps[index].routings || [];
                                        comps[index] = {
                                          ...comps[index],
                                          routings: sel
                                            ? curR.filter(cr => (typeof cr === 'string' ? cr : cr.name) !== r.name)
                                            : [...curR, { name: r.name, cost: 0 }]
                                        };
                                        setFormData({ ...formData, components: comps });
                                      }} className={`px-1.5 py-0.5 text-[10px] rounded-sm border transition-all ${sel ? 'bg-[#1E429F] text-white border-[#1E429F]' : 'bg-white text-[#6B7280] border-[#D1D5DB] hover:border-[#1E429F]'}`} data-testid={`comp-${index}-routing-${r.name}`}>
                                        {r.name}
                                      </button>
                                    );
                                  })}
                                  {(comp.routings || []).length === 0 && <span className="text-[10px] text-[#9CA3AF] italic">none</span>}
                                </div>
                                {/* Per-routing cost inputs */}
                                {(comp.routings || []).length > 0 && (
                                  <div className="flex flex-col gap-1 pl-2">
                                    {(comp.routings || []).map((cr, ri) => {
                                      const rName = typeof cr === 'string' ? cr : cr.name;
                                      const rCost = typeof cr === 'string' ? 0 : (cr.cost || 0);
                                      return (
                                        <div key={ri} className="flex items-center gap-2 text-xs" data-testid={`comp-${index}-routing-cost-row-${ri}`}>
                                          <span className="w-32 text-[#1E429F] font-medium">{rName}</span>
                                          <span className="text-[#6B7280]">Cost/Unit:</span>
                                          <input
                                            type="number" min="0" step="0.01"
                                            value={rCost}
                                            onChange={(e) => {
                                              const comps = [...formData.components];
                                              const curR = [...(comps[index].routings || [])];
                                              const val = parseFloat(e.target.value) || 0;
                                              curR[ri] = typeof curR[ri] === 'string'
                                                ? { name: curR[ri], cost: val }
                                                : { ...curR[ri], cost: val };
                                              comps[index] = { ...comps[index], routings: curR };
                                              setFormData({ ...formData, components: comps });
                                            }}
                                            className="input-field mono bg-white text-xs w-24 py-1"
                                            placeholder="0.00"
                                            data-testid={`comp-${index}-routing-cost-${ri}`}
                                          />
                                          <span className="text-[10px] text-[#9CA3AF]">{currencySymbol}</span>
                                        </div>
                                      );
                                    })}
                                    {(() => {
                                      const total = (comp.routings || []).reduce((s, cr) => s + (typeof cr === 'string' ? 0 : (cr.cost || 0)), 0);
                                      return total > 0 ? (
                                        <div className="flex items-center gap-2 text-xs pt-1 border-t border-[#D1D5DB]">
                                          <span className="w-32 text-[#111827] font-semibold">Process Cost / Unit:</span>
                                          <span className="mono font-semibold text-[#03543F]">{currencySymbol}{total.toFixed(2)}</span>
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                )}
                              </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Bottom "Add Component" button — easier to reach when the list grows */}
                  <div className="flex justify-center pt-3">
                    <button type="button" onClick={addComponent} className="btn-secondary text-xs flex items-center space-x-1" data-testid="add-component-btn-bottom">
                      <Plus className="w-3 h-3" /><span>Add Component</span>
                    </button>
                  </div>
                  {/* Scroll anchor — addComponent() smooth-scrolls this into view so the new row is always visible. */}
                  <div ref={componentsEndRef} aria-hidden="true" />
                  {/* Comfort spacer — gives the search dropdown of the LAST
                      component row vertical breathing room so the panel
                      doesn't overflow the dialog's bottom edge or get clipped
                      by the Save / Cancel button bar. ~500px is enough for a
                      panel showing 8-10 matches without flipping upwards. */}
                  <div className="h-[500px]" aria-hidden="true" />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                  <button
                    type="button"
                    onClick={() => {
                      // Cancel — if we're inside a child edit, pop back to parent
                      // instead of closing the entire dialog.
                      if (bomEditStack.length > 0) {
                        const parent = bomEditStack[bomEditStack.length - 1];
                        setBomEditStack(s => s.slice(0, -1));
                        setEditingBom(parent.bom);
                        setFormData(parent.formData);
                        return;
                      }
                      setIsDialogOpen(false);
                    }}
                    className="btn-secondary"
                    data-testid="bom-cancel-btn"
                  >
                    {bomEditStack.length > 0 ? 'Back to Parent BOM' : 'Cancel'}
                  </button>
                  <button type="submit" className="btn-primary" data-testid="bom-save-btn">
                    {editingBom ? 'Update BOM' : 'Create BOM'}
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {/* ========== APPLIES-TO PICKER DIALOG (Phase 2 — Variants) ========== */}
      <Dialog open={appliesToDialog.open} onOpenChange={(o) => setAppliesToDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} className="max-w-md">
          <DialogHeader><DialogTitle className="text-sm">Applies to which variants?</DialogTitle></DialogHeader>
          {(() => {
            const idx = appliesToDialog.componentIdx;
            if (idx < 0) return null;
            const comp = formData.components[idx] || {};
            const a = comp.applies_to || {};
            const updateApplies = (newApplies) => {
              const next = [...formData.components];
              next[idx] = { ...next[idx], applies_to: newApplies };
              setFormData({ ...formData, components: next });
            };
            return (
              <div className="space-y-2 mt-2" data-testid="applies-to-dialog-body">
                <p className="text-xs text-[#6B7280]">
                  Leave every attribute blank (or pick <i>Any</i>) to keep this component <b>common to all variants</b>.
                  Restrict to specific values to include this component only when those values are selected on SO/MO.
                </p>
                {(parentVariantAttrs || []).map((attr, ai) => (
                  <div key={ai} className="flex items-center gap-2 border border-[#E5E7EB] rounded-sm px-2 py-1.5">
                    <label className="text-xs font-semibold text-[#374151] w-32 truncate" title={attr.name}>{attr.name || `Attr #${ai + 1}`}</label>
                    <Select value={a[attr.name] || '__any__'} onValueChange={(v) => {
                      const next = { ...a };
                      if (v === '__any__') {
                        delete next[attr.name];
                      } else {
                        next[attr.name] = v;
                      }
                      updateApplies(next);
                    }}>
                      <SelectTrigger className="text-xs" data-testid={`applies-to-attr-${ai}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">— Any (no filter) —</SelectItem>
                        {(attr.values || []).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { updateApplies({}); setAppliesToDialog({ open: false, componentIdx: -1 }); }}
                    className="btn-secondary text-xs"
                    data-testid="applies-to-clear"
                  >Clear (Common to all)</button>
                  <button
                    type="button"
                    onClick={() => setAppliesToDialog({ open: false, componentIdx: -1 })}
                    className="btn-primary text-xs"
                    data-testid="applies-to-done"
                  >Done</button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Status Filter & Search */}
      <div className="card-flat px-3 py-2">
        <div className="flex items-center gap-3">
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-48" data-testid="bom-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {statusFilter && (
            <button onClick={() => setStatusFilter('')} className="btn-secondary flex items-center space-x-1">
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
          )}
          <div className="flex-1" />
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
            <input
              type="text"
              value={bomSearch}
              onChange={(e) => setBomSearch(e.target.value)}
              placeholder="Search BOM by part number or name..."
              className="search-input text-sm"
              data-testid="bom-search-input"
            />
          </div>
        </div>
      </div>

      {/* BOMs List - Multi-Level Explosion Table View */}
      <div className="card-flat overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
          </div>
        ) : boms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
            <FileStack className="w-12 h-12 mb-2 text-[#9CA3AF]" />
            <p>No BOMs found</p>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {(() => {
              // Build a set of item_ids that appear as a COMPONENT in at least one other BOM.
              // These are already nested under a parent in the explosion tree, so rendering
              // them as standalone top-level rows would duplicate + clutter the list.
              const childItemIds = new Set();
              boms.forEach(bom => {
                (bom.components || []).forEach(c => {
                  if (c.item_id) childItemIds.add(c.item_id);
                });
              });

              // Group all BOMs by parent category (FG/SG/CP/RM), EXCEPT ones whose parent_item
              // is referenced as a child component in another BOM (those show nested in their
              // parent's explosion tree instead).
              const grouped = {};
              const orderedCats = ['finished_good', 'sub_assembly', 'component', 'raw_material'];
              boms.forEach(bom => {
                // Skip BOMs whose parent is already a child in some other BOM — they'll render
                // automatically inside their parent's explosion, so no duplicate top-level row.
                if (childItemIds.has(bom.parent_item_id)) return;
                const pid = bom.parent_item_id || 'x';
                if (!grouped[pid]) grouped[pid] = { item: bom.parent_item, boms: [] };
                grouped[pid].boms.push(bom);
              });
              
              // Row color by category
              const rowColor = (cat, level) => {
                if (cat === 'finished_good') return 'bg-[#1D3557]/5 border-l-4 border-l-[#1D3557]';
                if (cat === 'sub_assembly') return 'bg-[#723B13]/5 border-l-4 border-l-[#723B13]';
                if (cat === 'raw_material') return 'bg-[#2563EB]/5 border-l-4 border-l-[#2563EB]';
                if (cat === 'component') return 'bg-[#9B1C1C]/5 border-l-4 border-l-[#9B1C1C]';
                return 'bg-[#F3F4F6] border-l-4 border-l-[#6B7280]';
              };
              const catBadge = (cat) => {
                if (cat === 'finished_good') return 'bg-[#1D3557] text-white';
                if (cat === 'sub_assembly') return 'bg-[#723B13] text-white';
                if (cat === 'raw_material') return 'bg-[#DBEAFE] text-[#1D4ED8]';
                if (cat === 'component') return 'bg-[#FDE8E8] text-[#9B1C1C]';
                return 'bg-[#F3F4F6] text-[#374151]';
              };
              const catLabel = (cat) => cat === 'finished_good' ? 'FG' : cat === 'sub_assembly' ? 'SG' : cat === 'raw_material' ? 'RM' : cat === 'component' ? 'CP' : 'PT';
              
              // Recursive flatten explosion into table rows.
              // Siblings at every depth are re-sorted by category (SG → CP → RM)
              // and then numerically by part_number so the explosion table is
              // scannable instead of following the (arbitrary) BOM insertion
              // order. Alternates stay paired with their primary (they sort by
              // the same key + a small offset so the alternate follows it).
              const childCatOrder = { sub_assembly: 0, component: 1, raw_material: 2 };
              const sortSiblings = (nodes) => {
                const arr = [...(nodes || [])];
                arr.sort((a, b) => {
                  const ca = childCatOrder[a.item?.category];
                  const cb = childCatOrder[b.item?.category];
                  const ra = (ca === undefined) ? 99 : ca;
                  const rb = (cb === undefined) ? 99 : cb;
                  if (ra !== rb) return ra - rb;
                  return (a.item?.part_number || '').localeCompare(
                    b.item?.part_number || '',
                    undefined,
                    { numeric: true, sensitivity: 'base' }
                  );
                });
                return arr;
              };
              // Sibling-level duplicate merge: when the same item appears
              // multiple times under the same parent (legacy multi-line BOMs
              // before the de-dupe sweep), collapse them into one display
              // row by SUMMING quantity + extended cost and unioning routings.
              // Children sub-trees are merged too. Alternates are kept
              // separate (different supply role). This only affects
              // RENDERING — the underlying explosion data is left untouched.
              const mergeSiblings = (nodes) => {
                if (!nodes || nodes.length === 0) return nodes || [];
                const map = new Map();
                const order = [];
                for (const n of nodes) {
                  const itemId = n.item?.id || n.item_id || (n.item?.part_number || '');
                  const key = `${itemId}__${n.is_alternate ? 1 : 0}`;
                  if (!map.has(key)) {
                    map.set(key, { ...n, quantity: Number(n.quantity || 0), extended_cost: Number(n.extended_cost || 0), routings: [...(n.routings || [])], children: [...(n.children || [])] });
                    order.push(key);
                  } else {
                    const ex = map.get(key);
                    ex.quantity = (Number(ex.quantity) || 0) + Number(n.quantity || 0);
                    ex.extended_cost = (Number(ex.extended_cost) || 0) + Number(n.extended_cost || 0);
                    const seen = new Set((ex.routings || []).map(r => `${r?.name}|${r?.cost}`));
                    for (const r of (n.routings || [])) {
                      const rk = `${r?.name}|${r?.cost}`;
                      if (!seen.has(rk)) { ex.routings.push(r); seen.add(rk); }
                    }
                    ex.children = [...(ex.children || []), ...(n.children || [])];
                  }
                }
                return order.map(k => {
                  const m = map.get(k);
                  // Recursively merge children at every level too.
                  m.children = mergeSiblings(m.children || []);
                  return m;
                });
              };

              const flattenRows = (nodes, level = 1, parentKey = '') => {
                const rows = [];
                sortSiblings(mergeSiblings(nodes)).forEach((node, idx) => {
                  const item = node.item || {};
                  const cat = item.category || '';
                  const key = `${parentKey}-${idx}`;
                  const hasChildren = node.children && node.children.length > 0;
                  // Default collapsed for sub-assemblies / sub-trees (level > 0). Level 0 (the
                  // FG/root) stays expanded so the user can see the top-level components.
                  const isExpanded = expandedItems[key] !== undefined
                    ? expandedItems[key]
                    : (level === 0);
                  
                  rows.push({
                    key,
                    level,
                    item,
                    cat,
                    quantity: node.quantity,
                    unit_cost: node.unit_cost || 0,
                    extended_cost: node.extended_cost || 0,
                    hasChildren,
                    isExpanded,
                    is_alternate: node.is_alternate,
                    routings: node.routings || [],
                    child_bom_id: node.child_bom_id || null,
                    process_cost_per_unit: node.process_cost_per_unit || 0,
                    total_cost_per_unit: node.total_cost_per_unit || (node.unit_cost || 0)
                  });
                  
                  if (hasChildren && isExpanded) {
                    rows.push(...flattenRows(node.children, level + 1, key));
                  }
                });
                return rows;
              };
              
              return Object.entries(grouped).filter(([pid, group]) => {
                if (!bomSearch.trim()) return true;
                const q = bomSearch.toLowerCase();
                const pi = group.item;
                if (pi?.part_number?.toLowerCase().includes(q)) return true;
                if (pi?.name?.toLowerCase().includes(q)) return true;
                // Also search in explosion children
                const searchNodes = (nodes) => {
                  for (const n of (nodes || [])) {
                    if (n.item?.part_number?.toLowerCase().includes(q)) return true;
                    if (n.item?.name?.toLowerCase().includes(q)) return true;
                    if (n.children && searchNodes(n.children)) return true;
                  }
                  return false;
                };
                const activeBom = group.boms.find(b => b.status === 'active') || group.boms[0];
                const exp = allExplosions[activeBom?.id];
                return exp ? searchNodes(exp.explosion) : false;
              }).sort(([, a], [, b]) => {
                // FG → SG → CP → RM order, then numeric-aware sort by part_number
                // within each category so 'FG-2' comes BEFORE 'FG-10' (instead of
                // alphabetic 'FG-1, FG-10, FG-11, FG-2' that localeCompare
                // produces by default).
                const catRank = orderedCats.indexOf(a.item?.category);
                const catRankB = orderedCats.indexOf(b.item?.category);
                if (catRank !== catRankB) return (catRank === -1 ? 99 : catRank) - (catRankB === -1 ? 99 : catRankB);
                return (a.item?.part_number || '').localeCompare((b.item?.part_number || ''), undefined, { numeric: true, sensitivity: 'base' });
              }).map(([pid, group]) => {
                const parentItem = group.item;
                const activeBom = group.boms.find(b => b.status === 'active') || group.boms[0];
                const explosion = allExplosions[activeBom?.id];
                const explosionRows = explosion ? flattenRows(explosion.explosion) : [];
                const totalCost = explosion?.total_rollup_cost || 0;
                
                return (
                  <div key={pid} className="border border-[#D1D5DB] rounded-sm overflow-hidden" data-testid={`bom-tree-${pid}`}>
                    {/* Top-level header row — color by parent category. Clicking the header
                        toggles the explosion table below. ALL panels (FG, SG, CP, RM) are
                        collapsed by default to keep the list scannable on big BOM catalogs. */}
                    <div
                      className="flex items-center justify-between px-4 py-3 text-white cursor-pointer select-none"
                      style={{
                        backgroundColor:
                          parentItem?.category === 'finished_good' ? 'rgba(29, 53, 87, 0.95)' :     // Navy
                          parentItem?.category === 'sub_assembly' ? 'rgba(114, 59, 19, 0.9)' :      // Brown
                          parentItem?.category === 'component' ? 'rgba(155, 28, 28, 0.85)' :        // Red
                          parentItem?.category === 'raw_material' ? 'rgba(37, 99, 235, 0.85)' :     // Blue
                          'rgba(75, 85, 99, 0.85)',                                                  // Gray fallback
                      }}
                      onClick={() => {
                        const willOpen = !expandedBomPanels[pid];
                        setExpandedBomPanels(p => ({ ...p, [pid]: willOpen }));
                        // Lazy-load explosion data the first time a panel is
                        // opened so the BOM list page paints immediately
                        // instead of waiting on hundreds of /explode calls.
                        if (willOpen && activeBom) ensureExplosion(activeBom.id);
                      }}
                      data-testid={`bom-panel-toggle-${pid}`}
                    >
                      <div className="flex items-center gap-3">
                        {expandedBomPanels[pid] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded">{catLabel(parentItem?.category)}</span>
                        <ItemHoverCard item={parentItem}>
                          <span className="mono font-bold text-sm cursor-help underline decoration-dotted decoration-white/30 underline-offset-2">{parentItem?.part_number || '-'}</span>
                        </ItemHoverCard>
                        <ItemHoverCard item={parentItem}>
                          <span className="font-medium cursor-help">{parentItem?.name || '-'}</span>
                        </ItemHoverCard>
                        {activeBom && <span className="text-xs bg-white/15 px-2 py-0.5 rounded">Rev {activeBom.revision} - {activeBom.status}</span>}
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {canSeeProcessCost && explosion?.fg_process_cost_per_unit > 0 && (
                          <span className="text-[11px] bg-[#FDF6B2] text-[#723B13] px-2 py-0.5 rounded mono font-medium" title="FG Parent Process Cost per unit">FG Process: {formatCurrency(explosion.fg_process_cost_per_unit)}</span>
                        )}
                        {canSeeRollupCost && <span className="mono text-sm font-bold">Total: {formatCurrency(totalCost)}</span>}
                        {activeBom && <button onClick={(e) => { e.stopPropagation(); fetchBomExplosion(activeBom.id); }} className="p-1 hover:bg-white/20 rounded" title="Refresh Costs (re-pull from BOM)" data-testid={`refresh-bom-${pid}`}><RefreshCw className="w-4 h-4" /></button>}
                        {activeBom && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Lazy-load explosion data on click — the parallel
                              // batch fetch on page load can take seconds for
                              // catalogues with many active BOMs, and previously
                              // hid the Print button until it finished. Now the
                              // button is always visible; we fetch (or reuse the
                              // cached explosion) right when the user clicks.
                              const exp = await ensureExplosion(activeBom.id);
                              if (!exp) {
                                toast.error('Could not load BOM data for printing.');
                                return;
                              }
                              const total = exp?.total_rollup_cost || 0;
                              printBomExplosion(parentItem, exp.explosion || [], total, activeBom, exp.fg_process_cost_per_unit || 0, exp.components_cost || 0);
                            }}
                            className="p-1 hover:bg-white/20 rounded"
                            title="Print BOM"
                            data-testid={`print-bom-${pid}`}
                          ><Printer className="w-4 h-4" /></button>
                        )}
                        {activeBom && <button onClick={(e) => { e.stopPropagation(); handleBomExport(activeBom.id); }} className="p-1 hover:bg-white/20 rounded" title="Export this BOM" data-testid={`export-bom-${pid}`}><Download className="w-4 h-4" /></button>}
                        <button onClick={(e) => { e.stopPropagation(); handleView(activeBom); }} className="p-1 hover:bg-white/20 rounded" title="View"><Eye className="w-4 h-4" /></button>
                        {canEdit && <button onClick={(e) => { e.stopPropagation(); handleEdit(activeBom); }} className="p-1 hover:bg-white/20 rounded" title="Edit"><Edit2 className="w-4 h-4" /></button>}
                        {canEdit && <button onClick={(e) => { e.stopPropagation(); handleRevise(activeBom); }} className="p-1 hover:bg-white/20 rounded" title="Revise"><GitBranch className="w-4 h-4" /></button>}
                        {user?.role === 'admin' && <button onClick={(e) => { e.stopPropagation(); handleDelete(activeBom); }} className="p-1 hover:bg-white/20 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>
                    
                    {/* Explosion Table — rendered only when panel is expanded */}
                    {expandedBomPanels[pid] && (
                    <div className="sticky-header-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F3F4F6] text-[#374151] text-xs uppercase">
                          <th className="text-left py-2 px-3 w-8"></th>
                          <th className="text-left py-2 px-2">Type</th>
                          <th className="text-left py-2 px-2">Part Number</th>
                          <th className="text-left py-2 px-2">Description</th>
                          <th className="text-right py-2 px-2">QTY</th>
                          <th className="text-left py-2 px-2">UOM</th>
                          <th className="text-left py-2 px-2">Routings</th>
                          {canSeeRollupCost && <th className="text-right py-2 px-2">Material Cost</th>}
                          {canSeeProcessCost && <th className="text-right py-2 px-2">Process Cost/Unit</th>}
                          {canSeeRollupCost && <th className="text-right py-2 px-2">Total/Unit</th>}
                          {canSeeRollupCost && <th className="text-right py-2 px-3">Extended Cost</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {explosionRows.length === 0 && (
                          <tr>
                            <td colSpan="8" className="text-center py-4 text-[#9CA3AF] text-xs">
                              {explosion === undefined
                                ? 'Loading explosion data…'
                                : 'No components yet — click the edit icon to add rows.'}
                            </td>
                          </tr>
                        )}
                        {explosionRows.map((row) => (
                          <tr key={row.key} className={`${rowColor(row.cat, row.level)} transition-colors hover:brightness-95 ${row.is_alternate ? 'opacity-60 italic' : ''}`}>
                            <td className="py-2 px-3" style={{ paddingLeft: `${row.level * 20}px` }}>
                              {row.hasChildren ? (
                                <button onClick={() => setExpandedItems(p => ({ ...p, [row.key]: !row.isExpanded }))} className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/10" data-testid={`toggle-${row.key}`}>
                                  {row.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              ) : (
                                <div className="w-5 h-5 flex items-center justify-center">
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: row.cat === 'raw_material' ? '#2563EB' : row.cat === 'component' ? '#9B1C1C' : '#6B7280' }} />
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${catBadge(row.cat)}`}>{catLabel(row.cat)}</span>
                            </td>
                            <td className="py-2 px-2 mono font-semibold text-[#111827]">{row.item?.part_number || '?'}</td>
                            <td className="py-2 px-2 text-[#374151]">
                              {row.item?.name || '-'}{row.is_alternate ? ' (alt)' : ''}
                              {row.child_bom_id && canEdit && (
                                <button onClick={(e) => { e.stopPropagation(); const childBom = boms.find(b => b.id === row.child_bom_id); if (childBom) handleEdit(childBom); }} className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-[#1E429F] hover:text-[#1D3557] bg-[#E1EFFE] hover:bg-[#C3DDFD] px-1.5 py-0.5 rounded" title={`Edit ${row.item?.part_number} BOM`} data-testid={`edit-child-bom-${row.key}`}>
                                  <Edit2 className="w-3 h-3" />Edit BOM
                                </button>
                              )}
                              {/* Per-SG download buttons — only on sub-assembly
                                  rows that have their own BOM. Lets the user
                                  pull the SG's own components in PDF or Excel
                                  without leaving the parent context. Buttons
                                  are scoped to `row.cat === 'sub_assembly'`
                                  AND `row.child_bom_id` (a BOM exists for it). */}
                              {row.cat === 'sub_assembly' && row.child_bom_id && (
                                <>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const childBom = boms.find(b => b.id === row.child_bom_id);
                                      if (!childBom) { toast.error('SG BOM not found.'); return; }
                                      const exp = await ensureExplosion(childBom.id);
                                      if (!exp) { toast.error('Could not load SG BOM.'); return; }
                                      const total = exp?.total_rollup_cost || 0;
                                      printBomExplosion(row.item, exp.explosion || [], total, childBom, exp.fg_process_cost_per_unit || 0, exp.components_cost || 0);
                                    }}
                                    className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-[#723B13] hover:text-[#5C2F0F] bg-[#FEF3C7] hover:bg-[#FDE68A] px-1.5 py-0.5 rounded"
                                    title={`Download PDF of ${row.item?.part_number} SG BOM`}
                                    data-testid={`sg-pdf-${row.key}`}
                                  >
                                    <Printer className="w-3 h-3" />PDF
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleBomExport(row.child_bom_id); }}
                                    className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-[#03543F] hover:text-[#03493A] bg-[#DEF7EC] hover:bg-[#BCF0DA] px-1.5 py-0.5 rounded"
                                    title={`Export ${row.item?.part_number} SG BOM to Excel`}
                                    data-testid={`sg-excel-${row.key}`}
                                  >
                                    <Download className="w-3 h-3" />Excel
                                  </button>
                                </>
                              )}
                            </td>
                            <td className="py-2 px-2 text-right mono font-medium">{formatQty(row.quantity, row.item?.unit_of_measure, uoms)}</td>
                            <td className="py-2 px-2 text-[#6B7280]">{row.item?.unit_of_measure || '-'}</td>
                            <td className="py-2 px-2">
                              {(row.routings || []).length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {row.routings.map((r, ri) => {
                                    const rn = typeof r === 'string' ? r : r.name;
                                    const rc = typeof r === 'string' ? 0 : (r.cost || 0);
                                    return <span key={ri} className="text-xs text-[#1E429F] font-medium">{rn}{canSeeProcessCost && rc > 0 && <span className="text-[#723B13] mono ml-1">({formatCurrency(rc)})</span>}</span>;
                                  })}
                                </div>
                              ) : <span className="text-xs text-[#9CA3AF]">-</span>}
                            </td>
                            {canSeeRollupCost && <td className="py-2 px-2 text-right mono">{formatCurrency(row.unit_cost)}</td>}
                            {canSeeProcessCost && <td className="py-2 px-2 text-right mono">{row.process_cost_per_unit > 0 ? <span className="text-[#723B13]">{formatCurrency(row.process_cost_per_unit)}</span> : <span className="text-[#9CA3AF]">-</span>}</td>}
                            {canSeeRollupCost && <td className="py-2 px-2 text-right mono font-semibold">{formatCurrency(row.total_cost_per_unit)}</td>}
                            {canSeeRollupCost && <td className="py-2 px-3 text-right mono font-medium">{formatCurrency(row.extended_cost)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                    )}
                    
                    {/* Other revisions */}
                    {expandedBomPanels[pid] && group.boms.length > 1 && (
                      <div className="px-4 py-2 bg-[#F9FAFB] border-t text-xs text-[#6B7280] flex items-center gap-2">
                        <span>Other revisions:</span>
                        {group.boms.filter(b => b.id !== activeBom?.id).map(b => (
                          <button key={b.id} onClick={() => handleView(b)} className="inline-flex items-center gap-1 hover:underline">
                            <span className={`status-badge text-[9px] status-${b.status}`}>Rev {b.revision}</span>{b.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* BOM Explosion View Dialog */}
      <Dialog open={!!viewBom} onOpenChange={(open) => { if (!open) { setViewBom(null); setBomExplosion(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center space-x-2">
              <FileStack className="w-5 h-5" />
              <span>BOM Explosion: {viewBom?.name}</span>
            </DialogTitle>
          </DialogHeader>
          
          {bomExplosion && (
            <div className="mt-4">
              <div className="bg-[#F3F4F6] p-3 rounded-sm mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="mono font-medium">{bomExplosion.parent_item?.part_number}</span>
                    <span className="text-[#4B5563] mx-2">-</span>
                    <span>{bomExplosion.parent_item?.name}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    {canSeeRollupCost && (
                      <span className="mono font-semibold text-[#1D3557]" data-testid="bom-total-cost">
                        Total Cost: {formatCurrency(bomExplosion.total_rollup_cost != null ? bomExplosion.total_rollup_cost : 0)}
                      </span>
                    )}
                    <span className={`status-badge status-${bomExplosion.bom?.status}`}>
                      Rev {bomExplosion.bom?.revision} &bull; {bomExplosion.bom?.status}
                    </span>
                  </div>
                </div>
              </div>

              {bomExplosion.explosion?.length === 0 ? (
                <div className="text-center py-8 text-[#4B5563]">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" />
                  <p>No components in this BOM</p>
                </div>
              ) : (
                <div className="border border-[#E5E7EB] rounded-sm overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#F3F4F6] text-xs font-semibold uppercase tracking-wider text-[#4B5563]">
                        <th className="text-left py-2 px-3">Part Number</th>
                        <th className="text-left py-2 px-3">Description</th>
                        <th className="text-right py-2 px-3">Qty</th>
                        <th className="text-left py-2 px-3">UOM</th>
                        {canSeeRollupCost && <th className="text-right py-2 px-3">Unit Cost</th>}
                        {canSeeRollupCost && <th className="text-right py-2 px-3">Extended Cost</th>}
                        <th className="text-left py-2 px-3">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderExplosionTree(bomExplosion.explosion)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
