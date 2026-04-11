import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  ShoppingCart, 
  FileText,
  Filter,
  X,
  CheckCircle2,
  Send,
  Package
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partial', label: 'Partial' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    supplier_id: '',
    expected_date: '',
    lines: [],
    notes: '',
  });

  const canEdit = ['admin', 'production_manager', 'inventory_manager'].includes(user?.role);
  const canReceive = ['admin', 'inventory_manager'].includes(user?.role);

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const [ordersRes, suppliersRes, itemsRes] = await Promise.all([
        api.get(`/api/purchase-orders${params}`),
        api.get('/api/suppliers?status=active'),
        api.get('/api/items'),
      ]);
      setOrders(ordersRes.data);
      setSuppliers(suppliersRes.data);
      setItems(itemsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        expected_date: new Date(formData.expected_date).toISOString(),
      };
      await api.post('/api/purchase-orders', payload);
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Failed to create PO:', error);
      alert(error.response?.data?.detail || 'Failed to create purchase order');
    }
  };

  const handleReceive = async (po) => {
    if (!window.confirm(`Receive all items from PO "${po.po_number}"? This will update inventory.`)) return;
    try {
      await api.post(`/api/purchase-orders/${po.id}/receive`);
      fetchData();
    } catch (error) {
      console.error('Failed to receive PO:', error);
      alert(error.response?.data?.detail || 'Failed to receive purchase order');
    }
  };

  const handleStatusChange = async (po, newStatus) => {
    try {
      await api.put(`/api/purchase-orders/${po.id}`, { status: newStatus });
      fetchData();
    } catch (error) {
      console.error('Failed to update PO:', error);
      alert(error.response?.data?.detail || 'Failed to update purchase order');
    }
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { item_id: '', quantity: 1, unit_price: 0, hsn_code: '', gst_rate: 18, notes: '' }],
    });
  };

  const removeLine = (index) => {
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index),
    });
  };

  const updateLine = (index, field, value) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    
    // Auto-fill unit price, HSN, and GST rate when item is selected
    if (field === 'item_id') {
      const item = items.find(i => i.id === value);
      if (item) {
        newLines[index].unit_price = item.unit_cost;
        newLines[index].hsn_code = item.hsn_code || '';
        newLines[index].gst_rate = item.gst_rate != null ? item.gst_rate : 18;
      }
    }
    
    setFormData({ ...formData, lines: newLines });
  };

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      expected_date: '',
      lines: [],
      notes: '',
    });
  };

  const calculateTotal = () => {
    return formData.lines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
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
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="create-po-btn">
                <Plus className="w-4 h-4" />
                <span>Create PO</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">Create Purchase Order</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier *</label>
                    <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}>
                      <SelectTrigger data-testid="po-supplier-select">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Expected Date *</label>
                    <input
                      type="date"
                      value={formData.expected_date}
                      onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
                      className="input-field"
                      required
                      data-testid="po-expected-date-input"
                    />
                  </div>
                </div>

                {/* Lines */}
                <div className="border-t border-[#E5E7EB] pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-[#111827]">Order Lines</label>
                    <button
                      type="button"
                      onClick={addLine}
                      className="btn-secondary text-xs flex items-center space-x-1"
                      data-testid="add-po-line-btn"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Line</span>
                    </button>
                  </div>

                  {formData.lines.length === 0 ? (
                    <div className="text-center py-6 text-[#4B5563] bg-[#F3F4F6] rounded-sm">
                      <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" />
                      <p className="text-sm">No items added yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formData.lines.map((line, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-[#F3F4F6] rounded-sm">
                          <div className="flex-1">
                            <Select value={line.item_id} onValueChange={(v) => updateLine(index, 'item_id', v)}>
                              <SelectTrigger className="bg-white" data-testid={`po-line-item-${index}`}>
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
                          <div className="w-20">
                            <input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) => updateLine(index, 'quantity', parseInt(e.target.value) || 0)}
                              className="input-field mono bg-white text-sm"
                              placeholder="Qty"
                            />
                          </div>
                          <div className="w-24">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unit_price}
                              onChange={(e) => updateLine(index, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="input-field mono bg-white text-sm"
                              placeholder="Price"
                            />
                          </div>
                          <div className="w-20">
                            <Select value={String(line.gst_rate || 18)} onValueChange={(v) => updateLine(index, 'gst_rate', parseFloat(v))}>
                              <SelectTrigger className="bg-white text-xs">
                                <SelectValue placeholder="GST%" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0%</SelectItem>
                                <SelectItem value="5">5%</SelectItem>
                                <SelectItem value="12">12%</SelectItem>
                                <SelectItem value="18">18%</SelectItem>
                                <SelectItem value="28">28%</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-24 text-right mono font-medium text-sm">
                            ${(line.quantity * line.unit_price).toFixed(2)}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLine(index)}
                            className="p-1 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <div className="flex justify-end pt-2">
                        <div className="text-right space-y-1">
                          <div><span className="text-sm text-[#4B5563]">Subtotal: </span><span className="mono font-medium">${calculateTotal().toFixed(2)}</span></div>
                          <div><span className="text-sm text-[#4B5563]">Est. GST: </span><span className="mono font-medium">${formData.lines.reduce((sum, l) => sum + (l.quantity * l.unit_price * (l.gst_rate || 0) / 100), 0).toFixed(2)}</span></div>
                          <div><span className="text-sm text-[#4B5563]">Total: </span><span className="mono font-bold text-lg">${(calculateTotal() + formData.lines.reduce((sum, l) => sum + (l.quantity * l.unit_price * (l.gst_rate || 0) / 100), 0)).toFixed(2)}</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="Order notes..."
                    data-testid="po-notes-input"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                  <button type="button" onClick={() => setIsDialogOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary" 
                    disabled={formData.lines.length === 0}
                    data-testid="po-save-btn"
                  >
                    Create Purchase Order
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
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
              <X className="w-4 h-4" />
              <span>Clear</span>
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
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
            <FileText className="w-12 h-12 mb-2 text-[#9CA3AF]" />
            <p>No purchase orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table" data-testid="po-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Lines</th>
                  <th className="text-right">Subtotal</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => (
                  <tr key={po.id} data-testid={`po-row-${po.id}`}>
                    <td className="mono font-medium">{po.po_number}</td>
                    <td>
                      <span className="mono text-xs">{po.supplier?.code}</span>
                      <p className="text-sm">{po.supplier?.name}</p>
                    </td>
                    <td className="mono">{po.lines?.length || 0} items</td>
                    <td className="text-right mono">${(po.subtotal || po.total_amount || 0).toFixed(2)}</td>
                    <td className="text-right">
                      {po.total_tax > 0 ? (
                        <div className="text-xs">
                          <span className="mono font-medium">${(po.total_tax || 0).toFixed(2)}</span>
                          {po.is_inter_state ? (
                            <span className="block text-[#6B7280]">IGST</span>
                          ) : (
                            <span className="block text-[#6B7280]">CGST+SGST</span>
                          )}
                        </div>
                      ) : <span className="mono text-[#9CA3AF]">-</span>}
                    </td>
                    <td className="text-right mono font-semibold">${(po.total_amount || 0).toFixed(2)}</td>
                    <td>
                      <span className={`status-badge ${getStatusColor(po.status)}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="text-sm text-[#4B5563]">
                      {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      <div className="flex items-center space-x-1">
                        {po.status === 'draft' && canEdit && (
                          <button
                            onClick={() => handleStatusChange(po, 'sent')}
                            className="p-1 text-[#4B5563] hover:text-[#1D3557]"
                            title="Send PO"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {(po.status === 'sent' || po.status === 'partial') && canReceive && (
                          <button
                            onClick={() => handleReceive(po)}
                            className="p-1 text-[#4B5563] hover:text-[#03543F]"
                            title="Receive"
                            data-testid={`receive-po-${po.id}`}
                          >
                            <Package className="w-4 h-4" />
                          </button>
                        )}
                        {po.status === 'received' && (
                          <CheckCircle2 className="w-4 h-4 text-[#03543F]" />
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
    </div>
  );
}
