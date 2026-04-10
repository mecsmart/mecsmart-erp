import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  Factory, 
  Edit2,
  Calendar,
  Filter,
  X
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
  { value: 'planned', label: 'Planned' },
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
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
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
      console.error('Failed to save production order:', error);
      alert(error.response?.data?.detail || 'Failed to save production order');
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
      case 'planned': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'released': return 'bg-[#FDF6B2] text-[#723B13]';
      case 'in_progress': return 'bg-[#E1EFFE] text-[#1E429F]';
      case 'completed': return 'bg-[#DEF7EC] text-[#03543F]';
      case 'cancelled': return 'bg-[#F3F4F6] text-[#4B5563]';
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
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Production Orders</h1>
          <p className="text-sm text-[#4B5563]">Manage manufacturing work orders</p>
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
                <span>New Order</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">{editingOrder ? 'Edit Production Order' : 'Create Production Order'}</DialogTitle>
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
                          {statusOptions.map((opt) => (
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
            <Factory className="w-12 h-12 mb-2 text-[#9CA3AF]" />
            <p>No production orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table" data-testid="production-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Product</th>
                  <th>BOM</th>
                  <th className="text-right">Quantity</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} data-testid={`production-row-${order.id}`}>
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
                      {canEdit && (
                        <button
                          onClick={() => handleEdit(order)}
                          className="p-1 text-[#4B5563] hover:text-[#1D3557]"
                          data-testid={`edit-production-${order.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
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
