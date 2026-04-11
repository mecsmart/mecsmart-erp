import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Factory,
  LayoutDashboard,
  Package,
  FileStack,
  Calculator,
  ClipboardCheck,
  Warehouse,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  ChevronDown,
  Truck,
  ShoppingCart,
  Settings2,
  Users,
  Building2,
  Shield
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { name: 'Items & Parts', href: '/items', icon: Package, module: 'items' },
  { name: 'Bill of Materials', href: '/bom', icon: FileStack, module: 'bom' },
  { name: 'MRP', href: '/mrp', icon: Calculator, module: 'mrp' },
  { name: 'Production Orders', href: '/production', icon: Factory, module: 'production' },
  { name: 'Manufacturing', href: '/manufacturing', icon: Settings2, module: 'manufacturing' },
  { name: 'Quality', href: '/quality', icon: ClipboardCheck, module: 'quality' },
  { name: 'Inventory', href: '/inventory', icon: Warehouse, module: 'inventory' },
  { name: 'Suppliers', href: '/suppliers', icon: Truck, module: 'suppliers' },
  { name: 'Customers', href: '/customers', icon: Users, module: 'customers' },
  { name: 'Purchase Orders', href: '/purchase-orders', icon: ShoppingCart, module: 'purchase_orders' },
  { name: 'Stores', href: '/warehouses', icon: Warehouse, module: 'stores' },
  { name: 'Settings', href: '/settings', icon: Building2, module: 'settings' },
];

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter navigation items based on user permissions
  const filteredNavigation = navigation.filter(item => {
    if (user?.role === 'admin') return true; // Admin sees everything
    return hasPermission(item.module, 'view');
  });

  // Add User Management for admin only
  const allNavItems = user?.role === 'admin'
    ? [...filteredNavigation, { name: 'User Management', href: '/users', icon: Shield, module: 'users' }]
    : filteredNavigation;

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

  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-[#111827] transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-14 px-4 border-b border-[#1F2937]">
            <div className="flex items-center space-x-2">
              <Factory className="w-6 h-6 text-white" />
              <span className="text-lg font-bold font-[Chivo] text-white">MachineWorks</span>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-[#9CA3AF] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 overflow-y-auto">
            <ul className="space-y-1">
              {allNavItems.map((item) => (
                <li key={item.name}>
                  <NavLink
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      isActive ? 'sidebar-link-active' : 'sidebar-link'
                    }
                    data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* User section */}
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

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1 text-[#4B5563] hover:text-[#111827]"
              data-testid="mobile-menu-btn"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold font-[Chivo] text-[#111827] hidden sm:block">
              Manufacturing ERP
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <span className={`status-badge ${getRoleBadge(user?.role)}`}>
              {user?.role?.replace('_', ' ') || 'User'}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center space-x-2 p-2 rounded-sm hover:bg-[#F3F4F6] transition-colors" data-testid="user-menu-btn">
                  <div className="w-8 h-8 rounded-full bg-[#1D3557] flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#4B5563]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-[#111827]" data-testid="user-name-display">{user?.name}</p>
                  <p className="text-xs text-[#4B5563]" data-testid="user-email-display">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleLogout} 
                  className="text-[#9B1C1C] cursor-pointer" 
                  data-testid="logout-menu-item"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
