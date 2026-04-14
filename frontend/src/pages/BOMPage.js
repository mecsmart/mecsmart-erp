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
  Upload,
  Search,
  Printer
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
  const [allExplosions, setAllExplosions] = useState({});
  const [bomSearch, setBomSearch] = useState('');
  
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
      // Fetch explosions for all active FG BOMs only
      const explosions = {};
      for (const bom of data.filter(b => b.status === 'active' && b.parent_item?.category === 'finished_good')) {
        try {
          const { data: expData } = await api.get(`/api/bom/${bom.id}/explode`);
          explosions[bom.id] = expData;
        } catch (e) { /* skip */ }
      }
      setAllExplosions(explosions);
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

  const printBomExplosion = (parentItem, explosion, totalCost, bomInfo) => {
    const catLabel = (cat) => cat === 'finished_good' ? 'FG' : cat === 'sub_assembly' ? 'SG' : cat === 'raw_material' ? 'RM' : cat === 'component' ? 'CP' : 'PT';
    const renderPrintRows = (nodes, level = 0) => {
      let html = '';
      (nodes || []).forEach((node, idx) => {
        const item = node.item || {};
        const indent = level * 20;
        const bgColor = item.category === 'sub_assembly' ? '#FEF3C7' : item.category === 'raw_material' ? '#DBEAFE' : item.category === 'component' ? '#FEE2E2' : '#F3F4F6';
        html += `<tr style="background:${bgColor}">
          <td style="padding:4px 8px;padding-left:${indent + 8}px;font-size:10px;font-weight:600;">${catLabel(item.category || '')}</td>
          <td style="padding:4px 8px;font-family:monospace;font-size:11px;">${item.part_number || '-'}</td>
          <td style="padding:4px 8px;font-size:11px;">${item.name || '-'}${node.is_alternate ? ' (alt)' : ''}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px;">${node.quantity}</td>
          <td style="padding:4px 8px;font-size:11px;">${item.unit_of_measure || '-'}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px;">${node.unit_cost != null ? node.unit_cost.toFixed(2) : '-'}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px;font-weight:600;">${node.extended_cost != null ? node.extended_cost.toFixed(2) : '-'}</td>
        </tr>`;
        if (node.children && node.children.length > 0) {
          html += renderPrintRows(node.children, level + 1);
        }
      });
      return html;
    };
    const html = `<!DOCTYPE html><html><head><title>BOM - ${parentItem?.part_number || ''}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;font-size:11px;padding:20px}
    h1{font-size:16px;color:#1D3557;margin-bottom:4px}h2{font-size:12px;color:#555;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#1D3557;color:white;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase}
    td{border-bottom:1px solid #ddd;font-size:11px}.total{font-size:13px;font-weight:700;text-align:right;margin-top:12px;color:#1D3557}
    @media print{body{padding:10px}}</style></head><body>
    <h1>${parentItem?.part_number || ''} - ${parentItem?.name || ''}</h1>
    <h2>BOM Explosion | Rev ${bomInfo?.revision || '-'} | ${bomInfo?.status || '-'}</h2>
    <table><thead><tr><th>Type</th><th>Part Number</th><th>Description</th><th style="text-align:right">QTY</th><th>UOM</th><th style="text-align:right">Unit Cost</th><th style="text-align:right">Extended Cost</th></tr></thead>
    <tbody>${renderPrintRows(explosion)}</tbody></table>
    <p class="total">Total Rollup Cost: ${formatCurrency(totalCost)}</p>
    <p style="text-align:center;font-size:9px;color:#aaa;margin-top:30px">Printed on ${new Date().toLocaleString()}</p>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.onload = () => w.print();
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

      {/* Status Filter & Search */}
      <div className="card-flat p-4">
        <div className="flex items-center gap-4">
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
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
          <div className="flex-1" />
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
            <input
              type="text"
              value={bomSearch}
              onChange={(e) => setBomSearch(e.target.value)}
              placeholder="Search BOM by part number or name..."
              className="input-field pl-9 text-sm"
              data-testid="bom-search-input"
            />
          </div>
        </div>
      </div>

      {/* BOMs List - Multi-Level Explosion Table View */}
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
          <div className="p-3 space-y-4">
            {(() => {
              // Group by parent and show only FG (Finished Good) BOMs as top-level
              const grouped = {};
              boms.filter(bom => bom.parent_item?.category === 'finished_good').forEach(bom => {
                const pid = bom.parent_item_id || 'x';
                if (!grouped[pid]) grouped[pid] = { item: bom.parent_item, boms: [] };
                grouped[pid].boms.push(bom);
              });
              
              // Row color by category
              const rowColor = (cat, level) => {
                if (cat === 'finished_good') return 'bg-[#1D3557]/5 border-l-4 border-l-[#1D3557]';
                if (cat === 'sub_assembly') return 'bg-[#723B13]/5 border-l-4 border-l-[#723B13]';
                if (cat === 'raw_material') return 'bg-[#2563EB]/5 border-l-4 border-l-[#2563EB]';
                if (cat === 'component') return 'bg-[#9B1C1C]/5 border-l-4 border-l-[#9B1C1C]';
                return 'bg-[#F3F4F6] border-l-4 border-l-[#6B7280]';
              };
              const catBadge = (cat) => {
                if (cat === 'finished_good') return 'bg-[#1D3557] text-white';
                if (cat === 'sub_assembly') return 'bg-[#723B13] text-white';
                if (cat === 'raw_material') return 'bg-[#DBEAFE] text-[#1D4ED8]';
                if (cat === 'component') return 'bg-[#FDE8E8] text-[#9B1C1C]';
                return 'bg-[#F3F4F6] text-[#374151]';
              };
              const catLabel = (cat) => cat === 'finished_good' ? 'FG' : cat === 'sub_assembly' ? 'SG' : cat === 'raw_material' ? 'RM' : cat === 'component' ? 'CP' : 'PT';
              
              // Recursive flatten explosion into table rows
              const flattenRows = (nodes, level = 1, parentKey = '') => {
                const rows = [];
                (nodes || []).forEach((node, idx) => {
                  const item = node.item || {};
                  const cat = item.category || '';
                  const key = `${parentKey}-${idx}`;
                  const hasChildren = node.children && node.children.length > 0;
                  const isExpanded = expandedItems[key] !== false;
                  
                  rows.push({
                    key,
                    level,
                    item,
                    cat,
                    quantity: node.quantity,
                    unit_cost: node.unit_cost || 0,
                    extended_cost: node.extended_cost || 0,
                    hasChildren,
                    isExpanded,
                    is_alternate: node.is_alternate
                  });
                  
                  if (hasChildren && isExpanded) {
                    rows.push(...flattenRows(node.children, level + 1, key));
                  }
                });
                return rows;
              };
              
              return Object.entries(grouped).filter(([pid, group]) => {
                if (!bomSearch.trim()) return true;
                const q = bomSearch.toLowerCase();
                const pi = group.item;
                if (pi?.part_number?.toLowerCase().includes(q)) return true;
                if (pi?.name?.toLowerCase().includes(q)) return true;
                // Also search in explosion children
                const searchNodes = (nodes) => {
                  for (const n of (nodes || [])) {
                    if (n.item?.part_number?.toLowerCase().includes(q)) return true;
                    if (n.item?.name?.toLowerCase().includes(q)) return true;
                    if (n.children && searchNodes(n.children)) return true;
                  }
                  return false;
                };
                const activeBom = group.boms.find(b => b.status === 'active') || group.boms[0];
                const exp = allExplosions[activeBom?.id];
                return exp ? searchNodes(exp.explosion) : false;
              }).map(([pid, group]) => {
                const parentItem = group.item;
                const activeBom = group.boms.find(b => b.status === 'active') || group.boms[0];
                const explosion = allExplosions[activeBom?.id];
                const explosionRows = explosion ? flattenRows(explosion.explosion) : [];
                const totalCost = explosion?.total_rollup_cost || 0;
                
                return (
                  <div key={pid} className="border border-[#D1D5DB] rounded-sm overflow-hidden" data-testid={`bom-tree-${pid}`}>
                    {/* FG Header Row */}
                    <div className={`flex items-center justify-between px-4 py-3 text-white`} style={{ backgroundColor: 'rgba(29, 53, 87, 0.75)' }}>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded">{catLabel(parentItem?.category)}</span>
                        <span className="mono font-bold text-sm">{parentItem?.part_number || '-'}</span>
                        <span className="font-medium">{parentItem?.name || '-'}</span>
                        {activeBom && <span className="text-xs bg-white/15 px-2 py-0.5 rounded">Rev {activeBom.revision} - {activeBom.status}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="mono text-sm font-bold">Total: {formatCurrency(totalCost)}</span>
                        {explosion && <button onClick={() => printBomExplosion(parentItem, explosion.explosion, totalCost, activeBom)} className="p-1 hover:bg-white/20 rounded" title="Print BOM" data-testid={`print-bom-${pid}`}><Printer className="w-4 h-4" /></button>}
                        <button onClick={() => handleView(activeBom)} className="p-1 hover:bg-white/20 rounded" title="View"><Eye className="w-4 h-4" /></button>
                        {canEdit && <button onClick={() => handleEdit(activeBom)} className="p-1 hover:bg-white/20 rounded" title="Edit"><Edit2 className="w-4 h-4" /></button>}
                        {canEdit && <button onClick={() => handleRevise(activeBom)} className="p-1 hover:bg-white/20 rounded" title="Revise"><GitBranch className="w-4 h-4" /></button>}
                        {user?.role === 'admin' && <button onClick={() => handleDelete(activeBom)} className="p-1 hover:bg-white/20 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>
                    
                    {/* Explosion Table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F3F4F6] text-[#374151] text-xs uppercase">
                          <th className="text-left py-2 px-3 w-8"></th>
                          <th className="text-left py-2 px-2">Type</th>
                          <th className="text-left py-2 px-2">Part Number</th>
                          <th className="text-left py-2 px-2">Description</th>
                          <th className="text-right py-2 px-2">QTY</th>
                          <th className="text-left py-2 px-2">UOM</th>
                          <th className="text-right py-2 px-2">Unit Cost</th>
                          <th className="text-right py-2 px-3">Extended Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {explosionRows.length === 0 && (
                          <tr><td colSpan="8" className="text-center py-4 text-[#9CA3AF] text-xs">Loading explosion data...</td></tr>
                        )}
                        {explosionRows.map((row) => (
                          <tr key={row.key} className={`${rowColor(row.cat, row.level)} transition-colors hover:brightness-95 ${row.is_alternate ? 'opacity-60 italic' : ''}`}>
                            <td className="py-2 px-3" style={{ paddingLeft: `${row.level * 20}px` }}>
                              {row.hasChildren ? (
                                <button onClick={() => setExpandedItems(p => ({ ...p, [row.key]: !row.isExpanded }))} className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/10" data-testid={`toggle-${row.key}`}>
                                  {row.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              ) : (
                                <div className="w-5 h-5 flex items-center justify-center">
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: row.cat === 'raw_material' ? '#2563EB' : row.cat === 'component' ? '#9B1C1C' : '#6B7280' }} />
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${catBadge(row.cat)}`}>{catLabel(row.cat)}</span>
                            </td>
                            <td className="py-2 px-2 mono font-semibold text-[#111827]">{row.item?.part_number || '?'}</td>
                            <td className="py-2 px-2 text-[#374151]">{row.item?.name || '-'}{row.is_alternate ? ' (alt)' : ''}</td>
                            <td className="py-2 px-2 text-right mono font-medium">{row.quantity}</td>
                            <td className="py-2 px-2 text-[#6B7280]">{row.item?.unit_of_measure || '-'}</td>
                            <td className="py-2 px-2 text-right mono">{formatCurrency(row.unit_cost)}</td>
                            <td className="py-2 px-3 text-right mono font-medium">{formatCurrency(row.extended_cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {/* Other revisions */}
                    {group.boms.length > 1 && (
                      <div className="px-4 py-2 bg-[#F9FAFB] border-t text-xs text-[#6B7280] flex items-center gap-2">
                        <span>Other revisions:</span>
                        {group.boms.filter(b => b.id !== activeBom?.id).map(b => (
                          <button key={b.id} onClick={() => handleView(b)} className="inline-flex items-center gap-1 hover:underline">
                            <span className={`status-badge text-[9px] status-${b.status}`}>Rev {b.revision}</span>{b.name}
                          </button>
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
