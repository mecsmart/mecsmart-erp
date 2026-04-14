import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Plus, FileText, CheckCircle2, DollarSign, X, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

export default function PurchaseInvoicePage() {
  const { user } = useAuth();
  const { formatCurrency } = useCompanySettings();
  const [invoices, setInvoices] = useState([]);
  const [pendingGRNs, setPendingGRNs] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    supplier_id: '', po_id: '', grn_id: '', invoice_no: '', invoice_date: '', due_date: '', notes: '',
    lines: []
  });

  const isAdmin = user?.role === 'admin';
  const canEdit = ['admin', 'production_manager'].includes(user?.role);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const [invRes, grnRes, itemRes] = await Promise.all([
        api.get(`/api/purchase-invoices${params}`),
        api.get('/api/purchase-invoices/pending-grns'),
        api.get('/api/items'),
      ]);
      setInvoices(invRes.data);
      setPendingGRNs(grnRes.data);
      setItems(itemRes.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGRNSelect = (grnId) => {
    const grn = pendingGRNs.find(g => g.id === grnId);
    if (!grn) return;
    setFormData({
      ...formData,
      grn_id: grnId,
      supplier_id: grn.supplier_id || '',
      po_id: grn.po_id || '',
      invoice_no: grn.supplier_invoice_no || '',
      invoice_date: grn.supplier_invoice_date ? grn.supplier_invoice_date.split('T')[0] : '',
      lines: grn.lines?.map(l => ({
        item_id: l.item_id,
        quantity: l.received_quantity || 0,
        unit_price: l.verified_price || l.po_price || 0,
        discount: 0,
        hsn_code: l.hsn_code || '',
        gst_rate: items.find(i => i.id === l.item_id)?.gst_rate || 18
      })) || []
    });
  };

  const addLine = () => setFormData({ ...formData, lines: [...formData.lines, { item_id: '', quantity: 0, unit_price: 0, discount: 0, hsn_code: '', gst_rate: 18 }] });
  const removeLine = (idx) => setFormData({ ...formData, lines: formData.lines.filter((_, i) => i !== idx) });
  const updateLine = (idx, field, val) => {
    const lines = [...formData.lines];
    lines[idx] = { ...lines[idx], [field]: val };
    setFormData({ ...formData, lines });
  };

  const calcSubtotal = () => formData.lines.reduce((s, l) => s + (l.quantity * l.unit_price - (l.discount || 0)), 0);
  const calcGST = () => formData.lines.reduce((s, l) => s + ((l.quantity * l.unit_price - (l.discount || 0)) * (l.gst_rate || 18) / 100), 0);

  const handleSubmit = async () => {
    if (!formData.grn_id) { alert('Please select a GRN'); return; }
    if (!formData.invoice_no) { alert('Please enter supplier invoice number'); return; }
    if (formData.lines.length === 0) { alert('No line items'); return; }
    try {
      await api.post('/api/purchase-invoices', {
        ...formData,
        invoice_date: formData.invoice_date ? new Date(formData.invoice_date).toISOString() : new Date().toISOString(),
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
      });
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create invoice'); }
  };

  const resetForm = () => setFormData({ supplier_id: '', po_id: '', grn_id: '', invoice_no: '', invoice_date: '', due_date: '', notes: '', lines: [] });

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
          <p className="text-sm text-[#4B5563]">Record supplier invoices against received GRNs</p>
        </div>
        {canEdit && (
          <button onClick={() => { resetForm(); setDialogOpen(true); }} className="btn-primary flex items-center space-x-2" data-testid="create-invoice-btn" disabled={pendingGRNs.length === 0} title={pendingGRNs.length === 0 ? 'No pending GRNs to invoice' : ''}>
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
        {pendingGRNs.length > 0 && <span className="text-xs text-[#723B13] bg-[#FDF6B2] px-2 py-0.5 rounded">{pendingGRNs.length} GRN(s) pending invoice</span>}
        <div className="flex-1" />
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input type="text" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} placeholder="Search invoice, supplier..." className="input-field pl-9 text-sm" data-testid="invoice-search-input" />
        </div>
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
            {pendingGRNs.length > 0 && <p className="text-xs text-[#6B7280] mt-1">Click "New Invoice" to create from a received GRN</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table" data-testid="invoice-table">
              <thead><tr><th>Invoice #</th><th>Supplier Inv.</th><th>Supplier</th><th>PO Ref</th><th>GRN Ref</th><th>Date</th><th>Due Date</th><th className="text-right">Amount</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {invoices.filter(inv => {
                  if (!invoiceSearch.trim()) return true;
                  const q = invoiceSearch.toLowerCase();
                  return inv.invoice_number?.toLowerCase().includes(q) || inv.invoice_no?.toLowerCase().includes(q) || inv.supplier?.name?.toLowerCase().includes(q);
                }).map(inv => (
                  <tr key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                    <td className="mono font-medium">{inv.invoice_number}</td>
                    <td className="mono">{inv.invoice_no}</td>
                    <td>{inv.supplier?.name || '-'}</td>
                    <td className="mono text-sm">{inv.po?.po_number || '-'}</td>
                    <td className="mono text-sm">{inv.grn?.grn_number || '-'}</td>
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
          <DialogHeader><DialogTitle className="font-[Chivo]">New Purchase Invoice from GRN</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            {/* GRN Selection */}
            <div className="bg-[#F0F4F8] border border-[#D1D5DB] rounded-sm p-4">
              <label className="block text-sm font-semibold text-[#111827] mb-2">Select GRN *</label>
              <Select value={formData.grn_id || undefined} onValueChange={handleGRNSelect}>
                <SelectTrigger data-testid="inv-grn-select"><SelectValue placeholder="Select a received GRN" /></SelectTrigger>
                <SelectContent>
                  {pendingGRNs.map(grn => (
                    <SelectItem key={grn.id} value={grn.id}>
                      {grn.grn_number} — PO: {grn.po?.po_number || grn.po_number || '-'} — {grn.supplier?.name || 'Unknown'}
                      {grn.lines?.length > 0 && ` (${grn.lines.length} items)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pendingGRNs.length === 0 && <p className="text-xs text-[#9B1C1C] mt-1">No GRNs pending invoice. Create a GRN from Stores first.</p>}
            </div>

            {formData.grn_id && (
              <>
                {/* Auto-filled info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier</label>
                    <div className="input-field bg-[#F9FAFB] text-[#374151]">
                      {pendingGRNs.find(g => g.id === formData.grn_id)?.supplier?.name || '-'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">PO Reference</label>
                    <div className="input-field bg-[#F9FAFB] mono text-[#374151]">
                      {pendingGRNs.find(g => g.id === formData.grn_id)?.po?.po_number || pendingGRNs.find(g => g.id === formData.grn_id)?.po_number || '-'}
                    </div>
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

                {/* Line items (auto-populated from GRN) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-[#111827]">Line Items (from GRN)</label>
                    <button onClick={addLine} className="text-xs text-[#1D3557] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Add Line</button>
                  </div>
                  <div className="border rounded-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#F3F4F6]">
                        <th className="text-left py-2 px-2 text-xs">Item</th>
                        <th className="text-right py-2 px-2 text-xs w-20">Qty</th>
                        <th className="text-right py-2 px-2 text-xs w-24">Rate</th>
                        <th className="text-right py-2 px-2 text-xs w-20">Discount</th>
                        <th className="text-right py-2 px-2 text-xs w-16">GST%</th>
                        <th className="text-right py-2 px-2 text-xs w-24">Amount</th>
                        <th className="w-8"></th>
                      </tr></thead>
                      <tbody>
                        {formData.lines.map((line, idx) => {
                          const it = items.find(i => i.id === line.item_id);
                          const lineAmt = line.quantity * line.unit_price - (line.discount || 0);
                          return (
                            <tr key={idx} className="border-t">
                              <td className="py-1 px-2">
                                <div className="text-xs"><span className="mono font-medium">{it?.part_number || '-'}</span> {it?.name || ''}</div>
                              </td>
                              <td className="py-1 px-2"><input type="number" min="0" value={line.quantity} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                              <td className="py-1 px-2"><input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                              <td className="py-1 px-2"><input type="number" min="0" step="0.01" value={line.discount || 0} onChange={e => updateLine(idx, 'discount', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                              <td className="py-1 px-2">
                                <select value={line.gst_rate} onChange={e => updateLine(idx, 'gst_rate', parseFloat(e.target.value))} className="w-full px-1 py-1 border rounded-sm text-xs">
                                  {[0,5,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}
                                </select>
                              </td>
                              <td className="py-1 px-2 text-right mono text-xs font-medium">{formatCurrency(lineAmt)}</td>
                              <td className="py-1 px-1"><button onClick={() => removeLine(idx)} className="text-[#9B1C1C] hover:text-[#DC2626] p-1"><X className="w-3 h-3" /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end mt-3 text-sm">
                    <div className="w-52 space-y-1">
                      <div className="flex justify-between"><span className="text-[#4B5563]">Subtotal:</span><span className="mono">{formatCurrency(calcSubtotal())}</span></div>
                      <div className="flex justify-between"><span className="text-[#4B5563]">GST:</span><span className="mono">{formatCurrency(calcGST())}</span></div>
                      <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Total:</span><span className="mono text-lg">{formatCurrency(calcSubtotal() + calcGST())}</span></div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
                  <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="input-field" rows={2} data-testid="inv-notes-input" />
                </div>
              </>
            )}

            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button onClick={() => setDialogOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSubmit} className="btn-primary" disabled={!formData.grn_id} data-testid="inv-save-btn">Create Invoice</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
