import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import {
  Plus, Edit2, Trash2, MessageSquare, UserCheck, AlertTriangle, Clock,
  Megaphone, Headphones, X, Search, CheckCircle2, XCircle, FileText, Send, RefreshCw, Printer, Upload
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import ConfirmDialog from '../components/ConfirmDialog';

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

function formatCurrency(v) {
  const n = parseFloat(v || 0);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
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
        api.get('/api/users').catch(() => ({ data: [] })),
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

  const canMarketingEdit = user?.role === 'admin' || user?.permissions?.crm_marketing?.includes('create');
  const canSupportEdit = user?.role === 'admin' || user?.permissions?.crm_support?.includes('create');

  // Breadcrumb label
  const crumbMain = activeTab === 'quotations' ? 'Quotations' : activeTab === 'support' ? 'Support' : 'Marketing';
  const crumbSub = {
    contacts: 'Contacts', quotations: 'Quotations', configuration: 'Configuration',
    sla: 'SLA Due', activity: 'Activity Logs',
  }[activeSub];

  return (
    <div className="space-y-4" data-testid="crm-page">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-[#6B7280]">CRM · {crumbMain}{crumbSub ? ` · ${crumbSub}` : ''}</div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#1D3557]">{crumbSub || `${crumbMain} ${activeTab === 'support' ? 'Pipeline' : activeTab === 'marketing' ? 'Pipeline' : ''}`}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 w-64" data-testid="crm-search" />
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
        <PipelineConfigPanel pipelineType="marketing" onRefresh={fetchData} canEdit={canMarketingEdit} />
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
        <PipelineConfigPanel pipelineType="support" onRefresh={fetchData} canEdit={canSupportEdit} />
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
                <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger data-testid="ticket-customer"><SelectValue placeholder="Select customer..." /></SelectTrigger>
                  <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.customer_code ? ` (${c.customer_code})` : ''}</SelectItem>)}</SelectContent>
                </Select>
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
  return { item_id: '', description: '', quantity: 1, uom: 'Nos', rate: 0, discount_pct: 0, gst_rate: 18 };
}

function QuotationsPanel({ quotations, leads, customers, items, search, onRefresh, canEdit, prefillFromLead, onPrefillConsumed }) {
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
    lines: [emptyQuotationLine()],
  };
  const [form, setForm] = useState(emptyForm);
  const [convertDialog, setConvertDialog] = useState({ open: false, quotation: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, quotation: null });
  const [acceptConfirm, setAcceptConfirm] = useState({ open: false, quotation: null });

  const openDialog = useCallback((q, fromLead) => {
    if (q) {
      setEditing(q);
      setForm({
        lead_id: q.lead_id || '',
        customer_id: q.customer_id || '',
        customer_name: q.customer_name || '',
        contact_person: q.contact_person || '',
        email: q.email || '',
        phone: q.phone || '',
        quotation_date: q.quotation_date ? String(q.quotation_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        valid_until: q.valid_until ? String(q.valid_until).slice(0, 10) : '',
        notes: q.notes || '',
        terms: q.terms || '',
        status: q.status || 'draft',
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
    }
    setDialog(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-open when arriving from "Create Quotation" on a lead
  useEffect(() => {
    if (prefillFromLead) {
      openDialog(null, prefillFromLead);
      onPrefillConsumed && onPrefillConsumed();
    }
  }, [prefillFromLead, openDialog, onPrefillConsumed]);

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, emptyQuotationLine()] }));
  const removeLine = (idx) => setForm(f => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines }));
  const updateLine = (idx, patch) => setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, ...patch } : l) }));
  const onPickItem = (idx, itemId) => {
    const it = items.find(i => i.id === itemId);
    updateLine(idx, {
      item_id: itemId,
      // Pre-fill the editable Description column from items.description if present; else leave empty/editable
      description: it?.description || '',
      uom: it?.uom || 'Nos',
      rate: it?.sale_price || it?.unit_cost || 0,
      gst_rate: it?.gst_rate ?? 18,
    });
  };

  const totals = React.useMemo(() => {
    let sub = 0, gst = 0, discount = 0;
    form.lines.forEach(l => {
      const gross = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
      const dsc = gross * ((parseFloat(l.discount_pct) || 0) / 100);
      const net = gross - dsc;
      discount += dsc;
      sub += net;
      gst += net * ((parseFloat(l.gst_rate) || 0) / 100);
    });
    return { sub, gst, discount, total: sub + gst };
  }, [form.lines]);

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

  const printQuotation = (q) => {
    const esc = (s) => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const lines = q.lines || [];
    const rows = lines.map((l, i) => {
      const gross = (l.quantity || 0) * (l.rate || 0);
      const disc = gross * ((l.discount_pct || 0) / 100);
      const net = gross - disc;
      const gstAmt = net * ((l.gst_rate || 0) / 100);
      const itemLabel = l.item?.part_number ? `${l.item.part_number} · ${l.item.name || ''}` : '';
      return `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td><strong>${esc(itemLabel || l.description || '-')}</strong>${l.description && itemLabel ? `<div style="font-size:10px;color:#555;margin-top:2px">${esc(l.description)}</div>` : ''}</td>
        <td style="text-align:right">${(l.quantity || 0).toFixed(2)}</td>
        <td>${esc(l.uom || '')}</td>
        <td style="text-align:right">₹${(l.rate || 0).toFixed(2)}</td>
        <td style="text-align:right">${(l.discount_pct || 0).toFixed(2)}%</td>
        <td style="text-align:right">₹${net.toFixed(2)}</td>
        <td style="text-align:right">${(l.gst_rate || 0).toFixed(1)}%</td>
        <td style="text-align:right">₹${(net + gstAmt).toFixed(2)}</td>
      </tr>`;
    }).join('');
    const totalDisc = (q.total_discount || 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${q.quotation_no}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:20px}
  .company-block{border-bottom:2px solid #1D3557;padding-bottom:8px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start}
  .company-block .company-name{font-size:22px;color:#1D3557;font-weight:bold;margin:0 0 4px}
  .company-block .company-addr{font-size:11px;color:#4B5563;line-height:1.4}
  .doc-title{font-size:20px;color:#1D3557;font-weight:bold;text-align:right}
  .doc-title .sub{font-size:11px;color:#6B7280;font-weight:normal;text-transform:uppercase;letter-spacing:1px}
  .meta{display:flex;justify-content:space-between;gap:16px;margin:16px 0}
  .meta > div{flex:1}
  .meta h3{font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;font-weight:normal}
  table.items{width:100%;border-collapse:collapse;margin:16px 0}
  table.items th, table.items td{border:1px solid #ccc;padding:6px 8px;font-size:11px}
  table.items th{background:#F3F4F6;text-align:left}
  .totals{margin-left:auto;width:320px;border-collapse:collapse}
  .totals td{padding:4px 8px}
  .totals tr.grand td{border-top:2px solid #111;font-weight:bold;font-size:14px;padding-top:6px}
  .notes{margin-top:16px;padding:10px;background:#F9FAFB;border:1px solid #E5E7EB;font-size:11px;white-space:pre-line;line-height:1.5}
  .notes strong{display:block;margin-bottom:4px;color:#1D3557}
  @media print {@page {size:A4; margin:15mm;}}
</style></head><body>
<div class="company-block">
  <div>
    <div class="company-name">${esc(COMPANY_INFO.name)}</div>
    <div class="company-addr">${esc(COMPANY_INFO.address)}</div>
    <div class="company-addr">Phone: ${esc(COMPANY_INFO.phone)} &nbsp; | &nbsp; Email: ${esc(COMPANY_INFO.email)}</div>
    <div class="company-addr">GSTIN: ${esc(COMPANY_INFO.gstin)} &nbsp; | &nbsp; ${esc(COMPANY_INFO.website)}</div>
  </div>
  <div class="doc-title">
    <div class="sub">Quotation</div>
    <div>${esc(q.quotation_no)}</div>
  </div>
</div>

<div class="meta">
  <div>
    <h3>Bill To</h3>
    <div style="font-size:13px;font-weight:bold">${esc(q.customer_name || '')}</div>
    ${q.contact_person ? `<div>Attn: ${esc(q.contact_person)}</div>` : ''}
    ${q.email ? `<div>${esc(q.email)}</div>` : ''}
    ${q.phone ? `<div>${esc(q.phone)}</div>` : ''}
    ${q.customer?.address ? `<div style="max-width:260px;white-space:pre-line">${esc(q.customer.address)}</div>` : ''}
    ${q.customer?.gstin ? `<div>GSTIN: ${esc(q.customer.gstin)}</div>` : ''}
  </div>
  <div style="text-align:right">
    <h3>Quotation Details</h3>
    <div><strong>Date:</strong> ${q.quotation_date ? new Date(q.quotation_date).toLocaleDateString('en-IN') : '-'}</div>
    ${q.valid_until ? `<div><strong>Valid Until:</strong> ${new Date(q.valid_until).toLocaleDateString('en-IN')}</div>` : ''}
    ${q.lead?.lead_no ? `<div><strong>Ref Lead:</strong> ${esc(q.lead.lead_no)}</div>` : ''}
    <div><strong>Status:</strong> ${(q.status || '').toUpperCase()}${q.converted_so_no ? ` (SO: ${esc(q.converted_so_no)})` : ''}</div>
  </div>
</div>

<table class="items">
  <thead><tr><th>#</th><th>Item Name</th><th>Qty</th><th>UOM</th><th>Rate</th><th>Discount</th><th>Amount</th><th>GST</th><th>Total</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="9" style="text-align:center">No lines</td></tr>'}</tbody>
</table>
<table class="totals">
  <tr><td>Subtotal (after discount):</td><td style="text-align:right">₹${(q.subtotal || 0).toFixed(2)}</td></tr>
  ${totalDisc ? `<tr><td>Total Discount:</td><td style="text-align:right">₹${totalDisc.toFixed(2)}</td></tr>` : ''}
  <tr><td>GST:</td><td style="text-align:right">₹${(q.total_gst || 0).toFixed(2)}</td></tr>
  <tr class="grand"><td>Grand Total:</td><td style="text-align:right">₹${(q.grand_total || 0).toFixed(2)}</td></tr>
</table>

${q.notes ? `<div class="notes"><strong>Notes</strong>${esc(q.notes)}</div>` : ''}
${q.terms ? `<div class="notes"><strong>Terms &amp; Conditions</strong>${esc(q.terms)}</div>` : ''}

<div style="margin-top:40px;display:flex;justify-content:space-between;font-size:11px;color:#4B5563">
  <div style="text-align:center;width:45%">
    <div style="border-top:1px solid #111;margin-top:40px;padding-top:4px">Customer Acceptance</div>
  </div>
  <div style="text-align:center;width:45%">
    <div style="border-top:1px solid #111;margin-top:40px;padding-top:4px">For ${esc(COMPANY_INFO.name)}</div>
  </div>
</div>

<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
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
                      {canEdit && !isLocked && q.status === 'draft' && (
                        <button onClick={() => quickStatusChange(q, 'sent')} className="p-1.5 text-[#03543F] hover:bg-[#DEF7EC] rounded" title="Send to customer" data-testid={`quotation-send-${q.id}`}><Send className="w-4 h-4" /></button>
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
                <Select value={form.lead_id || '__none__'} onValueChange={v => {
                  if (v === '__none__') { setForm(f => ({ ...f, lead_id: '' })); return; }
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
                }}>
                  <SelectTrigger data-testid="quotation-lead-select"><SelectValue placeholder="— Unlinked —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unlinked —</SelectItem>
                    {leads.map(l => <SelectItem key={l.id} value={l.id}>{l.lead_no} · {l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Existing Customer (optional)</label>
                <Select value={form.customer_id || '__none__'} onValueChange={v => {
                  if (v === '__none__') { setForm(f => ({ ...f, customer_id: '' })); return; }
                  const c = customers.find(x => x.id === v);
                  setForm(f => ({ ...f, customer_id: v, customer_name: c?.name || f.customer_name, contact_person: c?.contact_person || f.contact_person, email: c?.email || f.email, phone: c?.phone || f.phone }));
                }}>
                  <SelectTrigger data-testid="quotation-customer-select"><SelectValue placeholder="— Free text only —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Free text only —</SelectItem>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.customer_code ? ` (${c.customer_code})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Customer Name *</label>
                <input type="text" className="input-field" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} data-testid="quotation-customer-name" />
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
            </div>

            {/* Lines editor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-[#1D3557]">Line Items</div>
                <button className="btn-secondary flex items-center gap-1 text-xs" onClick={addLine} data-testid="quotation-add-line"><Plus className="w-3 h-3" /> Add Line</button>
              </div>
              <div className="border border-[#E5E7EB] rounded-sm overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F3F4F6]">
                    <tr>
                      <th className="text-left p-2 w-10">#</th>
                      <th className="text-left p-2 min-w-[220px]">Item Name</th>
                      <th className="text-left p-2 min-w-[180px]">Description</th>
                      <th className="text-left p-2 w-20">Qty</th>
                      <th className="text-left p-2 w-20">UOM</th>
                      <th className="text-left p-2 w-24">Rate (₹)</th>
                      <th className="text-left p-2 w-20">Disc %</th>
                      <th className="text-left p-2 w-20">GST %</th>
                      <th className="text-right p-2 w-28">Amount</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((l, idx) => {
                      const gross = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
                      const disc = gross * ((parseFloat(l.discount_pct) || 0) / 100);
                      const amount = gross - disc;
                      return (
                        <tr key={idx} className="border-t border-[#E5E7EB]" data-testid={`quotation-line-${idx}`}>
                          <td className="p-2 mono">{idx + 1}</td>
                          <td className="p-2">
                            <Select value={l.item_id || '__none__'} onValueChange={v => { if (v === '__none__') updateLine(idx, { item_id: '' }); else onPickItem(idx, v); }}>
                              <SelectTrigger className="h-7 text-xs" data-testid={`quotation-line-item-${idx}`}><SelectValue placeholder="Pick item..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Free text —</SelectItem>
                                {items.slice(0, 500).map(it => <SelectItem key={it.id} value={it.id}>{it.part_number} · {it.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {(() => {
                              const it = items.find(x => x.id === l.item_id);
                              const desc = it?.description || '';
                              if (!desc) return null;
                              return <div className="text-[10px] text-[#6B7280] mt-1 leading-tight" data-testid={`quotation-line-itemdesc-${idx}`}>{desc}</div>;
                            })()}
                          </td>
                          <td className="p-2">
                            <input type="text" className="input-field h-7 text-xs" value={l.description} onChange={e => updateLine(idx, { description: e.target.value })} />
                          </td>
                          <td className="p-2">
                            <input type="number" step="0.01" className="input-field mono h-7 text-xs" value={l.quantity} onChange={e => updateLine(idx, { quantity: e.target.value })} data-testid={`quotation-line-qty-${idx}`} />
                          </td>
                          <td className="p-2">
                            <input type="text" className="input-field h-7 text-xs" value={l.uom} onChange={e => updateLine(idx, { uom: e.target.value })} />
                          </td>
                          <td className="p-2">
                            <input type="number" step="0.01" className="input-field mono h-7 text-xs" value={l.rate} onChange={e => updateLine(idx, { rate: e.target.value })} data-testid={`quotation-line-rate-${idx}`} />
                          </td>
                          <td className="p-2">
                            <input type="number" step="0.01" className="input-field mono h-7 text-xs" value={l.discount_pct || 0} onChange={e => updateLine(idx, { discount_pct: e.target.value })} data-testid={`quotation-line-discount-${idx}`} />
                          </td>
                          <td className="p-2">
                            <input type="number" step="0.01" className="input-field mono h-7 text-xs" value={l.gst_rate} onChange={e => updateLine(idx, { gst_rate: e.target.value })} />
                          </td>
                          <td className="p-2 text-right mono">{formatCurrency(amount)}</td>
                          <td className="p-2">
                            {form.lines.length > 1 && (
                              <button className="text-[#9B1C1C] hover:bg-[#FDE8E8] rounded p-1" onClick={() => removeLine(idx)} title="Remove" data-testid={`quotation-line-remove-${idx}`}><X className="w-3 h-3" /></button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-2 text-xs">
                <div className="w-64 space-y-1">
                  <div className="flex justify-between"><span>Subtotal (after discount):</span><span className="mono">{formatCurrency(totals.sub)}</span></div>
                  {totals.discount > 0 && <div className="flex justify-between text-[#9B1C1C]"><span>Discount:</span><span className="mono">-{formatCurrency(totals.discount)}</span></div>}
                  <div className="flex justify-between"><span>GST:</span><span className="mono">{formatCurrency(totals.gst)}</span></div>
                  <div className="flex justify-between font-semibold border-t border-[#E5E7EB] pt-1"><span>Grand Total:</span><span className="mono">{formatCurrency(totals.total)}</span></div>
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
  const selectedItems = items.filter(i => selectedIds.includes(i.id));
  const matches = query.trim() ? items.filter(i => {
    const q = query.toLowerCase();
    return !selectedIds.includes(i.id) && ((i.part_number || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q));
  }).slice(0, 50) : [];
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
      <input
        className="input-field text-sm"
        type="text"
        placeholder="Search items to add..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        data-testid={`${testid}-search`}
      />
      {matches.length > 0 && (
        <div className="border border-[#E5E7EB] mt-1 max-h-40 overflow-y-auto bg-white text-xs">
          {matches.map(i => (
            <button key={i.id} onClick={() => add(i.id)} className="block w-full text-left px-2 py-1 hover:bg-[#F3F4F6]" data-testid={`${testid}-opt-${i.id}`}>
              <span className="mono font-medium">{i.part_number}</span> · {i.name}
            </button>
          ))}
        </div>
      )}
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
    </div>
  );
}

/* ============================================================================
 *  SLA DUE PANEL (Support)
 * ========================================================================= */
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

