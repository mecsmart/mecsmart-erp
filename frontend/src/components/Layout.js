import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Factory, LayoutDashboard, Package, FileStack, Calculator, ClipboardCheck,
  Warehouse, LogOut, Menu, X, User, ChevronDown, ChevronRight,
  Truck, ShoppingCart, Settings2, Users, Building2, Shield, FileText, Wrench, Cog,
  Headphones, Megaphone, AlertTriangle
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const dashboardNavItem = { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' };

const topNavItems = [
  { name: 'Customers', href: '/customers', icon: Users, module: 'customers' },
  { name: 'Sales Orders', href: '/production', icon: Factory, module: 'production' },
];

const inventoryGroupItems = [
  { name: 'Stock', href: '/inventory', icon: Warehouse, module: 'inventory' },
  { name: 'Suppliers', href: '/suppliers', icon: Truck, module: 'suppliers' },
  { name: 'MRP', href: '/mrp', icon: Calculator, module: 'mrp' },
  { name: 'Purchase Orders', href: '/purchase-orders', icon: ShoppingCart, module: 'purchase_orders' },
  { name: 'Purchase Invoices', href: '/purchase-invoices', icon: FileText, module: 'purchase_orders' },
];

const productionGroupItems = [
  { name: 'Items & Parts', href: '/items', icon: Package, module: 'items' },
  { name: 'BOM', href: '/bom', icon: FileStack, module: 'bom' },
  { name: 'Manufacturing Orders', href: '/manufacturing', icon: Settings2, module: 'manufacturing' },
];

const storesGroupItems = [
  { name: 'Stock', href: '/warehouses?tab=stock', icon: Package, module: 'stores' },
  { name: 'Transfer History', href: '/warehouses?tab=transfers', icon: Truck, module: 'stores' },
  { name: 'GRN', href: '/warehouses?tab=grn', icon: FileText, module: 'stores' },
  { name: 'Packing Lists', href: '/warehouses?tab=packing-lists', icon: Package, module: 'stores' },
];

const jobWorkGroupItems = [
  { name: 'Subcontract Orders', href: '/job-work?tab=orders', icon: Truck, module: 'manufacturing' },
  { name: 'Delivery Challans', href: '/job-work?tab=challans', icon: FileText, module: 'manufacturing' },
  { name: 'Receipts', href: '/job-work?tab=receipts', icon: Package, module: 'manufacturing' },
];

const crmMarketingItems = [
  { name: 'Contacts', href: '/crm?tab=marketing&sub=contacts', icon: Users, module: 'crm_marketing' },
  { name: 'Quotations', href: '/crm?tab=marketing&sub=quotations', icon: FileText, module: 'crm_marketing' },
  { name: 'Proforma Invoices', href: '/crm?tab=marketing&sub=proformas', icon: FileStack, module: 'crm_marketing' },
  { name: 'Tax Invoices', href: '/crm?tab=marketing&sub=tax-invoices', icon: Calculator, module: 'crm_marketing' },
  { name: 'Packing Lists', href: '/crm?tab=marketing&sub=packing-lists', icon: Package, module: 'crm_marketing' },
  { name: 'Products', href: '/items', icon: Package, module: 'items' },
  { name: 'Configuration', href: '/crm?tab=marketing&sub=configuration', icon: Cog, module: 'crm_marketing' },
];

const crmSupportItems = [
  { name: 'SLA Due', href: '/crm?tab=support&sub=sla', icon: AlertTriangle, module: 'crm_support' },
  { name: 'Activity Logs', href: '/crm?tab=support&sub=activity', icon: ClipboardCheck, module: 'crm_support' },
  { name: 'Configuration', href: '/crm?tab=support&sub=configuration', icon: Cog, module: 'crm_support' },
];

const afterGroupNavItems = [
  { name: 'Quality', href: '/quality', icon: ClipboardCheck, module: 'quality' },
];

const bottomNavItems = [
  { name: 'Settings', href: '/settings', icon: Building2, module: 'settings' },
];

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(() => {
    return inventoryGroupItems.some(item => location.pathname === item.href);
  });
  const [productionOpen, setProductionOpen] = useState(() => {
    return productionGroupItems.some(item => location.pathname === item.href);
  });
  const [storesOpen, setStoresOpen] = useState(() => {
    return location.pathname === '/warehouses';
  });
  const [jobWorkOpen, setJobWorkOpen] = useState(() => {
    return location.pathname === '/job-work';
  });
  const [crmOpen, setCrmOpen] = useState(() => location.pathname === '/crm');
  const [crmMarketingOpen, setCrmMarketingOpen] = useState(() => {
    const params = new URLSearchParams(location.search);
    return location.pathname === '/crm' && params.get('tab') === 'marketing';
  });
  const [crmSupportOpen, setCrmSupportOpen] = useState(() => {
    const params = new URLSearchParams(location.search);
    return location.pathname === '/crm' && params.get('tab') === 'support';
  });

  const canView = (module) => user?.role === 'admin' || hasPermission(module, 'view');

  const filteredTop = topNavItems.filter(item => canView(item.module));
  const filteredInventory = inventoryGroupItems.filter(item => canView(item.module));
  const filteredProduction = productionGroupItems.filter(item => canView(item.module));
  const filteredAfterGroup = afterGroupNavItems.filter(item => canView(item.module));
  const filteredStores = storesGroupItems.filter(item => canView(item.module));
  const filteredJobWork = jobWorkGroupItems.filter(item => canView(item.module));
  const filteredCRMMarketing = crmMarketingItems.filter(item => canView(item.module));
  const filteredCRMSupport = crmSupportItems.filter(item => canView(item.module));
  const filteredBottom = bottomNavItems.filter(item => canView(item.module));
  const showInventoryGroup = filteredInventory.length > 0;
  const showProductionGroup = filteredProduction.length > 0;
  const showStoresGroup = filteredStores.length > 0;
  const showJobWorkGroup = filteredJobWork.length > 0;
  const showCRMGroup = canView('crm_marketing') || canView('crm_support') || filteredCRMMarketing.length > 0 || filteredCRMSupport.length > 0;

  const allNavItems = user?.role === 'admin'
    ? [...filteredBottom, { name: 'User Management', href: '/users', icon: Shield, module: 'users' }]
    : filteredBottom;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getRoleBadge = (role) => {
    const colors = {
      admin: 'bg-[#FDE8E8] text-[#9B1C1C]',
      production_manager: 'bg-[#E1EFFE] text-[#1E429F]',
      quality_inspector: 'bg-[#DEF7EC] text-[#03543F]',
      inventory_manager: 'bg-[#FDF6B2] text-[#723B13]',
    };
    return colors[role] || 'bg-[#F3F4F6] text-[#4B5563]';
  };

  const isInventoryActive = inventoryGroupItems.some(item => location.pathname === item.href);
  const isProductionActive = productionGroupItems.some(item => location.pathname === item.href);
  const isStoresActive = location.pathname === '/warehouses';

  const renderNavItem = (item) => (
    <li key={item.name}>
      <NavLink
        to={item.href}
        onClick={() => setSidebarOpen(false)}
        className={({ isActive }) => isActive ? 'sidebar-link-active' : 'sidebar-link'}
        data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <item.icon className="w-5 h-5" />
        <span>{item.name}</span>
      </NavLink>
    </li>
  );

  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#111827] transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-14 px-4 border-b border-[#1F2937]">
            <div className="flex items-center space-x-2">
              <Factory className="w-6 h-6 text-white" />
              <span className="text-lg font-bold font-[Chivo] text-white">MachineWorks</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-[#9CA3AF] hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 py-4 overflow-y-auto">
            <ul className="space-y-1">
              {canView(dashboardNavItem.module) && renderNavItem(dashboardNavItem)}

              {/* CRM Group */}
              {showCRMGroup && (
                <li>
                  <button
                    onClick={() => setCrmOpen(!crmOpen)}
                    className={`sidebar-link w-full justify-between ${location.pathname === '/crm' ? 'text-white bg-[#1F2937]' : ''}`}
                    data-testid="nav-crm-group"
                  >
                    <div className="flex items-center space-x-3">
                      <Users className="w-5 h-5" />
                      <span>CRM</span>
                    </div>
                    {crmOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {crmOpen && (
                    <ul className="ml-4 mt-1 space-y-0.5 border-l border-[#374151] pl-3">
                      {/* Marketing — parent navigates to pipeline, chevron toggles children */}
                      {canView('crm_marketing') && (
                        <li>
                          <div className={`flex items-center w-full rounded-sm ${location.search.includes('tab=marketing') && location.pathname === '/crm' ? 'bg-[#1D3557]' : ''}`}>
                            <NavLink
                              to="/crm?tab=marketing"
                              onClick={() => { setSidebarOpen(false); setCrmMarketingOpen(true); }}
                              className={({ isActive }) => `flex-1 flex items-center space-x-2 px-3 py-1.5 text-sm rounded-sm ${isActive && location.search.includes('tab=marketing') && !location.search.includes('sub=') ? 'text-white' : 'text-[#9CA3AF] hover:text-white'}`}
                              data-testid="nav-crm-marketing"
                            >
                              <Megaphone className="w-4 h-4" />
                              <span>Marketing</span>
                            </NavLink>
                            <button onClick={() => setCrmMarketingOpen(!crmMarketingOpen)} className="px-2 text-[#9CA3AF] hover:text-white" data-testid="nav-crm-marketing-toggle">
                              {crmMarketingOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                          </div>
                          {crmMarketingOpen && (
                            <ul className="ml-4 mt-1 space-y-0.5 border-l border-[#374151] pl-3">
                              {filteredCRMMarketing.map(item => (
                                <li key={item.name}>
                                  <NavLink
                                    to={item.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center space-x-2 px-3 py-1 text-xs rounded-sm transition-colors ${location.pathname + location.search === item.href ? 'text-white bg-[#1D3557]' : 'text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]'}`}
                                    data-testid={`nav-crm-marketing-${item.name.toLowerCase()}`}
                                  >
                                    <item.icon className="w-3.5 h-3.5" />
                                    <span>{item.name}</span>
                                  </NavLink>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      )}
                      {/* Support — parent navigates to pipeline, chevron toggles children */}
                      {canView('crm_support') && (
                        <li>
                          <div className={`flex items-center w-full rounded-sm ${location.search.includes('tab=support') && location.pathname === '/crm' ? 'bg-[#1D3557]' : ''}`}>
                            <NavLink
                              to="/crm?tab=support"
                              onClick={() => { setSidebarOpen(false); setCrmSupportOpen(true); }}
                              className={({ isActive }) => `flex-1 flex items-center space-x-2 px-3 py-1.5 text-sm rounded-sm ${isActive && location.search.includes('tab=support') && !location.search.includes('sub=') ? 'text-white' : 'text-[#9CA3AF] hover:text-white'}`}
                              data-testid="nav-crm-support"
                            >
                              <Headphones className="w-4 h-4" />
                              <span>Support</span>
                            </NavLink>
                            <button onClick={() => setCrmSupportOpen(!crmSupportOpen)} className="px-2 text-[#9CA3AF] hover:text-white" data-testid="nav-crm-support-toggle">
                              {crmSupportOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                          </div>
                          {crmSupportOpen && (
                            <ul className="ml-4 mt-1 space-y-0.5 border-l border-[#374151] pl-3">
                              {filteredCRMSupport.map(item => (
                                <li key={item.name}>
                                  <NavLink
                                    to={item.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center space-x-2 px-3 py-1 text-xs rounded-sm transition-colors ${location.pathname + location.search === item.href ? 'text-white bg-[#1D3557]' : 'text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]'}`}
                                    data-testid={`nav-crm-support-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                                  >
                                    <item.icon className="w-3.5 h-3.5" />
                                    <span>{item.name}</span>
                                  </NavLink>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              )}

              {/* Core nav items (Customers, Sales Orders) */}
              {filteredTop.map(renderNavItem)}

              {/* Inventory Group */}
              {showInventoryGroup && (
                <li>
                  <button
                    onClick={() => setInventoryOpen(!inventoryOpen)}
                    className={`sidebar-link w-full justify-between ${isInventoryActive ? 'text-white bg-[#1F2937]' : ''}`}
                    data-testid="nav-inventory-group"
                  >
                    <div className="flex items-center space-x-3">
                      <Package className="w-5 h-5" />
                      <span>Inventory</span>
                    </div>
                    {inventoryOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {inventoryOpen && (
                    <ul className="ml-4 mt-1 space-y-0.5 border-l border-[#374151] pl-3">
                      {filteredInventory.map(item => (
                        <li key={item.name}>
                          <NavLink
                            to={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                              `flex items-center space-x-2 px-3 py-1.5 text-sm rounded-sm transition-colors ${isActive ? 'text-white bg-[#1D3557]' : 'text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]'}`
                            }
                            data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <item.icon className="w-4 h-4" />
                            <span>{item.name}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )}

              {/* Production Group */}
              {showProductionGroup && (
                <li>
                  <button
                    onClick={() => setProductionOpen(!productionOpen)}
                    className={`sidebar-link w-full justify-between ${isProductionActive ? 'text-white bg-[#1F2937]' : ''}`}
                    data-testid="nav-production-group"
                  >
                    <div className="flex items-center space-x-3">
                      <Cog className="w-5 h-5" />
                      <span>Production</span>
                    </div>
                    {productionOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {productionOpen && (
                    <ul className="ml-4 mt-1 space-y-0.5 border-l border-[#374151] pl-3">
                      {filteredProduction.map(item => (
                        <li key={item.name}>
                          <NavLink
                            to={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                              `flex items-center space-x-2 px-3 py-1.5 text-sm rounded-sm transition-colors ${isActive ? 'text-white bg-[#1D3557]' : 'text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]'}`
                            }
                            data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <item.icon className="w-4 h-4" />
                            <span>{item.name}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )}

              {/* Stores Group */}
              {showStoresGroup && (
                <li>
                  <button
                    onClick={() => setStoresOpen(!storesOpen)}
                    className={`sidebar-link w-full justify-between ${isStoresActive ? 'text-white bg-[#1F2937]' : ''}`}
                    data-testid="nav-stores-group"
                  >
                    <div className="flex items-center space-x-3">
                      <Warehouse className="w-5 h-5" />
                      <span>Stores</span>
                    </div>
                    {storesOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {storesOpen && (
                    <ul className="ml-4 mt-1 space-y-0.5 border-l border-[#374151] pl-3">
                      {filteredStores.map(item => (
                        <li key={item.name}>
                          <NavLink
                            to={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                              `flex items-center space-x-2 px-3 py-1.5 text-sm rounded-sm transition-colors ${location.pathname + location.search === item.href || (isActive && item.href.includes(location.search)) ? 'text-white bg-[#1D3557]' : 'text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]'}`
                            }
                            data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <item.icon className="w-4 h-4" />
                            <span>{item.name}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )}

              {filteredAfterGroup.map(renderNavItem)}

              {/* Job Work Group */}
              {showJobWorkGroup && (
                <li>
                  <button
                    onClick={() => setJobWorkOpen(!jobWorkOpen)}
                    className={`sidebar-link w-full justify-between ${location.pathname === '/job-work' ? 'text-white bg-[#1F2937]' : ''}`}
                    data-testid="nav-jobwork-group"
                  >
                    <div className="flex items-center space-x-3">
                      <Wrench className="w-5 h-5" />
                      <span>Job Work</span>
                    </div>
                    {jobWorkOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {jobWorkOpen && (
                    <ul className="ml-4 mt-1 space-y-0.5 border-l border-[#374151] pl-3">
                      {filteredJobWork.map(item => (
                        <li key={item.name}>
                          <NavLink
                            to={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                              `flex items-center space-x-2 px-3 py-1.5 text-sm rounded-sm transition-colors ${location.pathname + location.search === item.href ? 'text-white bg-[#1D3557]' : 'text-[#9CA3AF] hover:text-white hover:bg-[#1F2937]'}`
                            }
                            data-testid={`nav-jw-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <item.icon className="w-4 h-4" />
                            <span>{item.name}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )}

              {/* CRM Group (moved to top — above Inventory) */}

              {allNavItems.map(renderNavItem)}
            </ul>
          </nav>

          <div className="border-t border-[#1F2937] p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-[#1F2937] flex items-center justify-center">
                <User className="w-5 h-5 text-[#9CA3AF]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
                <p className="text-xs text-[#9CA3AF] truncate">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center space-x-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1 text-[#4B5563] hover:text-[#111827]" data-testid="mobile-menu-btn">
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold font-[Chivo] text-[#111827] hidden sm:block">Manufacturing ERP</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className={`status-badge ${getRoleBadge(user?.role)}`}>
              {user?.role?.replace('_', ' ') || 'User'}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center space-x-2 text-sm text-[#4B5563] hover:text-[#111827]" data-testid="user-menu-btn">
                  <span className="hidden md:inline font-medium">{user?.name}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="text-sm">
                  <User className="w-4 h-4 mr-2" /> Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-sm text-[#9B1C1C]">
                  <LogOut className="w-4 h-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="p-4 lg:p-6" data-testid="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
