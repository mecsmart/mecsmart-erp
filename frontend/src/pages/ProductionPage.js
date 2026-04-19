import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  Factory, 
  Edit2,
  Calendar,
  Filter,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'released', label: 'Released' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function ProductionPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [boms, setBoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [cancelConfirm, setCancelConfirm] = useState({ open: false, order: null });
  const [formData, setFormData] = useState({
    bom_id: '',
    quantity: 1,
    due_date: '',
    priority: 'medium',
    notes: '',
  });

  const canEdit = ['admin', 'production_manager'].includes(user?.role);

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const [ordersRes, bomsRes] = await Promise.all([
        api.get(`/api/production${params}`),
        api.get('/api/bom?status=active'),
      ]);
      setOrders(ordersRes.data);
      setBoms(bomsRes.data);
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
        due_date: new Date(formData.due_date).toISOString(),
      };
      
      if (editingOrder) {
        await api.put(`/api/production/${editingOrder.id}`, {
          quantity: formData.quantity,
          due_date: payload.due_date,
          priority: formData.priority,
          status: formData.status,
          notes: formData.notes,
        });
      } else {
        await api.post('/api/production', payload);
      }
      setIsDialogOpen(false);
      setEditingOrder(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Failed to save sales order:', error);
      alert(error.response?.data?.detail || 'Failed to save sales order');
    }
  };

  const handleEdit = (order) => {
    setEditingOrder(order);
    setFormData({
      bom_id: order.bom_id,
      quantity: order.quantity,
      due_date: order.due_date ? order.due_date.split('T')[0] : '',
      priority: order.priority,
      status: order.status,
      notes: order.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleConfirm = async (order) => {
    try {
      await api.post(`/api/production/${order.id}/confirm`);
      toast.success(`Sales Order ${order.order_number} confirmed`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm order');
    }
  };

  const handleCancel = (order) => {
    // Open confirmation dialog (Shadcn). window.confirm is unreliable in iframes.
    setCancelConfirm({ open: true, order });
  };

  const confirmCancel = async () => {
    const order = cancelConfirm.order;
    if (!order) return;
    try {
      const { data } = await api.post(`/api/production/${order.id}/cancel`);
      let msg = data.message || `Sales Order ${order.order_number} cancelled`;
      if (data.cancelled_mos?.length > 0) msg += ` | MOs: ${data.cancelled_mos.join(', ')}`;
      toast.success(msg);
      setCancelConfirm({ open: false, order: null });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel order');
      setCancelConfirm({ open: false, order: null });
    }
  };

  const resetForm = () => {
    setFormData({
      bom_id: '',
      quantity: 1,
      due_date: '',
      priority: 'medium',
      notes: '',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-[#F3F4F6] text-[#4B5563]';
      case 'confirmed': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'released': return 'bg-[#FDF6B2] text-[#723B13]';
      case 'in_progress': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'completed': return 'bg-[#DEF7EC] text-[#03543F]';
      case 'cancelled': return 'bg-[#FDE8E8] text-[#9B1C1C]';
      default: return 'bg-[#F3F4F6] text-[#4B5563]';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'priority-urgent';
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return 'priority-medium';
    }
  };

  return (
    <div className="space-y-6" data-testid="production-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Sales Orders</h1>
          <p className="text-sm text-[#4B5563]">Manage sales orders for manufacturing</p>
        </div>
        {canEdit && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingOrder(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-production-btn">
                <Plus className="w-4 h-4" />
                <span>New Sales Order</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">{editingOrder ? 'Edit Sales Order' : 'Create Sales Order'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">BOM *</label>
                  <Select 
                    value={formData.bom_id} 
                    onValueChange={(v) => setFormData({ ...formData, bom_id: v })}
                    disabled={!!editingOrder}
                  >
                    <SelectTrigger data-testid="production-bom-select">
                      <SelectValue placeholder="Select BOM" />
                    </SelectTrigger>
                    <SelectContent>
                      {boms.map((bom) => (
                        <SelectItem key={bom.id} value={bom.id}>
                          {bom.parent_item?.part_number} - {bom.name} (Rev {bom.revision})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                      className="input-field mono"
                      required
                      data-testid="production-quantity-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Due Date *</label>
                    <input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      className="input-field"
                      required
                      data-testid="production-due-date-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Priority</label>
                    <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                      <SelectTrigger data-testid="production-priority-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {priorityOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {editingOrder && (
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Status</label>
                      <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                        <SelectTrigger data-testid="production-status-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.filter(opt => !['cancelled'].includes(opt.value)).map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    data-testid="production-notes-input"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                  <button type="button" onClick={() => setIsDialogOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" data-testid="production-save-btn">
                    {editingOrder ? 'Update Order' : 'Create Order'}
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
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search order #, product..."
              className="input-field pl-9 text-sm"
              data-testid="so-search-input"
            />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-48" data-testid="production-status-filter">
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
          {(statusFilter || searchQuery) && (
            <button onClick={() => { setStatusFilter(''); setSearchQuery(''); }} className="btn-secondary flex items-center space-x-1">
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
            <Factory className="w-12 h-12 mb-2 text-[#9CA3AF]" />
            <p>No sales orders found</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-260px)] border-t border-[#E5E7EB]">
            <table className="w-full data-table" data-testid="production-table">
              <thead className="sticky top-0 z-10 bg-white shadow-sm">
                <tr>
                  <th>Order #</th>
                  <th>Product</th>
                  <th>BOM</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">MO Qty</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.filter(order => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    (order.order_number || '').toLowerCase().includes(q) ||
                    (order.item?.part_number || '').toLowerCase().includes(q) ||
                    (order.item?.name || '').toLowerCase().includes(q) ||
                    (order.bom?.name || '').toLowerCase().includes(q)
                  );
                }).map((order) => (
                  <tr key={order.id} className={order.status === 'cancelled' ? 'opacity-50' : ''} data-testid={`production-row-${order.id}`}>
                    <td className="mono font-medium">{order.order_number}</td>
                    <td>
                      <span className="mono text-sm">{order.item?.part_number || '-'}</span>
                      <p className="text-xs text-[#4B5563]">{order.item?.name || '-'}</p>
                    </td>
                    <td>
                      <span className="text-sm">{order.bom?.name || '-'}</span>
                      <p className="text-xs text-[#4B5563] mono">Rev {order.bom?.revision || '-'}</p>
                    </td>
                    <td className="text-right mono font-medium">{order.quantity}</td>
                    <td className="text-right">
                      <span className="mono text-sm">{order.mo_qty_created || 0}/{order.quantity}</span>
                      {(order.mo_qty_created || 0) >= order.quantity && (
                        <p className="text-[10px] text-[#03543F]">Fully covered</p>
                      )}
                      {(order.mo_qty_created || 0) > 0 && (order.mo_qty_created || 0) < order.quantity && (
                        <p className="text-[10px] text-[#723B13]">Balance: {order.quantity - (order.mo_qty_created || 0)}</p>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${getPriorityColor(order.priority)}`}>
                        {order.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusColor(order.status)}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center space-x-1 text-sm text-[#4B5563]">
                        <Calendar className="w-4 h-4" />
                        <span>{order.due_date ? new Date(order.due_date).toLocaleDateString() : '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center space-x-1">
                        {/* Confirm button - only for draft */}
                        {canEdit && order.status === 'draft' && (
                          <button
                            onClick={() => handleConfirm(order)}
                            className="btn-secondary text-xs flex items-center space-x-1 text-[#03543F] border-[#03543F] hover:bg-[#DEF7EC]"
                            data-testid={`confirm-so-${order.id}`}
                            title="Confirm Order"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Confirm</span>
                          </button>
                        )}
                        {/* Edit button - draft and confirmed only, and not fully covered by MOs */}
                        {canEdit && ['draft', 'confirmed'].includes(order.status) && (order.mo_qty_created || 0) < order.quantity && (
                          <button
                            onClick={() => handleEdit(order)}
                            className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded"
                            data-testid={`edit-production-${order.id}`}
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {/* Cancel button - any status except cancelled/completed */}
                        {canEdit && !['cancelled', 'completed'].includes(order.status) && (
                          <button
                            onClick={() => handleCancel(order)}
                            className="p-1.5 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded"
                            data-testid={`cancel-so-${order.id}`}
                            title="Cancel Order"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {/* Cancelled indicator */}
                        {order.status === 'cancelled' && (
                          <span className="text-xs text-[#9B1C1C] flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Cancelled
                          </span>
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

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelConfirm.open} onOpenChange={(o) => { if (!o) setCancelConfirm({ open: false, order: null }); }}>
        <DialogContent className="max-w-md" data-testid="cancel-so-dialog">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center gap-2 text-[#9B1C1C]">
              <AlertTriangle className="w-5 h-5" />
              Cancel Sales Order?
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-[#374151]">
              Are you sure you want to cancel <span className="font-semibold mono">{cancelConfirm.order?.order_number}</span>?
            </p>
            <div className="bg-[#FDE8E8] border border-[#FDE8E8] rounded-sm p-3 text-xs text-[#9B1C1C]">
              <p className="font-semibold mb-1">This will:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Cancel all linked Manufacturing Orders</li>
                <li>Reverse any reserved/consumed stock</li>
                <li>Close open Job Cards for this SO</li>
              </ul>
              <p className="mt-2 font-semibold">This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setCancelConfirm({ open: false, order: null })} className="btn-secondary" data-testid="cancel-so-no-btn">
              No, Keep Order
            </button>
            <button onClick={confirmCancel} className="bg-[#9B1C1C] hover:bg-[#7F1D1D] text-white px-4 py-2 rounded-sm text-sm font-medium flex items-center gap-1" data-testid="cancel-so-yes-btn">
              <XCircle className="w-4 h-4" />
              Yes, Cancel Order
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
