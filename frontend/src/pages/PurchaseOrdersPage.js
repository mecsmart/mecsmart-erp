import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { 
  Plus, ShoppingCart, FileText, Filter, X, CheckCircle2, Send, 
  Edit2, History, ChevronDown, ChevronUp, Trash2, Printer, XCircle, Search, Truck, Lock
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { POPrintDialog } from '../components/PrintDialogs';
import { SearchableItemSelect } from '../components/SearchableItemSelect';
import { SearchableSelect } from '../components/SearchableSelect';
import { useDraggableRows } from '../hooks/useDraggableRows';
import { QuickAddPartyDialog } from '../components/QuickAddPartyDialog';

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partial', label: 'Partial' },
  { value: 'received', label: 'GRN Done' },
  { value: 'short_closed', label: 'Short Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const emptyLine = { item_id: '', description: '', quantity: 1, unit_price: 0, uom: 'pcs', hsn_code: '', gst_rate: 18, discount_type: 'percentage', discount_value: 0, notes: '' };
const emptyCharge = { charge_type_id: '', name: '', hsn_code: '', gst_rate: 18, amount: 0 };

const emptyForm = {
  supplier_id: '', expected_date: '', delivery_warehouse_id: '', 
  quotation_ref: '', quotation_date: '', lines: [], additional_charges: [], notes: '',
  revision_label: '',  // Manual revision label ("A", "1", "Rev-01"); blank = auto
  currency: 'INR',     // INR (default), USD, EUR, GBP, AED — non-INR ⇒ no GST (export/import)
};

export default function PurchaseOrdersPage() {
  const { user, hasPermission } = useAuth();
  const { formatCurrency, currencySymbol, companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [chargeTypes, setChargeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [viewPO, setViewPO] = useState(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  const [allOrders, setAllOrders] = useState([]);
  const [poSearch, setPoSearch] = useState('');

  // Permission-driven visibility: admin always allowed, otherwise use granular permissions.
  // This unblocks custom roles that were granted purchase_orders.create/edit explicitly.
  // Permission gating — view = list only; edit = update existing PO + GRN +
  // short-close; create = brand-new PO. Admins always pass.
  const isAdmin = user?.role === 'admin' || user?.is_admin_group;
  const canCreate = isAdmin || hasPermission('purchase_orders', 'create');
  const canEdit = canCreate || hasPermission('purchase_orders', 'edit');
  const canDelete = isAdmin || hasPermission('purchase_orders', 'delete');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, suppliersRes, itemsRes, whRes, chargesRes] = await Promise.all([
        api.get('/api/purchase-orders'),
        api.get('/api/suppliers?status=active'),
        api.get('/api/items'),
        api.get('/api/warehouses?status=active'),
        api.get('/api/settings/po-charges'),
      ]);
      setAllOrders(ordersRes.data);
      setSuppliers(suppliersRes.data);
      setItems(itemsRes.data);
      setWarehouses(whRes.data);
      setChargeTypes(chargesRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // After returning from /suppliers?action=add&returnTo=po we get
  // `?newSupplierId=<id>` on the URL. Auto-open the New PO dialog and
  // pre-select that supplier so the user resumes their flow seamlessly.
  // The param is stripped after consumption to avoid re-opening on
  // browser refresh.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const newSupplierId = params.get('newSupplierId');
    if (!newSupplierId) return;
    const sup = suppliers.find(s => s.id === newSupplierId);
    if (!sup) return; // wait until suppliers list refreshes with the new one
    setEditingPO(null);
    setFormData({ ...emptyForm, supplier_id: sup.id, lines: [], additional_charges: [] });
    setIsDialogOpen(true);
    params.delete('newSupplierId');
    navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, suppliers]);

  const filteredOrders = (statusFilter ? allOrders.filter(po => po.status === statusFilter) : allOrders).filter(po => {
    if (!poSearch.trim()) return true;
    const q = poSearch.toLowerCase();
    return po.po_number?.toLowerCase().includes(q) || po.supplier?.name?.toLowerCase().includes(q) || po.lines?.some(l => l.item?.part_number?.toLowerCase().includes(q) || l.item?.name?.toLowerCase().includes(q));
  });

  const openCreateDialog = () => {
    setEditingPO(null);
    setFormData({ ...emptyForm, lines: [], additional_charges: [] });
    setIsDialogOpen(true);
  };

  const openEditDialog = (po) => {
    setEditingPO(po);
    setFormData({
      supplier_id: po.supplier_id || '',
      expected_date: po.expected_date ? po.expected_date.substring(0, 10) : '',
      delivery_warehouse_id: po.delivery_warehouse_id || '',
      quotation_ref: po.quotation_ref || '',
      quotation_date: po.quotation_date ? po.quotation_date.substring(0, 10) : '',
      lines: (po.lines || []).map(l => ({
        item_id: l.item_id || '',
        description: l.description || '',
        quantity: l.quantity || 1,
        unit_price: l.unit_price || 0,
        uom: l.uom || 'pcs',
        hsn_code: l.hsn_code || '',
        gst_rate: l.gst_rate != null ? l.gst_rate : 18,
        discount_type: l.discount_type || 'percentage',
        discount_value: l.discount_value || 0,
        notes: l.notes || '',
      })),
      additional_charges: (po.additional_charges || []).map(c => ({
        charge_type_id: c.charge_type_id || '',
        name: c.name || '',
        hsn_code: c.hsn_code || '',
        gst_rate: c.gst_rate != null ? c.gst_rate : 18,
        amount: c.amount || 0,
      })),
      notes: po.notes || '',
      terms_conditions: po.terms_conditions !== undefined ? po.terms_conditions : undefined,
      revision_label: po.revision_label || (po.revision ? `R${po.revision}` : ''),
      currency: po.currency || 'INR',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        expected_date: new Date(formData.expected_date).toISOString(),
        quotation_date: formData.quotation_date ? new Date(formData.quotation_date).toISOString() : null,
      };
      if (editingPO) {
        await api.put(`/api/purchase-orders/${editingPO.id}`, payload);
      } else {
        await api.post('/api/purchase-orders', payload);
      }
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Failed to save PO:', error);
      alert(error.response?.data?.detail || 'Failed to save purchase order');
    }
  };

  const handleStatusChange = async (po, newStatus) => {
    try {
      await api.put(`/api/purchase-orders/${po.id}`, { status: newStatus });
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update purchase order');
    }
  };

  const addLine = () => setFormData({ ...formData, lines: [...formData.lines, { ...emptyLine }] });
  const removeLine = (i) => setFormData({ ...formData, lines: formData.lines.filter((_, idx) => idx !== i) });

  const { getRowProps: getLineRowProps } = useDraggableRows(
    formData.lines,
    (next) => setFormData(f => ({ ...f, lines: next })),
  );

  const updateLine = (index, field, value) => {
    const newLines = [...formData.lines];
    const previousItemId = newLines[index].item_id;
    newLines[index] = { ...newLines[index], [field]: value };
    if (field === 'item_id' && value !== previousItemId) {
      // Item ACTUALLY changed (not a re-pick of the same item). Auto-fill
      // master fields. We previously reset on every item_id assign, which
      // wiped any custom description the user had typed when they happened
      // to re-click the item picker. Only seed the description when there
      // is no existing user-entered text, so re-selecting the same item
      // (or a different one when the user has already typed a custom
      // description) preserves their edits.
      const item = items.find(it => it.id === value);
      if (item) {
        newLines[index].unit_price = item.unit_cost || 0;
        newLines[index].hsn_code = item.hsn_code || '';
        newLines[index].gst_rate = item.gst_rate != null ? item.gst_rate : 18;
        newLines[index].uom = item.unit_of_measure || 'pcs';
        // Only auto-fill description if the line doesn't already have one.
        const existing = (newLines[index].description || '').trim();
        if (!existing) {
          newLines[index].description = item.description || '';
        }
      }
    }
    setFormData({ ...formData, lines: newLines });
  };

  const addCharge = () => setFormData({ ...formData, additional_charges: [...formData.additional_charges, { ...emptyCharge }] });
  const removeCharge = (i) => setFormData({ ...formData, additional_charges: formData.additional_charges.filter((_, idx) => idx !== i) });

  const updateCharge = (index, field, value) => {
    const newCharges = [...formData.additional_charges];
    newCharges[index] = { ...newCharges[index], [field]: value };
    if (field === 'charge_type_id') {
      const ct = chargeTypes.find(c => c.id === value);
      if (ct) {
        newCharges[index].name = ct.name;
        newCharges[index].hsn_code = ct.hsn_code || '';
        newCharges[index].gst_rate = ct.gst_rate != null ? ct.gst_rate : 18;
      }
    }
    setFormData({ ...formData, additional_charges: newCharges });
  };

  const resetForm = () => {
    setFormData({ ...emptyForm, lines: [], additional_charges: [] });
    setEditingPO(null);
  };

  const calcLineAmount = (l) => {
    const gross = l.quantity * l.unit_price;
    const disc = l.discount_type === 'percentage' ? gross * (l.discount_value || 0) / 100 : (l.discount_value || 0);
    return gross - disc;
  };

  const calcSubtotal = () => formData.lines.reduce((s, l) => s + calcLineAmount(l), 0);
  const calcChargesTotal = () => formData.additional_charges.reduce((s, c) => s + (c.amount || 0), 0);
  const calcGST = () => {
    const lineGST = formData.lines.reduce((s, l) => s + calcLineAmount(l) * (l.gst_rate || 0) / 100, 0);
    const chargeGST = formData.additional_charges.reduce((s, c) => s + (c.amount || 0) * (c.gst_rate || 0) / 100, 0);
    return lineGST + chargeGST;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-[#F3F4F6] text-[#4B5563]';
      case 'sent': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'partial': return 'bg-[#FDF6B2] text-[#723B13]';
      case 'received': return 'bg-[#DEF7EC] text-[#03543F]';
      case 'short_closed': return 'bg-[#E5E7EB] text-[#374151]';
      case 'cancelled': return 'bg-[#FDE8E8] text-[#9B1C1C]';
      default: return 'bg-[#F3F4F6] text-[#4B5563]';
    }
  };

  const [printPO, setPrintPO] = useState(null);
  const [shortCloseDialog, setShortCloseDialog] = useState({ open: false, po: null, reason: '' });
  // Inline Add/Edit Supplier dialog (Odoo-style + button next to the dropdown).
  const [quickPartyOpen, setQuickPartyOpen] = useState(false);
  const [quickPartyEditing, setQuickPartyEditing] = useState(null);

  const handleCancelPO = async (po) => {
    if (!window.confirm(`Cancel ${po.po_number}? This action cannot be undone.`)) return;
    try {
      await api.post(`/api/purchase-orders/${po.id}/cancel`);
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to cancel PO'); }
  };

  const handleShortClosePO = async () => {
    const po = shortCloseDialog.po;
    if (!po) return;
    try {
      await api.post(`/api/purchase-orders/${po.id}/short-close`, { reason: shortCloseDialog.reason });
      setShortCloseDialog({ open: false, po: null, reason: '' });
      fetchData();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to short-close PO');
    }
  };

  return (
    <div className="space-y-4" data-testid="purchase-orders-page">
      <div className="flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30 bg-white py-2 border-b border-[#E5E7EB] -mx-6 px-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold font-[Chivo] text-[#111827]">Purchase Orders</h1>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 h-8 text-xs" data-testid="po-status-filter">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {statusFilter && <button onClick={() => setStatusFilter('')} className="text-[10px] text-[#9B1C1C] hover:underline">Clear</button>}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
            <input type="text" value={poSearch} onChange={(e) => setPoSearch(e.target.value)} placeholder="Search PO, supplier, item…" className="pl-8 pr-2 py-1.5 border border-[#D1D5DB] rounded-sm text-xs w-full focus:outline-none focus:border-[#1D3557]" data-testid="po-search-input" />
          </div>
        </div>
        {canCreate && (
          <button onClick={openCreateDialog} className="btn-primary flex items-center space-x-2" data-testid="create-po-btn">
            <Plus className="w-4 h-4" /><span>Create PO</span>
          </button>
        )}
      </div>

      {/* Orders List */}
      <div className="card-flat overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
            <FileText className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No purchase orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto sticky-header-scroll">
            <table className="w-full data-table" data-testid="po-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Quotation Ref</th>
                  <th>Lines</th>
                  <th className="text-right">Subtotal</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th>Expected</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((po) => (
                  <tr key={po.id} data-testid={`po-row-${po.id}`}>
                    <td className="mono font-medium">
                      {po.po_number}
                      {po.revision > 0 && <span className="ml-1 text-xs text-[#6B7280]">Rev.{po.revision}</span>}
                    </td>
                    <td>
                      <span className="mono text-xs">{po.supplier?.code}</span>
                      <p className="text-sm">{po.supplier?.name}</p>
                    </td>
                    <td className="text-sm">
                      {po.quotation_ref ? (
                        <div>
                          <span className="mono">{po.quotation_ref}</span>
                          {po.quotation_date && <p className="text-xs text-[#6B7280]">{new Date(po.quotation_date).toLocaleDateString()}</p>}
                        </div>
                      ) : <span className="text-[#9CA3AF]">-</span>}
                    </td>
                    <td className="mono">{po.lines?.length || 0} items</td>
                    <td className="text-right mono">{formatCurrency(po.subtotal || 0, po.currency)}</td>
                    <td className="text-right">
                      {po.total_tax > 0 ? (
                        <div className="text-xs">
                          <span className="mono font-medium">{formatCurrency(po.total_tax || 0, po.currency)}</span>
                          <span className="block text-[#6B7280]">{po.is_inter_state ? 'IGST' : 'CGST+SGST'}</span>
                        </div>
                      ) : <span className="mono text-[#9CA3AF]">-</span>}
                    </td>
                    <td className="text-right mono font-semibold">{formatCurrency(po.total_amount || 0, po.currency)}</td>
                    <td>
                      <span className={`status-badge ${getStatusColor(po.status)}`}>{po.status === 'received' ? 'GRN Done' : po.status === 'short_closed' ? 'Short Closed' : po.status}</span>
                    </td>
                    <td className="text-sm text-[#4B5563]">
                      {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      <div className="flex items-center space-x-1">
                        {po.status !== 'received' && po.status !== 'cancelled' && po.status !== 'short_closed' && canEdit && (
                          <button onClick={() => openEditDialog(po)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Edit PO" data-testid={`edit-po-${po.id}`}>
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {po.status === 'draft' && canEdit && (
                          <button onClick={() => handleStatusChange(po, 'sent')} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Send PO">
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {po.revision > 0 && (
                          <button onClick={() => setViewPO(po)} className="p-1 text-[#4B5563] hover:text-[#6366F1]" title="View Revisions">
                            <History className="w-4 h-4" />
                          </button>
                        )}
                        {po.status === 'received' && (
                          <span className="flex items-center gap-1 text-xs text-[#03543F] font-medium">
                            <CheckCircle2 className="w-4 h-4" /> {po.grn_number || 'GRN'}
                          </span>
                        )}
                        {/* Print button */}
                        <button onClick={() => setPrintPO(po)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded border border-[#E5E7EB]" title="Preview &amp; Save as PDF" data-testid={`print-po-${po.id}`}>
                          <Printer className="w-3.5 h-3.5" /> PDF
                        </button>
                        {/* Short-close: only for active POs that haven't been fully received/cancelled */}
                        {['draft', 'approved', 'sent', 'partial'].includes(po.status) && canEdit && (
                          <button onClick={() => setShortCloseDialog({ open: true, po, reason: '' })} className="p-1 text-[#4B5563] hover:text-[#723B13]" title="Short-close PO (release pending qty back to MRP)" data-testid={`short-close-po-${po.id}`}>
                            <Lock className="w-4 h-4" />
                          </button>
                        )}
                        {po.status !== 'received' && po.status !== 'cancelled' && po.status !== 'short_closed' && canEdit && (
                          <button onClick={() => handleCancelPO(po)} className="p-1 text-[#4B5563] hover:text-[#9B1C1C]" title="Cancel PO" data-testid={`cancel-po-${po.id}`}>
                            <XCircle className="w-4 h-4" />
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

      {/* Create / Edit PO Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setIsDialogOpen(open); }}>
        <DialogContent className="max-w-7xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">
              {editingPO ? `Edit ${editingPO.po_number}${editingPO.status !== 'draft' ? ' (New Revision)' : ''}` : 'Create Purchase Order'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-3" data-testid="po-form">
            {/* Row 1: Supplier, Expected Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier *</label>
                <div className="flex gap-1.5 items-stretch">
                  <div className="flex-1">
                    <SearchableSelect
                      options={suppliers}
                      value={formData.supplier_id}
                      onChange={(v) => setFormData({ ...formData, supplier_id: v })}
                      getLabel={(s) => s.name || ''}
                      getSecondary={(s) => s.code || ''}
                      matchFields={['name', 'code', 'gstin']}
                      placeholder="Type supplier code / name / GSTIN…"
                      testId="po-supplier-select"
                    />
                  </div>
                  {/* Inline + Add (Odoo-style) — opens QuickAddPartyDialog so the
                      user can create a new supplier without leaving the PO form. */}
                  <button
                    type="button"
                    onClick={() => navigate('/suppliers?action=add&returnTo=po')}
                    className="px-2 bg-[#03543F] text-white rounded hover:bg-[#03493A] text-sm"
                    title="Add new supplier"
                    data-testid="po-supplier-add"
                  >+</button>
                  {/* Inline edit pencil — only when a supplier is selected. */}
                  {formData.supplier_id && (
                    <button
                      type="button"
                      onClick={() => {
                        const s = suppliers.find(x => x.id === formData.supplier_id);
                        if (s) { setQuickPartyEditing(s); setQuickPartyOpen(true); }
                      }}
                      className="px-2 bg-[#1E429F] text-white rounded hover:bg-[#1D3557] text-xs"
                      title="Edit selected supplier"
                      data-testid="po-supplier-edit"
                    >✎</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Expected Date *</label>
                <input type="date" value={formData.expected_date} onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })} className="input-field" required data-testid="po-expected-date-input" />
              </div>
            </div>

            {/* Row 2: Quotation Ref, Quotation Date, Delivery Warehouse */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Vendor Quotation Ref No.</label>
                <input type="text" value={formData.quotation_ref} onChange={(e) => setFormData({ ...formData, quotation_ref: e.target.value })} className="input-field" placeholder="e.g. VQ-2025-001" data-testid="po-quotation-ref-input" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Quotation Date</label>
                <input type="date" value={formData.quotation_date} onChange={(e) => setFormData({ ...formData, quotation_date: e.target.value })} className="input-field" data-testid="po-quotation-date-input" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">
                  Revision {editingPO ? <span className="text-[11px] text-[#6B7280] font-normal">(manual override, e.g. A, B, R1)</span> : <span className="text-[11px] text-[#6B7280] font-normal">(optional)</span>}
                </label>
                <input
                  type="text"
                  value={formData.revision_label || ''}
                  onChange={(e) => setFormData({ ...formData, revision_label: e.target.value })}
                  className="input-field mono"
                  placeholder="A"
                  maxLength={8}
                  data-testid="po-revision-input"
                />
              </div>
            </div>

            {/* Row 3: Delivery Warehouse + Currency */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-[#111827] mb-1">Delivery Warehouse</label>
                <Select value={formData.delivery_warehouse_id || undefined} onValueChange={(v) => setFormData({ ...formData, delivery_warehouse_id: v })}>
                  <SelectTrigger data-testid="po-delivery-warehouse-select"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {formData.delivery_warehouse_id && (() => {
                  const wh = warehouses.find(w => w.id === formData.delivery_warehouse_id);
                  return wh?.address ? <p className="text-xs text-[#6B7280] mt-1 flex items-center"><Truck className="w-3 h-3 mr-1" />{wh.address}</p> : null;
                })()}
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">
                  Currency
                  <span className="text-[11px] text-[#6B7280] font-normal ml-1">(non-INR ⇒ no GST)</span>
                </label>
                <Select value={formData.currency || 'INR'} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger data-testid="po-currency-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR — ₹</SelectItem>
                    <SelectItem value="USD">USD — $</SelectItem>
                    <SelectItem value="EUR">EUR — €</SelectItem>
                    <SelectItem value="GBP">GBP — £</SelectItem>
                    <SelectItem value="AED">AED — د.إ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Order Lines */}
            <div className="border-t border-[#E5E7EB] pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-[#111827]">Order Lines</label>
                <button type="button" onClick={addLine} className="btn-secondary text-xs flex items-center space-x-1" data-testid="add-po-line-btn">
                  <Plus className="w-3 h-3" /><span>Add Line</span>
                </button>
              </div>

              {formData.lines.length === 0 ? (
                <div className="text-center py-6 text-[#4B5563] bg-[#F3F4F6] rounded-sm">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" /><p className="text-sm">No items added yet</p>
                </div>
              ) : (
                <div className="border border-[#E5E7EB] rounded-sm overflow-x-auto">
                  <table className="line-items-grid" data-testid="po-lines-table">
                    <thead>
                      <tr>
                        <th className="row-num">#</th>
                        <th style={{ minWidth: '280px' }}>Part No. / Name &amp; Description</th>
                        <th style={{ width: '90px' }}>HSN</th>
                        <th style={{ width: '80px', textAlign: 'right' }}>Qty</th>
                        <th style={{ width: '70px' }}>UOM</th>
                        <th style={{ width: '100px', textAlign: 'right' }}>Rate</th>
                        <th style={{ width: '110px' }}>Discount</th>
                        <th style={{ width: '70px' }}>GST%</th>
                        <th style={{ width: '120px', textAlign: 'right' }}>Total Amount</th>
                        <th className="remove-cell"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.lines.map((line, index) => (
                        <tr key={index} data-testid={`po-line-row-${index}`} {...getLineRowProps(index)}>
                          <td className="row-num drag-handle" title="Drag to reorder">{index + 1}</td>
                          <td>
                            <div className="px-1 py-1 space-y-1">
                              <SearchableItemSelect
                                items={items}
                                value={line.item_id}
                                onChange={(v) => updateLine(index, 'item_id', v)}
                                placeholder="Type part no / name…"
                                showCategory={true}
                                allowClear={false}
                                testId={`po-line-item-${index}`}
                              />
                              <textarea
                                rows={2}
                                value={line.description || ''}
                                onChange={(e) => updateLine(index, 'description', e.target.value)}
                                className="grid-textarea"
                                placeholder="Additional description (printed on PO) — click to edit or append…"
                                title="Click and type to add/edit description for this line item"
                                style={{ minHeight: 44, lineHeight: '1.35', resize: 'vertical' }}
                                data-testid={`po-line-description-${index}`}
                              />
                            </div>
                          </td>
                          <td>
                            <input type="text" value={line.hsn_code} onChange={(e) => updateLine(index, 'hsn_code', e.target.value)} className="grid-input mono" />
                          </td>
                          <td>
                            <input type="number" min="0" step="any" value={line.quantity} onChange={(e) => updateLine(index, 'quantity', parseFloat(e.target.value) || 0)} className="grid-input mono num" />
                          </td>
                          <td>
                            <input type="text" value={line.uom} onChange={(e) => updateLine(index, 'uom', e.target.value)} className="grid-input" />
                          </td>
                          <td>
                            <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(index, 'unit_price', parseFloat(e.target.value) || 0)} className="grid-input mono num" />
                          </td>
                          <td>
                            <div className="flex items-center" style={{ gap: 0 }}>
                              <input type="number" min="0" step="0.01" value={line.discount_value === 0 ? '' : line.discount_value} onChange={(e) => updateLine(index, 'discount_value', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="grid-input mono num" style={{flex: 1, minWidth: 0}} placeholder="0" data-testid={`po-line-discount-${index}`} />
                              <button
                                type="button"
                                onClick={() => updateLine(index, 'discount_type', line.discount_type === 'percentage' ? 'amount' : 'percentage')}
                                title={line.discount_type === 'percentage' ? 'Switch to flat Amount' : 'Switch to Percentage'}
                                data-testid={`po-line-discount-type-${index}`}
                                style={{ width: 22, height: 26, fontSize: 12, fontWeight: 600, border: '1px solid #D1D5DB', background: '#F3F4F6', color: '#1D3557', borderRadius: 2, cursor: 'pointer', flexShrink: 0 }}
                              >
                                {line.discount_type === 'percentage' ? '%' : '₹'}
                              </button>
                            </div>
                          </td>
                          <td>
                            <select value={String(line.gst_rate)} onChange={(e) => updateLine(index, 'gst_rate', parseFloat(e.target.value))} className="grid-select" data-testid={`po-line-gst-${index}`}>
                              {[0,5,12,18,28].map(r => <option key={r} value={String(r)}>{r}%</option>)}
                            </select>
                          </td>
                          <td className="static-cell amount">{formatCurrency(calcLineAmount(line), formData.currency)}</td>
                          <td className="remove-cell">
                            <button type="button" onClick={() => removeLine(index)} className="p-1 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Remove line" data-testid={`po-line-remove-${index}`}><X className="w-3 h-3" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="add-line-cell" colSpan={10}>
                          <button type="button" onClick={addLine} data-testid="po-add-line-footer-btn">
                            <Plus className="w-3 h-3" /> Add Line
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Additional Charges */}
            <div className="border-t border-[#E5E7EB] pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-[#111827]">Additional Charges</label>
                <button type="button" onClick={addCharge} className="btn-secondary text-xs flex items-center space-x-1" data-testid="add-po-charge-btn">
                  <Plus className="w-3 h-3" /><span>Add Charge</span>
                </button>
              </div>
              {formData.additional_charges.length > 0 && (
                <div className="space-y-0">
                  <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-2 px-2 py-1 bg-[#374151] text-white text-xs font-semibold rounded-t-sm">
                    <span>Charge Type</span><span>HSN Code</span><span>GST %</span><span>Amount</span><span className="text-right">Tax</span><span></span>
                  </div>
                  {formData.additional_charges.map((charge, i) => (
                    <div key={i} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-2 p-1 bg-[#F9FAFB] border-b border-[#E5E7EB] items-center">
                      {chargeTypes.length > 0 ? (
                        <Select value={charge.charge_type_id || undefined} onValueChange={(v) => updateCharge(i, 'charge_type_id', v)}>
                          <SelectTrigger className="bg-white text-xs h-8"><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            {chargeTypes.map(ct => <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <input type="text" value={charge.name} onChange={(e) => updateCharge(i, 'name', e.target.value)} className="input-field bg-white text-xs h-8" placeholder="Charge name" />
                      )}
                      <input type="text" value={charge.hsn_code} onChange={(e) => updateCharge(i, 'hsn_code', e.target.value)} className="input-field bg-white text-xs h-8 mono" />
                      <Select value={String(charge.gst_rate)} onValueChange={(v) => updateCharge(i, 'gst_rate', parseFloat(v))}>
                        <SelectTrigger className="bg-white text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0,5,12,18,28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <input type="number" min="0" step="0.01" value={charge.amount} onChange={(e) => updateCharge(i, 'amount', parseFloat(e.target.value) || 0)} className="input-field bg-white text-xs h-8 mono" />
                      <div className="text-right mono text-xs font-medium">{formatCurrency((charge.amount || 0) * (charge.gst_rate || 0) / 100, formData.currency)}</div>
                      <button type="button" onClick={() => removeCharge(i)} className="p-1 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            {formData.lines.length > 0 && (
              <div className="flex justify-end pt-2">
                <div className="text-right space-y-1 min-w-[220px]">
                  <div className="flex justify-between"><span className="text-sm text-[#4B5563]">Items Subtotal:</span><span className="mono font-medium">{formatCurrency(calcSubtotal(), formData.currency)}</span></div>
                  {calcChargesTotal() > 0 && <div className="flex justify-between"><span className="text-sm text-[#4B5563]">Charges:</span><span className="mono font-medium">{formatCurrency(calcChargesTotal(), formData.currency)}</span></div>}
                  {(formData.currency || 'INR') === 'INR' && (
                    <div className="flex justify-between"><span className="text-sm text-[#4B5563]">Est. GST:</span><span className="mono font-medium">{formatCurrency(calcGST(), formData.currency)}</span></div>
                  )}
                  <div className="flex justify-between border-t border-[#D1D5DB] pt-1"><span className="text-sm font-semibold">Total:</span><span className="mono font-bold text-lg">{formatCurrency(calcSubtotal() + calcChargesTotal() + ((formData.currency || 'INR') === 'INR' ? calcGST() : 0), formData.currency)}</span></div>
                </div>
              </div>
            )}

            {/* Terms & Conditions (auto-filled from Inventory → Configuration, editable per PO) */}
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">
                Terms &amp; Conditions <span className="text-[11px] text-[#6B7280] font-normal">(defaults from Inventory → Configuration; edit to override for this PO)</span>
              </label>
              <textarea
                value={formData.terms_conditions !== undefined ? formData.terms_conditions : (companySettings?.po_terms_conditions || '')}
                onChange={(e) => setFormData({ ...formData, terms_conditions: e.target.value })}
                className="input-field w-full mono text-xs"
                rows={5}
                placeholder={`1. Payment: Net 30 days from invoice date.\n2. Delivery: As per schedule mentioned above.\n3. Quality: Supplier to provide material/test certificates.\n4. Warranty: 12 months from the date of receipt.`}
                data-testid="po-terms-textarea"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
              <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input-field" rows={2} placeholder="Order notes..." data-testid="po-notes-input" />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
              <button type="button" onClick={() => setIsDialogOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary" disabled={formData.lines.length === 0} data-testid="po-save-btn">
                {editingPO ? (editingPO.status !== 'draft' ? 'Save as New Revision' : 'Save Changes') : 'Create Purchase Order'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revision History Dialog */}
      <Dialog open={!!viewPO} onOpenChange={(open) => { if (!open) setViewPO(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Revision History - {viewPO?.po_number}</DialogTitle>
          </DialogHeader>
          {viewPO && (
            <div className="space-y-4 mt-3">
              <p className="text-sm text-[#4B5563]">Current revision: <span className="font-bold">Rev. {viewPO.revision}</span></p>
              {(viewPO.revision_history || []).length === 0 ? (
                <p className="text-sm text-[#9CA3AF]">No previous revisions.</p>
              ) : (
                <div className="space-y-3">
                  {viewPO.revision_history.map((rev, i) => (
                    <div key={i} className="border border-[#E5E7EB] rounded-sm p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-sm">Rev. {rev.revision}</span>
                        <span className="text-xs text-[#6B7280]">{rev.revised_at ? new Date(rev.revised_at).toLocaleString() : ''}</span>
                      </div>
                      <div className="text-xs text-[#4B5563]">
                        <span>{rev.lines?.length || 0} line items</span>
                        <span className="mx-2">|</span>
                        <span>Subtotal: {formatCurrency(rev.subtotal || 0)}</span>
                        <span className="mx-2">|</span>
                        <span>Total: {formatCurrency(rev.total_amount || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PO Print Dialog */}
      <POPrintDialog po={printPO} open={!!printPO} onClose={() => setPrintPO(null)} />

      {/* Short-Close Dialog */}
      <Dialog open={shortCloseDialog.open} onOpenChange={(open) => { if (!open) setShortCloseDialog({ open: false, po: null, reason: '' }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#723B13]" />
              Short-Close PO
            </DialogTitle>
          </DialogHeader>
          {shortCloseDialog.po && (
            <div className="space-y-3 mt-2" data-testid="short-close-dialog">
              <div className="bg-[#FDF6B2] border border-[#F0C674] rounded-sm p-3 text-xs text-[#723B13]">
                <p className="font-semibold mb-1">{shortCloseDialog.po.po_number} — {shortCloseDialog.po.supplier?.name || ''}</p>
                <p>This will mark the PO as <span className="font-semibold">Short Closed</span>. Any un-received quantity will be released so MRP suggests fresh POs for the shortage.</p>
                <p className="mt-1">No further GRN can be created against this PO.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Reason (optional)</label>
                <textarea
                  value={shortCloseDialog.reason}
                  onChange={(e) => setShortCloseDialog({ ...shortCloseDialog, reason: e.target.value })}
                  placeholder="e.g. supplier denied to supply remaining qty"
                  className="input-field w-full text-xs"
                  rows={3}
                  data-testid="short-close-reason"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <button type="button" className="btn-secondary" onClick={() => setShortCloseDialog({ open: false, po: null, reason: '' })}>Cancel</button>
                <button type="button" className="btn-primary flex items-center gap-2" onClick={handleShortClosePO} data-testid="confirm-short-close-btn">
                  <Lock className="w-4 h-4" /> Short-Close PO
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Inline supplier create/edit — drives the + and pencil icons next to
          the supplier dropdown. After save we reload the suppliers list and
          auto-select the saved record so it's already chosen for the new PO. */}
      <QuickAddPartyDialog
        open={quickPartyOpen}
        onOpenChange={setQuickPartyOpen}
        kind="supplier"
        editing={quickPartyEditing}
        onSaved={async (saved) => {
          await fetchSuppliers();
          if (saved?.id) setFormData(fd => ({ ...fd, supplier_id: saved.id }));
        }}
      />
    </div>
  );
}
