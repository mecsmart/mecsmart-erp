import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Package, ShoppingCart, AlertTriangle, DollarSign, TrendingUp, ShoppingBag, Search, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { SearchableSelect } from '../components/SearchableSelect';

// Round to 2 decimals; ALWAYS shows 2-decimal precision (e.g. 5 → "5.00",
// 5.20 → "5.20", 5.234 → "5.23"). Decimals are critical in MRP/PO so users
// can see exact qty/cost values rather than apparent integers.
const fmtQty = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
};

export default function MRPPage() {
  const { formatCurrency } = useCompanySettings();
  const [demand, setDemand] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('demand');
  const [selectedPO, setSelectedPO] = useState('');

  // Unified PO creation dialog (shared between Demand & Suggestions tabs)
  const [selectedItems, setSelectedItems] = useState({});
  const [poDialogOpen, setPODialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [creating, setCreating] = useState(false);
  const [mrpSearch, setMrpSearch] = useState('');

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

  const toggleSuggestion = (itemId, item) => {
    setSelectedItems(prev => {
      const copy = { ...prev };
      if (copy[itemId]) { delete copy[itemId]; }
      else {
        copy[itemId] = {
          item_id: itemId,
          part_number: item.item?.part_number || '',
          name: item.item?.name || '',
          description: item.item?.description || item.item?.name || '',
          hsn_code: item.item?.hsn_code || '',
          uom: item.item?.unit_of_measure || 'pcs',
          quantity: parseFloat((item.suggested_quantity || 1).toFixed(2)),
          unit_price: parseFloat((item.item?.unit_cost || 0).toFixed(2)),
          gst_rate: item.item?.gst_rate ?? 18,
        };
      }
      return copy;
    });
  };

  const toggleAllSuggestions = () => {
    const eligible = suggestions.filter(s => s.po_status !== 'po_sent');
    if (eligible.every(s => selectedItems[s.item?.id])) {
      const next = { ...selectedItems };
      eligible.forEach(s => { delete next[s.item?.id]; });
      setSelectedItems(next);
    } else {
      const next = { ...selectedItems };
      eligible.forEach(s => {
        next[s.item?.id] = next[s.item?.id] || {
          item_id: s.item?.id,
          part_number: s.item?.part_number || '',
          name: s.item?.name || '',
          description: s.item?.description || s.item?.name || '',
          hsn_code: s.item?.hsn_code || '',
          uom: s.item?.unit_of_measure || 'pcs',
          quantity: parseFloat((s.suggested_quantity || 1).toFixed(2)),
          unit_price: parseFloat((s.item?.unit_cost || 0).toFixed(2)),
          gst_rate: s.item?.gst_rate ?? 18,
        };
      });
      setSelectedItems(next);
    }
  };

  const toggleDemand = (itemId, d) => {
    setSelectedItems(prev => {
      const copy = { ...prev };
      if (copy[itemId]) { delete copy[itemId]; }
      else {
        copy[itemId] = {
          item_id: itemId,
          part_number: d.item?.part_number || '',
          name: d.item?.name || '',
          description: d.item?.description || d.item?.name || '',
          hsn_code: d.item?.hsn_code || '',
          uom: d.item?.unit_of_measure || 'pcs',
          quantity: parseFloat((d.net_requirement || 1).toFixed(2)),
          unit_price: parseFloat((d.item?.unit_cost || 0).toFixed(2)),
          gst_rate: d.item?.gst_rate ?? 18,
        };
      }
      return copy;
    });
  };

  const updateDialogField = (itemId, field, value) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value }
    }));
  };

  const removeFromDialog = (itemId) => {
    setSelectedItems(prev => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
  };

  const handleCreatePO = async () => {
    if (!selectedSupplier || Object.keys(selectedItems).length === 0) return;
    setCreating(true);
    try {
      const payload = Object.values(selectedItems).map(i => ({
        item_id: i.item_id,
        description: i.description || '',
        quantity: parseFloat(i.quantity) || 1,
        unit_price: parseFloat(i.unit_price) || 0,
      }));
      const { data } = await api.post('/api/purchase-orders/from-mrp', {
        supplier_id: selectedSupplier,
        items: payload
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
  const dialogSubtotal = Object.values(selectedItems).reduce((s, e) => s + (parseFloat(e.quantity) || 0) * (parseFloat(e.unit_price) || 0), 0);
  const dialogGST = Object.values(selectedItems).reduce((s, e) => {
    const amt = (parseFloat(e.quantity) || 0) * (parseFloat(e.unit_price) || 0);
    return s + (amt * (parseFloat(e.gst_rate) || 0) / 100);
  }, 0);

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

      <div className="card-flat p-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input type="text" value={mrpSearch} onChange={(e) => setMrpSearch(e.target.value)} placeholder="Search by part number or name..." className="search-input text-sm" data-testid="mrp-search-input" />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedItems({}); }} className="space-y-4">
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

          {selectedCount > 0 && activeTab === 'demand' && (
            <div className="flex items-center justify-between bg-[#E1EFFE] border border-[#93C5FD] rounded-sm px-4 py-3 mb-4" data-testid="demand-selected-banner">
              <span className="text-sm font-medium text-[#1E429F]">{selectedCount} item(s) selected</span>
              <button className="btn-primary flex items-center space-x-2 text-sm" onClick={() => setPODialogOpen(true)} data-testid="create-po-from-demand-btn">
                <ShoppingBag className="w-4 h-4" /><span>Create Purchase Order</span>
              </button>
            </div>
          )}

          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>
            ) : demand.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <TrendingUp className="w-12 h-12 mb-2 text-[#9CA3AF]" /><p>No material demand from active sales orders</p>
              </div>
            ) : (
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="demand-table">
                  <thead>
                    <tr>
                      <th className="w-10">
                        <input type="checkbox"
                          checked={(() => {
                            const eligible = demand.filter(d => (d.net_requirement || 0) > 0 && d.po_status !== 'po_sent');
                            return eligible.length > 0 && eligible.every(d => selectedItems[d.item?.id]);
                          })()}
                          onChange={() => {
                            const eligible = demand.filter(d => (d.net_requirement || 0) > 0 && d.po_status !== 'po_sent');
                            const allOn = eligible.every(d => selectedItems[d.item?.id]);
                            const next = { ...selectedItems };
                            if (allOn) { eligible.forEach(d => { delete next[d.item?.id]; }); }
                            else {
                              eligible.forEach(d => {
                                next[d.item?.id] = next[d.item?.id] || {
                                  item_id: d.item?.id, part_number: d.item?.part_number || '', name: d.item?.name || '',
                                  description: d.item?.description || d.item?.name || '',
                                  hsn_code: d.item?.hsn_code || '', uom: d.item?.unit_of_measure || 'pcs',
                                  quantity: parseFloat((d.net_requirement || 1).toFixed(2)),
                                  unit_price: parseFloat((d.item?.unit_cost || 0).toFixed(2)),
                                  gst_rate: d.item?.gst_rate ?? 18,
                                };
                              });
                            }
                            setSelectedItems(next);
                          }}
                          data-testid="select-all-demand"
                          className="rounded border-[#D1D5DB]"
                        />
                      </th>
                      <th>Part Number</th><th>Item Name</th><th className="text-right">Gross Req.</th>
                      <th className="text-right">On Hand</th><th className="text-right">Allocated (MO)</th><th className="text-right">Shortfall (MO)</th><th className="text-right">Safety Stock</th>
                      <th className="text-right">Net Req.</th><th>PO Status</th><th>Sales Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demand.filter(d => {
                      if (!mrpSearch.trim()) return true;
                      const q = mrpSearch.toLowerCase();
                      return d.item?.part_number?.toLowerCase().includes(q) || d.item?.name?.toLowerCase().includes(q);
                    }).map((d, index) => {
                      const eligible = (d.net_requirement || 0) > 0 && d.po_status !== 'po_sent';
                      const checked = !!selectedItems[d.item?.id];
                      return (
                        <tr key={index} className={d.po_status === 'po_sent' ? 'bg-[#DEF7EC]/30' : checked ? 'bg-[#E1EFFE]/30' : d.net_requirement > 0 ? 'bg-[#FDE8E8]/30' : ''} data-testid={`demand-row-${index}`}>
                          <td>
                            <input type="checkbox" checked={checked} disabled={!eligible}
                              onChange={() => toggleDemand(d.item?.id, d)}
                              className="rounded border-[#D1D5DB]"
                              data-testid={`demand-row-checkbox-${index}`}
                            />
                          </td>
                          <td className="mono font-medium">{d.item?.part_number || '-'}</td>
                          <td>{d.item?.name || '-'}</td>
                          <td className="text-right mono">{fmtQty(d.gross_requirement)}</td>
                          <td className="text-right mono">{fmtQty(d.on_hand)}</td>
                          <td className="text-right mono">{d.allocated_for_mo ? <span className="text-[#03543F] font-medium">{fmtQty(d.allocated_for_mo)}</span> : <span className="text-[#9CA3AF]">0</span>}</td>
                          <td className="text-right mono">{d.shortfall_from_mo ? <span className="text-[#9B1C1C] font-medium">{fmtQty(d.shortfall_from_mo)}</span> : <span className="text-[#9CA3AF]">0</span>}</td>
                          <td className="text-right mono">{fmtQty(d.safety_stock)}</td>
                          <td className="text-right mono font-medium">{d.net_requirement > 0 ? <span className="text-[#9B1C1C]">{fmtQty(d.net_requirement)}</span> : <span className="text-[#03543F]">0</span>}</td>
                          <td>
                            {d.po_status === 'po_sent' && <span className="status-badge bg-[#DEF7EC] text-[#03543F]">PO Sent ({fmtQty(d.po_ordered_qty)})</span>}
                            {d.po_status === 'partial_po' && <span className="status-badge bg-[#FDF6B2] text-[#723B13]">Partial ({fmtQty(d.po_ordered_qty)}/{fmtQty(d.net_requirement)})</span>}
                            {d.po_status === 'pending' && <span className="status-badge bg-[#FDE8E8] text-[#9B1C1C]">Pending</span>}
                          </td>
                          <td className="text-xs text-[#4B5563]">
                            {d.orders?.map(o => o.order_number).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          {selectedCount > 0 && activeTab === 'suggestions' && (
            <div className="flex items-center justify-between bg-[#E1EFFE] border border-[#93C5FD] rounded-sm px-4 py-3 mb-4" data-testid="selected-banner">
              <span className="text-sm font-medium text-[#1E429F]">{selectedCount} item(s) selected</span>
              {Object.values(selectedItems).some(s => {
                const sugg = suggestions.find(sg => sg.item?.id === s.item_id);
                return !sugg || sugg.po_status !== 'po_sent';
              }) ? (
                <button className="btn-primary flex items-center space-x-2 text-sm" onClick={() => setPODialogOpen(true)} data-testid="create-po-from-mrp-btn">
                  <ShoppingBag className="w-4 h-4" /><span>Create Purchase Order</span>
                </button>
              ) : (
                <span className="text-sm font-medium text-[#03543F] bg-[#DEF7EC] px-3 py-1 rounded">All selected items already have POs</span>
              )}
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
              <div className="overflow-x-auto sticky-header-scroll">
                <table className="w-full data-table" data-testid="suggestions-table">
                  <thead>
                    <tr>
                      <th className="w-10"><input type="checkbox" checked={(() => {
                        const eligible = suggestions.filter(s => s.po_status !== 'po_sent');
                        return eligible.length > 0 && eligible.every(s => selectedItems[s.item?.id]);
                      })()} onChange={toggleAllSuggestions} className="rounded border-[#D1D5DB]" data-testid="select-all-suggestions" /></th>
                      <th>Part Number</th><th>Item Name</th><th>Reason</th>
                      <th className="text-right">Current Stock</th><th className="text-right">Suggested Qty</th>
                      <th>PO Status</th>
                      <th className="text-right">Lead Time</th><th className="text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.filter(s => {
                      if (!mrpSearch.trim()) return true;
                      const q = mrpSearch.toLowerCase();
                      return s.item?.part_number?.toLowerCase().includes(q) || s.item?.name?.toLowerCase().includes(q);
                    }).map((s, index) => (
                      <tr key={index} className={s.po_status === 'po_sent' ? 'bg-[#DEF7EC]/30' : selectedItems[s.item?.id] ? 'bg-[#E1EFFE]/30' : ''} data-testid={`suggestion-row-${index}`}>
                        <td><input type="checkbox" checked={!!selectedItems[s.item?.id]} onChange={() => toggleSuggestion(s.item?.id, s)} disabled={s.po_status === 'po_sent'} className="rounded border-[#D1D5DB]" /></td>
                        <td className="mono font-medium">{s.item?.part_number || '-'}</td>
                        <td>{s.item?.name || '-'}</td>
                        <td>
                          <span className={`status-badge ${s.reason === 'below_reorder_point' ? 'bg-[#FDE8E8] text-[#9B1C1C]' : 'bg-[#FDF6B2] text-[#723B13]'}`}>
                            {s.reason === 'below_reorder_point' ? 'Low Stock' : 'MRP Demand'}
                          </span>
                        </td>
                        <td className="text-right mono">{fmtQty(s.current_stock)}</td>
                        <td className="text-right mono font-medium text-[#1D3557]">{fmtQty(s.suggested_quantity)}</td>
                        <td>
                          {s.po_status === 'po_sent' && <span className="status-badge bg-[#DEF7EC] text-[#03543F]">PO Sent ({fmtQty(s.po_ordered_qty)})</span>}
                          {s.po_status === 'partial_po' && <span className="status-badge bg-[#FDF6B2] text-[#723B13]">Partial ({fmtQty(s.po_ordered_qty)}/{fmtQty(s.suggested_quantity)})</span>}
                          {s.po_status === 'pending' && <span className="status-badge bg-[#FDE8E8] text-[#9B1C1C]">Pending</span>}
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

      {/* Create PO Dialog — wide, line-item editor styled like manual PO page */}
      <Dialog open={poDialogOpen} onOpenChange={setPODialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Create Purchase Order from MRP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Supplier *</label>
                <SearchableSelect
                  options={suppliers.filter(s => s.status === 'active')}
                  value={selectedSupplier}
                  onChange={setSelectedSupplier}
                  getLabel={(s) => s.name || ''}
                  getSecondary={(s) => s.code || ''}
                  matchFields={['name', 'code', 'gstin']}
                  placeholder="Type supplier code / name / GSTIN…"
                  testId="mrp-po-supplier-select"
                />
              </div>
            </div>

            {Object.keys(selectedItems).length === 0 ? (
              <div className="text-center py-8 text-[#9CA3AF] border border-dashed border-[#D1D5DB] rounded-sm">
                No items selected
              </div>
            ) : (
              <div className="border border-[#E5E7EB] rounded-sm">
                <table className="w-full text-xs po-lines-compact" data-testid="mrp-po-lines-table">
                  <style>{`
                    .po-lines-compact td { padding: 4px 6px; vertical-align: middle; }
                    .po-lines-compact .cell-input {
                      width: 100%; padding: 3px 6px; border: 1px solid transparent;
                      border-radius: 2px; background: transparent; font-size: 12px;
                      font-family: 'Courier New', monospace; outline: none;
                    }
                    .po-lines-compact .cell-input:hover { border-color: #D1D5DB; background: #fff; }
                    .po-lines-compact .cell-input:focus { border-color: #1D3557; background: #fff; }
                    .po-lines-compact .cell-input.num { text-align: right; }
                    .po-lines-compact input[type=number]::-webkit-outer-spin-button,
                    .po-lines-compact input[type=number]::-webkit-inner-spin-button {
                      -webkit-appearance: none; margin: 0;
                    }
                    .po-lines-compact input[type=number] { -moz-appearance: textfield; }
                    .po-lines-compact .gst-select {
                      width: 100%; height: 22px; padding: 0 4px;
                      border: 1px solid transparent; border-radius: 2px;
                      background: transparent; font-size: 12px; font-family: 'Courier New', monospace;
                    }
                    .po-lines-compact .gst-select:hover { border-color: #D1D5DB; background: #fff; }
                    .po-lines-compact tr { border-bottom: 1px solid #E5E7EB; }
                    .po-lines-compact tr:last-child { border-bottom: none; }
                  `}</style>
                  <colgroup>
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '3%' }} />
                  </colgroup>
                  <thead className="bg-[#1D3557] text-white">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-semibold">Part No. / Name</th>
                      <th className="px-2 py-1.5 font-semibold">HSN</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Qty</th>
                      <th className="px-2 py-1.5 font-semibold">UOM</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Rate</th>
                      <th className="px-2 py-1.5 font-semibold">GST%</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Total Amount</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selectedItems).map(([itemId, entry], idx) => {
                      const lineAmount = (parseFloat(entry.quantity) || 0) * (parseFloat(entry.unit_price) || 0);
                      return (
                        <tr key={itemId} className="bg-[#F9FAFB]" data-testid={`mrp-po-line-row-${idx}`}>
                          <td>
                            <div className="px-1">
                              <div className="mono text-[12px] font-semibold text-[#1D3557]">{entry.part_number || '-'}</div>
                              <div className="text-[11px] text-[#4B5563]">{entry.name}</div>
                              <input
                                type="text"
                                value={entry.description || ''}
                                onChange={(e) => updateDialogField(itemId, 'description', e.target.value)}
                                placeholder="Description (printed on PO)"
                                className="mt-1 w-full px-2 py-0.5 border border-dashed border-[#D1D5DB] rounded-sm text-[11px] italic bg-transparent focus:bg-white focus:border-[#1D3557] focus:border-solid focus:outline-none"
                                data-testid={`mrp-po-line-description-${idx}`}
                              />
                            </div>
                          </td>
                          <td>
                            <input type="text" value={entry.hsn_code || ''}
                              onChange={(e) => updateDialogField(itemId, 'hsn_code', e.target.value)}
                              className="cell-input" data-testid={`mrp-po-line-hsn-${idx}`} />
                          </td>
                          <td>
                            <input type="number" min="0" step="any" value={entry.quantity}
                              onChange={(e) => updateDialogField(itemId, 'quantity', parseFloat(e.target.value) || 0)}
                              className="cell-input num" data-testid={`mrp-po-line-qty-${idx}`} />
                          </td>
                          <td>
                            <input type="text" value={entry.uom || ''}
                              onChange={(e) => updateDialogField(itemId, 'uom', e.target.value)}
                              className="cell-input" data-testid={`mrp-po-line-uom-${idx}`} />
                          </td>
                          <td>
                            <input type="number" min="0" step="0.01" value={entry.unit_price}
                              onChange={(e) => updateDialogField(itemId, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="cell-input num" data-testid={`mrp-po-line-rate-${idx}`} />
                          </td>
                          <td>
                            <select value={String(entry.gst_rate ?? 18)}
                              onChange={(e) => updateDialogField(itemId, 'gst_rate', parseFloat(e.target.value))}
                              className="gst-select" data-testid={`mrp-po-line-gst-${idx}`}>
                              {[0,5,12,18,28].map(r => <option key={r} value={String(r)}>{r}%</option>)}
                            </select>
                          </td>
                          <td className="text-right mono font-medium">{lineAmount.toFixed(2)}</td>
                          <td className="text-center">
                            <button type="button" onClick={() => removeFromDialog(itemId)}
                              className="p-1 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Remove line"
                              data-testid={`mrp-po-line-remove-${idx}`}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {Object.keys(selectedItems).length > 0 && (
              <div className="flex justify-end pt-2">
                <div className="text-right space-y-1 min-w-[220px]">
                  <div className="flex justify-between"><span className="text-sm text-[#4B5563]">Subtotal:</span><span className="mono font-medium">{formatCurrency(dialogSubtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-[#4B5563]">Est. GST:</span><span className="mono font-medium">{formatCurrency(dialogGST)}</span></div>
                  <div className="flex justify-between border-t border-[#D1D5DB] pt-1"><span className="text-sm font-semibold">Total:</span><span className="mono font-bold text-lg">{formatCurrency(dialogSubtotal + dialogGST)}</span></div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2 border-t border-[#E5E7EB] pt-3">
              <button className="btn-secondary" onClick={() => setPODialogOpen(false)}>Cancel</button>
              <button className="btn-primary flex items-center space-x-2"
                onClick={handleCreatePO}
                disabled={!selectedSupplier || creating || Object.keys(selectedItems).length === 0}
                data-testid="confirm-create-po-btn">
                <ShoppingBag className="w-4 h-4" /><span>{creating ? 'Creating...' : 'Create PO'}</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
