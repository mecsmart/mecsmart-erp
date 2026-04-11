import React, { useState, useEffect } from 'react';
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
  Eye
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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [warehousesRes, transfersRes, itemsRes] = await Promise.all([
        api.get('/api/warehouses'),
        api.get('/api/warehouses/transfers/history'),
        api.get('/api/items'),
      ]);
      setWarehouses(warehousesRes.data);
      setTransfers(transfersRes.data);
      setItems(itemsRes.data);
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
      </Tabs>
    </div>
  );
}
