import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit2, Trash2, Shield, Key, UserPlus, Check, X, Users as UsersIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'bg-[#FDE8E8] text-[#9B1C1C]' },
  { value: 'production_manager', label: 'Production Manager', color: 'bg-[#E1EFFE] text-[#1E429F]' },
  { value: 'quality_inspector', label: 'Quality Inspector', color: 'bg-[#DEF7EC] text-[#03543F]' },
  { value: 'inventory_manager', label: 'Inventory Manager', color: 'bg-[#FDF6B2] text-[#723B13]' },
];

const MODULE_LABELS = {
  dashboard: 'Dashboard', items: 'Items & Parts', bom: 'Bill of Materials',
  mrp: 'MRP', production: 'Sales Orders', manufacturing: 'Manufacturing Orders',
  quality: 'Quality', inventory: 'Inventory', suppliers: 'Suppliers',
  customers: 'Customers', purchase_orders: 'Purchase Orders', stores: 'Stores',
  settings: 'Settings',
};

const ACTION_LABELS = { view: 'Read', create: 'Create', edit: 'Write', delete: 'Delete' };

// Main-module → Sub-module hierarchy for Access Rights UI.
// Each sub-module key matches the backend module key in DEFAULT_PERMISSIONS.
// Some modules have restricted action sets — handled at render time via `module_actions`.
const MODULE_GROUPS = [
  { main: 'Dashboard', subs: [{ key: 'dashboard', label: 'Dashboard' }] },
  { main: 'Master Data', subs: [
    { key: 'items', label: 'Items & Parts' },
    { key: 'bom', label: 'Bill of Materials' },
    { key: 'routings', label: 'Routings' },
    { key: 'bom_process_cost', label: 'BOM Process Cost' },
    { key: 'bom_rollup_cost', label: 'BOM Rollup Cost' },
    { key: 'suppliers', label: 'Suppliers' },
    { key: 'customers', label: 'Customers' },
  ] },
  { main: 'Inventory', subs: [
    { key: 'inventory', label: 'Stock' },
    { key: 'mrp', label: 'MRP' },
    { key: 'purchase_orders', label: 'Purchase Orders' },
    { key: 'purchase_invoices', label: 'Purchase Invoice' },
  ] },
  { main: 'Stores', subs: [
    { key: 'stores', label: 'Warehouses / Stock / Transfer History / GRN' },
    { key: 'delivery_challan', label: 'Delivery Challan' },
  ] },
  { main: 'Production', subs: [
    { key: 'production', label: 'Sales Orders' },
    { key: 'manufacturing', label: 'Manufacturing Orders' },
  ] },
  { main: 'Job Work', subs: [
    { key: 'job_work', label: 'Job Work / Subcontracting' },
  ] },
  { main: 'CRM', subs: [
    { key: 'crm_marketing', label: 'Marketing (Leads)' },
    { key: 'crm_support', label: 'Support (Tickets)' },
  ] },
  { main: 'Quality', subs: [{ key: 'quality', label: 'Quality Inspection' }] },
  { main: 'Settings', subs: [{ key: 'settings', label: 'Settings & User Management' }] },
];

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modulesData, setModulesData] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPermOpen, setIsPermOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [permUser, setPermUser] = useState(null);
  const [permData, setPermData] = useState({});
  const [formData, setFormData] = useState({ email: '', password: '', name: '', role: 'inventory_manager', role_group_id: '', permissions: {} });
  // Track if the admin has manually edited the permissions grid — so we don't auto-reset
  // their selections when switching roles after editing.
  const [permsTouched, setPermsTouched] = useState(false);
  // Role Groups state
  const [roleGroups, setRoleGroups] = useState([]);
  const [tab, setTab] = useState('users');
  const [groupDialog, setGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', is_admin_group: false, permissions: {} });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [usersRes, modulesRes, groupsRes] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/users/modules'),
        api.get('/api/users/role-groups').catch(() => ({ data: [] })),
      ]);
      setUsers(usersRes.data);
      setModulesData(modulesRes.data);
      setRoleGroups(groupsRes.data || []);
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally { setLoading(false); }
  };

  // ================== Role Group CRUD ==================
  const openGroupDialog = (g) => {
    if (g) {
      setEditingGroup(g);
      setGroupForm({ name: g.name, description: g.description || '', is_admin_group: !!g.is_admin_group, permissions: g.permissions || {} });
    } else {
      setEditingGroup(null);
      setGroupForm({ name: '', description: '', is_admin_group: false, permissions: {} });
    }
    setGroupDialog(true);
  };

  const saveGroup = async () => {
    try {
      if (!groupForm.name.trim()) { alert('Group name is required'); return; }
      if (editingGroup) {
        await api.put(`/api/users/role-groups/${editingGroup.id}`, groupForm);
      } else {
        await api.post('/api/users/role-groups', groupForm);
      }
      setGroupDialog(false);
      setEditingGroup(null);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save role group');
    }
  };

  const deleteGroup = async (g) => {
    if (!window.confirm(`Delete role group "${g.name}"? Users mapped to this group will be unassigned.`)) return;
    try {
      await api.delete(`/api/users/role-groups/${g.id}`);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete role group');
    }
  };

  const toggleGroupPerm = (moduleKey, action) => {
    setGroupForm(prev => {
      const current = [...(prev.permissions?.[moduleKey] || [])];
      const next = current.includes(action) ? current.filter(x => x !== action) : [...current, action];
      return { ...prev, permissions: { ...prev.permissions, [moduleKey]: next } };
    });
  };

  const toggleGroupAll = (moduleKey) => {
    setGroupForm(prev => {
      const current = prev.permissions?.[moduleKey] || [];
      const next = current.length === 4 ? [] : ['view','create','edit','delete'];
      return { ...prev, permissions: { ...prev.permissions, [moduleKey]: next } };
    });
  };

  const handleCreate = async () => {
    try {
      await api.post('/api/users', formData);
      setIsCreateOpen(false);
      setFormData({ email: '', password: '', name: '', role: 'inventory_manager', role_group_id: '', permissions: {} });
      setPermsTouched(false);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleEdit = (u) => {
    setEditingUser(u);
    setFormData({ email: u.email, password: '', name: u.name, role: u.role, role_group_id: u.role_group_id || '', permissions: u.permissions || {} });
    setPermsTouched(true);  // preserve existing user's permissions when dialog opens
    setIsCreateOpen(true);
  };

  const handleUpdate = async () => {
    try {
      const payload = { name: formData.name, role: formData.role, permissions: formData.permissions, role_group_id: formData.role_group_id || '' };
      if (formData.password) payload.password = formData.password;
      await api.put(`/api/users/${editingUser.id}`, payload);
      setIsCreateOpen(false);
      setEditingUser(null);
      setFormData({ email: '', password: '', name: '', role: 'inventory_manager', role_group_id: '', permissions: {} });
      setPermsTouched(false);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update user');
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user "${u.name}" (${u.email})?`)) return;
    try {
      await api.delete(`/api/users/${u.id}`);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete user');
    }
  };

  const openPermissions = (u) => {
    setPermUser(u);
    setPermData(JSON.parse(JSON.stringify(u.permissions || {})));
    setIsPermOpen(true);
  };

  const togglePermission = (module, action) => {
    setPermData(prev => {
      const updated = { ...prev };
      if (!updated[module]) updated[module] = [];
      const actions = [...updated[module]];
      const idx = actions.indexOf(action);
      if (idx >= 0) actions.splice(idx, 1);
      else actions.push(action);
      updated[module] = actions;
      return updated;
    });
  };

  const toggleAllModule = (module) => {
    setPermData(prev => {
      const updated = { ...prev };
      const current = updated[module] || [];
      updated[module] = current.length === modulesData?.actions?.length ? [] : [...(modulesData?.actions || [])];
      return updated;
    });
  };

  const applyRoleDefaults = () => {
    if (permUser && modulesData) {
      setPermData(JSON.parse(JSON.stringify(modulesData.default_permissions[permUser.role] || {})));
    }
  };

  const savePermissions = async () => {
    try {
      await api.put(`/api/users/${permUser.id}`, { permissions: permData });
      setIsPermOpen(false);
      setPermUser(null);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to update permissions');
    }
  };

  const getRoleColor = (role) => ROLES.find(r => r.value === role)?.color || 'bg-[#F3F4F6] text-[#4B5563]';

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>;

  return (
    <div className="space-y-6" data-testid="user-management-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#1D3557]">User Management</h1>
          <p className="text-sm text-[#4B5563]">Manage users, role groups and module-wise access permissions</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="user-tabs">
          <TabsTrigger value="users" data-testid="tab-users"><UsersIcon className="w-4 h-4 mr-1" />Users</TabsTrigger>
          <TabsTrigger value="groups" data-testid="tab-groups"><Shield className="w-4 h-4 mr-1" />Role Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4 space-y-6">
        <div className="flex justify-end">
        <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { setEditingUser(null); setFormData({ email: '', password: '', name: '', role: 'inventory_manager', role_group_id: '', permissions: {} }); setPermsTouched(false); } }}>
          <DialogTrigger asChild>
            <button className="btn-primary flex items-center space-x-2" data-testid="add-user-btn" onClick={() => {
              // Pre-seed permissions with the default for the default role so the admin
              // sees pre-ticked checkboxes matching the role they'll likely keep.
              const defaults = modulesData?.default_permissions?.['inventory_manager'] || {};
              setFormData({ email: '', password: '', name: '', role: 'inventory_manager', role_group_id: '', permissions: JSON.parse(JSON.stringify(defaults)) });
              setPermsTouched(false);
            }}>
              <UserPlus className="w-4 h-4" /><span>Add User</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-[Chivo]">{editingUser ? 'Edit User' : 'Create New User'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[#374151]">Full Name *</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} data-testid="user-name-input" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151]">Email *</label>
                  <input type="email" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} disabled={!!editingUser} data-testid="user-email-input" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151]">{editingUser ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                  <input type="password" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder={editingUser ? 'Leave blank to keep current' : ''} data-testid="user-password-input" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-[#374151]">Role Group *</label>
                  {roleGroups.length === 0 ? (
                    <div className="mt-1 px-3 py-3 border border-[#F59E0B] bg-[#FEF3C7] rounded-sm text-xs text-[#723B13]">
                      <strong>No role groups exist yet.</strong> Go to the <em>Role Groups</em> tab and create at least one group (e.g. "Production Admin", "Purchase User") before adding users. Permissions are defined at the group level.
                    </div>
                  ) : (
                    <>
                      <Select value={formData.role_group_id || ''} onValueChange={v => setFormData({ ...formData, role_group_id: v })}>
                        <SelectTrigger data-testid="user-group-select"><SelectValue placeholder="Select role group..." /></SelectTrigger>
                        <SelectContent>
                          {roleGroups.map(g => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}{g.is_admin_group ? ' (Admin Group)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-[#6B7280] mt-1">Permissions are defined at the role group level. Admin Group members see BOM rollup costs.</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-[#E5E7EB]">
                <button className="btn-secondary" onClick={() => { setIsCreateOpen(false); setEditingUser(null); }}>Cancel</button>
                <button className="btn-primary" onClick={editingUser ? handleUpdate : handleCreate} data-testid="save-user-btn" disabled={roleGroups.length === 0 || !formData.role_group_id}>
                  {editingUser ? 'Update' : 'Create'} User
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>

      {/* Users Table */}
      <div className="card-flat overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table" data-testid="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role Group</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} data-testid={`user-row-${u.email}`}>
                  <td className="font-medium text-[#1D3557]">{u.name}</td>
                  <td className="mono text-sm">{u.email}</td>
                  <td className="text-sm">
                    {(() => {
                      const g = roleGroups.find(x => x.id === u.role_group_id);
                      if (!g) return <span className="text-[#9CA3AF]">—</span>;
                      return <span className={`status-badge ${g.is_admin_group ? 'bg-[#FDE8E8] text-[#9B1C1C]' : 'bg-[#E1EFFE] text-[#1E429F]'}`}>{g.name}</span>;
                    })()}
                  </td>
                  <td>
                    <span className={`status-badge ${u.status === 'active' ? 'bg-[#DEF7EC] text-[#03543F]' : 'bg-[#F3F4F6] text-[#4B5563]'}`}>
                      {u.status || 'active'}
                    </span>
                  </td>
                  <td className="text-sm text-[#4B5563]">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td>
                    <div className="flex items-center space-x-1">
                      <button onClick={() => handleEdit(u)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Edit" data-testid={`edit-user-${u.email}`}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => handleDelete(u)} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`delete-user-${u.email}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="groups" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1D3557]">Role Groups</h2>
              <p className="text-xs text-[#6B7280]">Create named groups (e.g. "Production Admin", "Purchase User") with a permission matrix. Flag a group as <strong>Admin Group</strong> to allow its members to view BOM rollup costs.</p>
            </div>
            <button className="btn-primary flex items-center gap-1" onClick={() => openGroupDialog(null)} data-testid="add-group-btn">
              <Plus className="w-4 h-4" /> Add Role Group
            </button>
          </div>
          <div className="card-flat overflow-hidden">
            <table className="w-full data-table" data-testid="groups-table">
              <thead>
                <tr><th>Group Name</th><th>Description</th><th>Admin Group</th><th>Users</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {roleGroups.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-sm text-[#6B7280]">No role groups yet. Click "Add Role Group" to create one.</td></tr>
                )}
                {roleGroups.map(g => {
                  const memberCount = users.filter(u => u.role_group_id === g.id).length;
                  return (
                    <tr key={g.id} data-testid={`group-row-${g.id}`}>
                      <td className="font-medium text-[#1D3557]">{g.name}</td>
                      <td className="text-sm text-[#4B5563]">{g.description || '-'}</td>
                      <td>
                        {g.is_admin_group
                          ? <span className="status-badge bg-[#FDE8E8] text-[#9B1C1C]">Admin</span>
                          : <span className="status-badge bg-[#F3F4F6] text-[#4B5563]">Standard</span>}
                      </td>
                      <td className="text-sm mono">{memberCount}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openGroupDialog(g)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Edit" data-testid={`edit-group-${g.id}`}><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => deleteGroup(g)} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`delete-group-${g.id}`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Role Group Create/Edit Dialog */}
      <Dialog open={groupDialog} onOpenChange={(o) => { setGroupDialog(o); if (!o) setEditingGroup(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="group-dialog">
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">{editingGroup ? `Edit Role Group — ${editingGroup.name}` : 'Create Role Group'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-[#374151]">Group Name *</label>
                <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="e.g. Production Admin" data-testid="group-name-input" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151]">Description</label>
                <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={groupForm.description} onChange={e => setGroupForm({ ...groupForm, description: e.target.value })} placeholder="Short description..." data-testid="group-desc-input" />
              </div>
              <div className="col-span-2 flex items-center gap-2 bg-[#FEF3C7] border border-[#F59E0B] rounded-sm px-3 py-2">
                <input type="checkbox" id="is-admin-group" checked={groupForm.is_admin_group} onChange={e => setGroupForm({ ...groupForm, is_admin_group: e.target.checked })} className="w-4 h-4 accent-[#9B1C1C]" data-testid="group-admin-flag" />
                <label htmlFor="is-admin-group" className="text-sm">
                  <span className="font-semibold text-[#9B1C1C]">Admin Group</span>
                  <span className="text-[#723B13] ml-2">— Members can see BOM rollup costs (Material Cost, Process Cost, Extended Cost, Total/Unit).</span>
                </label>
              </div>
            </div>

            {/* Permissions matrix — same hierarchy as user form */}
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-[#1D3557] mb-2">Group Permissions</h3>
              <div className="border rounded-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F3F4F6] text-[#4B5563]">
                      <th className="text-left py-2 px-3 text-xs font-semibold uppercase">Main Module / Sub-module</th>
                      {['view','create','edit','delete'].map(a => (
                        <th key={a} className="text-center py-2 px-2 text-xs font-semibold uppercase w-20">{ACTION_LABELS[a]}</th>
                      ))}
                      <th className="text-center py-2 px-2 text-xs font-semibold uppercase w-16">All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULE_GROUPS.map(grp => (
                      <React.Fragment key={grp.main}>
                        <tr className="bg-[#F9FAFB]">
                          <td colSpan={6} className="py-1.5 px-3 text-[11px] font-semibold text-[#374151] uppercase tracking-wide">{grp.main}</td>
                        </tr>
                        {grp.subs.map(sub => {
                          const perms = groupForm.permissions?.[sub.key] || [];
                          const moduleActions = (modulesData?.module_actions || {})[sub.key] || ['view','create','edit','delete'];
                          const hasAll = moduleActions.every(a => perms.includes(a));
                          return (
                            <tr key={sub.key} className="border-t hover:bg-[#F9FAFB]">
                              <td className="py-1.5 px-3 pl-6 text-[13px] text-[#111827]">{sub.label}</td>
                              {['view','create','edit','delete'].map(a => (
                                <td key={a} className="text-center py-1.5 px-2">
                                  {moduleActions.includes(a) ? (
                                    <input type="checkbox" checked={perms.includes(a)} onChange={() => toggleGroupPerm(sub.key, a)} data-testid={`group-perm-${sub.key}-${a}`} className="w-4 h-4 accent-[#1D3557] cursor-pointer" />
                                  ) : (
                                    <span className="text-[#D1D5DB]">—</span>
                                  )}
                                </td>
                              ))}
                              <td className="text-center py-1.5 px-2">
                                <input type="checkbox" checked={hasAll} onChange={() => {
                                  setGroupForm(prev => ({ ...prev, permissions: { ...prev.permissions, [sub.key]: hasAll ? [] : [...moduleActions] } }));
                                }} data-testid={`group-perm-${sub.key}-all`} className="w-4 h-4 accent-[#1D3557] cursor-pointer" />
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-[#E5E7EB]">
              <button className="btn-secondary" onClick={() => setGroupDialog(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveGroup} data-testid="save-group-btn">{editingGroup ? 'Update' : 'Create'} Group</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={isPermOpen} onOpenChange={(open) => { setIsPermOpen(open); if (!open) setPermUser(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>Module Permissions - {permUser?.name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 mb-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className={`status-badge ${getRoleColor(permUser?.role)}`}>
                {ROLES.find(r => r.value === permUser?.role)?.label}
              </span>
              <span className="text-sm text-[#4B5563]">{permUser?.email}</span>
            </div>
            <button className="btn-secondary text-sm flex items-center space-x-1" onClick={applyRoleDefaults} data-testid="reset-defaults-btn">
              <Key className="w-3 h-3" /><span>Reset to Role Defaults</span>
            </button>
          </div>

          <div className="border rounded-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F3F4F6]">
                  <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-[#4B5563]">Module</th>
                  {modulesData?.actions?.map(action => (
                    <th key={action} className="text-center py-2 px-3 text-xs font-semibold uppercase text-[#4B5563] w-20">{ACTION_LABELS[action]}</th>
                  ))}
                  <th className="text-center py-2 px-3 text-xs font-semibold uppercase text-[#4B5563] w-16">All</th>
                </tr>
              </thead>
              <tbody>
                {modulesData?.modules?.map(module => {
                  const modulePerms = permData[module] || [];
                  const allChecked = modulePerms.length === modulesData?.actions?.length;
                  return (
                    <tr key={module} className="border-t border-[#E5E7EB] hover:bg-[#F9FAFB]" data-testid={`perm-row-${module}`}>
                      <td className="py-2 px-3 text-sm font-medium text-[#1D3557]">{MODULE_LABELS[module] || module}</td>
                      {modulesData?.actions?.map(action => (
                        <td key={action} className="text-center py-2 px-3">
                          <button
                            onClick={() => togglePermission(module, action)}
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                              modulePerms.includes(action)
                                ? 'bg-[#1D3557] border-[#1D3557] text-white'
                                : 'border-[#D1D5DB] hover:border-[#9CA3AF]'
                            }`}
                            data-testid={`perm-${module}-${action}`}
                          >
                            {modulePerms.includes(action) && <Check className="w-3 h-3" />}
                          </button>
                        </td>
                      ))}
                      <td className="text-center py-2 px-3">
                        <button
                          onClick={() => toggleAllModule(module)}
                          className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                            allChecked
                              ? 'bg-[#1D3557] border-[#1D3557] text-white'
                              : 'border-[#D1D5DB] hover:border-[#9CA3AF]'
                          }`}
                          data-testid={`perm-${module}-all`}
                        >
                          {allChecked && <Check className="w-3 h-3" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end space-x-2 mt-4">
            <button className="btn-secondary" onClick={() => setIsPermOpen(false)}>Cancel</button>
            <button className="btn-primary flex items-center space-x-2" onClick={savePermissions} data-testid="save-permissions-btn">
              <Shield className="w-4 h-4" /><span>Save Permissions</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
