import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, ShoppingCart, FileText, Filter, X, CheckCircle2, Send, 
  Edit2, History, ChevronDown, ChevronUp, Trash2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partial', label: 'Partial' },
  { value: 'received', label: 'GRN Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

const emptyLine = { item_id: '', description: '', quantity: 1, unit_price: 0, uom: 'pcs', hsn_code: '', gst_rate: 18, discount_type: 'percentage', discount_value: 0, notes: '' };
const emptyCharge = { charge_type_id: '', name: '', hsn_code: '', gst_rate: 18, amount: 0 };

const emptyForm = {
  supplier_id: '', expected_date: '', delivery_warehouse_id: '', 
  quotation_ref: '', quotation_date: '', lines: [], additional_charges: [], notes: '',
};

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
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

  const canEdit = ['admin', 'production_manager', 'inventory_manager'].includes(user?.role);

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

  const filteredOrders = statusFilter ? allOrders.filter(po => po.status === statusFilter) : allOrders;

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

  const updateLine = (index, field, value) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    if (field === 'item_id') {
      const item = items.find(it => it.id === value);
      if (item) {
        newLines[index].unit_price = item.unit_cost || 0;
        newLines[index].hsn_code = item.hsn_code || '';
        newLines[index].gst_rate = item.gst_rate != null ? item.gst_rate : 18;
        newLines[index].uom = item.unit_of_measure || 'pcs';
        newLines[index].description = item.description || '';
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
      case 'cancelled': return 'bg-[#FDE8E8] text-[#9B1C1C]';
      default: return 'bg-[#F3F4F6] text-[#4B5563]';
    }
  };

  return (
    <div className="space-y-6" data-testid="purchase-orders-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Purchase Orders</h1>
          <p className="text-sm text-[#4B5563]">Create and manage purchase orders</p>
        </div>
        {canEdit && (
          <button onClick={openCreateDialog} className="btn-primary flex items-center space-x-2" data-testid="create-po-btn">
            <Plus className="w-4 h-4" /><span>Create PO</span>
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="card-flat p-4">
        <div className="flex items-center gap-4">
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-48" data-testid="po-status-filter">
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
          {statusFilter && (
            <button onClick={() => setStatusFilter('')} className="btn-secondary flex items-center space-x-1">
              <X className="w-4 h-4" /><span>Clear</span>
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
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
            <FileText className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No purchase orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                    <td className="text-right mono">{(po.subtotal || 0).toFixed(2)}</td>
                    <td className="text-right">
                      {po.total_tax > 0 ? (
                        <div className="text-xs">
                          <span className="mono font-medium">{(po.total_tax || 0).toFixed(2)}</span>
                          <span className="block text-[#6B7280]">{po.is_inter_state ? 'IGST' : 'CGST+SGST'}</span>
                        </div>
                      ) : <span className="mono text-[#9CA3AF]">-</span>}
                    </td>
                    <td className="text-right mono font-semibold">{(po.total_amount || 0).toFixed(2)}</td>
                    <td>
                      <span className={`status-badge ${getStatusColor(po.status)}`}>{po.status === 'received' ? 'GRN Done' : po.status}</span>
                    </td>
                    <td className="text-sm text-[#4B5563]">
                      {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      <div className="flex items-center space-x-1">
                        {po.status !== 'received' && po.status !== 'cancelled' && canEdit && (
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
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
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
                <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}>
                  <SelectTrigger data-testid="po-supplier-select"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                <div className="space-y-0">
                  {/* Column Headers */}
                  <div className="grid grid-cols-[2.5fr_1fr_0.8fr_0.8fr_1fr_1.2fr_1fr_1fr_auto] gap-1 px-2 py-1 bg-[#1D3557] text-white text-xs font-semibold rounded-t-sm" data-testid="po-line-headers">
                    <span>Item</span>
                    <span>HSN</span>
                    <span>Qty</span>
                    <span>UOM</span>
                    <span>Rate</span>
                    <span>Discount</span>
                    <span>GST%</span>
                    <span className="text-right">Amount</span>
                    <span></span>
                  </div>
                  {formData.lines.map((line, index) => (
                    <div key={index} className="grid grid-cols-[2.5fr_1fr_0.8fr_0.8fr_1fr_1.2fr_1fr_1fr_auto] gap-1 p-1 bg-[#F9FAFB] border-b border-[#E5E7EB] items-center" data-testid={`po-line-row-${index}`}>
                      <Select value={line.item_id} onValueChange={(v) => updateLine(index, 'item_id', v)}>
                        <SelectTrigger className="bg-white text-xs h-8" data-testid={`po-line-item-${index}`}><SelectValue placeholder="Select item" /></SelectTrigger>
                        <SelectContent>
                          {items.map((item) => <SelectItem key={item.id} value={item.id}>{item.part_number} - {item.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <input type="text" value={line.hsn_code} onChange={(e) => updateLine(index, 'hsn_code', e.target.value)} className="input-field bg-white text-xs h-8 mono" />
                      <input type="number" min="0" step="any" value={line.quantity} onChange={(e) => updateLine(index, 'quantity', parseFloat(e.target.value) || 0)} className="input-field bg-white text-xs h-8 mono" />
                      <input type="text" value={line.uom} onChange={(e) => updateLine(index, 'uom', e.target.value)} className="input-field bg-white text-xs h-8 mono" />
                      <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(index, 'unit_price', parseFloat(e.target.value) || 0)} className="input-field bg-white text-xs h-8 mono" />
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" step="0.01" value={line.discount_value === 0 ? '' : line.discount_value} onChange={(e) => updateLine(index, 'discount_value', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="input-field bg-white text-xs h-8 mono flex-1" placeholder="0" data-testid={`po-line-discount-${index}`} />
                        <select value={line.discount_type} onChange={(e) => updateLine(index, 'discount_type', e.target.value)} className="text-xs h-8 border border-[#D1D5DB] rounded-sm bg-white px-1 w-12" data-testid={`po-line-discount-type-${index}`}>
                          <option value="percentage">%</option>
                          <option value="amount">Amt</option>
                        </select>
                      </div>
                      <Select value={String(line.gst_rate)} onValueChange={(v) => updateLine(index, 'gst_rate', parseFloat(v))}>
                        <SelectTrigger className="bg-white text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0,5,12,18,28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="text-right mono text-xs font-medium pr-1">{calcLineAmount(line).toFixed(2)}</div>
                      <button type="button" onClick={() => removeLine(index)} className="p-1 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
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
                      <div className="text-right mono text-xs font-medium">{((charge.amount || 0) * (charge.gst_rate || 0) / 100).toFixed(2)}</div>
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
                  <div className="flex justify-between"><span className="text-sm text-[#4B5563]">Items Subtotal:</span><span className="mono font-medium">{calcSubtotal().toFixed(2)}</span></div>
                  {calcChargesTotal() > 0 && <div className="flex justify-between"><span className="text-sm text-[#4B5563]">Charges:</span><span className="mono font-medium">{calcChargesTotal().toFixed(2)}</span></div>}
                  <div className="flex justify-between"><span className="text-sm text-[#4B5563]">Est. GST:</span><span className="mono font-medium">{calcGST().toFixed(2)}</span></div>
                  <div className="flex justify-between border-t border-[#D1D5DB] pt-1"><span className="text-sm font-semibold">Total:</span><span className="mono font-bold text-lg">{(calcSubtotal() + calcChargesTotal() + calcGST()).toFixed(2)}</span></div>
                </div>
              </div>
            )}

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
                        <span>Subtotal: {(rev.subtotal || 0).toFixed(2)}</span>
                        <span className="mx-2">|</span>
                        <span>Total: {(rev.total_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
