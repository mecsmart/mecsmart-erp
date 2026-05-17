import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import {
  Plus, Edit2, Trash2, MessageSquare, UserCheck, AlertTriangle, Clock,
  Megaphone, Headphones, X, Search, CheckCircle2, XCircle, FileText, Send, RefreshCw, Printer, Upload, GitBranch, Share2, Package2, Download, Eye
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import ConfirmDialog from '../components/ConfirmDialog';
import { SearchableSelect } from '../components/SearchableSelect';
import { SearchableItemSelect } from '../components/SearchableItemSelect';
import { useDraggableRows } from '../hooks/useDraggableRows';
import { downloadHtmlAsPdf } from '../utils/pdfPrint';
import { fmtAmtForCurrency } from '../utils/numberFormat';
import { QuickAddPartyDialog } from '../components/QuickAddPartyDialog';
import { toast } from 'sonner';

// Stage definitions per pipeline — aligned to the customer's CRM diagram:
//   Marketing: Enquiry → Quotation → Negotiation → Won / Lost
//   Support:   Complaint → Open/Assigned → In Progress → Closed / Pending
const LEAD_STAGES = [
  { key: 'enquiry', label: 'Enquiry', color: 'bg-[#E1EFFE] text-[#1E429F]' },
  { key: 'quotation', label: 'Quotation', color: 'bg-[#FEF3C7] text-[#92400E]' },
  { key: 'negotiation', label: 'Negotiation', color: 'bg-[#FCE7F3] text-[#9D174D]' },
  { key: 'won', label: 'Won', color: 'bg-[#DEF7EC] text-[#03543F]' },
  { key: 'lost', label: 'Lost', color: 'bg-[#FDE8E8] text-[#9B1C1C]' },
];

const TICKET_STAGES = [
  { key: 'complaint', label: 'Complaint', color: 'bg-[#E1EFFE] text-[#1E429F]' },
  { key: 'open', label: 'Open / Assigned', color: 'bg-[#FDF6B2] text-[#723B13]' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-[#FEF3C7] text-[#92400E]' },
  { key: 'pending', label: 'Pending', color: 'bg-[#FCE7F3] text-[#9D174D]' },
  { key: 'closed', label: 'Closed', color: 'bg-[#DEF7EC] text-[#03543F]' },
];

const PRIORITY_OPTIONS = [
  { key: 'low', label: 'Low', color: 'bg-[#F3F4F6] text-[#4B5563]' },
  { key: 'medium', label: 'Medium', color: 'bg-[#E1EFFE] text-[#1E429F]' },
  { key: 'high', label: 'High', color: 'bg-[#FDF6B2] text-[#723B13]' },
  { key: 'urgent', label: 'Urgent', color: 'bg-[#FDE8E8] text-[#9B1C1C]' },
];

const SOURCE_OPTIONS = ['website', 'referral', 'trade_show', 'cold_call', 'other'];

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ' };

function formatCurrency(v, currencyCode) {
  const n = parseFloat(v || 0);
  const sym = CURRENCY_SYMBOLS[(currencyCode || 'INR').toUpperCase()] || '₹';
  // For INR keep en-IN grouping; other currencies use plain en-US.
  const locale = (currencyCode || 'INR').toUpperCase() === 'INR' ? 'en-IN' : 'en-US';
  return `${sym}${n.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
}

function formatDateTime(v) {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return '-'; }
}

export default function CRMPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('marketing');
  const [activeSub, setActiveSub] = useState('');
  const [leads, setLeads] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [marketingStages, setMarketingStages] = useState(LEAD_STAGES);
  const [supportStages, setSupportStages] = useState(TICKET_STAGES);
  const [search, setSearch] = useState('');
  const [quotationFromLead, setQuotationFromLead] = useState(null);

  // Sync tab + sub with URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    const s = params.get('sub') || '';
    // Legacy: `sub=contacts` was replaced by a standalone /customers page nested
    // under the CRM sidebar group. Redirect any bookmarked contacts URLs there.
    if (t === 'marketing' && s === 'contacts') {
      navigate('/customers', { replace: true });
      return;
    }
    if (t === 'support' || t === 'marketing' || t === 'quotations') setActiveTab(t);
    setActiveSub(s);
  }, [location.search]);

  const fetchData = useCallback(async () => {
    try {
      const [lRes, tRes, qRes, iRes, cRes, uRes, mCfg, sCfg] = await Promise.all([
        api.get('/api/crm/leads'),
        api.get('/api/crm/tickets'),
        api.get('/api/crm/quotations'),
        api.get('/api/items').catch(() => ({ data: [] })),
        api.get('/api/customers'),
        // /api/users requires admin. Fall back to /api/users/assignable (open to any
        // authenticated user) so Support / Sales reps can still pick assignees.
        api.get('/api/users').catch(() => api.get('/api/users/assignable').catch(() => ({ data: [] }))),
        api.get('/api/crm/pipeline-config/marketing').catch(() => ({ data: null })),
        api.get('/api/crm/pipeline-config/support').catch(() => ({ data: null })),
      ]);
      setLeads(lRes.data || []);
      setTickets(tRes.data || []);
      setQuotations(qRes.data || []);
      setItems(iRes.data || []);
      setCustomers(cRes.data || []);
      setUsers(uRes.data || []);
      if (mCfg.data?.stages?.length) setMarketingStages(mCfg.data.stages);
      if (sCfg.data?.stages?.length) setSupportStages(sCfg.data.stages);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canMarketingEdit = user?.role === 'admin' || user?.permissions?.crm_marketing?.includes('create') || user?.permissions?.crm_marketing?.includes('edit');
  // Tax Invoices live under the Accounts → Tax Invoices module. Edits require
  // `tax_invoices.create` or `tax_invoices.edit`. Admins always pass.
  const canTaxInvoiceEdit = user?.role === 'admin' || user?.permissions?.tax_invoices?.includes('create') || user?.permissions?.tax_invoices?.includes('edit');
  const canSupportEdit = user?.role === 'admin' || user?.permissions?.crm_support?.includes('create') || user?.permissions?.crm_support?.includes('edit');
  // Configuration-page permissions — page is visible to anyone with `view`,
  // but Save buttons require `edit`. Admins always pass.
  const canViewMarketingConfig = user?.role === 'admin' || user?.permissions?.marketing_configuration?.includes('view') || user?.permissions?.marketing_configuration?.includes('edit');
  const canEditMarketingConfig = user?.role === 'admin' || user?.permissions?.marketing_configuration?.includes('edit');
  const canViewSupportConfig = user?.role === 'admin' || user?.permissions?.support_configuration?.includes('view') || user?.permissions?.support_configuration?.includes('edit');
  const canEditSupportConfig = user?.role === 'admin' || user?.permissions?.support_configuration?.includes('edit');

  // Breadcrumb label
  const crumbMain = activeTab === 'quotations' ? 'Quotations' : activeTab === 'support' ? 'Support' : 'Marketing';
  const crumbSub = {
    contacts: 'Contacts', quotations: 'Quotations', configuration: 'Configuration',
    proformas: 'Proforma Invoices', 'tax-invoices': 'Tax Invoices', 'packing-lists': 'Packing Lists', 'number-series': 'Number Series',
    sla: 'SLA Due', activity: 'Activity Logs',
  }[activeSub];

  return (
    <div className="space-y-4" data-testid="crm-page">
      <div className="flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30 bg-white py-2 border-b border-[#E5E7EB] -mx-6 px-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="text-[10px] text-[#6B7280]">CRM · {crumbMain}{crumbSub ? ` · ${crumbSub}` : ''}</div>
            <h1 className="text-xl font-bold font-[Chivo] text-[#1D3557]">{crumbSub || `${crumbMain} ${activeTab === 'support' ? 'Pipeline' : activeTab === 'marketing' ? 'Pipeline' : ''}`}</h1>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="search-input w-64" data-testid="crm-search" />
          </div>
        </div>
      </div>

      {/* Top tab strip removed — sidebar CRM group drives all navigation now */}

      {/* -------- Main content based on tab + sub -------- */}
      {activeTab === 'marketing' && !activeSub && (
        <MarketingPanel
          leads={leads}
          users={users}
          customers={customers}
          stages={marketingStages}
          search={search}
          onRefresh={fetchData}
          canEdit={canMarketingEdit}
          onCreateQuotation={(lead) => { setQuotationFromLead(lead); setActiveTab('quotations'); navigate('/crm?tab=quotations'); }}
        />
      )}
      {activeTab === 'marketing' && activeSub === 'contacts' && (
        <ContactsPanel customers={customers} search={search} onRefresh={fetchData} canEdit={canMarketingEdit} />
      )}
      {activeTab === 'marketing' && activeSub === 'quotations' && (
        <QuotationsPanel
          quotations={quotations}
          leads={leads}
          customers={customers}
          items={items}
          search={search}
          onRefresh={fetchData}
          canEdit={canMarketingEdit}
          prefillFromLead={quotationFromLead}
          onPrefillConsumed={() => setQuotationFromLead(null)}
        />
      )}
      {activeTab === 'marketing' && activeSub === 'configuration' && (
        canViewMarketingConfig ? (
          <PipelineConfigPanel pipelineType="marketing" onRefresh={fetchData} canEdit={canEditMarketingConfig} />
        ) : (
          <div className="card-flat p-6 text-center text-sm text-[#6B7280]" data-testid="marketing-config-no-access">
            You do not have permission to view Marketing Configuration. Ask your admin to grant <code>marketing_configuration.view</code>.
          </div>
        )
      )}
      {activeTab === 'marketing' && activeSub === 'proformas' && (
        <ProformasPanel customers={customers} search={search} onRefresh={fetchData} canEdit={canMarketingEdit} />
      )}
      {activeTab === 'marketing' && activeSub === 'tax-invoices' && (
        <TaxInvoicesPanel customers={customers} search={search} onRefresh={fetchData} canEdit={canTaxInvoiceEdit} />
      )}
      {activeTab === 'marketing' && activeSub === 'packing-lists' && (
        <PackingListsPanel search={search} canEdit={canMarketingEdit} />
      )}
      {activeTab === 'marketing' && activeSub === 'number-series' && (
        <NumberSeriesPanel canEdit={user?.role === 'admin'} />
      )}

      {activeTab === 'quotations' && !activeSub && (
        <QuotationsPanel
          quotations={quotations}
          leads={leads}
          customers={customers}
          items={items}
          search={search}
          onRefresh={fetchData}
          canEdit={canMarketingEdit}
          prefillFromLead={quotationFromLead}
          onPrefillConsumed={() => setQuotationFromLead(null)}
        />
      )}

      {activeTab === 'support' && !activeSub && (
        <SupportPanel tickets={tickets} customers={customers} users={users} items={items} stages={supportStages} search={search} onRefresh={fetchData} canEdit={canSupportEdit} />
      )}
      {activeTab === 'support' && activeSub === 'sla' && (
        <SLAPanel tickets={tickets} search={search} stages={supportStages} />
      )}
      {activeTab === 'support' && activeSub === 'activity' && (
        <ActivityLogPanel search={search} />
      )}
      {activeTab === 'support' && activeSub === 'configuration' && (
        canViewSupportConfig ? (
          <PipelineConfigPanel pipelineType="support" onRefresh={fetchData} canEdit={canEditSupportConfig} />
        ) : (
          <div className="card-flat p-6 text-center text-sm text-[#6B7280]" data-testid="support-config-no-access">
            You do not have permission to view Support Configuration. Ask your admin to grant <code>support_configuration.view</code>.
          </div>
        )
      )}
    </div>
  );
}

/* ============================================================================
 *  MARKETING PANEL — Leads
 * ========================================================================= */
function MarketingPanel({ leads, users, customers, stages, search, onRefresh, canEdit, onCreateQuotation }) {
  const LEAD_ST = (stages && stages.length) ? stages : LEAD_STAGES;
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', customer_id: '', contact_person: '', email: '', phone: '', source: 'website', estimated_value: 0, assignee_id: '', next_followup: '', notes: '', stage: 'enquiry' });
  const [activityDialog, setActivityDialog] = useState({ open: false, lead: null, note: '' });
  const [convertDialog, setConvertDialog] = useState({ open: false, lead: null, code: '', gstin: '', address: '' });
  const [newCustomerDialog, setNewCustomerDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, lead: null });

  const openDialog = (lead) => {
    if (lead) {
      setEditing(lead);
      setForm({
        name: lead.name || '',
        customer_id: lead.customer_id || '',
        contact_person: lead.contact_person || '',
        email: lead.email || '',
        phone: lead.phone || '',
        source: lead.source || 'website',
        estimated_value: lead.estimated_value || 0,
        assignee_id: lead.assignee_id || '',
        next_followup: lead.next_followup ? String(lead.next_followup).slice(0, 10) : '',
        notes: lead.notes || '',
        stage: lead.stage || 'enquiry',
      });
    } else {
      setEditing(null);
      setForm({ name: '', customer_id: '', contact_person: '', email: '', phone: '', source: 'website', estimated_value: 0, assignee_id: '', next_followup: '', notes: '', stage: 'enquiry' });
    }
    setDialog(true);
  };

  const save = async () => {
    try {
      if (!form.name.trim()) { alert('Lead title is required'); return; }
      if (!form.customer_id) { alert('Please select a Customer (or click + New Customer to create one)'); return; }
      const payload = {
        ...form,
        estimated_value: parseFloat(form.estimated_value || 0),
        next_followup: form.next_followup ? new Date(form.next_followup).toISOString() : null,
      };
      if (editing) await api.put(`/api/crm/leads/${editing.id}`, payload);
      else await api.post('/api/crm/leads', payload);
      setDialog(false); setEditing(null); onRefresh();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const quickStageChange = async (lead, stage) => {
    try { await api.put(`/api/crm/leads/${lead.id}`, { stage }); onRefresh(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const deleteLead = async (lead) => {
    try { await api.delete(`/api/crm/leads/${lead.id}`); onRefresh(); setDeleteConfirm({ open: false, lead: null }); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const addActivity = async () => {
    const note = (activityDialog.note || '').trim();
    if (!note) return;
    try {
      await api.post(`/api/crm/leads/${activityDialog.lead.id}/activity`, { note });
      setActivityDialog({ open: false, lead: null, note: '' });
      onRefresh();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const convertLead = async () => {
    try {
      const { lead, code, gstin, address } = convertDialog;
      await api.post(`/api/crm/leads/${lead.id}/convert-to-customer`, {
        customer_code: code || undefined,
        gstin: gstin || undefined,
        address: address || undefined,
      });
      setConvertDialog({ open: false, lead: null, code: '', gstin: '', address: '' });
      onRefresh();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const filtered = leads.filter(l => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [l.lead_no, l.name, l.customer_name, l.contact_person, l.email].some(v => (v || '').toLowerCase().includes(q));
  });

  // Pipeline totals
  const totals = LEAD_ST.map(s => {
    const inStage = filtered.filter(l => l.stage === s.key);
    return { ...s, count: inStage.length, value: inStage.reduce((a, l) => a + (parseFloat(l.estimated_value) || 0), 0) };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 overflow-x-auto">
          {totals.map(t => (
            <div key={t.key} className={`border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[120px] ${t.count > 0 ? 'shadow-sm' : 'opacity-70'}`}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 inline-block rounded ${t.color}`}>{t.label}</div>
              <div className="text-sm font-semibold mono mt-1">{t.count} · {formatCurrency(t.value)}</div>
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <LeadImportButton onImported={onRefresh} />
            <button className="btn-primary flex items-center gap-1" onClick={() => openDialog(null)} data-testid="add-lead-btn">
              <Plus className="w-4 h-4" /> New Lead
            </button>
          </div>
        )}
      </div>

      <div className="card-flat overflow-hidden">
        <table className="w-full data-table" data-testid="leads-table">
          <thead>
            <tr>
              <th>Lead #</th><th>Name / Customer</th><th>Contact</th><th>Value</th><th>Source</th><th>Stage</th><th>Assignee</th><th>Next Follow-up</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-sm text-[#6B7280]">No leads yet. Click "New Lead" to create one.</td></tr>}
            {filtered.map(l => (
              <tr key={l.id} data-testid={`lead-row-${l.id}`}>
                <td className="mono font-medium">{l.lead_no}</td>
                <td>
                  <div className="font-medium text-[#1D3557]">{l.name}</div>
                  <div className="text-xs text-[#4B5563]">{l.customer_name}{l.customer_id && <span className="ml-1 text-[10px] bg-[#DEF7EC] text-[#03543F] px-1.5 py-0.5 rounded" title="Converted to Customer record">✓ Customer</span>}</div>
                </td>
                <td className="text-xs">
                  {l.contact_person && <div>{l.contact_person}</div>}
                  {l.email && <div className="text-[#4B5563]">{l.email}</div>}
                  {l.phone && <div className="text-[#4B5563] mono">{l.phone}</div>}
                </td>
                <td className="mono text-sm">{formatCurrency(l.estimated_value)}</td>
                <td className="text-xs capitalize">{(l.source || '').replace('_', ' ')}</td>
                <td>
                  {canEdit ? (
                    <Select value={l.stage || 'enquiry'} onValueChange={(v) => quickStageChange(l, v)}>
                      <SelectTrigger className="h-7 text-xs" data-testid={`lead-stage-${l.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEAD_ST.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`status-badge ${LEAD_ST.find(s => s.key === l.stage)?.color || ''}`}>{LEAD_ST.find(s => s.key === l.stage)?.label || l.stage}</span>
                  )}
                </td>
                <td className="text-xs">{l.assignee?.name || <span className="text-[#9CA3AF]">—</span>}</td>
                <td className="text-xs">{l.next_followup ? new Date(l.next_followup).toLocaleDateString('en-IN') : '-'}</td>
                <td>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => setActivityDialog({ open: true, lead: l, note: '' })} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Activity log" data-testid={`lead-activity-${l.id}`}><MessageSquare className="w-4 h-4" /></button>
                    {canEdit && ['enquiry', 'quotation', 'negotiation'].includes(l.stage) && onCreateQuotation && (
                      <button onClick={() => onCreateQuotation(l)} className="p-1.5 text-[#1E429F] hover:bg-[#E1EFFE] rounded" title="Create Quotation" data-testid={`lead-quotation-${l.id}`}><FileText className="w-4 h-4" /></button>
                    )}
                    {canEdit && !l.customer_id && ['quotation', 'negotiation', 'won'].includes(l.stage) && (
                      <button onClick={() => setConvertDialog({ open: true, lead: l, code: '', gstin: '', address: '' })} className="p-1.5 text-[#03543F] hover:bg-[#DEF7EC] rounded" title="Convert to Customer" data-testid={`lead-convert-${l.id}`}><UserCheck className="w-4 h-4" /></button>
                    )}
                    {canEdit && <button onClick={() => openDialog(l)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Edit" data-testid={`lead-edit-${l.id}`}><Edit2 className="w-4 h-4" /></button>}
                    {canEdit && <button onClick={() => setDeleteConfirm({ open: true, lead: l })} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`lead-delete-${l.id}`}><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lead Create/Edit */}
      <Dialog open={dialog} onOpenChange={(o) => { setDialog(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="lead-dialog">
          <DialogHeader><DialogTitle className="font-[Chivo]">{editing ? 'Edit Lead' : 'New Lead'}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Lead Title *</label>
                <input type="text" className="input-field" placeholder='e.g. "Website enquiry — ABC Pumps"' value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="lead-name" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Customer / Company *</label>
                <div className="flex gap-2">
                  <Select value={form.customer_id || '__none__'} onValueChange={v => {
                    if (v === '__new__') { setNewCustomerDialog(true); return; }
                    if (v === '__none__') { setForm(f => ({ ...f, customer_id: '', contact_person: '', email: '', phone: '' })); return; }
                    const c = customers.find(x => x.id === v);
                    setForm(f => ({
                      ...f,
                      customer_id: v,
                      contact_person: c?.contact_person || f.contact_person,
                      email: c?.email || f.email,
                      phone: c?.phone || f.phone,
                    }));
                  }}>
                    <SelectTrigger className="flex-1" data-testid="lead-customer"><SelectValue placeholder="Select a customer..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      <SelectItem value="__new__" data-testid="lead-new-customer-opt"><span className="text-[#1E429F] font-semibold">+ New Customer</span></SelectItem>
                      {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.customer_id && (
                  <div className="mt-1 text-[11px] text-[#4B5563]">
                    {(() => {
                      const c = customers.find(x => x.id === form.customer_id);
                      if (!c) return null;
                      return <span>Selected: <strong>{c.name}</strong>{c.address ? ` · ${c.address}` : ' · '}{!c.address && <span className="text-[#9B1C1C]">No address on file</span>}{c.gstin ? ` · GSTIN ${c.gstin}` : ''}</span>;
                    })()}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Contact Person</label>
                <input type="text" className="input-field" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} data-testid="lead-contact" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Email</label>
                <input type="email" className="input-field" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="lead-email" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Phone</label>
                <input type="text" className="input-field mono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} data-testid="lead-phone" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Source</label>
                <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
                  <SelectTrigger data-testid="lead-source"><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Stage</label>
                <Select value={form.stage} onValueChange={v => setForm({ ...form, stage: v })}>
                  <SelectTrigger data-testid="lead-stage-form"><SelectValue /></SelectTrigger>
                  <SelectContent>{LEAD_ST.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Estimated Value (₹)</label>
                <input type="number" step="0.01" className="input-field mono" value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: e.target.value })} data-testid="lead-value" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Assignee</label>
                <Select value={form.assignee_id || '__none__'} onValueChange={v => setForm({ ...form, assignee_id: v === '__none__' ? '' : v })}>
                  <SelectTrigger data-testid="lead-assignee"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unassigned —</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Next Follow-up</label>
                <input type="date" className="input-field" value={form.next_followup} onChange={e => setForm({ ...form, next_followup: e.target.value })} data-testid="lead-followup" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Notes</label>
                <textarea className="input-field" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} data-testid="lead-notes" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button className="btn-secondary" onClick={() => setDialog(false)}>Cancel</button>
              <button className="btn-primary" onClick={save} data-testid="lead-save-btn">{editing ? 'Update' : 'Create'} Lead</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Activity dialog */}
      <Dialog open={activityDialog.open} onOpenChange={(o) => !o && setActivityDialog({ open: false, lead: null, note: '' })}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-[Chivo]">Activity Log — {activityDialog.lead?.lead_no}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-3">
            <div className="border border-[#E5E7EB] rounded-sm max-h-60 overflow-y-auto bg-[#F9FAFB] p-2 space-y-1">
              {((activityDialog.lead?.activities) || []).slice().reverse().map((a, i) => (
                <div key={i} className="text-xs border-b border-[#E5E7EB] last:border-0 py-1.5">
                  <div className="text-[#111827]">{a.note}</div>
                  <div className="text-[10px] text-[#6B7280] mt-0.5">{a.author_name || '—'} · {formatDateTime(a.created_at)}</div>
                </div>
              ))}
              {(!activityDialog.lead?.activities || activityDialog.lead.activities.length === 0) && <div className="text-xs text-center text-[#9CA3AF] py-2">No activity yet</div>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">New Activity Note</label>
              <textarea rows={3} className="input-field" placeholder="e.g. Called customer; sent quote v2." value={activityDialog.note} onChange={e => setActivityDialog(s => ({ ...s, note: e.target.value }))} data-testid="activity-note-input" />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setActivityDialog({ open: false, lead: null, note: '' })}>Close</button>
              <button className="btn-primary" onClick={addActivity} disabled={!activityDialog.note.trim()} data-testid="activity-save-btn">Add Activity</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert to Customer dialog */}
      <Dialog open={convertDialog.open} onOpenChange={(o) => !o && setConvertDialog({ open: false, lead: null, code: '', gstin: '', address: '' })}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-[Chivo]">Convert Lead to Customer</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-3">
            <div className="bg-[#F0FDF4] border border-[#03543F] rounded-sm p-2 text-xs">
              <strong>{convertDialog.lead?.customer_name}</strong> will be added as a new Customer record. You can enrich it with GSTIN + address now; the lead stays linked.
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Customer Code (optional — auto-generated if blank)</label>
              <input type="text" className="input-field mono" placeholder="e.g. CUST-000123" value={convertDialog.code} onChange={e => setConvertDialog(s => ({ ...s, code: e.target.value }))} data-testid="convert-code" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">GSTIN</label>
              <input type="text" className="input-field mono" value={convertDialog.gstin} onChange={e => setConvertDialog(s => ({ ...s, gstin: e.target.value }))} data-testid="convert-gstin" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Address</label>
              <textarea rows={2} className="input-field" value={convertDialog.address} onChange={e => setConvertDialog(s => ({ ...s, address: e.target.value }))} data-testid="convert-address" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button className="btn-secondary" onClick={() => setConvertDialog({ open: false, lead: null, code: '', gstin: '', address: '' })}>Cancel</button>
              <button className="btn-primary" onClick={convertLead} data-testid="convert-save-btn">Convert</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Customer inline dialog (opens from lead form) */}
      <NewCustomerInlineDialog
        open={newCustomerDialog}
        onClose={() => setNewCustomerDialog(false)}
        onCreated={(c) => {
          setNewCustomerDialog(false);
          setForm(f => ({
            ...f,
            customer_id: c.id,
            contact_person: c.contact_person || f.contact_person,
            email: c.email || f.email,
            phone: c.phone || f.phone,
          }));
          onRefresh();
        }}
      />

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, lead: null })}
        title="Delete Lead?"
        message={<>This will permanently delete <strong>{deleteConfirm.lead?.lead_no}</strong>{deleteConfirm.lead?.name ? ` — ${deleteConfirm.lead.name}` : ''}. This action cannot be undone.</>}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteLead(deleteConfirm.lead)}
        testidPrefix="lead-delete-confirm"
      />
    </div>
  );
}

/* ============================================================================
 *  SUPPORT PANEL — Tickets
 * ========================================================================= */
function SupportPanel({ tickets, customers, users, items, stages, search, onRefresh, canEdit }) {
  const TICKET_ST = (stages && stages.length) ? stages : TICKET_STAGES;
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ subject: '', customer_id: '', description: '', priority: 'medium', assignee_id: '', product_ids: [], stage: 'complaint' });
  const [activityDialog, setActivityDialog] = useState({ open: false, ticket: null, note: '' });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, ticket: null });

  const openDialog = (t) => {
    if (t) {
      setEditing(t);
      setForm({
        subject: t.subject || '',
        customer_id: t.customer_id || '',
        description: t.description || '',
        priority: t.priority || 'medium',
        assignee_id: t.assignee_id || '',
        product_ids: t.product_ids || [],
        stage: t.stage || 'complaint',
      });
    } else {
      setEditing(null);
      setForm({ subject: '', customer_id: '', description: '', priority: 'medium', assignee_id: '', product_ids: [], stage: 'complaint' });
    }
    setDialog(true);
  };

  const save = async () => {
    try {
      if (!form.subject.trim() || !form.customer_id) { alert('Subject + Customer are required'); return; }
      const payload = { ...form };
      if (editing) await api.put(`/api/crm/tickets/${editing.id}`, payload);
      else await api.post('/api/crm/tickets', payload);
      setDialog(false); setEditing(null); onRefresh();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const quickStageChange = async (t, stage) => {
    try { await api.put(`/api/crm/tickets/${t.id}`, { stage }); onRefresh(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const quickPriorityChange = async (t, priority) => {
    try { await api.put(`/api/crm/tickets/${t.id}`, { priority }); onRefresh(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const deleteTicket = async (t) => {
    try { await api.delete(`/api/crm/tickets/${t.id}`); onRefresh(); setDeleteConfirm({ open: false, ticket: null }); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const addActivity = async () => {
    const note = (activityDialog.note || '').trim();
    if (!note) return;
    try {
      await api.post(`/api/crm/tickets/${activityDialog.ticket.id}/activity`, { note });
      setActivityDialog({ open: false, ticket: null, note: '' });
      onRefresh();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const filtered = tickets.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [t.ticket_no, t.subject, t.customer?.name].some(v => (v || '').toLowerCase().includes(q));
  });

  // Per-stage counts (Open, In Progress, Closed)
  const openCount = filtered.filter(t => !['closed', 'pending'].includes(t.stage)).length;
  const inProgressCount = filtered.filter(t => t.stage === 'in_progress').length;
  const closedCount = filtered.filter(t => t.stage === 'closed').length;
  const breachedCount = filtered.filter(t => t.sla_breached).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <div className="border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[110px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">Open</div>
            <div className="text-lg font-semibold mono text-[#1D3557]" data-testid="support-count-open">{openCount}</div>
          </div>
          <div className="border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[110px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#92400E]">In Progress</div>
            <div className="text-lg font-semibold mono text-[#92400E]" data-testid="support-count-progress">{inProgressCount}</div>
          </div>
          <div className="border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[110px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#03543F]">Closed</div>
            <div className="text-lg font-semibold mono text-[#03543F]" data-testid="support-count-closed">{closedCount}</div>
          </div>
          <div className={`border rounded-sm px-3 py-2 min-w-[110px] ${breachedCount > 0 ? 'border-[#9B1C1C] bg-[#FDE8E8]' : 'border-[#E5E7EB] bg-white'}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wide ${breachedCount > 0 ? 'text-[#9B1C1C]' : 'text-[#6B7280]'}`}>SLA Breached</div>
            <div className={`text-lg font-semibold mono ${breachedCount > 0 ? 'text-[#9B1C1C]' : 'text-[#1D3557]'}`}>{breachedCount}</div>
          </div>
          <div className="border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 text-[11px] text-[#6B7280] max-w-xs">
            <div className="font-semibold text-[#374151] mb-1">SLA targets (hours)</div>
            Urgent: 2h &nbsp;·&nbsp; High: 8h &nbsp;·&nbsp; Medium: 24h &nbsp;·&nbsp; Low: 72h
          </div>
        </div>
        {canEdit && (
          <button className="btn-primary flex items-center gap-1" onClick={() => openDialog(null)} data-testid="add-ticket-btn">
            <Plus className="w-4 h-4" /> New Ticket
          </button>
        )}
      </div>

      <div className="card-flat overflow-hidden">
        <table className="w-full data-table" data-testid="tickets-table">
          <thead>
            <tr>
              <th>Ticket #</th><th>Subject / Customer</th><th>Priority</th><th>Stage</th><th>Assignee</th><th>SLA</th><th>Created</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-sm text-[#6B7280]">No tickets yet. Click "New Ticket" to create one.</td></tr>}
            {filtered.map(t => {
              const stageData = TICKET_ST.find(s => s.key === t.stage);
              const priorityData = PRIORITY_OPTIONS.find(p => p.key === t.priority);
              return (
                <tr key={t.id} data-testid={`ticket-row-${t.id}`} className={t.sla_breached ? 'bg-[#FEF2F2]' : ''}>
                  <td className="mono font-medium">{t.ticket_no}</td>
                  <td>
                    <div className="font-medium text-[#1D3557]">{t.subject}</div>
                    <div className="text-xs text-[#4B5563]">{t.customer?.name || '—'}{(t.products && t.products.length > 0) && <span className="ml-2 text-[10px] text-[#1E429F]" title={t.products.map(p => p.part_number).join(', ')}>Products: {t.products.length}</span>}</div>
                  </td>
                  <td>
                    {canEdit ? (
                      <Select value={t.priority || 'medium'} onValueChange={(v) => quickPriorityChange(t, v)}>
                        <SelectTrigger className="h-7 text-xs" data-testid={`ticket-priority-${t.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{PRIORITY_OPTIONS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <span className={`status-badge ${priorityData?.color || ''}`}>{priorityData?.label || t.priority}</span>
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <Select value={t.stage || 'complaint'} onValueChange={(v) => quickStageChange(t, v)}>
                        <SelectTrigger className="h-7 text-xs" data-testid={`ticket-stage-${t.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{TICKET_ST.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <span className={`status-badge ${stageData?.color || ''}`}>{stageData?.label || t.stage}</span>
                    )}
                  </td>
                  <td className="text-xs">{t.assignee?.name || <span className="text-[#9CA3AF]">—</span>}</td>
                  <td className="text-xs">
                    {t.sla_breached ? (
                      <span className="flex items-center gap-1 text-[#9B1C1C] font-semibold"><AlertTriangle className="w-3 h-3" />BREACHED</span>
                    ) : t.sla_due && !['closed'].includes(t.stage) ? (
                      <span className="flex items-center gap-1 text-[#374151]"><Clock className="w-3 h-3" />{formatDateTime(t.sla_due)}</span>
                    ) : (
                      <span className="text-[#9CA3AF]">—</span>
                    )}
                  </td>
                  <td className="text-xs">{formatDateTime(t.created_at)}</td>
                  <td>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => setActivityDialog({ open: true, ticket: t, note: '' })} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Activity log" data-testid={`ticket-activity-${t.id}`}><MessageSquare className="w-4 h-4" /></button>
                      {canEdit && <button onClick={() => openDialog(t)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Edit" data-testid={`ticket-edit-${t.id}`}><Edit2 className="w-4 h-4" /></button>}
                      {canEdit && <button onClick={() => setDeleteConfirm({ open: true, ticket: t })} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`ticket-delete-${t.id}`}><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ticket dialog */}
      <Dialog open={dialog} onOpenChange={(o) => { setDialog(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="ticket-dialog">
          <DialogHeader><DialogTitle className="font-[Chivo]">{editing ? 'Edit Ticket' : 'New Support Ticket'}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Subject *</label>
                <input type="text" className="input-field" placeholder="Short description of the issue" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} data-testid="ticket-subject" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Customer *</label>
                <SearchableSelect
                  options={customers}
                  value={form.customer_id}
                  onChange={v => setForm({ ...form, customer_id: v })}
                  getLabel={(c) => c.name || ''}
                  getSecondary={(c) => c.customer_code || ''}
                  matchFields={['name', 'customer_code', 'phone', 'email']}
                  placeholder="Type customer code / name / phone…"
                  testId="ticket-customer"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Priority</label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                  <SelectTrigger data-testid="ticket-priority-form"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITY_OPTIONS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Stage</label>
                <Select value={form.stage} onValueChange={v => setForm({ ...form, stage: v })}>
                  <SelectTrigger data-testid="ticket-stage-form"><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_ST.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Assignee</label>
                <Select value={form.assignee_id || '__none__'} onValueChange={v => setForm({ ...form, assignee_id: v === '__none__' ? '' : v })}>
                  <SelectTrigger data-testid="ticket-assignee"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unassigned —</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Products (optional)</label>
                <MultiItemPicker
                  items={items || []}
                  selectedIds={form.product_ids || []}
                  onChange={(ids) => setForm({ ...form, product_ids: ids })}
                  testid="ticket-products"
                />
                <div className="text-[10px] text-[#6B7280] mt-1">Products / items related to this complaint (e.g. faulty parts).</div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Description</label>
                <textarea rows={4} className="input-field" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="ticket-description" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button className="btn-secondary" onClick={() => setDialog(false)}>Cancel</button>
              <button className="btn-primary" onClick={save} data-testid="ticket-save-btn">{editing ? 'Update' : 'Create'} Ticket</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Activity dialog */}
      <Dialog open={activityDialog.open} onOpenChange={(o) => !o && setActivityDialog({ open: false, ticket: null, note: '' })}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-[Chivo]">Activity Log — {activityDialog.ticket?.ticket_no}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-3">
            <div className="border border-[#E5E7EB] rounded-sm max-h-60 overflow-y-auto bg-[#F9FAFB] p-2 space-y-1">
              {((activityDialog.ticket?.activities) || []).slice().reverse().map((a, i) => (
                <div key={i} className="text-xs border-b border-[#E5E7EB] last:border-0 py-1.5">
                  <div className="text-[#111827]">{a.note}</div>
                  <div className="text-[10px] text-[#6B7280] mt-0.5">{a.author_name || '—'} · {formatDateTime(a.created_at)}</div>
                </div>
              ))}
              {(!activityDialog.ticket?.activities || activityDialog.ticket.activities.length === 0) && <div className="text-xs text-center text-[#9CA3AF] py-2">No activity yet</div>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">New Activity Note</label>
              <textarea rows={3} className="input-field" placeholder="e.g. Customer confirmed resolution. Closing." value={activityDialog.note} onChange={e => setActivityDialog(s => ({ ...s, note: e.target.value }))} data-testid="ticket-activity-input" />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setActivityDialog({ open: false, ticket: null, note: '' })}>Close</button>
              <button className="btn-primary" onClick={addActivity} disabled={!activityDialog.note.trim()} data-testid="ticket-activity-save-btn">Add Activity</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, ticket: null })}
        title="Delete Ticket?"
        message={<>This will permanently delete <strong>{deleteConfirm.ticket?.ticket_no}</strong>{deleteConfirm.ticket?.subject ? ` — ${deleteConfirm.ticket.subject}` : ''}. This action cannot be undone.</>}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteTicket(deleteConfirm.ticket)}
        testidPrefix="ticket-delete-confirm"
      />
    </div>
  );
}


/* ============================================================================
 *  QUOTATIONS PANEL — CRM Enquiry → Quotation → SO
 * ========================================================================= */
const QUOTATION_STATUSES = [
  { key: 'draft', label: 'Draft', color: 'bg-[#F3F4F6] text-[#4B5563]' },
  { key: 'sent', label: 'Sent', color: 'bg-[#E1EFFE] text-[#1E429F]' },
  { key: 'accepted', label: 'Accepted', color: 'bg-[#DEF7EC] text-[#03543F]' },
  { key: 'rejected', label: 'Rejected', color: 'bg-[#FDE8E8] text-[#9B1C1C]' },
  { key: 'superseded', label: 'Superseded (Revised)', color: 'bg-[#FEF3C7] text-[#92400E]' },
  { key: 'converted', label: 'Converted → SO', color: 'bg-[#FCE7F3] text-[#9D174D]' },
];

const COMPANY_INFO = {
  name: 'Machinery Manufacturing ERP',
  address: 'Industrial Estate, Plot No. 123, Pune, Maharashtra 411019',
  phone: '+91 20 1234 5678',
  email: 'sales@machineworks-erp.com',
  gstin: '27AAACM1234E1Z5',
  website: 'www.machineworks-erp.com',
};

function emptyQuotationLine() {
  return { item_id: '', description: '', hsn_code: '', quantity: 1, uom: 'Nos', rate: 0, discount_pct: 0, gst_rate: 18 };
}

// Quotation line row. Previously memoized with a strict comparator to optimize
// typing performance, but the comparator excluded `rowProps` (the
// useDraggableRows handlers) which meant the row never received refreshed
// drag handlers after a drag started — DnD reordering silently failed.
// Reverted to a non-memoized component; SearchableItemSelect already
// memoizes its internal item-filtering work, so per-row keystroke cost is
// acceptable.
const QuotationLineRow = function QuotationLineRow({
  line, idx, items, currency, formatCurrency, canRemove, updateLine, removeLine, onPickItem, rowProps,
}) {
  const gross = (parseFloat(line.quantity) || 0) * (parseFloat(line.rate) || 0);
  const disc = gross * ((parseFloat(line.discount_pct) || 0) / 100);
  const amount = gross - disc;
  return (
    <tr data-testid={`quotation-line-${idx}`} {...rowProps}>
      <td className="row-num drag-handle" title="Drag to reorder">{idx + 1}</td>
      <td>
        <div className="px-1 py-1 space-y-1">
          <SearchableItemSelect
            items={items}
            value={line.item_id}
            onChange={(v) => { if (!v) updateLine(idx, { item_id: '' }); else onPickItem(idx, v); }}
            placeholder="Type part no / name…"
            showCategory={false}
            testId={`quotation-line-item-${idx}`}
          />
          <textarea rows={2} className="grid-textarea" value={line.description} onChange={e => updateLine(idx, { description: e.target.value })} placeholder="Description (auto-filled — editable)" data-testid={`quotation-line-desc-${idx}`} />
        </div>
      </td>
      <td><input type="text" className="grid-input mono" value={line.hsn_code || ''} onChange={e => updateLine(idx, { hsn_code: e.target.value })} data-testid={`quotation-line-hsn-${idx}`} placeholder="HSN" /></td>
      <td><input type="number" step="0.01" className="grid-input mono num" value={line.quantity} onChange={e => updateLine(idx, { quantity: e.target.value })} data-testid={`quotation-line-qty-${idx}`} /></td>
      <td><input type="text" className="grid-input" value={line.uom} onChange={e => updateLine(idx, { uom: e.target.value })} /></td>
      <td><input type="number" step="0.01" className="grid-input mono num" value={line.rate} onChange={e => updateLine(idx, { rate: e.target.value })} data-testid={`quotation-line-rate-${idx}`} /></td>
      <td><input type="number" step="0.01" className="grid-input mono num" value={line.discount_pct || 0} onChange={e => updateLine(idx, { discount_pct: e.target.value })} data-testid={`quotation-line-discount-${idx}`} /></td>
      <td><input type="number" step="0.01" className="grid-input mono num" value={line.gst_rate} onChange={e => updateLine(idx, { gst_rate: e.target.value })} /></td>
      <td className="static-cell amount">{formatCurrency(amount, currency)}</td>
      <td className="remove-cell">
        {canRemove && (
          <button className="text-[#9B1C1C] hover:bg-[#FDE8E8] rounded p-1" onClick={() => removeLine(idx)} title="Remove" data-testid={`quotation-line-remove-${idx}`}><X className="w-3 h-3" /></button>
        )}
      </td>
    </tr>
  );
};

function QuotationsPanel({ quotations, leads, customers, items, search, onRefresh, canEdit, prefillFromLead, onPrefillConsumed }) {
  const { user } = useAuth();
  const { companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [waShare, setWaShare] = useState({ open: false, doc: null });
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const emptyForm = {
    lead_id: '',
    customer_id: '',
    customer_name: '',
    contact_person: '',
    email: '',
    phone: '',
    quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: '',
    notes: '',
    terms: '',
    status: 'draft',
    currency: 'INR',
    global_discount_type: 'amount',
    global_discount_value: 0,
    lines: [emptyQuotationLine()],
  };
  const [form, setForm] = useState(emptyForm);
  const [convertDialog, setConvertDialog] = useState({ open: false, quotation: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, quotation: null });
  const [acceptConfirm, setAcceptConfirm] = useState({ open: false, quotation: null });
  const [proformaConfirm, setProformaConfirm] = useState({ open: false, quotation: null, advance: 30 });
  // Inline + Add / ✎ Edit Customer (Odoo-style) — drives QuickAddPartyDialog.
  const [quickPartyOpen, setQuickPartyOpen] = useState(false);
  const [quickPartyEditing, setQuickPartyEditing] = useState(null);

  const openDialog = useCallback((q, fromLead) => {
    if (q) {
      setEditing(q);
      // If the quotation is tied to an existing customer, prefer the master record
      // over stored snapshot fields (which may be stale after a customer-name update).
      const master = q.customer_id ? customers.find(c => c.id === q.customer_id) : null;
      setForm({
        lead_id: q.lead_id || '',
        customer_id: q.customer_id || '',
        customer_name: master ? master.name : (q.customer_name || ''),
        contact_person: master ? (master.contact_person || '') : (q.contact_person || ''),
        email: master ? (master.email || '') : (q.email || ''),
        phone: master ? (master.phone || '') : (q.phone || ''),
        quotation_date: q.quotation_date ? String(q.quotation_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        valid_until: q.valid_until ? String(q.valid_until).slice(0, 10) : '',
        notes: q.notes || '',
        terms: q.terms || '',
        status: q.status || 'draft',
        currency: q.currency || 'INR',
        global_discount_type: q.global_discount_type || 'amount',
        global_discount_value: q.global_discount_value || 0,
        lines: (q.lines && q.lines.length) ? q.lines.map(l => ({ ...l })) : [emptyQuotationLine()],
      });
    } else if (fromLead) {
      setEditing(null);
      setForm({
        ...emptyForm,
        lead_id: fromLead.id || '',
        customer_id: fromLead.customer_id || '',
        customer_name: fromLead.customer_name || '',
        contact_person: fromLead.contact_person || '',
        email: fromLead.email || '',
        phone: fromLead.phone || '',
      });
    } else {
      setEditing(null);
      setForm(emptyForm);
      // For a fresh quotation (no edit, no lead prefill) hydrate Notes/Terms
      // from the marketing config singleton. The user can still override
      // before saving — this just sets a starting point.
      api.get('/api/crm/marketing-config')
        .then(({ data }) => {
          setForm(f => ({
            ...f,
            terms: f.terms || data.default_quotation_terms || '',
            notes: f.notes || data.default_quotation_notes || '',
          }));
        })
        .catch(() => { /* non-fatal */ });
    }
    setDialog(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  // Auto-open when arriving from "Create Quotation" on a lead
  useEffect(() => {
    if (prefillFromLead) {
      openDialog(null, prefillFromLead);
      onPrefillConsumed && onPrefillConsumed();
    }
  }, [prefillFromLead, openDialog, onPrefillConsumed]);

  // Auto-open New Quotation + pre-select customer when returning from the
  // standalone Customers page (after the user clicked + Add Customer and
  // saved a new contact). The URL carries `?newCustomerId=<id>`. We strip
  // the param after consumption so navigating away/back doesn't keep
  // reopening the dialog.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const newCustomerId = params.get('newCustomerId');
    if (!newCustomerId) return;
    const cust = customers.find(c => c.id === newCustomerId);
    if (!cust) return; // customers list hasn't loaded the new record yet
    setEditing(null);
    setForm({
      ...emptyForm,
      customer_id: cust.id,
      customer_name: cust.name || '',
      contact_person: cust.contact_person || '',
      email: cust.email || '',
      phone: cust.phone || '',
    });
    setDialog(true);
    params.delete('newCustomerId');
    navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, customers]);

  const addLine = useCallback(() => setForm(f => ({ ...f, lines: [...f.lines, emptyQuotationLine()] })), []);
  const removeLine = useCallback((idx) => setForm(f => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines })), []);
  // Stable updater — wrapped so the memoized QuotationLineRow doesn't re-render
  // every keystroke on other rows. Functional setState avoids closing over a
  // stale `form` snapshot.
  const updateLine = useCallback((idx, patch) => setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, ...patch } : l) })), []);
  const { getRowProps: getQuotationRowProps } = useDraggableRows(
    form.lines,
    (next) => setForm(f => ({ ...f, lines: next })),
  );
  const onPickItem = useCallback((idx, itemId) => {
    setForm(f => {
      const it = (items || []).find(i => i.id === itemId);
      const lines = f.lines.map((line, i) => i === idx ? {
        ...line,
        item_id: itemId,
        description: it?.description || '',
        hsn_code: it?.hsn_code || '',
        uom: it?.uom || 'Nos',
        rate: it?.sale_price || it?.unit_cost || 0,
        gst_rate: it?.gst_rate ?? 18,
      } : line);
      return { ...f, lines };
    });
  }, [items]);

  const totals = React.useMemo(() => {
    let sub = 0, gst = 0, discount = 0;
    const perLine = [];
    form.lines.forEach(l => {
      const gross = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
      const dsc = gross * ((parseFloat(l.discount_pct) || 0) / 100);
      const net = gross - dsc;
      discount += dsc;
      sub += net;
      perLine.push({ net, gstRate: parseFloat(l.gst_rate) || 0 });
    });
    // Resolve global (footer) discount.
    const gdType = form.global_discount_type || 'amount';
    const gdRaw = parseFloat(form.global_discount_value) || 0;
    const gdAmt = Math.max(0, Math.min(
      gdType === 'percent' ? sub * gdRaw / 100 : gdRaw,
      sub,
    ));
    const netSub = sub - gdAmt;
    const factor = sub > 0 ? netSub / sub : 1;
    perLine.forEach(p => { gst += p.net * factor * (p.gstRate / 100); });
    return { sub, gst, discount, globalDiscount: gdAmt, netSub, total: netSub + gst };
  }, [form.lines, form.global_discount_type, form.global_discount_value]);

  const save = async () => {
    try {
      if (!form.customer_name.trim()) { alert('Customer name is required'); return; }
      if (!form.lines.length || form.lines.some(l => !(parseFloat(l.quantity) > 0))) {
        alert('Each line must have quantity > 0'); return;
      }
      const payload = {
        lead_id: form.lead_id || '',
        customer_id: form.customer_id || '',
        customer_name: form.customer_name,
        contact_person: form.contact_person,
        email: form.email,
        phone: form.phone,
        quotation_date: form.quotation_date ? new Date(form.quotation_date).toISOString() : null,
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
        notes: form.notes,
        terms: form.terms,
        status: form.status,
        currency: form.currency || 'INR',
        global_discount_type: form.global_discount_type || 'amount',
        global_discount_value: parseFloat(form.global_discount_value) || 0,
        lines: form.lines.map(l => ({
          item_id: l.item_id || '',
          description: l.description || '',
          quantity: parseFloat(l.quantity) || 0,
          uom: l.uom || 'Nos',
          rate: parseFloat(l.rate) || 0,
          discount_pct: parseFloat(l.discount_pct) || 0,
          gst_rate: parseFloat(l.gst_rate) || 0,
        })),
      };
      if (editing) await api.put(`/api/crm/quotations/${editing.id}`, payload);
      else await api.post('/api/crm/quotations', payload);
      setDialog(false); setEditing(null); setForm(emptyForm); onRefresh();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to save quotation'); }
  };

  const deleteQuotation = async (q) => {
    try { await api.delete(`/api/crm/quotations/${q.id}`); onRefresh(); setDeleteConfirm({ open: false, quotation: null }); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const acceptQuotation = async () => {
    const q = acceptConfirm.quotation;
    if (!q) return;
    try {
      const res = await api.put(`/api/crm/quotations/${q.id}`, { status: 'accepted' });
      setAcceptConfirm({ open: false, quotation: null });
      onRefresh();
      if (res.data?.converted_so_no) alert(`Quotation accepted & converted to Sales Order ${res.data.converted_so_no}.`);
    } catch (e) { alert(e.response?.data?.detail || 'Failed to accept'); }
  };

  const convertToProforma = async () => {
    const q = proformaConfirm.quotation;
    if (!q) return;
    try {
      const res = await api.post(`/api/crm/quotations/${q.id}/convert-to-proforma`, { advance_percentage: proformaConfirm.advance });
      setProformaConfirm({ open: false, quotation: null, advance: 30 });
      onRefresh();
      alert(`Proforma Invoice ${res.data.proforma_no} generated. Review it in the Proforma Invoices tab.`);
    } catch (e) { alert(e.response?.data?.detail || 'Failed to convert'); }
  };

  const quickStatusChange = async (q, status) => {
    // Intercept 'accepted' — show confirm popup instead of firing directly
    if (status === 'accepted') {
      setAcceptConfirm({ open: true, quotation: q });
      return;
    }
    try {
      await api.put(`/api/crm/quotations/${q.id}`, { status });
      onRefresh();
    }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const printQuotation = (q) => printInvoiceDoc(q, { kind: 'quotation', title: 'QUOTATION', numberKey: 'quotation_no', company: companySettings, user, includeCover: !!(companySettings?.quotation_cover_intro || '').trim() });

  const reviseQuotation = async (q) => {
    try {
      const res = await api.post(`/api/crm/quotations/${q.id}/revise`);
      onRefresh();
      alert(`New revision ${res.data.quotation_no} created as draft. Edit the new revision and send it to the customer.`);
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create revision'); }
  };

  const convertToSO = async () => {
    try {
      const q = convertDialog.quotation;
      await api.post(`/api/crm/quotations/${q.id}/convert-to-so`, { order_type: 'auto' });
      setConvertDialog({ open: false, quotation: null });
      onRefresh();
      alert(`Quotation ${q.quotation_no} converted to Sales Order successfully. Review in the Sales Orders page.`);
    } catch (e) { alert(e.response?.data?.detail || 'Failed to convert'); }
  };

  const filtered = quotations.filter(q => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return [q.quotation_no, q.customer_name, q.customer?.name, q.lead?.lead_no].some(v => (v || '').toLowerCase().includes(term));
  });

  const statusCounts = QUOTATION_STATUSES.map(s => ({
    ...s,
    count: filtered.filter(q => q.status === s.key).length,
    value: filtered.filter(q => q.status === s.key).reduce((a, q) => a + (parseFloat(q.grand_total) || 0), 0),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 overflow-x-auto">
          {statusCounts.map(s => (
            <div key={s.key} className={`border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[120px] ${s.count > 0 ? 'shadow-sm' : 'opacity-70'}`}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 inline-block rounded ${s.color}`}>{s.label}</div>
              <div className="text-sm font-semibold mono mt-1">{s.count} · {formatCurrency(s.value)}</div>
            </div>
          ))}
        </div>
        {canEdit && (
          <button className="btn-primary flex items-center gap-1" onClick={() => openDialog(null, null)} data-testid="add-quotation-btn">
            <Plus className="w-4 h-4" /> New Quotation
          </button>
        )}
      </div>

      <div className="card-flat overflow-hidden">
        <table className="w-full data-table" data-testid="quotations-table">
          <thead>
            <tr>
              <th>Quotation #</th><th>Customer</th><th>Lead</th><th>Date</th><th>Valid Until</th><th>Lines</th><th>Total</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-sm text-[#6B7280]">No quotations yet. Click "New Quotation" to create one.</td></tr>}
            {filtered.map(q => {
              const statusData = QUOTATION_STATUSES.find(s => s.key === q.status);
              const isLocked = q.is_locked === true;  // from backend: true if converted & linked SO not cancelled
              return (
                <tr key={q.id} data-testid={`quotation-row-${q.id}`}>
                  <td className="mono font-medium">{q.quotation_no}</td>
                  <td>
                    <div className="font-medium text-[#1D3557]">{q.customer_name}</div>
                    {q.contact_person && <div className="text-xs text-[#4B5563]">{q.contact_person}</div>}
                  </td>
                  <td className="text-xs mono">
                    {q.lead?.lead_no ? <span className="text-[#1E429F]">{q.lead.lead_no}</span> : <span className="text-[#9CA3AF]">—</span>}
                    {q.converted_so_no && <div className="text-[10px] text-[#03543F] font-medium" data-testid={`quotation-so-link-${q.id}`}>SO: {q.converted_so_no}{q.converted_so?.status === 'cancelled' ? ' · Cancelled' : ''}</div>}
                    {q.proforma_no && <div className="text-[10px] text-[#9D174D] font-medium" data-testid={`quotation-pi-link-${q.id}`}>PI: {q.proforma_no}</div>}
                  </td>
                  <td className="text-xs">{q.quotation_date ? new Date(q.quotation_date).toLocaleDateString('en-IN') : '-'}</td>
                  <td className="text-xs">{q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-IN') : '-'}</td>
                  <td className="text-xs">{(q.lines || []).length}</td>
                  <td className="mono font-semibold text-sm">{formatCurrency(q.grand_total)}</td>
                  <td>
                    {canEdit && !isLocked ? (
                      <Select value={q.status || 'draft'} onValueChange={(v) => quickStatusChange(q, v)}>
                        <SelectTrigger className="h-7 text-xs" data-testid={`quotation-status-${q.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {QUOTATION_STATUSES.filter(s => s.key !== 'converted').map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`status-badge ${statusData?.color || ''}`}>{statusData?.label || q.status}
                        {q.converted_so_no && <span className="ml-1 text-[10px]">({q.converted_so_no}{q.converted_so?.status === 'cancelled' ? ' · Cancelled' : ''})</span>}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => printQuotation(q)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Print" data-testid={`quotation-print-${q.id}`}><Printer className="w-4 h-4" /></button>
                      <button onClick={() => setWaShare({ open: true, doc: q })} className="p-1.5 text-[#25D366] hover:bg-[#DCFCE7] rounded" title="Share on WhatsApp" data-testid={`quotation-wa-${q.id}`}><MessageSquare className="w-4 h-4" /></button>
                      {canEdit && !isLocked && q.status === 'draft' && (
                        <button onClick={() => quickStatusChange(q, 'sent')} className="p-1.5 text-[#03543F] hover:bg-[#DEF7EC] rounded" title="Send to customer" data-testid={`quotation-send-${q.id}`}><Send className="w-4 h-4" /></button>
                      )}
                      {canEdit && q.status !== 'rejected' && (
                        <button onClick={() => setProformaConfirm({ open: true, quotation: q })} className="p-1.5 text-[#1E429F] hover:bg-[#E1EFFE] rounded" title={q.proforma_id ? 'Create another Proforma Invoice' : 'Convert to Proforma Invoice'} data-testid={`quotation-to-proforma-${q.id}`}><FileText className="w-4 h-4" /></button>
                      )}
                      {canEdit && ['sent', 'rejected', 'superseded'].includes(q.status) && (
                        <button onClick={() => reviseQuotation(q)} className="p-1.5 text-[#92400E] hover:bg-[#FEF3C7] rounded" title="Create Revision (clones this quotation as a new editable draft)" data-testid={`quotation-revise-${q.id}`}><GitBranch className="w-4 h-4" /></button>
                      )}
                      {canEdit && !isLocked && <button onClick={() => openDialog(q, null)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Edit" data-testid={`quotation-edit-${q.id}`}><Edit2 className="w-4 h-4" /></button>}
                      {canEdit && !isLocked && <button onClick={() => setDeleteConfirm({ open: true, quotation: q })} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`quotation-delete-${q.id}`}><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Quotation dialog */}
      <Dialog open={dialog} onOpenChange={(o) => { setDialog(o); if (!o) { setEditing(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="quotation-dialog">
          <DialogHeader><DialogTitle className="font-[Chivo]">{editing ? `Edit Quotation — ${editing.quotation_no}` : 'New Quotation'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Link to Lead (optional)</label>
                <SearchableSelect
                  options={leads}
                  value={form.lead_id}
                  onChange={(v) => {
                    if (!v) { setForm(f => ({ ...f, lead_id: '' })); return; }
                    const lead = leads.find(l => l.id === v);
                    setForm(f => ({
                      ...f,
                      lead_id: v,
                      customer_id: lead?.customer_id || f.customer_id,
                      customer_name: lead?.customer_name || f.customer_name,
                      contact_person: lead?.contact_person || f.contact_person,
                      email: lead?.email || f.email,
                      phone: lead?.phone || f.phone,
                    }));
                  }}
                  getLabel={(l) => l.name || ''}
                  getSecondary={(l) => l.lead_no || ''}
                  matchFields={['name', 'lead_no', 'customer_name', 'phone', 'email']}
                  placeholder="Type lead no / name / customer…"
                  testId="quotation-lead-select"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Existing Customer (optional)</label>
                <div className="flex gap-1.5 items-stretch">
                  <div className="flex-1">
                    <SearchableSelect
                      options={customers}
                      value={form.customer_id}
                      onChange={(v) => {
                        if (!v) { setForm(f => ({ ...f, customer_id: '' })); return; }
                        const c = customers.find(x => x.id === v);
                        setForm(f => ({ ...f, customer_id: v, customer_name: c?.name || '', contact_person: c?.contact_person || '', email: c?.email || '', phone: c?.phone || '' }));
                      }}
                      getLabel={(c) => c.name || ''}
                      getSecondary={(c) => c.customer_code || ''}
                      matchFields={['name', 'customer_code', 'phone', 'email']}
                      placeholder="Type customer code / name…"
                      testId="quotation-customer-select"
                    />
                  </div>
                  {/* Inline + Add and ✎ Edit (Odoo-style) */}
                  <button
                    type="button"
                    onClick={() => navigate('/customers?action=add&returnTo=quotation')}
                    className="px-2 bg-[#03543F] text-white rounded hover:bg-[#03493A] text-sm"
                    title="Add new customer"
                    data-testid="quotation-customer-add"
                  >+</button>
                  {form.customer_id && (
                    <button
                      type="button"
                      onClick={() => {
                        const c = customers.find(x => x.id === form.customer_id);
                        if (c) { setQuickPartyEditing(c); setQuickPartyOpen(true); }
                      }}
                      className="px-2 bg-[#1E429F] text-white rounded hover:bg-[#1D3557] text-xs"
                      title="Edit selected customer"
                      data-testid="quotation-customer-edit"
                    >✎</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Customer Name *{form.customer_id && <span className="ml-1 text-[10px] text-[#6B7280]">(auto-synced from master)</span>}</label>
                <input type="text" className={`input-field ${form.customer_id ? 'bg-[#F9FAFB] cursor-not-allowed' : ''}`} value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} readOnly={!!form.customer_id} data-testid="quotation-customer-name" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Contact Person</label>
                <input type="text" className="input-field" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Email</label>
                <input type="email" className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Phone</label>
                <input type="text" className="input-field mono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Quotation Date</label>
                <input type="date" className="input-field" value={form.quotation_date} onChange={e => setForm(f => ({ ...f, quotation_date: e.target.value }))} data-testid="quotation-date" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Valid Until</label>
                <input type="date" className="input-field" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} data-testid="quotation-valid-until" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="quotation-status-form"><SelectValue /></SelectTrigger>
                  <SelectContent>{QUOTATION_STATUSES.filter(s => s.key !== 'converted').map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Currency <span className="text-[10px] font-normal text-[#6B7280]">(non-INR ⇒ no GST)</span>
                </label>
                <Select value={form.currency || 'INR'} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger data-testid="quotation-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR — ₹</SelectItem>
                    <SelectItem value="USD">USD — $</SelectItem>
                    <SelectItem value="EUR">EUR — €</SelectItem>
                    <SelectItem value="GBP">GBP — £</SelectItem>
                    <SelectItem value="AED">AED — د.إ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Customer Address card (master data) — shown when an Existing Customer is linked */}
            {form.customer_id && (() => {
              const c = customers.find(x => x.id === form.customer_id);
              if (!c) return null;
              const addrParts = [c.address, [c.city, c.state, c.pin_code].filter(Boolean).join(', ')].filter(Boolean);
              return (
                <div className="border border-[#E5E7EB] rounded-sm p-3 bg-[#F9FAFB]" data-testid="quotation-customer-address-card">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Customer Address <span className="text-[10px] font-normal text-[#6B7280] normal-case tracking-normal">(auto-filled on Quotation print)</span></div>
                    {c.gstin && <div className="text-[11px] text-[#374151]"><strong className="text-[#1D3557]">GSTIN:</strong> <span className="mono">{c.gstin}</span></div>}
                  </div>
                  <div className="text-xs text-[#111827] whitespace-pre-line leading-snug" data-testid="quotation-customer-address-text">
                    {addrParts.length ? addrParts.join('\n') : <span className="text-[#9CA3AF] italic">No address on file. Edit the Customer master to add one.</span>}
                    {c.state_code && <div className="mt-1 text-[#4B5563]"><strong>State Code:</strong> <span className="mono">{c.state_code}</span></div>}
                  </div>
                </div>
              );
            })()}

            {/* Lines editor */}
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="text-sm font-semibold text-[#1D3557]">Line Items</div>
                <div className="flex items-center gap-2 text-xs">
                  {/* Bulk Line Discount — apply same % to every line in one click. Useful
                      for "10% across the board" style quotes without touching each row. */}
                  <span className="text-[#6B7280]">Bulk discount %:</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    className="input-field h-7 w-16 mono text-right"
                    data-testid="quotation-bulk-discount-input"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
                    onBlur={(e) => {
                      const pct = parseFloat(e.target.value);
                      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                        setForm(f => ({ ...f, lines: f.lines.map(l => ({ ...l, discount_pct: pct })) }));
                        toast.success(`Applied ${pct}% to all ${form.lines.length} line(s)`);
                        e.target.value = '';
                      }
                    }}
                  />
                  <span className="text-[10px] text-[#9CA3AF] italic">enter / blur to apply</span>
                  <button className="btn-secondary flex items-center gap-1 text-xs ml-2" onClick={addLine} data-testid="quotation-add-line"><Plus className="w-3 h-3" /> Add Line</button>
                </div>
              </div>
              <div className="border border-[#E5E7EB] rounded-sm overflow-x-auto">
                <table className="line-items-grid" data-testid="quotation-lines-table">
                  <thead>
                    <tr>
                      <th className="row-num">#</th>
                      <th style={{ minWidth: '300px' }}>Item Name &amp; Description</th>
                      <th style={{ width: '150px', minWidth: '150px' }}>HSN</th>
                      <th style={{ width: '80px' }}>Qty</th>
                      <th style={{ width: '70px' }}>UOM</th>
                      <th style={{ width: '110px' }}>Rate ({CURRENCY_SYMBOLS[(form.currency || 'INR').toUpperCase()] || '₹'})</th>
                      <th style={{ width: '70px' }}>Disc %</th>
                      <th style={{ width: '70px' }}>GST %</th>
                      <th style={{ width: '130px', textAlign: 'right' }}>Amount</th>
                      <th className="remove-cell"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((l, idx) => (
                      <QuotationLineRow
                        key={idx}
                        line={l}
                        idx={idx}
                        items={items}
                        currency={form.currency}
                        formatCurrency={formatCurrency}
                        canRemove={form.lines.length > 1}
                        updateLine={updateLine}
                        removeLine={removeLine}
                        onPickItem={onPickItem}
                        rowProps={getQuotationRowProps(idx)}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="add-line-cell" colSpan={10}>
                        <button type="button" onClick={addLine} data-testid="quotation-add-line-footer">
                          <Plus className="w-3 h-3" /> Add Line
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex justify-end mt-2 text-xs">
                <div className="w-72 space-y-1">
                  <div className="flex justify-between"><span>Subtotal (after line discount):</span><span className="mono">{formatCurrency(totals.sub, form.currency)}</span></div>
                  {/* Global (footer) discount — % or absolute amount, applied AFTER line discounts and BEFORE GST.
                      UI: a clear two-button toggle (Currency / Percent) instead of a cramped <select> that truncated
                      the option label. The active mode's symbol also prefixes the input value for unambiguous reading. */}
                  <div className="flex justify-between items-center bg-[#F9FAFB] border border-[#E5E7EB] rounded-sm px-2 py-1 my-1 gap-2">
                    <span className="text-[#374151] font-semibold whitespace-nowrap">Global Discount:</span>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex border border-[#D1D5DB] rounded-sm overflow-hidden" role="tablist">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={(form.global_discount_type || 'amount') === 'amount'}
                          onClick={() => setForm(f => ({ ...f, global_discount_type: 'amount' }))}
                          className={`h-7 w-9 text-sm font-semibold mono transition-colors ${(form.global_discount_type || 'amount') === 'amount' ? 'bg-[#1D3557] text-white' : 'bg-white text-[#374151] hover:bg-[#F3F4F6]'}`}
                          data-testid="quotation-global-discount-mode-amount"
                          title="Discount as currency amount"
                        >
                          {CURRENCY_SYMBOLS[(form.currency || 'INR').toUpperCase()] || '₹'}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={form.global_discount_type === 'percent'}
                          onClick={() => setForm(f => ({ ...f, global_discount_type: 'percent' }))}
                          className={`h-7 w-9 text-sm font-semibold mono transition-colors border-l border-[#D1D5DB] ${form.global_discount_type === 'percent' ? 'bg-[#1D3557] text-white' : 'bg-white text-[#374151] hover:bg-[#F3F4F6]'}`}
                          data-testid="quotation-global-discount-mode-percent"
                          title="Discount as percentage of subtotal"
                        >
                          %
                        </button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-field h-7 text-xs px-2 py-0 w-24 mono text-right"
                        value={form.global_discount_value || 0}
                        onChange={(e) => setForm(f => ({ ...f, global_discount_value: parseFloat(e.target.value) || 0 }))}
                        data-testid="quotation-global-discount-value"
                      />
                    </div>
                  </div>
                  {totals.globalDiscount > 0 && (
                    <div className="flex justify-between text-[#9B1C1C]">
                      <span>Global Discount Applied:</span>
                      <span className="mono">-{formatCurrency(totals.globalDiscount, form.currency)}</span>
                    </div>
                  )}
                  {totals.globalDiscount > 0 && (
                    <div className="flex justify-between"><span>Net Subtotal:</span><span className="mono">{formatCurrency(totals.netSub, form.currency)}</span></div>
                  )}
                  {(form.currency || 'INR') === 'INR' && (
                    <div className="flex justify-between"><span>GST:</span><span className="mono">{formatCurrency(totals.gst, form.currency)}</span></div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-[#E5E7EB] pt-1"><span>Grand Total:</span><span className="mono">{formatCurrency((form.currency || 'INR') === 'INR' ? totals.total : totals.netSub, form.currency)}</span></div>
                  {(form.currency || 'INR') !== 'INR' && (
                    <div className="text-[10px] text-[#6B7280] italic">Export/Import — GST not applicable. Currency: {form.currency}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Notes</label>
                <textarea rows={3} className="input-field" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Terms &amp; Conditions</label>
                <textarea rows={3} className="input-field" value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button className="btn-secondary" onClick={() => { setDialog(false); setEditing(null); }}>Cancel</button>
              <button className="btn-primary" onClick={save} data-testid="quotation-save-btn">{editing ? 'Update' : 'Create'} Quotation</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert to SO dialog */}
      <Dialog open={convertDialog.open} onOpenChange={(o) => !o && setConvertDialog({ open: false, quotation: null })}>
        <DialogContent className="max-w-lg" data-testid="quotation-convert-dialog">
          <DialogHeader><DialogTitle className="font-[Chivo]">Convert Quotation to Sales Order</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-3">
            <div className="bg-[#F0FDF4] border border-[#03543F] rounded-sm p-3 text-xs space-y-1">
              <div><strong>{convertDialog.quotation?.quotation_no}</strong> — {convertDialog.quotation?.customer_name}</div>
              <div>Total: <strong>{formatCurrency(convertDialog.quotation?.grand_total)}</strong></div>
              <div>Lines: <strong>{(convertDialog.quotation?.lines || []).length}</strong></div>
            </div>
            <div className="bg-[#FEF3C7] border border-[#92400E] rounded-sm p-2 text-xs">
              <div className="font-semibold mb-1">Before you convert:</div>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Each line must reference an <strong>Item with an active BOM</strong>.</li>
                <li>Order type defaults to <strong>auto</strong> (smart MTS/MTO split) per line — you can change it later on the SO.</li>
                <li>The quotation becomes read-only once converted.</li>
                {convertDialog.quotation?.lead_id && <li>The linked Lead will be moved to <strong>Won</strong> stage.</li>}
              </ul>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button className="btn-secondary" onClick={() => setConvertDialog({ open: false, quotation: null })}>Cancel</button>
              <button className="btn-primary flex items-center gap-1" onClick={convertToSO} data-testid="quotation-convert-confirm"><Send className="w-4 h-4" /> Convert to SO</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, quotation: null })}
        title="Delete Quotation?"
        message={<>This will permanently delete <strong>{deleteConfirm.quotation?.quotation_no}</strong>{deleteConfirm.quotation?.customer_name ? ` — ${deleteConfirm.quotation.customer_name}` : ''}. This action cannot be undone.</>}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteQuotation(deleteConfirm.quotation)}
        testidPrefix="quotation-delete-confirm"
      />

      <WhatsAppShareDialog
        open={waShare.open}
        onOpenChange={(o) => setWaShare({ open: o, doc: o ? waShare.doc : null })}
        doc={waShare.doc}
        kind="quotation"
        company={companySettings}
        user={user}
      />

      <ConfirmDialog
        open={acceptConfirm.open}
        onOpenChange={(o) => !o && setAcceptConfirm({ open: false, quotation: null })}
        title="Confirm & Generate SO?"
        message={<>
          Accepting <strong>{acceptConfirm.quotation?.quotation_no}</strong> will generate a Sales Order for <strong>{acceptConfirm.quotation?.customer_name}</strong> worth <strong>{formatCurrency(acceptConfirm.quotation?.grand_total || 0)}</strong>.
          <ul className="list-disc list-inside mt-2 text-xs text-[#4B5563]">
            <li>Each line item must have a valid BOM attached.</li>
            <li>Order type defaults to <strong>auto</strong> (smart MTS/MTO split).</li>
            <li>The quotation becomes read-only until the linked SO is cancelled.</li>
            {acceptConfirm.quotation?.lead_id && <li>The linked Lead will move to <strong>Won</strong> stage.</li>}
          </ul>
        </>}
        confirmLabel="Confirm & Generate SO"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={acceptQuotation}
        testidPrefix="quotation-accept-confirm"
      />

      {/* Inline customer create/edit — driven by + and ✎ icons inside the
          Quotation form. After save we refresh the customers list (via
          `onRefresh` so the parent's master data reloads) and auto-select
          the saved record so the form continues with the new customer. */}
      <QuickAddPartyDialog
        open={quickPartyOpen}
        onOpenChange={setQuickPartyOpen}
        kind="customer"
        editing={quickPartyEditing}
        onSaved={async (saved) => {
          if (onRefresh) await onRefresh();
          if (saved?.id) {
            setForm(f => ({
              ...f,
              customer_id: saved.id,
              customer_name: saved.name || f.customer_name,
              contact_person: saved.contact_person || f.contact_person,
              email: saved.email || f.email,
              phone: saved.phone || f.phone,
            }));
          }
        }}
      />

      {/* Convert-to-Proforma Dialog */}
      <Dialog open={proformaConfirm.open} onOpenChange={(o) => !o && setProformaConfirm({ open: false, quotation: null, advance: 30 })}>
        <DialogContent className="max-w-md" data-testid="quotation-proforma-dialog">
          <DialogHeader><DialogTitle className="font-[Chivo]">Generate Proforma Invoice</DialogTitle></DialogHeader>
          <div className="mt-3 space-y-3 text-sm">
            <div className="bg-[#E1EFFE] border border-[#1E429F] rounded-sm p-3 text-xs">
              From quotation <strong>{proformaConfirm.quotation?.quotation_no}</strong> for <strong>{proformaConfirm.quotation?.customer_name}</strong>
              <div className="mt-1">Total: <strong>{formatCurrency(proformaConfirm.quotation?.grand_total || 0)}</strong></div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Advance Percentage</label>
              <div className="flex gap-2 items-center">
                <input type="number" step="1" min="0" max="100" className="input-field mono w-24" value={proformaConfirm.advance} onChange={e => setProformaConfirm(s => ({ ...s, advance: parseFloat(e.target.value) || 0 }))} data-testid="proforma-advance-pct" />
                <span className="text-xs text-[#4B5563]">% (used only for the header; total stays full)</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button className="btn-secondary" onClick={() => setProformaConfirm({ open: false, quotation: null, advance: 30 })}>Cancel</button>
              <button className="btn-primary" onClick={convertToProforma} data-testid="proforma-generate-btn">Generate Proforma</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================================
 *  SHARED — New Customer inline dialog
 * ========================================================================= */
function NewCustomerInlineDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ code: '', name: '', gstin: '', contact_person: '', email: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm({ code: '', name: '', gstin: '', contact_person: '', email: '', phone: '', address: '' });
  }, [open]);
  const save = async () => {
    if (!form.name.trim()) { alert('Customer name is required'); return; }
    if (!form.address.trim()) { alert('Address is required for new customers'); return; }
    setSaving(true);
    try {
      const res = await api.post('/api/customers', form);
      onCreated(res.data);
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create customer'); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="new-customer-inline-dialog">
        <DialogHeader><DialogTitle className="font-[Chivo]">Quick Add Customer</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Name *</label>
              <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="nc-name" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Code (auto if blank)</label>
              <input className="input-field mono" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} data-testid="nc-code" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">GSTIN</label>
              <input className="input-field mono" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} data-testid="nc-gstin" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Contact Person</label>
              <input className="input-field" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} data-testid="nc-contact" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Email</label>
              <input className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} data-testid="nc-email" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Phone</label>
              <input className="input-field mono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} data-testid="nc-phone" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Address *</label>
              <textarea rows={2} className="input-field" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} data-testid="nc-address" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving} data-testid="nc-save-btn">{saving ? 'Saving...' : 'Create & Use'}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================================
 *  SHARED — Multi Item Picker (chip selector)
 * ========================================================================= */
function MultiItemPicker({ items, selectedIds, onChange, testid }) {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const selectedItems = items.filter(i => selectedIds.includes(i.id));
  const matches = items.filter(i => {
    if (selectedIds.includes(i.id)) return false;
    if (catFilter && i.category !== catFilter) return false;
    // Show all (up to 50) when no filters are set so the support agent can
    // browse products straight away. Typing or picking a category narrows it.
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return ((i.part_number || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));
  }).slice(0, 50);
  const add = (id) => { onChange([...selectedIds, id]); setQuery(''); };
  const remove = (id) => onChange(selectedIds.filter(x => x !== id));
  return (
    <div className="border border-[#E5E7EB] rounded-sm p-2 bg-white" data-testid={testid}>
      <div className="flex flex-wrap gap-1 mb-2">
        {selectedItems.length === 0 && <span className="text-[11px] text-[#9CA3AF]">No products selected</span>}
        {selectedItems.map(it => (
          <span key={it.id} className="bg-[#E1EFFE] text-[#1E429F] text-[11px] px-2 py-0.5 rounded-sm flex items-center gap-1" data-testid={`${testid}-chip-${it.id}`}>
            {it.part_number} · {it.name}
            <button onClick={() => remove(it.id)} className="text-[#1E429F] hover:text-[#9B1C1C]"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input-field text-sm flex-1"
          type="text"
          placeholder="Search items to add..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          data-testid={`${testid}-search`}
        />
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="input-field text-xs w-36"
          data-testid={`${testid}-cat-filter`}
        >
          <option value="">All Categories</option>
          <option value="raw_material">Raw Material</option>
          <option value="component">Component</option>
          <option value="sub_assembly">Sub-Assembly</option>
          <option value="finished_good">Finished Good</option>
        </select>
      </div>
      <div className="border border-[#E5E7EB] mt-1 max-h-40 overflow-y-auto bg-white text-xs">
        {matches.length === 0 ? (
          <div className="px-2 py-1.5 text-[#9CA3AF] italic">No products match</div>
        ) : matches.map(i => (
          <button key={i.id} onClick={() => add(i.id)} className="block w-full text-left px-2 py-1 hover:bg-[#F3F4F6]" data-testid={`${testid}-opt-${i.id}`}>
            <span className="mono font-medium">{i.part_number}</span> · {i.name} <span className="text-[#9CA3AF]">({i.category?.replace('_', ' ')})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 *  CONTACTS PANEL (Customers within CRM)
 * ========================================================================= */
function ContactsPanel({ customers, search, onRefresh, canEdit }) {
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const empty = { code: '', name: '', gstin: '', contact_person: '', email: '', phone: '', address: '', status: 'active' };
  const [form, setForm] = useState(empty);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, contact: null });

  const openDialog = (c) => {
    if (c) { setEditing(c); setForm({ ...empty, ...c }); }
    else { setEditing(null); setForm(empty); }
    setDialog(true);
  };
  const save = async () => {
    if (!form.name.trim()) { alert('Name is required'); return; }
    try {
      if (editing) await api.put(`/api/customers/${editing.id}`, form);
      else await api.post('/api/customers', form);
      setDialog(false); setEditing(null); onRefresh();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };
  const del = async (c) => {
    try { await api.delete(`/api/customers/${c.id}`); onRefresh(); setDeleteConfirm({ open: false, contact: null }); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const filtered = customers.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [c.name, c.code, c.email, c.phone, c.gstin].some(v => (v || '').toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-[#4B5563]">{filtered.length} contact{filtered.length !== 1 ? 's' : ''} in master</div>
        {canEdit && (
          <div className="flex gap-2">
            <ContactImportButton onImported={onRefresh} />
            <button className="btn-primary flex items-center gap-1" onClick={() => openDialog(null)} data-testid="add-contact-btn"><Plus className="w-4 h-4" /> New Contact</button>
          </div>
        )}
      </div>
      <div className="card-flat overflow-hidden">
        <table className="w-full data-table" data-testid="contacts-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>GSTIN</th><th>Contact Person</th><th>Email / Phone</th><th>Address</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-sm text-[#6B7280]">No contacts found. Click "New Contact" to add.</td></tr>}
            {filtered.map(c => (
              <tr key={c.id} data-testid={`contact-row-${c.id}`}>
                <td className="mono font-medium">{c.code}</td>
                <td className="font-medium text-[#1D3557]">{c.name}</td>
                <td className="mono text-xs">{c.gstin || '—'}</td>
                <td className="text-xs">{c.contact_person || '—'}</td>
                <td className="text-xs">
                  {c.email && <div>{c.email}</div>}
                  {c.phone && <div className="mono text-[#4B5563]">{c.phone}</div>}
                </td>
                <td className="text-xs text-[#4B5563] max-w-xs truncate" title={c.address}>{c.address || '—'}</td>
                <td><span className={`status-badge ${c.status === 'active' ? 'bg-[#DEF7EC] text-[#03543F]' : 'bg-[#F3F4F6] text-[#4B5563]'}`}>{c.status}</span></td>
                <td>
                  <div className="flex gap-0.5">
                    {canEdit && <button onClick={() => openDialog(c)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" data-testid={`contact-edit-${c.id}`}><Edit2 className="w-4 h-4" /></button>}
                    {canEdit && <button onClick={() => setDeleteConfirm({ open: true, contact: c })} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" data-testid={`contact-delete-${c.id}`}><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialog} onOpenChange={(o) => { setDialog(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="contact-dialog">
          <DialogHeader><DialogTitle className="font-[Chivo]">{editing ? 'Edit Contact' : 'New Contact'}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Name *</label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="contact-name" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Code (auto if blank)</label>
                <input className="input-field mono" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} disabled={!!editing} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">GSTIN</label>
                <input className="input-field mono" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Contact Person</label>
                <input className="input-field" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Email</label>
                <input className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Phone</label>
                <input className="input-field mono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Address</label>
                <textarea rows={2} className="input-field" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button className="btn-secondary" onClick={() => setDialog(false)}>Cancel</button>
              <button className="btn-primary" onClick={save} data-testid="contact-save-btn">{editing ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, contact: null })}
        title="Delete Contact?"
        message={<>This will permanently delete <strong>{deleteConfirm.contact?.name}</strong>{deleteConfirm.contact?.code ? ` (${deleteConfirm.contact.code})` : ''}. This may fail if the contact is referenced by orders or invoices.</>}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => del(deleteConfirm.contact)}
        testidPrefix="contact-delete-confirm"
      />
    </div>
  );
}

/* ============================================================================
 *  PIPELINE CONFIGURATION PANEL (customizable stages)
 * ========================================================================= */
const PIPELINE_COLOR_OPTIONS = [
  'bg-[#E1EFFE] text-[#1E429F]',
  'bg-[#FEF3C7] text-[#92400E]',
  'bg-[#FCE7F3] text-[#9D174D]',
  'bg-[#DEF7EC] text-[#03543F]',
  'bg-[#FDE8E8] text-[#9B1C1C]',
  'bg-[#FDF6B2] text-[#723B13]',
  'bg-[#F3F4F6] text-[#4B5563]',
];

function PipelineConfigPanel({ pipelineType, onRefresh, canEdit }) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/crm/pipeline-config/${pipelineType}`);
      setStages(res.data?.stages || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [pipelineType]);
  useEffect(() => { load(); }, [load]);

  const addStage = () => setStages(s => [...s, { key: `stage_${s.length + 1}`, label: `Stage ${s.length + 1}`, color: PIPELINE_COLOR_OPTIONS[s.length % PIPELINE_COLOR_OPTIONS.length], order: s.length + 1 }]);
  const updateStage = (idx, patch) => setStages(s => s.map((st, i) => i === idx ? { ...st, ...patch } : st));
  const removeStage = (idx) => setStages(s => s.length > 1 ? s.filter((_, i) => i !== idx) : s);
  const moveStage = (idx, dir) => setStages(s => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= s.length) return s;
    const copy = [...s];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    return copy.map((st, i) => ({ ...st, order: i + 1 }));
  });

  const save = async () => {
    const trimmed = stages.map(s => ({ ...s, key: (s.key || '').trim().toLowerCase().replace(/\s+/g, '_'), label: (s.label || '').trim() }));
    if (trimmed.some(s => !s.key || !s.label)) { alert('Every stage needs a key + label'); return; }
    const keys = trimmed.map(s => s.key);
    if (new Set(keys).size !== keys.length) { alert('Stage keys must be unique'); return; }
    setSaving(true);
    try {
      const payload = { stages: trimmed.map((s, i) => ({ key: s.key, label: s.label, color: s.color, order: i + 1 })) };
      await api.put(`/api/crm/pipeline-config/${pipelineType}`, payload);
      await load();
      onRefresh && onRefresh();
      alert('Pipeline configuration saved');
    } catch (e) { alert(e.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    if (!window.confirm('Reset to default stages? Custom stages will be lost.')) return;
    setSaving(true);
    try {
      await api.post(`/api/crm/pipeline-config/${pipelineType}/reset`);
      await load();
      onRefresh && onRefresh();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-10 text-sm text-[#6B7280]">Loading pipeline configuration...</div>;

  return (
    <div className="space-y-4" data-testid={`pipeline-config-${pipelineType}`}>
      <div className="bg-[#FEF3C7] border border-[#92400E] rounded-sm p-3 text-xs">
        <div className="font-semibold mb-1">Customize {pipelineType === 'marketing' ? 'Marketing' : 'Support'} Pipeline Stages</div>
        Add, rename, reorder or remove the stages that appear everywhere ({pipelineType === 'marketing' ? 'leads' : 'tickets'}) in this pipeline. Existing records keep their current stage even if you remove it — they&apos;ll just display raw.
      </div>

      <div className="card-flat overflow-hidden">
        <table className="w-full data-table">
          <thead>
            <tr><th className="w-10">#</th><th>Key (lowercase)</th><th>Label</th><th>Preview</th><th>Color</th><th className="w-32">Actions</th></tr>
          </thead>
          <tbody>
            {stages.map((s, idx) => (
              <tr key={idx} data-testid={`stage-row-${idx}`}>
                <td className="mono">{idx + 1}</td>
                <td><input className="input-field h-7 text-xs mono" value={s.key} onChange={e => updateStage(idx, { key: e.target.value })} disabled={!canEdit} data-testid={`stage-key-${idx}`} /></td>
                <td><input className="input-field h-7 text-xs" value={s.label} onChange={e => updateStage(idx, { label: e.target.value })} disabled={!canEdit} data-testid={`stage-label-${idx}`} /></td>
                <td><span className={`status-badge ${s.color || 'bg-[#F3F4F6] text-[#4B5563]'}`}>{s.label}</span></td>
                <td>
                  <Select value={s.color} onValueChange={v => updateStage(idx, { color: v })} disabled={!canEdit}>
                    <SelectTrigger className="h-7 text-xs" data-testid={`stage-color-${idx}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PIPELINE_COLOR_OPTIONS.map((c, ci) => (
                        <SelectItem key={ci} value={c}><span className={`px-2 py-0.5 rounded ${c}`}>Sample</span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td>
                  <div className="flex gap-0.5">
                    <button onClick={() => moveStage(idx, -1)} disabled={!canEdit || idx === 0} className="p-1 text-[#4B5563] hover:text-[#1D3557] disabled:opacity-30">↑</button>
                    <button onClick={() => moveStage(idx, 1)} disabled={!canEdit || idx === stages.length - 1} className="p-1 text-[#4B5563] hover:text-[#1D3557] disabled:opacity-30">↓</button>
                    {canEdit && stages.length > 1 && <button onClick={() => removeStage(idx)} className="p-1 text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" data-testid={`stage-delete-${idx}`}><X className="w-4 h-4" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-1" onClick={addStage} data-testid="stage-add-btn"><Plus className="w-4 h-4" /> Add Stage</button>
          <div className="flex-1" />
          <button className="btn-secondary flex items-center gap-1" onClick={reset} disabled={saving} data-testid="stage-reset-btn"><RefreshCw className="w-4 h-4" /> Reset to Defaults</button>
          <button className="btn-primary" onClick={save} disabled={saving} data-testid="stage-save-btn">{saving ? 'Saving...' : 'Save Configuration'}</button>
        </div>
      )}

      {pipelineType === 'marketing' && <QuotationCoverPageConfig canEdit={canEdit} />}
      {pipelineType === 'marketing' && <QuotationDefaultTermsConfig canEdit={canEdit} />}
      {pipelineType === 'marketing' && <InvoiceTermsConfig canEdit={canEdit} />}
    </div>
  );
}

// Marketing-side default Terms & Conditions / Notes that auto-populate every
// new Quotation. Editable only with `marketing_configuration.edit` permission;
// visible whenever the user has `marketing_configuration.view` (which the
// surrounding Configuration tab already gates).
function QuotationDefaultTermsConfig({ canEdit }) {
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/crm/marketing-config')
      .then(({ data }) => {
        if (cancelled) return;
        setTerms(data.default_quotation_terms || '');
        setNotes(data.default_quotation_notes || '');
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/crm/marketing-config', {
        default_quotation_terms: terms,
        default_quotation_notes: notes,
      });
      toast.success('Default Quotation T&C saved. Future quotations will auto-fill these unless overridden per-quote.');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="card-flat p-4 space-y-3" data-testid="quotation-default-terms-config">
      <div>
        <h3 className="text-sm font-semibold text-[#1D3557]">Default Quotation T&amp;C</h3>
        <p className="text-xs text-[#6B7280] mt-1">
          These are pre-filled into every new Quotation when its T&amp;C / Notes fields are left blank. Per-quotation overrides still win — this only sets the starting point.
        </p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#374151] mb-1">Terms &amp; Conditions</label>
        <textarea
          className="w-full px-3 py-2 border border-[#D1D5DB] rounded-sm text-sm"
          rows={6}
          placeholder={"Example:\n\n1. Payment: 50% advance, 50% before dispatch.\n2. Delivery: 4-6 weeks from order confirmation.\n3. Validity: 30 days from quotation date.\n4. Taxes & duties extra at actuals.\n5. Subject to Bangalore jurisdiction."}
          value={terms}
          onChange={e => setTerms(e.target.value)}
          disabled={!canEdit}
          data-testid="quotation-default-terms-textarea"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#374151] mb-1">Notes (default)</label>
        <textarea
          className="w-full px-3 py-2 border border-[#D1D5DB] rounded-sm text-sm"
          rows={3}
          placeholder="Optional default notes shown after the line items (e.g. bank account, GST number, contact person)."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={!canEdit}
          data-testid="quotation-default-notes-textarea"
        />
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving} data-testid="quotation-default-terms-save-btn">
            {saving ? 'Saving...' : 'Save Default T&C'}
          </button>
        </div>
      )}
      {!canEdit && <p className="text-[11px] text-[#9B1C1C] italic">Read-only — your role group lacks <code>marketing_configuration.edit</code>.</p>}
    </div>
  );
}

function QuotationCoverPageConfig({ canEdit }) {
  const { companySettings, refreshSettings } = useCompanySettings();
  const [intro, setIntro] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIntro(companySettings?.quotation_cover_intro || '');
  }, [companySettings]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/settings/company', { quotation_cover_intro: intro });
      await refreshSettings();
      alert('Quotation Cover Page saved. It will be prepended as the first page of every Quotation printout going forward.');
    } catch (e) { alert(e.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card-flat p-4 space-y-3" data-testid="quotation-cover-config">
      <div>
        <h3 className="text-sm font-semibold text-[#1D3557]">Quotation Cover Page</h3>
        <p className="text-xs text-[#6B7280] mt-1">When you print any quotation, this intro paragraph is prepended as a **dedicated cover page** alongside the company logo, title, customer name, date, and the logged-in user&apos;s signature. Leave blank to skip the cover page.</p>
      </div>
      <textarea
        className="w-full px-3 py-2 border border-[#D1D5DB] rounded-sm text-sm"
        rows={6}
        placeholder={"Example:\n\nDear Sir/Madam,\n\nThank you for the opportunity to quote. Please find attached our proposal for your kind consideration. We look forward to your esteemed order.\n\nWarm regards,"}
        value={intro}
        onChange={e => setIntro(e.target.value)}
        disabled={!canEdit}
        data-testid="quotation-cover-intro-textarea"
      />
      {canEdit && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving} data-testid="quotation-cover-save-btn">
            {saving ? 'Saving...' : 'Save Cover Page'}
          </button>
        </div>
      )}
    </div>
  );
}

function InvoiceTermsConfig({ canEdit }) {
  const { companySettings, refreshSettings } = useCompanySettings();
  const [terms, setTerms] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTerms(companySettings?.invoice_terms_conditions || '');
  }, [companySettings]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/settings/company', { invoice_terms_conditions: terms });
      await refreshSettings();
      alert('Invoice Terms & Conditions saved. They will auto-fill the T&C field when creating new Tax Invoices.');
    } catch (e) { alert(e.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card-flat p-4 space-y-3" data-testid="invoice-terms-config">
      <div>
        <h3 className="text-sm font-semibold text-[#1D3557]">Tax Invoice Terms &amp; Conditions</h3>
        <p className="text-xs text-[#6B7280] mt-1">Default T&amp;C clauses that auto-fill the <strong>Tax Invoice</strong> form. Each new invoice picks these up automatically; per-invoice edits remain possible. Kept separate from Quotation terms.</p>
      </div>
      <textarea
        className="w-full px-3 py-2 border border-[#D1D5DB] rounded-sm text-sm font-mono"
        rows={8}
        placeholder={"1. Payment due within 30 days of invoice date.\n2. Interest @ 18% p.a. on overdue amounts.\n3. Goods once sold will not be taken back.\n4. All disputes subject to <City> jurisdiction."}
        value={terms}
        onChange={e => setTerms(e.target.value)}
        disabled={!canEdit}
        data-testid="invoice-terms-textarea"
      />
      {canEdit && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving} data-testid="invoice-terms-save-btn">
            {saving ? 'Saving...' : 'Save Invoice T&C'}
          </button>
        </div>
      )}
    </div>
  );
}
function SLAPanel({ tickets, search, stages }) {
  const TICKET_ST = (stages && stages.length) ? stages : TICKET_STAGES;
  const nonClosed = tickets.filter(t => t.stage !== 'closed');
  const filtered = nonClosed.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [t.ticket_no, t.subject, t.customer?.name].some(v => (v || '').toLowerCase().includes(q));
  });
  const breached = filtered.filter(t => t.sla_breached);
  const dueSoon = filtered.filter(t => {
    if (t.sla_breached || !t.sla_due) return false;
    const dueMs = new Date(t.sla_due).getTime();
    return (dueMs - Date.now()) < 4 * 3600 * 1000;
  });

  const rows = filtered
    .slice()
    .sort((a, b) => {
      const av = a.sla_due ? new Date(a.sla_due).getTime() : Infinity;
      const bv = b.sla_due ? new Date(b.sla_due).getTime() : Infinity;
      return av - bv;
    });

  return (
    <div className="space-y-4" data-testid="sla-panel">
      <div className="flex gap-3 flex-wrap">
        <div className={`border rounded-sm px-3 py-2 min-w-[120px] ${breached.length > 0 ? 'border-[#9B1C1C] bg-[#FDE8E8]' : 'border-[#E5E7EB] bg-white'}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-wide ${breached.length > 0 ? 'text-[#9B1C1C]' : 'text-[#6B7280]'}`}>Breached</div>
          <div className={`text-lg font-semibold mono ${breached.length > 0 ? 'text-[#9B1C1C]' : 'text-[#1D3557]'}`}>{breached.length}</div>
        </div>
        <div className="border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[120px]">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#92400E]">Due within 4h</div>
          <div className="text-lg font-semibold mono text-[#92400E]">{dueSoon.length}</div>
        </div>
        <div className="border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[120px]">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#1E429F]">Total Open</div>
          <div className="text-lg font-semibold mono text-[#1E429F]">{filtered.length}</div>
        </div>
      </div>
      <div className="card-flat overflow-hidden">
        <table className="w-full data-table" data-testid="sla-table">
          <thead><tr><th>Ticket #</th><th>Subject</th><th>Customer</th><th>Priority</th><th>Stage</th><th>SLA Due</th><th>Time Left</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-sm text-[#6B7280]">No open tickets with SLA.</td></tr>}
            {rows.map(t => {
              const stageData = TICKET_ST.find(s => s.key === t.stage);
              const priorityData = PRIORITY_OPTIONS.find(p => p.key === t.priority);
              const dueMs = t.sla_due ? new Date(t.sla_due).getTime() : null;
              const deltaMs = dueMs ? dueMs - Date.now() : 0;
              const hours = Math.floor(Math.abs(deltaMs) / 3600000);
              const mins = Math.floor((Math.abs(deltaMs) % 3600000) / 60000);
              const timeLabel = dueMs ? (t.sla_breached ? `Overdue ${hours}h ${mins}m` : `${hours}h ${mins}m remaining`) : '—';
              return (
                <tr key={t.id} className={t.sla_breached ? 'bg-[#FEF2F2]' : ''} data-testid={`sla-row-${t.id}`}>
                  <td className="mono font-medium">{t.ticket_no}</td>
                  <td className="text-sm">{t.subject}</td>
                  <td className="text-xs">{t.customer?.name || '—'}</td>
                  <td><span className={`status-badge ${priorityData?.color || ''}`}>{priorityData?.label || t.priority}</span></td>
                  <td><span className={`status-badge ${stageData?.color || ''}`}>{stageData?.label || t.stage}</span></td>
                  <td className="text-xs">{t.sla_due ? formatDateTime(t.sla_due) : '—'}</td>
                  <td className={`text-xs font-semibold ${t.sla_breached ? 'text-[#9B1C1C]' : 'text-[#374151]'}`}>{timeLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================================
 *  ACTIVITY LOG PANEL (Support)
 * ========================================================================= */
function ActivityLogPanel({ search }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/crm/activities?type=support');
      setActivities(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = activities.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [a.entity_no, a.entity_title, a.customer_name, a.note, a.author_name].some(v => (v || '').toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4" data-testid="activity-panel">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#4B5563]">{filtered.length} activity entries across all Support tickets</div>
        <button className="btn-secondary flex items-center gap-1" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>
      <div className="card-flat overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-sm text-[#6B7280]">Loading activity logs...</div>
        ) : (
          <table className="w-full data-table" data-testid="activity-table">
            <thead><tr><th>When</th><th>Ticket</th><th>Customer</th><th>Note</th><th>Author</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-sm text-[#6B7280]">No activity yet.</td></tr>}
              {filtered.map((a, idx) => (
                <tr key={idx} data-testid={`activity-row-${idx}`}>
                  <td className="text-xs whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                  <td className="mono text-xs">{a.entity_no}<div className="text-[10px] text-[#6B7280] truncate max-w-[180px]">{a.entity_title}</div></td>
                  <td className="text-xs">{a.customer_name || '—'}</td>
                  <td className="text-xs">{a.note}</td>
                  <td className="text-xs">{a.author_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


/* ============================================================================
 *  SHARED — CSV Import Button (Leads / Contacts)
 * ========================================================================= */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const parseLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim());
  };
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const cols = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  });
}

function CSVImportButton({ endpoint, sample, testid, label = 'Import CSV', onImported }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = React.useRef(null);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(String(ev.target.result));
        setRows(parsed);
        setResult(null);
      } catch (err) { alert('Failed to parse CSV: ' + err.message); }
    };
    reader.readAsText(f);
  };

  const importNow = async () => {
    if (rows.length === 0) { alert('Load a CSV first'); return; }
    setBusy(true);
    try {
      const res = await api.post(endpoint, { rows });
      setResult(res.data);
      onImported && onImported();
    } catch (e) { alert(e.response?.data?.detail || 'Import failed'); }
    finally { setBusy(false); }
  };

  const downloadSample = () => {
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sample.csv'; a.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 500);
  };

  return (
    <>
      <button className="btn-secondary flex items-center gap-1" onClick={() => { setOpen(true); setRows([]); setResult(null); }} data-testid={testid}>
        <Upload className="w-4 h-4" /> {label}
      </button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setRows([]); setResult(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid={`${testid}-dialog`}>
          <DialogHeader><DialogTitle className="font-[Chivo]">{label}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-3 text-sm">
            <div className="bg-[#FEF3C7] border border-[#92400E] rounded-sm p-2 text-xs flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold mb-1">CSV Format</div>
                Provide a header row with column names like: <span className="mono">{sample.split('\n')[0]}</span>
              </div>
              <button className="btn-secondary text-xs whitespace-nowrap" onClick={downloadSample} data-testid={`${testid}-sample`}>Download sample</button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="input-field" data-testid={`${testid}-file`} />
            {rows.length > 0 && (
              <div>
                <div className="font-semibold mb-1 text-xs">Preview ({rows.length} rows)</div>
                <div className="border border-[#E5E7EB] rounded-sm overflow-auto max-h-60">
                  <table className="w-full text-[11px]">
                    <thead className="bg-[#F3F4F6]"><tr>{Object.keys(rows[0]).map(h => <th key={h} className="text-left p-1 border-r border-[#E5E7EB]">{h}</th>)}</tr></thead>
                    <tbody>
                      {rows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="border-t border-[#E5E7EB]">{Object.keys(rows[0]).map(h => <td key={h} className="p-1 border-r border-[#E5E7EB]">{r[h]}</td>)}</tr>
                      ))}
                      {rows.length > 10 && <tr><td colSpan={Object.keys(rows[0]).length} className="p-1 text-center text-[#6B7280]">... {rows.length - 10} more</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {result && (
              <div className={`border rounded-sm p-2 text-xs ${result.skipped?.length > 0 ? 'bg-[#FEF2F2] border-[#9B1C1C]' : 'bg-[#DEF7EC] border-[#03543F]'}`}>
                <div className="font-semibold">Import complete</div>
                <div>Created: <strong>{result.created}</strong> · Skipped: <strong>{result.skipped?.length || 0}</strong> · Total: {result.total}</div>
                {result.skipped?.length > 0 && (
                  <ul className="mt-1 list-disc list-inside">{result.skipped.slice(0, 5).map((s, i) => <li key={i}>Row {s.row}: {s.reason}</li>)}</ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button className="btn-secondary" onClick={() => setOpen(false)}>Close</button>
              {!result && <button className="btn-primary" onClick={importNow} disabled={busy || rows.length === 0} data-testid={`${testid}-submit`}>{busy ? 'Importing...' : `Import ${rows.length} rows`}</button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LeadImportButton({ onImported }) {
  const sample = 'name,customer_name,contact_person,email,phone,source,estimated_value,stage,notes\nWebsite enquiry - ABC,ABC Pumps Ltd,John Doe,john@abc.com,9876543210,website,50000,enquiry,Follow up next week';
  return <CSVImportButton endpoint="/api/crm/leads/import" sample={sample} testid="lead-import-btn" label="Import Leads" onImported={onImported} />;
}

function ContactImportButton({ onImported }) {
  const sample = 'code,name,gstin,contact_person,email,phone,address,city,state,pin_code,payment_terms,status\nCUST-001,ABC Pumps Ltd,27AABCD1234E1Z5,John Doe,john@abc.com,9876543210,123 MIDC Road,Pune,Maharashtra,411001,Net 30,active';
  return <CSVImportButton endpoint="/api/customers/import" sample={sample} testid="contact-import-btn" label="Import Contacts" onImported={onImported} />;
}


/* ============================================================================
 *  PROFORMA INVOICES PANEL
 * ========================================================================= */
const PROFORMA_STATUSES = [
  { key: 'draft', label: 'Draft', color: 'bg-[#F3F4F6] text-[#4B5563]' },
  { key: 'sent', label: 'Sent', color: 'bg-[#E1EFFE] text-[#1E429F]' },
  { key: 'paid', label: 'Advance Paid', color: 'bg-[#DEF7EC] text-[#03543F]' },
  { key: 'cancelled', label: 'Cancelled', color: 'bg-[#FDE8E8] text-[#9B1C1C]' },
  { key: 'converted', label: 'Converted → Invoice', color: 'bg-[#FCE7F3] text-[#9D174D]' },
];

function ProformasPanel({ customers, search, onRefresh, canEdit }) {
  const { user } = useAuth();
  const { companySettings } = useCompanySettings();
  const [list, setList] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, proforma: null });
  const [convertConfirm, setConvertConfirm] = useState({ open: false, proforma: null });
  const [waShare, setWaShare] = useState({ open: false, doc: null });

  const load = useCallback(async () => {
    try { const r = await api.get('/api/crm/proformas'); setList(r.data || []); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const statusChange = async (p, status) => {
    try { await api.put(`/api/crm/proformas/${p.id}`, { status }); load(); onRefresh(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const del = async (p) => {
    try { await api.delete(`/api/crm/proformas/${p.id}`); setDeleteConfirm({ open: false, proforma: null }); load(); onRefresh(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const convertToTaxInvoice = async () => {
    const p = convertConfirm.proforma;
    if (!p) return;
    try {
      const res = await api.post(`/api/crm/proformas/${p.id}/convert-to-tax-invoice`, {});
      setConvertConfirm({ open: false, proforma: null });
      load(); onRefresh();
      alert(`Tax Invoice ${res.data.invoice_no} issued. Review it in the Tax Invoices tab.`);
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const filtered = list.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [p.proforma_no, p.customer_name, p.quotation?.quotation_no].some(v => (v || '').toLowerCase().includes(q));
  });

  const printProforma = (p) => printInvoiceDoc(p, { kind: 'proforma', title: 'PROFORMA INVOICE', numberKey: 'proforma_no', company: companySettings, user });

  return (
    <div className="space-y-4" data-testid="proformas-panel">
      <div className="card-flat overflow-hidden">
        <table className="w-full data-table" data-testid="proformas-table">
          <thead><tr><th>PI #</th><th>Customer</th><th>From Quotation</th><th>Date</th><th>Valid Until</th><th>Subtotal</th><th>GST (CGST+SGST / IGST)</th><th>Grand Total</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} className="text-center py-6 text-sm text-[#6B7280]">No Proforma Invoices yet. Generate one from a Quotation.</td></tr>}
            {filtered.map(p => {
              const statusData = PROFORMA_STATUSES.find(s => s.key === p.status);
              const isLocked = p.status === 'converted';
              return (
                <tr key={p.id} data-testid={`proforma-row-${p.id}`}>
                  <td className="mono font-medium">{p.proforma_no}</td>
                  <td><div className="font-medium text-[#1D3557]">{p.customer_name}</div>{p.contact_person && <div className="text-xs text-[#4B5563]">{p.contact_person}</div>}</td>
                  <td className="text-xs mono">{p.quotation?.quotation_no || <span className="text-[#9CA3AF]">manual</span>}</td>
                  <td className="text-xs">{p.proforma_date ? new Date(p.proforma_date).toLocaleDateString('en-IN') : '-'}</td>
                  <td className="text-xs">{p.valid_until ? new Date(p.valid_until).toLocaleDateString('en-IN') : '-'}</td>
                  <td className="mono text-sm">{formatCurrency(p.subtotal)}</td>
                  <td className="text-xs mono">{p.is_inter_state ? `IGST ${formatCurrency(p.igst)}` : `CGST ${formatCurrency(p.cgst)} + SGST ${formatCurrency(p.sgst)}`}</td>
                  <td className="mono font-semibold text-sm">{formatCurrency(p.grand_total)}</td>
                  <td>
                    {canEdit && !isLocked ? (
                      <Select value={p.status || 'draft'} onValueChange={(v) => statusChange(p, v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{PROFORMA_STATUSES.filter(s => s.key !== 'converted').map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <span className={`status-badge ${statusData?.color || ''}`}>{statusData?.label || p.status}
                        {p.converted_tax_invoice_no && <span className="ml-1 text-[10px]">({p.converted_tax_invoice_no})</span>}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-0.5">
                      <button onClick={() => printProforma(p)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Print" data-testid={`proforma-print-${p.id}`}><Printer className="w-4 h-4" /></button>
                      <button onClick={() => setWaShare({ open: true, doc: p })} className="p-1.5 text-[#25D366] hover:bg-[#DCFCE7] rounded" title="Share on WhatsApp" data-testid={`proforma-wa-${p.id}`}><MessageSquare className="w-4 h-4" /></button>
                      {canEdit && !isLocked && (
                        <button onClick={() => setConvertConfirm({ open: true, proforma: p })} className="p-1.5 text-[#03543F] hover:bg-[#DEF7EC] rounded" title="Convert to Tax Invoice" data-testid={`proforma-to-invoice-${p.id}`}><Send className="w-4 h-4" /></button>
                      )}
                      {canEdit && !isLocked && <button onClick={() => setDeleteConfirm({ open: true, proforma: p })} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`proforma-delete-${p.id}`}><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={convertConfirm.open}
        onOpenChange={(o) => !o && setConvertConfirm({ open: false, proforma: null })}
        title="Generate Tax Invoice?"
        message={<>This will issue a GST Tax Invoice for <strong>{convertConfirm.proforma?.proforma_no}</strong>. Once issued, this Proforma becomes read-only.</>}
        confirmLabel="Issue Tax Invoice"
        variant="primary"
        onConfirm={convertToTaxInvoice}
        testidPrefix="proforma-convert-confirm"
      />
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, proforma: null })}
        title="Delete Proforma?"
        message={<>This will permanently delete <strong>{deleteConfirm.proforma?.proforma_no}</strong>.</>}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => del(deleteConfirm.proforma)}
        testidPrefix="proforma-delete-confirm"
      />

      <WhatsAppShareDialog
        open={waShare.open}
        onOpenChange={(o) => setWaShare({ open: o, doc: o ? waShare.doc : null })}
        doc={waShare.doc}
        kind="proforma"
        company={companySettings}
        user={user}
      />
    </div>
  );
}

/* ============================================================================
 *  TAX INVOICES PANEL
 * ========================================================================= */
const TAX_INVOICE_STATUSES = [
  { key: 'draft', label: 'Draft', color: 'bg-[#F3F4F6] text-[#4B5563]' },
  { key: 'issued', label: 'Issued', color: 'bg-[#E1EFFE] text-[#1E429F]' },
  { key: 'paid', label: 'Paid', color: 'bg-[#DEF7EC] text-[#03543F]' },
  { key: 'cancelled', label: 'Cancelled', color: 'bg-[#FDE8E8] text-[#9B1C1C]' },
];

function emptyTaxInvoiceLine() {
  return { item_id: '', description: '', hsn_code: '', quantity: 1, uom: 'Nos', rate: 0, discount_pct: 0, gst_rate: 18 };
}

function TaxInvoicesPanel({ customers, search, onRefresh, canEdit }) {
  const { user } = useAuth();
  const { companySettings } = useCompanySettings();
  const [list, setList] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [sourceType, setSourceType] = useState('sales_order');  // 'sales_order' | 'po' | 'manual'
  const [selectedSO, setSelectedSO] = useState('');
  const emptyForm = {
    customer_id: '',
    customer_name: '',
    contact_person: '',
    email: '',
    phone: '',
    billing_address: '',
    shipping_address: '',
    customer_po_number: '',
    sales_order_id: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    place_of_supply: '',
    notes: '',
    terms: '',
    currency: 'INR',
    ship_from_warehouse_id: '',  // Source store for stock deduction on save
    lines: [emptyTaxInvoiceLine()],
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, invoice: null });
  const [packingDialog, setPackingDialog] = useState({ open: false, invoice: null });
  const [waShare, setWaShare] = useState({ open: false, doc: null });

  const [editingTI, setEditingTI] = useState(null);

  const load = useCallback(async () => {
    try { const r = await api.get('/api/crm/tax-invoices'); setList(r.data || []); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Fetch sales orders + items + warehouses when dialog opens
  const openDialog = async (ti) => {
    try {
      const [soRes, itRes, whRes] = await Promise.all([
        api.get('/api/production').catch(() => ({ data: [] })),
        api.get('/api/items').catch(() => ({ data: [] })),
        api.get('/api/warehouses').catch(() => ({ data: [] })),
      ]);
      setSalesOrders((soRes.data || []).filter(o => ['confirmed', 'in_progress', 'completed', 'partially_cancelled'].includes(o.status)));
      setItems(itRes.data || []);
      setWarehouses((whRes.data || []).filter(w => (w.status || 'active') === 'active'));
    } catch (e) { console.error(e); }
    if (ti) {
      // EDIT mode — pre-fill from existing TI
      setEditingTI(ti);
      setSourceType(ti.sales_order_id ? 'sales_order' : 'manual');
      setSelectedSO(ti.sales_order_id || '');
      setForm({
        customer_id: ti.customer_id || '',
        customer_name: ti.customer_name || '',
        contact_person: ti.contact_person || '',
        email: ti.email || '',
        phone: ti.phone || '',
        billing_address: ti.billing_address || '',
        shipping_address: ti.shipping_address || '',
        customer_po_number: ti.customer_po_number || '',
        sales_order_id: ti.sales_order_id || '',
        invoice_date: ti.invoice_date ? String(ti.invoice_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        due_date: ti.due_date ? String(ti.due_date).slice(0, 10) : '',
        place_of_supply: ti.place_of_supply || '',
        notes: ti.notes || '',
        terms: ti.terms || '',
        currency: ti.currency || 'INR',
        ship_from_warehouse_id: ti.ship_from_warehouse_id || '',
        lines: (ti.lines || []).map(l => ({ ...l })),
      });
    } else {
      setEditingTI(null);
      setSourceType('sales_order');
      setSelectedSO('');
      // Seed default T&C from invoice_terms_conditions (NOT quotation_cover_intro).
      setForm({ ...emptyForm, terms: companySettings?.invoice_terms_conditions || '' });
    }
    setDialog(true);
  };

  const applyCustomer = (cid) => {
    const c = customers.find(x => x.id === cid);
    if (c) {
      // Build a complete address block: street + city/state/pin + GSTIN.
      // Bill-To and Ship-To start identical; user can edit Ship-To if the
      // delivery location differs from the billing address.
      const parts = [
        c.address,
        [c.city, c.state, c.pin_code].filter(Boolean).join(', '),
        c.state_code ? `State Code: ${c.state_code}` : '',
        c.gstin ? `GSTIN: ${c.gstin}` : '',
      ].filter(Boolean);
      const fullAddr = parts.join('\n');
      // Place of supply uses the format "<state_code> - <state>" so the
      // printed invoice can show both (matches GST norms).
      const pos = c.state_code
        ? (c.state ? `${c.state_code} - ${c.state}` : c.state_code)
        : (c.state || '');
      setForm(prev => ({
        ...prev,
        customer_id: cid,
        customer_name: c.name || '',
        contact_person: c.contact_person || '',
        email: c.email || '',
        phone: c.phone || '',
        billing_address: fullAddr,
        shipping_address: fullAddr,
        place_of_supply: pos,
      }));
    }
  };

  const applySO = async (soId) => {
    setSelectedSO(soId);
    try {
      // Use the backend endpoint to resolve lines from SO (but don't persist yet)
      // We'll just auto-fill the form by pulling SO details
      const r = await api.get(`/api/production/${soId}`);
      const so = r.data;
      if (!so) return;
      const c = customers.find(x => x.id === so.customer_id) || {};
      const soLines = so.lines || (so.bom_id ? [{ bom_id: so.bom_id, quantity: so.quantity }] : []);
      const lines = [];
      for (const ln of soLines) {
        const bom = so.lines ? ln.bom : so.bom;
        const item = bom ? items.find(x => x.id === bom.parent_item_id) : null;
        const rate = item ? (parseFloat(item.sale_price) || parseFloat(item.purchase_price) || parseFloat(item.unit_cost) || 0) : 0;
        lines.push({
          item_id: item?.id || '',
          description: item?.name || '',
          hsn_code: item?.hsn_code || '',
          quantity: parseFloat(ln.quantity) || 0,
          uom: item?.uom || 'Nos',
          rate,
          discount_pct: 0,
          gst_rate: parseFloat(item?.gst_rate) || 18,
        });
      }
      setForm(prev => ({
        ...prev,
        sales_order_id: soId,
        customer_id: so.customer_id || '',
        customer_name: c.name || '',
        contact_person: c.contact_person || '',
        email: c.email || '',
        phone: c.phone || '',
        billing_address: c.address || '',
        shipping_address: c.address || '',
        place_of_supply: c.state_code || '',
        lines: lines.length ? lines : [emptyTaxInvoiceLine()],
      }));
    } catch (e) { alert('Failed to load Sales Order details'); }
  };

  const updateLine = (idx, patch) => {
    setForm(prev => ({ ...prev, lines: prev.lines.map((l, i) => i === idx ? { ...l, ...patch } : l) }));
  };

  const applyItemToLine = (idx, itemId) => {
    const it = items.find(x => x.id === itemId);
    if (!it) return;
    updateLine(idx, {
      item_id: itemId,
      // Prefer the item's description (richer copy maintained on the item master).
      // Fall back to the item name only if no description has been captured yet.
      description: (it.description && it.description.trim()) || it.name || '',
      hsn_code: it.hsn_code || '',
      uom: it.uom || 'Nos',
      rate: parseFloat(it.sale_price) || parseFloat(it.purchase_price) || parseFloat(it.unit_cost) || 0,
      gst_rate: parseFloat(it.gst_rate) || 18,
    });
  };

  const addLine = () => setForm(prev => ({ ...prev, lines: [...prev.lines, emptyTaxInvoiceLine()] }));
  const removeLine = (idx) => setForm(prev => ({ ...prev, lines: prev.lines.length <= 1 ? prev.lines : prev.lines.filter((_, i) => i !== idx) }));
  const { getRowProps: getTaxInvoiceRowProps } = useDraggableRows(
    form.lines,
    (next) => setForm(prev => ({ ...prev, lines: next })),
  );

  const computeTotals = () => {
    let subtotal = 0, totalDiscount = 0, totalGst = 0;
    form.lines.forEach(l => {
      const qty = parseFloat(l.quantity) || 0;
      const rate = parseFloat(l.rate) || 0;
      const gross = qty * rate;
      const disc = gross * (parseFloat(l.discount_pct) || 0) / 100;
      const basic = gross - disc;
      const gst = basic * (parseFloat(l.gst_rate) || 0) / 100;
      subtotal += basic;
      totalDiscount += disc;
      totalGst += gst;
    });
    return { subtotal, totalDiscount, totalGst, grandTotal: subtotal + totalGst };
  };

  const totals = computeTotals();

  const saveInvoice = async () => {
    if (!form.customer_name.trim()) { alert('Customer is required'); return; }
    if (!form.lines.length || form.lines.every(l => !l.quantity || !l.rate)) { alert('At least one valid line is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        invoice_date: form.invoice_date ? new Date(form.invoice_date).toISOString() : null,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      };
      if (editingTI) {
        // EDIT mode — PUT against existing
        await api.put(`/api/crm/tax-invoices/${editingTI.id}`, {
          lines: payload.lines,
          notes: payload.notes,
          terms: payload.terms,
          due_date: payload.due_date,
          place_of_supply: payload.place_of_supply,
          billing_address: payload.billing_address,
          shipping_address: payload.shipping_address,
          customer_po_number: payload.customer_po_number,
          currency: payload.currency,
        });
      } else {
        await api.post('/api/crm/tax-invoices', payload);
      }
      setDialog(false);
      setEditingTI(null);
      setForm(emptyForm);
      load(); onRefresh();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to save tax invoice');
    } finally { setSaving(false); }
  };

  const delInvoice = async (t) => {
    try { await api.delete(`/api/crm/tax-invoices/${t.id}`); setDeleteConfirm({ open: false, invoice: null }); load(); onRefresh(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const statusChange = async (t, status) => {
    try { await api.put(`/api/crm/tax-invoices/${t.id}`, { status }); load(); onRefresh(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const filtered = list.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [t.invoice_no, t.customer_name, t.proforma?.proforma_no, t.sales_order?.order_number, t.customer_po_number].some(v => (v || '').toLowerCase().includes(q));
  });

  const totalIssued = filtered.filter(t => t.status === 'issued').reduce((a, t) => a + (t.grand_total || 0), 0);
  const totalPaid = filtered.filter(t => t.status === 'paid').reduce((a, t) => a + (t.grand_total || 0), 0);

  const printInvoice = (t) => printInvoiceDoc(t, { kind: 'tax_invoice', title: 'TAX INVOICE', numberKey: 'invoice_no', company: companySettings, user });
  // Preview opens the rendered invoice in a new tab with an in-window action
  // bar so the user can visually verify the layout before triggering
  // print / Save-as-PDF. Skip-able by going straight to the Printer icon.
  const previewInvoice = (t) => printInvoiceDoc(t, { kind: 'tax_invoice', title: 'TAX INVOICE', numberKey: 'invoice_no', company: companySettings, user, preview: true });

  // ============== Tally XML export ==============
  // Mirrors the PI flow: single-invoice icon + bulk checkbox selection.
  // Backend converts each Tax Invoice into a Tally Sales Voucher (customer
  // ledger debit, Sales Account credit, GST output credit).
  const [selectedIds, setSelectedIds] = useState([]);
  const toggleSelected = (id) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const allChecked = filtered.length > 0 && filtered.every(t => selectedIds.includes(t.id));
  const toggleSelectAll = () => setSelectedIds(allChecked ? [] : filtered.map(t => t.id));

  const triggerDownload = (xml, filename) => {
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadTallyXML = async (t) => {
    try {
      const res = await api.get(`/api/crm/tax-invoices/${t.id}/tally-xml`, { responseType: 'text' });
      triggerDownload(typeof res.data === 'string' ? res.data : String(res.data || ''), `tally_${t.invoice_no || t.id}.xml`);
    } catch (e) {
      alert(e.response?.data?.detail || e.message || 'Failed to generate Tally XML');
    }
  };

  const downloadTallyXMLBulk = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await api.post('/api/crm/tax-invoices/tally-xml-bulk', { invoice_ids: selectedIds }, { responseType: 'text' });
      triggerDownload(typeof res.data === 'string' ? res.data : String(res.data || ''), `tally_tax_invoices_${new Date().toISOString().slice(0, 10)}_${selectedIds.length}.xml`);
    } catch (e) {
      alert(e.response?.data?.detail || e.message || 'Failed to generate bulk Tally XML');
    }
  };

  return (
    <div className="space-y-4" data-testid="tax-invoices-panel">
      <div className="flex gap-3 flex-wrap items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <div className="border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[150px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#1E429F]">Issued</div>
            <div className="text-lg font-semibold mono">{filtered.filter(t => t.status === 'issued').length} · {formatCurrency(totalIssued)}</div>
          </div>
          <div className="border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[150px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#03543F]">Paid</div>
            <div className="text-lg font-semibold mono">{filtered.filter(t => t.status === 'paid').length} · {formatCurrency(totalPaid)}</div>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={downloadTallyXMLBulk} disabled={selectedIds.length === 0} className="btn-secondary flex items-center gap-1 text-sm disabled:opacity-50" title={selectedIds.length === 0 ? 'Tick at least one invoice to enable bulk export' : `Download Tally XML for ${selectedIds.length} selected invoice(s)`} data-testid="tally-bulk-export-ti-btn">
              <Download className="w-4 h-4" /> Tally XML ({selectedIds.length})
            </button>
            <button onClick={() => openDialog(null)} className="btn-primary flex items-center gap-1 text-sm" data-testid="new-tax-invoice-btn">
              <Plus className="w-4 h-4" /> New Tax Invoice
            </button>
          </div>
        )}
      </div>
      <div className="card-flat overflow-hidden">
        <table className="w-full data-table" data-testid="tax-invoices-table">
          <thead><tr>
            <th className="w-8 text-center">
              <input type="checkbox" checked={allChecked} onChange={toggleSelectAll} data-testid="tally-select-all-ti" title="Select all (current filter)" />
            </th>
            <th>Invoice #</th><th>Customer</th><th>Source</th><th>Date</th><th>Place of Supply</th><th>Subtotal</th><th>GST</th><th>Grand Total</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={11} className="text-center py-6 text-sm text-[#6B7280]">No Tax Invoices yet. Click "New Tax Invoice" to create one.</td></tr>}
            {filtered.map(t => {
              const statusData = TAX_INVOICE_STATUSES.find(s => s.key === t.status);
              const srcChip = t.sales_order?.order_number
                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E1EFFE] text-[#1E429F] mono">SO: {t.sales_order.order_number}</span>
                : t.customer_po_number
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] mono">PO: {t.customer_po_number}</span>
                  : t.proforma?.proforma_no
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FCE7F3] text-[#9D174D] mono">PI: {t.proforma.proforma_no}</span>
                    : <span className="text-[10px] text-[#9CA3AF]">Manual</span>;
              return (
                <tr key={t.id} data-testid={`tax-invoice-row-${t.id}`}>
                  <td className="text-center">
                    <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelected(t.id)} data-testid={`tally-select-ti-${t.id}`} />
                  </td>
                  <td className="mono font-medium">
                    {t.invoice_no}
                    {t.packing_list_no && (
                      <div className="text-[9px] font-semibold text-[#03543F] bg-[#DEF7EC] inline-block px-1.5 py-0.5 rounded mt-0.5" data-testid={`tax-invoice-pl-badge-${t.id}`}>
                        <Package2 className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />Packing List Created · {t.packing_list_no}
                      </div>
                    )}
                  </td>
                  <td><div className="font-medium text-[#1D3557]">{t.customer_name}</div></td>
                  <td>{srcChip}</td>
                  <td className="text-xs">{t.invoice_date ? new Date(t.invoice_date).toLocaleDateString('en-IN') : '-'}</td>
                  <td className="text-xs mono">{t.place_of_supply || '—'}{t.is_inter_state && <span className="ml-1 text-[10px] text-[#9B1C1C]">(IGST)</span>}</td>
                  <td className="mono text-sm">{formatCurrency(t.subtotal)}</td>
                  <td className="text-xs mono">{t.is_inter_state ? `IGST ${formatCurrency(t.igst)}` : `${formatCurrency(t.cgst)}+${formatCurrency(t.sgst)}`}</td>
                  <td className="mono font-semibold text-sm">{formatCurrency(t.grand_total)}</td>
                  <td>
                    {canEdit ? (
                      <Select value={t.status || 'draft'} onValueChange={(v) => statusChange(t, v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{TAX_INVOICE_STATUSES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <span className={`status-badge ${statusData?.color || ''}`}>{statusData?.label || t.status}</span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-0.5">
                      <button onClick={() => previewInvoice(t)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Preview before print" data-testid={`tax-invoice-preview-${t.id}`}><Eye className="w-4 h-4" /></button>
                      <button onClick={() => printInvoice(t)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Print / Save as PDF" data-testid={`tax-invoice-print-${t.id}`}><Printer className="w-4 h-4" /></button>
                      <button onClick={() => downloadTallyXML(t)} className="p-1.5 text-[#1D3557] hover:bg-[#E1EFFE] rounded" title="Download Tally XML (Sales voucher for Tally import)" data-testid={`tally-ti-${t.id}`}><Download className="w-4 h-4" /></button>
                      <button onClick={() => setWaShare({ open: true, doc: t })} className="p-1.5 text-[#25D366] hover:bg-[#DCFCE7] rounded" title="Share on WhatsApp" data-testid={`tax-invoice-wa-${t.id}`}><MessageSquare className="w-4 h-4" /></button>
                      {canEdit && ['draft', 'issued'].includes(t.status) && (
                        <button onClick={() => openDialog(t)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Edit" data-testid={`tax-invoice-edit-${t.id}`}><Edit2 className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => setPackingDialog({ open: true, invoice: t })} className={`p-1.5 rounded ${t.packing_list_no ? 'text-[#9CA3AF] hover:bg-[#F3F4F6] cursor-help' : 'text-[#92400E] hover:bg-[#FEF3C7]'}`} title={t.packing_list_no ? `Packing List ${t.packing_list_no} already exists. Delete it from the Packing Lists tab to regenerate.` : 'Generate Packing List'} data-testid={`tax-invoice-packing-${t.id}`}><Package2 className="w-4 h-4" /></button>
                      {canEdit && t.status === 'draft' && (
                        <button onClick={() => setDeleteConfirm({ open: true, invoice: t })} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`tax-invoice-delete-${t.id}`}><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={dialog} onOpenChange={(o) => { setDialog(o); if (!o) { setForm(emptyForm); setEditingTI(null); } }}>
        <DialogContent className="!max-w-[1400px] w-[95vw] max-h-[90vh] overflow-y-auto" data-testid="tax-invoice-dialog">
          <DialogHeader><DialogTitle className="font-[Chivo]">{editingTI ? `Edit Tax Invoice · ${editingTI.invoice_no}` : 'New Tax Invoice'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Source type tabs */}
            <div className="flex gap-2 border-b border-[#E5E7EB] pb-2">
              {[
                { k: 'sales_order', label: 'From Sales Order' },
                { k: 'manual', label: 'Manual Entry' },
              ].map(s => (
                <button key={s.k}
                  onClick={() => { setSourceType(s.k); setForm(prev => ({ ...prev, sales_order_id: '', customer_po_number: '' })); setSelectedSO(''); }}
                  className={`px-3 py-1.5 text-sm rounded-sm border ${sourceType === s.k ? 'bg-[#1D3557] text-white border-[#1D3557]' : 'bg-white text-[#4B5563] border-[#D1D5DB]'}`}
                  data-testid={`ti-source-${s.k}`}>{s.label}</button>
              ))}
            </div>

            {/* Source selector */}
            {sourceType === 'sales_order' && (
              <div>
                <label className="text-sm font-medium text-[#374151]">Sales Order *</label>
                <Select value={selectedSO} onValueChange={applySO}>
                  <SelectTrigger data-testid="ti-so-select"><SelectValue placeholder="Select a confirmed Sales Order..." /></SelectTrigger>
                  <SelectContent>
                    {salesOrders.length === 0 && <div className="p-3 text-xs text-[#6B7280]">No confirmed Sales Orders available.</div>}
                    {salesOrders.map(so => {
                      const c = customers.find(x => x.id === so.customer_id);
                      return <SelectItem key={so.id} value={so.id}>{so.order_number} — {c?.name || 'No customer'} · {so.lines?.length || 1} line(s)</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-[#6B7280] mt-1">Line items + customer + rates will be auto-populated from the SO.</p>
              </div>
            )}
            {sourceType === 'manual' && (
              <div>
                <label className="text-sm font-medium text-[#374151]">Customer *</label>
                <SearchableSelect
                  options={customers}
                  value={form.customer_id}
                  onChange={applyCustomer}
                  getLabel={(c) => c.name || ''}
                  getSecondary={(c) => c.customer_code || ''}
                  matchFields={['name', 'customer_code', 'phone', 'email', 'gstin']}
                  placeholder="Type customer code / name / GSTIN…"
                  testId="ti-customer-select"
                />
              </div>
            )}

            {/* Common fields — top row (no Place of Supply here) */}
            <div className="grid grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-[#4B5563]">Invoice Date</label>
                <input type="date" className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-sm" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} data-testid="ti-invoice-date" />
              </div>
              <div>
                <label className="text-xs text-[#4B5563]">Due Date</label>
                <input type="date" className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-sm" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} data-testid="ti-due-date" />
              </div>
              <div>
                <label className="text-xs text-[#4B5563]">Customer PO Ref <span className="text-[#9CA3AF]">(optional)</span></label>
                <input type="text" className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-sm" placeholder="optional" value={form.customer_po_number} onChange={e => setForm({ ...form, customer_po_number: e.target.value })} data-testid="ti-po-ref" />
              </div>
              <div>
                <label className="text-xs text-[#4B5563]">Ship From Store <span className="text-[10px] text-[#9CA3AF]">(stock deducts here)</span></label>
                <select className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-sm" value={form.ship_from_warehouse_id || ''} onChange={e => setForm({ ...form, ship_from_warehouse_id: e.target.value })} data-testid="ti-ship-from-warehouse">
                  <option value="">— Select warehouse —</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.code ? `${w.code} · ` : ''}{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#4B5563]">Currency <span className="text-[10px] text-[#9CA3AF]">(non-INR ⇒ no GST)</span></label>
                <select className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-sm" value={form.currency || 'INR'} onChange={e => setForm({ ...form, currency: e.target.value })} data-testid="ti-currency">
                  <option value="INR">INR — ₹</option>
                  <option value="USD">USD — $</option>
                  <option value="EUR">EUR — €</option>
                  <option value="GBP">GBP — £</option>
                  <option value="AED">AED — د.إ</option>
                </select>
              </div>
            </div>

            {/* Address */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#4B5563]">Billing Address <span className="text-[10px] text-[#9CA3AF]">(includes state, pin & GSTIN)</span></label>
                <textarea className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-xs mono" rows={4} value={form.billing_address} onChange={e => setForm({ ...form, billing_address: e.target.value })} data-testid="ti-billing-addr" />
              </div>
              <div>
                <label className="text-xs text-[#4B5563]">Shipping Address <span className="text-[10px] text-[#9CA3AF]">(edit only if different from billing)</span></label>
                <textarea className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-xs mono" rows={4} value={form.shipping_address} onChange={e => setForm({ ...form, shipping_address: e.target.value })} data-testid="ti-shipping-addr" />
              </div>
            </div>

            {/* Place of Supply — sits below the address blocks since it
                follows from the buyer's state. Carries both code and name
                (e.g. "27 - Maharashtra") to satisfy GST display norms. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#4B5563]">Place of Supply <span className="text-[10px] text-[#9CA3AF]">(GST state — auto-filled from customer)</span></label>
                <input type="text" className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-sm" placeholder="e.g. 27 - Maharashtra" value={form.place_of_supply} onChange={e => setForm({ ...form, place_of_supply: e.target.value })} data-testid="ti-pos" />
              </div>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-[#374151]">Line Items</label>
                <button type="button" onClick={addLine} className="text-xs text-[#1D3557] flex items-center gap-1" data-testid="ti-add-line"><Plus className="w-3 h-3" /> Add Line</button>
              </div>
              <div className="border border-[#E5E7EB] rounded-sm overflow-x-auto">
                <table className="line-items-grid" data-testid="ti-lines-table">
                  <thead><tr>
                    <th className="row-num">#</th>
                    <th style={{ minWidth: '340px' }}>Item &amp; Description</th>
                    <th style={{ width: '90px', minWidth: '90px' }}>HSN</th>
                    <th style={{ width: '70px', textAlign: 'right' }}>Qty</th>
                    <th style={{ width: '60px' }}>UOM</th>
                    <th style={{ width: '140px', minWidth: '140px', textAlign: 'right' }}>Rate ({CURRENCY_SYMBOLS[(form.currency || 'INR').toUpperCase()] || '₹'})</th>
                    <th style={{ width: '60px', textAlign: 'right' }}>Disc%</th>
                    <th style={{ width: '60px', textAlign: 'right' }}>GST%</th>
                    <th style={{ width: '140px', minWidth: '140px', textAlign: 'right' }}>Amount</th>
                    <th className="remove-cell"></th>
                  </tr></thead>
                  <tbody>
                    {form.lines.map((l, i) => {
                      const amount = ((parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0)) * (1 - (parseFloat(l.discount_pct) || 0) / 100);
                      return (
                        <tr key={i} data-testid={`ti-line-${i}`} {...getTaxInvoiceRowProps(i)}>
                          <td className="row-num drag-handle" title="Drag to reorder">{i + 1}</td>
                          <td>
                            <div className="px-1 py-1 space-y-1">
                              <SearchableItemSelect
                                items={items}
                                value={l.item_id}
                                onChange={(v) => applyItemToLine(i, v)}
                                placeholder="Type part no / name…"
                                showCategory={false}
                                testId={`ti-line-item-${i}`}
                              />
                              {/* Variant picker — appears if the selected item is a PARENT
                                  (has active variant children). User picks the variant and
                                  the line's item_id swaps to that variant's id. Also shows
                                  the picked variant's current_stock as a small badge. */}
                              {(() => {
                                if (!l.item_id) return null;
                                const sel = items.find(x => x.id === l.item_id);
                                if (!sel) return null;
                                // Find children whose parent_item_id === l.item_id OR (if line currently
                                // points at a variant child) parent_item_id === sel.parent_item_id.
                                const parentId = sel.is_variant ? sel.parent_item_id : sel.id;
                                const variantChildren = items.filter(x =>
                                  x.is_variant && x.parent_item_id === parentId && x.is_active !== false
                                );
                                if (variantChildren.length === 0) return null;
                                const currentVariantId = sel.is_variant ? sel.id : '';
                                const picked = items.find(x => x.id === currentVariantId);
                                return (
                                  <div className="flex items-center gap-1 mt-1" data-testid={`ti-line-variant-block-${i}`}>
                                    <select
                                      className="grid-input flex-1 text-xs"
                                      value={currentVariantId}
                                      onChange={(e) => {
                                        const vid = e.target.value;
                                        if (!vid) {
                                          // Reset to parent
                                          applyItemToLine(i, parentId);
                                        } else {
                                          applyItemToLine(i, vid);
                                        }
                                      }}
                                      data-testid={`ti-line-variant-select-${i}`}
                                    >
                                      <option value="">Pick a variant…</option>
                                      {variantChildren.map(v => {
                                        const suffix = (v.part_number || '').startsWith((items.find(p => p.id === parentId)?.part_number || '') + '-')
                                          ? v.part_number.slice((items.find(p => p.id === parentId)?.part_number || '').length + 1)
                                          : v.part_number;
                                        return (
                                          <option key={v.id} value={v.id}>
                                            {suffix} — stock: {v.current_stock ?? 0} {v.unit_of_measure || ''}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    {picked && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#DEF7EC] text-[#03543F] mono whitespace-nowrap" data-testid={`ti-line-variant-stock-${i}`}>
                                        Stock: {picked.current_stock ?? 0} {picked.unit_of_measure || ''}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              <textarea rows={2} className="grid-textarea" placeholder="Description (auto-filled — editable)" value={l.description} onChange={e => updateLine(i, { description: e.target.value })} data-testid={`ti-line-desc-${i}`} />
                            </div>
                          </td>
                          <td><input type="text" className="grid-input mono" value={l.hsn_code} onChange={e => updateLine(i, { hsn_code: e.target.value })} /></td>
                          <td><input type="number" step="0.01" className="grid-input mono num" value={l.quantity} onChange={e => updateLine(i, { quantity: e.target.value })} data-testid={`ti-line-qty-${i}`} /></td>
                          <td><input type="text" className="grid-input" value={l.uom} onChange={e => updateLine(i, { uom: e.target.value })} /></td>
                          {/* Rate — accepts commas; stripped on store so totals math stays numeric.
                              Indian grouping (1,17,300) is applied on blur via Intl.NumberFormat. */}
                          <td><input
                            type="text"
                            inputMode="decimal"
                            className="grid-input mono num"
                            value={l._rateFormatted ?? (l.rate === '' || l.rate === undefined || l.rate === null ? '' : Number(l.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 }))}
                            onChange={e => {
                              const raw = e.target.value.replace(/,/g, '');
                              if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                                updateLine(i, { rate: raw, _rateFormatted: e.target.value });
                              }
                            }}
                            onBlur={() => {
                              const v = parseFloat(l.rate);
                              updateLine(i, { rate: isNaN(v) ? '' : v, _rateFormatted: undefined });
                            }}
                            data-testid={`ti-line-rate-${i}`}
                          /></td>
                          <td><input type="number" step="0.01" className="grid-input mono num" value={l.discount_pct} onChange={e => updateLine(i, { discount_pct: e.target.value })} data-testid={`ti-line-disc-${i}`} /></td>
                          <td><input type="number" step="0.01" className="grid-input mono num" value={l.gst_rate} onChange={e => updateLine(i, { gst_rate: e.target.value })} data-testid={`ti-line-gst-${i}`} /></td>
                          <td className="static-cell amount">{formatCurrency(amount, form.currency)}</td>
                          <td className="remove-cell">
                            <button type="button" onClick={() => removeLine(i)} className="text-[#9B1C1C] hover:bg-[#FDE8E8] rounded p-1" data-testid={`ti-line-remove-${i}`} title="Remove line"><X className="w-3 h-3" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="add-line-cell" colSpan={10}>
                        <button type="button" onClick={addLine} data-testid="ti-add-line-footer">
                          <Plus className="w-3 h-3" /> Add Line
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 border border-[#E5E7EB] rounded-sm p-3 bg-[#F9FAFB] text-sm">
                <div className="flex justify-between"><span className="text-[#4B5563]">Subtotal</span><span className="mono">{formatCurrency(totals.subtotal, form.currency)}</span></div>
                {totals.totalDiscount > 0 && <div className="flex justify-between"><span className="text-[#4B5563]">Discount</span><span className="mono">-{formatCurrency(totals.totalDiscount, form.currency)}</span></div>}
                {(form.currency || 'INR') === 'INR' && (
                  <div className="flex justify-between"><span className="text-[#4B5563]">GST</span><span className="mono">{formatCurrency(totals.totalGst, form.currency)}</span></div>
                )}
                <div className="flex justify-between border-t border-[#E5E7EB] mt-1 pt-1 font-semibold"><span>Grand Total</span><span className="mono text-[#1D3557]">{formatCurrency((form.currency || 'INR') === 'INR' ? totals.grandTotal : totals.subtotal, form.currency)}</span></div>
                {(form.currency || 'INR') !== 'INR' && (
                  <div className="text-[10px] text-[#6B7280] italic mt-1">Export/Import — GST not applicable. Currency: {form.currency}</div>
                )}
              </div>
            </div>

            {/* Notes + T&C */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#4B5563]">Notes</label>
                <textarea className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-xs" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} data-testid="ti-notes" />
              </div>
              <div>
                <label className="text-xs text-[#4B5563]">Terms &amp; Conditions</label>
                <textarea className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-xs" rows={3} value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} data-testid="ti-terms" />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-3">
              <button className="btn-secondary" onClick={() => setDialog(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveInvoice} disabled={saving} data-testid="ti-save-btn">
                {saving ? 'Saving...' : (editingTI ? 'Save Changes' : 'Create Tax Invoice')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, invoice: null })}
        title="Delete Tax Invoice?"
        message={<>This will permanently delete <strong>{deleteConfirm.invoice?.invoice_no}</strong>. Only draft invoices can be deleted.</>}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => delInvoice(deleteConfirm.invoice)}
        testidPrefix="ti-delete-confirm"
      />

      <PackingListDialog
        open={packingDialog.open}
        invoice={packingDialog.invoice}
        onClose={() => setPackingDialog({ open: false, invoice: null })}
        onCreated={() => { setPackingDialog({ open: false, invoice: null }); onRefresh(); }}
      />

      <WhatsAppShareDialog
        open={waShare.open}
        onOpenChange={(o) => setWaShare({ open: o, doc: o ? waShare.doc : null })}
        doc={waShare.doc}
        kind="tax_invoice"
        company={companySettings}
        user={user}
      />
    </div>
  );
}

/* ============================================================================
 *  NUMBER SERIES PANEL (Admin settings)
 * ========================================================================= */
const DOC_TYPE_LABELS = {
  quotation: 'Quotation',
  proforma: 'Proforma Invoice',
  tax_invoice: 'Tax Invoice',
  sales_order: 'Sales Order',
  purchase_invoice: 'Purchase Invoice',
};

function NumberSeriesPanel({ canEdit }) {
  const [list, setList] = useState([]);
  const [saving, setSaving] = useState(null);
  const load = useCallback(async () => {
    try { const r = await api.get('/api/crm/number-series'); setList(r.data || []); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = (idx, patch) => setList(arr => arr.map((s, i) => i === idx ? { ...s, ...patch } : s));

  const save = async (row) => {
    setSaving(row.doc_type);
    try {
      await api.put(`/api/crm/number-series/${row.doc_type}`, {
        prefix: row.prefix, padding: parseInt(row.padding) || 6, next_number: parseInt(row.next_number) || 1, reset_yearly: !!row.reset_yearly,
      });
      await load();
    } catch (e) { alert(e.response?.data?.detail || 'Failed'); }
    finally { setSaving(null); }
  };

  if (!canEdit) return <div className="text-sm text-[#9B1C1C]">Admin privilege required to manage number series.</div>;

  return (
    <div className="space-y-4" data-testid="number-series-panel">
      <div className="bg-[#FEF3C7] border border-[#92400E] rounded-sm p-3 text-xs">
        <div className="font-semibold mb-1">Document Number Series</div>
        Configure the prefix, padding and next counter for each document type. Enable <strong>Reset Yearly</strong> to append the Indian Fiscal Year (FY26-27) and restart the counter every April.
      </div>
      <div className="card-flat overflow-hidden">
        <table className="w-full data-table" data-testid="number-series-table">
          <thead><tr><th>Document</th><th>Prefix</th><th>Padding</th><th>Next #</th><th>Reset Yearly</th><th>Preview</th><th>Action</th></tr></thead>
          <tbody>
            {list.map((s, idx) => {
              const fy = (() => {
                const d = new Date();
                const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
                return `FY${String(y).slice(-2)}-${String(y + 1).slice(-2)}`;
              })();
              const preview = `${s.prefix || ''}${s.reset_yearly ? fy + '/' : ''}${String(s.next_number || 1).padStart(parseInt(s.padding) || 6, '0')}`;
              return (
                <tr key={s.doc_type} data-testid={`number-series-row-${s.doc_type}`}>
                  <td className="font-medium">{DOC_TYPE_LABELS[s.doc_type] || s.doc_type}</td>
                  <td><input className="input-field mono h-7 text-xs w-24" value={s.prefix || ''} onChange={e => update(idx, { prefix: e.target.value })} data-testid={`number-series-prefix-${s.doc_type}`} /></td>
                  <td><input type="number" min="1" max="10" className="input-field mono h-7 text-xs w-16" value={s.padding || 6} onChange={e => update(idx, { padding: e.target.value })} /></td>
                  <td><input type="number" min="1" className="input-field mono h-7 text-xs w-24" value={s.next_number || 1} onChange={e => update(idx, { next_number: e.target.value })} data-testid={`number-series-next-${s.doc_type}`} /></td>
                  <td>
                    <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={!!s.reset_yearly} onChange={e => update(idx, { reset_yearly: e.target.checked })} data-testid={`number-series-yearly-${s.doc_type}`} />
                      {s.reset_yearly ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td className="mono text-xs text-[#1E429F]">{preview}</td>
                  <td>
                    <button className="btn-primary text-xs py-1 px-2" onClick={() => save(s)} disabled={saving === s.doc_type} data-testid={`number-series-save-${s.doc_type}`}>{saving === s.doc_type ? 'Saving...' : 'Save'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================================
 *  PACKING LIST — Dialog to generate from a Tax Invoice + list panel.
 * ========================================================================= */
function PackingListDialog({ open, invoice, onClose, onCreated }) {
  const { user } = useAuth();
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [dispatchDate, setDispatchDate] = useState('');
  const [packedBy, setPackedBy] = useState('');

  // Fetch preview whenever dialog opens or expansion toggles.
  const refreshPreview = useCallback(async (expandMap = {}) => {
    if (!invoice?.id) return;
    setLoading(true);
    try {
      const r = await api.post(`/api/crm/packing-lists/preview/${invoice.id}`, { expand: expandMap });
      setLines(r.data || []);
    } catch (e) { alert(e.response?.data?.detail || 'Failed to load preview'); }
    finally { setLoading(false); }
  }, [invoice]);

  useEffect(() => {
    if (open && invoice) {
      setNotes('');
      setDispatchDate('');
      setPackedBy(user?.name || '');
      refreshPreview({});
    }
  }, [open, invoice, user, refreshPreview]);

  const toggleExpand = (idx, value) => {
    const next = lines.map(l => ({ ...l, expanded: l.source_line_index === idx ? value : l.expanded }));
    setLines(next);
    const expandMap = {};
    next.forEach(l => { expandMap[String(l.source_line_index)] = l.expanded; });
    refreshPreview(expandMap);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        tax_invoice_id: invoice.id,
        lines: lines.map(l => ({
          source_line_index: l.source_line_index,
          item_id: l.item_id || '',
          item_name: l.item_name,
          description: l.description || '',
          uom: l.uom || 'Nos',
          invoice_qty: l.invoice_qty,
          expanded: l.expanded,
          components: l.components || [],
        })),
        notes,
        packed_by: packedBy,
        packed_by_user_id: user?.id || '',
        dispatch_date: dispatchDate ? new Date(dispatchDate).toISOString() : null,
      };
      await api.post('/api/crm/packing-lists', payload);
      onCreated();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to save packing list'); }
    finally { setSaving(false); }
  };

  if (!invoice) return null;
  const existingPL = invoice.packing_list_no;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="packing-list-dialog">
        <DialogHeader>
          <DialogTitle className="font-[Chivo]">Generate Packing List · {invoice.invoice_no}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {existingPL && (
            <div className="border border-[#FCD34D] bg-[#FEF3C7] rounded-sm p-3 text-xs text-[#78350F]" data-testid="pl-existing-warning">
              <strong>A Packing List already exists for this invoice: {existingPL}.</strong><br />
              Generating a new one is blocked to avoid duplicate dispatch documentation. To regenerate, first delete the existing Packing List from the Packing Lists tab (CRM → Marketing → Packing Lists or Stores → Packing Lists).
            </div>
          )}
          <div className="text-xs text-[#4B5563]">
            Tick the <strong>Expand to BOM</strong> box on any FG line to break it down into its <strong>first-level components</strong> with calculated quantities. Unticked lines print as-is (FG + qty).
          </div>

          <div className="border border-[#E5E7EB] rounded-sm overflow-hidden">
            <table className="w-full text-xs" data-testid="packing-list-preview-table">
              <thead className="bg-[#F3F4F6]"><tr>
                <th className="px-2 py-2 text-left w-8">#</th>
                <th className="px-2 py-2 text-left">Invoice Item</th>
                <th className="px-2 py-2 text-right w-20">Qty</th>
                <th className="px-2 py-2 text-left w-16">UOM</th>
                <th className="px-2 py-2 text-center w-32">Expand to BOM</th>
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="text-center py-4 text-[#6B7280]">Loading…</td></tr>}
                {!loading && lines.map(l => (
                  <React.Fragment key={l.source_line_index}>
                    <tr className="bg-white border-t border-[#E5E7EB]" data-testid={`pl-row-${l.source_line_index}`}>
                      <td className="px-2 py-2 text-[#6B7280] align-top">{l.source_line_index + 1}</td>
                      <td className="px-2 py-2 align-top">
                        <div className="font-semibold text-[#0F172A]">{l.item_name || '-'}</div>
                        {l.description && l.description !== l.item_name && <div className="text-[11px] text-[#64748B] italic">{l.description}</div>}
                        {!l.has_bom && <div className="text-[10px] text-[#9CA3AF] mt-1">No BOM available — printed as FG</div>}
                      </td>
                      <td className="px-2 py-2 text-right mono align-top">{Number(l.invoice_qty).toFixed(2)}</td>
                      <td className="px-2 py-2 text-[#4B5563] align-top">{l.uom}</td>
                      <td className="px-2 py-2 text-center align-top">
                        <label className={`inline-flex items-center gap-1.5 cursor-pointer ${!l.has_bom ? 'opacity-40 cursor-not-allowed' : ''}`}>
                          <input type="checkbox" checked={!!l.expanded} disabled={!l.has_bom} onChange={e => toggleExpand(l.source_line_index, e.target.checked)} className="w-4 h-4 accent-[#1D3557]" data-testid={`pl-expand-${l.source_line_index}`} />
                          <span className="text-xs">{l.expanded ? 'Components' : 'FG as-is'}</span>
                        </label>
                      </td>
                    </tr>
                    {l.expanded && (l.components || []).map((c, ci) => (
                      <tr key={`${l.source_line_index}-c-${ci}`} className="bg-[#F9FAFB]" data-testid={`pl-comp-${l.source_line_index}-${ci}`}>
                        <td></td>
                        <td className="px-2 py-1.5 text-[11px] text-[#334155] pl-6">
                          <span className="text-[#64748B]">↳</span> {c.part_number ? <span className="mono">{c.part_number}</span> : null} {c.name}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-[11px] text-[#0F172A]">{Number(c.total_qty).toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-[11px] text-[#64748B]">{c.uom}</td>
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                {!loading && lines.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-[#9CA3AF] italic">No line items in this invoice.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[#4B5563]">Dispatch Date</label>
              <input type="date" className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-sm" value={dispatchDate} onChange={e => setDispatchDate(e.target.value)} data-testid="pl-dispatch-date" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[#4B5563]">Packed By <span className="text-[10px] text-[#9CA3AF]">(defaults to you — signature from your profile will print)</span></label>
              <input type="text" className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-sm" value={packedBy} onChange={e => setPackedBy(e.target.value)} data-testid="pl-packed-by" />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#4B5563]">Notes / Special Instructions</label>
            <textarea rows={2} className="w-full mt-1 px-2 py-1.5 border border-[#D1D5DB] rounded-sm text-xs" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Handle with care, Do not stack" data-testid="pl-notes" />
          </div>

          <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-3">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || loading || lines.length === 0 || !!existingPL} title={existingPL ? `Blocked — Packing List ${existingPL} already exists` : ''} data-testid="pl-save-btn">
              {saving ? 'Generating…' : (existingPL ? 'Already Generated' : 'Generate Packing List')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PACKING_LIST_STATUSES = [
  { key: 'draft', label: 'Draft', color: 'bg-[#F3F4F6] text-[#4B5563]' },
  { key: 'packed', label: 'Packed', color: 'bg-[#E1EFFE] text-[#1E429F]' },
  { key: 'dispatched', label: 'Dispatched', color: 'bg-[#DEF7EC] text-[#03543F]' },
  { key: 'received', label: 'Received', color: 'bg-[#FCE7F3] text-[#9D174D]' },
];

export function PackingListsPanel({ search = '', canEdit = true }) {
  const { user } = useAuth();
  const { companySettings } = useCompanySettings();
  const [list, setList] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, pl: null });
  const [waShare, setWaShare] = useState({ open: false, doc: null });

  const load = useCallback(async () => {
    try { const r = await api.get('/api/crm/packing-lists'); setList(r.data || []); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const statusChange = async (pl, status) => {
    try { await api.put(`/api/crm/packing-lists/${pl.id}`, { status }); load(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const del = async (pl) => {
    try { await api.delete(`/api/crm/packing-lists/${pl.id}`); setDeleteConfirm({ open: false, pl: null }); load(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const printPL = (pl) => printPackingListDoc(pl, companySettings);

  const filtered = list.filter(pl => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [pl.packing_list_no, pl.customer_name, pl.tax_invoice_no].some(v => (v || '').toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4" data-testid="packing-lists-panel">
      <div className="card-flat overflow-hidden">
        <table className="w-full data-table" data-testid="packing-lists-table">
          <thead><tr>
            <th>PL #</th><th>Tax Invoice</th><th>Customer</th><th>Dispatch Date</th><th>Lines</th><th>Packed By</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-sm text-[#6B7280]">No Packing Lists yet. Open a Tax Invoice and click the Packing List icon to generate one.</td></tr>}
            {filtered.map(pl => {
              const statusData = PACKING_LIST_STATUSES.find(s => s.key === pl.status);
              return (
                <tr key={pl.id} data-testid={`pl-row-${pl.id}`}>
                  <td className="mono font-medium">{pl.packing_list_no}</td>
                  <td className="mono text-xs">{pl.tax_invoice_no || '-'}</td>
                  <td><div className="font-medium text-[#1D3557]">{pl.customer_name || '-'}</div></td>
                  <td className="text-xs">{pl.dispatch_date ? new Date(pl.dispatch_date).toLocaleDateString('en-IN') : '-'}</td>
                  <td className="text-xs">{(pl.lines || []).length}</td>
                  <td className="text-xs">{pl.packed_by_user?.name || pl.packed_by || '-'}</td>
                  <td>
                    {canEdit ? (
                      <Select value={pl.status || 'draft'} onValueChange={(v) => statusChange(pl, v)}>
                        <SelectTrigger className="h-7 text-xs" data-testid={`pl-status-${pl.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{PACKING_LIST_STATUSES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <span className={`status-badge ${statusData?.color || ''}`}>{statusData?.label || pl.status}</span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-0.5">
                      <button onClick={() => printPL(pl)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Print" data-testid={`pl-print-${pl.id}`}><Printer className="w-4 h-4" /></button>
                      <button onClick={() => setWaShare({ open: true, doc: pl })} className="p-1.5 text-[#25D366] hover:bg-[#DCFCE7] rounded" title="Share on WhatsApp" data-testid={`pl-wa-${pl.id}`}><MessageSquare className="w-4 h-4" /></button>
                      {canEdit && pl.status === 'draft' && <button onClick={() => setDeleteConfirm({ open: true, pl })} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`pl-delete-${pl.id}`}><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, pl: null })}
        title="Delete Packing List?"
        message={<>This will permanently delete <strong>{deleteConfirm.pl?.packing_list_no}</strong>.</>}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => del(deleteConfirm.pl)}
        testidPrefix="pl-delete-confirm"
      />

      <WhatsAppShareDialog
        open={waShare.open}
        onOpenChange={(o) => setWaShare({ open: o, doc: o ? waShare.doc : null })}
        doc={waShare.doc}
        kind="packing_list"
        company={companySettings}
        user={user}
      />
    </div>
  );
}

/* Packing list print — lightweight A4 renderer. */
function printPackingListDoc(pl, company) {
  const esc = (s) => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const cfg = {
    name: company?.company_name || 'Company Name',
    tagline: company?.tagline || '',
    logo_data: company?.logo_data || '',
    address: company?.address || '',
    address_line2: [company?.city, company?.state, company?.pin_code].filter(Boolean).join(', '),
    phone: company?.phone || '',
    email: company?.email || '',
    gstin: company?.gstin || '',
  };
  const accent = '#334155';
  let slNo = 0;
  const rowsHtml = (pl.lines || []).map((l) => {
    slNo += 1;
    const head = `<tr>
      <td class="sn">${slNo}</td>
      <td><div class="name">${esc(l.item_name || '-')}</div>${l.description && l.description !== l.item_name ? `<div class="desc">${esc(l.description)}</div>` : ''}${l.expanded ? '<div class="tag">↓ Expanded to BOM first-level</div>' : ''}</td>
      <td class="right mono">${Number(l.invoice_qty || 0).toFixed(2)}</td>
      <td class="center">${esc(l.uom || '')}</td>
      <td class="check"><div class="chk-box"></div></td>
    </tr>`;
    const compHtml = l.expanded ? (l.components || []).map((c) => `<tr class="comp">
      <td></td>
      <td class="comp-name">${c.part_number ? `<span class="mono">${esc(c.part_number)}</span> — ` : ''}${esc(c.name || '')}</td>
      <td class="right mono">${Number(c.total_qty || 0).toFixed(2)}</td>
      <td class="center">${esc(c.uom || '')}</td>
      <td class="check"><div class="chk-box sm"></div></td>
    </tr>`).join('') : '';
    return head + compHtml;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(pl.packing_list_no || 'Packing List')}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;margin:0;padding:0}
  .page{max-width:780px;margin:0 auto;padding:28px 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
  .brand{display:flex;gap:12px;align-items:flex-start}
  .logo-img{max-height:72px;max-width:180px;object-fit:contain}
  .logo-fb{width:60px;height:60px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px}
  .cn{font-size:17px;font-weight:800;color:#0f172a;margin:0}
  .tg{font-size:10px;color:${accent};font-style:italic}
  .addr{font-size:10px;color:#475569;line-height:1.5}
  .title{font-size:22px;font-weight:800;color:${accent};letter-spacing:2px;text-align:right;margin:0}
  .docno{font-size:12px;color:#334155;font-family:'Courier New',monospace;text-align:right;margin-top:4px}
  .meta{font-size:10px;color:#475569;text-align:right;margin-top:2px}
  .info-bar{display:grid;grid-template-columns:1fr 1fr 1fr;background:${accent};color:#fff;margin:14px 0;border-radius:2px;overflow:hidden}
  .info-bar .col{padding:8px 12px;border-right:1px solid rgba(255,255,255,0.15)}
  .info-bar .col:last-child{border-right:none}
  .info-bar .lab{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.75);margin-bottom:2px}
  .info-bar .val{font-size:12px;font-weight:700}
  .addr-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:12px 0}
  .box h4{font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;color:#0f172a;border-bottom:2px solid ${accent};padding-bottom:3px;display:inline-block}
  .box .name{font-size:13px;font-weight:700;color:#0f172a}
  .box .line{font-size:10px;color:#475569;line-height:1.5;white-space:pre-line}
  table.items{width:100%;border-collapse:collapse;margin-top:6px}
  table.items thead th{background:${accent};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;padding:8px 6px;font-weight:600}
  table.items tbody td{border-bottom:1px solid #e2e8f0;padding:8px 6px;font-size:11px;vertical-align:top}
  tr.comp td{background:#f8fafc;font-size:10px;padding:4px 6px}
  .comp-name{padding-left:24px;color:#334155}
  .sn{width:30px;text-align:center;color:#64748b;font-weight:600}
  .center{text-align:center}
  .right{text-align:right}
  .mono{font-family:'Courier New',monospace}
  .name{font-weight:700;color:#0f172a}
  .desc{font-size:10px;color:#64748b;font-style:italic;margin-top:2px}
  .tag{font-size:9px;color:${accent};text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}
  .check{width:40px;text-align:center}
  .chk-box{width:14px;height:14px;border:1.5px solid #334155;border-radius:2px;display:inline-block}
  .chk-box.sm{width:10px;height:10px;border-width:1px}
  .signatures{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:40px;padding-top:10px}
  .sig-box{border-top:1px solid #94a3b8;padding-top:4px;text-align:center}
  .sig-img{max-height:64px;max-width:180px;object-fit:contain;margin:0 auto 2px;display:block}
  .sig-name{font-size:12px;font-weight:700;color:#0f172a}
  .sig-title{font-size:10px;color:#64748b}
  .notes{margin-top:16px;padding:8px 12px;background:#f8fafc;border-left:3px solid ${accent};font-size:10px;color:#334155}
  .notes strong{color:#0f172a}
  .footer{text-align:center;margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8}
  @media print {@page {size:A4;margin:10mm} body{padding:0}}
</style></head><body>
<div class="page">
  <div class="header">
    <div class="brand">
      ${cfg.logo_data ? `<img src="${esc(cfg.logo_data)}" class="logo-img"/>` : `<div class="logo-fb">${esc((cfg.name || 'C').charAt(0).toUpperCase())}</div>`}
      <div>
        <div class="cn">${esc(cfg.name)}</div>
        ${cfg.tagline ? `<div class="tg">${esc(cfg.tagline)}</div>` : ''}
        ${cfg.address ? `<div class="addr">${esc(cfg.address)}</div>` : ''}
        ${cfg.address_line2 ? `<div class="addr">${esc(cfg.address_line2)}</div>` : ''}
        ${cfg.phone ? `<div class="addr">Phone: ${esc(cfg.phone)}${cfg.email ? ' | ' + esc(cfg.email) : ''}</div>` : ''}
        ${cfg.gstin ? `<div class="addr"><strong>GSTIN: ${esc(cfg.gstin)}</strong></div>` : ''}
      </div>
    </div>
    <div>
      <div class="title">PACKING LIST</div>
      <div class="docno">${esc(pl.packing_list_no || '')}</div>
      ${pl.tax_invoice_no ? `<div class="meta">Ref Invoice: <strong>${esc(pl.tax_invoice_no)}</strong></div>` : ''}
    </div>
  </div>

  <div class="info-bar">
    <div class="col"><div class="lab">PL No</div><div class="val">${esc(pl.packing_list_no || '-')}</div></div>
    <div class="col"><div class="lab">Dispatch Date</div><div class="val">${pl.dispatch_date ? new Date(pl.dispatch_date).toLocaleDateString('en-IN') : 'Pending'}</div></div>
    <div class="col"><div class="lab">Status</div><div class="val">${esc((pl.status || 'draft').toUpperCase())}</div></div>
  </div>

  <div class="addr-row">
    <div class="box">
      <h4>Customer</h4>
      <div class="name">${esc(pl.customer_name || '-')}</div>
      ${(() => {
        const c = pl.customer || {};
        const csp = [c.city, c.state, c.pin_code].filter(Boolean).join(', ');
        const lns = [pl.billing_address || c.address || '', csp].filter(Boolean);
        return lns.map(ln => `<div class="line">${esc(ln)}</div>`).join('');
      })()}
      ${pl.customer?.state_code ? `<div class="line"><strong>State Code:</strong> <span class="mono">${esc(pl.customer.state_code)}</span></div>` : ''}
      ${pl.customer?.gstin ? `<div class="line"><strong>GSTIN:</strong> <span class="mono">${esc(pl.customer.gstin)}</span></div>` : ''}
    </div>
    <div class="box">
      <h4>Ship To</h4>
      ${(() => {
        const c = pl.customer || {};
        const csp = [c.city, c.state, c.pin_code].filter(Boolean).join(', ');
        const lns = [pl.shipping_address || pl.billing_address || c.address || '', csp].filter(Boolean);
        return lns.length ? lns.map(ln => `<div class="line">${esc(ln)}</div>`).join('') : '<div class="line">-</div>';
      })()}
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th class="sn">Sl</th>
      <th>Item / Description</th>
      <th class="right">Qty</th>
      <th class="center">UOM</th>
      <th class="check">Packed</th>
    </tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="5" style="text-align:center;padding:20px">No items</td></tr>'}</tbody>
  </table>

  ${pl.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(pl.notes)}</div>` : ''}

  <div class="signatures">
    <div class="sig-box">
      ${pl.packed_by_user?.signature_url ? `<img src="${esc(pl.packed_by_user.signature_url)}" class="sig-img"/>` : ''}
      <div class="sig-name">${esc(pl.packed_by_user?.name || pl.packed_by || 'Store Person')}</div>
      <div class="sig-title">Packed By (Store)</div>
    </div>
    <div class="sig-box">
      <div style="height:48px"></div>
      <div class="sig-name">&nbsp;</div>
      <div class="sig-title">Received By (Customer) — Signature &amp; Date</div>
    </div>
  </div>

  <div class="footer">This is a computer-generated document. ${esc(cfg.name)}</div>
</div>
</body></html>`;
  downloadHtmlAsPdf(html, `Packing-List-${pl.packing_list_no || 'document'}.pdf`);
}

/* ============================================================================
 *  Shared printable invoice renderer (Proforma + Tax Invoice)
 * ========================================================================= */

// Build a default WhatsApp message given a doc + kind + options.
function buildWhatsAppMessage({ doc, kind, company, user, includeLink }) {
  const names = {
    quotation: ['Quotation', doc.quotation_no],
    proforma: ['Proforma Invoice', doc.proforma_no],
    tax_invoice: ['Tax Invoice', doc.invoice_no],
    packing_list: ['Packing List', doc.packing_list_no],
  };
  const [label, number] = names[kind] || ['Document', doc.id];
  const senderName = user?.name || 'our Sales Team';
  const orgName = company?.company_name || 'our company';
  const grandTotal = doc.grand_total ? ` (Amount: ₹${Number(doc.grand_total).toLocaleString('en-IN')})` : '';
  let msg = `Dear ${doc.customer_name || 'Customer'},\n\nPlease find our ${label} ${number}${grandTotal}.\n`;
  if (includeLink) {
    const slug = kind === 'tax_invoice' ? 'tax-invoice' : (kind === 'packing_list' ? 'packing-list' : kind);
    const link = `${window.location.origin}/public/${slug}/${doc.id}`;
    msg += `\nView / print: ${link}\n`;
  }
  msg += `\nBest regards,\n${senderName}\n${orgName}`;
  return msg;
}

function defaultWhatsAppPhone(doc) {
  const raw = (doc.phone || doc.customer?.phone || '').replace(/[^0-9]/g, '');
  return raw.length === 10 ? '91' + raw : raw;
}

// Open WhatsApp with a pre-drafted message. If `includeLink=true`, appends
// a public read-only URL that the recipient can tap from their phone.
// Build a WhatsApp share URL that bypasses the `api.whatsapp.com` redirect chain
// (some browsers/CSP policies block api.whatsapp.com with ERR_BLOCKED_BY_RESPONSE when
// wa.me tries to redirect there). `web.whatsapp.com/send` works on desktop AND mobile
// (mobile devices redirect to the native app automatically).
function buildWaUrl(phone, msg) {
  const num = (phone || '').replace(/[^0-9]/g, '');
  const text = encodeURIComponent(msg || '');
  if (num) return `https://web.whatsapp.com/send?phone=${num}&text=${text}`;
  return `https://web.whatsapp.com/send?text=${text}`;
}

// (Kept for legacy call sites — new UI opens WhatsAppShareDialog first.)
function openWhatsAppShare({ doc, kind, company, user, includeLink }) {
  const phone = defaultWhatsAppPhone(doc);
  const msg = buildWhatsAppMessage({ doc, kind, company, user, includeLink });
  window.open(buildWaUrl(phone, msg), '_blank', 'noopener,noreferrer');
}

function WhatsAppShareDialog({ open, onOpenChange, doc, kind, company, user }) {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [includeLink, setIncludeLink] = useState(true);

  useEffect(() => {
    if (open && doc) {
      setPhone(defaultWhatsAppPhone(doc));
      setMessage(buildWhatsAppMessage({ doc, kind, company, user, includeLink: true }));
      setIncludeLink(true);
    }
  }, [open, doc, kind, company, user]);

  // Re-build base message when includeLink toggles (only if user hasn't hand-edited yet)
  const toggleLink = (newVal) => {
    setIncludeLink(newVal);
    setMessage(buildWhatsAppMessage({ doc, kind, company, user, includeLink: newVal }));
  };

  const send = () => {
    window.open(buildWaUrl(phone, message), '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };

  if (!doc) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="whatsapp-share-dialog">
        <DialogHeader>
          <DialogTitle className="font-[Chivo]">Send via WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#374151]">Recipient Number</label>
            <input type="tel" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono" value={phone} onChange={e => setPhone(e.target.value)} placeholder="919876543210 (country-code + number, digits only)" data-testid="wa-phone-input" />
            <p className="text-[10px] text-[#6B7280] mt-1">Include country code (no +, no spaces). Indian 10-digit numbers are auto-prefixed with 91.</p>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs text-[#374151] cursor-pointer">
              <input type="checkbox" checked={includeLink} onChange={e => toggleLink(e.target.checked)} className="w-4 h-4 accent-[#25D366]" data-testid="wa-include-link" />
              <span>Include public view link in the message</span>
            </label>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#374151]">Message</label>
            <textarea rows={9} className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm text-sm font-mono" value={message} onChange={e => setMessage(e.target.value)} data-testid="wa-message-textarea" />
            <p className="text-[10px] text-[#6B7280] mt-1">Edit freely before sending. WhatsApp will open with this exact text pre-filled.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
            <button className="btn-secondary" onClick={() => onOpenChange(false)}>Cancel</button>
            <button className="btn-primary bg-[#25D366] hover:bg-[#1CA85A]" onClick={send} data-testid="wa-send-btn">
              <MessageSquare className="w-4 h-4 inline -mt-0.5 mr-1" />Open WhatsApp
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function numberToIndianWords(num, currencyCode) {
  const n = Math.round(parseFloat(num) || 0);
  const CUR_NAMES = {
    INR: 'Rupees', USD: 'Dollars', EUR: 'Euros', GBP: 'Pounds', AED: 'Dirhams',
  };
  const main = CUR_NAMES[(currencyCode || 'INR').toUpperCase()] || 'Rupees';
  if (n === 0) return `${main} Zero Only`;
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigit = (x) => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
  const threeDigit = (x) => (x > 99 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + twoDigit(x % 100) : '') : twoDigit(x));
  let x = n, parts = [];
  const crore = Math.floor(x / 10000000); x %= 10000000;
  const lakh = Math.floor(x / 100000); x %= 100000;
  const thousand = Math.floor(x / 1000); x %= 1000;
  const rest = x;
  if (crore) parts.push(threeDigit(crore) + ' Crore');
  if (lakh) parts.push(threeDigit(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigit(thousand) + ' Thousand');
  if (rest) parts.push(threeDigit(rest));
  return `${main} ` + parts.join(' ') + ' Only';
}

function printInvoiceDoc(doc, opts) {
  const esc = (s) => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const company = opts.company || {};
  const currentUser = opts.user || {};
  // Signature belongs to the DOCUMENT CREATOR (backend attaches
  // `doc.created_by_user`). If missing (e.g. pre-enrichment legacy docs), we
  // fall back to the currently logged-in user so prints still render.
  const signer = doc.created_by_user || currentUser;
  const cfg = {
    name: company.company_name || 'Company Name',
    tagline: company.tagline || '',
    logo_data: company.logo_data || '',
    address_line1: company.address || 'Company Address Line 1',
    address_line2: [company.city, company.state, company.pin_code].filter(Boolean).join(', ') || company.address_line2 || '',
    phone: company.phone || '',
    email: company.email || '',
    website: company.website || '',
    gstin: company.gstin || '',
    bank_name: company.bank_name || '',
    bank_branch: company.bank_branch || '',
    bank_account: company.bank_account || '',
    bank_ifsc: company.bank_ifsc || '',
    bank_upi: company.bank_upi || '',
  };
  const isInter = !!doc.is_inter_state;
  const isTaxInvoice = opts.kind === 'tax_invoice';
  const isProforma = opts.kind === 'proforma';
  const isQuotation = opts.kind === 'quotation';
  // Currency support — non-INR documents are export/import (no GST).
  const docCurrency = (doc.currency || 'INR').toUpperCase();
  const isExportDoc = docCurrency !== 'INR';
  const CUR_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ' };
  const sym = CUR_SYMBOLS[docCurrency] || '₹';
  // Doc-currency-aware amount formatter: INR uses Indian grouping (1,23,456.78);
  // USD/EUR/etc. use Western grouping (123,456.78). Applies thousand separators
  // everywhere amounts appear in this print template.
  const fa = (v) => fmtAmtForCurrency(v, docCurrency);
  // Accent: Quotation #444853 (slate), PI #E0C09A (tan/beige), TI → plain #2D3E50 used ONLY for
  // emphasised text (company name, invoice no, TAX INVOICE title, grand total, T&C heading, item header bg).
  // Everything else on TI stays plain black text on white — no filled info bars / no bars on bill-to etc.
  const titleColor = isTaxInvoice ? '#2D3E50' : (isProforma ? '#E0C09A' : '#444853');
  const accentColor = titleColor;
  // For beige (PI), use dark foreground on header; otherwise white.
  const headerFg = isProforma ? '#3d3222' : '#ffffff';

  const rows = (doc.lines || []).map((l, i) => {
    const qty = parseFloat(l.quantity || 0);
    const rate = parseFloat(l.rate || 0);
    const discPct = parseFloat(l.discount_pct || 0);
    const gross = qty * rate;
    const disc = gross * discPct / 100;
    const basic = gross - disc;  // taxable value
    const gstRate = parseFloat(l.gst_rate || 0);
    const gstAmt = basic * gstRate / 100;
    const total = basic + gstAmt;
    const partNum = l.item?.part_number || '';
    const itemName = l.item?.name || '';
    const headTitle = partNum ? `${partNum} — ${itemName}` : (itemName || '-');
    // Description is shown BELOW the item name in the same cell (not a separate column).
    // If the user's free-text description is identical to the item name, don't duplicate it.
    const rawDesc = (l.description || '').trim();
    const desc = rawDesc && rawDesc !== itemName ? rawDesc : '';
    return `<tr>
      <td class="sn">${i + 1}</td>
      <td class="itemcell">
        <div class="item-name">${esc(headTitle)}</div>
        ${desc ? `<div class="item-desc">${esc(desc)}</div>` : ''}
      </td>
      <td class="center mono">${esc(l.hsn_code || l.item?.hsn_code || '-')}</td>
      <td class="right">${fa(qty)}</td>
      <td class="center">${esc(l.uom || '')}</td>
      <td class="right">${fa(rate)}</td>
      <td class="right">${discPct > 0 ? discPct.toFixed(2) + '%' : '-'}</td>
      <td class="right">${fa(basic)}</td>
      <td class="right">${gstRate.toFixed(1)}%<div class="subamt">${fa(gstAmt)}</div></td>
      <td class="right total-cell">${fa(total)}</td>
    </tr>`;
  }).join('');

  const hsnRows = isTaxInvoice ? (doc.hsn_summary || []).map(h => `<tr>
    <td class="mono">${esc(h.hsn)}</td>
    <td class="right">${(h.rate || 0).toFixed(1)}%</td>
    <td class="right">${fa(h.taxable || 0)}</td>
    ${isInter ? `<td class="right">${fa(h.igst || 0)}</td>` : `<td class="right">${fa(h.cgst || 0)}</td><td class="right">${fa(h.sgst || 0)}</td>`}
    <td class="right"><strong>${fa((h.igst || 0) + (h.cgst || 0) + (h.sgst || 0))}</strong></td>
  </tr>`).join('') : '';

  const docNo = doc[opts.numberKey] || '';
  // Pre-escape strings used inside CSS `@page` margin-box `content: "..."`.
  // CSS requires backslash-escapes for embedded double-quotes; we also drop
  // newlines because the property only accepts single-line text.
  const cssEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  const runHeadLeft = cssEscape(`${cfg.name || ''}${cfg.gstin ? ' · GSTIN ' + cfg.gstin : ''}`);
  const runHeadRight = cssEscape(`${opts.title} ${docNo}`);
  const docDate = opts.kind === 'tax_invoice' ? doc.invoice_date : (opts.kind === 'proforma' ? doc.proforma_date : doc.quotation_date);
  const validLabel = opts.kind === 'tax_invoice' ? 'Due Date' : 'Expiration Date';
  const validValue = opts.kind === 'tax_invoice' ? doc.due_date : doc.valid_until;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(docNo)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;margin:0;padding:0}
  .page{max-width:780px;margin:0 auto;padding:32px 24px 20px;box-sizing:border-box}
  .item-desc{font-size:9px;color:#64748b;margin-top:3px;line-height:1.35;white-space:pre-line;font-style:italic}
  /* Header */
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
  .brand-left{flex:1;display:flex;gap:12px;align-items:flex-start}
  .logo-wrap{flex-shrink:0;display:flex;align-items:center;justify-content:center}
  .logo-img{max-height:72px;max-width:180px;object-fit:contain}
  .logo-fallback{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,${accentColor},#64748b);display:flex;align-items:center;justify-content:center;color:${headerFg};font-weight:800;font-size:18px;letter-spacing:-0.5px}
  .brand-block .company-name{font-size:17px;font-weight:800;color:#0f172a;margin:0 0 2px}
  .brand-block .tagline{font-size:10px;color:${accentColor};font-style:italic;margin-bottom:4px;letter-spacing:0.3px}
  .brand-block .company-addr{font-size:10px;color:#475569;line-height:1.5}
  .doc-right{text-align:right}
  .doc-right .title{font-size:16px;font-weight:800;color:${accentColor};letter-spacing:0.5px;margin:0;text-transform:uppercase}
  .doc-right .docno{font-size:14px;font-weight:700;color:#0f172a;margin-top:2px}
  .doc-right .quoref{font-size:10px;color:#475569;margin-top:2px}
  /* Info bar */
  .info-bar{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;background:${accentColor};color:${headerFg};margin-top:14px;border-radius:2px;overflow:hidden}
  .info-bar .col{padding:10px 14px;border-right:1px solid rgba(${isProforma ? '0,0,0' : '255,255,255'},0.15)}
  .info-bar .col:last-child{border-right:none}
  .info-bar .label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:${isProforma ? 'rgba(61,50,34,0.75)' : 'rgba(255,255,255,0.75)'};margin-bottom:2px}
  .info-bar .value{font-size:13px;font-weight:700}
  /* Address rows */
  .address-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:16px 0}
  .addr-box h3{font-size:10px;color:#0f172a;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;border-bottom:2px solid ${accentColor};padding-bottom:4px;display:inline-block}
  .addr-box .name{font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px}
  .addr-box .line{font-size:10px;color:#475569;line-height:1.5;white-space:pre-line}
  /* Items table */
  table.items{width:100%;border-collapse:collapse;margin-top:6px}
  table.items thead th{background:${accentColor};color:${headerFg};font-size:10px;text-transform:uppercase;letter-spacing:0.5px;padding:8px 6px;font-weight:600;border:none}
  table.items tbody td{border-bottom:1px solid #e2e8f0;padding:8px 6px;font-size:10px;vertical-align:top}
  table.items tbody tr:last-child td{border-bottom:2px solid ${accentColor}}
  .sn{width:28px;text-align:center;color:#64748b;font-weight:600}
  .itemcell{min-width:150px}
  .desc-cell{min-width:160px;font-size:9.5px;color:#334155;white-space:pre-line;line-height:1.45}
  .item-name{font-weight:600;color:#0f172a;font-size:11px}
  .item-desc{font-size:9px;color:#64748b;margin-top:3px;line-height:1.4;white-space:pre-line;font-style:italic}
  .center{text-align:center}
  .right{text-align:right}
  .total-cell{font-weight:700;color:#0f172a}
  .mono{font-family:'Courier New',monospace}
  .subamt{font-size:9px;color:#64748b;margin-top:2px}
  /* Totals */
  .bottom-row{display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:16px}
  .bank-block{background:#f8fafc;border:1px solid #e2e8f0;border-radius:2px;padding:12px 14px;font-size:10px;color:#334155}
  .bank-block h4{font-size:10px;color:${accentColor};text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;font-weight:700}
  .bank-block .row{display:grid;grid-template-columns:90px 1fr;gap:6px;margin-bottom:4px;line-height:1.5}
  .bank-block .row strong{color:#0f172a}
  .totals{border-collapse:collapse;width:100%}
  .totals td{padding:6px 10px;font-size:11px;border-bottom:1px solid #e2e8f0}
  .totals td.lbl{color:#64748b;text-align:left}
  .totals td.val{text-align:right;font-weight:600;color:#0f172a;font-family:'Courier New',monospace}
  .totals tr.grand td{background:${accentColor};color:${headerFg};font-size:15px;font-weight:800;padding:10px;border-bottom:none}
  .totals tr.grand td.val{color:${headerFg}}
  .totals tr.words-row td{background:#f8fafc;color:#0f172a;font-size:10px;padding:8px 10px;border-bottom:none;font-style:italic;line-height:1.4}
  .totals tr.words-row td strong{color:${accentColor};font-style:normal;text-transform:uppercase;letter-spacing:0.5px;font-size:9px;display:inline-block;margin-right:4px}
  /* HSN summary */
  h4.section{font-size:10px;color:${accentColor};text-transform:uppercase;letter-spacing:1px;margin:18px 0 6px;font-weight:700}
  table.hsn{width:100%;border-collapse:collapse;font-size:10px}
  table.hsn th{background:#e0e7ff;color:${accentColor};padding:6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:0.5px}
  table.hsn td{padding:6px;border-bottom:1px solid #e2e8f0}
  /* Terms */
  .terms{margin-top:18px;padding:12px 14px;background:#f8fafc;border-left:3px solid ${accentColor};font-size:10px;color:#475569;line-height:1.6;white-space:pre-line}
  .terms h4{font-size:10px;color:${accentColor};text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;font-weight:700}
  /* QR */
  .qr-block{margin-top:14px;display:flex;gap:12px;align-items:center;font-size:9px;color:#475569;page-break-inside:avoid}
  .qr-box{width:72px;height:72px;border:1px dashed #94a3b8;display:flex;align-items:center;justify-content:center;font-size:8px;text-align:center;color:#94a3b8;flex-shrink:0}
  .qr-img{width:100px;height:100px;border:1px solid #cbd5e1;padding:3px;background:#fff;flex-shrink:0}
  .qr-caption{font-size:10px;color:#334155;line-height:1.5}
  .qr-note{font-size:9px;color:#64748b;font-style:italic}
  /* Signature */
  .sign-row{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:30px;font-size:10px}
  .sign-col{text-align:center}
  .sign-img{height:50px;object-fit:contain;margin-bottom:4px}
  .sign-col .line-box{border-top:1px solid #0f172a;padding-top:4px;color:#475569;font-weight:600}
  .sign-col .auth-label{font-size:9px;color:#94a3b8}
  .footer-note{text-align:center;margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8}
  /* Cover page — exactly A4, standalone (outside .page wrapper) */
  .cover-page{width:210mm;min-height:297mm;max-height:297mm;display:flex;flex-direction:column;padding:14mm 18mm;box-sizing:border-box;page-break-after:always;overflow:hidden}
  .cover-head{display:flex;flex-direction:column;align-items:center;gap:2px;margin-bottom:8px}
  .cover-logo{max-height:96px;max-width:260px;object-fit:contain}
  .cover-company{font-size:20px;font-weight:800;color:#0f172a;letter-spacing:0.3px;text-align:center}
  .cover-tagline{font-size:11px;color:${accentColor};font-style:italic;letter-spacing:0.3px;text-align:center}
  .cover-title{font-size:24px;font-weight:800;color:${accentColor};letter-spacing:3px;text-align:center;margin:0 0 4px}
  .cover-docno{font-size:12px;color:#334155;font-family:'Courier New',monospace;text-align:center;margin-bottom:12px}
  .cover-meta{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#334155;margin-bottom:14px;align-self:flex-start}
  .cover-meta-label{color:#64748b;text-transform:uppercase;font-size:10px;letter-spacing:1px;margin-right:6px}
  .cover-intro{font-size:11px;color:#334155;line-height:1.7;text-align:left;padding:4px 0;white-space:pre-line;margin-bottom:auto}
  .cover-sign{margin-top:16px;text-align:left;font-size:11px;color:#475569;align-self:flex-start}
  .cover-sign-img{max-height:64px;max-width:220px;object-fit:contain;margin-bottom:4px;display:block}
  .cover-sign-name{font-size:13px;font-weight:700;color:#0f172a}
  .cover-sign-title{font-size:10px;color:#64748b}
  /* ========================= TAX INVOICE — PLAIN OVERRIDES =========================
   * Per user spec: TI must look plain. Only company name, "TAX INVOICE" title, invoice no,
   * grand total, T&C heading and item table header retain the #2D3E50 accent.
   * Everything else flattened: no filled info bar, no colored bill-to underlines,
   * header separated from body by a single thick line. */
  ${isTaxInvoice ? `
  .header{border-bottom:2px solid #2D3E50;padding-bottom:10px;margin-bottom:14px}
  .info-bar{display:none !important}
  .doc-right .title{color:#2D3E50 !important}
  .doc-right .docno{color:#2D3E50 !important;font-weight:700}
  .brand-block .company-name{color:#2D3E50 !important}
  .brand-block .tagline{color:#64748b !important;font-style:italic}
  .addr-box h3{color:#2D3E50 !important;border-bottom-color:#2D3E50 !important}
  .terms-block h4{color:#2D3E50 !important}
  .totals tr.grand td{background:#fff !important;color:#2D3E50 !important;border-top:2px solid #2D3E50;border-bottom:2px solid #2D3E50;font-weight:800}
  .totals tr.grand td.val{color:#2D3E50 !important}
  .totals tr.words-row td{background:#fff !important;color:#334155 !important;border-bottom:1px solid #e2e8f0}
  .totals tr.words-row td strong{color:#2D3E50 !important}
  .bank-block h4{color:#2D3E50 !important;border-bottom-color:#2D3E50 !important}
  /* Copy-type checkboxes (Original / Duplicate / Triplicate) */
  .copy-ticks{display:flex;gap:14px;justify-content:flex-end;margin-bottom:4px;font-size:10px;color:#334155}
  .copy-ticks .tk{display:flex;align-items:center;gap:4px}
  .copy-ticks .tk .box{width:10px;height:10px;border:1.2px solid #2D3E50;display:inline-block;border-radius:1px}
  ` : ''}
  /* ----- Page 2+ running header (text-only) ---------------------------
     CSS at-page margin boxes accept only string + counter content (not
     images). We use top-left + top-right slots so page 2+ carries the
     company name + GSTIN on the left and the invoice title + number on
     the right. The inline .repeat-head element below is HIDDEN in print
     (display:none) so it never leaks onto page 1 even if the renderer
     ignores position:running. Bottom-right shows Page X of Y.
     NOTE: The PDF download path (html2pdf raster) does NOT support these
     margin-box rules. The page-2+ header therefore renders correctly
     only when the user goes through Browser → Print → Save as PDF
     (native dialog). The in-app Download/Preview button uses html2pdf
     and produces a single-shot raster — page 2+ then has no running
     header, but at least page 1 stays clean (no duplicate). */
  .repeat-head { display: none !important; }
  @media print {
    @page {
      size: A4;
      margin: 16mm 8mm 14mm 8mm;
      @top-left {
        content: "${runHeadLeft}";
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 9.5px;
        font-weight: 700;
        color: ${accentColor};
        padding-left: 4mm;
      }
      @top-right {
        content: "${runHeadRight}";
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 9.5px;
        color: #475569;
        padding-right: 4mm;
      }
      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 9px;
        color: #64748b;
        padding-right: 4mm;
      }
    }
    /* Page 1: suppress @top-* slots so the in-flow brand block doesn't
       compete with a duplicate running header. Page numbers stay on
       page 1 (via @bottom-right above which @page :first doesn't reset). */
    @page :first {
      margin-top: 8mm;
      @top-left { content: none; }
      @top-right { content: none; }
    }
    body { padding: 0; }
  }
</style></head><body>
<!-- Running header (page 2+ only) — moved into at-page top margin by
     CSS position-running. Carries logo + name + address + GSTIN +
     invoice title + number. Page 1 hides it via at-page :first override. -->
<div class="repeat-head">
  ${cfg.logo_data ? `<img src="${esc(cfg.logo_data)}" class="rh-logo" alt="logo"/>` : ''}
  <div style="flex:1">
    <div class="rh-name">${esc(cfg.name)}</div>
    <div class="rh-meta">
      ${[cfg.address_line1, cfg.address_line2].filter(Boolean).map(esc).join(' · ')}
      ${cfg.gstin ? ` · GSTIN: <strong>${esc(cfg.gstin)}</strong>` : ''}
    </div>
  </div>
  <div class="rh-right" style="text-align:right">
    <div class="rh-title">${esc(opts.title)}</div>
    <div class="rh-docno">${esc(docNo)}</div>
  </div>
</div>
${(isQuotation && opts.includeCover) ? `
<!-- Cover Page (full A4, outside .page padding) -->
<div class="cover-page">
  <div class="cover-head">
    ${cfg.logo_data ? `<img src="${esc(cfg.logo_data)}" class="cover-logo" alt="logo"/>` : `<div class="logo-fallback" style="width:100px;height:100px;font-size:36px">${esc((cfg.name || 'C').charAt(0).toUpperCase())}</div>`}
    <div class="cover-company">${esc(cfg.name)}</div>
    ${cfg.tagline ? `<div class="cover-tagline">${esc(cfg.tagline)}</div>` : ''}
  </div>
  <div class="cover-title">QUOTATION</div>
  <div class="cover-docno">${esc(docNo)}${(doc.revision && doc.revision > 0) ? ` · Rev ${doc.revision}` : ''}</div>
  <div class="cover-meta">
    <div><span class="cover-meta-label">To:</span> <strong>${esc(doc.customer_name || '')}</strong></div>
    <div><span class="cover-meta-label">Date:</span> ${docDate ? new Date(docDate).toLocaleDateString('en-IN') : '-'}</div>
  </div>
  ${(company.quotation_cover_intro || '') ? `<div class="cover-intro">${esc(company.quotation_cover_intro)}</div>` : ''}
  <div class="cover-sign">
    ${signer.signature_url ? `<img src="${esc(signer.signature_url)}" class="cover-sign-img" alt="sign"/>` : ''}
    <div class="cover-sign-name">${esc(signer.name || 'Authorised Signatory')}</div>
    <div class="cover-sign-title">For ${esc(cfg.name)}</div>
  </div>
</div>
` : ''}
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="brand-left">
      <div class="logo-wrap">
        ${cfg.logo_data ? `<img src="${esc(cfg.logo_data)}" class="logo-img" alt="logo"/>` : `<div class="logo-fallback">${esc((cfg.name || 'C').charAt(0).toUpperCase())}</div>`}
      </div>
      <div class="brand-block">
        <div class="company-name">${esc(cfg.name)}</div>
        ${cfg.tagline ? `<div class="tagline">${esc(cfg.tagline)}</div>` : ''}
        ${cfg.address_line1 ? `<div class="company-addr">${esc(cfg.address_line1)}</div>` : ''}
        ${cfg.address_line2 ? `<div class="company-addr">${esc(cfg.address_line2)}</div>` : ''}
        ${(cfg.phone || cfg.email) ? `<div class="company-addr">${cfg.phone ? 'Phone: ' + esc(cfg.phone) : ''}${cfg.phone && cfg.email ? ' | ' : ''}${cfg.email ? esc(cfg.email) : ''}</div>` : ''}
        ${cfg.website ? `<div class="company-addr">Web: ${esc(cfg.website)}</div>` : ''}
        ${cfg.gstin ? `<div class="company-addr"><strong>GSTIN: ${esc(cfg.gstin)}</strong></div>` : ''}
      </div>
    </div>
    <div class="doc-right">
      ${isTaxInvoice ? `<div class="copy-ticks">
        <span class="tk"><span class="box"></span> Original</span>
        <span class="tk"><span class="box"></span> Duplicate</span>
        <span class="tk"><span class="box"></span> Triplicate</span>
      </div>` : ''}
      <div class="title">${esc(opts.title)}</div>
      <div class="docno">${esc(docNo)}${(doc.revision && doc.revision > 0) ? ` <span style="color:${accentColor};font-size:11px">· Rev ${doc.revision}</span>` : ''}</div>
      ${doc.quotation?.quotation_no ? `<div class="quoref">Ref Quotation: <strong>${esc(doc.quotation.quotation_no)}</strong></div>` : ''}
      ${doc.proforma?.proforma_no ? `<div class="quoref">Ref PI: <strong>${esc(doc.proforma.proforma_no)}</strong></div>` : ''}
      ${doc.sales_order?.order_number ? `<div class="quoref">Ref SO: <strong>${esc(doc.sales_order.order_number)}</strong></div>` : ''}
      ${doc.customer_po_number ? `<div class="quoref">Customer PO: <strong>${esc(doc.customer_po_number)}</strong></div>` : ''}
    </div>
  </div>

  <!-- Info bar -->
  <div class="info-bar">
    <div class="col"><div class="label">${esc(opts.title)} No</div><div class="value">${esc(docNo)}</div></div>
    <div class="col"><div class="label">Date</div><div class="value">${docDate ? new Date(docDate).toLocaleDateString('en-IN') : '-'}</div></div>
    <div class="col"><div class="label">${esc(validLabel)}</div><div class="value">${validValue ? new Date(validValue).toLocaleDateString('en-IN') : '-'}</div></div>
    <div class="col"><div class="label">${isTaxInvoice ? 'Place of Supply' : 'Salesperson'}</div><div class="value">${esc(isTaxInvoice ? (doc.place_of_supply || '-') : (signer.name || currentUser.name || 'Sales Team'))}</div></div>
  </div>

  <!-- Bill To / Ship To -->
  <div class="address-row">
    <div class="addr-box">
      <h3>Bill To</h3>
      <div class="name">${esc(doc.customer_name || '')}</div>
      ${doc.contact_person ? `<div class="line">Attn: ${esc(doc.contact_person)}</div>` : ''}
      ${(() => {
        // Prefer a structured multi-line address from the master (address + city, state pin) over the
        // flat snapshot on the doc so the print always shows the full, up-to-date address.
        const c = doc.customer || {};
        const cityStatePin = [c.city, c.state, c.pin_code].filter(Boolean).join(', ');
        const lines = [doc.billing_address || c.address || '', cityStatePin].filter(Boolean);
        return lines.map(ln => `<div class="line">${esc(ln)}</div>`).join('');
      })()}
      ${doc.email ? `<div class="line">${esc(doc.email)}</div>` : ''}
      ${doc.phone ? `<div class="line">${esc(doc.phone)}</div>` : ''}
      ${doc.customer?.state_code ? `<div class="line"><strong>State Code:</strong> <span class="mono">${esc(doc.customer.state_code)}</span></div>` : ''}
      ${doc.customer?.gstin ? `<div class="line"><strong>GSTIN:</strong> <span class="mono">${esc(doc.customer.gstin)}</span></div>` : ''}
    </div>
    ${isTaxInvoice && doc.customer_po_number ? `
    <div class="addr-box">
      <h3>PO Reference</h3>
      <div class="name">${esc(doc.customer_po_number)}</div>
      ${doc.sales_order?.order_number ? `<div class="line">Linked SO: <strong>${esc(doc.sales_order.order_number)}</strong></div>` : ''}
      ${doc.place_of_supply ? `<div class="line">Place of Supply: <strong>${esc(doc.place_of_supply)}</strong></div>` : ''}
    </div>
    ` : `
    <div class="addr-box">
      <h3>Ship To</h3>
      <div class="name">${esc(doc.customer_name || '')}</div>
      ${(() => {
        const c = doc.customer || {};
        const cityStatePin = [c.city, c.state, c.pin_code].filter(Boolean).join(', ');
        const lines = [doc.shipping_address || doc.billing_address || c.address || '', cityStatePin].filter(Boolean);
        return lines.length ? lines.map(ln => `<div class="line">${esc(ln)}</div>`).join('') : '<div class="line">-</div>';
      })()}
      ${doc.customer?.state_code ? `<div class="line"><strong>State Code:</strong> <span class="mono">${esc(doc.customer.state_code)}</span></div>` : ''}
    </div>
    `}
  </div>

  <!-- Items -->
  <table class="items">
    <thead>
      <tr>
        <th class="sn">Sl</th>
        <th>Item Name &amp; Description</th>
        <th class="center" style="min-width:70px">HSN</th>
        <th class="right">Qty</th>
        <th class="center">UOM</th>
        <th class="right">Rate</th>
        <th class="right">Discount</th>
        <th class="right">Basic Amt</th>
        <th class="right">GST</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="10" style="text-align:center;padding:20px">No line items</td></tr>'}</tbody>
  </table>

  <!-- Bank + Totals -->
  <div class="bottom-row">
    <div class="bank-block">
      <h4>Bank Details</h4>
      ${cfg.bank_name ? `<div class="row"><strong>Bank:</strong><span>${esc(cfg.bank_name)}</span></div>` : ''}
      ${cfg.bank_branch ? `<div class="row"><strong>Branch:</strong><span>${esc(cfg.bank_branch)}</span></div>` : ''}
      ${cfg.bank_account ? `<div class="row"><strong>A/C No:</strong><span class="mono">${esc(cfg.bank_account)}</span></div>` : ''}
      ${cfg.bank_ifsc ? `<div class="row"><strong>IFSC:</strong><span class="mono">${esc(cfg.bank_ifsc)}</span></div>` : ''}
      ${cfg.bank_upi ? `<div class="row"><strong>UPI:</strong><span class="mono">${esc(cfg.bank_upi)}</span></div>` : ''}
      ${(!cfg.bank_name && !cfg.bank_account) ? '<div style="font-size:10px;color:#94a3b8">Bank details not configured. Set them in Settings → Company Details.</div>' : ''}
    </div>
    <table class="totals">
      <tr><td class="lbl">Subtotal (after line discount)</td><td class="val">${sym}${(doc.subtotal || 0).toFixed(2)}</td></tr>
      ${doc.global_discount_amount ? `<tr><td class="lbl">Global Discount${doc.global_discount_type === 'percent' && doc.global_discount_value ? ` (${doc.global_discount_value}%)` : ''}</td><td class="val">-${sym}${doc.global_discount_amount.toFixed(2)}</td></tr>` : ''}
      ${doc.global_discount_amount ? `<tr><td class="lbl">Net Subtotal</td><td class="val">${sym}${(doc.net_subtotal || 0).toFixed(2)}</td></tr>` : ''}
      ${isExportDoc ? '' : (isInter
        ? `<tr><td class="lbl">IGST</td><td class="val">${sym}${(doc.igst || 0).toFixed(2)}</td></tr>`
        : `<tr><td class="lbl">CGST</td><td class="val">${sym}${(doc.cgst || 0).toFixed(2)}</td></tr><tr><td class="lbl">SGST</td><td class="val">${sym}${(doc.sgst || 0).toFixed(2)}</td></tr>`)
      }
      <tr class="grand"><td class="lbl">Grand Total</td><td class="val">${sym}${(doc.grand_total || 0).toFixed(2)}</td></tr>
      ${isExportDoc ? `<tr><td colspan="2" style="font-size:9px;color:#6B7280;text-align:right;padding:2px 6px;">Export/Import — GST not applicable. Currency: ${docCurrency}</td></tr>` : ''}
      <tr class="words-row"><td colspan="2"><strong>In Words:</strong> ${esc(numberToIndianWords(doc.grand_total || 0, docCurrency))}</td></tr>
    </table>
  </div>

  ${isTaxInvoice && !isExportDoc ? `
  <h4 class="section">HSN-wise Tax Summary</h4>
  <table class="hsn">
    <thead><tr>
      <th>HSN</th><th>Rate</th><th>Taxable</th>
      ${isInter ? '<th>IGST</th>' : '<th>CGST</th><th>SGST</th>'}
      <th>Total Tax</th>
    </tr></thead>
    <tbody>${hsnRows || `<tr><td colspan="${isInter ? 5 : 6}" class="center">-</td></tr>`}</tbody>
  </table>
  ${doc.qr_code ? `<div class="qr-block">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=4&data=${encodeURIComponent(doc.qr_code)}" class="qr-img" alt="Payment QR"/>
    <div class="qr-caption"><strong>Scan to Pay</strong><br/><span class="qr-note">UPI-compatible payment QR. Total: ${sym}${(doc.grand_total || 0).toFixed(2)}</span></div>
  </div>` : ''}
  ` : ''}

  ${doc.notes ? `<div class="terms"><h4>Notes</h4>${esc(doc.notes)}</div>` : ''}
  ${doc.terms ? `<div class="terms"><h4>Terms &amp; Conditions</h4>${esc(doc.terms)}</div>` : ''}

  <!-- Signature -->
  <div class="sign-row">
    <div class="sign-col">
      <div style="height:54px"></div>
      <div class="line-box">Customer Acceptance</div>
      <div class="auth-label">Signature &amp; Stamp</div>
    </div>
    <div class="sign-col">
      ${signer.signature_url ? `<img src="${esc(signer.signature_url)}" class="sign-img" alt="signature"/>` : '<div style="height:54px"></div>'}
      <div class="line-box">For ${esc(cfg.name)}</div>
      <div class="auth-label">${esc(signer.name || 'Authorised Signatory')}</div>
    </div>
  </div>

  <div class="footer-note">This is a computer-generated document.${isTaxInvoice ? ' Subject to Jurisdiction as per Place of Supply.' : ''}</div>
</div>

</body></html>`;
  // Document number / filename — `docNo` was already computed earlier from
  // `opts.numberKey`; reuse it for the filename so we don't shadow it.
  const kindPrefix = isTaxInvoice ? 'Tax-Invoice' : isProforma ? 'Proforma' : isQuotation ? 'Quotation' : 'Document';
  const filename = `${kindPrefix}-${docNo || doc.id}.pdf`;
  if (opts.openInSameTab) {
    // Public share route: write inline so the printable page shows immediately.
    // Falling back to a hidden iframe would break the PublicPrintPage flow,
    // so we render the HTML directly into the current window.
    document.open();
    document.write(html);
    document.close();
  } else if (opts.preview) {
    // PREVIEW MODE — open a new tab/window with the rendered HTML and a
    // floating action bar so the user can review on-screen before printing
    // or downloading. No auto-download triggered.
    const win = window.open('', '_blank');
    if (!win) {
      alert('Pop-up blocked. Allow pop-ups for this site to use the preview.');
      return;
    }
    const actionBar = `
<style>
  .preview-actions{
    position:fixed;bottom:16px;right:16px;
    display:flex;gap:8px;z-index:10000;
    background:#fff;border:1px solid #e2e8f0;border-radius:8px;
    padding:8px 10px;box-shadow:0 4px 18px rgba(0,0,0,0.12);
    font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;
  }
  .preview-actions button{
    border:0;padding:6px 12px;border-radius:6px;cursor:pointer;
    font-size:12px;font-weight:600;
  }
  .preview-actions .primary{background:${accentColor};color:${headerFg}}
  .preview-actions .secondary{background:#f1f5f9;color:#0f172a}
  @media print {.preview-actions{display:none !important}}
</style>
<div class="preview-actions">
  <button class="primary" onclick="window.print()">Print / Save as PDF</button>
  <button class="secondary" onclick="window.close()">Close</button>
</div>`;
    win.document.open();
    win.document.write(html.replace('</body>', actionBar + '</body>'));
    win.document.close();
    try { win.document.title = filename.replace('.pdf', ''); } catch (_e) { /* cross-origin no-op */ }
  } else {
    // Build a running-header config for the html2pdf path. This carries
    // the logo (as data URL — already loaded into cfg.logo_data), company
    // name, multi-line address, GSTIN, doc title and number.
    // pdfPrint.js draws this on every page 2+ via jsPDF.addImage so a
    // proper logo + full address appears as a running header in the PDF.
    // We pass BOTH `addressLine` (legacy single-line) and `addressLines`
    // (array, preferred — preserves line breaks like the in-flow letterhead),
    // PLUS individual fields (`addr1`, `addr2`, `phoneEmail`) so pdfPrint
    // can fall back to drawing them line-by-line even if the array gets
    // mangled by minifier/cache.
    const phoneEmail = [cfg.phone && `Phone: ${cfg.phone}`, cfg.email && `Email: ${cfg.email}`].filter(Boolean).join(' · ');
    const addrLines = [cfg.address_line1, cfg.address_line2, phoneEmail].filter(Boolean);
    const addrSummary = addrLines.join(', ');
    const runningHeader = isTaxInvoice ? {
      logoDataUrl: cfg.logo_data || '',
      companyName: cfg.name || '',
      addressLine: addrSummary,
      addressLines: addrLines,
      addr1: cfg.address_line1 || '',
      addr2: cfg.address_line2 || '',
      phoneEmail,
      gstin: cfg.gstin || '',
      docTitle: opts.title || '',
      docNo: docNo || '',
    } : null;
    // eslint-disable-next-line no-console
    console.info('[printInvoiceDoc] runningHeader →', isTaxInvoice ? {
      hasLogo: !!runningHeader.logoDataUrl,
      logoFmt: (runningHeader.logoDataUrl || '').slice(0, 30),
      addrLinesCount: addrLines.length,
      addrLines, gstin: runningHeader.gstin, companyName: runningHeader.companyName,
    } : 'not a tax invoice');
    downloadHtmlAsPdf(html, filename, runningHeader ? { runningHeader } : {});
  }
}

export { printInvoiceDoc };

