import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  Factory, 
  Edit2,
  Calendar,
  Filter,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'released', label: 'Released' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function ProductionPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [boms, setBoms] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [cancelConfirm, setCancelConfirm] = useState({ open: false, order: null });
  const [quotationLoadInfo, setQuotationLoadInfo] = useState(null); // { qNo, customer_name, currency }
  const [quotationSearch, setQuotationSearch] = useState('');
  const [showQuotationDropdown, setShowQuotationDropdown] = useState(false);
  const [formData, setFormData] = useState({
    // Multi-line SO: lines[] with { bom_id, bom_search, quantity, due_date, notes, source_quotation_line_no }
    // order_type is set at the FORM level (MTS or MTO) and applied to every line.
    order_type: 'mts',  // mts | mto — controls Quotation picker visibility
    lines: [{ bom_id: '', bom_search: '', quantity: 1, due_date: '', notes: '', source_quotation_line_no: null }],
    priority: 'medium',
    notes: '',
    source_quotation_id: '',
    source_quotation_no: '',
    customer_id: '',
    customer_name: '',
  });

  const canEdit = ['admin', 'production_manager'].includes(user?.role);

  // Deep-link: dashboard quick action sends ?action=new to open Create dialog.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new' && canEdit) {
      setEditingOrder(null);
      setIsDialogOpen(true);
      navigate('/production', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const [ordersRes, bomsRes, quotsRes] = await Promise.all([
        api.get(`/api/production${params}`),
        api.get('/api/bom?status=active'),
        // Only quotations that can still seed an SO (not rejected/superseded).
        // We include 'converted' too — they may have balance > 0 if user creates
        // multiple SOs from one quotation.
        api.get('/api/crm/quotations'),
      ]);
      setOrders(ordersRes.data);
      setBoms(bomsRes.data);
      const eligible = (quotsRes.data || []).filter(q =>
        !['rejected', 'superseded'].includes(q.status)
      );
      setQuotations(eligible);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  // When the user picks a quotation, fetch its balance and pre-fill the SO lines.
  const loadFromQuotation = async (qid) => {
    if (!qid) {
      // Clear the link without wiping user-entered lines (just drops the prefill metadata).
      setFormData(prev => ({ ...prev, source_quotation_id: '', source_quotation_no: '', customer_id: '', customer_name: '' }));
      setQuotationLoadInfo(null);
      return;
    }
    try {
      const { data } = await api.get(`/api/crm/quotations/${qid}/balance`);
      const balanceLines = (data.lines || []).filter(ln => ln.balance_qty > 0);
      if (balanceLines.length === 0) {
        toast.error('This quotation has no balance left — every line has already been issued to a Sales Order.');
        return;
      }
      // Build pre-filled SO lines. Skip rows with no active BOM and warn.
      const missingBom = [];
      const today = new Date();
      const dueIso = today.toISOString().split('T')[0];
      const newLines = [];
      for (const ln of balanceLines) {
        if (!ln.bom || !ln.bom.id) {
          missingBom.push(ln.item?.part_number || ln.description || `Line ${ln.line_no}`);
          continue;
        }
        newLines.push({
          bom_id: ln.bom.id,
          bom_search: '',
          quantity: Math.max(1, Math.ceil(ln.balance_qty || 0)),
          due_date: dueIso,
          notes: ln.description || '',
          source_quotation_line_no: ln.line_no,
        });
      }
      if (newLines.length === 0) {
        toast.error(`No BOM found for any quotation line${missingBom.length ? ': ' + missingBom.join(', ') : ''}. Create a BOM first.`);
        return;
      }
      setFormData(prev => ({
        ...prev,
        lines: newLines,
        source_quotation_id: data.id,
        source_quotation_no: data.quotation_no,
        customer_id: data.customer_id || '',
        customer_name: data.customer_name || '',
      }));
      setQuotationLoadInfo({ qNo: data.quotation_no, customer_name: data.customer_name, currency: data.currency });
      let msg = `Pre-filled ${newLines.length} line${newLines.length > 1 ? 's' : ''} from ${data.quotation_no}`;
      if (missingBom.length > 0) {
        msg += ` (skipped ${missingBom.length} without BOM: ${missingBom.slice(0,3).join(', ')}${missingBom.length > 3 ? '…' : ''})`;
      }
      toast.success(msg, { duration: 5000 });
    } catch (error) {
      console.error('Failed to load quotation balance:', error);
      toast.error(error.response?.data?.detail || 'Failed to load quotation');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Validate lines
      const validLines = (formData.lines || []).filter(l => l.bom_id && l.quantity > 0);
      if (validLines.length === 0) {
        alert('Please add at least one valid line (BOM + quantity required).');
        return;
      }
      for (const ln of validLines) {
        if (!ln.due_date) {
          alert('Each line must have a due date.');
          return;
        }
      }

      if (editingOrder) {
        // Edit mode — keep legacy single-line compatibility: update only first line's fields + top-level.
        const ln = validLines[0];
        await api.put(`/api/production/${editingOrder.id}`, {
          quantity: ln.quantity,
          due_date: new Date(ln.due_date).toISOString(),
          priority: formData.priority,
          status: formData.status,
          notes: formData.notes,
        });
      } else {
        // Create multi-line SO. order_type comes from the form-level selector.
        const formOrderType = formData.order_type || 'mts';
        const payload = {
          lines: validLines.map(l => ({
            bom_id: l.bom_id,
            quantity: parseInt(l.quantity, 10),
            due_date: new Date(l.due_date).toISOString(),
            order_type: formOrderType,
            notes: l.notes || '',
            source_quotation_line_no: l.source_quotation_line_no ?? null,
          })),
          priority: formData.priority,
          notes: formData.notes,
        };
        // Quotation link is only meaningful for MTO.
        if (formOrderType === 'mto' && formData.source_quotation_id) {
          payload.source_quotation_id = formData.source_quotation_id;
          payload.source_quotation_no = formData.source_quotation_no || '';
        }
        if (formData.customer_id) {
          payload.customer_id = formData.customer_id;
        }
        await api.post('/api/production', payload);
      }
      setIsDialogOpen(false);
      setEditingOrder(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Failed to save sales order:', error);
      alert(error.response?.data?.detail || 'Failed to save sales order');
    }
  };

  const addLine = () => {
    setFormData(prev => ({
      ...prev,
      lines: [...prev.lines, { bom_id: '', bom_search: '', quantity: 1, due_date: '', notes: '', source_quotation_line_no: null }]
    }));
  };

  const removeLine = (idx) => {
    setFormData(prev => {
      if (prev.lines.length <= 1) return prev;
      return { ...prev, lines: prev.lines.filter((_, i) => i !== idx) };
    });
  };

  const updateLine = (idx, patch) => {
    setFormData(prev => ({
      ...prev,
      lines: prev.lines.map((l, i) => i === idx ? { ...l, ...patch } : l)
    }));
  };

  const handleEdit = (order) => {
    setEditingOrder(order);
    // Edit keeps a single line (first line) for simplicity; multi-line edit not yet supported.
    const firstLine = (order.lines && order.lines[0]) || { bom_id: order.bom_id, quantity: order.quantity, due_date: order.due_date, order_type: 'mts', notes: '' };
    setFormData({
      order_type: firstLine.order_type || 'mts',
      lines: [{
        bom_id: firstLine.bom_id,
        bom_search: '',
        quantity: firstLine.quantity,
        due_date: firstLine.due_date ? String(firstLine.due_date).split('T')[0] : '',
        notes: firstLine.notes || '',
        source_quotation_line_no: firstLine.source_quotation_line_no ?? null,
      }],
      priority: order.priority,
      status: order.status,
      notes: order.notes || '',
      source_quotation_id: order.source_quotation_id || '',
      source_quotation_no: order.source_quotation_no || '',
      customer_id: order.customer_id || '',
      customer_name: order.customer?.name || '',
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      order_type: 'mts',
      lines: [{ bom_id: '', bom_search: '', quantity: 1, due_date: '', notes: '', source_quotation_line_no: null }],
      priority: 'medium',
      notes: '',
      source_quotation_id: '',
      source_quotation_no: '',
      customer_id: '',
      customer_name: '',
    });
    setQuotationLoadInfo(null);
    setQuotationSearch('');
    setShowQuotationDropdown(false);
  };

  // Switching the form-level order type. When user picks MTS, drop the
  // quotation link (MTS = build-for-stock, no customer source). Lines stay.
  const handleOrderTypeChange = (newType) => {
    setFormData(prev => {
      if (newType === 'mts') {
        return {
          ...prev,
          order_type: 'mts',
          source_quotation_id: '',
          source_quotation_no: '',
          customer_id: '',
          customer_name: '',
          lines: (prev.lines || []).map(l => ({ ...l, source_quotation_line_no: null })),
        };
      }
      return { ...prev, order_type: 'mto' };
    });
    if (newType === 'mts') {
      setQuotationLoadInfo(null);
      setQuotationSearch('');
      setShowQuotationDropdown(false);
    }
  };

  const handleConfirm = async (order) => {
    try {
      const { data } = await api.post(`/api/production/${order.id}/confirm`);
      let msg = `Sales Order ${order.order_number} confirmed`;
      const summary = data?.confirm_summary || [];
      if (summary.length > 0) {
        const bits = summary.map(s => {
          const parts = [];
          if (s.reserved_qty) parts.push(`${s.reserved_qty} reserved`);
          if (s.mo_qty) parts.push(`${s.mo_qty} to MO`);
          return `L${s.line_no} ${(s.order_type || '').toUpperCase()}: ${parts.join(' + ') || 'no action'}`;
        });
        msg += ` — ${bits.join(' | ')}`;
      }
      toast.success(msg, { duration: 6000 });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm order');
    }
  };

  const handleCancel = (order) => {
    // Open confirmation dialog (Shadcn). window.confirm is unreliable in iframes.
    setCancelConfirm({ open: true, order });
  };

  const confirmCancel = async () => {
    const order = cancelConfirm.order;
    if (!order) return;
    try {
      const { data } = await api.post(`/api/production/${order.id}/cancel`);
      let msg = data.message || `Sales Order ${order.order_number} cancelled`;
      if (data.cancelled_mos?.length > 0) msg += ` | Cancelled MOs: ${data.cancelled_mos.join(', ')}`;
      if (data.preserved_completed_mos?.length > 0) msg += ` | Preserved (completed): ${data.preserved_completed_mos.join(', ')}`;
      toast.success(msg);
      setCancelConfirm({ open: false, order: null });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel order');
      setCancelConfirm({ open: false, order: null });
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-[#F3F4F6] text-[#4B5563]';
      case 'confirmed': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'released': return 'bg-[#FDF6B2] text-[#723B13]';
      case 'in_progress': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'completed': return 'bg-[#DEF7EC] text-[#03543F]';
      case 'cancelled': return 'bg-[#FDE8E8] text-[#9B1C1C]';
      case 'partially_cancelled': return 'bg-[#FEF3C7] text-[#723B13]';
      default: return 'bg-[#F3F4F6] text-[#4B5563]';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'priority-urgent';
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return 'priority-medium';
    }
  };

  return (
    <div className="space-y-6" data-testid="production-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Sales Orders</h1>
          <p className="text-sm text-[#4B5563]">Manage sales orders for manufacturing</p>
        </div>
        {canEdit && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingOrder(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-production-btn">
                <Plus className="w-4 h-4" />
                <span>New Sales Order</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">{editingOrder ? 'Edit Sales Order' : 'Create Sales Order'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                {/* ========== STEP 1: ORDER TYPE (top-level) ========== */}
                {!editingOrder && (
                  <div className="border border-[#E5E7EB] rounded-sm bg-[#F0F9FF] px-3 py-2.5" data-testid="so-order-type-block">
                    <label className="block text-xs font-semibold text-[#1D3557] mb-1.5">
                      Step 1 — Order Type *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleOrderTypeChange('mts')}
                        className={`text-left px-3 py-2 rounded-sm border-2 transition-colors ${formData.order_type === 'mts' ? 'border-[#1D3557] bg-white' : 'border-[#E5E7EB] bg-white hover:border-[#9CA3AF]'}`}
                        data-testid="so-order-type-mts"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-3 h-3 rounded-full border-2 ${formData.order_type === 'mts' ? 'border-[#1D3557] bg-[#1D3557]' : 'border-[#9CA3AF]'}`} />
                          <span className="text-xs font-semibold text-[#111827]">MTS — Make to Stock</span>
                        </div>
                        <p className="text-[10px] text-[#6B7280] mt-1 leading-tight">Build for stock. Always produces full qty; ignores FG stock. No quotation link.</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOrderTypeChange('mto')}
                        className={`text-left px-3 py-2 rounded-sm border-2 transition-colors ${formData.order_type === 'mto' ? 'border-[#1D3557] bg-white' : 'border-[#E5E7EB] bg-white hover:border-[#9CA3AF]'}`}
                        data-testid="so-order-type-mto"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-3 h-3 rounded-full border-2 ${formData.order_type === 'mto' ? 'border-[#1D3557] bg-[#1D3557]' : 'border-[#9CA3AF]'}`} />
                          <span className="text-xs font-semibold text-[#111827]">MTO — Make to Order</span>
                        </div>
                        <p className="text-[10px] text-[#6B7280] mt-1 leading-tight">For a specific customer. Uses FG stock first; you can link a Quotation below.</p>
                      </button>
                    </div>
                  </div>
                )}
                {/* ========== STEP 2: FROM QUOTATION (MTO only) ========== */}
                {!editingOrder && formData.order_type === 'mto' && (
                  <div className="border border-[#E5E7EB] rounded-sm bg-[#FFFBEB] px-3 py-2 space-y-2" data-testid="so-from-quotation-block">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-[#1D3557] mb-1">
                          Step 2 — From Quotation <span className="font-normal text-[#6B7280]">(optional — pre-fills lines & customer)</span>
                        </label>
                        {formData.source_quotation_id ? (
                          <div className="flex items-center justify-between bg-white border border-[#1D3557] rounded-sm px-2 py-1.5">
                            <div className="text-xs">
                              <span className="mono font-semibold">{formData.source_quotation_no}</span>
                              {formData.customer_name && (<><span className="mx-2 text-[#6B7280]">→</span><span>{formData.customer_name}</span></>)}
                              {quotationLoadInfo?.currency && quotationLoadInfo.currency !== 'INR' && (
                                <span className="ml-2 inline-block text-[10px] px-1 bg-[#FEF3C7] text-[#723B13] rounded">{quotationLoadInfo.currency}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="text-[10px] text-[#9B1C1C] hover:underline"
                              onClick={() => loadFromQuotation('')}
                              data-testid="so-quotation-clear"
                            >
                              Clear link
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Search by quotation no, customer or item…"
                              value={quotationSearch}
                              onChange={(e) => { setQuotationSearch(e.target.value); setShowQuotationDropdown(true); }}
                              onFocus={() => setShowQuotationDropdown(true)}
                              onBlur={() => setTimeout(() => setShowQuotationDropdown(false), 180)}
                              className="input-field text-xs"
                              data-testid="so-quotation-search"
                              autoComplete="off"
                            />
                            {showQuotationDropdown && (
                              <div className="absolute z-30 mt-1 left-0 right-0 border border-[#E5E7EB] rounded-sm max-h-56 overflow-auto bg-white shadow-lg" data-testid="so-quotation-list">
                                {(() => {
                                  const qs = (quotationSearch || '').trim().toLowerCase();
                                  const filtered = quotations.filter(qx => {
                                    if (!qs) return true;
                                    const no = (qx.quotation_no || '').toLowerCase();
                                    const cust = (qx.customer_name || qx.customer?.name || '').toLowerCase();
                                    return no.includes(qs) || cust.includes(qs);
                                  }).slice(0, 60);
                                  if (filtered.length === 0) {
                                    return <div className="px-3 py-3 text-center text-[11px] text-[#6B7280]">No matching quotations.</div>;
                                  }
                                  return filtered.map(qx => (
                                    <button
                                      key={qx.id}
                                      type="button"
                                      onMouseDown={() => { loadFromQuotation(qx.id); setShowQuotationDropdown(false); setQuotationSearch(''); }}
                                      data-testid={`so-quotation-option-${qx.id}`}
                                      className="w-full text-left px-2 py-1.5 text-[11px] border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]"
                                    >
                                      <span className="mono font-semibold">{qx.quotation_no}</span>
                                      <span className="mx-2">—</span>
                                      <span>{qx.customer_name || qx.customer?.name || '(no customer)'}</span>
                                      <span className="ml-2 text-[#6B7280]">{(qx.status || '').toUpperCase()}</span>
                                    </button>
                                  ));
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {formData.source_quotation_id && (
                      <p className="text-[10px] text-[#6B7280] leading-tight">
                        Lines and customer were pre-filled from this quotation. You can still edit BOM / qty / due date / order type before saving. Only balance qty (un-issued) is shown — already-converted qty has been deducted.
                      </p>
                    )}
                  </div>
                )}
                {/* ========== SO LINES ========== */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#1D3557]">
                      {!editingOrder && (formData.order_type === 'mto' ? 'Step 3 — ' : 'Step 2 — ')}Order Lines {!editingOrder && <span className="text-xs font-normal text-[#6B7280]">({(formData.lines || []).length})</span>}
                    </h3>
                    {!editingOrder && (
                      <button type="button" className="text-xs text-[#1D3557] hover:underline flex items-center gap-1" onClick={addLine} data-testid="so-add-line-btn">
                        <Plus className="w-3 h-3" /> Add Line
                      </button>
                    )}
                  </div>
                  {(formData.lines || []).map((line, idx) => {
                    const q = (line.bom_search || '').trim().toLowerCase();
                    // Match PO-picker behavior: DON'T show any list until user starts typing.
                    // Previously all BOMs rendered on focus which flooded the dropdown and
                    // slowed the form. Now the list is empty until a query is entered.
                    const filtered = q ? boms.filter(b => {
                      const code = (b.parent_item?.part_number || '').toLowerCase();
                      const name = (b.name || '').toLowerCase();
                      const itemName = (b.parent_item?.name || '').toLowerCase();
                      return code.includes(q) || name.includes(q) || itemName.includes(q);
                    }) : [];
                    const selected = boms.find(b => b.id === line.bom_id);
                    return (
                      <div key={idx} className="border border-[#E5E7EB] rounded-sm p-3 bg-[#F9FAFB] space-y-2" data-testid={`so-line-${idx}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#374151]">Line {idx + 1}</span>
                          {!editingOrder && (formData.lines.length > 1) && (
                            <button type="button" className="text-xs text-[#9B1C1C] hover:underline flex items-center gap-1" onClick={() => removeLine(idx)} data-testid={`so-remove-line-${idx}`}>
                              <XCircle className="w-3 h-3" /> Remove
                            </button>
                          )}
                        </div>
                        {/* BOM picker */}
                        <div>
                          <label className="block text-xs font-semibold text-[#374151] mb-1">BOM *</label>
                          {selected ? (
                            <div className="flex items-center justify-between bg-[#F0FDF4] border border-[#03543F] rounded-sm px-2 py-1.5" data-testid={`so-bom-selected-${idx}`}>
                              <div className="text-xs">
                                <span className="mono font-semibold">{selected.parent_item?.part_number}</span>
                                <span className="mx-2">—</span>
                                <span>{selected.parent_item?.name || selected.name}</span>
                                <span className="ml-2 text-[#6B7280]">(Rev {selected.revision})</span>
                              </div>
                              {!editingOrder && (
                                <button type="button" className="text-[10px] text-[#9B1C1C] hover:underline" onClick={() => updateLine(idx, { bom_id: '', bom_search: '' })} data-testid={`so-bom-clear-${idx}`}>Clear</button>
                              )}
                            </div>
                          ) : (
                            <>
                              <input
                                type="text"
                                placeholder="Type part number, BOM name or item to search…"
                                value={line.bom_search || ''}
                                onChange={(e) => updateLine(idx, { bom_search: e.target.value })}
                                className="input-field text-xs"
                                data-testid={`so-bom-search-${idx}`}
                                disabled={!!editingOrder}
                                autoComplete="off"
                              />
                              {q && (
                                <div className="mt-1 border border-[#E5E7EB] rounded-sm max-h-40 overflow-auto bg-white" data-testid={`so-bom-list-${idx}`}>
                                  <div className="px-3 py-1 text-[10px] text-[#6B7280] uppercase tracking-wide border-b border-[#F3F4F6]">
                                    {filtered.length} match{filtered.length !== 1 ? 'es' : ''} for "{q}"
                                  </div>
                                  {filtered.length === 0 && (
                                    <div className="px-3 py-3 text-center text-[11px] text-[#6B7280]">No matching BOMs.</div>
                                  )}
                                  {filtered.slice(0, 200).map(bom => (
                                    <button
                                      key={bom.id}
                                      type="button"
                                      onClick={() => updateLine(idx, { bom_id: bom.id, bom_search: '' })}
                                      data-testid={`so-bom-option-${idx}-${bom.id}`}
                                      className="w-full text-left px-2 py-1.5 text-[11px] border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]"
                                    >
                                      <span className="mono font-semibold">{bom.parent_item?.part_number || '-'}</span>
                                      <span className="mx-2">—</span>
                                      <span>{bom.parent_item?.name || bom.name}</span>
                                      <span className="ml-2 text-[#6B7280]">Rev {bom.revision}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-semibold text-[#374151] mb-1">Qty *</label>
                            <input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: parseInt(e.target.value) || 1 })} className="input-field mono text-xs" required data-testid={`so-line-qty-${idx}`} />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[#374151] mb-1">Due Date *</label>
                            <input type="date" value={line.due_date} onChange={(e) => updateLine(idx, { due_date: e.target.value })} className="input-field text-xs" required data-testid={`so-line-due-${idx}`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Priority</label>
                    <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                      <SelectTrigger data-testid="production-priority-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {priorityOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {editingOrder && (
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Status</label>
                      <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                        <SelectTrigger data-testid="production-status-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.filter(opt => !['cancelled'].includes(opt.value)).map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Order Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="Overall order notes..."
                    data-testid="production-notes-input"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                  <button type="button" onClick={() => setIsDialogOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" data-testid="production-save-btn">
                    {editingOrder ? 'Update Order' : 'Create Order'}
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
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search order #, product..."
              className="search-input text-sm"
              data-testid="so-search-input"
            />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-48" data-testid="production-status-filter">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(statusFilter || searchQuery) && (
            <button onClick={() => { setStatusFilter(''); setSearchQuery(''); }} className="btn-secondary flex items-center space-x-1">
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Orders List */}
      <div className="card-flat overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
            <Factory className="w-12 h-12 mb-2 text-[#9CA3AF]" />
            <p>No sales orders found</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-260px)] border-t border-[#E5E7EB]">
            <table className="w-full data-table" data-testid="production-table">
              <thead className="sticky top-0 z-10 bg-white shadow-sm">
                <tr>
                  <th>Order #</th>
                  <th>Product</th>
                  <th>BOM</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">MO Qty</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.filter(order => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    (order.order_number || '').toLowerCase().includes(q) ||
                    (order.item?.part_number || '').toLowerCase().includes(q) ||
                    (order.item?.name || '').toLowerCase().includes(q) ||
                    (order.bom?.name || '').toLowerCase().includes(q)
                  );
                }).map((order) => (
                  <tr key={order.id} className={order.status === 'cancelled' ? 'opacity-50' : ''} data-testid={`production-row-${order.id}`}>
                    <td className="mono font-medium">
                      {order.order_number}
                      {order.source_quotation_no && (
                        <div className="text-[10px] text-[#6B7280] font-normal mt-0.5" data-testid={`so-source-quot-${order.id}`}>
                          from <span className="mono">{order.source_quotation_no}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      {(order.lines && order.lines.length > 1) ? (
                        <div>
                          <span className="status-badge bg-[#E1EFFE] text-[#1E429F]">{order.lines.length} lines</span>
                          <p className="text-xs text-[#4B5563] mt-1">First: <span className="mono">{order.lines[0]?.item?.part_number || order.item?.part_number || '-'}</span></p>
                          {order.lines[0]?.item?.name && <p className="text-[10px] text-[#6B7280]">{order.lines[0].item.name}</p>}
                        </div>
                      ) : (
                        <>
                          <span className="mono text-sm">{order.item?.part_number || '-'}</span>
                          <p className="text-xs text-[#4B5563]">{order.item?.name || '-'}</p>
                        </>
                      )}
                    </td>
                    <td>
                      {(order.lines && order.lines.length > 1) ? (
                        <div className="text-[10px] text-[#6B7280]">
                          {order.lines.slice(0, 3).map((ln, i) => (
                            <div key={i}>L{ln.line_no}: <span className={`inline-block text-[9px] px-1 ml-1 rounded ${ln.order_type === 'mts' ? 'bg-[#DEF7EC] text-[#03543F]' : ln.order_type === 'mto' ? 'bg-[#FDE8E8] text-[#9B1C1C]' : 'bg-[#F3F4F6] text-[#4B5563]'}`}>{(ln.order_type || 'mts').toUpperCase()}</span></div>
                          ))}
                          {order.lines.length > 3 && <div className="text-[#9CA3AF]">+{order.lines.length - 3} more</div>}
                        </div>
                      ) : (
                        <>
                          <span className="text-sm">{order.bom?.name || '-'}</span>
                          <p className="text-xs text-[#4B5563] mono">Rev {order.bom?.revision || '-'}</p>
                        </>
                      )}
                    </td>
                    <td className="text-right mono font-medium">{order.quantity}</td>
                    <td className="text-right">
                      <span className="mono text-sm">{order.mo_qty_created || 0}/{order.quantity}</span>
                      {(order.mo_qty_created || 0) >= order.quantity && (
                        <p className="text-[10px] text-[#03543F]">Fully covered</p>
                      )}
                      {(order.mo_qty_created || 0) > 0 && (order.mo_qty_created || 0) < order.quantity && (
                        <p className="text-[10px] text-[#723B13]">Balance: {order.quantity - (order.mo_qty_created || 0)}</p>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${getPriorityColor(order.priority)}`}>
                        {order.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusColor(order.status)}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center space-x-1 text-sm text-[#4B5563]">
                        <Calendar className="w-4 h-4" />
                        <span>{order.due_date ? new Date(order.due_date).toLocaleDateString() : '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center space-x-1">
                        {/* Confirm button - only for draft */}
                        {canEdit && order.status === 'draft' && (
                          <button
                            onClick={() => handleConfirm(order)}
                            className="btn-secondary text-xs flex items-center space-x-1 text-[#03543F] border-[#03543F] hover:bg-[#DEF7EC]"
                            data-testid={`confirm-so-${order.id}`}
                            title="Confirm Order"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Confirm</span>
                          </button>
                        )}
                        {/* Edit button - draft and confirmed only, and not fully covered by MOs */}
                        {canEdit && ['draft', 'confirmed'].includes(order.status) && (order.mo_qty_created || 0) < order.quantity && (
                          <button
                            onClick={() => handleEdit(order)}
                            className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded"
                            data-testid={`edit-production-${order.id}`}
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {/* Cancel button - only for active states; not for terminal states */}
                        {canEdit && !['cancelled', 'partially_cancelled', 'completed'].includes(order.status) && (
                          <button
                            onClick={() => handleCancel(order)}
                            className="p-1.5 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded"
                            data-testid={`cancel-so-${order.id}`}
                            title="Cancel Order"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {/* Cancelled indicator */}
                        {['cancelled', 'partially_cancelled'].includes(order.status) && (
                          <span className="text-xs text-[#9B1C1C] flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {order.status === 'partially_cancelled' ? 'Partial' : 'Cancelled'}
                          </span>
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

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelConfirm.open} onOpenChange={(o) => { if (!o) setCancelConfirm({ open: false, order: null }); }}>
        <DialogContent className="max-w-md" data-testid="cancel-so-dialog">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center gap-2 text-[#9B1C1C]">
              <AlertTriangle className="w-5 h-5" />
              Cancel Sales Order?
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-[#374151]">
              Are you sure you want to cancel <span className="font-semibold mono">{cancelConfirm.order?.order_number}</span>?
            </p>
            <div className="bg-[#FDE8E8] border border-[#FDE8E8] rounded-sm p-3 text-xs text-[#9B1C1C]">
              <p className="font-semibold mb-1">This will:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Cancel pending / in-progress Manufacturing Orders</li>
                <li>Reverse reserved / consumed stock for cancelled MOs</li>
                <li><strong>Completed MOs are preserved</strong> (finished stock is kept)</li>
              </ul>
              <p className="mt-2 font-semibold">This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setCancelConfirm({ open: false, order: null })} className="btn-secondary" data-testid="cancel-so-no-btn">
              No, Keep Order
            </button>
            <button onClick={confirmCancel} className="bg-[#9B1C1C] hover:bg-[#7F1D1D] text-white px-4 py-2 rounded-sm text-sm font-medium flex items-center gap-1" data-testid="cancel-so-yes-btn">
              <XCircle className="w-4 h-4" />
              Yes, Cancel Order
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
