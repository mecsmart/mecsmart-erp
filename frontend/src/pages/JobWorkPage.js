import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Plus, Truck, Package, CheckCircle2, ArrowRight, ArrowLeft, X, XCircle, FileText, Edit2, Printer, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { SearchableSelect } from '../components/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { SearchableItemSelect } from '../components/SearchableItemSelect';
import { letterheadCSS, buildLetterheadHTML } from '../utils/printHeader';
import { downloadHtmlAsPdf } from '../utils/pdfPrint';
import { fmtAmt } from '../utils/numberFormat';

export default function JobWorkPage() {
  const { user, hasPermission } = useAuth();
  const { formatCurrency, companySettings, currencySymbol } = useCompanySettings();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [challans, setChallans] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders');
  // Collapsible section state — Subcontract Orders open by default; others closed.
  const [sectionsOpen, setSectionsOpen] = useState({ orders: true, challans: false, receipts: false });
  // Per-row expansion state (shared across JW + DC tables). Default = collapsed
  // (single-line preview); user clicks the arrow toggle to expand a row.
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const toggleRowExpanded = (id) => setExpandedRows(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Honour the `?tab=` URL param coming from the sidebar dropdown (orders/challans/receipts).
  // Re-runs whenever `location.search` changes so switching dropdown items while already
  // on /job-work correctly updates the visible section.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'orders' || tab === 'challans' || tab === 'receipts') {
      setSectionsOpen({ orders: tab === 'orders', challans: tab === 'challans', receipts: tab === 'receipts' });
      setActiveTab(tab);
    }
  }, [location.search]);

  // Order dialog
  const [orderDialog, setOrderDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [orderForm, setOrderForm] = useState({ supplier_id: '', expected_return_date: '', processing_charges: 0, notes: '', lines: [{ item_id: '', quantity: 0, rate: 0 }], job_work_parts: [] });

  // DC dialog
  const [dcDialog, setDcDialog] = useState(false);
  const [dcOrder, setDcOrder] = useState(null);
  const [dcLines, setDcLines] = useState([]);
  const [dcWarehouse, setDcWarehouse] = useState('');

  // Manual DC dialog (standalone DC not tied to a Subcontract Order)
  const [manualDcDialog, setManualDcDialog] = useState(false);
  const [manualDcForm, setManualDcForm] = useState({
    id: null,  // present => edit mode
    supplier_id: '', dc_purpose: 'subcontract', warehouse_id: '', notes: '',
    lines: [{ item_id: '', item_search: '', quantity: 1, unit_price: 0, processing_charges: 0, notes: '', item_description: '' }]
  });
  // BOM preview cache keyed by item_id — populates the expandable "show RM
  // detail" sub-table beneath each selected Manual DC line. We fetch lazily
  // when the user clicks the chevron so we don't blow N+1 network calls
  // on dialog open for every line.
  const [bomPreviewCache, setBomPreviewCache] = useState({});
  const [bomPreviewOpen, setBomPreviewOpen] = useState({});  // { [idx]: bool }
  const toggleBomPreview = async (idx, itemId) => {
    const next = !bomPreviewOpen[idx];
    setBomPreviewOpen(prev => ({ ...prev, [idx]: next }));
    if (next && itemId && !bomPreviewCache[itemId]) {
      try {
        const { data } = await api.get(`/api/bom/by-item/${itemId}/preview`);
        setBomPreviewCache(prev => ({ ...prev, [itemId]: data }));
      } catch {
        setBomPreviewCache(prev => ({ ...prev, [itemId]: { has_bom: false, components: [] } }));
      }
    }
  };

  // DC Print T&C dialog
  const [dcPrintDialog, setDcPrintDialog] = useState(false);
  const [dcPrintTarget, setDcPrintTarget] = useState(null);
  // DC Send result dialog
  const [dcSendResult, setDcSendResult] = useState({ open: false, data: null });
  const defaultTC = [
    'Materials listed above are sent on returnable basis for job work / processing only.',
    'The subcontractor shall process and return the materials within the agreed timeline.',
    'Any damage, loss, or shortage of materials shall be the responsibility of the subcontractor.',
    'Quality of processed goods must meet the specifications agreed upon in the work order.',
    'This challan must accompany the materials during transit and be produced on demand.',
  ];
  const [dcTerms, setDcTerms] = useState(defaultTC.join('\n'));

  // Receipt dialog
  const [recDialog, setRecDialog] = useState(false);
  const [recOrder, setRecOrder] = useState(null);
  const [recLines, setRecLines] = useState([]);

  // JW GRN dialog (for SC with RM - receive via JW number)
  const [jwGrnDialog, setJwGrnDialog] = useState(false);
  const [jwGrnOrder, setJwGrnOrder] = useState(null);
  const [jwGrnLines, setJwGrnLines] = useState([]);
  const [jwGrnInvoiceNo, setJwGrnInvoiceNo] = useState('');
  const [jwGrnInvoiceDate, setJwGrnInvoiceDate] = useState('');

  const [recWarehouse, setRecWarehouse] = useState('');

  // Permission gating — view = list only; edit = process existing orders
  // (receive, convert, DC-create); create = brand-new subcontract order.
  // Admin (role === 'admin' or is_admin_group) ALWAYS bypasses module-level perms
  // because the `job_work` module is not always present in the user's permission
  // map (legacy admin records) — without this bypass all Edit/Send DC/Confirm
  // buttons would disappear for the admin user.
  const isAdmin = user?.role === 'admin' || user?.is_admin_group;
  const canCreate = isAdmin || (hasPermission ? hasPermission('job_work', 'create') : false);
  const canEdit = isAdmin || (hasPermission ? hasPermission('job_work', 'edit') : false) || canCreate;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, dcRes, recRes, supRes, itemRes, whRes] = await Promise.all([
        api.get('/api/job-work/orders'),
        api.get('/api/job-work/challans'),
        api.get('/api/job-work/receipts'),
        api.get('/api/suppliers'),
        api.get('/api/items'),
        api.get('/api/warehouses'),
      ]);
      setOrders(ordRes.data);
      setChallans(dcRes.data);
      setReceipts(recRes.data);
      setSuppliers(supRes.data);
      setItems(itemRes.data);
      setWarehouses(whRes.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Order CRUD
  const addOrderLine = () => setOrderForm({ ...orderForm, lines: [...orderForm.lines, { item_id: '', quantity: 0, rate: 0, item_description: '' }] });
  const removeOrderLine = (idx) => setOrderForm({ ...orderForm, lines: orderForm.lines.filter((_, i) => i !== idx) });
  const updateOrderLine = (idx, field, val) => { const lines = [...orderForm.lines]; lines[idx] = { ...lines[idx], [field]: val }; setOrderForm({ ...orderForm, lines }); };
  const addJWPart = () => setOrderForm({ ...orderForm, job_work_parts: [...orderForm.job_work_parts, { item_id: '', quantity: 0, charges: 0, item_description: '', process_name: '' }] });
  const removeJWPart = (idx) => setOrderForm({ ...orderForm, job_work_parts: orderForm.job_work_parts.filter((_, i) => i !== idx) });
  const updateJWPart = (idx, field, val) => { const parts = [...orderForm.job_work_parts]; parts[idx] = { ...parts[idx], [field]: val }; setOrderForm({ ...orderForm, job_work_parts: parts }); };

  // Auto-populate charges + RM lines from BOM when user selects an item for a JW part.
  // Charges resolution priority:
  //   1) Existing user-entered charges (don't clobber)
  //   2) For Job Card OS rows (have a process_name): the specific routing's cost
  //   3) Combined BOM process cost (Full MO-SC fallback)
  // Also auto-fills `orderForm.lines` (Raw Materials to Send) using the
  // BOM components of the selected part — mirrors JW-OS behaviour. Only
  // RM-category children are added; quantities are scaled by the part qty.
  const updateJWPartItem = async (idx, item_id) => {
    const parts = [...orderForm.job_work_parts];
    parts[idx] = { ...parts[idx], item_id };
    setOrderForm({ ...orderForm, job_work_parts: parts });
    if (!item_id) return;
    try {
      const [{ data: costs }, { data: preview }] = await Promise.all([
        api.get(`/api/bom/costs/${item_id}`),
        api.get(`/api/bom/by-item/${item_id}/preview`).catch(() => ({ data: { components: [] } })),
      ]);
      // Resolve charges using the existing priority rules.
      const cur = [...orderForm.job_work_parts];
      const existing = cur[idx] || {};
      const isJobCardOS = !!(editingOrder?.reference_operation_seqs?.length || editingOrder?.reference_operation_seq);
      let autoCharges = existing.charges;
      let autoDesc = existing.item_description;
      // Auto-fill description from the master item if user hasn't typed one.
      if (!autoDesc) {
        const it = items.find(i => i.id === item_id);
        if (it && it.description) autoDesc = it.description;
      }
      if (!autoCharges) {
        if (isJobCardOS && existing.process_name) {
          try {
            const { data: rc } = await api.get(`/api/bom/routing-cost`, { params: { item_id, process_name: existing.process_name } });
            autoCharges = rc.cost || 0;
          } catch { autoCharges = 0; }
        } else {
          autoCharges = costs.process_cost || 0;
        }
      }
      cur[idx] = {
        ...existing,
        item_id,
        charges: autoCharges,
        item_description: autoDesc || '',
        process_names: costs.process_names || [],
      };
      // Build RM auto-fill lines: only RM-category BOM children, qty scaled
      // by the part's quantity (1 if not set yet). Skip RMs already present
      // in orderForm.lines (by item_id) so reselecting the same part doesn't
      // duplicate rows; also keep any user-edited line untouched.
      const partQty = parseFloat(existing.quantity) || 1;
      const rmChildren = (preview.components || []).filter(c => c.category === 'raw_material');
      const newLines = [...orderForm.lines];
      // Drop placeholder empty lines so the auto-fill replaces them rather
      // than stacking under a blank row.
      const dedupedLines = newLines.filter(l => l.item_id);
      const existingRmIds = new Set(dedupedLines.map(l => l.item_id));
      for (const rm of rmChildren) {
        if (existingRmIds.has(rm.item_id)) {
          // bump quantity on the existing line (additive when multiple parts share an RM).
          const li = dedupedLines.findIndex(l => l.item_id === rm.item_id);
          if (li >= 0) {
            dedupedLines[li] = {
              ...dedupedLines[li],
              quantity: (parseFloat(dedupedLines[li].quantity) || 0) + rm.quantity * partQty,
            };
          }
          continue;
        }
        dedupedLines.push({
          item_id: rm.item_id,
          quantity: rm.quantity * partQty,
          rate: rm.unit_cost || 0,
          item_description: '',
        });
      }
      // Always leave at least one editable blank row at the bottom for the user.
      if (dedupedLines.length === 0 || dedupedLines[dedupedLines.length - 1].item_id) {
        dedupedLines.push({ item_id: '', quantity: 0, rate: 0, item_description: '' });
      }
      setOrderForm({ ...orderForm, job_work_parts: cur, lines: dedupedLines });
    } catch (e) { /* silent — autofill is best-effort */ }
  };

  const handleCreateOrder = async () => {
    // Distinct validations so the error message reflects the *actual* missing
    // field. The previous combined check ("Select supplier and add items") was
    // misleading for without_material SCs (no RM lines, only job_work_parts) —
    // it would fire even when the supplier was clearly selected.
    if (!orderForm.supplier_id) { alert('Please select a supplier (Party) to continue.'); return; }
    const hasLines = (orderForm.lines || []).filter(l => l.item_id).length > 0;
    const hasParts = (orderForm.job_work_parts || []).filter(p => p.item_id).length > 0;
    if (!hasLines && !hasParts) { alert('Please add at least one Job Work Part or Raw Material line.'); return; }
    try {
      const payload = {
        ...orderForm,
        // Strip empty lines/parts (rows where the user never picked an item) so
        // they don't get persisted as ghost lines on the backend.
        lines: (orderForm.lines || []).filter(l => l.item_id),
        job_work_parts: (orderForm.job_work_parts || []).filter(p => p.item_id),
        expected_return_date: orderForm.expected_return_date ? new Date(orderForm.expected_return_date).toISOString() : null,
      };
      if (editingOrder) {
        await api.put(`/api/job-work/orders/${editingOrder.id}`, payload);
      } else {
        await api.post('/api/job-work/orders', payload);
      }
      setOrderDialog(false);
      setEditingOrder(null);
      setOrderForm({ supplier_id: '', expected_return_date: '', processing_charges: 0, notes: '', lines: [{ item_id: '', quantity: 0, rate: 0 }], job_work_parts: [] });
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const handleEditOrder = (order) => {
    setEditingOrder(order);
    setOrderForm({
      supplier_id: order.supplier_id,
      expected_return_date: order.expected_return_date ? order.expected_return_date.split('T')[0] : '',
      processing_charges: order.processing_charges || 0,
      notes: order.notes || '',
      lines: order.lines?.map(l => ({ item_id: l.item_id, quantity: l.quantity, rate: l.rate || 0 })) || [],
      job_work_parts: order.job_work_parts?.map(p => ({
        item_id: p.item_id,
        quantity: p.quantity,
        charges: p.charges || 0,
        process_name: p.process_name || '',
        item_description: p.item_description || '',
        process_names: p.process_names || [],
      })) || [],
    });
    setOrderDialog(true);
  };

  const handleConfirmOrder = async (id) => {
    try { await api.post(`/api/job-work/orders/${id}/confirm`); fetchData(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed to confirm'); }
  };

  // Admin-only short close — terminates a running JW SC mid-way and releases
  // source MO operations that haven't been GRN'd. Triggers a confirm prompt
  // because the action is destructive: the SC's status becomes
  // `short_closed` (terminal) and linked draft POs are auto-cancelled.
  const handleShortCloseSC = async (order) => {
    const msg = `Short close ${order.order_number}?\n\nThis will:\n• Mark the SC as Short Closed (terminal).\n• Release all source MO operations that haven't been GRN'd back to "pending".\n• Cancel any linked draft Purchase Order.\n\nOperations with received quantity > 0 must be reversed via the GRN page first.`;
    if (!window.confirm(msg)) return;
    try {
      const { data } = await api.post(`/api/job-work/orders/${order.id}/short-close`);
      const releasedCount = (data?.released_operations || []).length;
      const cancelledPos = (data?.cancelled_pos || []).filter(Boolean);
      alert(
        `Short-closed ${order.order_number}.\n` +
        `${releasedCount} operation${releasedCount === 1 ? '' : 's'} released back to source MO.\n` +
        (cancelledPos.length ? `Cancelled draft PO${cancelledPos.length === 1 ? '' : 's'}: ${cancelledPos.join(', ')}` : '')
      );
      fetchData();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to short close');
    }
  };

  // DC
  const openDCDialog = (order) => {
    setDcOrder(order);
    setDcLines(order.lines.map(l => ({ item_id: l.item_id, quantity: l.quantity - (l.sent_quantity || 0), rate: l.rate || 0 })).filter(l => l.quantity > 0));
    setDcWarehouse('');
    setDcDialog(true);
  };

  // Open DC dialog for Job Card OS SC — each Part row carries charges_per_unit and
  // rm_cost_per_unit so the DC table can show: Part | HSN | Qty | UOM | Charges/Unit |
  // Total Charges | RM Cost/Unit | Total Amount (per user-specified DC format).
  const openJobOSDCDialog = async (order) => {
    try {
      const { data } = await api.get(`/api/job-work/orders/${order.id}/dc-lines`);
      if (!Array.isArray(data) || data.length === 0) {
        alert('Unable to expand parts for DC. Please check BOM setup.');
        return;
      }
      setDcOrder({ ...order, _is_job_os: true });
      setDcLines(data.map(l => ({
        item_id: l.item_id,
        quantity: l.quantity,
        charges_per_unit: l.charges_per_unit || 0,
        rm_cost_per_unit: l.rm_cost_per_unit || 0,
        item: l.item,
        // Fallback chain: server-provided override → item master description
        // → empty. So a part with a master-level "SFT: 0.37" description
        // shows up in the DC dialog without any retyping.
        item_description: l.item_description || (l.item?.description) || '',
        process_name: l.process_name || '',
        type: 'part',
      })));
      setDcWarehouse('');
      setDcDialog(true);
    } catch (e) { alert(e.response?.data?.detail || 'Failed to load DC lines'); }
  };

  const handleCreateDC = async () => {
    if (dcLines.length === 0) { alert('No items to send'); return; }
    try {
      const isJobOS = !!dcOrder?._is_job_os;
      // For Job Card OS: lines carry charges_per_unit + rm_cost_per_unit. Persist them in
      // the `rate` field (so existing print logic works) and in `processing_charges` so
      // the Print DC template can render Charges/Unit + RM Cost/Unit columns. Stock is
      // NOT deducted (parts going out are the finished Parts back for a next-op, which
      // are already in WIP accounting, not FG stock).
      const payloadLines = dcLines.map(l => isJobOS ? ({
        item_id: l.item_id,
        quantity: l.quantity,
        rate: l.rm_cost_per_unit || 0,
        processing_charges: l.charges_per_unit || 0,
        item_description: l.item_description || '',
        process_name: l.process_name || '',
      }) : ({ item_id: l.item_id, quantity: l.quantity, rate: l.rate || 0 }));
      const skipDeduct = isJobOS;
      const { data } = await api.post('/api/job-work/challans', { subcontract_order_id: dcOrder.id, lines: payloadLines, warehouse_id: dcWarehouse, notes: isJobOS ? 'Job Card OS DC' : '', skip_stock_deduct: skipDeduct });
      if (data.success === false && data.insufficient_materials) {
        setDcSendResult({ open: true, data: { message: data.message, consumed: [], dcNumber: '', isError: true, insufficient: data.insufficient_materials } });
        return;
      }
      // For Job Card OS, also mark SC as dc_created so the Create PO button disappears.
      if (isJobOS) {
        await api.put(`/api/job-work/orders/${dcOrder.id}`, { dc_created: true });
      }
      setDcDialog(false);
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create DC'); }
  };

  // Create DC for Job Card outsource (Part/SA items, no RM)
  const handleCreateDCForParts = async (order) => {
    if (!order.job_work_parts?.length) { alert('No parts to send'); return; }
    try {
      const partLines = order.job_work_parts.map(p => ({
        item_id: p.item_id,
        quantity: p.quantity,
        rate: p.charges || 0
      }));
      const { data } = await api.post('/api/job-work/challans', { subcontract_order_id: order.id, lines: partLines, warehouse_id: '', notes: 'Job Card outsource DC', skip_stock_deduct: true });
      if (data.success === false) {
        alert(data.message || 'Failed to create DC');
        return;
      }
      // Mark SC as dc_created
      await api.put(`/api/job-work/orders/${order.id}`, { dc_created: true });
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create DC'); }
  };

  // ================== MANUAL DC (standalone — DC → GRN Receipt flow) ==================
  const openManualDC = () => {
    setManualDcForm({
      id: null,
      supplier_id: '', dc_purpose: 'subcontract', warehouse_id: '', notes: '',
      dc_date: new Date().toISOString().slice(0, 10),
      lines: [{ item_id: '', item_search: '', quantity: 1, unit_price: 0, processing_charges: 0, notes: '', item_description: '' }]
    });
    setManualDcDialog(true);
  };

  // Open the same manual-DC dialog in EDIT mode, prefilled from the existing
  // draft DC. Only manual + draft DCs are editable; the row-level guard is in
  // the Edit button's render condition.
  const openEditManualDC = (dc) => {
    setManualDcForm({
      id: dc.id,
      supplier_id: dc.supplier_id || '',
      dc_purpose: dc.dc_purpose || 'subcontract',
      warehouse_id: dc.warehouse_id || '',
      notes: dc.notes || '',
      // dc_date stored as ISO date string on the doc; fall back to created_at's
      // date so the picker shows the original DC date instead of today.
      dc_date: (dc.dc_date || (dc.created_at ? new Date(dc.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))),
      lines: (dc.lines || []).map(l => ({
        item_id: l.item_id,
        item_search: '',
        quantity: l.quantity || 0,
        unit_price: l.unit_price || (items.find(i => i.id === l.item_id)?.unit_cost) || 0,
        processing_charges: l.processing_charges || 0,
        notes: l.notes || '',
        item_description: l.item_description || '',
      })),
    });
    setManualDcDialog(true);
  };

  const addManualDcLine = () => {
    setManualDcForm(prev => ({ ...prev, lines: [...prev.lines, { item_id: '', item_search: '', quantity: 1, unit_price: 0, processing_charges: 0, notes: '', item_description: '' }] }));
  };

  const removeManualDcLine = (idx) => {
    setManualDcForm(prev => prev.lines.length > 1 ? { ...prev, lines: prev.lines.filter((_, i) => i !== idx) } : prev);
  };

  const updateManualDcLine = (idx, patch) => {
    setManualDcForm(prev => ({ ...prev, lines: prev.lines.map((l, i) => i === idx ? { ...l, ...patch } : l) }));
  };

  const handleCreateManualDC = async () => {
    try {
      if (!manualDcForm.supplier_id) { alert('Select a supplier'); return; }
      const validLines = manualDcForm.lines.filter(l => l.item_id && l.quantity > 0);
      if (validLines.length === 0) { alert('Add at least one valid line (item + quantity)'); return; }
      const payload = {
        supplier_id: manualDcForm.supplier_id,
        dc_purpose: manualDcForm.dc_purpose || 'subcontract',
        warehouse_id: manualDcForm.warehouse_id || '',
        notes: manualDcForm.notes || '',
        dc_date: manualDcForm.dc_date || new Date().toISOString().slice(0, 10),
        lines: validLines.map(l => ({
          item_id: l.item_id,
          quantity: parseFloat(l.quantity),
          unit_price: parseFloat(l.unit_price || 0),
          processing_charges: parseFloat(l.processing_charges || 0),
          notes: l.notes || '',
          item_description: l.item_description || '',
        }))
      };
      const isEdit = !!manualDcForm.id;
      const { data } = isEdit
        ? await api.put(`/api/job-work/challans/manual/${manualDcForm.id}`, payload)
        : await api.post('/api/job-work/challans/manual', payload);
      alert(`Manual DC ${data.dc_number} ${isEdit ? 'updated' : 'created'} successfully`);
      setManualDcDialog(false);
      fetchData();
    } catch (e) {
      const err = e.response?.data?.detail;
      if (err && typeof err === 'object' && err.items) {
        alert(`Insufficient stock:\n${err.items.map(i => `• ${i.part_number} — needed ${i.required}, available ${i.available}`).join('\n')}`);
      } else {
        alert(err || 'Failed to save manual DC');
      }
    }
  };


  // Open JW GRN dialog — receive parts via JW number (SC with RM)
  const openJWGRNDialog = (order) => {
    const parts = (order.job_work_parts || []).map(p => {
      const pit = p.item || items.find(i => i.id === p.item_id) || {};
      return { item_id: p.item_id, part_number: pit.part_number || '', name: pit.name || '', quantity: p.quantity, received_quantity: 0, charges: p.charges || 0 };
    });
    setJwGrnOrder(order);
    setJwGrnLines(parts);
    setJwGrnInvoiceNo('');
    setJwGrnInvoiceDate('');
    setJwGrnDialog(true);
  };

  // Submit JW GRN — creates GRN directly from JW number
  const handleJWGRNSubmit = async () => {
    if (!jwGrnInvoiceNo.trim()) { alert('Supplier Invoice No. is mandatory'); return; }
    if (!jwGrnInvoiceDate) { alert('Invoice Date is mandatory'); return; }
    if (jwGrnLines.every(l => !l.received_quantity)) { alert('Enter received quantities'); return; }
    
    const totalQty = jwGrnLines.reduce((s, l) => s + (l.received_quantity || 0), 0);
    const totalCost = jwGrnLines.reduce((s, l) => s + (l.received_quantity || 0) * (l.charges || 0), 0);
    if (!window.confirm(`Confirm JW GRN Receipt?\n\nJW Order: ${jwGrnOrder?.order_number}\nTotal Qty: ${totalQty}\nTotal Cost: ₹${totalCost.toFixed(2)}\n\nReceived stock will be added to inventory.`)) return;
    
    try {
      const { data } = await api.post('/api/job-work/receive-grn', {
        subcontract_order_id: jwGrnOrder.id,
        supplier_invoice_no: jwGrnInvoiceNo,
        supplier_invoice_date: jwGrnInvoiceDate || null,
        lines: jwGrnLines.filter(l => l.received_quantity > 0).map(l => ({
          item_id: l.item_id,
          received_quantity: l.received_quantity,
          process_charges: l.charges
        }))
      });
      setJwGrnDialog(false);
      fetchData();
      alert(`GRN ${data.grn_number} created successfully!`);
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create GRN'); }
  };


  // Receipt
  const openReceiptDialog = (order) => {
    setRecOrder(order);
    const isWithMaterial = order.subcontract_type !== 'without_material';
    // For "with material": receive FG/SA/Parts (job_work_parts), NOT RM
    const sourceLines = (isWithMaterial && order.job_work_parts?.length > 0) ? order.job_work_parts : order.lines;
    setRecLines(sourceLines.map(l => {
      const pendingQty = (l.quantity || 0) - (l.received_quantity || 0);
      return { item_id: l.item_id, received_quantity: Math.max(pendingQty, 0), quality_result: 'accept', reject_qty: 0, rework_qty: 0 };
    }).filter(l => l.received_quantity > 0));
    setRecWarehouse('');
    setRecDialog(true);
  };

  const handleCreateReceipt = async () => {
    if (recLines.length === 0) { alert('No items to receive'); return; }
    try {
      await api.post('/api/job-work/receipts', { subcontract_order_id: recOrder.id, lines: recLines, warehouse_id: recWarehouse, notes: '' });
      setRecDialog(false);
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create receipt'); }
  };

  // Create PO from SC order (without material - vendor sources items)
  const handleCreatePOFromSC = async (order) => {
    try {
      const { data } = await api.post('/api/job-work/create-po', { subcontract_order_id: order.id });
      // ALL SC-derived POs are created in DRAFT status and must be approved on the
      // Purchase Orders page before dispatch/receipt.
      alert(`Purchase Order ${data.po_number} created in DRAFT status.\nApproval is required on the Purchase Orders page before dispatch.`);
      // Update SC order status to in_progress
      if (order.status === 'draft' || order.status === 'confirmed') {
        await api.put(`/api/job-work/orders/${order.id}`, { status: 'in_progress' });
      }
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create PO'); }
  };

  const openPrintDC = (dc) => {
    setDcPrintTarget(dc);
    setDcPrintDialog(true);
  };

  const printDC = (dc, customTerms) => {
    const supplier = dc.supplier || {};
    // Multi-line supplier address (one component per line) — vendors prefer
    // street/city/state/pin on separate lines for postal labels.
    const supplierAddrLines = [
      supplier.address,
      supplier.address_line2,
      [supplier.city, supplier.state].filter(Boolean).join(', '),
      supplier.pin_code ? `PIN: ${supplier.pin_code}` : '',
    ].filter(Boolean);
    const cs = companySettings || {};
    const companyAddr = [cs.address, cs.address_line2, cs.city, cs.state].filter(Boolean).join(', ') + (cs.pin_code ? ` - ${cs.pin_code}` : '');
    
    // Job Work Parts (FG/SA/Parts being processed)
    const jwParts = dc.order?.job_work_parts || [];
    const totalJobWorkCost = jwParts.reduce((s, p) => s + ((p.quantity || 0) * (p.charges || 0)), 0);
    
    // Build parent item info line for print header
    const parentItemName = dc.fg_item_name || dc.order?.fg_item_name || '';
    const parentItemQty = dc.order?.fg_quantity || '';
    const moNumbers = dc.order?.mo_numbers || [];
    const numMOs = moNumbers.length;
    
    // Build clean part names from job_work_parts items
    const partNames = jwParts.map(p => {
      const pit = p.item || items.find(it => it.id === p.item_id) || {};
      return pit.part_number ? `${pit.part_number} - ${pit.name || ''}` : '';
    }).filter(Boolean);
    const partTitle = partNames.length > 0 ? partNames.join(', ') : (parentItemName || '');
    
    // RM lines
    const totalRMCost = dc.lines.reduce((s, l) => {
      const it = l.item || items.find(i => i.id === l.item_id);
      const rate = l.unit_price || it?.unit_cost || l.rate || 0;
      return s + (l.quantity * rate);
    }, 0);
    
    // Rename title based on SC type. We track BOTH a full long form (for
    // the prominent two-line header at top-right of the print) and a
    // short single-line form (for the narrow info-bar column where
    // wrapping is not allowed).
    const scType = dc.order?.subcontract_type;
    const hasJobParts = (dc.order?.job_work_parts || []).length > 0;
    const isJobOS = scType === 'without_material' && hasJobParts;
    let dcTitleFull = 'Delivery Challan';
    let dcTitleShort = 'Delivery Challan';
    if (scType === 'with_material') {
      dcTitleFull = 'Job Order Cum Delivery Challan';
      dcTitleShort = 'Job Order Cum DC';
    } else if (scType === 'without_material' && hasJobParts) {
      dcTitleFull = 'Job Work Order Cum Delivery Challan';
      dcTitleShort = 'Job Order Cum DC';
    }
    // Back-compat alias used by some downstream strings (PDF filename etc.)
    const dcTitle = dcTitleShort;
    
    const accent = '#1D3557';
    // Created-by — show ONLY the persisted creator (resolved server-side
    // into `dc.created_by_name`). Never fall back to the user currently
    // taking the print, since that would mislabel who actually issued
    // this DC.
    const createdBy = dc.created_by_name || dc.creator_name || '-';
    const docDate = dc.dc_date || dc.created_at;
    const expectedReturn = dc.order?.expected_return_date;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    // Shipping-From warehouse — resolved client-side from the warehouses
    // already loaded in component state. Falls back to the company's own
    // address (registered office) when no warehouse was tagged on the DC.
    const shipWh = (dc.warehouse_id && warehouses.find(w => w.id === dc.warehouse_id)) || null;
    const shipFromLines = shipWh ? [
      shipWh.name,
      shipWh.location,
      shipWh.address,
    ].filter(Boolean) : [
      cs.name || cs.company_name,
      cs.address,
      cs.address_line2,
      [cs.city, cs.state, cs.pin_code].filter(Boolean).join(', '),
      cs.gstin ? `GSTIN: ${cs.gstin}` : '',
    ].filter(Boolean);

    // Inline number-to-words (Indian numbering — Lakh/Crore). Used to
    // print the Total RM Cost in words on the DC totals block.
    const numberToWords = (num) => {
      if (!num || num <= 0) return 'Zero Rupees Only';
      const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
      const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
      const scales = ['','Thousand','Lakh','Crore'];
      const convertGroup = (g) => {
        if (g === 0) return '';
        if (g < 20) return ones[g];
        if (g < 100) return tens[Math.floor(g / 10)] + (g % 10 ? ' ' + ones[g % 10] : '');
        return ones[Math.floor(g / 100)] + ' Hundred' + (g % 100 ? ' and ' + convertGroup(g % 100) : '');
      };
      let n = Math.floor(num);
      const groups = [];
      groups.push(n % 1000); n = Math.floor(n / 1000);
      while (n > 0) { groups.push(n % 100); n = Math.floor(n / 100); }
      const parts = groups.map((g, i) => g ? convertGroup(g) + (scales[i] ? ' ' + scales[i] : '') : '').filter(Boolean).reverse();
      const main = parts.join(' ');
      const decimal = Math.round((num - Math.floor(num)) * 100);
      return main + ' Rupees' + (decimal > 0 ? ' and ' + convertGroup(decimal) + ' Paise' : '') + ' Only';
    };
    // Aggregate qty across all RM lines for the "Total Qty" footer cell.
    const totalRMQty = (dc.lines || []).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0);
    const totalRMCostInWords = numberToWords(totalRMCost);

    // Compact running-band — appears on page 2+ (page 1 masks it via
    // .page-one-cover {margin-top:-17mm}). Same trick as the Quotation /
    // Tax Invoice / PO prints.
    const rbHTML = `<div class="running-band">
      ${cs.logo_data ? `<img src="${esc(cs.logo_data)}" class="rb-logo" alt="logo"/>` : ''}
      <div class="rb-center">
        <div class="rb-name">${esc(cs.name || cs.company_name || 'Company')}</div>
        ${companyAddr ? `<div class="rb-meta">${esc(companyAddr)}</div>` : ''}
        ${cs.gstin ? `<div class="rb-gst">GSTIN: ${esc(cs.gstin)}</div>` : ''}
      </div>
      <div class="rb-right">
        <div class="rb-title">${esc(dcTitleShort)}</div>
        <div class="rb-docno">${esc(dc.dc_number)}</div>
      </div>
    </div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${dcTitle} - ${dc.dc_number}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;margin:0;padding:0}
      /* Page canvas — EXACT match to Quotation: 780px max-width with
         32px top, 8px side, 20px bottom padding. Combined with @page
         4mm margin below, the content uses nearly the full A4 width. */
      .page{max-width:780px;margin:0 auto;padding:32px 8px 20px;box-sizing:border-box}
      /* Header — left brand block + right doc-info, just like Quotation. */
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
      .brand{flex:1;display:flex;gap:12px;align-items:flex-start}
      .logo-wrap{flex-shrink:0;display:flex;align-items:center;justify-content:center}
      .logo-img{max-height:72px;max-width:180px;object-fit:contain}
      .logo-fb{width:60px;height:60px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px}
      /* Company name 17px (Quotation parity). */
      .cn{font-size:17px;font-weight:800;color:#0f172a;margin:0 0 2px}
      .tg{font-size:10px;color:${accent};font-style:italic;margin-bottom:4px;letter-spacing:0.3px}
      .addr{font-size:10px;color:#475569;line-height:1.5}
      /* Document title — full long form, wraps to TWO lines on the right
         of the header. Reduced to 11px so "Job Work Order Cum Delivery
         Challan" fits as a compact two-line label without crowding the
         brand block. max-width prevents it from stealing horizontal space. */
      .title{font-size:11px;font-weight:800;color:${accent};letter-spacing:0.5px;text-align:right;margin:0;text-transform:uppercase;line-height:1.3;max-width:150px;margin-left:auto;white-space:normal}
      .docno{font-size:14px;font-weight:700;color:#0f172a;text-align:right;margin-top:2px}
      .meta{font-size:10px;color:#475569;text-align:right;margin-top:2px}
      /* Reference block — sits directly under the doc number on the right.
         Small, right-aligned, slightly muted so it doesn't visually compete
         with the doc title. */
      .ref-block{margin-top:6px;text-align:right;font-size:10px;color:#475569;line-height:1.5}
      .ref-block .ref-line{white-space:nowrap}
      .ref-block .ref-lab{color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-size:9px;margin-right:3px}
      .ref-block strong{color:#0f172a}
      /* Info bar — Quotation parity: padding 10x14, label 9px, value 13px. */
      .info-bar{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;background:${accent};color:#fff;margin-top:14px;border-radius:2px;overflow:hidden}
      .info-bar .col{padding:10px 14px;border-right:1px solid rgba(255,255,255,0.15)}
      .info-bar .col:last-child{border-right:none}
      .info-bar .lab{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.75);margin-bottom:2px}
      .info-bar .val{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .addr-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:16px 0}
      /* When only Vendor + Shipping are shown (Reference moved to header),
         the row collapses to 2 equal columns with the same gutter. */
      .addr-row.addr-row-2{grid-template-columns:1fr 1fr;gap:20px}
      .box h4{font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;color:#0f172a;border-bottom:2px solid ${accent};padding-bottom:3px;display:inline-block}
      .box .name{font-size:13px;font-weight:700;color:#0f172a}
      .box .line{font-size:10px;color:#475569;line-height:1.5;white-space:pre-line}
      h4.section{font-size:10px;color:${accent};text-transform:uppercase;letter-spacing:1px;margin:18px 0 6px;font-weight:700}
      table.dc-items{width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed}
      table.dc-items thead th{background:${accent};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;padding:8px 6px;font-weight:600;border:none;text-align:center;word-break:break-word;line-height:1.25;vertical-align:middle}
      table.dc-items tbody td{border-bottom:1px solid #e2e8f0;padding:8px 6px;font-size:11px;color:#0f172a;vertical-align:top;word-break:break-word;overflow-wrap:anywhere}
      table.dc-items tbody tr:last-child td{border-bottom:2px solid ${accent}}
      table.dc-items tbody tr.total-row td{background:#f8fafc;font-weight:700;color:#0f172a;border-bottom:2px solid ${accent}}
      /* Numeric / amount columns — darker + bolder so quantities, rates and
         amounts pop out from the lighter description text. Applies to all
         .mono cells inside dc-items body. */
      table.dc-items tbody td.mono{color:#000;font-weight:600}
      table.dc-items tbody tr.total-row td.mono{color:#000;font-weight:800}
      td .sub-text{color:#475569}
      .mono{font-family:'Courier New',monospace}
      .text-right{text-align:right}
      .text-center{text-align:center}
      /* Page-2+ running-band — EXACT copy of PO/Quotation's running header. */
      .print-doc{width:100%;border-collapse:collapse}
      .print-doc > thead{display:table-header-group}
      .print-doc > tbody > tr > td{padding:0;vertical-align:top}
      .print-doc > thead > tr > td{padding:0 0 3mm 0;vertical-align:top}
      .running-band{display:flex;align-items:center;gap:10px;padding:3px 10px;height:14mm;box-sizing:border-box;border-bottom:1px solid ${accent};background:#fff;font-family:'Helvetica Neue',Arial,sans-serif}
      .running-band .rb-logo{height:28px;width:auto;max-width:72px;object-fit:contain;flex-shrink:0}
      .running-band .rb-center{flex:1;line-height:1.2}
      .running-band .rb-name{font-size:11px;font-weight:800;color:#0f172a}
      .running-band .rb-meta{font-size:8.5px;color:#475569;margin-top:1px}
      .running-band .rb-gst{font-size:8.5px;color:${accent};font-weight:700;margin-top:1px}
      .running-band .rb-right{text-align:right;flex-shrink:0}
      .running-band .rb-title{font-size:10px;font-weight:800;color:${accent};letter-spacing:0.3px;text-transform:uppercase}
      .running-band .rb-docno{font-size:9.5px;color:#0f172a;font-weight:700;margin-top:1px}
      .page-one-cover{margin-top:-17mm;background:#fff;position:relative;z-index:5}
      /* Terms */
      .terms{margin-top:18px;padding:12px 14px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;font-size:10px;color:#475569;line-height:1.6;white-space:pre-line}
      .terms h4{font-size:10px;color:${accent};text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;font-weight:700}
      .footer{margin-top:30px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;font-size:10px}
      .sign-box{border-top:1px solid #0f172a;padding-top:4px;text-align:center;margin-top:40px;color:#475569}
      @media print{
        @page{size:A4;margin:4mm 4mm 6mm 4mm;@bottom-right{content:"Page " counter(page) " of " counter(pages);font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;color:#64748b;padding-right:4mm}}
        body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0}
        .page-one-cover{margin-top:-25mm;background:#fff;position:relative;z-index:5}
      }
    </style></head><body>
    <table class="print-doc">
      <thead><tr><td>${rbHTML}</td></tr></thead>
      <tbody><tr><td>
    <div class="page-one-cover">
    <div class="page">
    <!-- Header: logo + company on left, doc title on right -->
    <div class="header">
      <div class="brand">
        ${cs.logo_data ? `<img src="${esc(cs.logo_data)}" class="logo-img"/>` : `<div class="logo-fb">${esc((cs.name || cs.company_name || 'C').charAt(0).toUpperCase())}</div>`}
        <div>
          <div class="cn">${esc(cs.name || cs.company_name || 'Company')}</div>
          ${cs.tagline ? `<div class="tg">${esc(cs.tagline)}</div>` : ''}
          ${cs.address ? `<div class="addr">${esc(cs.address)}</div>` : ''}
          ${cs.address_line2 ? `<div class="addr">${esc(cs.address_line2)}</div>` : ''}
          ${(cs.city || cs.state || cs.pin_code) ? `<div class="addr">${esc([cs.city, cs.state, cs.pin_code].filter(Boolean).join(', '))}</div>` : ''}
          ${(cs.phone || cs.email) ? `<div class="addr">${cs.phone ? 'Phone: ' + esc(cs.phone) : ''}${cs.phone && cs.email ? ' | ' : ''}${cs.email ? esc(cs.email) : ''}</div>` : ''}
          ${cs.gstin ? `<div class="addr"><strong>GSTIN: ${esc(cs.gstin)}</strong></div>` : ''}
        </div>
      </div>
      <div>
        <div class="title">${esc(dcTitleFull)}</div>
        <div class="docno">${esc(dc.dc_number)}</div>
        ${dc.order?.order_number ? `<div class="ref-block">
          <div class="ref-line"><span class="ref-lab">JW Order:</span> <strong>${esc(dc.order.order_number)}</strong></div>
          ${dc.order?.subcontract_type ? `<div class="ref-line"><span class="ref-lab">Type:</span> ${esc(dc.order.subcontract_type.replace('_',' ').toUpperCase())}</div>` : ''}
          <div class="ref-line"><span class="ref-lab">DC Status:</span> <strong>${esc((dc.status || '').toUpperCase())}</strong></div>
        </div>` : `<div class="ref-block">
          <div class="ref-line"><span class="ref-lab">DC Status:</span> <strong>${esc((dc.status || '').toUpperCase())}</strong></div>
        </div>`}
        ${(dc.status || '').toLowerCase() === 'draft' ? `<div style="display:inline-block;margin-top:4px;padding:2px 10px;background:#FEE2E2;color:#B91C1C;border:1px solid #FCA5A5;border-radius:3px;font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Draft</div>` : ''}
      </div>
    </div>

    <!-- Info bar: DC No · Date · Expected Receive · Created By -->
    <div class="info-bar">
      <div class="col"><div class="lab">${esc(dcTitleShort)} No</div><div class="val">${esc(dc.dc_number)}</div></div>
      <div class="col"><div class="lab">Date</div><div class="val">${docDate ? new Date(docDate).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '-'}</div></div>
      <div class="col"><div class="lab">Expected Receive</div><div class="val">${expectedReturn ? new Date(expectedReturn).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '-'}</div></div>
      <div class="col"><div class="lab">Created By</div><div class="val">${esc(createdBy)}</div></div>
    </div>

    <!-- Subcontractor (Vendor) on the LEFT, Shipping From on the RIGHT.
         Per user spec — vendor takes prominence; shipping origin sits next to it. -->
    <div class="addr-row addr-row-2">
      <div class="box">
        <h4>Subcontractor / Vendor</h4>
        <div class="name">${esc(supplier.name || '-')}</div>
        ${supplierAddrLines.length ? supplierAddrLines.map(l => `<div class="line">${esc(l)}</div>`).join('') : ''}
        ${supplier.gstin ? `<div class="line"><strong>GSTIN:</strong> <span class="mono">${esc(supplier.gstin)}</span></div>` : ''}
        ${supplier.phone ? `<div class="line">Ph: ${esc(supplier.phone)}</div>` : ''}
      </div>
      <div class="box">
        <h4>Shipping From</h4>
        ${shipFromLines.length ? `<div class="name">${esc(shipFromLines[0] || '-')}</div>${shipFromLines.slice(1).map(l => `<div class="line">${esc(l)}</div>`).join('')}` : `<div class="line">-</div>`}
      </div>
    </div>
    
    ${isJobOS ? `
    <h4 class="section">Job Work Part Details</h4>
    <table class="dc-items">
      <colgroup>
        <col style="width:5%">
        <col style="width:34%">
        <col style="width:9%">
        <col style="width:6%">
        <col style="width:6%">
        <col style="width:9%">
        <col style="width:10%">
        <col style="width:10%">
        <col style="width:11%">
      </colgroup>
      <thead><tr>
        <th>Sl.</th>
        <th>Part No., Name &amp; Description</th>
        <th>HSN</th>
        <th class="text-right">Qty</th>
        <th>UOM</th>
        <th class="text-right">Charges/Unit</th>
        <th class="text-right">Total Charges</th>
        <th class="text-right">RM Cost/Unit</th>
        <th class="text-right">Total Amount</th>
      </tr></thead>
      <tbody>
      ${(() => {
        // Build Part lookup from SC.job_work_parts so older DC lines (created before
        // processing_charges was persisted on DC lines) can still show Charges/Unit.
        const jwByItem = {};
        (dc.order?.job_work_parts || []).forEach(p => { jwByItem[p.item_id] = p; });
        // Prefer DC line-level values; fall back to SC job_work_parts by item_id;
        // and finally fall back to the item master's `description` so items that
        // have a master-level spec (e.g. "SFT: 0.37") always print without
        // needing the user to retype it on every DC line.
        const rows = (dc.lines && dc.lines.length) ? dc.lines.map(l => {
          const it = l.item || items.find(i => i.id === l.item_id) || {};
          const qty = l.quantity || 0;
          const fallback = jwByItem[l.item_id] || {};
          const charges = l.processing_charges || fallback.charges || 0;
          const rmCost = l.rate || fallback.bom_rollup_cost || 0;
          const description = l.item_description || fallback.item_description || it.description || '';
          const processName = l.process_name || fallback.process_name || '';
          return { it, qty, charges, rmCost, description, processName };
        }) : jwParts.map(p => {
          const pit = p.item || items.find(it => it.id === p.item_id) || {};
          return { it: pit, qty: p.quantity || 0, charges: p.charges || 0, rmCost: p.bom_rollup_cost || pit.unit_cost || 0, description: p.item_description || pit.description || '', processName: p.process_name || '' };
        });
        const body = rows.map((r, i) => {
          const totalCharges = r.qty * r.charges;
          const totalAmount = r.qty * r.rmCost;
          const partCell = `<div style="font-weight:600">${r.it.part_number || '-'}, ${r.it.name || '-'}</div>` +
            (r.processName ? `<div class="sub-text" style="font-size:9px;color:#723B13;">Op: ${r.processName}</div>` : '') +
            (r.description ? `<div class="sub-text" style="font-size:9px;color:#475569;">${r.description}</div>` : '');
          return `<tr><td class="text-center mono">${i+1}</td><td>${partCell}</td><td class="mono" style="white-space:nowrap">${r.it.hsn_code || '-'}</td><td class="text-right mono">${r.qty}</td><td class="text-center">${r.it.unit_of_measure || 'Nos'}</td><td class="text-right mono" style="white-space:nowrap">${currencySymbol}${fmtAmt(r.charges)}</td><td class="text-right mono" style="white-space:nowrap">${currencySymbol}${fmtAmt(totalCharges)}</td><td class="text-right mono" style="white-space:nowrap">${currencySymbol}${fmtAmt(r.rmCost)}</td><td class="text-right mono" style="white-space:nowrap">${currencySymbol}${fmtAmt(totalAmount)}</td></tr>`;
        }).join('');
        const grandCharges = rows.reduce((s, r) => s + r.qty * r.charges, 0);
        const grandAmount = rows.reduce((s, r) => s + r.qty * r.rmCost, 0);
        const grandQty = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
        const totalRow = `<tr class="total-row">
          <td colspan="3" class="text-right" style="font-weight:700">Totals</td>
          <td class="text-right mono" style="font-weight:800;white-space:nowrap">${grandQty}</td>
          <td></td>
          <td></td>
          <td class="text-right mono" style="font-weight:800;white-space:nowrap">${currencySymbol}${fmtAmt(grandCharges)}</td>
          <td></td>
          <td class="text-right mono" style="font-weight:800;white-space:nowrap">${currencySymbol}${fmtAmt(grandAmount)}</td>
        </tr>
        <tr class="amt-words-row">
          <td colspan="9" style="background:#f8fafc;padding:8px 10px;border-bottom:2px solid ${accent};font-size:10px;color:#0f172a;font-style:italic">
            <strong style="color:${accent};font-style:normal;text-transform:uppercase;letter-spacing:0.5px;font-size:9px;margin-right:6px">Total Amount in Words:</strong>${esc(numberToWords(grandAmount))}
          </td>
        </tr>`;
        return body + totalRow;
      })()}
      </tbody>
    </table>
    ` : `
    ${jwParts.length > 0 ? `
    <h4 class="section">Job Work Part Details</h4>
    <table>
      <thead><tr><th>Sl. No.</th><th>Part No. & Name</th><th>Process</th><th>HSN</th><th class="text-right">QTY</th><th class="text-right">Charges</th><th class="text-right">Total Amount</th></tr></thead>
      <tbody>
      ${jwParts.map((p, i) => {
        const pit = p.item || items.find(it => it.id === p.item_id) || {};
        const charges = p.charges || 0;
        const total = (p.quantity || 0) * charges;
        return `<tr><td>${i+1}</td><td>${pit.part_number || '-'}, ${pit.name || '-'}</td><td>${p.process_name || (p.process_names || []).join(', ') || '-'}</td><td>${pit.hsn_code || '-'}</td><td class="text-right mono">${p.quantity || 0}</td><td class="text-right mono">${currencySymbol}${fmtAmt(charges)}</td><td class="text-right mono">${currencySymbol}${fmtAmt(total)}</td></tr>`;
      }).join('')}
      <tr class="total-row"><td colspan="6" class="text-right">Total Job Work Cost</td><td class="text-right mono">${currencySymbol}${fmtAmt(totalJobWorkCost)}</td></tr>
      </tbody>
    </table>
    ` : ''}
    
    <div class="section-title">Raw Material Issued</div>
    <table class="dc-items">
      <colgroup>
        <col style="width:5%">
        <col style="width:42%">
        <col style="width:10%">
        <col style="width:8%">
        <col style="width:6%">
        <col style="width:13%">
        <col style="width:16%">
      </colgroup>
      <thead><tr>
        <th>Sl.</th>
        <th>Part No., Name &amp; Description</th>
        <th>HSN</th>
        <th class="text-right">Qty</th>
        <th>UOM</th>
        <th class="text-right">Rate/Unit</th>
        <th class="text-right">Total RM Cost</th>
      </tr></thead>
      <tbody>
      ${dc.lines.map((l, i) => {
        const it = l.item || items.find(x => x.id === l.item_id) || {};
        const rate = l.unit_price || it.unit_cost || l.rate || 0;
        const uom = l.unit || it.unit_of_measure || 'pcs';
        const cost = l.quantity * rate;
        // Fallback chain: line override → item master description.
        const desc = l.item_description || it.description || '';
        const partCell = `<div style="font-weight:600">${it.part_number || '-'}, ${it.name || '-'}</div>` +
          (desc ? `<div class="sub-text" style="font-size:9px;color:#475569;">${desc}</div>` : '');
        return `<tr><td class="text-center mono">${i+1}</td><td>${partCell}</td><td class="mono" style="white-space:nowrap">${it.hsn_code || '-'}</td><td class="text-right mono">${l.quantity}</td><td class="text-center">${uom}</td><td class="text-right mono" style="white-space:nowrap">${currencySymbol}${fmtAmt(rate)}</td><td class="text-right mono" style="white-space:nowrap">${currencySymbol}${fmtAmt(cost)}</td></tr>`;
      }).join('')}
      <tr class="total-row">
        <td colspan="3" class="text-right" style="font-weight:700">Totals</td>
        <td class="text-right mono" style="font-weight:800;white-space:nowrap">${totalRMQty}</td>
        <td></td>
        <td class="text-right" style="font-weight:700">Total RM Cost</td>
        <td class="text-right mono" style="font-weight:800;white-space:nowrap">${currencySymbol}${fmtAmt(totalRMCost)}</td>
      </tr>
      <tr class="amt-words-row">
        <td colspan="7" style="background:#f8fafc;padding:8px 10px;border-bottom:2px solid ${accent};font-size:10px;color:#0f172a;font-style:italic">
          <strong style="color:${accent};font-style:normal;text-transform:uppercase;letter-spacing:0.5px;font-size:9px;margin-right:6px">Total RM Cost in Words:</strong>${esc(totalRMCostInWords)}
        </td>
      </tr>
      </tbody>
    </table>`}
    
    ${dc.notes ? `<p style="margin-bottom:10px;"><strong>Notes:</strong> ${dc.notes}</p>` : ''}
    <div class="terms-box">
      <h3>Terms & Conditions</h3>
      <ol>
        ${(customTerms || '').split('\n').filter(l => l.trim()).map(l => `<li>${l.trim()}</li>`).join('')}
      </ol>
    </div>
    <div class="footer">
      <div><div class="sign-box">Prepared By</div></div>
      <div><div class="sign-box">Dispatched By</div></div>
      <div><div class="sign-box">Received By (Subcontractor)</div></div>
    </div>
    <p style="text-align:center;font-size:9px;color:#aaa;margin-top:20px;">Printed on ${new Date().toLocaleString()}</p>
    </div>
    </div>
    </td></tr></tbody>
    </table>
    </body></html>`;
    downloadHtmlAsPdf(html, `${dcTitle.replace(/\s+/g, '-')}-${dc.dc_number || 'document'}.pdf`, { preview: true, draft: (dc.status || '').toLowerCase() === 'draft' });
  };

  const getStatusColor = (s) => {
    switch (s) {
      case 'draft': return 'bg-[#F3F4F6] text-[#4B5563]';
      case 'confirmed': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'in_progress': return 'bg-[#FDF6B2] text-[#723B13]';
      case 'completed': return 'bg-[#DEF7EC] text-[#03543F]';
      case 'sent': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'received': return 'bg-[#DEF7EC] text-[#03543F]';
      default: return 'bg-[#F3F4F6] text-[#4B5563]';
    }
  };

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>;

  return (
    <div className="space-y-3" data-testid="jobwork-page">
      <div className="flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30 bg-white py-2 border-b border-[#E5E7EB] -mx-6 px-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold font-[Chivo] text-[#111827]">
            Job Work
            <span className="text-[#6B7280] font-medium"> / </span>
            <span className="text-[#1D3557]">
              {activeTab === 'orders' && <>Subcontract Orders <span className="text-xs text-[#6B7280] font-normal">({orders.length})</span></>}
              {activeTab === 'challans' && <>Delivery Challans <span className="text-xs text-[#6B7280] font-normal">({challans.length})</span></>}
              {activeTab === 'receipts' && <>Receipts <span className="text-xs text-[#6B7280] font-normal">({receipts.length})</span></>}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'orders' && canCreate && (
            <button onClick={() => setOrderDialog(true)} className="btn-primary flex items-center space-x-2" data-testid="create-jw-order-btn">
              <Plus className="w-4 h-4" /><span>New Subcontract Order</span>
            </button>
          )}
          {activeTab === 'challans' && canCreate && (
            <button type="button" onClick={openManualDC} className="btn-primary flex items-center space-x-2" data-testid="create-manual-dc-btn">
              <Plus className="w-4 h-4" /><span>Create DC</span>
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card-flat p-3"><p className="kpi-label">Active Orders</p><p className="kpi-value">{orders.filter(o => ['confirmed', 'in_progress'].includes(o.status)).length}</p></div>
        <div className="card-flat p-3"><p className="kpi-label">Materials Sent</p><p className="kpi-value">{challans.length}</p></div>
        <div className="card-flat p-3"><p className="kpi-label">Materials Received</p><p className="kpi-value">{receipts.length}</p></div>
        <div className="card-flat p-3"><p className="kpi-label">Processing Charges</p><p className="kpi-value">{formatCurrency(orders.reduce((s, o) => s + (o.processing_charges || 0), 0))}</p></div>
      </div>

      {/* Sections are now rendered one at a time based on the sidebar's
          `?tab=` choice — instead of stacking accordions on the page, the
          user sees ONLY the section they clicked into (orders / challans /
          receipts). The collapsible accordion summaries / chevrons have
          been removed; the section title is just the card header. */}
      <div className="space-y-3">
        {/* Subcontract Orders */}
        {activeTab === 'orders' && (
        <div className="card-flat">
          <div className="px-4 pb-4 pt-4">
          <div className="card-flat overflow-hidden">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]"><Truck className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No subcontract orders</p></div>
            ) : (
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="jw-orders-table">
                  <thead><tr>
                    <th style={{width:'90px'}}>Order #</th>
                    <th style={{width:'80px'}}>MO #</th>
                    <th style={{minWidth:'220px'}}>FG/SA/Part</th>
                    <th style={{width:'100px'}}>Supplier</th>
                    <th style={{minWidth:'240px'}}>RM</th>
                    <th style={{width:'70px'}}>Sent/Total</th>
                    <th style={{width:'60px'}}>Received</th>
                    <th style={{width:'80px'}} className="text-right">Charges</th>
                    <th style={{width:'80px'}}>Status</th>
                    <th style={{width:'80px'}}>Return Date</th>
                    <th style={{width:'180px'}}>Actions</th>
                  </tr></thead>
                  <tbody>
                    {orders.map(o => {
                      const totalQty = o.lines.reduce((s, l) => s + l.quantity, 0);
                      const sentQty = o.lines.reduce((s, l) => s + (l.sent_quantity || 0), 0);
                      const recvQty = o.lines.reduce((s, l) => s + (l.received_quantity || 0), 0);
                      // Explicit per-row expand toggle. Default = collapsed
                      // (max-h 36px shows just the first line). User clicks the
                      // chevron in the Order # cell to expand/collapse.
                      const isExpanded = expandedRows.has(o.id);
                      const collapseCls = isExpanded
                        ? "overflow-visible"
                        : "overflow-hidden max-h-[36px]";
                      return (
                        <tr key={o.id} data-testid={`jw-order-row-${o.id}`} className="align-top">
                          <td className="mono font-medium">
                            <button
                              onClick={() => toggleRowExpanded(o.id)}
                              className="mr-1 text-[#9CA3AF] hover:text-[#1D3557] align-middle"
                              title={isExpanded ? 'Collapse row' : 'Expand row'}
                              data-testid={`jw-row-toggle-${o.id}`}
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 inline" /> : <ChevronRight className="w-3.5 h-3.5 inline" />}
                            </button>
                            {o.order_number}
                          </td>
                          <td className="text-sm"><div className={collapseCls}>{(o.mo_numbers || []).map((m, mi) => <div key={mi} className="mono text-[#1D3557]">{m}</div>)}{!o.mo_numbers?.length && <span className="mono text-[#1D3557]">{o.mo_number || '-'}</span>}</div></td>
                          <td className="text-sm"><div className={collapseCls}>{o.job_work_parts && o.job_work_parts.length > 0 ? o.job_work_parts.map((p, pi) => {
                            const pit = p.item || items.find(i => i.id === p.item_id);
                            return <div key={pi} className="mb-1"><div className="font-semibold text-[#1D3557] text-[11px] leading-tight">{pit?.part_number} - {pit?.name || ''}</div><div className="text-[#6B7280] text-[10px] leading-tight">Qty: {p.quantity}{p.charges ? <span className="text-[#723B13] ml-1">@{formatCurrency(p.charges)}</span> : ''}</div></div>;
                          }) : <span className="text-[#6B7280] text-[11px]">{o.fg_item_name || '-'}</span>}</div></td>
                          <td className="text-sm">{o.supplier?.name || '-'}</td>
                          <td className="text-sm"><div className={collapseCls}>{(() => {
                            const isJobOS = o.subcontract_type === 'without_material' && (o.reference_operation_seqs?.length || o.reference_operation_seq);
                            const rmList = isJobOS ? (o.rm_items || []) : (o.lines || []);
                            if (!rmList.length) return <span className="text-[#9CA3AF] text-xs italic">No RM</span>;
                            return rmList.map((l, li) => {
                              const it = l.item || items.find(i => i.id === l.item_id);
                              const rate = l.rate || 0;
                              return (
                                <div key={li} className="mb-0.5">
                                  <div className="mono text-[11px] font-medium">{it?.part_number || '-'}</div>
                                  <div className="text-[#4B5563] text-[11px]">{it?.name || ''} ({l.quantity}{rate ? ` @${currencySymbol}${rate.toFixed(2)}` : ''})</div>
                                </div>
                              );
                            });
                          })()}</div></td>
                          <td className="mono">{sentQty}/{totalQty}</td>
                          <td className="mono">{recvQty}</td>
                          <td className="text-right mono">{formatCurrency((o.job_work_parts || []).reduce((s, p) => s + (p.quantity || 0) * (p.charges || 0), 0) || o.processing_charges || 0)}</td>
                          <td>
                            <span className={`status-badge ${getStatusColor(o.status)}`}>{o.status.replace('_', ' ')}</span>
                            {o.subcontract_type === 'without_material' && !(o.reference_operation_seqs?.length || o.reference_operation_seq) && <span className="ml-1 text-[9px] bg-[#E1EFFE] text-[#1D3557] px-1 rounded">No RM</span>}
                          </td>
                          <td className="text-sm">{o.last_receipt_date ? new Date(o.last_receipt_date).toLocaleDateString() : o.expected_return_date ? new Date(o.expected_return_date).toLocaleDateString() : '-'}</td>
                          <td>
                            <div className="flex flex-wrap items-center gap-1" data-testid={`jw-actions-${o.id}`}>
                              {canEdit && ['draft', 'confirmed', 'in_progress'].includes(o.status) && !o.po_created && !o.dc_created && (
                                <button onClick={() => handleEditOrder(o)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Edit" data-testid={`edit-jw-${o.id}`}>
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              {canEdit && o.status === 'draft' && (
                                <button onClick={() => handleConfirmOrder(o.id)} className="btn-secondary text-xs px-2 py-1 text-[#03543F] border-[#03543F]" data-testid={`confirm-jw-${o.id}`}><CheckCircle2 className="w-3 h-3 inline mr-1" />Confirm</button>
                              )}
                              {canEdit && ['confirmed', 'in_progress'].includes(o.status) && o.subcontract_type !== 'without_material' && o.lines?.length > 0 && sentQty < totalQty && (
                                <button onClick={() => openDCDialog(o)} className="btn-primary text-xs px-2 py-1" data-testid={`send-dc-${o.id}`}><ArrowRight className="w-3 h-3 inline mr-1" />Send DC</button>
                              )}
                              {/* Job Card OS (SC created from Job Card outsource, has reference_operation_seqs): behaves like SC-with-RM — Send DC with Part + RM, NO PO. */}
                              {canEdit && ['draft', 'confirmed', 'in_progress'].includes(o.status) && (o.reference_operation_seqs?.length || o.reference_operation_seq) && o.subcontract_type === 'without_material' && o.job_work_parts?.length > 0 && !o.dc_created && (
                                <button onClick={() => openJobOSDCDialog(o)} className="btn-primary text-xs px-2 py-1" data-testid={`send-dc-jobos-${o.id}`}><ArrowRight className="w-3 h-3 inline mr-1" />Send DC</button>
                              )}
                              {/* Plain MO→SC without material (no reference_operation_seqs): Send DC with the FG part going for outsourced operation. */}
                              {canEdit && ['confirmed', 'in_progress'].includes(o.status) && o.subcontract_type === 'without_material' && !(o.reference_operation_seqs?.length || o.reference_operation_seq) && o.job_work_parts?.length > 0 && !o.dc_created && (
                                <button onClick={() => handleCreateDCForParts(o)} className="btn-primary text-xs px-2 py-1" data-testid={`send-dc-parts-${o.id}`}><ArrowRight className="w-3 h-3 inline mr-1" />Send DC</button>
                              )}
                              {/* SC with RM: After DC sent, show info to receive from GRN page */}
                              {o.status === 'in_progress' && o.subcontract_type !== 'without_material' && sentQty >= totalQty && (
                                <span className="text-[10px] text-[#723B13] bg-[#FDF6B2] px-2 py-1 rounded font-medium">Receive via GRN ({o.order_number})</span>
                              )}
                              {/* Job OS / Job Card OS (without_material with job_work_parts): After DC sent, show Receive via GRN - NO PO needed. Covers BOTH consolidated Job Card OS (has reference_operation_seqs) AND plain MO→SC without RM. */}
                              {o.subcontract_type === 'without_material' && o.job_work_parts?.length > 0 && o.dc_created && o.status === 'in_progress' && (
                                <span className="text-[10px] text-[#723B13] bg-[#FDF6B2] px-2 py-1 rounded font-medium">Receive via GRN ({o.order_number})</span>
                              )}
                              {/* Plain MO→SC without material (no job-card reference): Create PO → GRN */}
                              {canEdit && ['draft', 'confirmed', 'in_progress'].includes(o.status) && !o.po_created && !o.dc_created && o.subcontract_type === 'without_material' && !(o.reference_operation_seqs?.length || o.reference_operation_seq) && (
                                <button onClick={() => handleCreatePOFromSC(o)} className="btn-primary text-xs px-2 py-1 bg-[#723B13] hover:bg-[#5A2E0F]" data-testid={`create-po-${o.id}`}><FileText className="w-3 h-3 inline mr-1" />Create PO</button>
                              )}
                              {o.po_created && o.po_number && (
                                <span className="text-[10px] text-[#03543F] bg-[#DEF7EC] px-2 py-1 rounded">PO: {o.po_number}</span>
                              )}
                              {o.subcontract_type === 'without_material' && o.status === 'in_progress' && o.po_created && (
                                <span className="text-[10px] text-[#723B13] bg-[#FDF6B2] px-2 py-1 rounded font-medium">Receive via GRN ({o.po_number})</span>
                              )}
                              {o.status === 'completed' && (
                                <span className="text-[10px] text-[#03543F] bg-[#DEF7EC] px-2 py-1 rounded font-medium">Completed</span>
                              )}
                              {o.status === 'short_closed' && (
                                <span className="text-[10px] text-[#9B1C1C] bg-[#FDE8E8] px-2 py-1 rounded font-medium">Short Closed</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>
        </div>
        )}

        {/* Delivery Challans */}
        {activeTab === 'challans' && (
        <div className="card-flat">
          <div className="px-4 pb-4 pt-4">
          <div className="card-flat overflow-hidden">
            {challans.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]"><FileText className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No delivery challans</p></div>
            ) : (
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="challans-table">
                  <thead><tr><th>DC #</th><th>Order #</th><th style={{minWidth:'220px'}}>FG/SA/Part</th><th>Supplier</th><th style={{minWidth:'240px'}}>Items</th><th className="text-right">RM Price</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                  <tbody>
                    {challans.map(dc => {
                      const isExpanded = expandedRows.has(dc.id);
                      const dcCollapseCls = isExpanded ? "overflow-visible" : "overflow-hidden max-h-[36px]";
                      return (
                      <tr key={dc.id} data-testid={`dc-row-${dc.id}`} className="align-top">
                        <td className="mono font-medium">
                          <button
                            onClick={() => toggleRowExpanded(dc.id)}
                            className="mr-1 text-[#9CA3AF] hover:text-[#1D3557] align-middle"
                            title={isExpanded ? 'Collapse row' : 'Expand row'}
                            data-testid={`dc-row-toggle-${dc.id}`}
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 inline" /> : <ChevronRight className="w-3.5 h-3.5 inline" />}
                          </button>
                          {dc.dc_number}
                          {dc.is_manual && <span className="ml-2 text-[10px] bg-[#FEF3C7] text-[#723B13] px-1.5 py-0.5 rounded">MANUAL</span>}
                        </td>
                        <td className="mono">{dc.order?.order_number || (dc.is_manual ? <span className="text-[10px] text-[#6B7280]">—</span> : '-')}</td>
                        <td className="text-sm"><div className={dcCollapseCls}>
                          {dc.is_manual ? (
                            <span className="text-[10px] text-[#6B7280] capitalize">{dc.dc_purpose || 'subcontract'}</span>
                          ) : (
                            <>
                              {(dc.order?.job_work_parts || []).map((p, pi) => {
                                const pit = p.item || items.find(i => i.id === p.item_id);
                                return (
                                  <div key={pi} className="mb-1">
                                    <div className="font-semibold text-[#1D3557] text-[11px] leading-tight">{pit?.part_number || '-'} - {pit?.name || ''}</div>
                                    <div className="text-[#6B7280] text-[10px] leading-tight">Qty: {p.quantity}</div>
                                  </div>
                                );
                              })}
                              {!(dc.order?.job_work_parts?.length) && <span className="text-[11px]">{dc.fg_item_name || '-'}</span>}
                            </>
                          )}
                        </div></td>
                        <td>{dc.supplier?.name || '-'}</td>
                        <td className="text-sm"><div className={dcCollapseCls}>
                          {dc.lines.map((l, li) => {
                            const it = l.item || items.find(i => i.id === l.item_id);
                            return (
                              <div key={li} className="mb-0.5">
                                <div className="mono text-[11px] font-medium">{it?.part_number || '-'}</div>
                                <div className="text-[#4B5563] text-[11px]">{it?.name || ''} ({l.quantity})</div>
                              </div>
                            );
                          })}
                        </div></td>
                        <td className="text-right mono">{formatCurrency(dc.lines.reduce((s, l) => { const it = l.item || items.find(i => i.id === l.item_id); return s + (l.quantity * (it?.unit_cost || l.rate || 0)); }, 0))}</td>
                        <td><span className={`status-badge ${getStatusColor(dc.status)}`}>{dc.status}</span></td>
                        <td className="text-sm">{dc.dc_date ? new Date(dc.dc_date + 'T00:00:00').toLocaleDateString() : (dc.created_at ? new Date(dc.created_at).toLocaleDateString() : '-')}</td>
                        <td>
                          <div className="flex items-center space-x-1">
                            {dc.status === 'draft' && dc.is_manual && canEdit && (
                              <button onClick={() => openEditManualDC(dc)} className="btn-secondary text-xs px-2 py-1" data-testid={`edit-manual-dc-${dc.id}`}>
                                <Edit2 className="w-3 h-3 inline mr-1" />Edit
                              </button>
                            )}
                            {dc.status === 'draft' && canEdit && (
                              <button onClick={async () => {
                                try {
                                  const { data } = await api.post(`/api/job-work/challans/${dc.id}/send`);
                                  if (data.success === false && data.insufficient_materials) {
                                    const items = data.insufficient_materials.map(m => `${m.item} - ${m.name}: need ${m.required}, have ${m.available} (short ${m.shortage})`).join('\n');
                                    setDcSendResult({ open: true, data: { message: data.message, consumed: [], dcNumber: dc.dc_number, isError: true, insufficient: data.insufficient_materials } });
                                  } else {
                                    setDcSendResult({ open: true, data: { message: data.message, consumed: data.consumed_materials || [], dcNumber: dc.dc_number } });
                                  }
                                } catch (e) {
                                  const errMsg = e.response?.data?.detail || 'Failed to send DC';
                                  setDcSendResult({ open: true, data: { message: errMsg, consumed: [], dcNumber: dc.dc_number, isError: true } });
                                }
                              }} className="btn-primary text-xs px-2 py-1" data-testid={`send-dc-btn-${dc.id}`}>
                                <Truck className="w-3 h-3 inline mr-1" />Send
                              </button>
                            )}
                            <button onClick={() => openPrintDC(dc)} className="btn-secondary text-xs px-2 py-1" data-testid={`print-dc-${dc.id}`}>
                              <Printer className="w-3 h-3 inline mr-1" />PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>
        </div>
        )}

        {/* Receipts */}
        {activeTab === 'receipts' && (
        <div className="card-flat">
          <div className="px-4 pb-4 pt-4">
          <div className="card-flat overflow-hidden">
            {receipts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]"><Package className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No receipts</p></div>
            ) : (
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="receipts-table">
                  <thead><tr><th>Receipt #</th><th>Order #</th><th>Supplier</th><th>Items</th><th>Accepted</th><th>Rejected</th><th>Date</th></tr></thead>
                  <tbody>
                    {receipts.map(rec => (
                      <tr key={rec.id}>
                        <td className="mono font-medium">{rec.receipt_number}</td>
                        <td className="mono">{rec.order?.order_number || '-'}</td>
                        <td>{rec.supplier?.name || '-'}</td>
                        <td className="text-sm">{rec.lines.map(l => `${l.item?.part_number || '-'} (${l.received_quantity})`).join(', ')}</td>
                        <td className="mono text-[#03543F]">{rec.lines.reduce((s, l) => s + (l.accepted_quantity || 0), 0)}</td>
                        <td className="mono text-[#9B1C1C]">{rec.lines.reduce((s, l) => s + (l.reject_qty || 0), 0)}</td>
                        <td className="text-sm">{rec.created_at ? new Date(rec.created_at).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>
        </div>
        )}
      </div>

      {/* Create Order Dialog */}
      <Dialog open={orderDialog} onOpenChange={setOrderDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-[Chivo]">{editingOrder ? 'Edit Subcontract Order' : 'New Subcontract Order'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Supplier *</label>
                <SearchableSelect
                  options={suppliers}
                  value={orderForm.supplier_id}
                  onChange={(v) => setOrderForm({ ...orderForm, supplier_id: v })}
                  getLabel={(s) => s?.name || ''}
                  getSecondary={(s) => s?.code || ''}
                  matchFields={['name', 'code', 'gstin', 'phone']}
                  placeholder="Type supplier name / code / GSTIN…"
                  testId="jw-supplier-select"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Expected Return Date</label>
                <input type="date" value={orderForm.expected_return_date} onChange={e => setOrderForm({...orderForm, expected_return_date: e.target.value})} className="input-field" data-testid="jw-return-date" />
              </div>
            </div>
            
            {/* Job Work Parts (FG/SA/Parts being processed) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-[#1D3557]">Job Work Parts (FG/SA/Parts)</label>
                <button onClick={addJWPart} className="text-xs text-[#1D3557] hover:underline flex items-center gap-1" data-testid="jw-add-part-top"><Plus className="w-3 h-3" />Add Part</button>
              </div>
              <div className="border rounded-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#E1EFFE]"><th className="text-left py-2 px-2 text-xs">Part No &amp; Name / Description / Op</th><th className="text-right py-2 px-2 text-xs w-24">Qty</th><th className="text-right py-2 px-2 text-xs w-32">Process Cost/Unit</th><th className="text-right py-2 px-2 text-xs w-28">Total</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {orderForm.job_work_parts.map((p, idx) => {
                      const total = (p.quantity || 0) * (p.charges || 0);
                      return (
                        <tr key={idx} className="border-t align-top">
                          <td className="py-2 px-2">
                            <SearchableItemSelect
                              items={items}
                              value={p.item_id}
                              onChange={(id) => updateJWPartItem(idx, id)}
                              filter={(i) => ['finished_good','sub_assembly','component'].includes(i.category)}
                              placeholder="Search part by code / name…"
                              testId={`jw-part-${idx}-item`}
                            />
                            {/* Description input — inline, beneath the part name (mirrors Manual DC stacked layout) */}
                            <input
                              type="text"
                              value={p.item_description || ''}
                              onChange={e => updateJWPart(idx, 'item_description', e.target.value)}
                              placeholder="Description / spec / remarks"
                              className="w-full mt-1 px-2 py-1 border border-[#E5E7EB] rounded-sm text-xs"
                              data-testid={`jw-part-${idx}-description`}
                            />
                            {p.process_name && (
                              <div className="text-[10px] mt-1 flex items-center gap-1.5" data-testid={`jw-part-${idx}-process`}>
                                <span className="text-[#723B13]">Outsourced op: <span className="font-semibold">{p.process_name}</span></span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!p.item_id || !p.process_name) return;
                                    try {
                                      const { data } = await api.get(`/api/bom/routing-cost`, { params: { item_id: p.item_id, process_name: p.process_name } });
                                      const cur = [...orderForm.job_work_parts];
                                      cur[idx] = { ...cur[idx], charges: data.cost || 0 };
                                      setOrderForm({ ...orderForm, job_work_parts: cur });
                                    } catch {}
                                  }}
                                  className="text-[10px] text-[#1D3557] hover:bg-[#E1EFFE] px-1.5 py-0.5 border border-[#1D3557] rounded-sm"
                                  data-testid={`jw-part-${idx}-refresh-cost`}
                                  title="Recompute charges from current BOM routing"
                                >Refresh cost</button>
                              </div>
                            )}
                            {!p.process_name && p.process_names && p.process_names.length > 0 && (
                              <div className="text-[10px] text-[#1E429F] mt-1" data-testid={`jw-part-${idx}-processes`}>Processes: {p.process_names.join(', ')}</div>
                            )}
                          </td>
                          <td className="py-2 px-2"><input type="number" min="1" value={p.quantity} onChange={e => updateJWPart(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                          <td className="py-2 px-2"><input type="number" min="0" step="0.01" value={p.charges} onChange={e => updateJWPart(idx, 'charges', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                          <td className="py-2 px-2 mono text-right text-xs font-medium">{formatCurrency(total)}</td>
                          <td className="py-2 px-1"><button onClick={() => removeJWPart(idx)} className="text-[#9B1C1C] p-1"><X className="w-3 h-3" /></button></td>
                        </tr>
                      );
                    })}
                    {orderForm.job_work_parts.length === 0 && <tr><td colSpan="5" className="text-center py-2 text-xs text-[#9CA3AF]">No parts added</td></tr>}
                  </tbody>
                </table>
              </div>
              {/* Bottom Add Part hanger — saves scrolling up on long lists. */}
              <div className="mt-2 flex justify-end">
                <button onClick={addJWPart} className="text-xs text-[#1D3557] hover:bg-[#E1EFFE] flex items-center gap-1 px-3 py-1.5 border border-dashed border-[#1D3557] rounded-sm" data-testid="jw-add-part-bottom"><Plus className="w-3 h-3" />Add Part</button>
              </div>
            </div>
            
            {/* Raw Materials to Send - only for "with_material" SC */}
            {(!editingOrder || editingOrder.subcontract_type !== 'without_material') && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-[#723B13]">Raw Materials to Send</label>
                <button onClick={addOrderLine} className="text-xs text-[#1D3557] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Add RM</button>
              </div>
              <div className="border rounded-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#F3F4F6]"><th className="text-left py-2 px-2 text-xs">Item</th><th className="text-left py-2 px-2 text-xs" style={{minWidth:'140px'}}>Description</th><th className="text-right py-2 px-2 text-xs w-24">Qty</th><th className="text-right py-2 px-2 text-xs w-24">Rate/Unit</th><th className="text-right py-2 px-2 text-xs w-28">Total</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {orderForm.lines.map((l, idx) => {
                      const lineTotal = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
                      return (
                      <tr key={idx} className="border-t">
                        <td className="py-1 px-2">
                          <SearchableItemSelect
                            items={items}
                            value={l.item_id}
                            onChange={(id) => {
                              // Also seed description from item master on first selection.
                              const it = items.find(i => i.id === id);
                              const lines2 = [...orderForm.lines];
                              lines2[idx] = { ...lines2[idx], item_id: id, item_description: lines2[idx].item_description || it?.description || '' };
                              setOrderForm({ ...orderForm, lines: lines2 });
                            }}
                            placeholder="Search item by code / name…"
                            testId={`jw-rm-${idx}-item`}
                          />
                        </td>
                        <td className="py-1 px-2">
                          <input type="text" value={l.item_description || ''} onChange={e => updateOrderLine(idx, 'item_description', e.target.value)} placeholder="Description / spec" className="w-full px-2 py-1 border rounded-sm text-xs" data-testid={`jw-rm-${idx}-description`} />
                        </td>
                        <td className="py-1 px-2"><input type="number" min="1" value={l.quantity} onChange={e => updateOrderLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                        <td className="py-1 px-2"><input type="number" min="0" value={l.rate} onChange={e => updateOrderLine(idx, 'rate', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                        <td className="py-1 px-2 text-right mono text-xs font-semibold" data-testid={`rm-line-total-${idx}`}>{currencySymbol}{lineTotal.toFixed(2)}</td>
                        <td className="py-1 px-1"><button onClick={() => removeOrderLine(idx)} className="text-[#9B1C1C] p-1"><X className="w-3 h-3" /></button></td>
                      </tr>
                      );
                    })}
                    {orderForm.lines.length > 0 && (
                      <tr className="bg-[#F9FAFB] border-t font-semibold">
                        <td colSpan="4" className="py-2 px-2 text-right text-xs">Grand Total RM:</td>
                        <td className="py-2 px-2 text-right mono text-xs" data-testid="rm-grand-total">{currencySymbol}{orderForm.lines.reduce((s, l) => s + ((parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0)), 0).toFixed(2)}</td>
                        <td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}
            <div><label className="block text-sm font-semibold mb-1">Notes</label><textarea value={orderForm.notes} onChange={e => setOrderForm({...orderForm, notes: e.target.value})} className="input-field" rows={2} /></div>
            <div className="flex justify-end space-x-3 pt-3 border-t"><button onClick={() => { setOrderDialog(false); setEditingOrder(null); }} className="btn-secondary">Cancel</button><button onClick={handleCreateOrder} className="btn-primary" data-testid="jw-save-order">{editingOrder ? 'Update Order' : 'Create Order'}</button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual DC Dialog — standalone DC (no parent SC) */}
      <Dialog open={manualDcDialog} onOpenChange={setManualDcDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="manual-dc-dialog">
          <DialogHeader><DialogTitle className="font-[Chivo]">{manualDcForm.id ? 'Edit Manual Delivery Challan' : 'Create Manual Delivery Challan'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-semibold mb-1">Supplier *</label>
                <SearchableSelect
                  options={suppliers}
                  value={manualDcForm.supplier_id}
                  onChange={(v) => setManualDcForm({ ...manualDcForm, supplier_id: v })}
                  getLabel={(s) => s?.name || ''}
                  getSecondary={(s) => s?.gstin ? `GSTIN: ${s.gstin}` : (s?.code || '')}
                  matchFields={['name', 'code', 'gstin', 'phone']}
                  placeholder="Type supplier name / code / GSTIN…"
                  testId="manual-dc-supplier"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Purpose</label>
                <Select value={manualDcForm.dc_purpose} onValueChange={(v) => setManualDcForm({ ...manualDcForm, dc_purpose: v })}>
                  <SelectTrigger data-testid="manual-dc-purpose"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subcontract">Subcontract</SelectItem>
                    <SelectItem value="rework">Rework</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-1">DC Date *</label>
                <input
                  type="date"
                  value={manualDcForm.dc_date || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setManualDcForm({ ...manualDcForm, dc_date: e.target.value })}
                  className="input-field w-full"
                  data-testid="manual-dc-date"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">From Warehouse (optional)</label>
                <Select value={manualDcForm.warehouse_id} onValueChange={(v) => setManualDcForm({ ...manualDcForm, warehouse_id: v })}>
                  <SelectTrigger data-testid="manual-dc-warehouse"><SelectValue placeholder="(Main stock)" /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="border border-[#E5E7EB] rounded-sm overflow-hidden">
              <div className="bg-[#F3F4F6] px-3 py-2">
                <span className="text-xs font-semibold uppercase text-[#4B5563]">Items to Ship ({manualDcForm.lines.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="line-items-grid" data-testid="manual-dc-lines-table">
                  <thead>
                    <tr>
                      <th className="row-num">#</th>
                      <th style={{ minWidth: '300px' }}>Item Name &amp; Description</th>
                      <th style={{ width: '70px' }}>UOM</th>
                      <th style={{ width: '80px' }}>Qty</th>
                      <th style={{ width: '110px' }}>Unit Price ({currencySymbol})</th>
                      <th style={{ minWidth: '160px' }}>Notes</th>
                      <th className="remove-cell"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualDcForm.lines.map((line, idx) => {
                      const q = (line.item_search || '').trim().toLowerCase();
                      // Show suggestions ONLY after the user starts typing — the
                      // global items list (1k+ rows) is overwhelming if dumped on
                      // open. Empty query = no suggestions shown.
                      const filtered = q
                        ? items.filter(i => (i.part_number || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q))
                        : [];
                      const selected = items.find(i => i.id === line.item_id);
                      const uom = selected?.unit_of_measure || 'pcs';
                      const lineTotal = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0);
                      return (
                        <React.Fragment key={idx}>
                        <tr data-testid={`manual-dc-line-${idx}`}>
                          <td className="row-num">{idx + 1}</td>
                          <td>
                            <div className="px-1 py-1">
                              {selected ? (
                                <div className="space-y-1" data-testid={`manual-dc-selected-${idx}`}>
                                  <div className="flex items-center justify-between bg-[#F0FDF4] border border-[#03543F] rounded-sm px-2 py-1">
                                    <div className="text-xs truncate flex items-center gap-1">
                                      {/* BOM preview chevron — opens an inline
                                          sub-table beneath this row showing the
                                          selected item's BOM children (Parts
                                          of an SG, or RMs of a Part) with each
                                          child's quantity + unit cost. */}
                                      <button
                                        type="button"
                                        onClick={() => toggleBomPreview(idx, selected.id)}
                                        className="text-[#1D3557] hover:bg-[#E1EFFE] rounded px-0.5"
                                        title={bomPreviewOpen[idx] ? 'Hide BOM detail' : 'Show BOM detail (constituent parts / RMs)'}
                                        data-testid={`manual-dc-bom-toggle-${idx}`}
                                      >
                                        {bomPreviewOpen[idx] ? '▼' : '▶'}
                                      </button>
                                      <span className="mono font-semibold">{selected.part_number}</span>
                                      <span className="mx-1">—</span>
                                      <span>{selected.name}</span>
                                      <span className="ml-2 text-[#6B7280]">Stock: {selected.current_stock || 0}</span>
                                    </div>
                                    <button type="button" className="text-[10px] text-[#9B1C1C] hover:underline ml-2" onClick={() => updateManualDcLine(idx, { item_id: '', item_search: '' })} data-testid={`manual-dc-clear-${idx}`}>Clear</button>
                                  </div>
                                  {/* Item description — separate from notes;
                                      prints under the part name on the DC. */}
                                  <input
                                    type="text"
                                    value={line.item_description || ''}
                                    onChange={(e) => updateManualDcLine(idx, { item_description: e.target.value })}
                                    placeholder="Description / spec / colour (prints under part name)"
                                    className="grid-input text-xs"
                                    data-testid={`manual-dc-description-${idx}`}
                                  />
                                </div>
                              ) : (
                                <>
                                  <input type="text" placeholder="Start typing part number or name…" value={line.item_search || ''} onChange={(e) => updateManualDcLine(idx, { item_search: e.target.value })} className="grid-input" data-testid={`manual-dc-search-${idx}`} />
                                  {q && (
                                    <div className="mt-1 border border-[#E5E7EB] rounded-sm max-h-32 overflow-auto bg-white">
                                      {filtered.length === 0 && <div className="px-2 py-2 text-[10px] text-center text-[#6B7280]">No matching items</div>}
                                      {filtered.slice(0, 50).map(it => (
                                        <button key={it.id} type="button" onClick={() => updateManualDcLine(idx, { item_id: it.id, item_search: '', unit_price: it.unit_cost || 0, item_description: it.description || '' })} data-testid={`manual-dc-option-${idx}-${it.id}`} className="w-full text-left px-2 py-1 text-[11px] border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]">
                                          <span className="mono font-semibold">{it.part_number}</span>
                                          <span className="mx-1">—</span>
                                          <span>{it.name}</span>
                                          <span className="ml-2 text-[#6B7280]">({it.unit_of_measure || 'pcs'})</span>
                                          <span className="ml-2 text-[#6B7280]">Stock: {it.current_stock || 0}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="static-cell text-center" data-testid={`manual-dc-uom-${idx}`}>{selected ? uom : '—'}</div>
                          </td>
                          <td>
                            <input type="number" min="0" step="0.01" value={line.quantity} onChange={(e) => updateManualDcLine(idx, { quantity: parseFloat(e.target.value) || 0 })} className="grid-input mono num" data-testid={`manual-dc-qty-${idx}`} />
                          </td>
                          <td>
                            <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateManualDcLine(idx, { unit_price: parseFloat(e.target.value) || 0 })} className="grid-input mono num" data-testid={`manual-dc-price-${idx}`} />
                            {lineTotal > 0 && (
                              <div className="text-[10px] text-[#6B7280] text-right px-1">= {currencySymbol}{lineTotal.toFixed(2)}</div>
                            )}
                          </td>
                          <td>
                            <input type="text" value={line.notes} onChange={(e) => updateManualDcLine(idx, { notes: e.target.value })} className="grid-input" data-testid={`manual-dc-notes-${idx}`} />
                          </td>
                          <td className="remove-cell">
                            {manualDcForm.lines.length > 1 && (
                              <button type="button" onClick={() => removeManualDcLine(idx)} className="text-[#9B1C1C] hover:bg-[#FDE8E8] rounded p-1" title="Remove line" data-testid={`manual-dc-remove-line-${idx}`}><X className="w-3.5 h-3.5" /></button>
                            )}
                          </td>
                        </tr>
                        {/* BOM preview sub-row (lazy, expandable) — Shows
                            constituent parts/RMs of the selected line item
                            with each child's quantity, UOM, unit cost, and
                            extended cost. Used to verify the right RM/Parts
                            are being shipped under each SG/Part. Pattern
                            mirrors the JW-DC tree visualisation. */}
                        {selected && bomPreviewOpen[idx] && (
                          <tr key={`bom-${idx}`} className="bg-[#F9FAFB]" data-testid={`manual-dc-bom-row-${idx}`}>
                            <td></td>
                            <td colSpan={6} className="px-2 py-1">
                              {(() => {
                                const cache = bomPreviewCache[selected.id];
                                if (!cache) return <div className="text-[10px] text-[#6B7280] italic">Loading BOM…</div>;
                                if (!cache.has_bom) return <div className="text-[10px] text-[#9B1C1C] italic">No active BOM for this item — it ships as a leaf (no constituent parts/RMs to break down).</div>;
                                const totalCost = (cache.components || []).reduce((s, c) => s + (c.extended_cost || 0), 0);
                                return (
                                  <div>
                                    <div className="text-[10px] font-semibold text-[#1D3557] mb-1 uppercase tracking-wider">BOM Detail — Parts / RM ({cache.components.length})</div>
                                    <table className="w-full text-[11px] border border-[#E5E7EB]">
                                      <thead className="bg-[#F3F4F6]">
                                        <tr>
                                          <th className="px-2 py-1 text-left">Part No</th>
                                          <th className="px-2 py-1 text-left">Name</th>
                                          <th className="px-2 py-1 text-left">Category</th>
                                          <th className="px-2 py-1 text-right">Qty</th>
                                          <th className="px-2 py-1 text-left">UOM</th>
                                          <th className="px-2 py-1 text-right">Unit Cost</th>
                                          <th className="px-2 py-1 text-right">Ext. Cost</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cache.components.map((c, ci) => (
                                          <tr key={ci} className={ci % 2 ? 'bg-[#FFFFFF]' : 'bg-[#F9FAFB]'}>
                                            <td className="px-2 py-1 mono">{c.part_number}</td>
                                            <td className="px-2 py-1">{c.name}</td>
                                            <td className="px-2 py-1 text-[10px] text-[#6B7280]">{c.category}</td>
                                            <td className="px-2 py-1 text-right mono">{c.quantity}</td>
                                            <td className="px-2 py-1">{c.uom}</td>
                                            <td className="px-2 py-1 text-right mono">{currencySymbol}{(c.unit_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td className="px-2 py-1 text-right mono">{currencySymbol}{(c.extended_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                          </tr>
                                        ))}
                                        <tr className="bg-[#FEF3C7] font-semibold">
                                          <td colSpan={6} className="px-2 py-1 text-right">Total BOM Cost (per 1 unit of {selected.part_number}):</td>
                                          <td className="px-2 py-1 text-right mono">{currencySymbol}{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Add-line button anchored at the bottom of the lines list so
                  new lines always insert below the last one. */}
              <div className="flex justify-end p-2 bg-[#F9FAFB] border-t border-[#E5E7EB]">
                <button type="button" onClick={addManualDcLine} className="text-xs text-[#1D3557] hover:underline flex items-center gap-1 px-2 py-1 border border-dashed border-[#1D3557] rounded-sm" data-testid="manual-dc-add-line"><Plus className="w-3 h-3" />Add Line</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">DC Notes (optional)</label>
              <textarea value={manualDcForm.notes} onChange={e => setManualDcForm({ ...manualDcForm, notes: e.target.value })} className="input-field" rows={2} data-testid="manual-dc-doc-notes" />
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button type="button" onClick={() => setManualDcDialog(false)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={handleCreateManualDC} className="btn-primary" data-testid="manual-dc-submit">{manualDcForm.id ? 'Update DC' : 'Create DC'}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send DC Dialog */}
      <Dialog open={dcDialog} onOpenChange={setDcDialog}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-[Chivo]">Send Materials (DC) - {dcOrder?.order_number}{dcOrder?.fg_item_name ? ` — ${dcOrder.fg_item_name}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div><label className="block text-sm font-semibold mb-1">From Warehouse</label>
              <Select value={dcWarehouse} onValueChange={setDcWarehouse}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="border rounded-sm overflow-hidden">
              {dcOrder?._is_job_os ? (
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#F3F4F6]">
                    <th className="text-left py-2 px-2 text-xs">Sl.</th>
                    <th className="text-left py-2 px-2 text-xs">Part No &amp; Name</th>
                    <th className="text-left py-2 px-2 text-xs">HSN</th>
                    <th className="text-right py-2 px-2 text-xs">Qty</th>
                    <th className="text-left py-2 px-2 text-xs">UOM</th>
                    <th className="text-right py-2 px-2 text-xs">Charges/Unit</th>
                    <th className="text-right py-2 px-2 text-xs">Total Charges</th>
                    <th className="text-right py-2 px-2 text-xs">RM Cost/Unit</th>
                    <th className="text-right py-2 px-2 text-xs">Total Amount</th>
                  </tr></thead>
                  <tbody>
                    {dcLines.map((l, idx) => {
                      const it = l.item || items.find(i => i.id === l.item_id) || {};
                      const totalCharges = (l.quantity || 0) * (l.charges_per_unit || 0);
                      const totalAmount = (l.quantity || 0) * (l.rm_cost_per_unit || 0);
                      return (
                        <tr key={idx} className="border-t">
                          <td className="py-2 px-2 mono text-xs">{idx + 1}</td>
                          <td className="py-2 px-2 align-top">
                            <div className="text-xs">
                              <span className="mono font-semibold">{it.part_number || '-'}</span>
                              <span className="mx-1">—</span>
                              <span>{it.name || '-'}</span>
                            </div>
                            {/* Editable description inline below part name (matches Edit SC + Manual DC style) */}
                            <input
                              type="text"
                              value={l.item_description || ''}
                              onChange={e => { const ls = [...dcLines]; ls[idx].item_description = e.target.value; setDcLines(ls); }}
                              placeholder="Description / spec / remarks"
                              className="w-full mt-1 px-2 py-1 border border-[#E5E7EB] rounded-sm text-xs"
                              data-testid={`dc-desc-${idx}`}
                            />
                            {l.process_name && (
                              <div className="text-[10px] text-[#723B13] mt-1">Op: <span className="font-semibold">{l.process_name}</span></div>
                            )}
                          </td>
                          <td className="py-2 px-2 mono text-xs">{it.hsn_code || '-'}</td>
                          <td className="py-2 px-2 text-right">
                            <input type="number" min="1" value={l.quantity} onChange={e => { const ls = [...dcLines]; ls[idx].quantity = parseFloat(e.target.value) || 0; setDcLines(ls); }} className="w-20 px-2 py-1 border rounded-sm mono text-right text-xs" data-testid={`dc-qty-${idx}`} />
                          </td>
                          <td className="py-2 px-2 text-xs">{it.unit_of_measure || 'Nos'}</td>
                          <td className="py-2 px-2 text-right">
                            <input type="number" min="0" step="0.01" value={l.charges_per_unit} onChange={e => { const ls = [...dcLines]; ls[idx].charges_per_unit = parseFloat(e.target.value) || 0; setDcLines(ls); }} className="w-20 px-2 py-1 border rounded-sm mono text-right text-xs" data-testid={`dc-charges-${idx}`} />
                          </td>
                          <td className="py-2 px-2 text-right mono text-xs">{currencySymbol}{totalCharges.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right">
                            <input type="number" min="0" step="0.01" value={l.rm_cost_per_unit} onChange={e => { const ls = [...dcLines]; ls[idx].rm_cost_per_unit = parseFloat(e.target.value) || 0; setDcLines(ls); }} className="w-20 px-2 py-1 border rounded-sm mono text-right text-xs" data-testid={`dc-rmcost-${idx}`} />
                          </td>
                          <td className="py-2 px-2 text-right mono text-xs font-semibold">{currencySymbol}{totalAmount.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[#F9FAFB] border-t font-semibold">
                      <td colSpan="6" className="py-2 px-2 text-right text-xs">Total Process Charges</td>
                      <td className="py-2 px-2 text-right mono text-xs">{currencySymbol}{dcLines.reduce((s, l) => s + ((l.quantity || 0) * (l.charges_per_unit || 0)), 0).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right text-xs">Total RM Cost</td>
                      <td className="py-2 px-2 text-right mono text-xs">{currencySymbol}{dcLines.reduce((s, l) => s + ((l.quantity || 0) * (l.rm_cost_per_unit || 0)), 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#F3F4F6]"><th className="text-left py-2 px-2 text-xs">Item</th><th className="text-right py-2 px-2 text-xs">Rate/Unit</th><th className="text-right py-2 px-2 text-xs">Send Qty</th><th className="text-right py-2 px-2 text-xs">Total RM Cost</th></tr></thead>
                  <tbody>
                    {dcLines.map((l, idx) => {
                      const it = items.find(i => i.id === l.item_id);
                      const rate = (l.rate || 0) > 0 ? l.rate : (it?.unit_cost || 0);
                      const totalRMCost = (l.quantity || 0) * rate;
                      return (
                        <tr key={idx} className="border-t">
                          <td className="py-2 px-2"><span className="mono text-xs">{it?.part_number}</span> - {it?.name} <span className="text-[10px] text-[#6B7280]">(Stock: {it?.current_stock || 0})</span></td>
                          <td className="py-2 px-2 text-right">
                            <input type="number" min="0" step="0.01" value={rate} onChange={e => { const ls = [...dcLines]; ls[idx].rate = parseFloat(e.target.value) || 0; setDcLines(ls); }} className="w-24 px-2 py-1 border rounded-sm mono text-right text-xs" data-testid={`dc-rate-${idx}`} />
                          </td>
                          <td className="py-2 px-2"><input type="number" min="0" max={it?.current_stock || 0} value={l.quantity} onChange={e => { const ls = [...dcLines]; ls[idx].quantity = Math.min(parseFloat(e.target.value) || 0, it?.current_stock || 0); setDcLines(ls); }} className="w-24 px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                          <td className="py-2 px-2 text-right mono text-xs font-semibold">{currencySymbol}{totalRMCost.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[#F9FAFB] border-t font-semibold">
                      <td colSpan="3" className="py-2 px-2 text-right">Grand Total RM Cost:</td>
                      <td className="py-2 px-2 text-right mono">{currencySymbol}{dcLines.reduce((s, l) => { const it = items.find(i => i.id === l.item_id); const r = (l.rate || 0) > 0 ? l.rate : (it?.unit_cost || 0); return s + ((l.quantity || 0) * r); }, 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t"><button onClick={() => setDcDialog(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateDC} className="btn-primary" data-testid="jw-send-dc">Send Materials</button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={recDialog} onOpenChange={setRecDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-[Chivo]">Receive Materials - {recOrder?.order_number}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div><label className="block text-sm font-semibold mb-1">To Warehouse</label>
              <Select value={recWarehouse} onValueChange={setRecWarehouse}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="border rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F3F4F6]"><th className="text-left py-2 px-2 text-xs">Item</th><th className="text-right py-2 px-2 text-xs">Recv Qty</th><th className="text-right py-2 px-2 text-xs">Reject</th><th className="text-right py-2 px-2 text-xs">Rework</th><th className="text-center py-2 px-2 text-xs">QC</th></tr></thead>
                <tbody>
                  {recLines.map((l, idx) => {
                    const it = items.find(i => i.id === l.item_id);
                    return (
                      <tr key={idx} className="border-t">
                        <td className="py-2 px-2"><span className="mono text-xs">{it?.part_number}</span> - {it?.name}</td>
                        <td className="py-2 px-2"><input type="number" min="0" value={l.received_quantity} onChange={e => { const ls = [...recLines]; ls[idx].received_quantity = parseFloat(e.target.value) || 0; setRecLines(ls); }} className="w-20 px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                        <td className="py-2 px-2"><input type="number" min="0" max={l.received_quantity} value={l.reject_qty} onChange={e => { const ls = [...recLines]; ls[idx].reject_qty = Math.min(parseFloat(e.target.value) || 0, l.received_quantity); setRecLines(ls); }} className="w-16 px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                        <td className="py-2 px-2"><input type="number" min="0" max={l.received_quantity - (l.reject_qty || 0)} value={l.rework_qty || 0} onChange={e => { const ls = [...recLines]; ls[idx].rework_qty = Math.min(parseFloat(e.target.value) || 0, l.received_quantity - (l.reject_qty || 0)); setRecLines(ls); }} className="w-16 px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                        <td className="py-2 px-2 text-center">
                          <select value={l.quality_result} onChange={e => { const ls = [...recLines]; ls[idx].quality_result = e.target.value; setRecLines(ls); }} className="px-1 py-1 border rounded-sm text-xs">
                            <option value="accept">Accept</option><option value="reject">Reject</option><option value="rework">Rework</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t"><button onClick={() => setRecDialog(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateReceipt} className="btn-primary" data-testid="jw-receive">Receive Materials</button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DC Print T&C Edit Dialog */}
      <Dialog open={dcPrintDialog} onOpenChange={setDcPrintDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-[Chivo]">Print Delivery Challan — {dcPrintTarget?.dc_number}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div>
              <label className="block text-sm font-semibold mb-1">Terms & Conditions</label>
              <p className="text-xs text-[#6B7280] mb-2">Edit the terms below (one per line). These will appear on the printed DC.</p>
              <textarea
                value={dcTerms}
                onChange={(e) => setDcTerms(e.target.value)}
                className="input-field text-sm"
                rows={7}
                data-testid="dc-terms-textarea"
              />
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button onClick={() => setDcPrintDialog(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => { if (dcPrintTarget) printDC(dcPrintTarget, dcTerms); setDcPrintDialog(false); }} className="btn-primary flex items-center space-x-2" data-testid="dc-print-confirm">
                <Printer className="w-4 h-4" /><span>Preview &amp; PDF</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DC Send Material Consumption Dialog */}
      <Dialog open={dcSendResult.open} onOpenChange={(o) => { if (!o) { setDcSendResult({ open: false, data: null }); fetchData(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-[Chivo] flex items-center gap-2" style={{color: dcSendResult.data?.isError ? '#9B1C1C' : '#03543F'}}>{dcSendResult.data?.isError ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />} {dcSendResult.data?.isError ? 'DC Send Failed' : `Materials Consumed — ${dcSendResult.data?.dcNumber || 'DC'}`}</DialogTitle></DialogHeader>
          <div className="mt-3 space-y-3">
            <p className={`text-sm font-medium ${dcSendResult.data?.isError ? 'text-[#9B1C1C]' : 'text-[#03543F]'}`}>{dcSendResult.data?.message}</p>
            {dcSendResult.data?.insufficient && dcSendResult.data.insufficient.length > 0 && (
              <div className="bg-[#FDE8E8]/50 rounded p-3 max-h-60 overflow-y-auto">
                <p className="text-xs font-semibold mb-2 text-[#9B1C1C]">Insufficient Materials:</p>
                <table className="w-full text-xs">
                  <thead><tr className="text-[#4B5563] border-b"><th className="text-left py-1">Part No.</th><th className="text-left">Name</th><th className="text-right">Required</th><th className="text-right">Available</th><th className="text-right">Shortage</th></tr></thead>
                  <tbody>
                    {dcSendResult.data.insufficient.map((m, i) => (
                      <tr key={i} className="border-t border-[#FECACA]">
                        <td className="py-1 mono font-medium">{m.item}</td>
                        <td className="text-[#4B5563]">{m.name}</td>
                        <td className="text-right mono">{m.required}</td>
                        <td className="text-right mono">{m.available}</td>
                        <td className="text-right mono font-bold text-[#9B1C1C]">{m.shortage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!dcSendResult.data?.isError && (
            <div className="bg-[#F3F4F6] rounded p-3 max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-[#4B5563] border-b"><th className="text-left py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Prev Stock</th><th className="text-right">New Stock</th></tr></thead>
                <tbody>
                  {(dcSendResult.data?.consumed || []).map((m, i) => (
                    <tr key={i} className="border-t border-[#E5E7EB]">
                      <td className="py-1"><span className="mono font-medium">{m.item}</span> <span className="text-[#6B7280]">{m.name}</span></td>
                      <td className="text-right mono font-bold text-[#9B1C1C]">-{m.quantity} {m.uom}</td>
                      <td className="text-right mono">{m.previous_stock}</td>
                      <td className="text-right mono font-medium">{m.new_stock}</td>
                    </tr>
                  ))}
                  {(!dcSendResult.data?.consumed || dcSendResult.data.consumed.length === 0) && (
                    <tr><td colSpan="4" className="text-center py-3 text-[#9CA3AF]">No materials consumed</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
            <div className="flex justify-end pt-2 border-t">
              <button onClick={() => { setDcSendResult({ open: false, data: null }); fetchData(); }} className="btn-primary" data-testid="dc-send-ok">OK</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* JW GRN Dialog — Receive via JW Number (SC with RM) */}
      <Dialog open={jwGrnDialog} onOpenChange={setJwGrnDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-[Chivo]">Receive GRN — {jwGrnOrder?.order_number}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier Invoice No. *</label>
                <input type="text" value={jwGrnInvoiceNo} onChange={e => setJwGrnInvoiceNo(e.target.value)} className="input-field" placeholder="Invoice number (required)" required data-testid="jw-grn-invoice-no" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Invoice Date *</label>
                <input type="date" value={jwGrnInvoiceDate} onChange={e => setJwGrnInvoiceDate(e.target.value)} className="input-field" required data-testid="jw-grn-invoice-date" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-2">Parts to Receive</label>
              <table className="w-full data-table text-sm">
                <thead><tr><th>Part No.</th><th>Name</th><th className="text-right">Ordered</th><th className="text-right">Process Cost/Unit</th><th className="text-right">Receive Qty</th></tr></thead>
                <tbody>
                  {jwGrnLines.map((l, i) => (
                    <tr key={i}>
                      <td className="mono font-medium">{l.part_number}</td>
                      <td>{l.name}</td>
                      <td className="text-right mono">{l.quantity}</td>
                      <td className="text-right"><input type="number" min="0" step="0.01" value={l.charges} onChange={e => { const lines = [...jwGrnLines]; lines[i] = { ...lines[i], charges: parseFloat(e.target.value) || 0 }; setJwGrnLines(lines); }} className="input-field mono w-24 text-right text-xs" data-testid={`jw-grn-price-${i}`} /></td>
                      <td className="text-right"><input type="number" min="0" max={l.quantity} value={l.received_quantity} onChange={e => { const lines = [...jwGrnLines]; lines[i] = { ...lines[i], received_quantity: Math.min(parseInt(e.target.value) || 0, l.quantity) }; setJwGrnLines(lines); }} className="input-field mono w-20 text-right text-xs" data-testid={`jw-grn-qty-${i}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button onClick={() => setJwGrnDialog(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleJWGRNSubmit} className="btn-primary" disabled={!jwGrnInvoiceNo.trim() || !jwGrnInvoiceDate} data-testid="jw-grn-submit">Create GRN</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
