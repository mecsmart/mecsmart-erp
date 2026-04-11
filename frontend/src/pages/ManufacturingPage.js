import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { 
  Plus, 
  Settings2, 
  Edit2, 
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  ClipboardList,
  Printer
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export default function ManufacturingPage() {
  const { user } = useAuth();
  const { formatCurrency, currencySymbol } = useCompanySettings();
  const [workCenters, setWorkCenters] = useState([]);
  const [routings, setRoutings] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('work-orders');
  
  const [isWorkCenterDialogOpen, setIsWorkCenterDialogOpen] = useState(false);
  const [isRoutingDialogOpen, setIsRoutingDialogOpen] = useState(false);
  const [isWorkOrderDialogOpen, setIsWorkOrderDialogOpen] = useState(false);
  const [isJobCardOpen, setIsJobCardOpen] = useState(false);
  const [jobCardWO, setJobCardWO] = useState(null);
  const [editingWorkCenter, setEditingWorkCenter] = useState(null);
  
  const [workCenterForm, setWorkCenterForm] = useState({
    code: '',
    name: '',
    description: '',
    hourly_rate: 0,
    capacity_per_hour: 1,
    status: 'active',
  });
  
  const [routingForm, setRoutingForm] = useState({
    item_id: '',
    name: '',
    description: '',
    revision: 'A',
    status: 'active',
    operations: [],
  });
  
  const [workOrderForm, setWorkOrderForm] = useState({
    production_order_id: '',
    routing_id: '',
    quantity: 1,
    scheduled_start: '',
    scheduled_end: '',
    notes: '',
  });

  const canEdit = ['admin', 'production_manager'].includes(user?.role);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [wcRes, routingsRes, woRes, poRes, itemsRes] = await Promise.all([
        api.get('/api/work-centers'),
        api.get('/api/routings'),
        api.get('/api/work-orders'),
        api.get('/api/production'),
        api.get('/api/items'),
      ]);
      setWorkCenters(wcRes.data);
      setRoutings(routingsRes.data);
      setWorkOrders(woRes.data);
      setProductionOrders(poRes.data);
      setItems(itemsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWorkCenterSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingWorkCenter) {
        await api.put(`/api/work-centers/${editingWorkCenter.id}`, workCenterForm);
      } else {
        await api.post('/api/work-centers', workCenterForm);
      }
      setIsWorkCenterDialogOpen(false);
      setEditingWorkCenter(null);
      resetWorkCenterForm();
      fetchData();
    } catch (error) {
      console.error('Failed to save work center:', error);
      alert(error.response?.data?.detail || 'Failed to save work center');
    }
  };

  const handleRoutingSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/routings', routingForm);
      setIsRoutingDialogOpen(false);
      resetRoutingForm();
      fetchData();
    } catch (error) {
      console.error('Failed to save routing:', error);
      alert(error.response?.data?.detail || 'Failed to save routing');
    }
  };

  const handleWorkOrderSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...workOrderForm,
        scheduled_start: workOrderForm.scheduled_start ? new Date(workOrderForm.scheduled_start).toISOString() : null,
        scheduled_end: workOrderForm.scheduled_end ? new Date(workOrderForm.scheduled_end).toISOString() : null,
      };
      const { data } = await api.post('/api/work-orders', payload);
      setIsWorkOrderDialogOpen(false);
      resetWorkOrderForm();
      
      // Show message about created work orders
      if (data.work_orders && data.work_orders.length > 0) {
        const woList = data.work_orders.map(wo => `- ${wo.wo_number}`).join('\n');
        alert(`${data.message}\n\nWork Orders Created:\n${woList}`);
      } else {
        alert(data.message || 'Work order processing complete');
      }
      
      fetchData();
    } catch (error) {
      console.error('Failed to save work order:', error);
      alert(error.response?.data?.detail || 'Failed to save work order');
    }
  };

  const handleUpdateWorkOrderStatus = async (woId, newStatus) => {
    try {
      if (newStatus === 'in_progress') {
        // Use the start endpoint which consumes materials
        const { data } = await api.post(`/api/work-orders/${woId}/start`);
        if (data.success === false) {
          alert(`Cannot start work order: ${data.message}\n\nInsufficient materials:\n${data.insufficient_materials?.map(m => `- ${m.item} - ${m.name || ''}: need ${m.required}, have ${m.available}`).join('\n')}`);
          return;
        }
        alert(`Work order started!\n\nMaterials consumed:\n${data.consumed_materials?.map(m => `- ${m.item} - ${m.name || ''}: ${m.quantity} ${m.uom || 'pcs'}`).join('\n') || 'None'}`);
      } else {
        await api.put(`/api/work-orders/${woId}`, { status: newStatus });
        if (newStatus === 'completed') {
          alert('Work order completed! Finished goods added to inventory.');
        }
      }
      fetchData();
    } catch (error) {
      console.error('Failed to update work order:', error);
      alert(error.response?.data?.detail || 'Failed to update work order');
    }
  };

  const openJobCard = (wo) => {
    setJobCardWO(wo);
    setIsJobCardOpen(true);
  };

  const handleOperationUpdate = async (woId, sequence, newStatus) => {
    try {
      const { data } = await api.put(`/api/work-orders/${woId}/operations/${sequence}`, {
        status: newStatus,
        quantity_completed: newStatus === 'completed' ? jobCardWO?.quantity : 0
      });
      setJobCardWO(data);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update operation');
    }
  };

  const handleEditWorkCenter = (wc) => {
    setEditingWorkCenter(wc);
    setWorkCenterForm({
      code: wc.code,
      name: wc.name,
      description: wc.description || '',
      hourly_rate: wc.hourly_rate || 0,
      capacity_per_hour: wc.capacity_per_hour || 1,
      status: wc.status || 'active',
    });
    setIsWorkCenterDialogOpen(true);
  };

  const addOperation = () => {
    setRoutingForm({
      ...routingForm,
      operations: [...routingForm.operations, {
        sequence: (routingForm.operations.length + 1) * 10,
        work_center_id: '',
        operation_name: '',
        description: '',
        setup_time_minutes: 0,
        run_time_minutes: 0,
      }],
    });
  };

  const removeOperation = (index) => {
    setRoutingForm({
      ...routingForm,
      operations: routingForm.operations.filter((_, i) => i !== index),
    });
  };

  const updateOperation = (index, field, value) => {
    const newOps = [...routingForm.operations];
    newOps[index] = { ...newOps[index], [field]: value };
    setRoutingForm({ ...routingForm, operations: newOps });
  };

  const resetWorkCenterForm = () => {
    setWorkCenterForm({
      code: '',
      name: '',
      description: '',
      hourly_rate: 0,
      capacity_per_hour: 1,
      status: 'active',
    });
  };

  const resetRoutingForm = () => {
    setRoutingForm({
      item_id: '',
      name: '',
      description: '',
      revision: 'A',
      status: 'active',
      operations: [],
    });
  };

  const resetWorkOrderForm = () => {
    setWorkOrderForm({
      production_order_id: '',
      routing_id: '',
      quantity: 1,
      scheduled_start: '',
      scheduled_end: '',
      notes: '',
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-[#03543F]" />;
      case 'in_progress': return <Play className="w-4 h-4 text-[#1E429F]" />;
      case 'pending': return <Clock className="w-4 h-4 text-[#723B13]" />;
      default: return <AlertCircle className="w-4 h-4 text-[#4B5563]" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-[#DEF7EC] text-[#03543F]';
      case 'in_progress': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'pending': return 'bg-[#FDF6B2] text-[#723B13]';
      case 'cancelled': return 'bg-[#FDE8E8] text-[#9B1C1C]';
      default: return 'bg-[#F3F4F6] text-[#4B5563]';
    }
  };

  const printWorkOrder = async (wo) => {
    try {
      const { data } = await api.get(`/api/work-orders/${wo.id}/print-data`);
      const company = data.company || {};
      const item = data.item || {};
      const consumed = data.consumed_materials || [];
      const ops = data.operations_status || [];
      const totalMaterialCost = consumed.reduce((s, m) => s + (m.quantity * (m.unit_cost || 0)), 0);

      const html = `<!DOCTYPE html><html><head><title>Work Order - ${data.wo_number}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #1D3557; padding-bottom: 10px; margin-bottom: 15px; }
        .header h1 { font-size: 16px; color: #1D3557; }
        .header p { font-size: 10px; color: #555; }
        .title { font-size: 14px; font-weight: bold; color: #1D3557; margin: 10px 0 5px; text-transform: uppercase; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 15px; }
        .info-box { border: 1px solid #ddd; padding: 6px 8px; }
        .info-box label { font-size: 9px; color: #888; text-transform: uppercase; display: block; }
        .info-box span { font-weight: 600; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th { background: #1D3557; color: white; padding: 5px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
        td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 11px; }
        tr:nth-child(even) { background: #f9f9f9; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .mono { font-family: 'Courier New', monospace; }
        .total-row { font-weight: bold; background: #f0f4f8 !important; }
        .footer { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; font-size: 10px; }
        .sign-box { border-top: 1px solid #333; padding-top: 4px; text-align: center; }
        @media print { body { padding: 10px; } }
      </style></head><body>
      <div class="header">
        <h1>${company.company_name || 'Manufacturing ERP'}</h1>
        ${company.address ? `<p>${company.address}</p>` : ''}
        ${company.gstin ? `<p>GSTIN: ${company.gstin}</p>` : ''}
      </div>
      <div class="title">Work Order: ${data.wo_number}</div>
      <div class="info-grid">
        <div class="info-box"><label>Item</label><span class="mono">${item.part_number || ''}</span> - ${item.name || ''}</div>
        <div class="info-box"><label>Quantity</label><span class="mono">${data.quantity || 0}</span></div>
        <div class="info-box"><label>Status</label><span>${(data.status || '').replace('_',' ').toUpperCase()}</span></div>
        <div class="info-box"><label>Scheduled Start</label><span>${data.scheduled_start ? new Date(data.scheduled_start).toLocaleDateString() : '-'}</span></div>
        <div class="info-box"><label>Scheduled End</label><span>${data.scheduled_end ? new Date(data.scheduled_end).toLocaleDateString() : '-'}</span></div>
        <div class="info-box"><label>Actual Start</label><span>${data.actual_start ? new Date(data.actual_start).toLocaleDateString() : '-'}</span></div>
      </div>
      ${ops.length > 0 ? `
      <div class="title">Operations</div>
      <table>
        <thead><tr><th>Seq</th><th>Operation</th><th>Work Center</th><th class="text-center">Status</th><th>Operator</th><th class="text-right">Time (min)</th></tr></thead>
        <tbody>${ops.map(op => `<tr>
          <td class="mono">${op.sequence}</td><td>${op.operation_name}</td><td>${op.work_center_name || '-'}</td>
          <td class="text-center">${(op.status || '').replace('_',' ')}</td><td>${op.operator || '-'}</td>
          <td class="text-right mono">${op.actual_time_min ? op.actual_time_min : '-'}</td>
        </tr>`).join('')}</tbody>
      </table>` : ''}
      ${consumed.length > 0 ? `
      <div class="title">Material Consumption</div>
      <table>
        <thead><tr><th>Part No.</th><th>Material</th><th class="text-right">Qty</th><th>UOM</th><th class="text-right">Unit Cost</th><th class="text-right">Total Cost</th></tr></thead>
        <tbody>${consumed.map(m => `<tr>
          <td class="mono">${m.item || ''}</td><td>${m.name || ''}</td>
          <td class="text-right mono">${m.quantity}</td><td>${m.uom || 'pcs'}</td>
          <td class="text-right mono">${(m.unit_cost || 0).toFixed(2)}</td>
          <td class="text-right mono">${(m.quantity * (m.unit_cost || 0)).toFixed(2)}</td>
        </tr>`).join('')}
        <tr class="total-row"><td colspan="5" class="text-right">Total Material Cost</td><td class="text-right mono">${totalMaterialCost.toFixed(2)}</td></tr>
        </tbody>
      </table>` : '<p style="color:#888;margin:10px 0;">No materials consumed yet.</p>'}
      ${data.notes ? `<div style="margin:10px 0;"><strong>Notes:</strong> ${data.notes}</div>` : ''}
      <div class="footer">
        <div><div class="sign-box">Prepared By</div></div>
        <div><div class="sign-box">Production Manager</div></div>
        <div><div class="sign-box">Quality Inspector</div></div>
      </div>
      <p style="text-align:center;font-size:9px;color:#aaa;margin-top:20px;">Printed on ${new Date().toLocaleString()}</p>
      </body></html>`;
      const w = window.open('', '_blank', 'width=800,height=600');
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    } catch (error) {
      alert('Failed to load print data');
    }
  };

  const printJobCard = async (wo) => {
    try {
      const { data } = await api.get(`/api/work-orders/${wo.id}/print-data`);
      const company = data.company || {};
      const item = data.item || {};
      const ops = data.operations_status || [];

      const html = `<!DOCTYPE html><html><head><title>Job Card - ${data.wo_number}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #1D3557; padding-bottom: 10px; margin-bottom: 15px; }
        .header h1 { font-size: 16px; color: #1D3557; }
        .header p { font-size: 10px; color: #555; }
        .title { font-size: 14px; font-weight: bold; color: #1D3557; margin: 10px 0 5px; text-transform: uppercase; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 15px; }
        .info-box { border: 1px solid #ddd; padding: 6px 8px; }
        .info-box label { font-size: 9px; color: #888; text-transform: uppercase; display: block; }
        .info-box span { font-weight: 600; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th { background: #1D3557; color: white; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
        td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 11px; }
        tr:nth-child(even) { background: #f9f9f9; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .mono { font-family: 'Courier New', monospace; }
        .status-done { color: #03543F; font-weight: 600; }
        .status-wip { color: #B45309; font-weight: 600; }
        .op-sign { height: 40px; border: 1px solid #ddd; }
        @media print { body { padding: 10px; } }
      </style></head><body>
      <div class="header">
        <h1>${company.company_name || 'Manufacturing ERP'}</h1>
        ${company.address ? `<p>${company.address}</p>` : ''}
      </div>
      <div class="title">Job Card: ${data.wo_number}</div>
      <div class="info-grid">
        <div class="info-box"><label>Item</label><span class="mono">${item.part_number || ''}</span> - ${item.name || ''}</div>
        <div class="info-box"><label>Quantity</label><span class="mono">${data.quantity || 0}</span></div>
        <div class="info-box"><label>Status</label><span>${(data.status || '').replace('_',' ').toUpperCase()}</span></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:40px">Seq</th><th>Operation</th><th>Work Center</th>
          <th>Operator</th><th class="text-center">Status</th>
          <th>Start</th><th>End</th><th class="text-right">Time (min)</th><th style="width:80px" class="text-center">Signature</th>
        </tr></thead>
        <tbody>${ops.map(op => `<tr>
          <td class="mono">${op.sequence}</td>
          <td style="font-weight:600">${op.operation_name}</td>
          <td>${op.work_center_name || '-'}</td>
          <td style="font-weight:600">${op.operator || '-'}</td>
          <td class="text-center ${op.status === 'completed' ? 'status-done' : op.status === 'in_progress' ? 'status-wip' : ''}">${(op.status || '').replace('_',' ')}</td>
          <td class="mono">${op.actual_start ? new Date(op.actual_start).toLocaleString() : '-'}</td>
          <td class="mono">${op.actual_end ? new Date(op.actual_end).toLocaleString() : '-'}</td>
          <td class="text-right mono">${op.actual_time_min ? op.actual_time_min : '-'}</td>
          <td class="op-sign"></td>
        </tr>`).join('')}</tbody>
      </table>
      ${data.notes ? `<div style="margin:10px 0;"><strong>Notes:</strong> ${data.notes}</div>` : ''}
      <div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:10px;">
        <div><div style="border-top:1px solid #333;padding-top:4px;text-align:center;">Production Supervisor</div></div>
        <div><div style="border-top:1px solid #333;padding-top:4px;text-align:center;">Quality Approved By</div></div>
      </div>
      <p style="text-align:center;font-size:9px;color:#aaa;margin-top:20px;">Printed on ${new Date().toLocaleString()}</p>
      </body></html>`;
      const w = window.open('', '_blank', 'width=800,height=600');
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    } catch (error) {
      alert('Failed to load print data');
    }
  };

  return (
    <div className="space-y-6" data-testid="manufacturing-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Manufacturing</h1>
          <p className="text-sm text-[#4B5563]">Work centers, routings, and work order tracking</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-[#F3F4F6] p-1 rounded-sm">
          <TabsTrigger 
            value="work-orders" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-work-orders"
          >
            Work Orders
          </TabsTrigger>
          <TabsTrigger 
            value="routings" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-routings"
          >
            Routings
          </TabsTrigger>
          <TabsTrigger 
            value="work-centers" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-work-centers"
          >
            Work Centers
          </TabsTrigger>
        </TabsList>

        {/* Work Orders Tab */}
        <TabsContent value="work-orders" className="mt-4">
          <div className="flex justify-end mb-4">
            {canEdit && (
              <Dialog open={isWorkOrderDialogOpen} onOpenChange={setIsWorkOrderDialogOpen}>
                <DialogTrigger asChild>
                  <button className="btn-primary flex items-center space-x-2" data-testid="create-work-order-btn">
                    <Plus className="w-4 h-4" />
                    <span>Create Work Order</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-[Chivo]">Create Work Order</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleWorkOrderSubmit} className="space-y-4 mt-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Production Order *</label>
                      <Select value={workOrderForm.production_order_id} onValueChange={(v) => setWorkOrderForm({ ...workOrderForm, production_order_id: v })}>
                        <SelectTrigger data-testid="wo-production-order-select">
                          <SelectValue placeholder="Select production order" />
                        </SelectTrigger>
                        <SelectContent>
                          {productionOrders.filter(po => po.status !== 'completed' && po.status !== 'cancelled').map((po) => (
                            <SelectItem key={po.id} value={po.id}>
                              {po.order_number} - {po.item?.name || 'Unknown'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Routing *</label>
                      <Select value={workOrderForm.routing_id} onValueChange={(v) => setWorkOrderForm({ ...workOrderForm, routing_id: v })}>
                        <SelectTrigger data-testid="wo-routing-select">
                          <SelectValue placeholder="Select routing" />
                        </SelectTrigger>
                        <SelectContent>
                          {routings.filter(r => r.status === 'active').map((routing) => (
                            <SelectItem key={routing.id} value={routing.id}>
                              {routing.item?.part_number} - {routing.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        value={workOrderForm.quantity}
                        onChange={(e) => setWorkOrderForm({ ...workOrderForm, quantity: parseInt(e.target.value) || 1 })}
                        className="input-field mono"
                        required
                        data-testid="wo-quantity-input"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Scheduled Start</label>
                        <input
                          type="datetime-local"
                          value={workOrderForm.scheduled_start}
                          onChange={(e) => setWorkOrderForm({ ...workOrderForm, scheduled_start: e.target.value })}
                          className="input-field"
                          data-testid="wo-start-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Scheduled End</label>
                        <input
                          type="datetime-local"
                          value={workOrderForm.scheduled_end}
                          onChange={(e) => setWorkOrderForm({ ...workOrderForm, scheduled_end: e.target.value })}
                          className="input-field"
                          data-testid="wo-end-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
                      <textarea
                        value={workOrderForm.notes}
                        onChange={(e) => setWorkOrderForm({ ...workOrderForm, notes: e.target.value })}
                        className="input-field"
                        rows={2}
                        placeholder="Work order notes..."
                        data-testid="wo-notes-input"
                      />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                      <button type="button" onClick={() => setIsWorkOrderDialogOpen(false)} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" data-testid="wo-save-btn">
                        Create Work Order
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : workOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <Settings2 className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No work orders found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="work-orders-table">
                  <thead>
                    <tr>
                      <th>WO Number</th>
                      <th>Product</th>
                      <th>Routing</th>
                      <th className="text-right">Qty</th>
                      <th>Materials</th>
                      <th>Status</th>
                      <th>Scheduled</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workOrders.map((wo) => (
                      <tr key={wo.id} className={wo.parent_wo_id ? 'bg-[#F9FAFB]' : ''} data-testid={`wo-row-${wo.id}`}>
                        <td className="mono font-medium">
                          {wo.parent_wo_id && <span className="text-[#9CA3AF] mr-1">└</span>}
                          {wo.wo_number}
                        </td>
                        <td>
                          <span className="mono text-sm">{wo.item?.part_number || '-'}</span>
                          <p className="text-xs text-[#4B5563]">{wo.item?.name || '-'}</p>
                        </td>
                        <td className="text-sm">{wo.routing?.name || '-'}</td>
                        <td className="text-right mono">
                          {wo.quantity_completed || 0}/{wo.quantity}
                        </td>
                        <td>
                          {wo.materials_consumed ? (
                            <div>
                              <span className="status-badge bg-[#DEF7EC] text-[#03543F] mb-1">Consumed</span>
                              {wo.consumed_materials?.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                  {wo.consumed_materials.map((m, mi) => (
                                    <div key={mi} className="text-xs text-[#4B5563]">
                                      <span className="mono font-medium">{m.item}</span>
                                      <span className="text-[#6B7280] ml-1">{m.name}</span>
                                      <span className="mono ml-1">{m.quantity} {m.uom || 'pcs'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="status-badge bg-[#F3F4F6] text-[#4B5563]">Pending</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center space-x-1">
                            {getStatusIcon(wo.status)}
                            <span className={`status-badge ${getStatusColor(wo.status)}`}>
                              {wo.status?.replace('_', ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="text-sm text-[#4B5563]">
                          {wo.scheduled_start ? new Date(wo.scheduled_start).toLocaleDateString() : '-'}
                        </td>
                        <td>
                          {canEdit && wo.status === 'pending' && (
                            <button
                              onClick={() => handleUpdateWorkOrderStatus(wo.id, 'in_progress')}
                              className="btn-secondary text-xs flex items-center space-x-1"
                              data-testid={`start-wo-${wo.id}`}
                            >
                              <Play className="w-3 h-3" />
                              <span>Start</span>
                            </button>
                          )}
                          {canEdit && wo.status === 'in_progress' && (
                            <button
                              onClick={() => handleUpdateWorkOrderStatus(wo.id, 'completed')}
                              className="btn-secondary text-xs flex items-center space-x-1"
                              data-testid={`complete-wo-${wo.id}`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Complete</span>
                            </button>
                          )}
                          {(wo.status === 'in_progress' || wo.status === 'pending') && wo.operations_status?.length > 0 && (
                            <button
                              onClick={() => openJobCard(wo)}
                              className="btn-secondary text-xs flex items-center space-x-1 ml-1"
                              data-testid={`jobcard-wo-${wo.id}`}
                            >
                              <ClipboardList className="w-3 h-3" />
                              <span>Job Card</span>
                            </button>
                          )}
                          {wo.status === 'completed' && (
                            <div className="flex items-center space-x-1">
                              <button onClick={() => printWorkOrder(wo)} className="btn-secondary text-xs flex items-center space-x-1" title="Print Work Order" data-testid={`print-wo-${wo.id}`}>
                                <Printer className="w-3 h-3" /><span>Print WO</span>
                              </button>
                              {wo.operations_status?.length > 0 && (
                                <button onClick={() => printJobCard(wo)} className="btn-secondary text-xs flex items-center space-x-1" title="Print Job Card" data-testid={`print-jobcard-${wo.id}`}>
                                  <Printer className="w-3 h-3" /><span>Job Card</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Routings Tab */}
        <TabsContent value="routings" className="mt-4">
          <div className="flex justify-end mb-4">
            {canEdit && (
              <Dialog open={isRoutingDialogOpen} onOpenChange={setIsRoutingDialogOpen}>
                <DialogTrigger asChild>
                  <button className="btn-primary flex items-center space-x-2" data-testid="create-routing-btn">
                    <Plus className="w-4 h-4" />
                    <span>Create Routing</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-[Chivo]">Create Routing</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleRoutingSubmit} className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Item *</label>
                        <Select value={routingForm.item_id} onValueChange={(v) => setRoutingForm({ ...routingForm, item_id: v })}>
                          <SelectTrigger data-testid="routing-item-select">
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            {items.filter(i => ['sub_assembly', 'finished_good'].includes(i.category)).map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.part_number} - {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Name *</label>
                        <input
                          type="text"
                          value={routingForm.name}
                          onChange={(e) => setRoutingForm({ ...routingForm, name: e.target.value })}
                          className="input-field"
                          placeholder="Product Assembly Routing"
                          required
                          data-testid="routing-name-input"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Revision</label>
                        <input
                          type="text"
                          value={routingForm.revision}
                          onChange={(e) => setRoutingForm({ ...routingForm, revision: e.target.value })}
                          className="input-field mono"
                          placeholder="A"
                          data-testid="routing-revision-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Status</label>
                        <Select value={routingForm.status} onValueChange={(v) => setRoutingForm({ ...routingForm, status: v })}>
                          <SelectTrigger data-testid="routing-status-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="obsolete">Obsolete</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Operations */}
                    <div className="border-t border-[#E5E7EB] pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-semibold text-[#111827]">Operations</label>
                        <button
                          type="button"
                          onClick={addOperation}
                          className="btn-secondary text-xs flex items-center space-x-1"
                          data-testid="add-operation-btn"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Operation</span>
                        </button>
                      </div>

                      {routingForm.operations.length === 0 ? (
                        <div className="text-center py-6 text-[#4B5563] bg-[#F3F4F6] rounded-sm">
                          <Settings2 className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" />
                          <p className="text-sm">No operations added yet</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {routingForm.operations.map((op, index) => (
                            <div key={index} className="p-3 bg-[#F3F4F6] rounded-sm space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Operation {op.sequence}</span>
                                <button
                                  type="button"
                                  onClick={() => removeOperation(index)}
                                  className="text-[#9B1C1C] text-xs"
                                >
                                  Remove
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Select value={op.work_center_id} onValueChange={(v) => updateOperation(index, 'work_center_id', v)}>
                                  <SelectTrigger className="bg-white">
                                    <SelectValue placeholder="Work Center" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {workCenters.map((wc) => (
                                      <SelectItem key={wc.id} value={wc.id}>{wc.code} - {wc.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <input
                                  type="text"
                                  value={op.operation_name}
                                  onChange={(e) => updateOperation(index, 'operation_name', e.target.value)}
                                  className="input-field bg-white"
                                  placeholder="Operation name"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={op.setup_time_minutes}
                                  onChange={(e) => updateOperation(index, 'setup_time_minutes', parseInt(e.target.value) || 0)}
                                  className="input-field bg-white mono"
                                  placeholder="Setup (min)"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  value={op.run_time_minutes}
                                  onChange={(e) => updateOperation(index, 'run_time_minutes', parseInt(e.target.value) || 0)}
                                  className="input-field bg-white mono"
                                  placeholder="Run time (min)"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                      <button type="button" onClick={() => setIsRoutingDialogOpen(false)} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" data-testid="routing-save-btn">
                        Create Routing
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : routings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <Settings2 className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No routings found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="routings-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Routing Name</th>
                      <th>Revision</th>
                      <th>Operations</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routings.map((routing) => (
                      <tr key={routing.id} data-testid={`routing-row-${routing.id}`}>
                        <td>
                          <span className="mono text-sm">{routing.item?.part_number || '-'}</span>
                          <p className="text-xs text-[#4B5563]">{routing.item?.name || '-'}</p>
                        </td>
                        <td className="font-medium">{routing.name}</td>
                        <td className="mono">{routing.revision}</td>
                        <td className="mono">{routing.operations?.length || 0}</td>
                        <td>
                          <span className={`status-badge status-${routing.status}`}>
                            {routing.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Work Centers Tab */}
        <TabsContent value="work-centers" className="mt-4">
          <div className="flex justify-end mb-4">
            {canEdit && (
              <Dialog open={isWorkCenterDialogOpen} onOpenChange={(open) => {
                setIsWorkCenterDialogOpen(open);
                if (!open) {
                  setEditingWorkCenter(null);
                  resetWorkCenterForm();
                }
              }}>
                <DialogTrigger asChild>
                  <button className="btn-primary flex items-center space-x-2" data-testid="add-work-center-btn">
                    <Plus className="w-4 h-4" />
                    <span>Add Work Center</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-[Chivo]">{editingWorkCenter ? 'Edit Work Center' : 'Add Work Center'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleWorkCenterSubmit} className="space-y-4 mt-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Code *</label>
                      <input
                        type="text"
                        value={workCenterForm.code}
                        onChange={(e) => setWorkCenterForm({ ...workCenterForm, code: e.target.value })}
                        className="input-field mono"
                        placeholder="WC-001"
                        required
                        disabled={!!editingWorkCenter}
                        data-testid="wc-code-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Name *</label>
                      <input
                        type="text"
                        value={workCenterForm.name}
                        onChange={(e) => setWorkCenterForm({ ...workCenterForm, name: e.target.value })}
                        className="input-field"
                        placeholder="Welding Bay"
                        required
                        data-testid="wc-name-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Description</label>
                      <textarea
                        value={workCenterForm.description}
                        onChange={(e) => setWorkCenterForm({ ...workCenterForm, description: e.target.value })}
                        className="input-field"
                        rows={2}
                        placeholder="Work center description..."
                        data-testid="wc-description-input"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Hourly Rate ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={workCenterForm.hourly_rate}
                          onChange={(e) => setWorkCenterForm({ ...workCenterForm, hourly_rate: parseFloat(e.target.value) || 0 })}
                          className="input-field mono"
                          data-testid="wc-rate-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Capacity/Hour</label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={workCenterForm.capacity_per_hour}
                          onChange={(e) => setWorkCenterForm({ ...workCenterForm, capacity_per_hour: parseFloat(e.target.value) || 1 })}
                          className="input-field mono"
                          data-testid="wc-capacity-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Status</label>
                      <Select value={workCenterForm.status} onValueChange={(v) => setWorkCenterForm({ ...workCenterForm, status: v })}>
                        <SelectTrigger data-testid="wc-status-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                      <button type="button" onClick={() => setIsWorkCenterDialogOpen(false)} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" data-testid="wc-save-btn">
                        {editingWorkCenter ? 'Update' : 'Add'} Work Center
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
            </div>
          ) : workCenters.length === 0 ? (
            <div className="card-flat flex flex-col items-center justify-center h-48 text-[#4B5563]">
              <Settings2 className="w-12 h-12 mb-2 text-[#9CA3AF]" />
              <p>No work centers found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workCenters.map((wc) => (
                <div key={wc.id} className="card-flat p-4" data-testid={`wc-card-${wc.code}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Settings2 className="w-5 h-5 text-[#457B9D]" />
                      <div>
                        <span className="mono text-xs text-[#4B5563]">{wc.code}</span>
                        <h3 className="text-lg font-semibold text-[#111827]">{wc.name}</h3>
                      </div>
                    </div>
                    <span className={`status-badge ${wc.status === 'active' ? 'status-active' : 'status-obsolete'}`}>
                      {wc.status}
                    </span>
                  </div>

                  {wc.description && (
                    <p className="text-sm text-[#4B5563] mb-3">{wc.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-[#F3F4F6] p-2 rounded-sm">
                      <p className="text-[#4B5563]">Hourly Rate</p>
                      <p className="mono font-medium">{formatCurrency(wc.hourly_rate || 0)}</p>
                    </div>
                    <div className="bg-[#F3F4F6] p-2 rounded-sm">
                      <p className="text-[#4B5563]">Capacity/Hr</p>
                      <p className="mono font-medium">{wc.capacity_per_hour || 1} units</p>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex justify-end mt-3 pt-3 border-t border-[#E5E7EB]">
                      <button
                        onClick={() => handleEditWorkCenter(wc)}
                        className="p-1 text-[#4B5563] hover:text-[#1D3557]"
                        data-testid={`edit-wc-${wc.code}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Job Card Dialog */}
      <Dialog open={isJobCardOpen} onOpenChange={(open) => { setIsJobCardOpen(open); if (!open) setJobCardWO(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center space-x-2">
              <ClipboardList className="w-5 h-5" />
              <span>Job Card - {jobCardWO?.wo_number}</span>
            </DialogTitle>
          </DialogHeader>
          {jobCardWO && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-[#4B5563]">Item: </span><span className="font-medium">{items.find(i => i.id === jobCardWO.item_id)?.part_number} - {items.find(i => i.id === jobCardWO.item_id)?.name}</span></div>
                <div><span className="text-[#4B5563]">Quantity: </span><span className="mono font-medium">{jobCardWO.quantity}</span></div>
                <div><span className="text-[#4B5563]">Status: </span><span className={`status-badge ${getStatusColor(jobCardWO.status)}`}>{jobCardWO.status?.replace('_', ' ')}</span></div>
              </div>

              <div className="border rounded-sm overflow-hidden" data-testid="job-card-operations">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#F3F4F6]">
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Seq</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Operation</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Work Center</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Status</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Operator</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Actual Time</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobCardWO.operations_status?.map((op, idx) => {
                      const wc = workCenters.find(w => w.id === op.work_center_id);
                      const prevCompleted = idx === 0 || jobCardWO.operations_status.slice(0, idx).every(p => p.status === 'completed');
                      return (
                        <tr key={op.sequence} className={`border-t ${op.status === 'in_progress' ? 'bg-[#FDF6B2]/30' : op.status === 'completed' ? 'bg-[#DEF7EC]/30' : ''}`} data-testid={`op-row-${op.sequence}`}>
                          <td className="py-3 px-3 mono font-medium">{op.sequence}</td>
                          <td className="py-3 px-3 font-medium">{op.operation_name}</td>
                          <td className="py-3 px-3 text-sm text-[#4B5563]">{wc?.name || '-'}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`status-badge ${
                              op.status === 'completed' ? 'bg-[#DEF7EC] text-[#03543F]' :
                              op.status === 'in_progress' ? 'bg-[#FDF6B2] text-[#723B13]' :
                              'bg-[#F3F4F6] text-[#4B5563]'
                            }`}>{op.status?.replace('_', ' ')}</span>
                          </td>
                          <td className="py-3 px-3 text-sm">{op.operator || '-'}</td>
                          <td className="py-3 px-3 text-right mono text-sm">{op.actual_time_min ? `${op.actual_time_min} min` : '-'}</td>
                          <td className="py-3 px-3 text-center">
                            {op.status === 'pending' && prevCompleted && canEdit && (
                              <button onClick={() => handleOperationUpdate(jobCardWO.id, op.sequence, 'in_progress')} className="btn-primary text-xs px-3 py-1" data-testid={`start-op-${op.sequence}`}>
                                <Play className="w-3 h-3 inline mr-1" />Start
                              </button>
                            )}
                            {op.status === 'in_progress' && canEdit && (
                              <button onClick={() => handleOperationUpdate(jobCardWO.id, op.sequence, 'completed')} className="btn-primary text-xs px-3 py-1 bg-[#03543F]" data-testid={`complete-op-${op.sequence}`}>
                                <CheckCircle2 className="w-3 h-3 inline mr-1" />Complete
                              </button>
                            )}
                            {op.status === 'completed' && (
                              <CheckCircle2 className="w-4 h-4 text-[#03543F] inline" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-[#4B5563] mb-1">
                  <span>Progress</span>
                  <span>{jobCardWO.operations_status?.filter(o => o.status === 'completed').length}/{jobCardWO.operations_status?.length} operations</span>
                </div>
                <div className="w-full bg-[#E5E7EB] rounded-full h-2.5">
                  <div
                    className="bg-[#1D3557] h-2.5 rounded-full transition-all"
                    style={{ width: `${(jobCardWO.operations_status?.filter(o => o.status === 'completed').length / (jobCardWO.operations_status?.length || 1)) * 100}%` }}
                    data-testid="job-card-progress"
                  ></div>
                </div>
              </div>

              {/* Print Buttons */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5E7EB]">
                <button onClick={() => printWorkOrder(jobCardWO)} className="btn-secondary text-xs flex items-center space-x-1" data-testid="print-wo-from-jobcard">
                  <Printer className="w-3 h-3" /><span>Print Work Order</span>
                </button>
                <button onClick={() => printJobCard(jobCardWO)} className="btn-primary text-xs flex items-center space-x-1" data-testid="print-jobcard-from-dialog">
                  <Printer className="w-3 h-3" /><span>Print Job Card</span>
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
