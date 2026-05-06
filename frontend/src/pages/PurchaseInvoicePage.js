import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Plus, FileText, CheckCircle2, DollarSign, X, Search, Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { SearchableSelect } from '../components/SearchableSelect';
import { SearchableItemSelect } from '../components/SearchableItemSelect';

export default function PurchaseInvoicePage() {
  const { user, hasPermission } = useAuth();
  const { formatCurrency } = useCompanySettings();
  const [invoices, setInvoices] = useState([]);
  const [pendingGRNs, setPendingGRNs] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);  // Bulk Tally XML selection
  // Manual PI toggle — when true, the GRN search/lock is bypassed and user enters everything by hand.
  const [manualMode, setManualMode] = useState(false);
  const [grnSearchQuery, setGrnSearchQuery] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [formData, setFormData] = useState({
    supplier_id: '', po_id: '', grn_id: '', invoice_no: '', invoice_date: '', due_date: '', notes: '',
    additional_charges: [],  // Freight / Packaging / Insurance — pre-filled from parent PO when GRN is selected
    lines: []
  });

  const isAdmin = user?.role === 'admin';
  // Permission-driven visibility: admin always allowed, else granular permissions.
  const canEdit = isAdmin
    || hasPermission('purchase_invoices', 'create')
    || hasPermission('purchase_invoices', 'edit');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const [invRes, grnRes, itemRes, supRes] = await Promise.all([
        api.get(`/api/purchase-invoices${params}`),
        api.get('/api/purchase-invoices/pending-grns'),
        api.get('/api/items?lite=1'),
        api.get('/api/suppliers'),
      ]);
      setInvoices(invRes.data);
      setPendingGRNs(grnRes.data);
      setItems(itemRes.data);
      setSuppliers(supRes.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGRNSelect = async (grnId) => {
    const grn = pendingGRNs.find(g => g.id === grnId);
    if (!grn) return;
    const isJW = !!(grn.is_jw || grn.jw_order_id || grn.sc_order_id);
    const supplierId = grn.supplier_id || grn.supplier?.id || grn.jw_order?.supplier_id || '';
    let lines = [];
    if (isJW) {
      // JW GRN: invoice is for processing charges (service). Each GRN line has process_charges.
      lines = (grn.lines || []).map(l => {
        const it = items.find(i => i.id === l.item_id);
        return {
          item_id: l.item_id,
          quantity: l.received_quantity || 0,
          unit_price: l.process_charges || 0,
          discount: 0,
          hsn_code: l.hsn_code || it?.hsn_code || '',
          // Services usually GST 18%, but respect item gst_rate as default
          gst_rate: it?.gst_rate || 18,
          is_process_charge: true,
          description: `Processing charges for ${it?.part_number || ''} (JW: ${grn.jw_order_number || ''})`
        };
      });
    } else {
      // PO GRN: material purchase
      lines = (grn.lines || []).map(l => {
        const it = items.find(i => i.id === l.item_id);
        return {
          item_id: l.item_id,
          quantity: l.received_quantity || 0,
          unit_price: l.verified_price || l.po_price || 0,
          discount: 0,
          hsn_code: l.hsn_code || it?.hsn_code || '',
          gst_rate: it?.gst_rate || 18,
          is_process_charge: false,
          description: ''
        };
      });
    }
    // Pre-fill additional_charges from the parent PO. Freight / packaging /
    // insurance booked at PO time should flow into the PI by default — user
    // can still tweak before saving.
    let preCharges = [];
    if (!isJW && grn.po_id) {
      try {
        const { data: po } = await api.get(`/api/purchase-orders/${grn.po_id}`);
        preCharges = (po?.additional_charges || []).map(c => ({
          name: c.name || '',
          amount: parseFloat(c.amount) || 0,
          gst_rate: parseFloat(c.gst_rate) || 0,
        }));
      } catch (e) { /* PO may have been deleted; non-fatal */ }
    }
    setFormData({
      ...formData,
      grn_id: grnId,
      supplier_id: supplierId,
      po_id: grn.po_id || '',
      invoice_no: grn.supplier_invoice_no || '',
      invoice_date: grn.supplier_invoice_date ? grn.supplier_invoice_date.split('T')[0] : '',
      additional_charges: preCharges,
      lines
    });
  };

  const addLine = () => setFormData({ ...formData, lines: [...formData.lines, { item_id: '', quantity: 0, unit_price: 0, discount: 0, hsn_code: '', gst_rate: 18, is_process_charge: false, description: '' }] });
  const removeLine = (idx) => setFormData({ ...formData, lines: formData.lines.filter((_, i) => i !== idx) });
  const updateLine = (idx, field, val) => {
    const lines = [...formData.lines];
    lines[idx] = { ...lines[idx], [field]: val };
    setFormData({ ...formData, lines });
  };

  const calcSubtotal = () => formData.lines.reduce((s, l) => s + (l.quantity * l.unit_price - (l.discount || 0)), 0);
  const calcChargesSubtotal = () => (formData.additional_charges || []).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const calcLinesGST = () => formData.lines.reduce((s, l) => s + ((l.quantity * l.unit_price - (l.discount || 0)) * (l.gst_rate || 18) / 100), 0);
  const calcChargesGST = () => (formData.additional_charges || []).reduce((s, c) => s + ((parseFloat(c.amount) || 0) * (parseFloat(c.gst_rate) || 0) / 100), 0);
  const calcGST = () => calcLinesGST() + calcChargesGST();
  const calcTotal = () => calcSubtotal() + calcChargesSubtotal() + calcGST();
  const addCharge = () => setFormData(fd => ({ ...fd, additional_charges: [...(fd.additional_charges || []), { name: '', amount: 0, gst_rate: 18 }] }));
  const removeCharge = (idx) => setFormData(fd => ({ ...fd, additional_charges: fd.additional_charges.filter((_, i) => i !== idx) }));
  const updateCharge = (idx, field, val) => {
    const charges = [...(formData.additional_charges || [])];
    charges[idx] = { ...charges[idx], [field]: val };
    setFormData(fd => ({ ...fd, additional_charges: charges }));
  };

  const handleSubmit = async () => {
    // In manual mode, skip GRN check. Still require supplier + invoice_no + at least one line.
    if (!manualMode && !formData.grn_id) { alert('Please select a GRN (or switch to Manual entry mode)'); return; }
    if (manualMode && !formData.supplier_id) { alert('Please select a supplier'); return; }
    if (!formData.invoice_no) { alert('Please enter supplier invoice number'); return; }
    if (formData.lines.length === 0) { alert('Add at least one line item'); return; }
    try {
      await api.post('/api/purchase-invoices', {
        ...formData,
        is_manual: manualMode,
        invoice_date: formData.invoice_date ? new Date(formData.invoice_date).toISOString() : new Date().toISOString(),
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
      });
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create invoice'); }
  };

  const resetForm = () => { setFormData({ supplier_id: '', po_id: '', grn_id: '', invoice_no: '', invoice_date: '', due_date: '', notes: '', additional_charges: [], lines: [] }); setManualMode(false); setGrnSearchQuery(''); };

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

  // ========== Tally XML Export ==========
  // Pattern: fetch XML → render a small viewer page in a new tab with a visible Download
  // button. This is more reliable than programmatic `<a download>` clicks which Emergent
  // preview iframes occasionally block.
  const showTallyViewer = (xmlString, filename) => {
    const escaped = xmlString.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #F3F4F6; }
      .topbar { position: sticky; top: 0; background: #1D3557; color: white; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .topbar h1 { font-size: 15px; font-weight: 600; margin: 0; }
      .topbar .meta { font-size: 11px; opacity: 0.85; }
      .topbar button, .topbar a { background: #DEF7EC; color: #03543F; border: none; padding: 6px 14px; border-radius: 3px; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
      .topbar a:hover { background: #BCF0DA; }
      pre { background: white; padding: 16px; margin: 0; overflow: auto; font-size: 11px; color: #111; white-space: pre-wrap; word-break: break-word; font-family: 'Consolas','Courier New',monospace; min-height: calc(100vh - 50px); }
      .instructions { background: #FEF3C7; color: #723B13; padding: 10px 16px; font-size: 12px; border-bottom: 1px solid #F59E0B; }
      .instructions code { background: rgba(0,0,0,0.08); padding: 1px 6px; border-radius: 2px; }
    </style></head><body>
    <div class="topbar">
      <div>
        <h1>${filename}</h1>
        <div class="meta">Tally-compatible XML · ${xmlString.length.toLocaleString()} chars</div>
      </div>
      <a id="dl-btn" download="${filename}">⬇ Download XML</a>
    </div>
    <div class="instructions">
      <strong>Import into Tally:</strong> Open Tally → Gateway of Tally → <code>F12 Configure</code> → set voucher type to Purchase → Import Data → Vouchers → select this downloaded XML.
    </div>
    <pre id="content"></pre>
    <script>
      const raw = document.getElementById('content');
      raw.textContent = ${JSON.stringify(xmlString)};
      const blob = new Blob([${JSON.stringify(xmlString)}], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const btn = document.getElementById('dl-btn');
      btn.href = url;
      // Auto-trigger download once on open
      setTimeout(() => { try { btn.click(); } catch(e) {} }, 400);
    <\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const pageUrl = URL.createObjectURL(blob);
    window.open(pageUrl, '_blank', 'width=1100,height=800');
  };

  const downloadTallyXML = async (inv) => {
    try {
      const res = await api.get(`/api/purchase-invoices/${inv.id}/tally-xml`, { responseType: 'text' });
      const xml = typeof res.data === 'string' ? res.data : await (res.data.text ? res.data.text() : Promise.resolve(String(res.data)));
      showTallyViewer(xml, `tally_${inv.invoice_number || inv.id}.xml`);
    } catch (e) {
      alert(e.response?.data?.detail || e.message || 'Failed to generate Tally XML');
    }
  };

  const downloadTallyXMLBulk = async () => {
    if (selectedIds.length === 0) { alert('Select at least one invoice to export (use the checkboxes).'); return; }
    try {
      const res = await api.post('/api/purchase-invoices/tally-xml-bulk', { invoice_ids: selectedIds }, { responseType: 'text' });
      const xml = typeof res.data === 'string' ? res.data : await (res.data.text ? res.data.text() : Promise.resolve(String(res.data)));
      showTallyViewer(xml, `tally_purchase_invoices_${new Date().toISOString().slice(0, 10)}_${selectedIds.length}.xml`);
    } catch (e) {
      alert(e.response?.data?.detail || e.message || 'Failed to generate bulk Tally XML');
    }
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
          <div className="flex items-center gap-2">
            <button onClick={downloadTallyXMLBulk} className="btn-secondary flex items-center space-x-2 disabled:opacity-50" data-testid="tally-bulk-export-btn" disabled={selectedIds.length === 0} title={selectedIds.length === 0 ? 'Select at least one invoice via checkbox' : `Download ${selectedIds.length} selected invoice(s) as Tally XML`}>
              <Download className="w-4 h-4" /><span>Tally XML ({selectedIds.length})</span>
            </button>
            <button onClick={() => { resetForm(); setDialogOpen(true); }} className="btn-primary flex items-center space-x-2" data-testid="create-invoice-btn">
              <Plus className="w-4 h-4" /><span>New Invoice</span>
            </button>
          </div>
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
          <input type="text" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} placeholder="Search invoice, supplier..." className="search-input text-sm" data-testid="invoice-search-input" />
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
          <div className="overflow-x-auto sticky-header-scroll">
            <table className="w-full data-table" data-testid="invoice-table">
              <thead><tr>
                <th className="w-10 text-center">
                  <input type="checkbox" data-testid="select-all-invoices" checked={(() => {
                    const visible = invoices.filter(inv => !invoiceSearch.trim() || [inv.invoice_number, inv.invoice_no, inv.supplier?.name].some(v => (v || '').toLowerCase().includes(invoiceSearch.toLowerCase())));
                    return visible.length > 0 && visible.every(inv => selectedIds.includes(inv.id));
                  })()} onChange={(e) => {
                    const visible = invoices.filter(inv => !invoiceSearch.trim() || [inv.invoice_number, inv.invoice_no, inv.supplier?.name].some(v => (v || '').toLowerCase().includes(invoiceSearch.toLowerCase())));
                    if (e.target.checked) {
                      setSelectedIds([...new Set([...selectedIds, ...visible.map(v => v.id)])]);
                    } else {
                      const visibleIds = new Set(visible.map(v => v.id));
                      setSelectedIds(selectedIds.filter(id => !visibleIds.has(id)));
                    }
                  }} className="w-4 h-4 accent-[#1D3557] cursor-pointer" />
                </th>
                <th>Invoice #</th><th>Supplier Inv.</th><th>Supplier</th><th>PO Ref</th><th>GRN Ref</th><th>Date</th><th>Due Date</th><th className="text-right">Amount</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {invoices.filter(inv => {
                  if (!invoiceSearch.trim()) return true;
                  const q = invoiceSearch.toLowerCase();
                  return inv.invoice_number?.toLowerCase().includes(q) || inv.invoice_no?.toLowerCase().includes(q) || inv.supplier?.name?.toLowerCase().includes(q);
                }).map(inv => (
                  <tr key={inv.id} data-testid={`invoice-row-${inv.id}`} className={selectedIds.includes(inv.id) ? 'bg-[#F0FDF4]' : ''}>
                    <td className="text-center">
                      <input type="checkbox" data-testid={`select-inv-${inv.id}`} checked={selectedIds.includes(inv.id)} onChange={(e) => {
                        if (e.target.checked) setSelectedIds([...selectedIds, inv.id]);
                        else setSelectedIds(selectedIds.filter(id => id !== inv.id));
                      }} className="w-4 h-4 accent-[#1D3557] cursor-pointer" />
                    </td>
                    <td className="mono font-medium">{inv.invoice_number}{inv.is_manual && <span className="ml-1 text-[9px] bg-[#FEF3C7] text-[#723B13] px-1 py-0.5 rounded">MAN</span>}</td>
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
                        {/* Tally XML download — always visible for any invoice */}
                        <button onClick={() => downloadTallyXML(inv)} className="p-1.5 text-[#1D3557] hover:bg-[#E1EFFE] rounded" data-testid={`tally-inv-${inv.id}`} title="Download Tally XML (for Tally import)">
                          <Download className="w-4 h-4" />
                        </button>
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
          <DialogHeader><DialogTitle className="font-[Chivo]">{manualMode ? 'Manual Purchase Invoice' : 'New Purchase Invoice from GRN'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            {/* Mode Toggle */}
            <div className="flex items-center gap-3 bg-[#F3F4F6] border border-[#D1D5DB] rounded-sm p-2">
              <button type="button" onClick={() => { setManualMode(false); }} className={`flex-1 text-xs py-1.5 rounded-sm transition-colors ${!manualMode ? 'bg-white border border-[#1D3557] text-[#1D3557] font-semibold shadow-sm' : 'text-[#6B7280] hover:text-[#111827]'}`} data-testid="pi-mode-grn">From GRN (standard)</button>
              <button type="button" onClick={() => { setManualMode(true); setFormData({ supplier_id: '', po_id: '', grn_id: '', invoice_no: '', invoice_date: '', due_date: '', notes: '', lines: [] }); }} className={`flex-1 text-xs py-1.5 rounded-sm transition-colors ${manualMode ? 'bg-white border border-[#1D3557] text-[#1D3557] font-semibold shadow-sm' : 'text-[#6B7280] hover:text-[#111827]'}`} data-testid="pi-mode-manual">Manual Entry (no GRN)</button>
            </div>

            {manualMode ? (
              /* Manual Supplier + info */
              <div className="bg-[#F0F4F8] border border-[#D1D5DB] rounded-sm p-4 space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-2">Supplier *</label>
                  <SearchableSelect
                    options={suppliers}
                    value={formData.supplier_id}
                    onChange={(v) => setFormData({ ...formData, supplier_id: v })}
                    getLabel={(s) => s?.name || ''}
                    getSecondary={(s) => s?.gstin || ''}
                    matchFields={['name', 'gstin', 'code']}
                    placeholder="Type supplier name or GSTIN…"
                    testId="manual-pi-supplier"
                  />
                </div>
                <p className="text-xs text-[#723B13] bg-[#FDF6B2] border border-[#FDF6B2] rounded-sm px-3 py-2">
                  <strong>Manual entry mode:</strong> Use this for invoices not tied to a GRN (freight, services, direct expenses). No stock movement happens. Add line items manually below.
                </p>
              </div>
            ) : (
              /* GRN Selection with search */
              <div className="bg-[#F0F4F8] border border-[#D1D5DB] rounded-sm p-4">
                <label className="block text-sm font-semibold text-[#111827] mb-2">Select GRN *</label>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" placeholder="Search by GRN #, PO #, JW order # or supplier name..." value={grnSearchQuery} onChange={(e) => setGrnSearchQuery(e.target.value)} className="search-input" data-testid="grn-search-input" />
                </div>
                {(() => {
                  const q = grnSearchQuery.trim().toLowerCase();
                  const filtered = pendingGRNs.filter(grn => {
                    if (!q) return true;
                    const isJW = !!(grn.is_jw || grn.jw_order_id || grn.sc_order_id);
                    const ref = isJW ? (grn.jw_order_number || grn.jw_order?.order_number || '') : (grn.po?.po_number || grn.po_number || '');
                    return [grn.grn_number, ref, grn.supplier?.name].some(v => (v || '').toLowerCase().includes(q));
                  });
                  const selected = pendingGRNs.find(g => g.id === formData.grn_id);
                  if (selected) {
                    const isJW = !!(selected.is_jw || selected.jw_order_id || selected.sc_order_id);
                    const ref = isJW ? (selected.jw_order_number || selected.jw_order?.order_number || '-') : (selected.po?.po_number || selected.po_number || '-');
                    return (
                      <div className="flex items-center justify-between bg-[#F0FDF4] border border-[#03543F] rounded-sm px-3 py-2" data-testid="grn-selected">
                        <div className="text-xs">
                          <span className="mono font-semibold">{selected.grn_number}</span>
                          <span className="mx-2">—</span>
                          <span className="text-[#6B7280]">{isJW ? 'JW' : 'PO'}: <span className="mono">{ref}</span></span>
                          <span className="mx-2">·</span>
                          <span>{selected.supplier?.name}</span>
                          {selected.lines?.length > 0 && <span className="ml-2 text-[#6B7280]">({selected.lines.length} {isJW ? 'services' : 'items'})</span>}
                        </div>
                        <button type="button" className="text-xs text-[#9B1C1C] hover:underline" onClick={() => { setFormData({ supplier_id: '', po_id: '', grn_id: '', invoice_no: '', invoice_date: '', due_date: '', notes: '', lines: [] }); setGrnSearchQuery(''); }} data-testid="grn-clear">Clear</button>
                      </div>
                    );
                  }
                  return (
                    <div className="border border-[#E5E7EB] rounded-sm max-h-56 overflow-auto bg-white" data-testid="grn-list">
                      {filtered.length === 0 && (<div className="px-3 py-4 text-center text-xs text-[#6B7280]">{pendingGRNs.length === 0 ? 'No GRNs pending invoice. Create a GRN from Stores first.' : 'No matching GRNs.'}</div>)}
                      {filtered.slice(0, 200).map(grn => {
                        const isJW = !!(grn.is_jw || grn.jw_order_id || grn.sc_order_id);
                        const ref = isJW ? (grn.jw_order_number || grn.jw_order?.order_number || '-') : (grn.po?.po_number || grn.po_number || '-');
                        return (
                          <button key={grn.id} type="button" onClick={() => handleGRNSelect(grn.id)} data-testid={`grn-option-${grn.id}`} className="w-full text-left px-3 py-2 text-xs border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]">
                            <span className="mono font-semibold">{grn.grn_number}</span>
                            <span className="mx-2 text-[#6B7280]">—</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${isJW ? 'bg-[#FDF6B2] text-[#723B13]' : 'bg-[#E1EFFE] text-[#1E429F]'}`}>{isJW ? 'JW' : 'PO'}</span>
                            <span className="ml-2 mono">{ref}</span>
                            <span className="mx-2">·</span>
                            <span>{grn.supplier?.name || 'Unknown'}</span>
                            {grn.lines?.length > 0 && <span className="ml-2 text-[#6B7280]">({grn.lines.length} {isJW ? 'services' : 'items'})</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {(formData.grn_id || manualMode) && (
              <>
                {/* GRN Type Banner (only in GRN mode) */}
                {!manualMode && (() => {
                  const g = pendingGRNs.find(x => x.id === formData.grn_id);
                  const isJW = !!(g?.is_jw || g?.jw_order_id || g?.sc_order_id);
                  return isJW ? (
                    <div className="bg-[#FDF6B2]/50 border border-[#FDF6B2] rounded-sm px-3 py-2 text-xs text-[#723B13]" data-testid="jw-invoice-banner">
                      <span className="font-semibold">Job Work Invoice</span> — Supplier is billing processing charges for work done on materials you sent. JW Ref: <span className="mono">{g?.jw_order_number || g?.jw_order?.order_number || '-'}</span>
                    </div>
                  ) : (
                    <div className="bg-[#E1EFFE]/60 border border-[#E1EFFE] rounded-sm px-3 py-2 text-xs text-[#1E429F]" data-testid="po-invoice-banner">
                      <span className="font-semibold">Material Purchase Invoice</span> — Supplier is billing for materials received against PO.
                    </div>
                  );
                })()}

                {/* Auto-filled supplier info (GRN mode only) */}
                {!manualMode && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier</label>
                    <div className="input-field bg-[#F9FAFB] text-[#374151]">
                      {pendingGRNs.find(g => g.id === formData.grn_id)?.supplier?.name || '-'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">
                      {(() => {
                        const g = pendingGRNs.find(x => x.id === formData.grn_id);
                        return (g?.is_jw || g?.jw_order_id || g?.sc_order_id) ? 'JW Order' : 'PO Reference';
                      })()}
                    </label>
                    <div className="input-field bg-[#F9FAFB] mono text-[#374151]">
                      {(() => {
                        const g = pendingGRNs.find(x => x.id === formData.grn_id);
                        if (g?.is_jw || g?.jw_order_id || g?.sc_order_id) return g?.jw_order_number || g?.jw_order?.order_number || '-';
                        return g?.po?.po_number || g?.po_number || '-';
                      })()}
                    </div>
                  </div>
                </div>
                )}

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
                    <label className="text-sm font-semibold text-[#111827]">{(() => {
                      const g = pendingGRNs.find(x => x.id === formData.grn_id);
                      return (g?.is_jw || g?.jw_order_id || g?.sc_order_id) ? 'Processing Charges (from JW GRN)' : 'Line Items (from GRN)';
                    })()}</label>
                    <button onClick={addLine} className="text-xs text-[#1D3557] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Add Line</button>
                  </div>
                  <div className="border rounded-sm overflow-visible">
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
                                {manualMode ? (
                                  <SearchableItemSelect
                                    items={items}
                                    value={line.item_id || ''}
                                    onChange={(id) => {
                                      const picked = items.find(i => i.id === id);
                                      updateLine(idx, 'item_id', id);
                                      if (picked) {
                                        updateLine(idx, 'unit_price', picked.purchase_price || picked.unit_cost || 0);
                                        updateLine(idx, 'gst_rate', picked.gst_rate || 18);
                                        updateLine(idx, 'hsn_code', picked.hsn_code || '');
                                      }
                                    }}
                                    placeholder="Type part # or name…"
                                    testId={`manual-pi-line-item-${idx}`}
                                  />
                                ) : (
                                  <>
                                    <div className="text-xs"><span className="mono font-medium">{it?.part_number || '-'}</span> {it?.name || ''}</div>
                                    {line.is_process_charge && <div className="text-[10px] text-[#723B13] bg-[#FDF6B2] inline-block px-1 rounded mt-0.5" data-testid={`inv-line-process-${idx}`}>Processing Charge</div>}
                                  </>
                                )}
                                {line.description !== undefined && (
                                  <input type="text" placeholder="Description (optional)" value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)} className="w-full mt-1 px-2 py-0.5 border rounded-sm text-[10px] italic" />
                                )}
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
                  {/* Additional Charges (freight / packaging / insurance). Pre-filled from
                      the parent PO when a GRN is selected — user can edit / add / remove. */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-semibold text-[#1D3557]">Additional Charges</div>
                      <button type="button" onClick={addCharge} className="btn-secondary text-xs flex items-center gap-1" data-testid="pi-add-charge-btn">
                        <Plus className="w-3 h-3" /> Add Charge
                      </button>
                    </div>
                    {(formData.additional_charges || []).length === 0 ? (
                      <div className="text-xs text-[#9CA3AF] italic">No additional charges. Click "Add Charge" to include freight, packaging, insurance, etc.</div>
                    ) : (
                      <div className="overflow-x-auto border border-[#E5E7EB] rounded-sm">
                        <table className="w-full text-xs">
                          <thead className="bg-[#F9FAFB] text-[#374151]">
                            <tr>
                              <th className="py-1 px-2 text-left font-semibold">Charge Name</th>
                              <th className="py-1 px-2 text-right font-semibold">Amount</th>
                              <th className="py-1 px-2 text-right font-semibold">GST %</th>
                              <th className="py-1 px-2 text-right font-semibold">Total</th>
                              <th className="py-1 px-1 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.additional_charges.map((c, idx) => {
                              const amt = parseFloat(c.amount) || 0;
                              const tax = amt * (parseFloat(c.gst_rate) || 0) / 100;
                              return (
                                <tr key={idx} className="border-t border-[#E5E7EB]" data-testid={`pi-charge-row-${idx}`}>
                                  <td className="py-1 px-2"><input type="text" value={c.name || ''} onChange={e => updateCharge(idx, 'name', e.target.value)} placeholder="e.g. Freight" className="w-full px-2 py-1 border rounded-sm text-xs" data-testid={`pi-charge-name-${idx}`} /></td>
                                  <td className="py-1 px-2"><input type="number" min="0" step="0.01" value={c.amount || 0} onChange={e => updateCharge(idx, 'amount', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" data-testid={`pi-charge-amount-${idx}`} /></td>
                                  <td className="py-1 px-2">
                                    <select value={c.gst_rate || 0} onChange={e => updateCharge(idx, 'gst_rate', parseFloat(e.target.value))} className="w-full px-1 py-1 border rounded-sm text-xs" data-testid={`pi-charge-gst-${idx}`}>
                                      {[0,5,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}
                                    </select>
                                  </td>
                                  <td className="py-1 px-2 text-right mono text-xs font-medium">{formatCurrency(amt + tax)}</td>
                                  <td className="py-1 px-1"><button type="button" onClick={() => removeCharge(idx)} className="text-[#9B1C1C] hover:text-[#DC2626] p-1" data-testid={`pi-charge-remove-${idx}`}><X className="w-3 h-3" /></button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end mt-3 text-sm">
                    <div className="w-60 space-y-1">
                      <div className="flex justify-between"><span className="text-[#4B5563]">Items Subtotal:</span><span className="mono">{formatCurrency(calcSubtotal())}</span></div>
                      {calcChargesSubtotal() > 0 && <div className="flex justify-between"><span className="text-[#4B5563]">Charges:</span><span className="mono">{formatCurrency(calcChargesSubtotal())}</span></div>}
                      <div className="flex justify-between"><span className="text-[#4B5563]">GST:</span><span className="mono">{formatCurrency(calcGST())}</span></div>
                      <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Total:</span><span className="mono text-lg">{formatCurrency(calcTotal())}</span></div>
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
              <button onClick={handleSubmit} className="btn-primary" disabled={manualMode ? !formData.supplier_id : !formData.grn_id} data-testid="inv-save-btn">Create Invoice</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
