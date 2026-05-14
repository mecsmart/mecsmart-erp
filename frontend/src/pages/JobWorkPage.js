import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Plus, Truck, Package, CheckCircle2, ArrowRight, ArrowLeft, X, FileText, Edit2, Printer, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
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
    lines: [{ item_id: '', item_search: '', quantity: 1, unit_price: 0, processing_charges: 0, notes: '' }]
  });

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
  const addOrderLine = () => setOrderForm({ ...orderForm, lines: [...orderForm.lines, { item_id: '', quantity: 0, rate: 0 }] });
  const removeOrderLine = (idx) => setOrderForm({ ...orderForm, lines: orderForm.lines.filter((_, i) => i !== idx) });
  const updateOrderLine = (idx, field, val) => { const lines = [...orderForm.lines]; lines[idx] = { ...lines[idx], [field]: val }; setOrderForm({ ...orderForm, lines }); };
  const addJWPart = () => setOrderForm({ ...orderForm, job_work_parts: [...orderForm.job_work_parts, { item_id: '', quantity: 0, charges: 0, item_description: '', process_name: '' }] });
  const removeJWPart = (idx) => setOrderForm({ ...orderForm, job_work_parts: orderForm.job_work_parts.filter((_, i) => i !== idx) });
  const updateJWPart = (idx, field, val) => { const parts = [...orderForm.job_work_parts]; parts[idx] = { ...parts[idx], [field]: val }; setOrderForm({ ...orderForm, job_work_parts: parts }); };

  // Auto-populate charges from BOM when user selects an item for a JW part.
  // Charges resolution priority:
  //   1) Existing user-entered charges (don't clobber)
  //   2) For Job Card OS rows (have a process_name): the specific routing's cost
  //   3) Combined BOM process cost (Full MO-SC fallback)
  const updateJWPartItem = async (idx, item_id) => {
    const parts = [...orderForm.job_work_parts];
    parts[idx] = { ...parts[idx], item_id };
    setOrderForm({ ...orderForm, job_work_parts: parts });
    if (!item_id) return;
    try {
      const { data } = await api.get(`/api/bom/costs/${item_id}`);
      const cur = [...orderForm.job_work_parts];
      const existing = cur[idx] || {};
      const isJobCardOS = !!(editingOrder?.reference_operation_seqs?.length || editingOrder?.reference_operation_seq);
      let autoCharges = existing.charges;
      if (!autoCharges) {
        if (isJobCardOS && existing.process_name) {
          try {
            const { data: rc } = await api.get(`/api/bom/routing-cost`, { params: { item_id, process_name: existing.process_name } });
            autoCharges = rc.cost || 0;
          } catch { autoCharges = 0; }
        } else {
          autoCharges = data.process_cost || 0;
        }
      }
      cur[idx] = {
        ...existing,
        item_id,
        charges: autoCharges,
        process_names: data.process_names || [],
      };
      setOrderForm({ ...orderForm, job_work_parts: cur });
    } catch (e) { /* silent */ }
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
        item_description: l.item_description || '',
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
      lines: [{ item_id: '', item_search: '', quantity: 1, unit_price: 0, processing_charges: 0, notes: '' }]
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
      lines: (dc.lines || []).map(l => ({
        item_id: l.item_id,
        item_search: '',
        quantity: l.quantity || 0,
        unit_price: l.unit_price || (items.find(i => i.id === l.item_id)?.unit_cost) || 0,
        processing_charges: l.processing_charges || 0,
        notes: l.notes || '',
      })),
    });
    setManualDcDialog(true);
  };

  const addManualDcLine = () => {
    setManualDcForm(prev => ({ ...prev, lines: [...prev.lines, { item_id: '', item_search: '', quantity: 1, unit_price: 0, processing_charges: 0, notes: '' }] }));
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
        lines: validLines.map(l => ({
          item_id: l.item_id,
          quantity: parseFloat(l.quantity),
          unit_price: parseFloat(l.unit_price || 0),
          processing_charges: parseFloat(l.processing_charges || 0),
          notes: l.notes || ''
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
    const supplierAddr = [supplier.address, supplier.city, supplier.state].filter(Boolean).join(', ') + (supplier.pin_code ? ` - ${supplier.pin_code}` : '');
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
    
    // Rename title based on SC type:
    //  • "with_material" (SC with RM) → "Job Order Cum Delivery Challan"
    //  • "without_material" (Job OS — only processing) → "Job Work Order Cum Delivery Challan"
    //  • Fallback for pure material transfer DCs → "Delivery Challan"
    const scType = dc.order?.subcontract_type;
    const hasJobParts = (dc.order?.job_work_parts || []).length > 0;
    const isJobOS = scType === 'without_material' && hasJobParts;
    let dcTitle = 'Delivery Challan';
    if (scType === 'with_material') {
      dcTitle = 'Job Order Cum Delivery Challan';
    } else if (scType === 'without_material' && hasJobParts) {
      dcTitle = 'Job Work Order Cum Delivery Challan';
    }
    
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${dcTitle} - ${dc.dc_number}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#111; padding:20px; }
      ${letterheadCSS('#1D3557')}
      .dc-meta { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:15px; }
      .dc-meta .dc-title { font-size:16px; font-weight:700; color:#1D3557; text-transform:uppercase; letter-spacing:0.5px; }
      .dc-meta .dc-number { font-size:12px; font-family:'Courier New',monospace; color:#333; }
      .dc-meta .dc-date { font-size:10px; color:#666; margin-top:2px; }
      .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px; }
      .info-box { border:1px solid #ddd; padding:8px 10px; border-radius:2px; }
      .info-box label { font-size:9px; color:#888; text-transform:uppercase; display:block; margin-bottom:2px; }
      .info-box span { font-weight:600; font-size:11px; }
      .info-box .sub-text { font-weight:normal; font-size:10px; color:#555; }
      .section-title { font-size:13px; font-weight:700; color:#1D3557; margin:15px 0 8px; border-bottom:1px solid #1D3557; padding-bottom:4px; }
      table { width:100%; border-collapse:collapse; margin-bottom:10px; }
      th { background:#333; color:white; padding:6px 8px; text-align:left; font-size:10px; text-transform:uppercase; }
      td { padding:6px 8px; border-bottom:1px solid #ddd; font-size:11px; }
      .mono { font-family:'Courier New',monospace; }
      .text-right { text-align:right; }
      .total-row { font-weight:700; background:#f0f0f0; }
      .terms-box { border:1px solid #ddd; padding:10px; margin-top:10px; margin-bottom:20px; border-radius:2px; }
      .terms-box h3 { font-size:10px; text-transform:uppercase; color:#1D3557; margin-bottom:6px; font-weight:700; }
      .terms-box ol { padding-left:18px; font-size:10px; color:#444; line-height:1.7; }
      .footer { margin-top:30px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; font-size:10px; }
      .sign-box { border-top:1px solid #333; padding-top:4px; text-align:center; margin-top:40px; }
      @media print { body { padding:10px; } }
    </style></head><body>
    ${buildLetterheadHTML(cs)}
    <div class="dc-meta">
      <div class="dc-title">${dcTitle}</div>
      <div style="text-align:right;">
        <div class="dc-number">${dc.dc_number}</div>
        <div class="dc-date">${dc.created_at ? new Date(dc.created_at).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '-'}</div>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-box">
        <label>Subcontractor / Vendor</label>
        <span>${supplier.name || '-'}</span>
        ${supplierAddr ? `<br/><span class="sub-text">${supplierAddr}</span>` : ''}
        ${supplier.gstin ? `<br/><span class="sub-text">GSTIN: ${supplier.gstin}</span>` : ''}
        ${supplier.phone ? `<br/><span class="sub-text">Ph: ${supplier.phone}</span>` : ''}
      </div>
      <div class="info-box">
        <label>Reference</label>
        <span>JW Order: <span class="mono">${dc.order?.order_number || '-'}</span></span>
        <br/><span class="sub-text">Status: ${dc.status}</span>
      </div>
    </div>
    
    ${isJobOS ? `
    <div class="section-title">Job Work Part Details</div>
    <table>
      <thead><tr><th>Sl. No.</th><th>Part No. &amp; Name</th><th>HSN</th><th class="text-right">Qty</th><th>UOM</th><th class="text-right">Charges/Unit</th><th class="text-right">Total Charges</th><th class="text-right">RM Cost/Unit</th><th class="text-right">Total Amount</th></tr></thead>
      <tbody>
      ${(() => {
        // Build Part lookup from SC.job_work_parts so older DC lines (created before
        // processing_charges was persisted on DC lines) can still show Charges/Unit.
        const jwByItem = {};
        (dc.order?.job_work_parts || []).forEach(p => { jwByItem[p.item_id] = p; });
        // Prefer DC line-level values; fall back to SC job_work_parts by item_id.
        const rows = (dc.lines && dc.lines.length) ? dc.lines.map(l => {
          const it = l.item || items.find(i => i.id === l.item_id) || {};
          const qty = l.quantity || 0;
          const fallback = jwByItem[l.item_id] || {};
          const charges = l.processing_charges || fallback.charges || 0;
          const rmCost = l.rate || fallback.bom_rollup_cost || 0;
          const description = l.item_description || fallback.item_description || '';
          const processName = l.process_name || fallback.process_name || '';
          return { it, qty, charges, rmCost, description, processName };
        }) : jwParts.map(p => {
          const pit = p.item || items.find(it => it.id === p.item_id) || {};
          return { it: pit, qty: p.quantity || 0, charges: p.charges || 0, rmCost: p.bom_rollup_cost || pit.unit_cost || 0, description: p.item_description || '', processName: p.process_name || '' };
        });
        const body = rows.map((r, i) => {
          const totalCharges = r.qty * r.charges;
          const totalAmount = r.qty * r.rmCost;
          const partCell = `${r.it.part_number || '-'}, ${r.it.name || '-'}` +
            (r.processName ? `<br/><span class="sub-text" style="font-size:9px;color:#723B13;">Op: ${r.processName}</span>` : '') +
            (r.description ? `<br/><span class="sub-text" style="font-size:9px;">${r.description}</span>` : '');
          return `<tr><td>${i+1}</td><td>${partCell}</td><td>${r.it.hsn_code || '-'}</td><td class="text-right mono">${r.qty}</td><td>${r.it.unit_of_measure || 'Nos'}</td><td class="text-right mono">${currencySymbol}${fmtAmt(r.charges)}</td><td class="text-right mono">${currencySymbol}${fmtAmt(totalCharges)}</td><td class="text-right mono">${currencySymbol}${fmtAmt(r.rmCost)}</td><td class="text-right mono">${currencySymbol}${fmtAmt(totalAmount)}</td></tr>`;
        }).join('');
        const grandCharges = rows.reduce((s, r) => s + r.qty * r.charges, 0);
        const grandAmount = rows.reduce((s, r) => s + r.qty * r.rmCost, 0);
        const totalRow = `<tr class="total-row"><td colspan="6" class="text-right">Total Process Charges</td><td class="text-right mono">${currencySymbol}${fmtAmt(grandCharges)}</td><td class="text-right">Total RM Cost</td><td class="text-right mono">${currencySymbol}${fmtAmt(grandAmount)}</td></tr>`;
        return body + totalRow;
      })()}
      </tbody>
    </table>
    ` : `
    ${jwParts.length > 0 ? `
    <div class="section-title">Job Work Part Details</div>
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
    <table>
      <thead><tr><th>Sl. No.</th><th>Part No. & Name</th><th>HSN</th><th class="text-right">QTY</th><th>UOM</th><th class="text-right">Rate/Unit</th><th class="text-right">Total RM Cost</th></tr></thead>
      <tbody>
      ${dc.lines.map((l, i) => {
        const it = l.item || items.find(x => x.id === l.item_id) || {};
        // Prefer the line-level unit_price persisted on manual DCs; fall back
        // to the item master unit cost for SC-linked DCs that never had a
        // per-line price captured.
        const rate = l.unit_price || it.unit_cost || l.rate || 0;
        const uom = l.unit || it.unit_of_measure || 'pcs';
        const cost = l.quantity * rate;
        return `<tr><td>${i+1}</td><td>${it.part_number || '-'}, ${it.name || '-'}</td><td>${it.hsn_code || '-'}</td><td class="text-right mono">${l.quantity}</td><td>${uom}</td><td class="text-right mono">${currencySymbol}${fmtAmt(rate)}</td><td class="text-right mono">${currencySymbol}${fmtAmt(cost)}</td></tr>`;
      }).join('')}
      <tr class="total-row"><td colspan="6" class="text-right">Total RM Cost</td><td class="text-right mono">${currencySymbol}${fmtAmt(totalRMCost)}</td></tr>
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
    </body></html>`;
    downloadHtmlAsPdf(html, `${dcTitle.replace(/\s+/g, '-')}-${dc.dc_number || 'document'}.pdf`);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-[Chivo] text-[#111827]">Job Work / Subcontracting</h1>
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
          <div className="px-4 py-3 flex items-center justify-between font-semibold text-[#111827] border-b border-[#E5E7EB]" data-testid="jw-section-header-orders">
            <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-[#1D3557]" /> Subcontract Orders <span className="text-xs text-[#6B7280] font-normal">({orders.length})</span></span>
          </div>
          <div className="px-4 pb-4 pt-4">
          <div className="flex justify-end mb-4">
            {canCreate && <button onClick={() => setOrderDialog(true)} className="btn-primary flex items-center space-x-2" data-testid="create-jw-order-btn"><Plus className="w-4 h-4" /><span>New Subcontract Order</span></button>}
          </div>
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
          <div className="px-4 py-3 flex items-center justify-between font-semibold text-[#111827] border-b border-[#E5E7EB]" data-testid="jw-section-header-challans">
            <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#1D3557]" /> Delivery Challans <span className="text-xs text-[#6B7280] font-normal">({challans.length})</span></span>
            <span className="flex items-center gap-2">
              {canCreate && (
                <button type="button" onClick={openManualDC} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1" data-testid="create-manual-dc-btn">
                  <Plus className="w-3 h-3" /> Create DC
                </button>
              )}
            </span>
          </div>
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
                        <td className="text-sm">{dc.created_at ? new Date(dc.created_at).toLocaleDateString() : '-'}</td>
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
                              <Printer className="w-3 h-3 inline mr-1" />Print
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
          <div className="px-4 py-3 flex items-center justify-between font-semibold text-[#111827] border-b border-[#E5E7EB]" data-testid="jw-section-header-receipts">
            <span className="flex items-center gap-2"><Package className="w-4 h-4 text-[#1D3557]" /> Receipts <span className="text-xs text-[#6B7280] font-normal">({receipts.length})</span></span>
          </div>
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
                <Select value={orderForm.supplier_id} onValueChange={v => setOrderForm({...orderForm, supplier_id: v})}>
                  <SelectTrigger data-testid="jw-supplier-select"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}</SelectContent>
                </Select>
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
                  <thead><tr className="bg-[#F3F4F6]"><th className="text-left py-2 px-2 text-xs">Item</th><th className="text-right py-2 px-2 text-xs w-24">Qty</th><th className="text-right py-2 px-2 text-xs w-24">Rate/Unit</th><th className="text-right py-2 px-2 text-xs w-28">Total</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {orderForm.lines.map((l, idx) => {
                      const lineTotal = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
                      return (
                      <tr key={idx} className="border-t">
                        <td className="py-1 px-2">
                          <SearchableItemSelect
                            items={items}
                            value={l.item_id}
                            onChange={(id) => updateOrderLine(idx, 'item_id', id)}
                            placeholder="Search item by code / name…"
                            testId={`jw-rm-${idx}-item`}
                          />
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
                        <td colSpan="3" className="py-2 px-2 text-right text-xs">Grand Total RM:</td>
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
                <Select value={manualDcForm.supplier_id} onValueChange={(v) => setManualDcForm({ ...manualDcForm, supplier_id: v })}>
                  <SelectTrigger data-testid="manual-dc-supplier"><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.gstin ? ` (${s.gstin})` : ''}</SelectItem>)}</SelectContent>
                </Select>
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
            <div>
              <label className="block text-sm font-semibold mb-1">From Warehouse (optional)</label>
              <Select value={manualDcForm.warehouse_id} onValueChange={(v) => setManualDcForm({ ...manualDcForm, warehouse_id: v })}>
                <SelectTrigger data-testid="manual-dc-warehouse"><SelectValue placeholder="(Main stock)" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
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
                      <th style={{ width: '110px' }}>Charges/Unit ({currencySymbol})</th>
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
                        <tr key={idx} data-testid={`manual-dc-line-${idx}`}>
                          <td className="row-num">{idx + 1}</td>
                          <td>
                            <div className="px-1 py-1">
                              {selected ? (
                                <div className="flex items-center justify-between bg-[#F0FDF4] border border-[#03543F] rounded-sm px-2 py-1" data-testid={`manual-dc-selected-${idx}`}>
                                  <div className="text-xs truncate">
                                    <span className="mono font-semibold">{selected.part_number}</span>
                                    <span className="mx-1">—</span>
                                    <span>{selected.name}</span>
                                    <span className="ml-2 text-[#6B7280]">Stock: {selected.current_stock || 0}</span>
                                  </div>
                                  <button type="button" className="text-[10px] text-[#9B1C1C] hover:underline ml-2" onClick={() => updateManualDcLine(idx, { item_id: '', item_search: '' })} data-testid={`manual-dc-clear-${idx}`}>Clear</button>
                                </div>
                              ) : (
                                <>
                                  <input type="text" placeholder="Start typing part number or name…" value={line.item_search || ''} onChange={(e) => updateManualDcLine(idx, { item_search: e.target.value })} className="grid-input" data-testid={`manual-dc-search-${idx}`} />
                                  {q && (
                                    <div className="mt-1 border border-[#E5E7EB] rounded-sm max-h-32 overflow-auto bg-white">
                                      {filtered.length === 0 && <div className="px-2 py-2 text-[10px] text-center text-[#6B7280]">No matching items</div>}
                                      {filtered.slice(0, 50).map(it => (
                                        <button key={it.id} type="button" onClick={() => updateManualDcLine(idx, { item_id: it.id, item_search: '', unit_price: it.unit_cost || 0 })} data-testid={`manual-dc-option-${idx}-${it.id}`} className="w-full text-left px-2 py-1 text-[11px] border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]">
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
                            <input type="number" min="0" step="0.01" value={line.processing_charges} onChange={(e) => updateManualDcLine(idx, { processing_charges: parseFloat(e.target.value) || 0 })} className="grid-input mono num" data-testid={`manual-dc-charges-${idx}`} />
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
              <button type="button" onClick={handleCreateManualDC} className="btn-primary" data-testid="manual-dc-submit">{manualDcForm.id ? 'Update DC & Adjust Stock' : 'Create DC & Deduct Stock'}</button>
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
                <Printer className="w-4 h-4" /><span>Print DC</span>
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
