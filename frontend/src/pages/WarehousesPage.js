import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
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
  Printer
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export default function WarehousesPage() {
  const { user } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('warehouses');
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
  const [grnDialogOpen, setGrnDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [grnForm, setGrnForm] = useState({
    supplier_invoice_no: '',
    supplier_invoice_date: '',
    warehouse_id: '',
    notes: '',
    lines: [],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [warehousesRes, transfersRes, itemsRes, grnRes, pendingRes] = await Promise.all([
        api.get('/api/warehouses'),
        api.get('/api/warehouses/transfers/history'),
        api.get('/api/items'),
        api.get('/api/grn'),
        api.get('/api/grn/pending-pos'),
      ]);
      setWarehouses(warehousesRes.data);
      setTransfers(transfersRes.data);
      setItems(itemsRes.data);
      setGrnList(grnRes.data);
      setPendingPOs(pendingRes.data);
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
    try {
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
      await api.post('/api/grn', payload);
      setGrnDialogOpen(false);
      setSelectedPO(null);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to create GRN');
    }
  };

  const [printMenuGRN, setPrintMenuGRN] = useState(null);

  const printGRN = async (grn, format) => {
    setPrintMenuGRN(null);
    try {
      const { data } = await api.get(`/api/grn/${grn.id}/print-data`);
      const company = data.company || {};
      const supplier = data.supplier || {};
      const lines = data.lines || [];
      const wh = data.warehouse || {};
      const printStyles = `
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#111; padding:20px; }
        .header { text-align:center; border-bottom:2px solid #1D3557; padding-bottom:10px; margin-bottom:15px; }
        .header h1 { font-size:16px; color:#1D3557; } .header p { font-size:10px; color:#555; }
        .title { font-size:13px; font-weight:bold; color:#1D3557; margin:12px 0 6px; text-transform:uppercase; }
        .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
        .info-box { border:1px solid #ddd; padding:6px 8px; }
        .info-box label { font-size:9px; color:#888; text-transform:uppercase; display:block; }
        .info-box span { font-weight:600; font-size:11px; }
        table { width:100%; border-collapse:collapse; margin-bottom:12px; }
        th { background:#1D3557; color:white; padding:5px 6px; text-align:left; font-size:10px; }
        td { padding:5px 6px; border-bottom:1px solid #ddd; font-size:11px; }
        tr:nth-child(even) { background:#f9f9f9; }
        .text-right { text-align:right; } .mono { font-family:'Courier New',monospace; }
        .total-row { font-weight:bold; background:#f0f4f8 !important; }
        .mismatch { color:#B45309; font-weight:600; }
        .footer { margin-top:30px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; font-size:10px; }
        .sign-box { border-top:1px solid #333; padding-top:4px; text-align:center; }
        @media print { body { padding:10px; } }
      `;

      let linesHTML = '';
      if (format === 'detailed') {
        linesHTML = `<table><thead><tr><th>SN</th><th>Item Code</th><th>Description</th><th>HSN</th><th class="text-right">PO Qty</th><th class="text-right">Recd Qty</th><th>UOM</th><th class="text-right">PO Price</th><th class="text-right">Verified Price</th><th class="text-center">Status</th></tr></thead><tbody>`;
        lines.forEach((l, i) => {
          const qtyMatch = l.received_quantity === l.po_quantity;
          const priceMatch = l.verified_price === l.po_price;
          linesHTML += `<tr><td>${i+1}</td><td class="mono">${l.item?.part_number || ''}</td><td>${l.item?.name || ''}</td><td class="mono">${l.hsn_code || ''}</td><td class="text-right mono">${l.po_quantity || 0}</td><td class="text-right mono ${!qtyMatch ? 'mismatch' : ''}">${l.received_quantity}</td><td>${l.uom || 'pcs'}</td><td class="text-right mono">${(l.po_price || 0).toFixed(2)}</td><td class="text-right mono ${!priceMatch ? 'mismatch' : ''}">${(l.verified_price || 0).toFixed(2)}</td><td class="text-center">${qtyMatch && priceMatch ? 'OK' : '<span class="mismatch">Mismatch</span>'}</td></tr>`;
        });
        linesHTML += `</tbody></table>`;
      } else {
        linesHTML = `<table><thead><tr><th>SN</th><th>Item Code</th><th>Description</th><th>HSN</th><th class="text-right">Recd Qty</th><th>UOM</th><th class="text-right">Verified Price</th><th class="text-right">Amount</th></tr></thead><tbody>`;
        let total = 0;
        lines.forEach((l, i) => {
          const amt = l.received_quantity * l.verified_price;
          total += amt;
          linesHTML += `<tr><td>${i+1}</td><td class="mono">${l.item?.part_number || ''}</td><td>${l.item?.name || ''}</td><td class="mono">${l.hsn_code || ''}</td><td class="text-right mono">${l.received_quantity}</td><td>${l.uom || 'pcs'}</td><td class="text-right mono">${(l.verified_price || 0).toFixed(2)}</td><td class="text-right mono">${amt.toFixed(2)}</td></tr>`;
        });
        linesHTML += `<tr class="total-row"><td colspan="7" class="text-right">Total</td><td class="text-right mono">${total.toFixed(2)}</td></tr></tbody></table>`;
      }

      const html = `<!DOCTYPE html><html><head><title>GRN ${data.grn_number}</title><style>${printStyles}</style></head><body>
        <div class="header"><h1>${company.company_name || 'Manufacturing ERP'}</h1>
        ${company.address ? `<p>${company.address}</p>` : ''}${company.gstin ? `<p>GSTIN: ${company.gstin}</p>` : ''}</div>
        <div class="title">Goods Receipt Note: ${data.grn_number}</div>
        <div class="info-grid">
          <div class="info-box"><label>PO Reference</label><span class="mono">${data.po_number || ''}</span></div>
          <div class="info-box"><label>Supplier</label><span>${supplier.name || ''}</span><br/><span class="mono" style="font-size:10px">${supplier.code || ''}</span>${supplier.gstin ? `<br/><span style="font-size:10px">GSTIN: ${supplier.gstin}</span>` : ''}</div>
          <div class="info-box"><label>Supplier Invoice / Doc Ref</label><span class="mono">${data.supplier_invoice_no || '-'}</span>${data.supplier_invoice_date ? `<br/><span style="font-size:10px">${new Date(data.supplier_invoice_date).toLocaleDateString()}</span>` : ''}</div>
          <div class="info-box"><label>Received At</label><span>${wh.name || ''} ${wh.code ? `(${wh.code})` : ''}</span>${wh.address ? `<br/><span style="font-size:10px">${wh.address}</span>` : ''}</div>
        </div>
        <div class="title">Items Received</div>
        ${linesHTML}
        ${data.notes ? `<div style="margin:10px 0;"><strong>Notes:</strong> ${data.notes}</div>` : ''}
        <div class="footer"><div><div class="sign-box">Received By (Stores)</div></div><div><div class="sign-box">Inspected By (QC)</div></div><div><div class="sign-box">Approved By</div></div></div>
        <p style="text-align:center;font-size:9px;color:#aaa;margin-top:20px;">Printed on ${new Date().toLocaleString()}</p>
      </body></html>`;
      const w = window.open('', '_blank', 'width=900,height=700');
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    } catch (error) {
      alert('Failed to load GRN print data');
    }
  };

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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-[#F3F4F6] p-1 rounded-sm">
          <TabsTrigger 
            value="warehouses" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-warehouses"
          >
            Warehouses
          </TabsTrigger>
          <TabsTrigger 
            value="transfers" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-transfers"
          >
            Transfer History
          </TabsTrigger>
          <TabsTrigger 
            value="grn" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-grn"
          >
            GRN
          </TabsTrigger>
        </TabsList>

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
              <div className="overflow-x-auto">
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
              <div className="overflow-x-auto">
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
                        <td className="text-right mono font-semibold">{(po.total_amount || 0).toFixed(2)}</td>
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
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="grn-table">
                  <thead>
                    <tr>
                      <th>GRN No.</th>
                      <th>PO No.</th>
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
                        <td className="mono">{grn.po_number}</td>
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
                          <div className="relative">
                            <button onClick={() => setPrintMenuGRN(printMenuGRN === grn.id ? null : grn.id)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Print GRN" data-testid={`print-grn-${grn.id}`}>
                              <Printer className="w-4 h-4" />
                            </button>
                            {printMenuGRN === grn.id && (
                              <div className="absolute right-0 top-7 z-50 bg-white border border-[#D1D5DB] rounded-sm shadow-lg min-w-[170px]">
                                <button onClick={() => printGRN(grn, 'standard')} className="block w-full text-left px-3 py-2 text-xs hover:bg-[#F3F4F6]" data-testid="print-grn-standard">
                                  Standard Format
                                </button>
                                <button onClick={() => printGRN(grn, 'detailed')} className="block w-full text-left px-3 py-2 text-xs hover:bg-[#F3F4F6]" data-testid="print-grn-detailed">
                                  Detailed (PO vs Received)
                                </button>
                              </div>
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

          {/* GRN Create Dialog */}
          <Dialog open={grnDialogOpen} onOpenChange={(open) => { if (!open) { setSelectedPO(null); } setGrnDialogOpen(open); }}>
            <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">
                  Create GRN {selectedPO ? `- ${selectedPO.po_number}` : ''}
                </DialogTitle>
              </DialogHeader>
              {selectedPO && (
                <form onSubmit={handleGRNSubmit} className="space-y-4 mt-3" data-testid="grn-form">
                  {/* Supplier info */}
                  <div className="bg-[#F3F4F6] rounded-sm p-3 text-sm">
                    <div className="flex justify-between">
                      <div>
                        <span className="text-[#6B7280]">Supplier: </span>
                        <span className="font-medium">{selectedPO.supplier?.name} ({selectedPO.supplier?.code})</span>
                      </div>
                      <div>
                        <span className="text-[#6B7280]">PO Total: </span>
                        <span className="mono font-semibold">{(selectedPO.total_amount || 0).toFixed(2)}</span>
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
                            <th className="text-right p-2">PO Qty</th>
                            <th className="text-right p-2">Recd Qty</th>
                            <th className="text-left p-2">UOM</th>
                            <th className="text-right p-2">PO Price</th>
                            <th className="text-right p-2">Verified Price</th>
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
                                <td className="p-2 text-right mono">{line.po_price.toFixed(2)}</td>
                                <td className="p-2">
                                  <input type="number" min="0" step="0.01" value={line.verified_price} onChange={(e) => updateGRNLine(i, 'verified_price', parseFloat(e.target.value) || 0)} className="input-field bg-white text-xs h-8 mono w-24 text-right" data-testid={`grn-verified-price-${i}`} />
                                </td>
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
    </div>
  );
}
