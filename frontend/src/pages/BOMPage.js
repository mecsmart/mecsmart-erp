import React, { useState, useEffect, useRef } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { 
  Plus, 
  FileStack, 
  ChevronRight,
  ChevronDown,
  Edit2, 
  Trash2,
  Copy,
  Eye,
  X,
  GitBranch,
  AlertCircle,
  Download,
  Upload
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'obsolete', label: 'Obsolete' },
];

export default function BOMPage() {
  const { user } = useAuth();
  const { formatCurrency } = useCompanySettings();
  const [boms, setBoms] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBom, setEditingBom] = useState(null);
  const [viewBom, setViewBom] = useState(null);
  const [bomExplosion, setBomExplosion] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  
  const [formData, setFormData] = useState({
    parent_item_id: '',
    name: '',
    description: '',
    revision: 'A',
    status: 'draft',
    effectivity_date: '',
    components: [],
  });

  const canEdit = ['admin', 'production_manager'].includes(user?.role);

  useEffect(() => {
    fetchBoms();
    fetchItems();
  }, [statusFilter]);

  const fetchBoms = async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const { data } = await api.get(`/api/bom${params}`);
      setBoms(data);
    } catch (error) {
      console.error('Failed to fetch BOMs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const { data } = await api.get('/api/items');
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  };

  const fetchBomExplosion = async (bomId) => {
    try {
      const { data } = await api.get(`/api/bom/${bomId}/explode`);
      setBomExplosion(data);
      setExpandedItems({});
    } catch (error) {
      console.error('Failed to fetch BOM explosion:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        effectivity_date: formData.effectivity_date ? new Date(formData.effectivity_date).toISOString() : null,
      };
      
      if (editingBom) {
        await api.put(`/api/bom/${editingBom.id}`, payload);
      } else {
        await api.post('/api/bom', payload);
      }
      setIsDialogOpen(false);
      setEditingBom(null);
      resetForm();
      fetchBoms();
    } catch (error) {
      console.error('Failed to save BOM:', error);
      alert(error.response?.data?.detail || 'Failed to save BOM');
    }
  };

  const handleEdit = (bom) => {
    setEditingBom(bom);
    setFormData({
      parent_item_id: bom.parent_item_id,
      name: bom.name,
      description: bom.description || '',
      revision: bom.revision,
      status: bom.status,
      effectivity_date: bom.effectivity_date ? bom.effectivity_date.split('T')[0] : '',
      components: bom.components || [],
    });
    setIsDialogOpen(true);
  };

  const handleView = async (bom) => {
    setViewBom(bom);
    await fetchBomExplosion(bom.id);
  };

  const handleRevise = async (bom) => {
    const newRevision = prompt('Enter new revision (e.g., B, C, D):', 
      String.fromCharCode(bom.revision.charCodeAt(0) + 1));
    if (!newRevision) return;
    
    try {
      await api.post(`/api/bom/${bom.id}/revise?new_revision=${newRevision}`);
      fetchBoms();
    } catch (error) {
      console.error('Failed to revise BOM:', error);
      alert(error.response?.data?.detail || 'Failed to create revision');
    }
  };

  const handleDelete = async (bom) => {
    if (!window.confirm(`Delete BOM "${bom.name}"?`)) return;
    try {
      await api.delete(`/api/bom/${bom.id}`);
      fetchBoms();
    } catch (error) {
      console.error('Failed to delete BOM:', error);
      alert(error.response?.data?.detail || 'Failed to delete BOM');
    }
  };

  const addComponent = () => {
    setFormData({
      ...formData,
      components: [...formData.components, { item_id: '', quantity: 1, unit_of_measure: 'pcs', is_alternate: false }],
    });
  };

  const removeComponent = (index) => {
    setFormData({
      ...formData,
      components: formData.components.filter((_, i) => i !== index),
    });
  };

  const updateComponent = (index, field, value) => {
    const newComponents = [...formData.components];
    newComponents[index] = { ...newComponents[index], [field]: value };
    setFormData({ ...formData, components: newComponents });
  };

  const bomFileRef = useRef(null);
  const [bomImporting, setBomImporting] = useState(false);

  const handleBomExport = async () => {
    try {
      const response = await api.get('/api/bom/export/excel', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'bom_data.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert('Failed to export BOM data');
    }
  };

  const handleBomImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBomImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/api/bom/import/excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert(`BOM Import complete!\nCreated: ${data.created}\nUpdated: ${data.updated}${data.errors?.length ? `\nErrors: ${data.errors.length}\n${data.errors.slice(0, 5).join('\n')}` : ''}`);
      fetchBoms();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to import BOMs');
    } finally {
      setBomImporting(false);
      if (bomFileRef.current) bomFileRef.current.value = '';
    }
  };

  const resetForm = () => {
    setFormData({
      parent_item_id: '',
      name: '',
      description: '',
      revision: 'A',
      status: 'draft',
      effectivity_date: '',
      components: [],
    });
  };

  const toggleExpanded = (key) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderExplosionTree = (items, parentKey = '', level = 0) => {
    return items.map((item, index) => {
      const key = `${parentKey}-${index}`;
      const isExpanded = expandedItems[key];
      const hasChildren = item.children && item.children.length > 0;
      
      return (
        <React.Fragment key={key}>
          <tr className="bom-tree-row" data-testid={`bom-tree-row-${level}-${index}`}>
            <td className="py-2 px-3">
              <div className="flex items-center" style={{ paddingLeft: `${level * 24}px` }}>
                {hasChildren ? (
                  <button
                    onClick={() => toggleExpanded(key)}
                    className="mr-2 p-0.5 hover:bg-[#F3F4F6] rounded"
                    data-testid={`bom-tree-expand-${level}-${index}`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-[#4B5563]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#4B5563]" />
                    )}
                  </button>
                ) : (
                  <span className="w-6"></span>
                )}
                <span className="mono text-sm">{item.item?.part_number || 'N/A'}</span>
              </div>
            </td>
            <td className="py-2 px-3 text-sm">{item.item?.name || 'Unknown'}</td>
            <td className="py-2 px-3 text-sm text-right mono">{item.quantity}</td>
            <td className="py-2 px-3 text-sm">{item.item?.unit_of_measure || '-'}</td>
            <td className="py-2 px-3 text-sm text-right mono">{item.unit_cost != null ? formatCurrency(item.unit_cost) : '-'}</td>
            <td className="py-2 px-3 text-sm text-right mono font-medium">{item.extended_cost != null ? formatCurrency(item.extended_cost) : '-'}</td>
            <td className="py-2 px-3">
              {item.is_alternate && (
                <span className="status-badge bg-[#FDF6B2] text-[#723B13]">Alternate</span>
              )}
            </td>
          </tr>
          {hasChildren && isExpanded && renderExplosionTree(item.children, key, level + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="space-y-6" data-testid="bom-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#111827]">Bill of Materials</h1>
          <p className="text-sm text-[#4B5563]">Manage product structures and component relationships</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={handleBomExport} className="btn-secondary flex items-center space-x-1 text-sm" data-testid="export-bom-btn">
            <Download className="w-4 h-4" /><span>Export</span>
          </button>
          {canEdit && (
            <>
              <input type="file" ref={bomFileRef} accept=".xlsx,.xls" onChange={handleBomImport} className="hidden" />
              <button onClick={() => bomFileRef.current?.click()} disabled={bomImporting} className="btn-secondary flex items-center space-x-1 text-sm" data-testid="import-bom-btn">
                <Upload className="w-4 h-4" /><span>{bomImporting ? 'Importing...' : 'Import'}</span>
              </button>
            </>
          )}
        {canEdit && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingBom(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <button className="btn-primary flex items-center space-x-2" data-testid="add-bom-btn">
                <Plus className="w-4 h-4" />
                <span>Create BOM</span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">{editingBom ? 'Edit BOM' : 'Create New BOM'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Parent Item *</label>
                    <Select 
                      value={formData.parent_item_id} 
                      onValueChange={(v) => setFormData({ ...formData, parent_item_id: v })}
                    >
                      <SelectTrigger data-testid="bom-parent-item-select">
                        <SelectValue placeholder="Select parent item" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.filter(i => ['sub_assembly', 'finished_good', 'component'].includes(i.category)).map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.part_number} - {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">BOM Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input-field"
                      placeholder="Hydraulic Press 50T BOM"
                      required
                      data-testid="bom-name-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Revision</label>
                    <input
                      type="text"
                      value={formData.revision}
                      onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                      className="input-field mono"
                      placeholder="A"
                      data-testid="bom-revision-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Status</label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger data-testid="bom-status-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#111827] mb-1">Effectivity Date</label>
                    <input
                      type="date"
                      value={formData.effectivity_date}
                      onChange={(e) => setFormData({ ...formData, effectivity_date: e.target.value })}
                      className="input-field"
                      data-testid="bom-effectivity-date-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="BOM description..."
                    data-testid="bom-description-input"
                  />
                </div>

                {/* Components */}
                <div className="border-t border-[#E5E7EB] pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-[#111827]">Components</label>
                    <button
                      type="button"
                      onClick={addComponent}
                      className="btn-secondary text-xs flex items-center space-x-1"
                      data-testid="add-component-btn"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Component</span>
                    </button>
                  </div>
                  
                  {formData.components.length === 0 ? (
                    <div className="text-center py-6 text-[#4B5563] bg-[#F3F4F6] rounded-sm">
                      <FileStack className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" />
                      <p className="text-sm">No components added yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formData.components.map((comp, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-[#F3F4F6] rounded-sm">
                          <div className="flex-1">
                            <Select 
                              value={comp.item_id} 
                              onValueChange={(v) => updateComponent(index, 'item_id', v)}
                            >
                              <SelectTrigger className="bg-white" data-testid={`component-item-select-${index}`}>
                                <SelectValue placeholder="Select component" />
                              </SelectTrigger>
                              <SelectContent>
                                {items.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.part_number} - {item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-24">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={comp.quantity}
                              onChange={(e) => updateComponent(index, 'quantity', parseFloat(e.target.value) || 0)}
                              className="input-field mono bg-white"
                              placeholder="Qty"
                              data-testid={`component-qty-input-${index}`}
                            />
                          </div>
                          <label className="flex items-center space-x-1 text-xs text-[#4B5563]">
                            <input
                              type="checkbox"
                              checked={comp.is_alternate}
                              onChange={(e) => updateComponent(index, 'is_alternate', e.target.checked)}
                              className="rounded"
                            />
                            <span>Alt</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeComponent(index)}
                            className="p-1 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                  <button type="button" onClick={() => setIsDialogOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" data-testid="bom-save-btn">
                    {editingBom ? 'Update BOM' : 'Create BOM'}
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {/* Status Filter */}
      <div className="card-flat p-4">
        <div className="flex items-center gap-4">
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-48" data-testid="bom-status-filter">
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

      {/* BOMs List - Multi-Level Collapsible Tree View */}
      <div className="card-flat overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
          </div>
        ) : boms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
            <FileStack className="w-12 h-12 mb-2 text-[#9CA3AF]" />
            <p>No BOMs found</p>
          </div>
        ) : (
          <div className="p-4">
            {(() => {
              // Group BOMs by parent item
              const grouped = {};
              boms.forEach(bom => {
                const pid = bom.parent_item_id || bom.parent_item?.id || 'unknown';
                if (!grouped[pid]) grouped[pid] = { item: bom.parent_item, boms: [] };
                grouped[pid].boms.push(bom);
              });
              
              // Find child BOMs for a given item
              const findChildBom = (itemId) => boms.find(b => b.parent_item_id === itemId && b.status === 'active');
              
              // Recursive tree node renderer
              const renderTreeNode = (itemData, depth, isLast, parentLines) => {
                const { item: nodeItem, quantity, uom, bom: nodeBom, components } = itemData;
                const cat = nodeItem?.category || '';
                const catLabel = cat === 'finished_good' ? 'FG' : cat === 'sub_assembly' ? 'SA' : cat === 'raw_material' ? 'RM' : cat === 'component' ? 'CP' : 'PT';
                const catColor = cat === 'finished_good' ? '#1D3557' : cat === 'sub_assembly' ? '#723B13' : cat === 'raw_material' ? '#2563EB' : cat === 'component' ? '#9B1C1C' : '#6B7280';
                const catBg = cat === 'finished_good' ? 'bg-[#1D3557]' : cat === 'sub_assembly' ? 'bg-[#723B13]' : cat === 'raw_material' ? 'bg-[#DBEAFE]' : cat === 'component' ? 'bg-[#FDE8E8]' : 'bg-[#F3F4F6]';
                const catText = cat === 'finished_good' || cat === 'sub_assembly' ? 'text-white' : cat === 'raw_material' ? 'text-[#1D4ED8]' : cat === 'component' ? 'text-[#9B1C1C]' : 'text-[#374151]';
                const hasChildren = components && components.length > 0;
                const nodeKey = `tree-${nodeItem?.id || 'x'}-${depth}`;
                const isOpen = expandedItems[nodeKey] !== false; // default open
                
                return (
                  <div key={nodeKey} className="relative">
                    {/* Connecting lines */}
                    {depth > 0 && (
                      <div className="absolute" style={{ left: `${(depth - 1) * 32 + 16}px`, top: 0, bottom: isLast ? '20px' : 0, width: '1px', background: '#D1D5DB' }} />
                    )}
                    {depth > 0 && (
                      <div className="absolute" style={{ left: `${(depth - 1) * 32 + 16}px`, top: '20px', width: '16px', height: '1px', background: '#D1D5DB' }} />
                    )}
                    
                    {/* Node */}
                    <div className="flex items-center py-1.5 hover:bg-[#F9FAFB] rounded-sm transition-colors" style={{ paddingLeft: `${depth * 32}px` }}>
                      {/* Chevron / Node icon */}
                      {hasChildren ? (
                        <button onClick={() => setExpandedItems(prev => ({ ...prev, [nodeKey]: !isOpen }))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#E5E7EB] mr-1 flex-shrink-0">
                          {isOpen ? <ChevronDown className="w-4 h-4 text-[#4B5563]" /> : <ChevronRight className="w-4 h-4 text-[#4B5563]" />}
                        </button>
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center mr-1 flex-shrink-0">
                          <div className="w-2 h-2 rounded-full" style={{ background: catColor }} />
                        </div>
                      )}
                      
                      {/* Category badge */}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded mr-2 flex-shrink-0 ${catBg} ${catText}`}>{catLabel}</span>
                      
                      {/* Part number + Name */}
                      <span className="mono font-semibold text-sm text-[#111827] mr-2">{nodeItem?.part_number || '?'}</span>
                      <span className="text-sm text-[#374151] mr-3">{nodeItem?.name || '-'}</span>
                      
                      {/* Quantity (not for root FG) */}
                      {quantity != null && depth > 0 && (
                        <span className="mono text-xs text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded mr-2">x{quantity} {uom || ''}</span>
                      )}
                      
                      {/* Cost */}
                      {nodeItem?.unit_cost != null && (
                        <span className="mono text-xs text-[#6B7280] mr-3">{formatCurrency(nodeItem.unit_cost)}</span>
                      )}
                      
                      {/* BOM info (for items that have their own BOM) */}
                      {nodeBom && depth === 0 && (
                        <span className="flex items-center gap-2 ml-auto">
                          <span className={`status-badge status-${nodeBom.status}`}>Rev {nodeBom.revision} - {nodeBom.status}</span>
                          <button onClick={() => handleView(nodeBom)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="View Explosion"><Eye className="w-3.5 h-3.5" /></button>
                          {canEdit && <button onClick={() => handleEdit(nodeBom)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>}
                          {canEdit && <button onClick={() => handleRevise(nodeBom)} className="p-1 text-[#4B5563] hover:text-[#457B9D]" title="Revise"><GitBranch className="w-3.5 h-3.5" /></button>}
                          {user?.role === 'admin' && <button onClick={() => handleDelete(nodeBom)} className="p-1 text-[#4B5563] hover:text-[#9B1C1C]" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </span>
                      )}
                    </div>
                    
                    {/* Children */}
                    {hasChildren && isOpen && (
                      <div className="relative">
                        {components.map((comp, ci) => {
                          const compItem = items.find(i => i.id === comp.item_id) || comp.item;
                          const childBom = findChildBom(comp.item_id);
                          const childComponents = childBom ? childBom.components?.map(cc => ({
                            item: items.find(i => i.id === cc.item_id),
                            quantity: cc.quantity,
                            uom: cc.uom || items.find(i => i.id === cc.item_id)?.unit_of_measure,
                            components: (() => {
                              const grandBom = findChildBom(cc.item_id);
                              return grandBom ? grandBom.components?.map(gc => ({
                                item: items.find(i => i.id === gc.item_id),
                                quantity: gc.quantity,
                                uom: gc.uom,
                                components: []
                              })) : [];
                            })()
                          })) : [];
                          
                          return renderTreeNode({
                            item: compItem,
                            quantity: comp.quantity,
                            uom: comp.uom || compItem?.unit_of_measure,
                            bom: childBom,
                            components: childComponents
                          }, depth + 1, ci === components.length - 1, []);
                        })}
                      </div>
                    )}
                  </div>
                );
              };
              
              // Render top-level FG BOMs
              return Object.entries(grouped)
                .filter(([, g]) => g.item?.category === 'finished_good' || !Object.values(grouped).some(og => og.boms.some(b => b.components?.some(c => c.item_id === g.item?.id))))
                .map(([pid, group]) => {
                  const activeBom = group.boms.find(b => b.status === 'active') || group.boms[0];
                  const topComponents = activeBom?.components?.map(comp => {
                    const compItem = items.find(i => i.id === comp.item_id);
                    const childBom = findChildBom(comp.item_id);
                    const childComps = childBom ? childBom.components?.map(cc => {
                      const ccItem = items.find(i => i.id === cc.item_id);
                      const grandBom = findChildBom(cc.item_id);
                      return {
                        item: ccItem,
                        quantity: cc.quantity,
                        uom: cc.uom || ccItem?.unit_of_measure,
                        components: grandBom ? grandBom.components?.map(gc => ({
                          item: items.find(i => i.id === gc.item_id),
                          quantity: gc.quantity,
                          uom: gc.uom,
                          components: []
                        })) : []
                      };
                    }) : [];
                    
                    return {
                      item: compItem,
                      quantity: comp.quantity,
                      uom: comp.uom || compItem?.unit_of_measure,
                      bom: childBom,
                      components: childComps
                    };
                  }) || [];
                  
                  return (
                    <div key={pid} className="mb-4 border border-[#E5E7EB] rounded-sm p-3" data-testid={`bom-tree-${pid}`}>
                      {renderTreeNode({
                        item: group.item,
                        quantity: null,
                        uom: null,
                        bom: activeBom,
                        components: topComponents
                      }, 0, true, [])}
                      {/* Show other revisions if multiple BOMs */}
                      {group.boms.length > 1 && (
                        <div className="mt-2 ml-8 text-xs text-[#6B7280]">
                          Other revisions: {group.boms.filter(b => b.id !== activeBom?.id).map(b => (
                            <span key={b.id} className="inline-flex items-center gap-1 mr-3">
                              <span className={`status-badge text-[9px] status-${b.status}`}>Rev {b.revision}</span>
                              <button onClick={() => handleView(b)} className="hover:underline">{b.name}</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
            })()}
          </div>
        )}
      </div>

      {/* BOM Explosion View Dialog */}
      <Dialog open={!!viewBom} onOpenChange={(open) => { if (!open) { setViewBom(null); setBomExplosion(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center space-x-2">
              <FileStack className="w-5 h-5" />
              <span>BOM Explosion: {viewBom?.name}</span>
            </DialogTitle>
          </DialogHeader>
          
          {bomExplosion && (
            <div className="mt-4">
              <div className="bg-[#F3F4F6] p-3 rounded-sm mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="mono font-medium">{bomExplosion.parent_item?.part_number}</span>
                    <span className="text-[#4B5563] mx-2">-</span>
                    <span>{bomExplosion.parent_item?.name}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="mono font-semibold text-[#1D3557]" data-testid="bom-total-cost">
                      Total Cost: {formatCurrency(bomExplosion.total_rollup_cost != null ? bomExplosion.total_rollup_cost : 0)}
                    </span>
                    <span className={`status-badge status-${bomExplosion.bom?.status}`}>
                      Rev {bomExplosion.bom?.revision} &bull; {bomExplosion.bom?.status}
                    </span>
                  </div>
                </div>
              </div>

              {bomExplosion.explosion?.length === 0 ? (
                <div className="text-center py-8 text-[#4B5563]">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" />
                  <p>No components in this BOM</p>
                </div>
              ) : (
                <div className="border border-[#E5E7EB] rounded-sm overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#F3F4F6] text-xs font-semibold uppercase tracking-wider text-[#4B5563]">
                        <th className="text-left py-2 px-3">Part Number</th>
                        <th className="text-left py-2 px-3">Description</th>
                        <th className="text-right py-2 px-3">Qty</th>
                        <th className="text-left py-2 px-3">UOM</th>
                        <th className="text-right py-2 px-3">Unit Cost</th>
                        <th className="text-right py-2 px-3">Extended Cost</th>
                        <th className="text-left py-2 px-3">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderExplosionTree(bomExplosion.explosion)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
