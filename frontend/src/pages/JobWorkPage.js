import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Plus, Truck, Package, CheckCircle2, ArrowRight, ArrowLeft, X, FileText, Edit2, Printer, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

export default function JobWorkPage() {
  const { user } = useAuth();
  const { formatCurrency, companySettings, currencySymbol } = useCompanySettings();
  const [orders, setOrders] = useState([]);
  const [challans, setChallans] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders');

  // Order dialog
  const [orderDialog, setOrderDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [orderForm, setOrderForm] = useState({ supplier_id: '', expected_return_date: '', processing_charges: 0, notes: '', lines: [{ item_id: '', quantity: 0, rate: 0 }], job_work_parts: [] });

  // DC dialog
  const [dcDialog, setDcDialog] = useState(false);
  const [dcOrder, setDcOrder] = useState(null);
  const [dcLines, setDcLines] = useState([]);
  const [dcWarehouse, setDcWarehouse] = useState('');

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
  const [recWarehouse, setRecWarehouse] = useState('');

  const canEdit = ['admin', 'production_manager'].includes(user?.role);

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
  const addJWPart = () => setOrderForm({ ...orderForm, job_work_parts: [...orderForm.job_work_parts, { item_id: '', quantity: 0, charges: 0 }] });
  const removeJWPart = (idx) => setOrderForm({ ...orderForm, job_work_parts: orderForm.job_work_parts.filter((_, i) => i !== idx) });
  const updateJWPart = (idx, field, val) => { const parts = [...orderForm.job_work_parts]; parts[idx] = { ...parts[idx], [field]: val }; setOrderForm({ ...orderForm, job_work_parts: parts }); };

  const handleCreateOrder = async () => {
    if (!orderForm.supplier_id || orderForm.lines.length === 0) { alert('Select supplier and add items'); return; }
    try {
      const payload = {
        ...orderForm,
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
      job_work_parts: order.job_work_parts?.map(p => ({ item_id: p.item_id, quantity: p.quantity, charges: p.charges || 0 })) || [],
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

  const handleCreateDC = async () => {
    if (dcLines.length === 0) { alert('No items to send'); return; }
    try {
      const { data } = await api.post('/api/job-work/challans', { subcontract_order_id: dcOrder.id, lines: dcLines, warehouse_id: dcWarehouse, notes: '' });
      if (data.success === false && data.insufficient_materials) {
        setDcSendResult({ open: true, data: { message: data.message, consumed: [], dcNumber: '', isError: true, insufficient: data.insufficient_materials } });
        return;
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
      alert(`Purchase Order ${data.po_number} created for ${order.order_number}.\nGo to Purchase Orders to manage.`);
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
      return s + (l.quantity * (it?.unit_cost || l.rate || 0));
    }, 0);
    
    const html = `<!DOCTYPE html><html><head><title>Delivery Challan - ${dc.dc_number}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#111; padding:20px; }
      .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1D3557; padding-bottom:12px; margin-bottom:15px; }
      .header-left h1 { font-size:18px; color:#1D3557; font-weight:700; margin-bottom:2px; }
      .header-left .tagline { font-size:9px; color:#888; margin-bottom:4px; }
      .header-left .company-details { font-size:10px; color:#444; line-height:1.5; }
      .header-right { text-align:right; }
      .header-right .dc-title { font-size:14px; font-weight:700; color:#1D3557; text-transform:uppercase; }
      .header-right .dc-number { font-size:12px; font-family:'Courier New',monospace; color:#333; }
      .header-right .dc-date { font-size:10px; color:#666; margin-top:4px; }
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
    <div class="header">
      <div class="header-left">
        <h1>${cs.company_name || 'My Manufacturing Company'}</h1>
        ${cs.tagline ? `<div class="tagline">${cs.tagline}</div>` : ''}
        <div class="company-details">
          ${companyAddr ? `${companyAddr}<br/>` : ''}
          ${cs.phone ? `Phone: ${cs.phone}` : ''}${cs.phone && cs.email ? ' | ' : ''}${cs.email ? `Email: ${cs.email}` : ''}
          ${cs.gstin ? `<br/>GSTIN: <strong>${cs.gstin}</strong>` : ''}
        </div>
      </div>
      <div class="header-right">
        <div class="dc-title">Delivery Challan</div>
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
    
    <div class="section-title">Job Work Part Details</div>
    <table>
      <thead><tr><th>Sl. No.</th><th>Part No. & Name</th><th class="text-right">QTY</th><th class="text-right">Charges</th><th class="text-right">Total Amount</th></tr></thead>
      <tbody>
      ${jwParts.length > 0 ? jwParts.map((p, i) => {
        const pit = p.item || items.find(it => it.id === p.item_id) || {};
        const charges = p.charges || 0;
        const total = (p.quantity || 0) * charges;
        return `<tr><td>${i+1}</td><td>${pit.part_number || '-'}, ${pit.name || '-'}</td><td class="text-right mono">${p.quantity || 0}</td><td class="text-right mono">${currencySymbol}${charges.toFixed(2)}</td><td class="text-right mono">${currencySymbol}${total.toFixed(2)}</td></tr>`;
      }).join('') : `<tr><td>1</td><td>${parentItemName || '-'}</td><td class="text-right mono">${parentItemQty || '-'}</td><td class="text-right mono">-</td><td class="text-right mono">-</td></tr>`}
      <tr class="total-row"><td colspan="4" class="text-right">Total Job Work Cost</td><td class="text-right mono">${currencySymbol}${totalJobWorkCost.toFixed(2)}</td></tr>
      </tbody>
    </table>
    
    <div class="section-title">Raw Material Issued</div>
    <table>
      <thead><tr><th>Sl. No.</th><th>Part No. & Name</th><th class="text-right">QTY</th><th class="text-right">Rate</th><th class="text-right">Total RM Cost</th></tr></thead>
      <tbody>
      ${dc.lines.map((l, i) => {
        const it = l.item || {};
        const rate = it.unit_cost || l.rate || 0;
        const cost = l.quantity * rate;
        return `<tr><td>${i+1}</td><td>${it.part_number || '-'}, ${it.name || '-'}</td><td class="text-right mono">${l.quantity}</td><td class="text-right mono">${currencySymbol}${rate.toFixed(2)}</td><td class="text-right mono">${currencySymbol}${cost.toFixed(2)}</td></tr>`;
      }).join('')}
      <tr class="total-row"><td colspan="4" class="text-right">Total RM Cost</td><td class="text-right mono">${currencySymbol}${totalRMCost.toFixed(2)}</td></tr>
      </tbody>
    </table>
    
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
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.onload = () => w.print();
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
    <div className="space-y-6" data-testid="jobwork-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Job Work / Subcontracting</h1>
          <p className="text-sm text-[#4B5563]">Send materials to subcontractors and receive processed goods</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card-flat p-4"><p className="kpi-label">Active Orders</p><p className="kpi-value">{orders.filter(o => ['confirmed', 'in_progress'].includes(o.status)).length}</p></div>
        <div className="card-flat p-4"><p className="kpi-label">Materials Sent</p><p className="kpi-value">{challans.length}</p></div>
        <div className="card-flat p-4"><p className="kpi-label">Materials Received</p><p className="kpi-value">{receipts.length}</p></div>
        <div className="card-flat p-4"><p className="kpi-label">Processing Charges</p><p className="kpi-value">{formatCurrency(orders.reduce((s, o) => s + (o.processing_charges || 0), 0))}</p></div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="orders">Subcontract Orders</TabsTrigger>
          <TabsTrigger value="challans" data-testid="challans-tab">Delivery Challans</TabsTrigger>
          <TabsTrigger value="receipts" data-testid="receipts-tab">Receipts</TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders" className="mt-4">
          <div className="flex justify-end mb-4">
            {canEdit && <button onClick={() => setOrderDialog(true)} className="btn-primary flex items-center space-x-2" data-testid="create-jw-order-btn"><Plus className="w-4 h-4" /><span>New Subcontract Order</span></button>}
          </div>
          <div className="card-flat overflow-hidden">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]"><Truck className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No subcontract orders</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="jw-orders-table">
                  <thead><tr>
                    <th style={{width:'90px'}}>Order #</th>
                    <th style={{width:'80px'}}>MO #</th>
                    <th style={{minWidth:'160px'}}>FG/SA/Part</th>
                    <th style={{width:'100px'}}>Supplier</th>
                    <th style={{minWidth:'140px'}}>RM</th>
                    <th style={{width:'70px'}}>Sent/Total</th>
                    <th style={{width:'60px'}}>Received</th>
                    <th style={{width:'80px'}} className="text-right">Charges</th>
                    <th style={{width:'80px'}}>Status</th>
                    <th style={{width:'80px'}}>Return Date</th>
                    <th style={{width:'100px'}}>Actions</th>
                  </tr></thead>
                  <tbody>
                    {orders.map(o => {
                      const totalQty = o.lines.reduce((s, l) => s + l.quantity, 0);
                      const sentQty = o.lines.reduce((s, l) => s + (l.sent_quantity || 0), 0);
                      const recvQty = o.lines.reduce((s, l) => s + (l.received_quantity || 0), 0);
                      return (
                        <tr key={o.id} data-testid={`jw-order-row-${o.id}`}>
                          <td className="mono font-medium">{o.order_number}</td>
                          <td className="text-sm">{(o.mo_numbers || []).map((m, mi) => <div key={mi} className="mono text-[#1D3557]">{m}</div>)}{!o.mo_numbers?.length && <span className="mono text-[#1D3557]">{o.mo_number || '-'}</span>}</td>
                          <td className="text-sm">{o.job_work_parts && o.job_work_parts.length > 0 ? o.job_work_parts.map((p, pi) => {
                            const pit = p.item || items.find(i => i.id === p.item_id);
                            return <div key={pi} className="mb-1"><div className="font-semibold text-[#1D3557]">{pit?.part_number} - {pit?.name || ''}</div><div className="text-[#6B7280] text-[11px]">Qty: {p.quantity}{p.charges ? <span className="text-[#723B13] ml-1">@{formatCurrency(p.charges)}</span> : ''}</div></div>;
                          }) : <span className="text-[#6B7280]">{o.fg_item_name || '-'}</span>}</td>
                          <td className="text-sm">{o.supplier?.name || '-'}</td>
                          <td className="text-sm">{o.subcontract_type === 'without_material' ? <span className="text-[#9CA3AF] text-xs italic">No RM</span> : o.lines.map((l, li) => {
                            const it = l.item || items.find(i => i.id === l.item_id);
                            return <div key={li} className="mb-0.5"><div className="mono text-[11px] font-medium">{it?.part_number || '-'}</div><div className="text-[#4B5563] text-[11px]">{it?.name || ''} ({l.quantity})</div></div>;
                          })}</td>
                          <td className="mono">{sentQty}/{totalQty}</td>
                          <td className="mono">{recvQty}</td>
                          <td className="text-right mono">{formatCurrency((o.job_work_parts || []).reduce((s, p) => s + (p.quantity || 0) * (p.charges || 0), 0) || o.processing_charges || 0)}</td>
                          <td>
                            <span className={`status-badge ${getStatusColor(o.status)}`}>{o.status.replace('_', ' ')}</span>
                            {o.subcontract_type === 'without_material' && <span className="ml-1 text-[9px] bg-[#E1EFFE] text-[#1D3557] px-1 rounded">No RM</span>}
                          </td>
                          <td className="text-sm">{o.last_receipt_date ? new Date(o.last_receipt_date).toLocaleDateString() : o.expected_return_date ? new Date(o.expected_return_date).toLocaleDateString() : '-'}</td>
                          <td>
                            <div className="flex items-center space-x-1">
                              {canEdit && ['draft', 'confirmed', 'in_progress'].includes(o.status) && !o.po_created && (
                                <button onClick={() => handleEditOrder(o)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Edit" data-testid={`edit-jw-${o.id}`}>
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              {canEdit && o.status === 'draft' && (
                                <button onClick={() => handleConfirmOrder(o.id)} className="btn-secondary text-xs px-2 py-1 text-[#03543F] border-[#03543F]" data-testid={`confirm-jw-${o.id}`}><CheckCircle2 className="w-3 h-3 inline mr-1" />Confirm</button>
                              )}
                              {canEdit && ['confirmed', 'in_progress'].includes(o.status) && o.lines?.length > 0 && sentQty < totalQty && (
                                <button onClick={() => openDCDialog(o)} className="btn-primary text-xs px-2 py-1" data-testid={`send-dc-${o.id}`}><ArrowRight className="w-3 h-3 inline mr-1" />Send DC</button>
                              )}
                              {canEdit && ['confirmed', 'in_progress'].includes(o.status) && (!o.lines || o.lines.length === 0) && o.job_work_parts?.length > 0 && !o.dc_created && (
                                <button onClick={() => handleCreateDCForParts(o)} className="btn-primary text-xs px-2 py-1" data-testid={`send-dc-parts-${o.id}`}><ArrowRight className="w-3 h-3 inline mr-1" />Send DC</button>
                              )}
                              {canEdit && ['draft', 'confirmed', 'in_progress'].includes(o.status) && !o.po_created && (
                                (o.lines?.length > 0 ? sentQty >= totalQty : o.dc_created) || (o.subcontract_type === 'without_material' && (!o.lines || o.lines.length === 0) && !o.job_work_parts?.length)
                              ) && (
                                <button onClick={() => handleCreatePOFromSC(o)} className="btn-primary text-xs px-2 py-1 bg-[#723B13] hover:bg-[#5A2E0F]" data-testid={`create-po-${o.id}`}><FileText className="w-3 h-3 inline mr-1" />Create PO</button>
                              )}
                              {o.po_created && o.po_number && (
                                <span className="text-[10px] text-[#03543F] bg-[#DEF7EC] px-2 py-1 rounded">{o.po_number}</span>
                              )}
                              {o.status === 'in_progress' && o.po_created && (
                                <span className="text-[10px] text-[#723B13] bg-[#FDF6B2] px-2 py-1 rounded">Receive via GRN</span>
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
        </TabsContent>

        {/* Challans Tab */}
        <TabsContent value="challans" className="mt-4">
          <div className="card-flat overflow-hidden">
            {challans.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]"><FileText className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No delivery challans</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="challans-table">
                  <thead><tr><th>DC #</th><th>Order #</th><th>FG/SA/Part</th><th>Supplier</th><th>Items</th><th className="text-right">RM Price</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                  <tbody>
                    {challans.map(dc => (
                      <tr key={dc.id} data-testid={`dc-row-${dc.id}`}>
                        <td className="mono font-medium">{dc.dc_number}</td>
                        <td className="mono">{dc.order?.order_number || '-'}</td>
                        <td className="text-sm font-medium">
                          {(dc.order?.job_work_parts || []).map((p, pi) => {
                            const pit = p.item || items.find(i => i.id === p.item_id);
                            return <div key={pi}>{pit?.part_number || '-'} - {pit?.name || ''} <span className="text-[#6B7280] font-normal">({p.quantity})</span></div>;
                          })}
                          {!(dc.order?.job_work_parts?.length) && (dc.fg_item_name || '-')}
                        </td>
                        <td>{dc.supplier?.name || '-'}</td>
                        <td className="text-sm">
                          {dc.lines.map((l, li) => {
                            const it = l.item || items.find(i => i.id === l.item_id);
                            return <div key={li} className="text-[#4B5563]"><span className="mono text-[10px]">{it?.part_number || '-'}</span> {it?.name || ''} <span className="mono text-[#6B7280]">({l.quantity})</span></div>;
                          })}
                        </td>
                        <td className="text-right mono">{formatCurrency(dc.lines.reduce((s, l) => { const it = l.item || items.find(i => i.id === l.item_id); return s + (l.quantity * (it?.unit_cost || l.rate || 0)); }, 0))}</td>
                        <td><span className={`status-badge ${getStatusColor(dc.status)}`}>{dc.status}</span></td>
                        <td className="text-sm">{dc.created_at ? new Date(dc.created_at).toLocaleDateString() : '-'}</td>
                        <td>
                          <div className="flex items-center space-x-1">
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Receipts Tab */}
        <TabsContent value="receipts" className="mt-4">
          <div className="card-flat overflow-hidden">
            {receipts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]"><Package className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No receipts</p></div>
            ) : (
              <div className="overflow-x-auto">
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
        </TabsContent>
      </Tabs>

      {/* Create Order Dialog */}
      <Dialog open={orderDialog} onOpenChange={setOrderDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                <button onClick={addJWPart} className="text-xs text-[#1D3557] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Add Part</button>
              </div>
              <div className="border rounded-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#E1EFFE]"><th className="text-left py-2 px-2 text-xs">Part (FG/SA)</th><th className="text-right py-2 px-2 text-xs w-20">Qty</th><th className="text-right py-2 px-2 text-xs w-28">Charges/pc</th><th className="text-right py-2 px-2 text-xs w-24">Total</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {orderForm.job_work_parts.map((p, idx) => {
                      const total = (p.quantity || 0) * (p.charges || 0);
                      return (
                        <tr key={idx} className="border-t">
                          <td className="py-1 px-2">
                            <Select value={p.item_id} onValueChange={v => updateJWPart(idx, 'item_id', v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select part" /></SelectTrigger>
                              <SelectContent>{items.filter(i => ['finished_good','sub_assembly','component'].includes(i.category)).map(i => <SelectItem key={i.id} value={i.id}>{i.part_number} - {i.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          <td className="py-1 px-2"><input type="number" min="1" value={p.quantity} onChange={e => updateJWPart(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                          <td className="py-1 px-2"><input type="number" min="0" step="0.01" value={p.charges} onChange={e => updateJWPart(idx, 'charges', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                          <td className="py-1 px-2 mono text-right text-xs font-medium">{formatCurrency(total)}</td>
                          <td className="py-1 px-1"><button onClick={() => removeJWPart(idx)} className="text-[#9B1C1C] p-1"><X className="w-3 h-3" /></button></td>
                        </tr>
                      );
                    })}
                    {orderForm.job_work_parts.length === 0 && <tr><td colSpan="5" className="text-center py-2 text-xs text-[#9CA3AF]">No parts added</td></tr>}
                  </tbody>
                </table>
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
                  <thead><tr className="bg-[#F3F4F6]"><th className="text-left py-2 px-2 text-xs">Item</th><th className="text-right py-2 px-2 text-xs w-24">Qty</th><th className="text-right py-2 px-2 text-xs w-24">Rate</th><th className="w-8"></th></tr></thead>
                  <tbody>
                    {orderForm.lines.map((l, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="py-1 px-2">
                          <Select value={l.item_id} onValueChange={v => updateOrderLine(idx, 'item_id', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select item" /></SelectTrigger>
                            <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.part_number} - {i.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="py-1 px-2"><input type="number" min="1" value={l.quantity} onChange={e => updateOrderLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                        <td className="py-1 px-2"><input type="number" min="0" value={l.rate} onChange={e => updateOrderLine(idx, 'rate', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                        <td className="py-1 px-1"><button onClick={() => removeOrderLine(idx)} className="text-[#9B1C1C] p-1"><X className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
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

      {/* Send DC Dialog */}
      <Dialog open={dcDialog} onOpenChange={setDcDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-[Chivo]">Send Materials (DC) - {dcOrder?.order_number}{dcOrder?.fg_item_name ? ` — ${dcOrder.fg_item_name}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div><label className="block text-sm font-semibold mb-1">From Warehouse</label>
              <Select value={dcWarehouse} onValueChange={setDcWarehouse}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="border rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F3F4F6]"><th className="text-left py-2 px-2 text-xs">Item</th><th className="text-right py-2 px-2 text-xs">Send Qty</th></tr></thead>
                <tbody>
                  {dcLines.map((l, idx) => {
                    const it = items.find(i => i.id === l.item_id);
                    return (
                      <tr key={idx} className="border-t">
                        <td className="py-2 px-2"><span className="mono text-xs">{it?.part_number}</span> - {it?.name} <span className="text-[10px] text-[#6B7280]">(Stock: {it?.current_stock || 0})</span></td>
                        <td className="py-2 px-2"><input type="number" min="0" max={it?.current_stock || 0} value={l.quantity} onChange={e => { const ls = [...dcLines]; ls[idx].quantity = Math.min(parseFloat(e.target.value) || 0, it?.current_stock || 0); setDcLines(ls); }} className="w-24 px-2 py-1 border rounded-sm mono text-right text-xs" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
              <button onClick={() => { setDcPrintDialog(false); if (dcPrintTarget) printDC(dcPrintTarget, dcTerms); }} className="btn-primary flex items-center space-x-2" data-testid="dc-print-confirm">
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
    </div>
  );
}
