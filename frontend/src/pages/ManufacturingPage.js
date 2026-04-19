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
  Printer,
  Square,
  User,
  RotateCcw,
  XCircle,
  Truck,
  ChevronRight,
  Search,
  PackageCheck,
  PackageX
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
  const [woStatusFilter, setWoStatusFilter] = useState('');
  const [moSearch, setMoSearch] = useState('');
  
  // Operation start/stop dialog
  const [opDialog, setOpDialog] = useState({ open: false, mode: '', sequence: 0 });
  
  // MO Start result dialog (replaces browser alert)
  const [startResultDialog, setStartResultDialog] = useState({ open: false, success: null, data: null });
  const [opForm, setOpForm] = useState({ operator: '', quantity: 0, quality_result: 'accept', reject_qty: 0, rework_qty: 0, notes: '', is_outsource: false, outsource_supplier_id: '', outsource_charges: 0, process_cost_per_unit: 0, run_number: null });

  // Subcontract dialog
  const [subcontractDialog, setSubcontractDialog] = useState(false);
  const [subcontractWO, setSubcontractWO] = useState(null);
  const [subcontractSupplier, setSubcontractSupplier] = useState('');
  const [subcontractType, setSubcontractType] = useState('with_material');
  const [scResult, setScResult] = useState(null); // {order_number, message} after SC created
  
  // Bulk SC selection
  const [selectedMOs, setSelectedMOs] = useState({});
  const [bulkSCDialog, setBulkSCDialog] = useState(false);
  const [bulkSCSupplier, setBulkSCSupplier] = useState('');
  const [bulkSCType, setBulkSCType] = useState('with_material');
  
  const [workCenterForm, setWorkCenterForm] = useState({
    code: '',
    name: '',
    description: '',
    hourly_rate: 0,
    capacity_per_hour: 1,
    status: 'active',
  });
  
  const [routingForm, setRoutingForm] = useState({
    name: '',
    description: '',
    status: 'active',
  });
  
  const [workOrderForm, setWorkOrderForm] = useState({
    production_order_id: '',
    routing_id: '',
    quantity: 1,
    scheduled_start: '',
    scheduled_end: '',
    notes: '',
    is_subcontract: false,
    subcontract_supplier_id: '',
    subcontract_type: 'with_material',
  });

  const canEdit = ['admin', 'production_manager'].includes(user?.role);
  const [suppliers, setSuppliers] = useState([]);
  const [editingRouting, setEditingRouting] = useState(null);
  const [moTree, setMoTree] = useState(null);
  // Live clock tick for Duration column while a run is active
  const [, setClockTick] = useState(0);

  // Parse backend datetime strings as UTC. MongoDB/FastAPI sometimes return naive ISO
  // strings (no 'Z' suffix) which the browser would otherwise interpret as LOCAL time,
  // producing a bogus initial duration equal to the TZ offset (e.g. 330 min for IST).
  const parseUTC = (s) => {
    if (!s) return null;
    if (s instanceof Date) return s;
    const str = String(s);
    // Has timezone info already (Z or +HH:MM / -HH:MM at end)?
    if (/Z$|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
    // Naive datetime — assume UTC
    return new Date(str + 'Z');
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Refresh duration display every 5s when Job Card is open and an op is running
  useEffect(() => {
    if (!isJobCardOpen) return;
    const hasRunning = (jobCardWO?.operations_status || []).some(o => o.status === 'in_progress' && !o.is_job_work);
    if (!hasRunning) return;
    const timer = setInterval(() => setClockTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, [isJobCardOpen, jobCardWO]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [wcRes, routingsRes, woRes, poRes, itemsRes, supRes] = await Promise.all([
        api.get('/api/work-centers'),
        api.get('/api/routings'),
        api.get('/api/work-orders'),
        api.get('/api/production'),
        api.get('/api/items'),
        api.get('/api/suppliers'),
      ]);
      setWorkCenters(wcRes.data);
      setRoutings(routingsRes.data);
      setWorkOrders(woRes.data);
      setProductionOrders(poRes.data);
      setItems(itemsRes.data);
      setSuppliers(supRes.data);
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
      if (editingRouting) {
        await api.put(`/api/routings/${editingRouting.id}`, routingForm);
      } else {
        await api.post('/api/routings', routingForm);
      }
      setIsRoutingDialogOpen(false);
      setEditingRouting(null);
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
      
      if (data.is_sc_direct) {
        // SC Order created directly
        const scNum = data.sc_order?.order_number || '';
        alert(`${data.message}\n\nSubcontract Order: ${scNum}\nGo to Job Work page to manage.`);
      } else if (data.work_orders && data.work_orders.length > 0) {
        const woList = data.work_orders.map(wo => `- ${wo.wo_number}`).join('\n');
        alert(`${data.message}\n\nManufacturing Orders Created:\n${woList}`);
      } else {
        alert(data.message || 'Work order processing complete');
      }
      
      fetchData();
    } catch (error) {
      console.error('Failed to save work order:', error);
      alert(error.response?.data?.detail || 'Failed to save manufacturing order');
    }
  };

  const handleUpdateWorkOrderStatus = async (woId, newStatus) => {
    try {
      if (newStatus === 'in_progress') {
        const { data } = await api.post(`/api/work-orders/${woId}/start`);
        if (data.reserved_conflicts) {
          setStartResultDialog({ open: true, success: false, data: { type: 'reserved', message: data.message, conflicts: data.reserved_conflicts } });
          fetchData();
          return;
        }
        if (data.success === false) {
          const dtype = data.insufficient_materials?.length > 0 ? 'insufficient' : 'error';
          setStartResultDialog({ open: true, success: false, data: { type: dtype, message: data.message, materials: data.insufficient_materials || [] } });
          fetchData();
          return;
        }
        setStartResultDialog({ open: true, success: true, data: { message: data.message || 'Manufacturing order started!', consumed: data.consumed_materials } });
        fetchData();
      } else {
        await api.put(`/api/work-orders/${woId}`, { status: newStatus });
        fetchData();
        if (newStatus === 'completed') {
          alert('Manufacturing order completed! Finished goods added to inventory.');
        }
      }
    } catch (error) {
      console.error('Failed to update work order:', error);
      const detail = error.response?.data?.detail || error.response?.data?.message || 'Failed to update manufacturing order';
      setStartResultDialog({ open: true, success: false, data: { type: 'error', message: detail } });
    }
  };

  const handleReserveMaterials = async (woId, isReserved) => {
    try {
      if (isReserved) {
        await api.post(`/api/work-orders/${woId}/unreserve`);
        alert('Material reservation removed.');
      } else {
        const { data } = await api.post(`/api/work-orders/${woId}/reserve`);
        const lines = data.reserved_materials?.map(m => {
          let line = `- ${m.part_number}: need ${m.quantity} ${m.uom}`;
          if (m.shortfall_qty > 0) line += ` | Allocated: ${m.allocated_qty}, SHORTFALL: ${m.shortfall_qty}`;
          else line += ` | Fully allocated from stock`;
          return line;
        }).join('\n') || '';
        alert(`${data.message}\n\n${lines}`);
      }
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to reserve materials');
    }
  };

  const handleStartSC = async (woId) => {
    try {
      const { data } = await api.post(`/api/work-orders/${woId}/create-sc`);
      if (data.success) {
        setStartResultDialog({ open: true, success: true, data: { message: data.message } });
      } else {
        setStartResultDialog({ open: true, success: false, data: { type: 'error', message: data.message || 'Failed' } });
      }
      fetchData();
    } catch (error) {
      const msg = error.response?.data?.detail || error.response?.data?.message || 'Failed to create SC order';
      setStartResultDialog({ open: true, success: false, data: { type: 'error', message: msg } });
    }
  };

  const openJobCard = (wo) => {
    setJobCardWO(wo);
    setIsJobCardOpen(true);
    // Fetch MO tree
    api.get(`/api/work-orders/${wo.id}/tree`).then(res => setMoTree(res.data)).catch(() => setMoTree(null));
  };

  const openOpDialog = (mode, sequence, runContext = null) => {
    const op = jobCardWO?.operations_status?.find(o => o.sequence === sequence);
    const moQty = jobCardWO?.quantity || 0;
    const runs = op?.runs || [];
    const totalDone = runs.reduce((s, r) => s + (r.quantity_completed || 0), 0);
    // Allocated = completed (for ended runs) + planned (for still-open runs)
    const allocated = runs.reduce((s, r) => r.ended_at ? s + (r.quantity_completed || 0) : s + (r.quantity_planned || r.quantity_completed || 0), 0);
    const remaining = moQty - totalDone;
    const remainingToAllocate = Math.max(0, moQty - allocated);
    const isJW = op?.is_job_work || false;
    // For Start: default to remaining un-allocated qty so parallel operators can't overbook.
    // For Stop/Complete on a specific run: default to that run's planned qty.
    const defaultStartQty = remainingToAllocate > 0 ? remainingToAllocate : (remaining > 0 ? remaining : moQty);
    const runPlannedQty = runContext?.quantity_planned || runContext?.quantity_completed || (remaining > 0 ? remaining : moQty);
    setOpForm({
      operator: mode === 'start' ? '' : (runContext?.operator || op?.operator || ''),
      quantity: mode === 'start' ? defaultStartQty : runPlannedQty,
      quality_result: 'accept',
      reject_qty: 0,
      rework_qty: 0,
      notes: '',
      is_outsource: isJW,
      outsource_supplier_id: op?.job_work_supplier_id || '',
      outsource_charges: 0,
      work_center_id: op?._selected_wc || op?.work_center_id || '',
      process_cost_per_unit: op?.process_cost_per_unit || 0,
      run_number: runContext?.run_number || null,
    });
    setOpDialog({ open: true, mode, sequence });
  };

  const handleOpDialogSubmit = async () => {
    const { mode, sequence } = opDialog;
    const woId = jobCardWO?.id;
    if (!woId) return;
    try {
      let payload = {};
      if (mode === 'start') {
        if (opForm.is_outsource) {
          if (!opForm.outsource_supplier_id) { alert('Select a supplier for outsourcing'); return; }
          // Confirmation dialog for outsourcing
          const supplierName = suppliers.find(s => s.id === opForm.outsource_supplier_id)?.name || 'selected supplier';
          const opName = jobCardWO?.operations_status?.find(o => o.sequence === opDialog.sequence)?.operation_name || '';
          if (!window.confirm(`Confirm outsource operation "${opName}" to ${supplierName}?\n\nThis will create/update a Job Work order for this supplier.`)) return;
          payload = { status: 'in_progress', operator: suppliers.find(s => s.id === opForm.outsource_supplier_id)?.name || 'Outsourced', quantity_completed: opForm.quantity, notes: opForm.notes, is_outsource: true, outsource_supplier_id: opForm.outsource_supplier_id, outsource_charges: opForm.outsource_charges, work_center_id: opForm.work_center_id || '' };
        } else {
          if (!opForm.operator.trim()) { alert('Operator name is required'); return; }
          payload = { status: 'in_progress', operator: opForm.operator, quantity_completed: opForm.quantity, work_center_id: opForm.work_center_id || '', process_cost_per_unit: opForm.process_cost_per_unit || 0 };
        }
      } else if (mode === 'stop') {
        payload = { status: 'stopped', quantity_completed: opForm.quantity, quality_result: opForm.quality_result, reject_qty: opForm.reject_qty, rework_qty: opForm.rework_qty, notes: opForm.notes, operator: opForm.operator || undefined, run_number: opForm.run_number || undefined };
      } else if (mode === 'complete') {
        payload = { status: 'completed', quantity_completed: opForm.quantity, quality_result: opForm.quality_result, reject_qty: opForm.reject_qty, rework_qty: opForm.rework_qty, notes: opForm.notes, process_cost_per_unit: opForm.process_cost_per_unit || 0, operator: opForm.operator || undefined, run_number: opForm.run_number || undefined };
      }
      const { data } = await api.put(`/api/work-orders/${woId}/operations/${sequence}`, payload);
      setJobCardWO(data);
      setOpDialog({ open: false, mode: '', sequence: 0 });
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update operation');
    }
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

  const handleMarkSubcontract = (wo) => {
    setSubcontractWO(wo);
    setSubcontractSupplier('');
    setSubcontractType('with_material');
    setSubcontractDialog(true);
  };

  // Check if any child MO of the SC target has been processed (completed/in_progress)
  // Also check deeper: walk tree to find any descendant that's been processed
  // If so, "without_material" is not possible — must send materials (completed parts + RM for rest)
  const hasProcessedChild = (() => {
    if (!subcontractWO) return false;
    const checkDescendants = (parentId) => {
      const kids = workOrders.filter(w => w.parent_wo_id === parentId);
      for (const kid of kids) {
        if (['completed', 'in_progress'].includes(kid.status)) return true;
        if (checkDescendants(kid.id)) return true;
      }
      return false;
    };
    return checkDescendants(subcontractWO.id);
  })();

  const handleConfirmSubcontract = async () => {
    if (!subcontractSupplier) { alert('Select a subcontractor'); return; }
    try {
      // Step 1: Mark MO as subcontract
      await api.put(`/api/work-orders/${subcontractWO.id}`, {
        is_subcontract: true,
        subcontract_supplier_id: subcontractSupplier,
        subcontract_type: subcontractType
      });
      // Step 2: Auto-create SC order (bypass Start SC button)
      try {
        const { data } = await api.post(`/api/work-orders/${subcontractWO.id}/create-sc`);
        if (data.sc_order) {
          setScResult({ order_number: data.sc_order.order_number, message: data.message, lines: data.sc_order.lines || [] });
        }
      } catch (scErr) {
        console.warn('Auto SC creation:', scErr.response?.data?.detail || scErr.message);
        setSubcontractDialog(false);
      }
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const toggleMOSelect = (woId) => {
    setSelectedMOs(prev => {
      const next = { ...prev };
      if (next[woId]) delete next[woId];
      else next[woId] = true;
      return next;
    });
  };
  
  const selectedMOCount = Object.keys(selectedMOs).length;
  
  const handleBulkSC = async () => {
    if (!bulkSCSupplier) { alert('Select a subcontractor'); return; }
    const woIds = Object.keys(selectedMOs);
    try {
      const { data } = await api.post('/api/work-orders/bulk-subcontract', {
        wo_ids: woIds,
        supplier_id: bulkSCSupplier,
        subcontract_type: bulkSCType
      });
      setBulkSCDialog(false);
      setSelectedMOs({});
      alert(data.message);
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create bulk SC'); }
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
        is_job_work: false,
        job_work_supplier_id: '',
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
      status: 'active',
    });
  };

  const handleEditRouting = (routing) => {
    setEditingRouting(routing);
    setRoutingForm({
      name: routing.name,
      description: routing.description || '',
      status: routing.status || 'active',
    });
    setIsRoutingDialogOpen(true);
  };

  const resetWorkOrderForm = () => {
    setWorkOrderForm({
      production_order_id: '',
      routing_id: '',
      quantity: 1,
      scheduled_start: '',
      scheduled_end: '',
      notes: '',
      is_subcontract: false,
      subcontract_supplier_id: '',
      subcontract_type: 'with_material',
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
      case 'outsourced': return 'bg-[#E5E7EB] text-[#6B7280]';
      default: return 'bg-[#F3F4F6] text-[#4B5563]';
    }
  };

  const getWOProgress = (wo) => {
    if (wo.status === 'completed') return 100;
    if (wo.status === 'cancelled') return 0;
    const ops = wo.operations_status || [];
    if (ops.length === 0) {
      if (wo.status === 'in_progress') return 50;
      return 0;
    }
    const completed = ops.filter(op => op.status === 'completed').length;
    return Math.round((completed / ops.length) * 100);
  };

  const getProgressColor = (pct) => {
    if (pct >= 100) return '#03543F';
    if (pct >= 50) return '#1D3557';
    if (pct > 0) return '#E3A008';
    return '#D1D5DB';
  };

  const filteredWorkOrders = (woStatusFilter
    ? workOrders.filter(wo => wo.status === woStatusFilter)
    : workOrders).filter(wo => {
      if (!moSearch.trim()) return true;
      const q = moSearch.toLowerCase();
      return wo.wo_number?.toLowerCase().includes(q) || wo.item?.part_number?.toLowerCase().includes(q) || wo.item?.name?.toLowerCase().includes(q);
    });

  const printWorkOrder = async (wo) => {
    try {
      const { data } = await api.get(`/api/work-orders/${wo.id}/print-data`);
      const company = data.company || {};
      const item = data.item || {};
      const consumed = data.consumed_materials || [];
      const ops = data.operations_status || [];
      const childMos = data.child_mos || [];
      const totalMaterialCost = consumed.reduce((s, m) => s + (m.quantity * (m.unit_cost || 0)), 0);
      const sym = company.primary_currency === 'USD' ? '$' : '\u20B9';
      const companyAddr = [company.address, company.address_line2, company.city, company.state].filter(Boolean).join(', ') + (company.pin_code ? ` - ${company.pin_code}` : '');

      const html = `<!DOCTYPE html><html><head><title>Manufacturing Order - ${data.wo_number}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #1D3557; padding-bottom: 10px; margin-bottom: 15px; }
        .header .logo-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:3px; }
        .header .logo-row img { max-height:40px; max-width:100px; object-fit:contain; }
        .header h1 { font-size: 16px; color: #1D3557; margin:0; }
        .header .tagline { font-size:9px; color:#888; font-style:italic; }
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
        <div class="logo-row">${company.logo_data ? `<img src="${company.logo_data}" alt="Logo" />` : ''}<h1>${company.company_name || 'Manufacturing ERP'}</h1></div>
        ${company.tagline ? `<div class="tagline">${company.tagline}</div>` : ''}
        ${companyAddr ? `<p>${companyAddr}</p>` : ''}
        ${company.gstin ? `<p>GSTIN: ${company.gstin}</p>` : ''}
      </div>
      <div class="title">Manufacturing Order: ${data.wo_number}</div>
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
        <thead><tr><th>Seq</th><th>Operation</th><th>Work Center</th><th class="text-center">Status</th><th>Operator</th><th class="text-right">Qty Done</th><th class="text-right">Accept/Rej</th><th class="text-right">Time (min)</th></tr></thead>
        <tbody>${ops.map(op => {
          const runs = op.runs || [];
          const operators = runs.map(r => r.operator).filter(Boolean).join(', ') || op.operator || '-';
          const qtyDone = op.quantity_completed || 0;
          const accepted = op.quantity_accepted || qtyDone;
          const rejected = op.quantity_rejected || 0;
          return `<tr>
          <td class="mono">${op.sequence}</td><td>${op.operation_name}</td><td>${op.work_center_name || '-'}</td>
          <td class="text-center">${(op.status || '').replace('_',' ')}</td><td>${operators}</td>
          <td class="text-right mono">${qtyDone}</td>
          <td class="text-right mono">${accepted}/${rejected > 0 ? rejected + 'R' : '-'}</td>
          <td class="text-right mono">${op.actual_time_min ? op.actual_time_min : '-'}</td>
        </tr>`;}).join('')}</tbody>
      </table>` : ''}
      ${consumed.length > 0 ? `
      <div class="title">Material Consumption</div>
      <table>
        <thead><tr><th>Part No.</th><th>Material</th><th class="text-right">Qty</th><th>UOM</th><th class="text-right">Unit Cost</th><th class="text-right">Total Cost</th></tr></thead>
        <tbody>${consumed.map(m => `<tr>
          <td class="mono">${m.item || ''}</td><td>${m.name || ''}</td>
          <td class="text-right mono">${m.quantity}</td><td>${m.uom || 'pcs'}</td>
          <td class="text-right mono">${sym}${(m.unit_cost || 0).toFixed(2)}</td>
          <td class="text-right mono">${sym}${(m.quantity * (m.unit_cost || 0)).toFixed(2)}</td>
        </tr>`).join('')}
        <tr class="total-row"><td colspan="5" class="text-right">Total Material Cost</td><td class="text-right mono">${sym}${totalMaterialCost.toFixed(2)}</td></tr>
        </tbody>
      </table>` : '<p style="color:#888;margin:10px 0;">No materials consumed yet.</p>'}
      ${childMos.length > 0 ? `
      <div class="title">Sub-Assembly Manufacturing Orders</div>
      <table>
        <thead><tr><th>MO Number</th><th>Part No.</th><th>Item Name</th><th class="text-right">Quantity</th><th class="text-center">Status</th></tr></thead>
        <tbody>${childMos.map(c => `<tr>
          <td class="mono">${c.wo_number || ''}</td>
          <td class="mono">${c.item?.part_number || '-'}</td>
          <td>${c.item?.name || '-'}</td>
          <td class="text-right mono">${c.quantity || 0}</td>
          <td class="text-center">${(c.status || '').replace('_',' ')}</td>
        </tr>`).join('')}
        </tbody>
      </table>` : ''}
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

      const fmtDt = (iso) => {
        if (!iso) return '-';
        const d = parseUTC(iso);
        if (!d || isNaN(d.getTime())) return '-';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yy}<br/>${hh}:${mi}`;
      };

      // Build rows: one row per operator-run; if no runs, single placeholder row.
      // First run in each op renders SL No / Operation / Work Center cells with rowSpan.
      const rowsHtml = ops.map((op, opIdx) => {
        const opName = typeof op.operation_name === 'object' && op.operation_name !== null ? (op.operation_name.name || '') : (op.operation_name || '-');
        const wcName = op.work_center_name || op.work_center?.name || '-';
        const hourly = (op.work_center && op.work_center.hourly_rate) || 0;
        const runs = op.runs || [];
        if (runs.length === 0) {
          return `<tr>
            <td class="center">${opIdx + 1}</td>
            <td>${item.part_number || ''}${item.part_number ? ', ' : ''}${item.name || ''}<br/><span class="op-name">${opName}</span></td>
            <td>${wcName}</td>
            <td>-</td>
            <td class="center mono">-</td>
            <td class="center mono">-</td>
            <td class="center mono">-</td>
            <td class="center mono">-</td>
            <td class="right mono">-</td>
            <td class="sig"></td>
          </tr>`;
        }
        return runs.map((r, ri) => {
          const s = r?.started_at || r?.actual_start;
          const e = r?.ended_at || r?.actual_end;
          const ds = parseUTC(s);
          const de = parseUTC(e);
          let mins = 0;
          if (ds && de) {
            mins = Math.max(0, (de.getTime() - ds.getTime()) / 60000);
          }
          const cost = (mins / 60) * hourly;
          const startStr = s ? fmtDt(s) : '-';
          const endStr = e ? fmtDt(e) : (s ? '(running)' : '-');
          return `<tr>
            ${ri === 0 ? `<td class="center" rowspan="${runs.length}">${opIdx + 1}</td>` : ''}
            ${ri === 0 ? `<td rowspan="${runs.length}">${item.part_number || ''}${item.part_number ? ', ' : ''}${item.name || ''}<br/><span class="op-name">${opName}</span></td>` : ''}
            ${ri === 0 ? `<td rowspan="${runs.length}">${wcName}</td>` : ''}
            <td>${r.operator || '-'}</td>
            <td class="center mono">${r.quantity_completed || 0} PCS</td>
            <td class="center mono">${startStr}</td>
            <td class="center mono">${endStr}</td>
            <td class="center mono">${mins ? mins.toFixed(0) : '-'}</td>
            <td class="right mono">${cost ? cost.toFixed(2) : '-'}</td>
            <td class="sig"></td>
          </tr>`;
        }).join('');
      }).join('');

      const html = `<!DOCTYPE html><html><head><title>Job Card - ${data.wo_number}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #1D3557; padding-bottom: 10px; margin-bottom: 10px; }
        .header h1 { font-size: 16px; color: #1D3557; }
        .header p { font-size: 10px; color: #555; }
        .title { font-size: 13px; font-weight: bold; text-align:center; margin: 10px 0; }
        .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; font-size: 11px; }
        .meta-box { border: 1px solid #ccc; padding: 6px 8px; }
        .meta-box label { font-size: 9px; color: #888; text-transform: uppercase; display: block; }
        .meta-box span { font-weight: 600; font-size: 11px; }
        table.jc { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
        table.jc th, table.jc td { border: 1px solid #333; padding: 6px 5px; vertical-align: middle; font-size: 11px; word-wrap: break-word; }
        table.jc th { background: #F3F4F6; text-align: center; font-weight: 700; font-size: 11px; }
        table.jc td.center { text-align: center; }
        table.jc td.right { text-align: right; }
        table.jc .mono { font-family: 'Courier New', monospace; }
        table.jc .op-name { font-weight: 600; color: #1D3557; font-size: 10.5px; }
        table.jc .sig { height: 32px; }
        /* Alternating zebra shading per op group is visual-only; keeping simple */
        @media print { body { padding: 10px; } }
      </style></head><body>
      <div class="header">
        <h1>${company.company_name || 'Manufacturing ERP'}</h1>
        ${company.address ? `<p>${company.address}</p>` : ''}
      </div>
      <div class="title">Job Card Printing</div>
      <div class="meta-grid">
        <div class="meta-box"><label>MO Number</label><span class="mono">${data.wo_number}</span></div>
        <div class="meta-box"><label>Item</label><span class="mono">${item.part_number || ''}</span> - ${item.name || ''}</div>
        <div class="meta-box"><label>Quantity</label><span class="mono">${data.quantity || 0}</span></div>
      </div>
      <table class="jc">
        <thead><tr>
          <th style="width:5%">SL. No.</th>
          <th style="width:14%">Operation</th>
          <th style="width:11%">Work Center</th>
          <th style="width:10%">Operator</th>
          <th style="width:9%">Qty produced</th>
          <th style="width:11%">Start</th>
          <th style="width:11%">Stop</th>
          <th style="width:8%">Duration (Min)</th>
          <th style="width:9%">Cost</th>
          <th style="width:12%">Signature</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${data.notes ? `<div style="margin:12px 0;font-size:11px;"><strong>Notes:</strong> ${data.notes}</div>` : ''}
      <div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:10px;">
        <div><div style="border-top:1px solid #333;padding-top:4px;text-align:center;">Production Supervisor</div></div>
        <div><div style="border-top:1px solid #333;padding-top:4px;text-align:center;">Quality Approved By</div></div>
      </div>
      <p style="text-align:center;font-size:9px;color:#aaa;margin-top:20px;">Printed on ${new Date().toLocaleString()}</p>
      </body></html>`;
      const w = window.open('', '_blank', 'width=900,height=700');
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
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Manufacturing Orders</h1>
          <p className="text-sm text-[#4B5563]">Work centers, routings, and manufacturing order tracking</p>
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
            Manufacturing Orders
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Select value={woStatusFilter || 'all'} onValueChange={(v) => setWoStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-48" data-testid="wo-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {woStatusFilter && (
                <button onClick={() => setWoStatusFilter('')} className="text-xs text-[#4B5563] hover:text-[#1D3557] flex items-center gap-1" data-testid="wo-clear-filter">
                  <span>Clear</span>
                </button>
              )}
              <span className="text-xs text-[#6B7280]">{filteredWorkOrders.length} of {workOrders.length} orders</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                <input type="text" value={moSearch} onChange={(e) => setMoSearch(e.target.value)} placeholder="Search MO, item..." className="input-field pl-9 text-sm" data-testid="mo-search-input" />
              </div>
            {canEdit && (
              <Dialog open={isWorkOrderDialogOpen} onOpenChange={setIsWorkOrderDialogOpen}>
                <DialogTrigger asChild>
                  <button className="btn-primary flex items-center space-x-2" data-testid="create-work-order-btn">
                    <Plus className="w-4 h-4" />
                    <span>Create Manufacturing Order</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-[Chivo]">Create Manufacturing Order</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleWorkOrderSubmit} className="space-y-4 mt-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Sales Order *</label>
                      {(() => {
                        const filteredSOs = productionOrders
                          .filter(po => ['confirmed', 'planned'].includes(po.status))
                          .filter(po => {
                            const q = (workOrderForm.so_search || '').trim().toLowerCase();
                            if (!q) return true;
                            const code = (po.item?.part_number || '').toLowerCase();
                            const name = (po.item?.name || '').toLowerCase();
                            const order = (po.order_number || '').toLowerCase();
                            return code.includes(q) || name.includes(q) || order.includes(q);
                          });
                        const selected = productionOrders.find(po => po.id === workOrderForm.production_order_id);
                        return (
                          <>
                            {selected && (
                              <div className="flex items-center justify-between bg-[#F0FDF4] border border-[#03543F] rounded-sm px-3 py-2 mb-2" data-testid="wo-so-selected">
                                <div className="text-xs">
                                  <span className="mono font-semibold">{selected.order_number}</span>
                                  <span className="mx-2">—</span>
                                  <span className="mono">{selected.item?.part_number || '-'}</span>
                                  <span className="ml-1">{selected.item?.name}</span>
                                </div>
                                <button type="button" className="text-xs text-[#9B1C1C] hover:underline" onClick={() => setWorkOrderForm({ ...workOrderForm, production_order_id: '', so_search: '', quantity: 1 })} data-testid="wo-so-clear">Clear</button>
                              </div>
                            )}
                            {!selected && (
                              <>
                                <input
                                  type="text"
                                  placeholder="Search by SO#, part number or item name..."
                                  value={workOrderForm.so_search || ''}
                                  onChange={(e) => setWorkOrderForm({ ...workOrderForm, so_search: e.target.value })}
                                  className="input-field"
                                  data-testid="wo-so-search"
                                  autoFocus
                                />
                                <div className="mt-1 border border-[#E5E7EB] rounded-sm max-h-56 overflow-auto bg-white" data-testid="wo-so-list">
                                  {filteredSOs.length === 0 && (
                                    <div className="px-3 py-4 text-center text-xs text-[#6B7280]">No matching sales orders. Try a different search.</div>
                                  )}
                                  {filteredSOs.map(po => {
                                    const balance = po.quantity - (po.mo_qty_created || 0);
                                    const disabled = balance <= 0;
                                    return (
                                      <button
                                        key={po.id}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => {
                                          const soQty = po.quantity || 1;
                                          const balanceQty = Math.max(soQty - (po.mo_qty_created || 0), 1);
                                          setWorkOrderForm({ ...workOrderForm, production_order_id: po.id, quantity: balanceQty, so_search: '' });
                                        }}
                                        data-testid={`wo-so-option-${po.id}`}
                                        className={`w-full text-left px-3 py-2 text-xs border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB] ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        <span className="mono font-semibold">{po.order_number}</span>
                                        <span className="mx-2">—</span>
                                        <span className="mono">{po.item?.part_number || '-'}</span>
                                        <span className="ml-1">{po.item?.name || 'Unknown'}</span>
                                        <span className="ml-2 text-[#6B7280]">Qty: {po.quantity}{balance < po.quantity ? ` · Balance: ${balance}` : ''}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Quantity *</label>
                      {(() => {
                        const selectedSO = productionOrders.find(po => po.id === workOrderForm.production_order_id);
                        const soQty = selectedSO?.quantity || 0;
                        const moQtyCreated = selectedSO?.mo_qty_created || 0;
                        const balanceQty = Math.max(soQty - moQtyCreated, 0);
                        return (
                          <>
                            <input
                              type="number"
                              min="1"
                              max={balanceQty > 0 ? balanceQty : undefined}
                              value={workOrderForm.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                setWorkOrderForm({ ...workOrderForm, quantity: balanceQty > 0 ? Math.min(val, balanceQty) : val });
                              }}
                              className="input-field mono"
                              required
                              data-testid="wo-quantity-input"
                            />
                            {selectedSO && moQtyCreated > 0 && (
                              <p className="text-xs text-[#723B13] mt-1">SO Qty: {soQty} | Already in MO: {moQtyCreated} | Balance: {balanceQty}</p>
                            )}
                          </>
                        );
                      })()}
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
                        Create Manufacturing Order
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            </div>
          </div>

          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : filteredWorkOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <Settings2 className="w-12 h-12 mb-2 text-[#9CA3AF]" />
              <span>{woStatusFilter ? `No ${woStatusFilter.replace('_',' ')} manufacturing orders` : 'No manufacturing orders found'}</span>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {(() => {
                  const parentMOs = filteredWorkOrders.filter(wo => !wo.parent_wo_id);
                  const childOnlyMOs = filteredWorkOrders.filter(wo => wo.parent_wo_id && !parentMOs.some(p => p.id === wo.parent_wo_id));
                  const getChildMOs = (pid) => workOrders.filter(wo => wo.parent_wo_id === pid);
                  const getCatLabel = (wo) => { const cat = wo.item?.category || items.find(i => i.id === wo.item_id)?.category; return cat === 'finished_good' ? 'FG' : cat === 'sub_assembly' ? 'SA' : 'PART'; };
                  const getCatColor = (wo) => { const cat = wo.item?.category || items.find(i => i.id === wo.item_id)?.category; return cat === 'finished_good' ? '#1D3557' : cat === 'sub_assembly' ? '#1E429F' : '#723B13'; };

                  const renderMORow = (wo, depth = 0) => {
                    const progress = getWOProgress(wo);
                    const progressColor = getProgressColor(progress);
                    const ops = wo.operations_status || [];
                    const completedOps = ops.filter(op => op.status === 'completed').length;
                    const children = getChildMOs(wo.id);
                    // Check if ANY ancestor MO is reserved — hide reserve on all descendants
                    const ancestorIsReserved = (() => {
                      let current = wo;
                      while (current.parent_wo_id) {
                        const parent = workOrders.find(w => w.id === current.parent_wo_id);
                        if (!parent) break;
                        if (parent.materials_reserved) return true;
                        current = parent;
                      }
                      return false;
                    })();
                    // Check if ANY child MO is actively started (inhouse or outsourced) — hide SC on parent
                    const hasActiveChild = (() => {
                      const checkChildren = (parentId) => {
                        const kids = workOrders.filter(w => w.parent_wo_id === parentId);
                        for (const kid of kids) {
                          // Skip children outsourced by parent SC — they're covered
                          if (kid.outsourced_by_parent) continue;
                          if (['in_progress', 'outsourced'].includes(kid.status)) return true;
                          if (kid.is_subcontract && !['pending', 'completed', 'cancelled'].includes(kid.status)) return true;
                          if (checkChildren(kid.id)) return true;
                        }
                        return false;
                      };
                      return checkChildren(wo.id);
                    })();
                    // Check if ALL children are completed (for allowing SC after children are done)
                    const allChildrenCompleted = (() => {
                      const kids = workOrders.filter(w => w.parent_wo_id === wo.id);
                      if (kids.length === 0) return true;
                      return kids.every(k => k.status === 'completed' || k.status === 'cancelled');
                    })();
                    const canShowSC = canEdit && !wo.is_subcontract && ['pending', 'in_progress'].includes(wo.status) && !hasActiveChild;
                    const showReserve = canEdit && wo.status === 'pending' && !wo.materials_reserved && !ancestorIsReserved;
                    const showUnreserve = canEdit && wo.status === 'pending' && wo.materials_reserved && !ancestorIsReserved;
                    return (
                      <React.Fragment key={wo.id}>
                        <tr className={`${depth > 0 ? 'bg-[#F9FAFB]' : ''}`} data-testid={`wo-row-${wo.id}`}>
                          <td style={{ paddingLeft: `${12 + depth * 24}px` }}>
                            {depth > 0 && <span className="text-[#1D3557] mr-1">└→</span>}
                            <span className="mono font-medium">{wo.wo_number}</span>
                            <span className="ml-1 text-[10px] px-1 py-0.5 rounded font-semibold text-white" style={{backgroundColor: getCatColor(wo)}}>{getCatLabel(wo)}</span>
                          </td>
                          <td><span className="mono text-sm">{wo.item?.part_number || '-'}</span><p className="text-xs text-[#4B5563]">{wo.item?.name || '-'}</p></td>
                          <td className="text-sm">{wo.routing?.name || '-'}</td>
                          <td className="text-right mono">{wo.quantity_completed || 0}/{wo.quantity}</td>
                          <td style={{minWidth:'110px'}}>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-[#E5E7EB] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{width:`${progress}%`, backgroundColor: progressColor}} /></div>
                              <span className="text-xs mono w-7 text-right" style={{color:progressColor}}>{progress}%</span>
                            </div>
                            {ops.length > 0 && <p className="text-[10px] text-[#6B7280]">{completedOps}/{ops.length} ops</p>}
                          </td>
                          <td>
                            <span className={`status-badge ${getStatusColor(wo.status)}`}>{wo.status?.replace('_',' ')}</span>
                            {wo.is_subcontract && <span className="ml-1 text-[10px] bg-[#FDF6B2] text-[#723B13] px-1 rounded">SC{wo.subcontract_type === 'without_material' ? ' (No RM)' : ''}</span>}
                            {wo.materials_reserved && (
                              wo.reservation_shortfall > 0 
                                ? <span className="ml-1 text-[10px] bg-[#FDE8E8] text-[#9B1C1C] px-1 rounded">Reserved (Shortfall)</span>
                                : <span className="ml-1 text-[10px] bg-[#DEF7EC] text-[#03543F] px-1 rounded">Reserved</span>
                            )}
                            {wo.outsourced_by_parent && <span className="ml-1 text-[10px] bg-[#E5E7EB] text-[#6B7280] px-1 rounded">via {wo.outsourced_sc_order}</span>}
                          </td>
                          <td>
                            {wo.status === 'outsourced' ? (
                              <span className="text-xs text-[#6B7280]">Covered by parent SC</span>
                            ) : (
                            <div className="flex items-center flex-wrap gap-1">
                              {showReserve && (
                                <button onClick={() => handleReserveMaterials(wo.id, false)} className="btn-secondary text-xs px-2 py-1 text-[#03543F] border-[#03543F]" data-testid={`reserve-wo-${wo.id}`}><PackageCheck className="w-3 h-3 inline mr-0.5" />Reserve</button>
                              )}
                              {showUnreserve && (
                                <button onClick={() => handleReserveMaterials(wo.id, true)} className="btn-secondary text-xs px-2 py-1 text-[#9B1C1C] border-[#9B1C1C]" data-testid={`unreserve-wo-${wo.id}`}><PackageX className="w-3 h-3 inline mr-0.5" />Unreserve</button>
                              )}
                              {canEdit && wo.status === 'pending' && !wo.is_subcontract && <button onClick={() => handleUpdateWorkOrderStatus(wo.id, 'in_progress')} className="btn-secondary text-xs px-2 py-1" data-testid={`start-wo-${wo.id}`}><Play className="w-3 h-3 inline mr-0.5" />Inhouse Start</button>}
                              {canEdit && wo.status === 'pending' && wo.is_subcontract && <button onClick={() => handleStartSC(wo.id)} className="btn-primary text-xs px-2 py-1" data-testid={`start-wo-${wo.id}`}><Play className="w-3 h-3 inline mr-0.5" />Start SC</button>}
                              {canEdit && wo.status === 'in_progress' && wo.is_subcontract && <span className="text-xs px-2 py-1 rounded bg-[#E5E7EB] text-[#6B7280] font-medium" data-testid={`sc-done-${wo.id}`}><CheckCircle2 className="w-3 h-3 inline mr-0.5" />SC Done</span>}
                              {canEdit && wo.status === 'in_progress' && !wo.is_subcontract && ops.length === 0 && <button onClick={() => handleUpdateWorkOrderStatus(wo.id, 'completed')} className="btn-secondary text-xs px-2 py-1" data-testid={`complete-wo-${wo.id}`}><CheckCircle2 className="w-3 h-3 inline mr-0.5" />Complete</button>}
                              {/* Child MOs (SG / Sub-assembly / child items) skip Job Card tracking — direct Complete MO */}
                              {canEdit && wo.status === 'in_progress' && !wo.is_subcontract && ops.length > 0 && wo.parent_wo_id && <button onClick={() => handleUpdateWorkOrderStatus(wo.id, 'completed')} className="btn-primary text-xs px-2 py-1 bg-[#03543F] hover:bg-[#024733]" data-testid={`complete-child-mo-${wo.id}`}><CheckCircle2 className="w-3 h-3 inline mr-0.5" />Complete MO</button>}
                              {wo.status === 'in_progress' && ops.length > 0 && !wo.is_subcontract && !wo.parent_wo_id && <button onClick={() => openJobCard(wo)} className="btn-secondary text-xs px-2 py-1" data-testid={`jobcard-wo-${wo.id}`}><ClipboardList className="w-3 h-3 inline mr-0.5" />Job Card</button>}
                              {canShowSC && wo.status !== 'in_progress' && <button onClick={() => handleMarkSubcontract(wo)} className="btn-secondary text-xs px-2 py-1 text-[#723B13] border-[#723B13]" data-testid={`subcontract-wo-${wo.id}`}><Truck className="w-3 h-3 inline mr-0.5" />SC</button>}
                              {wo.status === 'completed' && <button onClick={() => printWorkOrder(wo)} className="btn-secondary text-xs px-2 py-1" data-testid={`print-wo-${wo.id}`}><Printer className="w-3 h-3 inline mr-0.5" />Print</button>}
                            </div>
                            )}
                          </td>
                        </tr>
                        {children.map(c => renderMORow(c, depth + 1))}
                      </React.Fragment>
                    );
                  };

                  return (
                    <>
                    {[...parentMOs, ...childOnlyMOs].map(parentMO => {
                    const parentItem = parentMO.item || items.find(i => i.id === parentMO.item_id);
                    const children = getChildMOs(parentMO.id);
                    const catColor = getCatColor(parentMO);
                    return (
                      <details key={parentMO.id} open className="border rounded-sm overflow-hidden">
                        <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer bg-[#F3F4F6] hover:bg-[#E5E7EB] select-none" style={{borderLeft: `4px solid ${catColor}`}}>
                          <ChevronRight className="w-4 h-4 text-[#4B5563]" />
                          <span className="mono font-bold text-sm" style={{color: catColor}}>{parentMO.wo_number}</span>
                          {parentMO.production_order?.order_number && <span className="text-[10px] bg-[#E1EFFE] text-[#1E429F] px-1.5 py-0.5 rounded font-medium mono" data-testid={`so-ref-${parentMO.id}`}>SO: {parentMO.production_order.order_number}</span>}
                          <span className="text-sm font-medium text-[#374151]">{parentItem?.part_number} - {parentItem?.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded text-white font-semibold" style={{backgroundColor: catColor}}>{getCatLabel(parentMO)}</span>
                          <span className={`text-[10px] px-1 rounded ${parentMO.status === 'completed' ? 'bg-[#DEF7EC] text-[#03543F]' : parentMO.status === 'in_progress' ? 'bg-[#E1EFFE] text-[#1E429F]' : 'bg-[#FDF6B2] text-[#723B13]'}`}>{parentMO.status?.replace('_',' ')}</span>
                          {parentMO.is_subcontract && <span className="text-[10px] bg-[#FDF6B2] text-[#723B13] px-1 rounded">Sub-Contract</span>}
                          <span className="text-xs text-[#6B7280] ml-auto">{1 + children.length} MO(s)</span>
                        </summary>
                        <div className="overflow-x-auto">
                          <table className="w-full data-table"><thead><tr><th>MO / Level</th><th>Item</th><th>Routing</th><th className="text-right">Qty</th><th>Progress</th><th>Status</th><th>Actions</th></tr></thead>
                          <tbody>{renderMORow(parentMO, 0)}</tbody></table>
                        </div>
                      </details>
                    );
                  })}
                  </>
                  );
                })()}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Routings Tab — Simplified: just operation type names */}
        <TabsContent value="routings" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[#6B7280]">Define standard operation types. Operations are assigned to items in BOM.</p>
            {canEdit && (
              <Dialog open={isRoutingDialogOpen} onOpenChange={setIsRoutingDialogOpen}>
                <DialogTrigger asChild>
                  <button className="btn-primary flex items-center space-x-2" data-testid="create-routing-btn" onClick={() => { resetRoutingForm(); setEditingRouting(null); }}>
                    <Plus className="w-4 h-4" />
                    <span>Add Operation Type</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-[Chivo]">{editingRouting ? 'Edit Operation Type' : 'Add Operation Type'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleRoutingSubmit} className="space-y-4 mt-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Operation Name *</label>
                      <input type="text" value={routingForm.name} onChange={(e) => setRoutingForm({ ...routingForm, name: e.target.value })} className="input-field" placeholder="e.g., LC Cutting, Welding, Assembly" required data-testid="routing-name-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Description</label>
                      <input type="text" value={routingForm.description} onChange={(e) => setRoutingForm({ ...routingForm, description: e.target.value })} className="input-field" placeholder="Optional description" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Status</label>
                      <Select value={routingForm.status} onValueChange={(v) => setRoutingForm({ ...routingForm, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                      <button type="button" onClick={() => { setIsRoutingDialogOpen(false); setEditingRouting(null); }} className="btn-secondary">Cancel</button>
                      <button type="submit" className="btn-primary" data-testid="routing-save-btn">{editingRouting ? 'Update' : 'Create'}</button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="card-flat overflow-hidden">
            {routings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <Settings2 className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No operation types defined yet</p>
                <p className="text-xs text-[#9CA3AF] mt-1">Add operations like LC Cutting, Welding, Assembly, etc.</p>
              </div>
            ) : (
              <table className="w-full data-table">
                <thead><tr><th>Operation Name</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {routings.filter(r => r.status === 'active').map(r => (
                    <tr key={r.id} data-testid={`routing-row-${r.id}`}>
                      <td className="font-semibold text-sm">{r.name}</td>
                      <td className="text-sm text-[#4B5563]">{r.description || '-'}</td>
                      <td><span className="status-badge bg-[#DEF7EC] text-[#03543F]">{r.status}</span></td>
                      <td>{canEdit && <button onClick={() => handleEditRouting(r)} className="p-1 text-[#4B5563] hover:text-[#1D3557]"><Edit2 className="w-4 h-4" /></button>}</td>
                    </tr>
                  ))}
                  {routings.filter(r => r.status !== 'active').map(r => (
                    <tr key={r.id} className="opacity-50" data-testid={`routing-row-${r.id}`}>
                      <td className="font-semibold text-sm">{r.name}</td>
                      <td className="text-sm text-[#4B5563]">{r.description || '-'}</td>
                      <td><span className="status-badge bg-[#E5E7EB] text-[#6B7280]">{r.status}</span></td>
                      <td>{canEdit && <button onClick={() => handleEditRouting(r)} className="p-1 text-[#4B5563] hover:text-[#1D3557]"><Edit2 className="w-4 h-4" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center space-x-2">
              <ClipboardList className="w-5 h-5" />
              <span>Job Card - {jobCardWO?.wo_number}</span>
              {jobCardWO?.production_order?.order_number && <span className="text-[11px] bg-[#E1EFFE] text-[#1E429F] px-2 py-0.5 rounded font-medium mono" data-testid="jobcard-so-ref">SO: {jobCardWO.production_order.order_number}</span>}
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
                      <th className="text-right py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Qty Done</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Accept/Reject</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Duration</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Cost</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobCardWO.operations_status?.map((op, idx) => {
                      const wc = workCenters.find(w => w.id === op.work_center_id);
                      const prevDone = idx === 0 || jobCardWO.operations_status.slice(0, idx).every(p => ['completed', 'stopped'].includes(p.status));
                      const runs = op.runs || [];
                      const totalDone = runs.reduce((s, r) => s + (r.quantity_completed || 0), 0) || op.quantity_completed || 0;
                      const totalAccepted = op.quantity_accepted || (totalDone - (op.quantity_rejected || 0) - (op.quantity_rework || 0));
                      const remaining = jobCardWO.quantity - totalDone;
                      const hourlyRate = wc?.hourly_rate || 0;
                      // Allocated qty across all runs (completed + currently planned-but-open). Used
                      // to decide if a NEW operator can still take some qty while another is running.
                      const allocatedQty = runs.reduce((s, r) => {
                        if (r.ended_at) return s + (r.quantity_completed || 0);
                        return s + (r.quantity_planned || r.quantity_completed || 0);
                      }, 0);
                      const remainingToAllocate = Math.max(0, jobCardWO.quantity - allocatedQty);
                      const canStartMore = canEdit && !op.is_job_work && remainingToAllocate > 0
                        && (op.status === 'pending' || op.status === 'stopped' || op.status === 'in_progress')
                        && prevDone;

                      const rowBg = op.status === 'in_progress' ? 'bg-[#FDF6B2]/30' : op.status === 'completed' ? 'bg-[#DEF7EC]/30' : op.status === 'stopped' ? 'bg-[#FDE8E8]/10' : '';
                      const statusBadge = (
                        <span className={`status-badge ${
                          op.status === 'completed' ? 'bg-[#DEF7EC] text-[#03543F]' :
                          op.status === 'in_progress' ? 'bg-[#FDF6B2] text-[#723B13]' :
                          op.status === 'stopped' ? 'bg-[#E1EFFE] text-[#1E429F]' :
                          'bg-[#F3F4F6] text-[#4B5563]'
                        }`}>{op.status?.replace('_', ' ')}</span>
                      );

                      const wcCell = op.work_center_id ? (wc?.name || op.work_center_name || '-') : (
                        op.status === 'pending' || op.status === 'stopped' ? (
                          <select value={op._selected_wc || ''} onChange={(e) => {
                            const updated = { ...jobCardWO };
                            updated.operations_status = updated.operations_status.map(o => o.sequence === op.sequence ? { ...o, _selected_wc: e.target.value } : o);
                            setJobCardWO(updated);
                          }} className="input-field text-xs py-1 px-2" data-testid={`wc-select-${op.sequence}`}>
                            <option value="">Select WC</option>
                            {workCenters.map(w => <option key={w.id} value={w.id}>{w.code} - {w.name}</option>)}
                          </select>
                        ) : '-'
                      );

                      // Shared action cell (spans all runs) — holds only Start button for remaining qty
                      // and completion indicator. Per-run Stop/Complete live in each run's own Action cell.
                      const actionCell = (
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {canStartMore && (
                            <button onClick={() => openOpDialog('start', op.sequence)} className="btn-primary text-xs px-2 py-1" data-testid={`start-op-${op.sequence}`}>
                              <Play className="w-3 h-3 inline mr-1" />
                              {op.status === 'stopped' && runs.length === 0 ? 'Resume' : op.status === 'stopped' ? `Start (${remainingToAllocate} rem)` : op.status === 'in_progress' ? `Start (${remainingToAllocate} rem)` : 'Start'}
                            </button>
                          )}
                          {op.status === 'in_progress' && op.is_job_work && (
                            <span className="text-[10px] text-[#723B13] bg-[#FDF6B2] px-2 py-1 rounded font-medium" data-testid={`outsourced-op-${op.sequence}`}>
                              {op.outsource_sc_order_number ? `JW: ${op.outsource_sc_order_number}` : 'Outsourced'} — Receive via GRN
                            </span>
                          )}
                          {op.status === 'completed' && (
                            <CheckCircle2 className="w-4 h-4 text-[#03543F]" />
                          )}
                        </div>
                      );

                      // Per-run action cell — Stop + Complete buttons for an individual operator run
                      const renderRunActionCell = (r) => {
                        const isOpen = !r.ended_at;
                        if (!isOpen) {
                          // Run has ended — show qty outcome summary
                          const acc = (r.quantity_completed || 0) - (r.reject_qty || 0) - (r.rework_qty || 0);
                          return (
                            <div className="flex items-center justify-center gap-1 text-[10px] text-[#03543F]" data-testid={`run-done-${op.sequence}-${r.run_number}`}>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Done{acc > 0 ? ` · A:${acc}` : ''}</span>
                            </div>
                          );
                        }
                        if (op.is_job_work) {
                          return <span className="text-[10px] text-[#9CA3AF]">—</span>;
                        }
                        if (!canEdit) return <span className="text-[10px] text-[#9CA3AF]">-</span>;
                        return (
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button onClick={() => openOpDialog('stop', op.sequence, r)} className="btn-secondary text-xs px-2 py-1 text-[#723B13] border-[#723B13]" data-testid={`stop-run-${op.sequence}-${r.run_number}`}>
                              <Square className="w-3 h-3 inline mr-1" />Stop
                            </button>
                            <button onClick={() => openOpDialog('complete', op.sequence, r)} className="text-xs px-2 py-1 bg-[#03543F] text-white rounded-sm hover:bg-[#024733]" data-testid={`complete-run-${op.sequence}-${r.run_number}`}>
                              <CheckCircle2 className="w-3 h-3 inline mr-1" />Complete
                            </button>
                          </div>
                        );
                      };

                      // Helper to render per-run duration + cost cells
                      const renderRunDurCost = (r) => {
                        const s = r?.started_at || r?.actual_start || r?.start_time;
                        const e = r?.ended_at || r?.actual_end || r?.end_time;
                        let mins = 0;
                        let running = false;
                        const ds = parseUTC(s);
                        const de = parseUTC(e);
                        if (ds && de) {
                          mins = Math.max(0, (de.getTime() - ds.getTime()) / 60000);
                        } else if (ds && !de) {
                          mins = Math.max(0, (Date.now() - ds.getTime()) / 60000);
                          running = true;
                        }
                        const runCost = (mins / 60) * hourlyRate;
                        const durNode = !mins ? <span className="text-[#9CA3AF]">-</span>
                          : running ? <span className="text-[#1E429F]">{mins.toFixed(0)} min (running)</span>
                          : (() => { const h = Math.floor(mins / 60); const m = Math.round(mins % 60); return <span className="text-[#111827]">{h > 0 ? `${h}h ${m}m` : `${m} min`}</span>; })();
                        const costNode = (!hourlyRate || !mins) ? <span className="text-[#9CA3AF]" title={!hourlyRate ? 'Set WC hourly rate to compute cost' : ''}>-</span>
                          : <span className="text-[#111827] font-medium" title={`${mins.toFixed(1)} min × ₹${hourlyRate}/hr = ₹${runCost.toFixed(2)}`}>₹{runCost.toFixed(2)}</span>;
                        return { durNode, costNode };
                      };

                      // If there are runs, render one row per run with rowspan for merged columns.
                      // Otherwise render single row (pending op).
                      if (runs.length === 0) {
                        return (
                          <tr key={op.sequence} className={`border-t ${rowBg}`} data-testid={`op-row-${op.sequence}`}>
                            <td className="py-3 px-3 mono font-medium">{op.sequence}</td>
                            <td className="py-3 px-3 font-medium">{typeof op.operation_name === 'object' && op.operation_name !== null ? (op.operation_name.name || '') : op.operation_name}</td>
                            <td className="py-3 px-3 text-sm text-[#4B5563]">{wcCell}</td>
                            <td className="py-3 px-3 text-center">{statusBadge}</td>
                            <td className="py-3 px-3 text-sm">{op.operator || '-'}</td>
                            <td className="py-3 px-3 text-right mono text-sm"><span className="font-medium">{totalDone}</span><span className="text-[#6B7280]">/{jobCardWO.quantity}</span></td>
                            <td className="py-3 px-3 text-right text-xs"><span className="text-[#9CA3AF]">-</span></td>
                            <td className="py-3 px-3 text-right mono text-xs" data-testid={`op-duration-${op.sequence}`}><span className="text-[#9CA3AF]">-</span></td>
                            <td className="py-3 px-3 text-right mono text-xs font-medium" data-testid={`op-cost-${op.sequence}`}><span className="text-[#9CA3AF]">-</span></td>
                            <td className="py-3 px-3 text-center">{actionCell}</td>
                          </tr>
                        );
                      }

                      return runs.map((r, ri) => {
                        const { durNode, costNode } = renderRunDurCost(r);
                        const isFirst = ri === 0;
                        return (
                          <tr key={`${op.sequence}-${ri}`} className={`border-t ${rowBg}`} data-testid={`op-row-${op.sequence}-${ri}`}>
                            {isFirst && <td rowSpan={runs.length} className="py-3 px-3 mono font-medium align-top">{op.sequence}</td>}
                            {isFirst && <td rowSpan={runs.length} className="py-3 px-3 font-medium align-top">{typeof op.operation_name === 'object' && op.operation_name !== null ? (op.operation_name.name || '') : op.operation_name}</td>}
                            {isFirst && <td rowSpan={runs.length} className="py-3 px-3 text-sm text-[#4B5563] align-top">{wcCell}</td>}
                            {isFirst && <td rowSpan={runs.length} className="py-3 px-3 align-top">
                              <div className="flex flex-col items-center gap-1.5">
                                {statusBadge}
                                {actionCell}
                              </div>
                            </td>}
                            <td className="py-3 px-3 text-sm" data-testid={`op-operator-${op.sequence}-${ri}`}>
                              <div className="flex items-center gap-1 text-xs">
                                <User className="w-3 h-3 text-[#6B7280]" />
                                <span className="font-medium">{r.operator || '-'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right mono text-sm" data-testid={`op-qty-${op.sequence}-${ri}`}>
                              <span className="font-medium">{r.quantity_completed || 0}</span>
                              <span className="text-[#6B7280]"> pcs</span>
                            </td>
                            {isFirst ? (
                              <td rowSpan={runs.length} className="py-3 px-3 text-right text-xs align-top">
                                {totalDone > 0 ? (
                                  <div className="space-y-0.5">
                                    <div className="text-[#03543F]">A: {totalAccepted}</div>
                                    {(op.quantity_rejected || 0) > 0 && <div className="text-[#9B1C1C]">R: {op.quantity_rejected}</div>}
                                    {(op.quantity_rework || 0) > 0 && <div className="text-[#723B13]">RW: {op.quantity_rework}</div>}
                                    {remaining > 0 && <div className="text-[10px] text-[#9B1C1C]">{remaining} remaining</div>}
                                  </div>
                                ) : <span className="text-[#9CA3AF]">-</span>}
                              </td>
                            ) : null}
                            <td className="py-3 px-3 text-right mono text-xs" data-testid={`op-duration-${op.sequence}-${ri}`}>{durNode}</td>
                            <td className="py-3 px-3 text-right mono text-xs font-medium" data-testid={`op-cost-${op.sequence}-${ri}`}>{costNode}</td>
                            <td className="py-3 px-3 text-center">{renderRunActionCell(r)}</td>
                          </tr>
                        );
                      });
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
                  <Printer className="w-3 h-3" /><span>Print Manufacturing Order</span>
                </button>
                <button onClick={() => printJobCard(jobCardWO)} className="btn-primary text-xs flex items-center space-x-1" data-testid="print-jobcard-from-dialog">
                  <Printer className="w-3 h-3" /><span>Print Job Card</span>
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Operation Start/Stop/Complete Dialog */}
      <Dialog open={opDialog.open} onOpenChange={(open) => { if (!open) setOpDialog({ open: false, mode: '', sequence: 0 }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">
              {opDialog.mode === 'start' ? 'Start Operation' : opDialog.mode === 'stop' ? 'Stop Operation' : 'Complete Operation'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-3">
            {opDialog.mode === 'start' && (
              <>
                {/* Outsource Toggle */}
                <div className="flex items-center justify-between p-3 bg-[#FDF6B2]/30 border border-[#FDF6B2] rounded-sm">
                  <div>
                    <span className="text-sm font-semibold text-[#723B13]">Outsource this operation</span>
                    <p className="text-xs text-[#6B7280]">Send to external supplier for processing</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpForm({...opForm, is_outsource: !opForm.is_outsource, operator: ''})}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${opForm.is_outsource ? 'bg-[#723B13]' : 'bg-[#D1D5DB]'}`}
                    data-testid="outsource-toggle"
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${opForm.is_outsource ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {opForm.is_outsource ? (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier / Vendor *</label>
                      <Select value={opForm.outsource_supplier_id} onValueChange={v => setOpForm({...opForm, outsource_supplier_id: v})}>
                        <SelectTrigger data-testid="outsource-supplier-select"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                        <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Processing Charges / Unit</label>
                      <input type="number" min="0" step="0.01" value={opForm.outsource_charges} onChange={e => setOpForm({...opForm, outsource_charges: parseFloat(e.target.value) || 0})} className="input-field mono" placeholder="0.00" data-testid="outsource-charges-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Quantity to Send (max: {(() => {
                        const _op = jobCardWO?.operations_status?.find(o => o.sequence === opDialog.sequence);
                        const _runs = _op?.runs || [];
                        const _alloc = _runs.reduce((s, r) => r.ended_at ? s + (r.quantity_completed || 0) : s + (r.quantity_planned || r.quantity_completed || 0), 0);
                        return Math.max(0, (jobCardWO?.quantity || 0) - _alloc) || (jobCardWO?.quantity || 0);
                      })()})</label>
                      <input type="number" min="1" max={jobCardWO?.quantity || 1} value={opForm.quantity} onChange={e => setOpForm({...opForm, quantity: Math.min(parseInt(e.target.value) || 0, jobCardWO?.quantity || 1)})} className="input-field mono" data-testid="op-qty-input" />
                    </div>
                    <p className="text-xs text-[#723B13] bg-[#FDF6B2]/50 p-2 rounded-sm">A Subcontract Order and Delivery Challan will be auto-created when you start this operation.</p>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Operator Name *</label>
                      <input type="text" value={opForm.operator} onChange={e => setOpForm({...opForm, operator: e.target.value})} className="input-field" placeholder="Enter operator name" data-testid="op-operator-input" required />
                      {!opForm.operator.trim() && <p className="text-xs text-[#9B1C1C] mt-1">Operator name is required</p>}
                    </div>
                    <div>
                      {(() => {
                        const _op = jobCardWO?.operations_status?.find(o => o.sequence === opDialog.sequence);
                        const _runs = _op?.runs || [];
                        const _alloc = _runs.reduce((s, r) => r.ended_at ? s + (r.quantity_completed || 0) : s + (r.quantity_planned || r.quantity_completed || 0), 0);
                        const _rem = Math.max(0, (jobCardWO?.quantity || 0) - _alloc);
                        const _hasOpen = _runs.some(r => !r.ended_at);
                        return (
                          <>
                            <label className="block text-sm font-semibold text-[#111827] mb-1">Quantity to Produce (max: {_rem || jobCardWO?.quantity || 0})</label>
                            <input type="number" min="1" max={_rem || jobCardWO?.quantity || 1} value={opForm.quantity} onChange={e => setOpForm({...opForm, quantity: Math.min(parseInt(e.target.value) || 0, _rem || jobCardWO?.quantity || 1)})} className="input-field mono" data-testid="op-qty-input" />
                            {_hasOpen && _rem > 0 && (
                              <p className="text-[11px] text-[#1E429F] bg-[#E1EFFE]/60 p-2 rounded-sm mt-1">
                                Another operator is currently running this operation. Starting here will add a parallel run for <strong>{_rem}</strong> remaining unit(s).
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <p className="text-[11px] text-[#6B7280] italic">Cost is auto-calculated from the Work Center hourly rate × actual duration when the operation is stopped/completed.</p>
                  </>
                )}
              </>
            )}
            {(opDialog.mode === 'stop' || opDialog.mode === 'complete') && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Quantity Produced (max: {jobCardWO?.quantity || 0})</label>
                  <input type="number" min="0" max={jobCardWO?.quantity || 1} value={opForm.quantity} onChange={e => setOpForm({...opForm, quantity: Math.min(parseInt(e.target.value) || 0, jobCardWO?.quantity || 1)})} className="input-field mono" data-testid="op-produced-qty-input" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Quality Result</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'accept', label: 'Accept', color: 'bg-[#DEF7EC] text-[#03543F] border-[#03543F]', icon: CheckCircle2 },
                      { value: 'reject', label: 'Reject', color: 'bg-[#FDE8E8] text-[#9B1C1C] border-[#9B1C1C]', icon: XCircle },
                      { value: 'rework', label: 'Rework', color: 'bg-[#FDF6B2] text-[#723B13] border-[#723B13]', icon: RotateCcw },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setOpForm({...opForm, quality_result: opt.value})}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 px-3 rounded-sm border-2 text-sm font-medium transition-all ${opForm.quality_result === opt.value ? opt.color : 'bg-white text-[#6B7280] border-[#D1D5DB]'}`}
                        data-testid={`quality-${opt.value}`}
                      >
                        <opt.icon className="w-4 h-4" />{opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {opForm.quality_result === 'reject' && (
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Reject Quantity (max: {opForm.quantity})</label>
                    <input type="number" min="0" max={opForm.quantity} value={opForm.reject_qty} onChange={e => setOpForm({...opForm, reject_qty: Math.min(parseInt(e.target.value) || 0, opForm.quantity)})} className="input-field mono" data-testid="op-reject-qty" />
                  </div>
                )}
                {opForm.quality_result === 'rework' && (
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Rework Quantity (max: {opForm.quantity})</label>
                    <input type="number" min="0" max={opForm.quantity} value={opForm.rework_qty} onChange={e => setOpForm({...opForm, rework_qty: Math.min(parseInt(e.target.value) || 0, opForm.quantity)})} className="input-field mono" data-testid="op-rework-qty" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
                  <textarea value={opForm.notes} onChange={e => setOpForm({...opForm, notes: e.target.value})} className="input-field" rows={2} placeholder="Any remarks..." data-testid="op-notes-input" />
                </div>
              </>
            )}
            <div className="flex justify-end space-x-3 pt-3 border-t border-[#E5E7EB]">
              <button onClick={() => setOpDialog({ open: false, mode: '', sequence: 0 })} className="btn-secondary">Cancel</button>
              <button onClick={handleOpDialogSubmit} className="btn-primary" disabled={opDialog.mode === 'start' && !opForm.is_outsource && !opForm.operator.trim()} data-testid="op-dialog-submit">
                {opDialog.mode === 'start' ? (opForm.is_outsource ? 'Start & Create OS Order' : 'Start') : opDialog.mode === 'stop' ? 'Stop & Record' : 'Complete'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Subcontract Dialog */}
      <Dialog open={subcontractDialog} onOpenChange={(o) => { if (!o) { setSubcontractDialog(false); setScResult(null); } }}>
        <DialogContent className="max-w-md">
          {scResult ? (
            <>
              <DialogHeader><DialogTitle className="font-[Chivo] text-[#03543F] flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> SC Order Created</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-3">
                <div className="bg-[#DEF7EC]/50 rounded p-3">
                  <p className="text-sm font-semibold text-[#03543F]">{scResult.order_number}</p>
                  <p className="text-xs text-[#4B5563] mt-1">{scResult.message}</p>
                  <p className="text-xs text-[#4B5563] mt-1">MO: {subcontractWO?.wo_number} — {subcontractWO?.item?.part_number || ''} {subcontractWO?.item?.name || ''}</p>
                  {scResult.lines?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#D1FAE5]">
                      <p className="text-[11px] font-semibold text-[#03543F] mb-1">RM / Materials ({scResult.lines.length} items):</p>
                      {scResult.lines.map((l, i) => {
                        const it = items.find(x => x.id === l.item_id);
                        return <p key={i} className="text-[11px] text-[#4B5563]">{it?.part_number || '-'} — {it?.name || '-'} (Qty: {l.quantity})</p>;
                      })}
                    </div>
                  )}
                </div>
                <p className="text-xs text-[#723B13] bg-[#FDF6B2]/50 p-2 rounded-sm">Go to Job Work page to Send DC and manage this SC order.</p>
                <div className="flex justify-end pt-3 border-t">
                  <button onClick={() => { setSubcontractDialog(false); setScResult(null); }} className="btn-primary" data-testid="sc-result-close-btn">Done</button>
                </div>
              </div>
            </>
          ) : (
            <>
          <DialogHeader><DialogTitle className="font-[Chivo]">Mark as Sub-Contract — {subcontractWO?.wo_number}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            {/* SC Type Radio */}
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-2">Sub-Contract Type *</label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-start gap-2 p-2.5 border-2 rounded-sm cursor-pointer transition-all ${subcontractType === 'with_material' ? 'border-[#1D3557] bg-[#E1EFFE]/30' : 'border-[#D1D5DB]'}`} data-testid="sc-dialog-type-with">
                  <input type="radio" name="sc_dialog_type" value="with_material" checked={subcontractType === 'with_material'} onChange={() => setSubcontractType('with_material')} className="mt-0.5" />
                  <div>
                    <span className="text-sm font-semibold text-[#111827]">With Material</span>
                    <p className="text-[11px] text-[#6B7280] mt-0.5">Your RM sent to vendor via DC</p>
                  </div>
                </label>
                <label className={`flex-1 flex items-start gap-2 p-2.5 border-2 rounded-sm cursor-pointer transition-all ${subcontractType === 'without_material' ? 'border-[#1D3557] bg-[#E1EFFE]/30' : 'border-[#D1D5DB]'} ${hasProcessedChild ? 'opacity-40 cursor-not-allowed' : ''}`} data-testid="sc-dialog-type-without">
                  <input type="radio" name="sc_dialog_type" value="without_material" checked={subcontractType === 'without_material'} onChange={() => !hasProcessedChild && setSubcontractType('without_material')} className="mt-0.5" disabled={hasProcessedChild} />
                  <div>
                    <span className="text-sm font-semibold text-[#111827]">Without Material</span>
                    <p className="text-[11px] text-[#6B7280] mt-0.5">{hasProcessedChild ? 'Not available — child items already processed' : 'Vendor sources RM, no DC needed'}</p>
                  </div>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">Subcontractor *</label>
              <Select value={subcontractSupplier} onValueChange={setSubcontractSupplier}>
                <SelectTrigger data-testid="subcontract-supplier-select"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-[#723B13] bg-[#FDF6B2]/50 p-2 rounded-sm">
              {subcontractType === 'with_material'
                ? 'Consumed materials will be sent to subcontractor via Delivery Challan.'
                : 'No materials sent. Vendor sources and manufactures. Only finished item received back.'}
            </p>
            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button onClick={() => { setSubcontractDialog(false); setScResult(null); }} className="btn-secondary">Cancel</button>
              <button onClick={handleConfirmSubcontract} className="btn-primary" disabled={!subcontractSupplier} data-testid="confirm-subcontract-btn">Confirm Sub-Contract</button>
            </div>
          </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* Bulk SC Dialog */}
      <Dialog open={bulkSCDialog} onOpenChange={setBulkSCDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-[Chivo]">Bulk Sub-Contract — {selectedMOCount} MO(s)</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div className="text-sm text-[#4B5563] bg-[#F9FAFB] p-2 rounded">
              {Object.keys(selectedMOs).map(id => {
                const wo = workOrders.find(w => w.id === id);
                return wo ? <div key={id} className="mono text-xs">{wo.wo_number} — {wo.item?.part_number} ({wo.quantity})</div> : null;
              })}
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-2">Sub-Contract Type *</label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-start gap-2 p-2.5 border-2 rounded-sm cursor-pointer ${bulkSCType === 'with_material' ? 'border-[#1D3557] bg-[#E1EFFE]/30' : 'border-[#D1D5DB]'}`}>
                  <input type="radio" value="with_material" checked={bulkSCType === 'with_material'} onChange={() => setBulkSCType('with_material')} className="mt-0.5" />
                  <div><span className="text-sm font-semibold">With Material</span><p className="text-[11px] text-[#6B7280]">Your RM sent via DC</p></div>
                </label>
                <label className={`flex-1 flex items-start gap-2 p-2.5 border-2 rounded-sm cursor-pointer ${bulkSCType === 'without_material' ? 'border-[#1D3557] bg-[#E1EFFE]/30' : 'border-[#D1D5DB]'}`}>
                  <input type="radio" value="without_material" checked={bulkSCType === 'without_material'} onChange={() => setBulkSCType('without_material')} className="mt-0.5" />
                  <div><span className="text-sm font-semibold">Without Material</span><p className="text-[11px] text-[#6B7280]">Vendor sources RM</p></div>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">Subcontractor *</label>
              <Select value={bulkSCSupplier} onValueChange={setBulkSCSupplier}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-[#723B13] bg-[#FDF6B2]/50 p-2 rounded-sm">All selected MOs will be marked as SC and a single consolidated SC Order + DC will be created for the same supplier.</p>
            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button onClick={() => setBulkSCDialog(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleBulkSC} className="btn-primary" disabled={!bulkSCSupplier} data-testid="confirm-bulk-sc-btn">Create Bulk SC</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MO Start Result Dialog */}
      <Dialog open={startResultDialog.open} onOpenChange={(o) => { if (!o) setStartResultDialog({ open: false, success: null, data: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center gap-2">
              {startResultDialog.success ? (
                <><CheckCircle2 className="w-5 h-5 text-[#03543F]" /> Manufacturing Order Started</>
              ) : startResultDialog.data?.type === 'reserved' ? (
                <><AlertCircle className="w-5 h-5 text-[#9B1C1C]" /> Materials Reserved by Other MOs</>
              ) : (
                <><AlertCircle className="w-5 h-5 text-[#9B1C1C]" /> Insufficient Materials</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 space-y-3">
            {startResultDialog.success && startResultDialog.data && (
              <>
                <p className="text-sm text-[#03543F] font-medium">{startResultDialog.data.message}</p>
                <div className="bg-[#F3F4F6] rounded p-3 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold mb-2 text-[#4B5563]">Materials Consumed:</p>
                  {(startResultDialog.data.consumed || []).map((m, i) => (
                    <div key={i} className="text-sm flex justify-between py-0.5 border-b border-[#E5E7EB] last:border-0">
                      <span className="mono text-xs">{m.item} - {m.name || ''}</span>
                      <span className="mono font-medium">{m.quantity} {m.uom || 'pcs'}</span>
                    </div>
                  ))}
                  {(!startResultDialog.data.consumed || startResultDialog.data.consumed.length === 0) && <p className="text-xs text-[#9CA3AF]">No materials consumed</p>}
                </div>
              </>
            )}
            {!startResultDialog.success && startResultDialog.data?.type === 'reserved' && (
              <>
                <p className="text-sm text-[#9B1C1C] font-medium">{startResultDialog.data.message}</p>
                <div className="bg-[#FDE8E8]/50 rounded p-3 max-h-60 overflow-y-auto">
                  <p className="text-xs font-semibold mb-2 text-[#9B1C1C]">Reservation Conflicts:</p>
                  <table className="w-full text-xs">
                    <thead><tr className="text-[#4B5563]"><th className="text-left py-1">Item</th><th className="text-right">Need</th><th className="text-right">Stock</th><th className="text-right">Reserved</th><th className="text-right">Free</th><th className="text-left pl-2">Reserved By</th></tr></thead>
                    <tbody>
                      {(startResultDialog.data.conflicts || []).map((c, i) => (
                        <tr key={i} className="border-t border-[#FECACA]">
                          <td className="py-1 mono font-medium">{c.item} <span className="text-[#6B7280] font-normal">{c.name}</span></td>
                          <td className="text-right mono">{c.required}</td>
                          <td className="text-right mono">{c.total_stock}</td>
                          <td className="text-right mono text-[#9B1C1C] font-bold">{c.reserved_by}</td>
                          <td className="text-right mono">{c.free_stock}</td>
                          <td className="pl-2 text-[#723B13]">{c.reserved_mos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-[#6B7280]">Reserve this MO first, or wait until reserved stock is consumed by the other MOs.</p>
              </>
            )}
            {!startResultDialog.success && startResultDialog.data?.type === 'insufficient' && (
              <>
                <p className="text-sm text-[#9B1C1C] font-medium">{startResultDialog.data.message}</p>
                <div className="bg-[#FDE8E8]/50 rounded p-3 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold mb-2 text-[#9B1C1C]">Insufficient Materials:</p>
                  {(startResultDialog.data.materials || []).map((m, i) => (
                    <div key={i} className="text-sm flex justify-between py-0.5 border-b border-[#FECACA] last:border-0">
                      <span className="mono text-xs">{m.item} - {m.name || ''}</span>
                      <span className="mono">Need: <span className="font-bold">{m.required}</span>, Have: <span className={m.available < m.required ? 'text-[#9B1C1C] font-bold' : ''}>{m.available}</span></span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!startResultDialog.success && startResultDialog.data?.type === 'error' && (
              <p className="text-sm text-[#9B1C1C] font-medium bg-[#FDE8E8]/50 rounded p-4">{startResultDialog.data.message}</p>
            )}
            <div className="flex justify-end pt-3 border-t">
              <button onClick={() => setStartResultDialog({ open: false, success: null, data: null })} className={startResultDialog.success ? 'btn-primary' : 'btn-secondary'} data-testid="mo-start-result-close">
                {startResultDialog.success ? 'OK' : 'Cancel'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
