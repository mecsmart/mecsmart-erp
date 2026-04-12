import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Plus, FileText, CheckCircle2, DollarSign, Edit2, Trash2, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

export default function PurchaseInvoicePage() {
  const { user } = useAuth();
  const { formatCurrency } = useCompanySettings();
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [pos, setPOs] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    supplier_id: '', po_id: '', invoice_no: '', invoice_date: '', due_date: '', notes: '',
    lines: [{ item_id: '', quantity: 0, unit_price: 0, hsn_code: '', gst_rate: 18 }]
  });

  const isAdmin = user?.role === 'admin';
  const canEdit = ['admin', 'production_manager'].includes(user?.role);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const [invRes, supRes, poRes, itemRes] = await Promise.all([
        api.get(`/api/purchase-invoices${params}`),
        api.get('/api/suppliers'),
        api.get('/api/purchase-orders'),
        api.get('/api/items'),
      ]);
      setInvoices(invRes.data);
      setSuppliers(supRes.data);
      setPOs(poRes.data);
      setItems(itemRes.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePOSelect = (poId) => {
    const po = pos.find(p => p.id === poId);
    if (!po) return;
    setFormData({
      ...formData,
      po_id: poId,
      supplier_id: po.supplier_id,
      lines: po.items?.map(li => ({
        item_id: li.item_id,
        quantity: li.quantity,
        unit_price: li.unit_price,
        hsn_code: li.hsn_code || '',
        gst_rate: li.gst_rate || 18
      })) || []
    });
  };

  const addLine = () => setFormData({ ...formData, lines: [...formData.lines, { item_id: '', quantity: 0, unit_price: 0, hsn_code: '', gst_rate: 18 }] });
  const removeLine = (idx) => setFormData({ ...formData, lines: formData.lines.filter((_, i) => i !== idx) });
  const updateLine = (idx, field, val) => {
    const lines = [...formData.lines];
    lines[idx] = { ...lines[idx], [field]: val };
    setFormData({ ...formData, lines });
  };

  const calcSubtotal = () => formData.lines.reduce((s, l) => s + (l.quantity * l.unit_price), 0);
  const calcGST = () => formData.lines.reduce((s, l) => s + (l.quantity * l.unit_price * (l.gst_rate || 18) / 100), 0);

  const handleSubmit = async () => {
    if (!formData.supplier_id || !formData.invoice_no || formData.lines.length === 0) {
      alert('Please fill supplier, invoice no, and at least one line item');
      return;
    }
    try {
      await api.post('/api/purchase-invoices', {
        ...formData,
        invoice_date: new Date(formData.invoice_date).toISOString(),
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
      });
      setDialogOpen(false);
      setFormData({ supplier_id: '', po_id: '', invoice_no: '', invoice_date: '', due_date: '', notes: '', lines: [{ item_id: '', quantity: 0, unit_price: 0, hsn_code: '', gst_rate: 18 }] });
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create invoice'); }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this invoice?')) return;
    try { await api.post(`/api/purchase-invoices/${id}/approve`); fetchData(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed to approve'); }
  };

  const handleMarkPaid = async (id) => {
    if (!window.confirm('Mark this invoice as paid?')) return;
    try { await api.post(`/api/purchase-invoices/${id}/mark-paid`); fetchData(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const getStatusColor = (s) => {
    switch (s) {
      case 'draft': return 'bg-[#F3F4F6] text-[#4B5563]';
      case 'approved': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'paid': return 'bg-[#DEF7EC] text-[#03543F]';
      default: return 'bg-[#F3F4F6] text-[#4B5563]';
    }
  };

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>;

  return (
    <div className="space-y-6" data-testid="purchase-invoice-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Purchase Invoices</h1>
          <p className="text-sm text-[#4B5563]">Record and manage supplier invoices</p>
        </div>
        {canEdit && (
          <button onClick={() => setDialogOpen(true)} className="btn-primary flex items-center space-x-2" data-testid="create-invoice-btn">
            <Plus className="w-4 h-4" /><span>New Invoice</span>
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter || 'all'} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-48" data-testid="invoice-status-filter"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter && <button onClick={() => setStatusFilter('')} className="text-xs text-[#4B5563] hover:text-[#1D3557]">Clear</button>}
        <span className="text-xs text-[#6B7280]">{invoices.length} invoices</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-flat p-4"><p className="kpi-label">Total Invoices</p><p className="kpi-value">{invoices.length}</p></div>
        <div className="card-flat p-4"><p className="kpi-label">Pending Approval</p><p className="kpi-value">{invoices.filter(i => i.status === 'draft').length}</p></div>
        <div className="card-flat p-4"><p className="kpi-label">Total Amount</p><p className="kpi-value">{formatCurrency(invoices.reduce((s, i) => s + (i.total_amount || 0), 0))}</p></div>
      </div>

      {/* Table */}
      <div className="card-flat overflow-hidden">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
            <FileText className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No purchase invoices found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table" data-testid="invoice-table">
              <thead><tr><th>Invoice #</th><th>Supplier Invoice</th><th>Supplier</th><th>PO Ref</th><th>Date</th><th>Due Date</th><th className="text-right">Amount</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                    <td className="mono font-medium">{inv.invoice_number}</td>
                    <td className="mono">{inv.invoice_no}</td>
                    <td>{inv.supplier?.name || '-'}</td>
                    <td className="mono text-sm">{inv.po?.po_number || '-'}</td>
                    <td className="text-sm">{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '-'}</td>
                    <td className="text-sm">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}</td>
                    <td className="text-right mono font-semibold">{formatCurrency(inv.total_amount || 0)}</td>
                    <td><span className={`status-badge ${getStatusColor(inv.status)}`}>{inv.status}</span></td>
                    <td>
                      <div className="flex items-center space-x-1">
                        {isAdmin && inv.status === 'draft' && (
                          <button onClick={() => handleApprove(inv.id)} className="btn-secondary text-xs px-2 py-1 text-[#03543F] border-[#03543F]" data-testid={`approve-inv-${inv.id}`}>
                            <CheckCircle2 className="w-3 h-3 inline mr-1" />Approve
                          </button>
                        )}
                        {isAdmin && inv.status === 'approved' && (
                          <button onClick={() => handleMarkPaid(inv.id)} className="btn-primary text-xs px-2 py-1" data-testid={`pay-inv-${inv.id}`}>
                            <DollarSign className="w-3 h-3 inline mr-1" />Mark Paid
                          </button>
                        )}
                        {inv.status === 'paid' && <span className="text-xs text-[#03543F]">Paid</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-[Chivo]">New Purchase Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Load from PO (optional)</label>
                <Select value={formData.po_id || undefined} onValueChange={handlePOSelect}>
                  <SelectTrigger data-testid="inv-po-select"><SelectValue placeholder="Select PO to auto-fill" /></SelectTrigger>
                  <SelectContent>
                    {pos.filter(p => p.status === 'submitted' || p.status === 'received').map(po => (
                      <SelectItem key={po.id} value={po.id}>{po.po_number} - {po.supplier_name || suppliers.find(s => s.id === po.supplier_id)?.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier *</label>
                <Select value={formData.supplier_id} onValueChange={v => setFormData({...formData, supplier_id: v})}>
                  <SelectTrigger data-testid="inv-supplier-select"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier Invoice No *</label>
                <input type="text" value={formData.invoice_no} onChange={e => setFormData({...formData, invoice_no: e.target.value})} className="input-field mono" placeholder="INV-001" data-testid="inv-no-input" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Invoice Date *</label>
                <input type="date" value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} className="input-field" data-testid="inv-date-input" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Due Date</label>
                <input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} className="input-field" data-testid="inv-due-date-input" />
              </div>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-[#111827]">Line Items</label>
                <button onClick={addLine} className="text-xs text-[#1D3557] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Add Line</button>
              </div>
              <div className="border rounded-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#F3F4F6]"><th className="text-left py-2 px-2 text-xs">Item</th><th className="text-right py-2 px-2 text-xs w-20">Qty</th><th className="text-right py-2 px-2 text-xs w-24">Rate</th><th className="text-right py-2 px-2 text-xs w-16">GST%</th><th className="text-right py-2 px-2 text-xs w-24">Amount</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {formData.lines.map((line, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="py-1 px-2">
                          <Select value={line.item_id} onValueChange={v => { const it = items.find(i => i.id === v); updateLine(idx, 'item_id', v); if (it) { updateLine(idx, 'hsn_code', it.hsn_code || ''); updateLine(idx, 'gst_rate', it.gst_rate || 18); updateLine(idx, 'unit_price', it.unit_cost || 0); } }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.part_number} - {i.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="py-1 px-2"><input type="number" min="0" value={line.quantity} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                        <td className="py-1 px-2"><input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                        <td className="py-1 px-2">
                          <select value={line.gst_rate} onChange={e => updateLine(idx, 'gst_rate', parseFloat(e.target.value))} className="w-full px-1 py-1 border rounded-sm text-xs">
                            {[0,5,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                        <td className="py-1 px-2 text-right mono text-xs font-medium">{formatCurrency(line.quantity * line.unit_price)}</td>
                        <td className="py-1 px-1"><button onClick={() => removeLine(idx)} className="text-[#9B1C1C] hover:text-[#DC2626] p-1"><X className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-3 space-y-1 text-sm">
                <div className="w-48">
                  <div className="flex justify-between"><span className="text-[#4B5563]">Subtotal:</span><span className="mono">{formatCurrency(calcSubtotal())}</span></div>
                  <div className="flex justify-between"><span className="text-[#4B5563]">GST:</span><span className="mono">{formatCurrency(calcGST())}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Total:</span><span className="mono">{formatCurrency(calcSubtotal() + calcGST())}</span></div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
              <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="input-field" rows={2} data-testid="inv-notes-input" />
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button onClick={() => setDialogOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSubmit} className="btn-primary" data-testid="inv-save-btn">Create Invoice</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
