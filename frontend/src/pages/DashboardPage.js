import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useAuth } from '../context/AuthContext';
import { 
  Package, 
  FileStack, 
  ClipboardCheck, 
  AlertTriangle,
  TrendingUp,
  Factory,
  ShoppingCart,
  ArrowUpRight,
} from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/api/dashboard/stats');
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Permission helpers — gate KPI navigation + quick actions on the granular
  // permission map. Admins always pass.
  const isAdmin = user?.role === 'admin' || user?.is_admin_group;
  const canView = (mod) => isAdmin || hasPermission(mod, 'view');
  const canCreate = (mod) => isAdmin || hasPermission(mod, 'create');

  // Click handler that respects view permission. If the user can't view the
  // target module, the tile becomes a passive card (no navigation, lock icon).
  const navIfAllowed = (mod, path) => () => {
    if (canView(mod)) navigate(path);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="dashboard-page">
      <div>
        <h1 className="text-xl font-bold font-[Chivo] text-[#111827]">Dashboard</h1>
        <p className="text-xs text-[#4B5563]">Overview of your manufacturing operations</p>
      </div>

      {/* KPI Cards — clickable IF the user has view permission on the target module */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={navIfAllowed('items', '/items')}
          disabled={!canView('items')}
          className="kpi-card text-left hover:shadow-md hover:border-[#1D3557] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:border-[#E5E7EB]"
          data-testid="kpi-total-items"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Total Items</p>
              <p className="kpi-value">{stats?.inventory?.total_items || 0}</p>
            </div>
            <div className="w-12 h-12 bg-[#E1EFFE] rounded-sm flex items-center justify-center">
              <Package className="w-6 h-6 text-[#1E429F]" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={navIfAllowed('bom', '/bom')}
          disabled={!canView('bom')}
          className="kpi-card text-left hover:shadow-md hover:border-[#1D3557] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:border-[#E5E7EB]"
          data-testid="kpi-active-boms"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Active BOMs</p>
              <p className="kpi-value">{stats?.bom?.active_boms || 0}</p>
            </div>
            <div className="w-12 h-12 bg-[#DEF7EC] rounded-sm flex items-center justify-center">
              <FileStack className="w-6 h-6 text-[#03543F]" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={navIfAllowed('production', '/production')}
          disabled={!canView('production')}
          className="kpi-card text-left hover:shadow-md hover:border-[#1D3557] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:border-[#E5E7EB]"
          data-testid="kpi-pending-orders"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Pending Orders</p>
              <p className="kpi-value">{stats?.production?.pending_orders || 0}</p>
            </div>
            <div className="w-12 h-12 bg-[#FDF6B2] rounded-sm flex items-center justify-center">
              <Factory className="w-6 h-6 text-[#723B13]" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={navIfAllowed('inventory', '/inventory?lowStock=1')}
          disabled={!canView('inventory')}
          className="kpi-card text-left hover:shadow-md hover:border-[#9B1C1C] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:border-[#E5E7EB]"
          data-testid="kpi-low-stock"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="kpi-label">Low Stock Alerts</p>
              <p className="kpi-value text-[#9B1C1C]">{stats?.inventory?.low_stock_alerts || 0}</p>
            </div>
            <div className="w-12 h-12 bg-[#FDE8E8] rounded-sm flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-[#9B1C1C]" />
            </div>
          </div>
        </button>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Inventory Breakdown */}
        <div className="card-flat p-4">
          <h3 className="text-base font-semibold font-[Chivo] text-[#111827] mb-3">Inventory Breakdown</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5 border-b border-[#E5E7EB]">
              <span className="text-sm text-[#4B5563]">Raw Materials</span>
              <span className="mono text-sm font-medium text-[#111827]">{stats?.inventory?.raw_materials || 0}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#E5E7EB]">
              <span className="text-sm text-[#4B5563]">Components</span>
              <span className="mono text-sm font-medium text-[#111827]">{stats?.inventory?.components || 0}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-[#4B5563]">Finished Goods</span>
              <span className="mono text-sm font-medium text-[#111827]">{stats?.inventory?.finished_goods || 0}</span>
            </div>
          </div>
        </div>

        {/* Quality Metrics */}
        <div className="card-flat p-4">
          <h3 className="text-base font-semibold font-[Chivo] text-[#111827] mb-3">Quality Metrics (30 Days)</h3>
          <div className="flex items-center justify-center mb-3">
            <div className="relative w-28 h-28">
              <svg className="w-28 h-28 transform -rotate-90">
                <circle cx="56" cy="56" r="48" stroke="#E5E7EB" strokeWidth="10" fill="none" />
                <circle cx="56" cy="56" r="48" stroke="#31C48D" strokeWidth="10" fill="none"
                  strokeDasharray={`${(stats?.quality?.pass_rate || 0) * 3.02} 302`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold mono text-[#111827]">{stats?.quality?.pass_rate || 0}%</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold mono text-[#03543F]">{stats?.quality?.passed || 0}</p>
              <p className="text-xs text-[#4B5563]">Passed</p>
            </div>
            <div>
              <p className="text-lg font-bold mono text-[#9B1C1C]">{stats?.quality?.failed || 0}</p>
              <p className="text-xs text-[#4B5563]">Failed</p>
            </div>
            <div>
              <p className="text-lg font-bold mono text-[#723B13]">{stats?.quality?.conditional || 0}</p>
              <p className="text-xs text-[#4B5563]">Conditional</p>
            </div>
          </div>
        </div>

        {/* Production Status */}
        <div className="card-flat p-4">
          <h3 className="text-base font-semibold font-[Chivo] text-[#111827] mb-3">Sales Order Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ClipboardCheck className="w-5 h-5 text-[#457B9D]" />
                <span className="text-sm text-[#4B5563]">Planned</span>
              </div>
              <span className="mono text-sm font-medium">{stats?.production?.pending_orders || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-[#E3A008]" />
                <span className="text-sm text-[#4B5563]">In Progress</span>
              </div>
              <span className="mono text-sm font-medium">{stats?.production?.in_progress || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5 text-[#9B1C1C]" />
                <span className="text-sm text-[#4B5563]">Low Stock Items</span>
              </div>
              <span className="mono text-sm font-medium text-[#9B1C1C]">{stats?.inventory?.low_stock_alerts || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions — uses react-router navigate (was broken <a href>) and
          deep-link query params so each action lands directly on the
          create dialog of the target page. Items / BOM / Production buttons
          are gated by their respective module create permission. */}
      <div className="card-flat p-4">
        <h3 className="text-base font-semibold font-[Chivo] text-[#111827] mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {canCreate('items') && (
            <button
              type="button"
              onClick={() => navigate('/items?action=new')}
              className="flex items-center justify-between p-3 border border-[#E5E7EB] rounded-sm hover:bg-[#F3F4F6] hover:border-[#1D3557] transition-colors text-left"
              data-testid="quick-action-new-item"
            >
              <span className="text-sm font-medium text-[#111827]">New Item</span>
              <ArrowUpRight className="w-4 h-4 text-[#4B5563]" />
            </button>
          )}
          {canCreate('bom') && (
            <button
              type="button"
              onClick={() => navigate('/bom?action=new')}
              className="flex items-center justify-between p-3 border border-[#E5E7EB] rounded-sm hover:bg-[#F3F4F6] hover:border-[#1D3557] transition-colors text-left"
              data-testid="quick-action-new-bom"
            >
              <span className="text-sm font-medium text-[#111827]">New BOM</span>
              <ArrowUpRight className="w-4 h-4 text-[#4B5563]" />
            </button>
          )}
          {canCreate('production') && (
            <button
              type="button"
              onClick={() => navigate('/production?action=new')}
              className="flex items-center justify-between p-3 border border-[#E5E7EB] rounded-sm hover:bg-[#F3F4F6] hover:border-[#1D3557] transition-colors text-left"
              data-testid="quick-action-new-order"
            >
              <span className="text-sm font-medium text-[#111827]">New Sales Order</span>
              <ArrowUpRight className="w-4 h-4 text-[#4B5563]" />
            </button>
          )}
          {canCreate('quality') && (
            <button
              type="button"
              onClick={() => navigate('/quality?action=new')}
              className="flex items-center justify-between p-3 border border-[#E5E7EB] rounded-sm hover:bg-[#F3F4F6] hover:border-[#1D3557] transition-colors text-left"
              data-testid="quick-action-new-inspection"
            >
              <span className="text-sm font-medium text-[#111827]">New Inspection</span>
              <ArrowUpRight className="w-4 h-4 text-[#4B5563]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
