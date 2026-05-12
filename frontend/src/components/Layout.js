import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Factory, LayoutDashboard, Package, FileStack, Calculator, ClipboardCheck,
  Warehouse, LogOut, Menu, X, User, ChevronDown, ChevronRight,
  Truck, ShoppingCart, Settings2, Users, Building2, Shield, FileText, Wrench, Cog,
  Headphones, Megaphone, AlertTriangle, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const dashboardNavItem = { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' };

const topNavItems = [
  { name: 'Sales Orders', href: '/production', icon: Factory, module: 'production' },
];

const inventoryGroupItems = [
  { name: 'Stock', href: '/inventory', icon: Warehouse, module: 'inventory' },
  { name: 'Suppliers', href: '/suppliers', icon: Truck, module: 'suppliers' },
  { name: 'MRP', href: '/mrp', icon: Calculator, module: 'mrp' },
  { name: 'Purchase Orders', href: '/purchase-orders', icon: ShoppingCart, module: 'purchase_orders' },
  { name: 'Purchase Invoices', href: '/purchase-invoices', icon: FileText, module: 'purchase_orders' },
  { name: 'Configuration', href: '/inventory/configuration', icon: Cog, module: 'inventory_configuration' },
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
  { name: 'Packing Lists', href: '/warehouses?tab=packing-lists', icon: Package, module: 'stores_packing_list' },
];

const jobWorkGroupItems = [
  { name: 'Subcontract Orders', href: '/job-work?tab=orders', icon: Truck, module: 'manufacturing' },
  { name: 'Delivery Challans', href: '/job-work?tab=challans', icon: FileText, module: 'manufacturing' },
  { name: 'Receipts', href: '/job-work?tab=receipts', icon: Package, module: 'manufacturing' },
];

const crmMarketingItems = [
  { name: 'Customers', href: '/customers', icon: Users, module: 'customers' },
  { name: 'Quotations', href: '/crm?tab=marketing&sub=quotations', icon: FileText, module: 'crm_marketing' },
  { name: 'Proforma Invoices', href: '/crm?tab=marketing&sub=proformas', icon: FileStack, module: 'crm_marketing' },
  { name: 'Tax Invoices', href: '/crm?tab=marketing&sub=tax-invoices', icon: Calculator, module: 'crm_marketing' },
  { name: 'Packing Lists', href: '/crm?tab=marketing&sub=packing-lists', icon: Package, module: 'crm_marketing' },
  { name: 'Products', href: '/items', icon: Package, module: 'items' },
  { name: 'Configuration', href: '/crm?tab=marketing&sub=configuration', icon: Cog, module: 'marketing_configuration' },
];

const crmSupportItems = [
  { name: 'SLA Due', href: '/crm?tab=support&sub=sla', icon: AlertTriangle, module: 'crm_support' },
  { name: 'Activity Logs', href: '/crm?tab=support&sub=activity', icon: ClipboardCheck, module: 'crm_support' },
  { name: 'Configuration', href: '/crm?tab=support&sub=configuration', icon: Cog, module: 'support_configuration' },
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
  // Collapsible sidebar (desktop only). Persisted via localStorage. Default = collapsed.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem('mecsmart_sidebar_collapsed');
      return v === null ? true : v === '1';
    } catch (e) { return true; }
  });
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const isExpanded = !sidebarCollapsed || sidebarHovered;

  useEffect(() => {
    try { localStorage.setItem('mecsmart_sidebar_collapsed', sidebarCollapsed ? '1' : '0'); } catch (e) {}
  }, [sidebarCollapsed]);

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

  // Render a top-level nav item. When sidebar is collapsed (icon-only) we
  // center the icon and hide the label; the native `title` attribute provides
  // a tooltip on hover.
  const renderNavItem = (item) => (
    <li key={item.name}>
      <NavLink
        to={item.href}
        onClick={() => setSidebarOpen(false)}
        title={!isExpanded ? item.name : undefined}
        className={({ isActive }) =>
          `${isActive ? 'sidebar-link-active' : 'sidebar-link'} ${!isExpanded ? 'justify-center' : ''}`
        }
        data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        {isExpanded && <span className="truncate">{item.name}</span>}
      </NavLink>
    </li>
  );

  // Render a collapsible group header (Inventory / Production / Stores / Job Work / CRM).
  const renderGroupHeader = ({ icon: Icon, label, isOpen, setOpen, isActive, testId, onIconClickWhenCollapsed }) => (
    <button
      onClick={() => {
        if (!isExpanded) {
          // When collapsed, clicking the icon expands the sidebar permanently
          // and opens the group so the user can pick a child item.
          setSidebarCollapsed(false);
          setOpen(true);
          if (onIconClickWhenCollapsed) onIconClickWhenCollapsed();
          return;
        }
        setOpen(!isOpen);
      }}
      title={!isExpanded ? label : undefined}
      className={`sidebar-link w-full ${isExpanded ? 'justify-between' : 'justify-center'} ${isActive ? 'text-white bg-[#1F2937]' : ''}`}
      data-testid={testId}
    >
      <div className={`flex items-center ${isExpanded ? 'space-x-3' : ''}`}>
        <Icon className="w-5 h-5 flex-shrink-0" />
        {isExpanded && <span>{label}</span>}
      </div>
      {isExpanded && (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        onMouseEnter={() => sidebarCollapsed && setSidebarHovered(true)}
        onMouseLeave={() => sidebarCollapsed && setSidebarHovered(false)}
        className={`fixed inset-y-0 left-0 z-50 bg-[#111827] transform transition-all duration-200 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isExpanded ? 'w-64' : 'w-16'} ${sidebarCollapsed && sidebarHovered ? 'shadow-2xl' : ''}`}
        data-testid="sidebar-root"
        data-collapsed={sidebarCollapsed ? '1' : '0'}
        data-expanded={isExpanded ? '1' : '0'}
      >
        <div className="flex flex-col h-full">
          <div className={`flex items-center h-14 border-b border-[#1F2937] ${isExpanded ? 'justify-between px-4' : 'justify-center px-2'}`}>
            {isExpanded ? (
              <>
                <div className="flex items-center space-x-2 min-w-0">
                  <Factory className="w-6 h-6 text-white flex-shrink-0" />
                  <span className="text-lg font-bold font-[Chivo] text-white truncate">MecSmart ERP</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="hidden lg:inline-flex p-1 text-[#9CA3AF] hover:text-white"
                    title={sidebarCollapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
                    data-testid="sidebar-collapse-toggle"
                  >
                    {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
                  </button>
                  <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-[#9CA3AF] hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-1 text-white hover:text-[#9CA3AF]"
                title="Expand sidebar"
                data-testid="sidebar-collapse-toggle"
              >
                <Factory className="w-6 h-6" />
              </button>
            )}
          </div>

          <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
            <ul className="space-y-1">
              {canView(dashboardNavItem.module) && renderNavItem(dashboardNavItem)}

              {/* CRM Group */}
              {showCRMGroup && (
                <li>
                  {renderGroupHeader({
                    icon: Users,
                    label: 'CRM',
                    isOpen: crmOpen,
                    setOpen: setCrmOpen,
                    isActive: location.pathname === '/crm',
                    testId: 'nav-crm-group',
                  })}
                  {isExpanded && crmOpen && (
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
                      {/* Support */}
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

              {/* Core nav items (Sales Orders) */}
              {filteredTop.map(renderNavItem)}

              {/* Inventory Group */}
              {showInventoryGroup && (
                <li>
                  {renderGroupHeader({
                    icon: Package,
                    label: 'Inventory',
                    isOpen: inventoryOpen,
                    setOpen: setInventoryOpen,
                    isActive: isInventoryActive,
                    testId: 'nav-inventory-group',
                  })}
                  {isExpanded && inventoryOpen && (
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
                  {renderGroupHeader({
                    icon: Cog,
                    label: 'Production',
                    isOpen: productionOpen,
                    setOpen: setProductionOpen,
                    isActive: isProductionActive,
                    testId: 'nav-production-group',
                  })}
                  {isExpanded && productionOpen && (
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
                  {renderGroupHeader({
                    icon: Warehouse,
                    label: 'Stores',
                    isOpen: storesOpen,
                    setOpen: setStoresOpen,
                    isActive: isStoresActive,
                    testId: 'nav-stores-group',
                  })}
                  {isExpanded && storesOpen && (
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
                  {renderGroupHeader({
                    icon: Wrench,
                    label: 'Job Work',
                    isOpen: jobWorkOpen,
                    setOpen: setJobWorkOpen,
                    isActive: location.pathname === '/job-work',
                    testId: 'nav-jobwork-group',
                  })}
                  {isExpanded && jobWorkOpen && (
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

              {allNavItems.map(renderNavItem)}
            </ul>
          </nav>

          <div className={`border-t border-[#1F2937] ${isExpanded ? 'p-4' : 'p-2'}`}>
            <div className={`flex items-center ${isExpanded ? 'space-x-3' : 'justify-center'}`}>
              <div className="w-10 h-10 rounded-full bg-[#1F2937] flex items-center justify-center flex-shrink-0" title={!isExpanded ? user?.name : undefined}>
                <User className="w-5 h-5 text-[#9CA3AF]" />
              </div>
              {isExpanded && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate" data-testid="sidebar-user-name">{user?.name || 'User'}</p>
                  <p className="text-xs text-[#9CA3AF] truncate" data-testid="sidebar-user-email">{user?.email}</p>
                  {user?.role_group?.name && (
                    <p className="text-[10px] uppercase tracking-wide text-[#60A5FA] font-semibold mt-0.5 truncate" data-testid="sidebar-user-group">
                      {user.role_group.name}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className={`${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'} transition-all duration-200`}>
        <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center space-x-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1 text-[#4B5563] hover:text-[#111827]" data-testid="mobile-menu-btn">
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold font-[Chivo] text-[#111827] hidden sm:block">MecSmart ERP</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className={`status-badge ${getRoleBadge(user?.role)}`} data-testid="header-user-group-badge">
              {user?.role_group?.name || user?.role?.replace('_', ' ') || 'User'}
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

        <main className="p-4 lg:p-5" data-testid="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
