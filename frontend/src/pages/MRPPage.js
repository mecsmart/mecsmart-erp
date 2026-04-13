import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Package, ShoppingCart, AlertTriangle, DollarSign, TrendingUp, ShoppingBag } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export default function MRPPage() {
  const { formatCurrency } = useCompanySettings();
  const [demand, setDemand] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('demand');
  const [selectedPO, setSelectedPO] = useState('');
  
  // PO creation from suggestions
  const [selectedItems, setSelectedItems] = useState({});
  const [poDialogOpen, setPODialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchData(); }, [selectedPO]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const demandUrl = selectedPO ? `/api/mrp/demand?production_order_id=${selectedPO}` : '/api/mrp/demand';
      const [demandRes, suggestionsRes, suppliersRes, poRes] = await Promise.all([
        api.get(demandUrl),
        api.get('/api/mrp/suggestions'),
        api.get('/api/suppliers'),
        api.get('/api/production'),
      ]);
      setDemand(demandRes.data);
      setSuggestions(suggestionsRes.data);
      setSuppliers(suppliersRes.data);
      setProductionOrders(poRes.data);
    } catch (error) {
      console.error('Failed to fetch MRP data:', error);
    } finally { setLoading(false); }
  };

  const totalEstimatedCost = suggestions.reduce((sum, s) => sum + (s.estimated_cost || 0), 0);

  const toggleItem = (itemId, item) => {
    setSelectedItems(prev => {
      const copy = { ...prev };
      if (copy[itemId]) {
        delete copy[itemId];
      } else {
        copy[itemId] = {
          item_id: itemId,
          quantity: item.suggested_quantity || 1,
          unit_price: item.item?.unit_cost || 0
        };
      }
      return copy;
    });
  };

  const toggleAll = () => {
    if (Object.keys(selectedItems).length === suggestions.length) {
      setSelectedItems({});
    } else {
      const all = {};
      suggestions.forEach(s => {
        all[s.item?.id] = {
          item_id: s.item?.id,
          quantity: s.suggested_quantity || 1,
          unit_price: s.item?.unit_cost || 0
        };
      });
      setSelectedItems(all);
    }
  };

  const updateSelectedQty = (itemId, qty) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], quantity: parseInt(qty) || 1 }
    }));
  };

  const handleCreatePO = async () => {
    if (!selectedSupplier || Object.keys(selectedItems).length === 0) return;
    setCreating(true);
    try {
      const { data } = await api.post('/api/purchase-orders/from-mrp', {
        supplier_id: selectedSupplier,
        items: Object.values(selectedItems)
      });
      alert(`Purchase Order ${data.po_number} created successfully!\nTotal: ${formatCurrency(data.total_amount)}`);
      setPODialogOpen(false);
      setSelectedItems({});
      setSelectedSupplier('');
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to create PO');
    } finally { setCreating(false); }
  };

  const selectedCount = Object.keys(selectedItems).length;

  return (
    <div className="space-y-6" data-testid="mrp-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#1D3557]">Material Requirements Planning</h1>
          <p className="text-sm text-[#4B5563]">Demand analysis and purchase suggestions (Raw Materials)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div><p className="kpi-label">Items with Demand</p><p className="kpi-value">{demand.length}</p></div>
            <Package className="w-8 h-8 text-[#457B9D]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div><p className="kpi-label">Purchase Suggestions</p><p className="kpi-value">{suggestions.length}</p></div>
            <ShoppingCart className="w-8 h-8 text-[#E3A008]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div><p className="kpi-label">Low Stock Items</p>
              <p className="kpi-value text-[#9B1C1C]">{suggestions.filter(s => s.reason === 'below_reorder_point').length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-[#9B1C1C]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div><p className="kpi-label">Est. Purchase Cost</p><p className="kpi-value">{formatCurrency(totalEstimatedCost)}</p></div>
            <DollarSign className="w-8 h-8 text-[#03543F]" />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-[#F3F4F6] p-1 rounded-sm">
          <TabsTrigger value="demand" className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium" data-testid="tab-demand">Material Demand</TabsTrigger>
          <TabsTrigger value="suggestions" className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium" data-testid="tab-suggestions">Purchase Suggestions</TabsTrigger>
        </TabsList>

        <TabsContent value="demand" className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <Select value={selectedPO || 'all'} onValueChange={(v) => setSelectedPO(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-72" data-testid="mrp-po-filter">
                <SelectValue placeholder="All Sales Orders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Outstanding Sales Orders</SelectItem>
                {productionOrders.filter(po => ['confirmed', 'planned', 'released', 'in_progress'].includes(po.status) && !['completed', 'cancelled'].includes(po.status)).map(po => (
                  <SelectItem key={po.id} value={po.id}>{po.order_number} - {po.item?.name || 'Unknown'} (Qty: {po.quantity})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPO && (
              <button onClick={() => setSelectedPO('')} className="text-xs text-[#4B5563] hover:text-[#1D3557]">Clear</button>
            )}
          </div>
          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>
            ) : demand.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <TrendingUp className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No material demand from active sales orders</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="demand-table">
                  <thead>
                    <tr>
                      <th>Part Number</th><th>Item Name</th><th className="text-right">Gross Req.</th>
                      <th className="text-right">On Hand</th><th className="text-right">Safety Stock</th>
                      <th className="text-right">Net Req.</th><th>PO Status</th><th>Sales Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demand.map((d, index) => (
                      <tr key={index} className={d.po_status === 'po_sent' ? 'bg-[#DEF7EC]/30' : d.net_requirement > 0 ? 'bg-[#FDE8E8]/30' : ''} data-testid={`demand-row-${index}`}>
                        <td className="mono font-medium">{d.item?.part_number || '-'}</td>
                        <td>{d.item?.name || '-'}</td>
                        <td className="text-right mono">{d.gross_requirement}</td>
                        <td className="text-right mono">{d.on_hand}</td>
                        <td className="text-right mono">{d.safety_stock}</td>
                        <td className="text-right mono font-medium">{d.net_requirement > 0 ? <span className="text-[#9B1C1C]">{d.net_requirement}</span> : <span className="text-[#03543F]">0</span>}</td>
                        <td>
                          {d.po_status === 'po_sent' && (
                            <span className="status-badge bg-[#DEF7EC] text-[#03543F]">PO Sent ({d.po_ordered_qty})</span>
                          )}
                          {d.po_status === 'partial_po' && (
                            <span className="status-badge bg-[#FDF6B2] text-[#723B13]">Partial PO ({d.po_ordered_qty}/{d.net_requirement})</span>
                          )}
                          {d.po_status === 'pending' && (
                            <span className="status-badge bg-[#FDE8E8] text-[#9B1C1C]">Pending</span>
                          )}
                        </td>
                        <td className="text-xs text-[#4B5563]">
                          {d.orders?.map(o => o.order_number).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          {selectedCount > 0 && (
            <div className="flex items-center justify-between bg-[#E1EFFE] border border-[#93C5FD] rounded-sm px-4 py-3 mb-4" data-testid="selected-banner">
              <span className="text-sm font-medium text-[#1E429F]">{selectedCount} item(s) selected</span>
              <button className="btn-primary flex items-center space-x-2 text-sm" onClick={() => setPODialogOpen(true)} data-testid="create-po-from-mrp-btn">
                <ShoppingBag className="w-4 h-4" /><span>Create Purchase Order</span>
              </button>
            </div>
          )}
          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>
            ) : suggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <ShoppingCart className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No purchase suggestions at this time</p>
                <p className="text-sm text-[#9CA3AF]">All items are above reorder points</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="suggestions-table">
                  <thead>
                    <tr>
                      <th className="w-10"><input type="checkbox" checked={selectedCount === suggestions.length && suggestions.length > 0} onChange={toggleAll} className="rounded border-[#D1D5DB]" data-testid="select-all-suggestions" /></th>
                      <th>Part Number</th><th>Item Name</th><th>Reason</th>
                      <th className="text-right">Current Stock</th><th className="text-right">Suggested Qty</th>
                      <th className="text-right">Lead Time</th><th className="text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((s, index) => (
                      <tr key={index} className={selectedItems[s.item?.id] ? 'bg-[#E1EFFE]/30' : ''} data-testid={`suggestion-row-${index}`}>
                        <td><input type="checkbox" checked={!!selectedItems[s.item?.id]} onChange={() => toggleItem(s.item?.id, s)} className="rounded border-[#D1D5DB]" /></td>
                        <td className="mono font-medium">{s.item?.part_number || '-'}</td>
                        <td>{s.item?.name || '-'}</td>
                        <td>
                          <span className={`status-badge ${s.reason === 'below_reorder_point' ? 'bg-[#FDE8E8] text-[#9B1C1C]' : 'bg-[#FDF6B2] text-[#723B13]'}`}>
                            {s.reason === 'below_reorder_point' ? 'Low Stock' : 'MRP Demand'}
                          </span>
                        </td>
                        <td className="text-right mono">{s.current_stock}</td>
                        <td className="text-right">
                          {selectedItems[s.item?.id] ? (
                            <input type="number" min="1" className="w-20 px-2 py-1 border border-[#D1D5DB] rounded-sm text-right mono text-sm" value={selectedItems[s.item?.id]?.quantity || s.suggested_quantity} onChange={e => updateSelectedQty(s.item?.id, e.target.value)} />
                          ) : (
                            <span className="mono font-medium text-[#1D3557]">{s.suggested_quantity}</span>
                          )}
                        </td>
                        <td className="text-right mono">{s.lead_time_days}d</td>
                        <td className="text-right mono">{formatCurrency(s.estimated_cost || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create PO Dialog */}
      <Dialog open={poDialogOpen} onOpenChange={setPODialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Create Purchase Order from MRP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-[#374151]">Select Supplier *</label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger data-testid="mrp-po-supplier-select"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.filter(s => s.status === 'active').map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-[#F3F4F6]"><th className="text-left py-2 px-3">Item</th><th className="text-right py-2 px-3">Qty</th><th className="text-right py-2 px-3">Unit Price</th><th className="text-right py-2 px-3">Amount</th></tr></thead>
                <tbody>
                  {Object.entries(selectedItems).map(([itemId, entry]) => {
                    const sug = suggestions.find(s => s.item?.id === itemId);
                    return (
                      <tr key={itemId} className="border-t">
                        <td className="py-2 px-3"><span className="mono text-xs">{sug?.item?.part_number}</span> {sug?.item?.name}</td>
                        <td className="text-right py-2 px-3 mono">{entry.quantity}</td>
                        <td className="text-right py-2 px-3 mono">{formatCurrency(entry.unit_price)}</td>
                        <td className="text-right py-2 px-3 mono font-medium">{formatCurrency(entry.quantity * entry.unit_price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#F3F4F6] font-semibold border-t">
                    <td colSpan={3} className="py-2 px-3 text-right">Subtotal (before GST):</td>
                    <td className="text-right py-2 px-3 mono">{formatCurrency(Object.values(selectedItems).reduce((s, e) => s + e.quantity * e.unit_price, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex justify-end space-x-2">
              <button className="btn-secondary" onClick={() => setPODialogOpen(false)}>Cancel</button>
              <button className="btn-primary flex items-center space-x-2" onClick={handleCreatePO} disabled={!selectedSupplier || creating} data-testid="confirm-create-po-btn">
                <ShoppingBag className="w-4 h-4" /><span>{creating ? 'Creating...' : 'Create PO'}</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
