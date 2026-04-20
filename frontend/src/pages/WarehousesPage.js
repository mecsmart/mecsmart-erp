import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { 
  Plus, 
  Warehouse, 
  ArrowRightLeft,
  Edit2, 
  MapPin,
  Package,
  CheckCircle2,
  Eye,
  FileText,
  ClipboardCheck,
  Printer,
  Search,
  AlertTriangle
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { GRNPrintDialog } from '../components/PrintDialogs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';

export default function WarehousesPage() {
  const { user } = useAuth();
  const { formatCurrency, currencySymbol } = useCompanySettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [warehouses, setWarehouses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'stock');
  const [storesStockSearch, setStoresStockSearch] = useState('');
  const [inventory, setInventory] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [warehouseStock, setWarehouseStock] = useState([]);
  
  const [isWarehouseDialogOpen, setIsWarehouseDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  
  const [warehouseForm, setWarehouseForm] = useState({
    code: '',
    name: '',
    location: '',
    address: '',
    is_default: false,
    status: 'active',
  });
  
  const [transferForm, setTransferForm] = useState({
    item_id: '',
    from_warehouse_id: '',
    to_warehouse_id: '',
    quantity: 1,
    notes: '',
  });

  const canEdit = ['admin', 'inventory_manager'].includes(user?.role);

  // GRN State
  const [grnList, setGrnList] = useState([]);
  const [pendingPOs, setPendingPOs] = useState([]);
  const [pendingJWOrders, setPendingJWOrders] = useState([]);
  const [grnDialogOpen, setGrnDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [selectedJW, setSelectedJW] = useState(null);
  const [grnForm, setGrnForm] = useState({
    supplier_invoice_no: '',
    supplier_invoice_date: '',
    warehouse_id: '',
    notes: '',
    lines: [],
  });
  const [confirmGrnModal, setConfirmGrnModal] = useState({ open: false, kind: null, payload: null, summary: null });

  useEffect(() => {
    fetchData();
  }, []);

  // Sync activeTab with URL `?tab=` whenever it changes (sidebar dropdown navigation).
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [warehousesRes, transfersRes, itemsRes, grnRes, pendingRes, inventoryRes, jwRes] = await Promise.all([
        api.get('/api/warehouses'),
        api.get('/api/warehouses/transfers/history'),
        api.get('/api/items'),
        api.get('/api/grn'),
        api.get('/api/grn/pending-pos'),
        api.get('/api/inventory'),
        api.get('/api/job-work/orders').catch(() => ({ data: [] })),
      ]);
      setWarehouses(warehousesRes.data);
      setTransfers(transfersRes.data);
      setItems(itemsRes.data);
      setGrnList(grnRes.data);
      setPendingPOs(pendingRes.data);
      setInventory(inventoryRes.data);
      // Filter JW orders that are in_progress with DC sent (pending GRN receive)
      const pendingJW = (jwRes.data || []).filter(jw => 
        jw.status === 'in_progress' && jw.job_work_parts?.length > 0 && (
          // SC with RM: lines sent
          (jw.subcontract_type !== 'without_material' && (jw.lines || []).some(l => l.sent_quantity > 0)) ||
          // Job OS: dc_created
          (jw.subcontract_type === 'without_material' && jw.dc_created)
        )
      );
      setPendingJWOrders(pendingJW);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouseStock = async (warehouseId) => {
    try {
      const { data } = await api.get(`/api/warehouses/${warehouseId}/stock`);
      setWarehouseStock(data.stock || []);
      setSelectedWarehouse(data.warehouse);
    } catch (error) {
      console.error('Failed to fetch warehouse stock:', error);
    }
  };

  const handleWarehouseSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingWarehouse) {
        await api.put(`/api/warehouses/${editingWarehouse.id}`, warehouseForm);
      } else {
        await api.post('/api/warehouses', warehouseForm);
      }
      setIsWarehouseDialogOpen(false);
      setEditingWarehouse(null);
      resetWarehouseForm();
      fetchData();
    } catch (error) {
      console.error('Failed to save warehouse:', error);
      alert(error.response?.data?.detail || 'Failed to save warehouse');
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/warehouses/transfer', transferForm);
      setIsTransferDialogOpen(false);
      resetTransferForm();
      fetchData();
      if (selectedWarehouse) {
        fetchWarehouseStock(selectedWarehouse.id);
      }
    } catch (error) {
      console.error('Failed to create transfer:', error);
      alert(error.response?.data?.detail || 'Failed to create transfer');
    }
  };

  const handleEditWarehouse = (warehouse) => {
    setEditingWarehouse(warehouse);
    setWarehouseForm({
      code: warehouse.code,
      name: warehouse.name,
      location: warehouse.location || '',
      address: warehouse.address || '',
      is_default: warehouse.is_default || false,
      status: warehouse.status || 'active',
    });
    setIsWarehouseDialogOpen(true);
  };

  const resetWarehouseForm = () => {
    setWarehouseForm({
      code: '',
      name: '',
      location: '',
      address: '',
      is_default: false,
      status: 'active',
    });
  };

  const resetTransferForm = () => {
    setTransferForm({
      item_id: '',
      from_warehouse_id: '',
      to_warehouse_id: '',
      quantity: 1,
      notes: '',
    });
  };

  // GRN Functions
  const openGRNDialog = (po) => {
    setSelectedPO(po);
    setGrnForm({
      supplier_invoice_no: '',
      supplier_invoice_date: '',
      warehouse_id: po.delivery_warehouse_id || '',
      notes: '',
      lines: (po.lines || []).map(line => ({
        item_id: line.item_id,
        item_name: line.item?.name || '',
        item_part_number: line.item?.part_number || '',
        po_quantity: line.quantity,
        received_quantity: line.quantity,
        po_price: line.unit_price,
        verified_price: line.unit_price,
        uom: line.uom || 'pcs',
        hsn_code: line.hsn_code || '',
      })),
    });
    setGrnDialogOpen(true);
  };

  const updateGRNLine = (index, field, value) => {
    const newLines = [...grnForm.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setGrnForm({ ...grnForm, lines: newLines });
  };

  const handleGRNSubmit = async (e) => {
    e.preventDefault();
    if (!grnForm.supplier_invoice_no.trim()) { toast.error('Supplier Invoice No. is mandatory'); return; }
    if (!grnForm.supplier_invoice_date) { toast.error('Supplier Invoice Date is mandatory'); return; }
    const totalQty = grnForm.lines.reduce((s, l) => s + (l.received_quantity || 0), 0);
    const totalCost = grnForm.lines.reduce((s, l) => s + (l.received_quantity || 0) * (l.verified_price || 0), 0);
    if (totalQty <= 0) { toast.error('Received quantity must be greater than 0'); return; }
    const qtyMismatches = grnForm.lines.filter(l => (l.received_quantity || 0) !== (l.po_quantity || 0));
    const priceMismatches = grnForm.lines.filter(l => (l.verified_price || 0) !== (l.po_price || 0));
    const payload = {
      po_id: selectedPO.id,
      supplier_invoice_no: grnForm.supplier_invoice_no,
      supplier_invoice_date: grnForm.supplier_invoice_date ? new Date(grnForm.supplier_invoice_date).toISOString() : null,
      warehouse_id: grnForm.warehouse_id,
      notes: grnForm.notes,
      lines: grnForm.lines.map(l => ({
        item_id: l.item_id,
        received_quantity: l.received_quantity,
        verified_price: l.verified_price,
      })),
    };
    setConfirmGrnModal({
      open: true,
      kind: 'po',
      payload,
      summary: {
        title: 'Confirm Goods Receipt',
        supplier: selectedPO?.supplier?.name || '-',
        reference: `PO: ${selectedPO?.po_number || '-'}`,
        invoice: grnForm.supplier_invoice_no,
        invoiceDate: grnForm.supplier_invoice_date,
        warehouse: warehouses.find(w => w.id === grnForm.warehouse_id)?.name,
        totalQty,
        totalCost,
        lineCount: grnForm.lines.length,
        qtyMismatches: qtyMismatches.length,
        priceMismatches: priceMismatches.length,
      }
    });
  };

  const confirmGRNSave = async () => {
    const { kind, payload } = confirmGrnModal;
    try {
      if (kind === 'po') {
        await api.post('/api/grn', payload);
        toast.success('Goods receipt confirmed. Stock updated.');
      } else if (kind === 'jw') {
        await api.post('/api/job-work/receive-grn', payload);
        toast.success('JW receipt confirmed. Stock updated for processed items.');
      }
      setConfirmGrnModal({ open: false, kind: null, payload: null, summary: null });
      setGrnDialogOpen(false);
      setSelectedPO(null);
      setSelectedJW(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create GRN');
    }
  };

  // JW GRN Functions
  const openJWGRNDialog = (jw) => {
    setSelectedJW(jw);
    const parts = (jw.job_work_parts || []).map(p => {
      const pit = items.find(i => i.id === p.item_id) || {};
      return {
        item_id: p.item_id,
        item_name: pit.name || '',
        item_part_number: pit.part_number || '',
        po_quantity: p.quantity,
        received_quantity: p.quantity - (p.received_quantity || 0),
        po_price: p.charges || 0,
        verified_price: p.charges || 0,
        bom_rollup_cost: p.bom_rollup_cost || 0,
        uom: pit.unit_of_measure || 'pcs',
        hsn_code: pit.hsn_code || '',
      };
    });
    setGrnForm({
      supplier_invoice_no: '',
      supplier_invoice_date: '',
      warehouse_id: '',
      notes: '',
      lines: parts,
    });
    setGrnDialogOpen(true);
  };

  const handleJWGRNSubmit = async () => {
    if (!grnForm.supplier_invoice_no.trim()) { toast.error('Supplier Invoice No. is mandatory'); return; }
    if (!grnForm.supplier_invoice_date) { toast.error('Invoice Date is mandatory'); return; }
    if (grnForm.lines.every(l => !l.received_quantity)) { toast.error('Enter received quantities'); return; }
    const totalQty = grnForm.lines.reduce((s, l) => s + (l.received_quantity || 0), 0);
    const totalCost = grnForm.lines.reduce((s, l) => s + (l.received_quantity || 0) * (l.verified_price || 0), 0);
    if (totalQty <= 0) { toast.error('Received quantity must be greater than 0'); return; }
    const payload = {
      subcontract_order_id: selectedJW.id,
      supplier_invoice_no: grnForm.supplier_invoice_no,
      supplier_invoice_date: grnForm.supplier_invoice_date,
      lines: grnForm.lines.filter(l => l.received_quantity > 0).map(l => ({
        item_id: l.item_id,
        received_quantity: l.received_quantity,
        process_charges: l.verified_price,
      })),
    };
    setConfirmGrnModal({
      open: true,
      kind: 'jw',
      payload,
      summary: {
        title: 'Confirm Job Work Receipt',
        supplier: selectedJW?.supplier?.name || '-',
        reference: `JW: ${selectedJW?.order_number || '-'}`,
        invoice: grnForm.supplier_invoice_no,
        invoiceDate: grnForm.supplier_invoice_date,
        totalQty,
        totalCost,
        lineCount: payload.lines.length,
        isJW: true,
      }
    });
  };


  const [printGRN, setPrintGRN] = useState(null);

  return (
    <div className="space-y-6" data-testid="warehouses-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Stores & Warehouses</h1>
          <p className="text-sm text-[#4B5563]">Manage warehouse locations and stock transfers</p>
        </div>
        <div className="flex items-center space-x-2">
          {canEdit && (
            <>
              <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
                <DialogTrigger asChild>
                  <button className="btn-secondary flex items-center space-x-2" data-testid="transfer-stock-btn">
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Transfer Stock</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-[Chivo]">Stock Transfer</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleTransferSubmit} className="space-y-4 mt-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Item *</label>
                      <Select value={transferForm.item_id} onValueChange={(v) => setTransferForm({ ...transferForm, item_id: v })}>
                        <SelectTrigger data-testid="transfer-item-select">
                          <SelectValue placeholder="Select item" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.part_number} - {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">From Warehouse *</label>
                      <Select value={transferForm.from_warehouse_id} onValueChange={(v) => setTransferForm({ ...transferForm, from_warehouse_id: v })}>
                        <SelectTrigger data-testid="transfer-from-select">
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.filter(w => w.id !== transferForm.to_warehouse_id).map((wh) => (
                            <SelectItem key={wh.id} value={wh.id}>{wh.code} - {wh.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">To Warehouse *</label>
                      <Select value={transferForm.to_warehouse_id} onValueChange={(v) => setTransferForm({ ...transferForm, to_warehouse_id: v })}>
                        <SelectTrigger data-testid="transfer-to-select">
                          <SelectValue placeholder="Select destination" />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.filter(w => w.id !== transferForm.from_warehouse_id).map((wh) => (
                            <SelectItem key={wh.id} value={wh.id}>{wh.code} - {wh.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        value={transferForm.quantity}
                        onChange={(e) => setTransferForm({ ...transferForm, quantity: parseInt(e.target.value) || 1 })}
                        className="input-field mono"
                        required
                        data-testid="transfer-quantity-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
                      <textarea
                        value={transferForm.notes}
                        onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                        className="input-field"
                        rows={2}
                        placeholder="Transfer notes..."
                        data-testid="transfer-notes-input"
                      />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                      <button type="button" onClick={() => setIsTransferDialogOpen(false)} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" data-testid="transfer-submit-btn">
                        Transfer Stock
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={isWarehouseDialogOpen} onOpenChange={(open) => {
                setIsWarehouseDialogOpen(open);
                if (!open) {
                  setEditingWarehouse(null);
                  resetWarehouseForm();
                }
              }}>
                <DialogTrigger asChild>
                  <button className="btn-primary flex items-center space-x-2" data-testid="add-warehouse-btn">
                    <Plus className="w-4 h-4" />
                    <span>Add Warehouse</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-[Chivo]">{editingWarehouse ? 'Edit Warehouse' : 'Add Warehouse'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleWarehouseSubmit} className="space-y-4 mt-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Code *</label>
                      <input
                        type="text"
                        value={warehouseForm.code}
                        onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                        className="input-field mono"
                        placeholder="WH-MAIN"
                        required
                        disabled={!!editingWarehouse}
                        data-testid="warehouse-code-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Name *</label>
                      <input
                        type="text"
                        value={warehouseForm.name}
                        onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                        className="input-field"
                        placeholder="Main Warehouse"
                        required
                        data-testid="warehouse-name-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Location</label>
                      <input
                        type="text"
                        value={warehouseForm.location}
                        onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })}
                        className="input-field"
                        placeholder="Building A, Floor 1"
                        data-testid="warehouse-location-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Delivery Address</label>
                      <textarea
                        value={warehouseForm.address}
                        onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
                        className="input-field"
                        rows={3}
                        placeholder="Full delivery address for Purchase Orders"
                        data-testid="warehouse-address-input"
                      />
                    </div>

                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={warehouseForm.is_default}
                          onChange={(e) => setWarehouseForm({ ...warehouseForm, is_default: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm font-medium text-[#111827]">Default Warehouse</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Status</label>
                      <Select value={warehouseForm.status} onValueChange={(v) => setWarehouseForm({ ...warehouseForm, status: v })}>
                        <SelectTrigger data-testid="warehouse-status-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                      <button type="button" onClick={() => setIsWarehouseDialogOpen(false)} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" data-testid="warehouse-save-btn">
                        {editingWarehouse ? 'Update' : 'Add'} Warehouse
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearchParams({ tab: v }); }} className="space-y-4">
        <TabsList className="bg-[#F3F4F6] p-1 rounded-sm">
          <TabsTrigger 
            value="stock" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-stock"
          >
            Stock
          </TabsTrigger>
          <TabsTrigger 
            value="warehouses" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-warehouses"
          >
            Warehouses
          </TabsTrigger>
          {/* Hidden triggers — Transfer History & GRN are accessed via the sidebar
              dropdown (?tab=transfers / ?tab=grn). Triggers stay registered (not
              visually rendered) so Radix Tabs can switch value from the URL. */}
          <TabsTrigger value="transfers" className="hidden" data-testid="tab-transfers" />
          <TabsTrigger value="grn" className="hidden" data-testid="tab-grn" />
        </TabsList>

        {/* Stock Tab - Inventory Overview */}
        <TabsContent value="stock" className="mt-4">
          <div className="card-flat p-3 mb-4">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
              <input type="text" value={storesStockSearch} onChange={(e) => setStoresStockSearch(e.target.value)} placeholder="Search by part number or name..." className="input-field pl-9 text-sm" data-testid="stores-stock-search" />
            </div>
          </div>
          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>
            ) : inventory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]"><Package className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No stock items found</p></div>
            ) : (
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="stores-stock-table">
                  <thead>
                    <tr>
                      <th>Part Number</th><th>Name</th><th>Category</th>
                      <th className="text-right">Current Stock</th><th className="text-right">Safety Stock</th>
                      <th className="text-right">Reorder Point</th><th className="text-right">Unit Cost</th><th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.filter(item => {
                      if (!storesStockSearch.trim()) return true;
                      const q = storesStockSearch.toLowerCase();
                      return item.part_number?.toLowerCase().includes(q) || item.name?.toLowerCase().includes(q);
                    }).map(item => {
                      const isLow = item.current_stock <= (item.reorder_point || item.safety_stock || 0);
                      return (
                        <tr key={item.id} className={isLow ? 'bg-[#FDE8E8]/30' : ''} data-testid={`stores-stock-row-${item.part_number}`}>
                          <td className="mono font-medium">{item.part_number}</td>
                          <td>
                            <div className="flex items-center space-x-2">
                              {isLow && <AlertTriangle className="w-4 h-4 text-[#9B1C1C]" />}
                              <span>{item.name}</span>
                            </div>
                          </td>
                          <td><span className={`status-badge ${item.category === 'raw_material' ? 'bg-[#E1EFFE] text-[#1E429F]' : item.category === 'component' ? 'bg-[#DEF7EC] text-[#03543F]' : item.category === 'sub_assembly' ? 'bg-[#FDF6B2] text-[#723B13]' : 'bg-[#F3F4F6] text-[#4B5563]'}`}>{item.category?.replace('_', ' ')}</span></td>
                          <td className={`text-right mono font-semibold ${isLow ? 'text-[#9B1C1C]' : ''}`}>{item.current_stock}</td>
                          <td className="text-right mono">{item.safety_stock || '-'}</td>
                          <td className="text-right mono">{item.reorder_point || '-'}</td>
                          <td className="text-right mono">{formatCurrency(item.unit_cost || 0)}</td>
                          <td className="text-right mono font-semibold">{formatCurrency((item.current_stock || 0) * (item.unit_cost || 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="warehouses" className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
            </div>
          ) : warehouses.length === 0 ? (
            <div className="card-flat flex flex-col items-center justify-center h-48 text-[#4B5563]">
              <Warehouse className="w-12 h-12 mb-2 text-[#9CA3AF]" />
              <p>No warehouses found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {warehouses.map((warehouse) => (
                <div key={warehouse.id} className="card-flat p-4" data-testid={`warehouse-card-${warehouse.code}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Warehouse className="w-5 h-5 text-[#457B9D]" />
                      <div>
                        <span className="mono text-xs text-[#4B5563]">{warehouse.code}</span>
                        <h3 className="text-lg font-semibold text-[#111827]">{warehouse.name}</h3>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {warehouse.is_default && (
                        <span className="status-badge bg-[#DEF7EC] text-[#03543F]">Default</span>
                      )}
                      <span className={`status-badge ${warehouse.status === 'active' ? 'status-active' : 'status-obsolete'}`}>
                        {warehouse.status}
                      </span>
                    </div>
                  </div>

                  {warehouse.location && (
                    <div className="flex items-start space-x-2 text-sm text-[#4B5563] mb-3">
                      <MapPin className="w-4 h-4 mt-0.5" />
                      <span>{warehouse.location}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-[#E5E7EB]">
                    <button
                      onClick={() => fetchWarehouseStock(warehouse.id)}
                      className="btn-secondary text-xs flex items-center space-x-1"
                      data-testid={`view-stock-${warehouse.code}`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>View Stock</span>
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => handleEditWarehouse(warehouse)}
                        className="p-1 text-[#4B5563] hover:text-[#1D3557]"
                        data-testid={`edit-warehouse-${warehouse.code}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stock View Dialog */}
          <Dialog open={!!selectedWarehouse} onOpenChange={(open) => { if (!open) setSelectedWarehouse(null); }}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-[Chivo] flex items-center space-x-2">
                  <Warehouse className="w-5 h-5" />
                  <span>Stock at {selectedWarehouse?.name}</span>
                </DialogTitle>
              </DialogHeader>
              
              {warehouseStock.length === 0 ? (
                <div className="text-center py-8 text-[#4B5563]">
                  <Package className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" />
                  <p>No stock in this warehouse</p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full data-table">
                    <thead>
                      <tr>
                        <th>Part Number</th>
                        <th>Item Name</th>
                        <th>Category</th>
                        <th className="text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warehouseStock.map((stock, index) => (
                        <tr key={index}>
                          <td className="mono font-medium">{stock.item?.part_number || '-'}</td>
                          <td>{stock.item?.name || '-'}</td>
                          <td>
                            <span className="status-badge bg-[#E1EFFE] text-[#1E429F]">
                              {stock.item?.category?.replace('_', ' ') || '-'}
                            </span>
                          </td>
                          <td className="text-right mono font-medium">{stock.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="transfers" className="mt-4">
          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : transfers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <ArrowRightLeft className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No transfers recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="transfers-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Item</th>
                      <th>From</th>
                      <th>To</th>
                      <th className="text-right">Quantity</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((transfer) => (
                      <tr key={transfer.id}>
                        <td className="text-sm text-[#4B5563]">
                          {new Date(transfer.created_at).toLocaleString()}
                        </td>
                        <td>
                          <span className="mono text-sm">{transfer.item?.part_number || '-'}</span>
                          <p className="text-xs text-[#4B5563]">{transfer.item?.name || '-'}</p>
                        </td>
                        <td>
                          <span className="mono text-sm">{transfer.from_warehouse?.code || '-'}</span>
                        </td>
                        <td>
                          <span className="mono text-sm">{transfer.to_warehouse?.code || '-'}</span>
                        </td>
                        <td className="text-right mono font-medium">{transfer.quantity}</td>
                        <td>
                          <div className="flex items-center space-x-1">
                            <CheckCircle2 className="w-4 h-4 text-[#03543F]" />
                            <span className="status-badge status-pass">{transfer.status}</span>
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

        {/* GRN Tab */}
        <TabsContent value="grn" className="mt-4 space-y-4">
          {/* Pending POs for GRN */}
          {pendingPOs.length > 0 && (
            <div className="card-flat overflow-hidden">
              <div className="p-4 border-b border-[#E5E7EB]">
                <h3 className="text-sm font-semibold text-[#1D3557] flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" /> Pending POs for GRN
                </h3>
              </div>
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="pending-grn-table">
                  <thead>
                    <tr>
                      <th>PO Number</th>
                      <th>Supplier</th>
                      <th>Items</th>
                      <th className="text-right">Total</th>
                      <th>Expected</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPOs.map(po => (
                      <tr key={po.id} data-testid={`pending-grn-row-${po.id}`}>
                        <td className="mono font-medium">{po.po_number}</td>
                        <td>
                          <span className="mono text-xs">{po.supplier?.code}</span>
                          <p className="text-sm">{po.supplier?.name}</p>
                        </td>
                        <td className="mono text-sm">{po.lines?.length || 0} items</td>
                        <td className="text-right mono font-semibold">{formatCurrency(po.total_amount || 0)}</td>
                        <td className="text-sm">{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}</td>
                        <td>
                          <button onClick={() => openGRNDialog(po)} className="btn-primary text-xs flex items-center gap-1" data-testid={`create-grn-${po.id}`}>
                            <Package className="w-3 h-3" /> Create GRN
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pending JW Orders for GRN (SC with RM) */}
          {pendingJWOrders.length > 0 && (
            <div className="card-flat overflow-hidden">
              <div className="p-4 border-b border-[#E5E7EB]">
                <h3 className="text-sm font-semibold text-[#723B13] flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" /> Pending Job Work Orders for GRN
                </h3>
                <p className="text-xs text-[#6B7280] mt-1">Receive processed materials from subcontractors</p>
              </div>
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="pending-jw-grn-table">
                  <thead>
                    <tr>
                      <th>JW Order #</th>
                      <th>Supplier</th>
                      <th>FG/SA/Part</th>
                      <th>RM Sent</th>
                      <th className="text-right">Charges</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingJWOrders.map(jw => {
                      const supplier = jw.supplier || {};
                      const jwpItems = (jw.job_work_parts || []).map(p => {
                        const it = items.find(i => i.id === p.item_id) || {};
                        return `${it.part_number || '-'} (${p.quantity})`;
                      }).join(', ');
                      const totalCharges = (jw.job_work_parts || []).reduce((s, p) => s + (p.quantity || 0) * (p.charges || 0), 0);
                      return (
                        <tr key={jw.id} data-testid={`pending-jw-row-${jw.id}`}>
                          <td className="mono font-medium">{jw.order_number}</td>
                          <td>
                            <span className="mono text-xs">{supplier.code || '-'}</span>
                            <p className="text-sm">{supplier.name || '-'}</p>
                          </td>
                          <td className="text-sm">{jwpItems || '-'}</td>
                          <td className="mono text-sm">{(jw.lines || []).length} items</td>
                          <td className="text-right mono font-semibold">{formatCurrency(totalCharges)}</td>
                          <td>
                            <button onClick={() => openJWGRNDialog(jw)} className="btn-primary text-xs flex items-center gap-1" data-testid={`create-jw-grn-${jw.id}`}>
                              <Package className="w-3 h-3" /> Create GRN
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Completed GRN List */}
          <div className="card-flat overflow-hidden">
            <div className="p-4 border-b border-[#E5E7EB]">
              <h3 className="text-sm font-semibold text-[#1D3557] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Completed GRN
              </h3>
            </div>
            {grnList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <FileText className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No GRN records yet</p>
                <p className="text-xs text-[#9CA3AF] mt-1">GRN entries appear here after material verification from sent POs</p>
              </div>
            ) : (
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="grn-table">
                  <thead>
                    <tr>
                      <th>GRN No.</th>
                      <th>PO / DC Number</th>
                      <th>Supplier</th>
                      <th>Supplier Invoice</th>
                      <th>Items Received</th>
                      <th className="text-right">Total Qty</th>
                      <th>Date</th>
                      <th>Print</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grnList.map(grn => (
                      <tr key={grn.id} data-testid={`grn-row-${grn.id}`}>
                        <td className="mono font-semibold text-[#03543F]">{grn.grn_number}</td>
                        <td className="mono">
                          {grn.po_number ? (
                            <div>
                              <span className="text-[10px] text-[#6B7280] uppercase">PO</span>
                              <div>{grn.po_number}</div>
                            </div>
                          ) : (grn.jw_order_id || grn.sc_order_id) ? (
                            <div>
                              {grn.jw_order_number && <div><span className="text-[10px] text-[#723B13] uppercase font-semibold">JW</span> {grn.jw_order_number}</div>}
                              {grn.dc_number && <div className="text-xs"><span className="text-[10px] text-[#6B7280] uppercase">DC</span> {grn.dc_number}</div>}
                            </div>
                          ) : <span className="text-[#9CA3AF]">-</span>}
                        </td>
                        <td>
                          <span className="mono text-xs">{grn.supplier?.code}</span>
                          <p className="text-sm">{grn.supplier?.name}</p>
                        </td>
                        <td>
                          {grn.supplier_invoice_no ? (
                            <div>
                              <span className="mono font-medium">{grn.supplier_invoice_no}</span>
                              {grn.supplier_invoice_date && <p className="text-xs text-[#6B7280]">{new Date(grn.supplier_invoice_date).toLocaleDateString()}</p>}
                            </div>
                          ) : <span className="text-[#9CA3AF]">-</span>}
                        </td>
                        <td>
                          <div className="space-y-0.5">
                            {(grn.lines || []).map((line, li) => (
                              <div key={li} className="text-xs">
                                <span className="font-medium">{line.item?.part_number || line.item_id}</span>
                                <span className="text-[#6B7280] ml-1">{line.item?.name}</span>
                                <span className="mono ml-2">{line.received_quantity} {line.uom}</span>
                                {line.po_price !== line.verified_price && (
                                  <span className="ml-1 text-[#B45309] text-xs">(price adjusted)</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="text-right mono">{(grn.lines || []).reduce((s, l) => s + l.received_quantity, 0)}</td>
                        <td className="text-sm">{grn.created_at ? new Date(grn.created_at).toLocaleDateString() : '-'}</td>
                        <td>
                          <button onClick={() => setPrintGRN(grn)} className="p-1 text-[#4B5563] hover:text-[#03543F]" title="Print GRN" data-testid={`print-grn-${grn.id}`}>
                            <Printer className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* GRN Create Dialog */}
          <Dialog open={grnDialogOpen} onOpenChange={(open) => { if (!open) { setSelectedPO(null); setSelectedJW(null); } setGrnDialogOpen(open); }}>
            <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">
                  Create GRN {selectedPO ? `- ${selectedPO.po_number}` : selectedJW ? `- ${selectedJW.order_number} (Job Work)` : ''}
                </DialogTitle>
              </DialogHeader>
              {(selectedPO || selectedJW) && (
                <form onSubmit={(e) => { e.preventDefault(); selectedJW ? handleJWGRNSubmit() : handleGRNSubmit(e); }} className="space-y-4 mt-3" data-testid="grn-form">
                  {/* Supplier info */}
                  <div className="bg-[#F3F4F6] rounded-sm p-3 text-sm">
                    <div className="flex justify-between">
                      <div>
                        <span className="text-[#6B7280]">Supplier: </span>
                        <span className="font-medium">{selectedPO ? `${selectedPO.supplier?.name} (${selectedPO.supplier?.code})` : `${selectedJW?.supplier?.name || '-'} (${selectedJW?.supplier?.code || '-'})`}</span>
                      </div>
                      <div>
                        <span className="text-[#6B7280]">{selectedPO ? 'PO Total: ' : 'Process Charges: '}</span>
                        <span className="mono font-semibold">{formatCurrency(selectedPO ? (selectedPO.total_amount || 0) : (selectedJW?.processing_charges || 0))}</span>
                      </div>
                    </div>
                  </div>

                  {/* Invoice Reference */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier Invoice / Doc Ref No. *</label>
                      <input type="text" value={grnForm.supplier_invoice_no} onChange={(e) => setGrnForm({ ...grnForm, supplier_invoice_no: e.target.value })} className="input-field" placeholder="e.g. INV-2025-0123" required data-testid="grn-invoice-no" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Invoice Date</label>
                      <input type="date" value={grnForm.supplier_invoice_date} onChange={(e) => setGrnForm({ ...grnForm, supplier_invoice_date: e.target.value })} className="input-field" data-testid="grn-invoice-date" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Receiving Warehouse</label>
                      <Select value={grnForm.warehouse_id || undefined} onValueChange={(v) => setGrnForm({ ...grnForm, warehouse_id: v })}>
                        <SelectTrigger data-testid="grn-warehouse-select"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                        <SelectContent>
                          {warehouses.filter(w => w.status === 'active').map(w => <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Material Verification Table */}
                  <div className="border-t border-[#E5E7EB] pt-4">
                    <label className="text-sm font-semibold text-[#111827] mb-3 block">Verify Material & Price</label>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="grn-verify-table">
                        <thead>
                          <tr className="bg-[#1D3557] text-white text-xs">
                            <th className="text-left p-2">Item</th>
                            <th className="text-left p-2">HSN</th>
                            <th className="text-right p-2">{selectedJW ? 'Ordered' : 'PO Qty'}</th>
                            <th className="text-right p-2">Recd Qty</th>
                            <th className="text-left p-2">UOM</th>
                            <th className="text-right p-2">{selectedJW ? 'SC Price' : 'PO Price'}</th>
                            <th className="text-right p-2">Cost/Unit</th>
                            <th className="text-right p-2">Total Cost</th>
                            <th className="text-center p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grnForm.lines.map((line, i) => {
                            const qtyMatch = line.received_quantity === line.po_quantity;
                            const priceMatch = line.verified_price === line.po_price;
                            return (
                              <tr key={i} className="border-b border-[#E5E7EB]" data-testid={`grn-verify-row-${i}`}>
                                <td className="p-2">
                                  <span className="mono text-xs font-medium">{line.item_part_number}</span>
                                  <p className="text-[#6B7280] text-xs">{line.item_name}</p>
                                </td>
                                <td className="p-2 mono text-xs">{line.hsn_code || '-'}</td>
                                <td className="p-2 text-right mono">{line.po_quantity}</td>
                                <td className="p-2">
                                  <input type="number" min="0" step="any" value={line.received_quantity} onChange={(e) => updateGRNLine(i, 'received_quantity', parseFloat(e.target.value) || 0)} className="input-field bg-white text-xs h-8 mono w-20 text-right" data-testid={`grn-received-qty-${i}`} />
                                </td>
                                <td className="p-2 mono text-xs">{line.uom}</td>
                                <td className="p-2 text-right mono">{formatCurrency(line.po_price)}</td>
                                <td className="p-2">
                                  <input type="number" min="0" step="0.01" value={line.verified_price} onChange={(e) => updateGRNLine(i, 'verified_price', parseFloat(e.target.value) || 0)} className="input-field bg-white text-xs h-8 mono w-24 text-right" data-testid={`grn-verified-price-${i}`} />
                                </td>
                                <td className="p-2 text-right mono text-xs font-semibold">{formatCurrency((line.received_quantity || 0) * (line.verified_price || 0))}</td>
                                <td className="p-2 text-center">
                                  {qtyMatch && priceMatch ? (
                                    <CheckCircle2 className="w-4 h-4 text-[#03543F] mx-auto" />
                                  ) : (
                                    <span className="text-xs text-[#B45309] font-medium">
                                      {!qtyMatch && 'Qty'}{!qtyMatch && !priceMatch && '/'}{!priceMatch && 'Price'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-[#F3F4F6] font-semibold">
                            <td className="p-2 text-right text-sm" colSpan={6}>Grand Total</td>
                            <td className="p-2 text-right mono text-sm">{formatCurrency(grnForm.lines.reduce((s, l) => s + (l.received_quantity || 0) * (l.verified_price || 0), 0))}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
                    <textarea value={grnForm.notes} onChange={(e) => setGrnForm({ ...grnForm, notes: e.target.value })} className="input-field" rows={2} placeholder="GRN notes..." data-testid="grn-notes" />
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                    <button type="button" onClick={() => setGrnDialogOpen(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" className="btn-primary" data-testid="grn-submit-btn">
                      Confirm GRN
                    </button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* GRN Print Dialog */}
      <GRNPrintDialog grn={printGRN} open={!!printGRN} onClose={() => setPrintGRN(null)} />

      {/* Confirm GRN Modal */}
      <Dialog open={confirmGrnModal.open} onOpenChange={(o) => { if (!o) setConfirmGrnModal({ open: false, kind: null, payload: null, summary: null }); }}>
        <DialogContent className="max-w-md" data-testid="confirm-grn-modal">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center gap-2 text-[#03543F]">
              <CheckCircle2 className="w-5 h-5" />
              {confirmGrnModal.summary?.title || 'Confirm Receipt'}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-[#374151]">Please review the receipt details below. Stock will be updated once confirmed.</p>
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-sm p-3 text-xs space-y-1.5">
              <div className="flex justify-between"><span className="text-[#6B7280]">Supplier:</span><span className="font-semibold text-right">{confirmGrnModal.summary?.supplier}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Reference:</span><span className="font-semibold mono text-right">{confirmGrnModal.summary?.reference}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Supplier Invoice:</span><span className="font-semibold mono">{confirmGrnModal.summary?.invoice}</span></div>
              {confirmGrnModal.summary?.invoiceDate && <div className="flex justify-between"><span className="text-[#6B7280]">Invoice Date:</span><span className="font-semibold">{confirmGrnModal.summary?.invoiceDate}</span></div>}
              {confirmGrnModal.summary?.warehouse && <div className="flex justify-between"><span className="text-[#6B7280]">Warehouse:</span><span className="font-semibold">{confirmGrnModal.summary?.warehouse}</span></div>}
              <div className="border-t pt-1.5 mt-1.5 flex justify-between"><span className="text-[#6B7280]">Lines:</span><span className="font-semibold mono">{confirmGrnModal.summary?.lineCount}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Total Qty:</span><span className="font-semibold mono">{confirmGrnModal.summary?.totalQty}</span></div>
              <div className="flex justify-between text-sm pt-1"><span className="text-[#111827] font-semibold">Total Value:</span><span className="font-bold mono text-[#03543F]">{currencySymbol}{(confirmGrnModal.summary?.totalCost || 0).toFixed(2)}</span></div>
            </div>
            {((confirmGrnModal.summary?.qtyMismatches || 0) > 0 || (confirmGrnModal.summary?.priceMismatches || 0) > 0) && (
              <div className="bg-[#FDF6B2]/40 border border-[#FDF6B2] rounded-sm p-2.5 text-xs text-[#723B13]">
                <div className="font-semibold mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Mismatches vs PO</div>
                {(confirmGrnModal.summary?.qtyMismatches || 0) > 0 && <div>• {confirmGrnModal.summary.qtyMismatches} line(s) with quantity mismatch</div>}
                {(confirmGrnModal.summary?.priceMismatches || 0) > 0 && <div>• {confirmGrnModal.summary.priceMismatches} line(s) with price mismatch</div>}
                <div className="mt-1 text-[10px]">These will be recorded and flagged on the GRN print.</div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setConfirmGrnModal({ open: false, kind: null, payload: null, summary: null })} className="btn-secondary" data-testid="confirm-grn-cancel">
              Back to Edit
            </button>
            <button onClick={confirmGRNSave} className="bg-[#03543F] hover:bg-[#024733] text-white px-4 py-2 rounded-sm text-sm font-medium flex items-center gap-1" data-testid="confirm-grn-ok">
              <CheckCircle2 className="w-4 h-4" />
              Yes, Confirm Receipt
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
