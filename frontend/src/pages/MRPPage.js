import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { 
  Calculator, 
  ShoppingCart, 
  AlertTriangle,
  Package,
  TrendingUp,
  Calendar,
  DollarSign
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export default function MRPPage() {
  const [demand, setDemand] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('demand');

  useEffect(() => {
    fetchMRPData();
  }, []);

  const fetchMRPData = async () => {
    setLoading(true);
    try {
      const [demandRes, suggestionsRes] = await Promise.all([
        api.get('/api/mrp/demand'),
        api.get('/api/mrp/suggestions'),
      ]);
      setDemand(demandRes.data);
      setSuggestions(suggestionsRes.data);
    } catch (error) {
      console.error('Failed to fetch MRP data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalEstimatedCost = suggestions.reduce((sum, s) => sum + (s.estimated_cost || 0), 0);

  return (
    <div className="space-y-6" data-testid="mrp-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Material Requirements Planning</h1>
          <p className="text-sm text-[#4B5563]">Plan and manage material requirements based on production demand</p>
        </div>
        <button 
          onClick={fetchMRPData} 
          className="btn-primary flex items-center space-x-2"
          data-testid="refresh-mrp-btn"
        >
          <Calculator className="w-4 h-4" />
          <span>Recalculate MRP</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Items with Demand</p>
              <p className="kpi-value">{demand.length}</p>
            </div>
            <Package className="w-8 h-8 text-[#457B9D]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Purchase Suggestions</p>
              <p className="kpi-value">{suggestions.length}</p>
            </div>
            <ShoppingCart className="w-8 h-8 text-[#E3A008]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Low Stock Items</p>
              <p className="kpi-value text-[#9B1C1C]">
                {suggestions.filter(s => s.reason === 'below_reorder_point').length}
              </p>
            </div>
            <AlertTriangle className="w-8 h-8 text-[#9B1C1C]" />
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Est. Purchase Cost</p>
              <p className="kpi-value">${totalEstimatedCost.toLocaleString()}</p>
            </div>
            <DollarSign className="w-8 h-8 text-[#03543F]" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-[#F3F4F6] p-1 rounded-sm">
          <TabsTrigger 
            value="demand" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-demand"
          >
            Material Demand
          </TabsTrigger>
          <TabsTrigger 
            value="suggestions" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-suggestions"
          >
            Purchase Suggestions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="demand" className="mt-4">
          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : demand.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <TrendingUp className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No material demand from active production orders</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="demand-table">
                  <thead>
                    <tr>
                      <th>Part Number</th>
                      <th>Item Name</th>
                      <th className="text-right">Gross Req.</th>
                      <th className="text-right">On Hand</th>
                      <th className="text-right">Safety Stock</th>
                      <th className="text-right">Net Req.</th>
                      <th>Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demand.map((d, index) => (
                      <tr key={index} className={d.net_requirement > 0 ? 'bg-[#FDE8E8]/30' : ''} data-testid={`demand-row-${index}`}>
                        <td className="mono font-medium">{d.item?.part_number || '-'}</td>
                        <td>{d.item?.name || '-'}</td>
                        <td className="text-right mono">{d.gross_requirement}</td>
                        <td className="text-right mono">{d.on_hand}</td>
                        <td className="text-right mono">{d.safety_stock}</td>
                        <td className={`text-right mono font-medium ${d.net_requirement > 0 ? 'text-[#9B1C1C]' : 'text-[#03543F]'}`}>
                          {d.net_requirement}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {d.orders?.slice(0, 3).map((order, i) => (
                              <span key={i} className="status-badge bg-[#E1EFFE] text-[#1E429F]">
                                {order.order_number}
                              </span>
                            ))}
                            {d.orders?.length > 3 && (
                              <span className="status-badge bg-[#F3F4F6] text-[#4B5563]">
                                +{d.orders.length - 3}
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
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <ShoppingCart className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No purchase suggestions at this time</p>
                <p className="text-sm text-[#9CA3AF]">All items are above reorder points</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="suggestions-table">
                  <thead>
                    <tr>
                      <th>Part Number</th>
                      <th>Item Name</th>
                      <th>Reason</th>
                      <th className="text-right">Current Stock</th>
                      <th className="text-right">Suggested Qty</th>
                      <th className="text-right">Lead Time</th>
                      <th className="text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((s, index) => (
                      <tr key={index} data-testid={`suggestion-row-${index}`}>
                        <td className="mono font-medium">{s.item?.part_number || '-'}</td>
                        <td>{s.item?.name || '-'}</td>
                        <td>
                          <span className={`status-badge ${
                            s.reason === 'below_reorder_point' 
                              ? 'bg-[#FDE8E8] text-[#9B1C1C]' 
                              : 'bg-[#FDF6B2] text-[#723B13]'
                          }`}>
                            {s.reason === 'below_reorder_point' ? 'Low Stock' : 'MRP Demand'}
                          </span>
                        </td>
                        <td className="text-right mono">{s.current_stock}</td>
                        <td className="text-right mono font-medium text-[#1D3557]">{s.suggested_quantity}</td>
                        <td className="text-right mono">{s.lead_time_days}d</td>
                        <td className="text-right mono">${s.estimated_cost?.toFixed(2) || '0.00'}</td>
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
