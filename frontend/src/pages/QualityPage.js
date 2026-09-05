import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useItemsCatalog } from '../hooks/useItemsCatalog';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  ClipboardCheck, 
  CheckCircle2,
  XCircle,
  AlertCircle,
  Filter,
  X,
  FileText
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export default function QualityPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [inspections, setInspections] = useState([]);
  const items = useItemsCatalog();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inspections');
  const [resultFilter, setResultFilter] = useState('');
  
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isInspectionDialogOpen, setIsInspectionDialogOpen] = useState(false);
  
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    category: 'incoming',
    checklist_items: [],
  });
  
  const [inspectionForm, setInspectionForm] = useState({
    template_id: '',
    item_id: '',
    lot_number: '',
    quantity_inspected: 1,
    results: [],
    overall_result: 'pass',
  });

  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const canCreate = ['admin', 'quality_inspector'].includes(user?.role);

  useEffect(() => {
    fetchData();
  }, [resultFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [templatesRes, inspectionsRes] = await Promise.all([
        api.get('/api/quality/templates'),
        api.get(`/api/quality/inspections${resultFilter ? `?result=${resultFilter}` : ''}`),
      ]);
      setTemplates(templatesRes.data);
      setInspections(inspectionsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/quality/templates', templateForm);
      setIsTemplateDialogOpen(false);
      resetTemplateForm();
      fetchData();
    } catch (error) {
      console.error('Failed to create template:', error);
      alert(error.response?.data?.detail || 'Failed to create template');
    }
  };

  const handleInspectionSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/quality/inspections', inspectionForm);
      setIsInspectionDialogOpen(false);
      resetInspectionForm();
      fetchData();
    } catch (error) {
      console.error('Failed to create inspection:', error);
      alert(error.response?.data?.detail || 'Failed to create inspection');
    }
  };

  const handleTemplateSelect = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template);
    setInspectionForm({
      ...inspectionForm,
      template_id: templateId,
      results: template?.checklist_items?.map(item => ({
        checklist_item_id: item.id,
        name: item.name,
        passed: true,
        notes: '',
      })) || [],
    });
  };

  const updateInspectionResult = (index, field, value) => {
    const newResults = [...inspectionForm.results];
    newResults[index] = { ...newResults[index], [field]: value };
    setInspectionForm({ ...inspectionForm, results: newResults });
    
    // Auto-update overall result
    const allPassed = newResults.every(r => r.passed);
    const allFailed = newResults.every(r => !r.passed);
    setInspectionForm(prev => ({
      ...prev,
      results: newResults,
      overall_result: allPassed ? 'pass' : allFailed ? 'fail' : 'conditional',
    }));
  };

  const addChecklistItem = () => {
    setTemplateForm({
      ...templateForm,
      checklist_items: [
        ...templateForm.checklist_items,
        { id: String(templateForm.checklist_items.length + 1), name: '', description: '', required: true },
      ],
    });
  };

  const removeChecklistItem = (index) => {
    setTemplateForm({
      ...templateForm,
      checklist_items: templateForm.checklist_items.filter((_, i) => i !== index),
    });
  };

  const updateChecklistItem = (index, field, value) => {
    const newItems = [...templateForm.checklist_items];
    newItems[index] = { ...newItems[index], [field]: value };
    setTemplateForm({ ...templateForm, checklist_items: newItems });
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      name: '',
      description: '',
      category: 'incoming',
      checklist_items: [],
    });
  };

  const resetInspectionForm = () => {
    setInspectionForm({
      template_id: '',
      item_id: '',
      lot_number: '',
      quantity_inspected: 1,
      results: [],
      overall_result: 'pass',
    });
    setSelectedTemplate(null);
  };

  const getResultIcon = (result) => {
    switch (result) {
      case 'pass': return <CheckCircle2 className="w-4 h-4 text-[#03543F]" />;
      case 'fail': return <XCircle className="w-4 h-4 text-[#9B1C1C]" />;
      default: return <AlertCircle className="w-4 h-4 text-[#723B13]" />;
    }
  };

  return (
    <div className="space-y-4" data-testid="quality-page">
      <div className="flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30 bg-white py-2 border-b border-[#E5E7EB] -mx-6 px-6">
        <div>
          <h1 className="text-xl font-bold font-[Chivo] text-[#111827]">Quality Control</h1>
        </div>
        <div className="flex items-center space-x-2">
          {canCreate && (
            <>
              <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
                <DialogTrigger asChild>
                  <button className="btn-secondary flex items-center space-x-2" data-testid="add-template-btn">
                    <FileText className="w-4 h-4" />
                    <span>New Template</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-[Chivo]">Create Inspection Template</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleTemplateSubmit} className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Template Name *</label>
                        <input
                          type="text"
                          value={templateForm.name}
                          onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                          className="input-field"
                          placeholder="Incoming Material Inspection"
                          required
                          data-testid="template-name-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Category *</label>
                        <Select value={templateForm.category} onValueChange={(v) => setTemplateForm({ ...templateForm, category: v })}>
                          <SelectTrigger data-testid="template-category-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="incoming">Incoming</SelectItem>
                            <SelectItem value="in_process">In-Process</SelectItem>
                            <SelectItem value="final">Final</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Description</label>
                      <textarea
                        value={templateForm.description}
                        onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                        className="input-field"
                        rows={2}
                        placeholder="Template description..."
                        data-testid="template-description-input"
                      />
                    </div>

                    {/* Checklist Items */}
                    <div className="border-t border-[#E5E7EB] pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-semibold text-[#111827]">Checklist Items</label>
                        <button
                          type="button"
                          onClick={addChecklistItem}
                          className="btn-secondary text-xs flex items-center space-x-1"
                          data-testid="add-checklist-item-btn"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Item</span>
                        </button>
                      </div>
                      
                      {templateForm.checklist_items.length === 0 ? (
                        <div className="text-center py-6 text-[#4B5563] bg-[#F3F4F6] rounded-sm">
                          <ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" />
                          <p className="text-sm">No checklist items added yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {templateForm.checklist_items.map((item, index) => (
                            <div key={index} className="flex items-start gap-2 p-2 bg-[#F3F4F6] rounded-sm">
                              <div className="flex-1 space-y-2">
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => updateChecklistItem(index, 'name', e.target.value)}
                                  className="input-field bg-white"
                                  placeholder="Check item name"
                                  required
                                />
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => updateChecklistItem(index, 'description', e.target.value)}
                                  className="input-field bg-white text-sm"
                                  placeholder="Description (optional)"
                                />
                              </div>
                              <label className="flex items-center space-x-1 text-xs text-[#4B5563] mt-2">
                                <input
                                  type="checkbox"
                                  checked={item.required}
                                  onChange={(e) => updateChecklistItem(index, 'required', e.target.checked)}
                                  className="rounded"
                                />
                                <span>Req</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => removeChecklistItem(index)}
                                className="p-1 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded mt-1"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                      <button type="button" onClick={() => setIsTemplateDialogOpen(false)} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" data-testid="template-save-btn">
                        Create Template
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={isInspectionDialogOpen} onOpenChange={(open) => {
                setIsInspectionDialogOpen(open);
                if (!open) resetInspectionForm();
              }}>
                <DialogTrigger asChild>
                  <button className="btn-primary flex items-center space-x-2" data-testid="add-inspection-btn">
                    <Plus className="w-4 h-4" />
                    <span>New Inspection</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-[Chivo]">Record Inspection</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleInspectionSubmit} className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Template *</label>
                        <Select value={inspectionForm.template_id} onValueChange={handleTemplateSelect}>
                          <SelectTrigger data-testid="inspection-template-select">
                            <SelectValue placeholder="Select template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Item *</label>
                        <Select value={inspectionForm.item_id} onValueChange={(v) => setInspectionForm({ ...inspectionForm, item_id: v })}>
                          <SelectTrigger data-testid="inspection-item-select">
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            {items.map((i) => (
                              <SelectItem key={i.id} value={i.id}>{i.part_number} - {i.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Lot Number</label>
                        <input
                          type="text"
                          value={inspectionForm.lot_number}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, lot_number: e.target.value })}
                          className="input-field mono"
                          placeholder="LOT-001"
                          data-testid="inspection-lot-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#111827] mb-1">Qty Inspected *</label>
                        <input
                          type="number"
                          min="1"
                          value={inspectionForm.quantity_inspected}
                          onChange={(e) => setInspectionForm({ ...inspectionForm, quantity_inspected: parseInt(e.target.value) || 1 })}
                          className="input-field mono"
                          required
                          data-testid="inspection-qty-input"
                        />
                      </div>
                    </div>

                    {/* Checklist Results */}
                    {selectedTemplate && inspectionForm.results.length > 0 && (
                      <div className="border-t border-[#E5E7EB] pt-4">
                        <label className="text-sm font-semibold text-[#111827] mb-3 block">Inspection Checklist</label>
                        <div className="space-y-2">
                          {inspectionForm.results.map((result, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 bg-[#F3F4F6] rounded-sm">
                              <button
                                type="button"
                                onClick={() => updateInspectionResult(index, 'passed', !result.passed)}
                                className={`p-2 rounded ${result.passed ? 'bg-[#DEF7EC]' : 'bg-[#FDE8E8]'}`}
                                data-testid={`checklist-result-${index}`}
                              >
                                {result.passed ? (
                                  <CheckCircle2 className="w-5 h-5 text-[#03543F]" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-[#9B1C1C]" />
                                )}
                              </button>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-[#111827]">{result.name}</p>
                              </div>
                              <input
                                type="text"
                                value={result.notes}
                                onChange={(e) => updateInspectionResult(index, 'notes', e.target.value)}
                                className="input-field w-40 text-sm bg-white"
                                placeholder="Notes..."
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Overall Result */}
                    <div>
                      <label className="block text-sm font-semibold text-[#111827] mb-1">Overall Result</label>
                      <Select value={inspectionForm.overall_result} onValueChange={(v) => setInspectionForm({ ...inspectionForm, overall_result: v })}>
                        <SelectTrigger data-testid="inspection-result-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pass">Pass</SelectItem>
                          <SelectItem value="fail">Fail</SelectItem>
                          <SelectItem value="conditional">Conditional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-[#E5E7EB]">
                      <button type="button" onClick={() => setIsInspectionDialogOpen(false)} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" data-testid="inspection-save-btn">
                        Record Inspection
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-[#F3F4F6] p-1 rounded-sm">
          <TabsTrigger 
            value="inspections" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-inspections"
          >
            Inspections
          </TabsTrigger>
          <TabsTrigger 
            value="templates" 
            className="data-[state=active]:bg-white data-[state=active]:text-[#1D3557] rounded-sm px-4 py-2 text-sm font-medium"
            data-testid="tab-templates"
          >
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inspections" className="mt-4">
          {/* Filter */}
          <div className="card-flat p-4 mb-4">
            <div className="flex items-center gap-4">
              <Select value={resultFilter || undefined} onValueChange={(v) => setResultFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-48" data-testid="inspection-result-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Results" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Results</SelectItem>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                  <SelectItem value="conditional">Conditional</SelectItem>
                </SelectContent>
              </Select>
              {resultFilter && (
                <button onClick={() => setResultFilter('')} className="btn-secondary flex items-center space-x-1">
                  <X className="w-4 h-4" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : inspections.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <ClipboardCheck className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No inspections recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="inspections-table">
                  <thead>
                    <tr>
                      <th>Inspection #</th>
                      <th>Item</th>
                      <th>Template</th>
                      <th>Lot #</th>
                      <th className="text-right">Qty</th>
                      <th>Result</th>
                      <th>Inspector</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((insp) => (
                      <tr key={insp.id} data-testid={`inspection-row-${insp.id}`}>
                        <td className="mono font-medium">{insp.inspection_number}</td>
                        <td>
                          <span className="mono text-sm">{insp.item?.part_number || '-'}</span>
                          <p className="text-xs text-[#4B5563]">{insp.item?.name || '-'}</p>
                        </td>
                        <td>{insp.template?.name || '-'}</td>
                        <td className="mono">{insp.lot_number || '-'}</td>
                        <td className="text-right mono">{insp.quantity_inspected}</td>
                        <td>
                          <div className="flex items-center space-x-1">
                            {getResultIcon(insp.overall_result)}
                            <span className={`status-badge status-${insp.overall_result}`}>
                              {insp.overall_result}
                            </span>
                          </div>
                        </td>
                        <td className="text-sm">{insp.inspected_by_name || '-'}</td>
                        <td className="text-sm text-[#4B5563]">
                          {insp.inspection_date ? new Date(insp.inspection_date).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <div className="card-flat overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#4B5563]">
                <FileText className="w-12 h-12 mb-2 text-[#9CA3AF]" />
                <p>No templates created yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="templates-table">
                  <thead>
                    <tr>
                      <th>Template Name</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th className="text-right">Checklist Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((template) => (
                      <tr key={template.id} data-testid={`template-row-${template.id}`}>
                        <td className="font-medium">{template.name}</td>
                        <td>
                          <span className={`status-badge ${
                            template.category === 'incoming' ? 'bg-[#E1EFFE] text-[#1E429F]' :
                            template.category === 'in_process' ? 'bg-[#FDF6B2] text-[#723B13]' :
                            'bg-[#DEF7EC] text-[#03543F]'
                          }`}>
                            {template.category.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="text-sm text-[#4B5563]">{template.description || '-'}</td>
                        <td className="text-right mono">{template.checklist_items?.length || 0}</td>
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
