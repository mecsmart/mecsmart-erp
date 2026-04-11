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

      {/* BOMs List */}
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
          <div className="overflow-x-auto">
            <table className="w-full data-table" data-testid="bom-table">
              <thead>
                <tr>
                  <th>Parent Item</th>
                  <th>BOM Name</th>
                  <th>Revision</th>
                  <th>Status</th>
                  <th>Components</th>
                  <th>Effectivity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {boms.map((bom) => (
                  <tr key={bom.id} data-testid={`bom-row-${bom.id}`}>
                    <td>
                      <div>
                        <span className="mono text-sm font-medium">{bom.parent_item?.part_number || '-'}</span>
                        <p className="text-xs text-[#4B5563]">{bom.parent_item?.name || '-'}</p>
                      </div>
                    </td>
                    <td className="font-medium">{bom.name}</td>
                    <td className="mono">{bom.revision}</td>
                    <td>
                      <span className={`status-badge status-${bom.status}`}>
                        {bom.status}
                      </span>
                    </td>
                    <td className="mono">{bom.components?.length || 0}</td>
                    <td className="text-sm text-[#4B5563]">
                      {bom.effectivity_date ? new Date(bom.effectivity_date).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleView(bom)}
                          className="p-1 text-[#4B5563] hover:text-[#1D3557]"
                          title="View Explosion"
                          data-testid={`view-bom-${bom.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => handleEdit(bom)}
                              className="p-1 text-[#4B5563] hover:text-[#1D3557]"
                              title="Edit"
                              data-testid={`edit-bom-${bom.id}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRevise(bom)}
                              className="p-1 text-[#4B5563] hover:text-[#457B9D]"
                              title="Create Revision"
                              data-testid={`revise-bom-${bom.id}`}
                            >
                              <GitBranch className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => handleDelete(bom)}
                            className="p-1 text-[#4B5563] hover:text-[#9B1C1C]"
                            title="Delete"
                            data-testid={`delete-bom-${bom.id}`}
                          >
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
