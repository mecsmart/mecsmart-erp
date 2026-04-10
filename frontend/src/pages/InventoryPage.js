import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  Package, 
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  AlertTriangle,
  Filter,
  X
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const transactionTypes = [
  { value: 'receive', label: 'Receive', icon: ArrowDownRight, color: 'text-[#03543F]' },
  { value: 'issue', label: 'Issue', icon: ArrowUpRight, color: 'text-[#9B1C1C]' },
  { value: 'adjust', label: 'Adjustment', icon: RotateCcw, color: 'text-[#1E429F]' },
];

export default function InventoryPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stock');
  const [showLowStock, setShowLowStock] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    item_id: '',
    transaction_type: 'receive',
    quantity: 1,
    notes: '',
  });

  const canCreate = ['admin', 'inventory_manager', 'production_manager'].includes(user?.role);

  useEffect(() => {
    fetchData();
  }, [showLowStock, categoryFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showLowStock) params.append('low_stock', 'true');
      if (categoryFilter) params.append('category', categoryFilter);
      
      const [inventoryRes, transactionsRes] = await Promise.all([
        api.get(`/api/inventory?${params.toString()}`),
        api.get('/api/inventory/transactions?limit=50'),
      ]);
      setInventory(inventoryRes.data);
      setTransactions(transactionsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransactionSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/inventory/transactions', transactionForm);
      setIsTransactionDialogOpen(false);
      resetTransactionForm();
      fetchData();
    } catch (error) {
      console.error('Failed to create transaction:', error);
      alert(error.response?.data?.detail || 'Failed to create transaction');
    }
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      item_id: '',
      transaction_type: 'receive',
      quantity: 1,
      notes: '',
    });
  };

  const isLowStock = (item) => item.current_stock <= item.reorder_point;

  const getTransactionIcon = (type) => {
    const txType = transactionTypes.find(t => t.value === type);
    if (!txType) return null;
    const Icon = txType.icon;
    return <Icon className={`w-4 h-4 ${txType.color}`} />;
  };

  const totalValue = inventory.reduce((sum, item) => sum + (item.current_stock * item.unit_cost), 0);
  const lowStockCount = inventory.filter(isLowStock).length;

  return (
    <div className="space-y-6" data-testid="inventory-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Inventory Management</h1>
          <p className="text-sm text-[#4B5563]">Track stock levels and inventory transactions</p>
        </div>
        {canCreate && (
          <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-transaction-btn">
                <Plus className="w-4 h-4" />
                <span>New Transaction</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">Record Inventory Transaction</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleTransactionSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Item *</label>
                  <Select 
                    value={transactionForm.item_id} 
                    onValueChange={(v) => setTransactionForm({ ...transactionForm, item_id: v })}
                  >
                    <SelectTrigger data-testid="transaction-item-select">
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventory.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.part_number} - {item.name} (Stock: {item.current_stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Transaction Type *</label>
                  <Select 
                    value={transactionForm.transaction_type} 
                    onValueChange={(v) => setTransactionForm({ ...transactionForm, transaction_type: v })}
                  >
                    <SelectTrigger data-testid="transaction-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {transactionTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={transactionForm.quantity}
                    onChange={(e) => setTransactionForm({ ...transactionForm, quantity: parseInt(e.target.value) || 1 })}
                    className="input-field mono"
                    required
                    data-testid="transaction-quantity-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Notes</label>
                  <textarea
                    value={transactionForm.notes}
                    onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="Transaction notes..."
                    data-testid="transaction-notes-input"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                  <button type="button" onClick={() => setIsTransactionDialogOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" data-testid="transaction-save-btn">
                    Record Transaction
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Total Items</p>
              <p className="kpi-value">{inventory.length}</p>
            </div>
            <Package className="w-8 h-8 text-[#457B9D]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Low Stock Alerts</p>
              <p className="kpi-value text-[#9B1C1C]">{lowStockCount}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-[#9B1C1C]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Total Inventory Value</p>
              <p className="kpi-value">${totalValue.toLocaleString()}</p>
            </div>
            <Package className="w-8 h-8 text-[#03543F]" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-[#F3F4F6] p-1 rounded-sm">
          <TabsTrigger 
            value="stock" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-stock"
          >
            Stock Levels
          </TabsTrigger>
          <TabsTrigger 
            value="transactions" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-transactions"
          >
            Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          {/* Filters */}
          <div className="card-flat p-4 mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLowStock}
                  onChange={(e) => setShowLowStock(e.target.checked)}
                  className="rounded"
                  data-testid="low-stock-filter"
                />
                <span className="text-sm font-medium text-[#111827]">Show Low Stock Only</span>
              </label>
              <Select value={categoryFilter || undefined} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-48" data-testid="inventory-category-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="raw_material">Raw Material</SelectItem>
                  <SelectItem value="component">Component</SelectItem>
                  <SelectItem value="sub_assembly">Sub-Assembly</SelectItem>
                  <SelectItem value="finished_good">Finished Good</SelectItem>
                </SelectContent>
              </Select>
              {(showLowStock || categoryFilter) && (
                <button 
                  onClick={() => { setShowLowStock(false); setCategoryFilter(''); }} 
                  className="btn-secondary flex items-center space-x-1"
                >
                  <X className="w-4 h-4" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : inventory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <Package className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No inventory items found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="inventory-table">
                  <thead>
                    <tr>
                      <th>Part Number</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th className="text-right">Current Stock</th>
                      <th className="text-right">Safety Stock</th>
                      <th className="text-right">Reorder Point</th>
                      <th className="text-right">Unit Cost</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((item) => (
                      <tr key={item.id} className={isLowStock(item) ? 'bg-[#FDE8E8]/30' : ''} data-testid={`inventory-row-${item.part_number}`}>
                        <td className="mono font-medium">{item.part_number}</td>
                        <td>
                          <div className="flex items-center space-x-2">
                            {isLowStock(item) && <AlertTriangle className="w-4 h-4 text-[#9B1C1C]" />}
                            <span>{item.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${
                            item.category === 'raw_material' ? 'bg-[#E1EFFE] text-[#1E429F]' :
                            item.category === 'component' ? 'bg-[#DEF7EC] text-[#03543F]' :
                            item.category === 'sub_assembly' ? 'bg-[#FDF6B2] text-[#723B13]' :
                            'bg-[#F3F4F6] text-[#4B5563]'
                          }`}>
                            {item.category.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={`text-right mono font-medium ${isLowStock(item) ? 'text-[#9B1C1C]' : ''}`}>
                          {item.current_stock} {item.unit_of_measure}
                        </td>
                        <td className="text-right mono">{item.safety_stock}</td>
                        <td className="text-right mono">{item.reorder_point}</td>
                        <td className="text-right mono">${item.unit_cost.toFixed(2)}</td>
                        <td className="text-right mono">${(item.current_stock * item.unit_cost).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <RotateCcw className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No transactions recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="transactions-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Item</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Previous</th>
                      <th className="text-right">New Stock</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} data-testid={`transaction-row-${tx.id}`}>
                        <td className="text-sm text-[#4B5563]">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>
                        <td>
                          <div className="flex items-center space-x-1">
                            {getTransactionIcon(tx.transaction_type)}
                            <span className={`text-sm font-medium ${
                              tx.transaction_type === 'receive' ? 'text-[#03543F]' :
                              tx.transaction_type === 'issue' ? 'text-[#9B1C1C]' :
                              'text-[#1E429F]'
                            }`}>
                              {tx.transaction_type}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="mono text-sm">{tx.item?.part_number || '-'}</span>
                          <p className="text-xs text-[#4B5563]">{tx.item?.name || '-'}</p>
                        </td>
                        <td className={`text-right mono font-medium ${
                          tx.transaction_type === 'receive' ? 'text-[#03543F]' :
                          tx.transaction_type === 'issue' ? 'text-[#9B1C1C]' :
                          'text-[#1E429F]'
                        }`}>
                          {tx.transaction_type === 'receive' ? '+' : tx.transaction_type === 'issue' ? '-' : ''}{tx.quantity}
                        </td>
                        <td className="text-right mono">{tx.previous_stock}</td>
                        <td className="text-right mono font-medium">{tx.new_stock}</td>
                        <td className="text-sm text-[#4B5563] max-w-xs truncate">{tx.notes || '-'}</td>
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
