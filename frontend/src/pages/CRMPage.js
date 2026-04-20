import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import {
  Plus, Edit2, Trash2, MessageSquare, UserCheck, AlertTriangle, Clock,
  Megaphone, Headphones, X, Search, CheckCircle2, XCircle, FileText, Send, RefreshCw
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

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
  const [leads, setLeads] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [quotationFromLead, setQuotationFromLead] = useState(null);

  // Sync tab with URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (t === 'support' || t === 'marketing' || t === 'quotations') setActiveTab(t);
  }, [location.search]);

  const fetchData = useCallback(async () => {
    try {
      const [lRes, tRes, qRes, iRes, cRes, uRes] = await Promise.all([
        api.get('/api/crm/leads'),
        api.get('/api/crm/tickets'),
        api.get('/api/crm/quotations'),
        api.get('/api/items').catch(() => ({ data: [] })),
        api.get('/api/customers'),
        api.get('/api/users').catch(() => ({ data: [] })),
      ]);
      setLeads(lRes.data || []);
      setTickets(tRes.data || []);
      setQuotations(qRes.data || []);
      setItems(iRes.data || []);
      setCustomers(cRes.data || []);
      setUsers(uRes.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4" data-testid="crm-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#1D3557]">CRM</h1>
          <p className="text-sm text-[#4B5563]">Marketing leads & customer support tickets</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 w-64" data-testid="crm-search" />
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 border-b border-[#E5E7EB]">
        <button
          className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'marketing' ? 'text-[#1D3557] border-b-2 border-[#1D3557]' : 'text-[#6B7280] hover:text-[#111827]'}`}
          onClick={() => { setActiveTab('marketing'); navigate('/crm?tab=marketing'); }}
          data-testid="crm-tab-marketing"
        >
          <Megaphone className="w-4 h-4" /> Marketing ({leads.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'quotations' ? 'text-[#1D3557] border-b-2 border-[#1D3557]' : 'text-[#6B7280] hover:text-[#111827]'}`}
          onClick={() => { setActiveTab('quotations'); navigate('/crm?tab=quotations'); }}
          data-testid="crm-tab-quotations"
        >
          <FileText className="w-4 h-4" /> Quotations ({quotations.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'support' ? 'text-[#1D3557] border-b-2 border-[#1D3557]' : 'text-[#6B7280] hover:text-[#111827]'}`}
          onClick={() => { setActiveTab('support'); navigate('/crm?tab=support'); }}
          data-testid="crm-tab-support"
        >
          <Headphones className="w-4 h-4" /> Support ({tickets.length})
        </button>
      </div>

      {activeTab === 'marketing' && (
        <MarketingPanel
          leads={leads}
          users={users}
          search={search}
          onRefresh={fetchData}
          canEdit={user?.role === 'admin' || user?.permissions?.crm_marketing?.includes('create')}
          onCreateQuotation={(lead) => { setQuotationFromLead(lead); setActiveTab('quotations'); navigate('/crm?tab=quotations'); }}
        />
      )}
      {activeTab === 'quotations' && (
        <QuotationsPanel
          quotations={quotations}
          leads={leads}
          customers={customers}
          items={items}
          search={search}
          onRefresh={fetchData}
          canEdit={user?.role === 'admin' || user?.permissions?.crm_marketing?.includes('create')}
          prefillFromLead={quotationFromLead}
          onPrefillConsumed={() => setQuotationFromLead(null)}
        />
      )}
      {activeTab === 'support' && (
        <SupportPanel tickets={tickets} customers={customers} users={users} search={search} onRefresh={fetchData} canEdit={user?.role === 'admin' || user?.permissions?.crm_support?.includes('create')} />
      )}
    </div>
  );
}

/* ============================================================================
 *  MARKETING PANEL — Leads
 * ========================================================================= */
function MarketingPanel({ leads, users, search, onRefresh, canEdit, onCreateQuotation }) {
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', customer_name: '', contact_person: '', email: '', phone: '', source: 'website', estimated_value: 0, assignee_id: '', next_followup: '', notes: '', stage: 'enquiry' });
  const [activityDialog, setActivityDialog] = useState({ open: false, lead: null, note: '' });
  const [convertDialog, setConvertDialog] = useState({ open: false, lead: null, code: '', gstin: '', address: '' });

  const openDialog = (lead) => {
    if (lead) {
      setEditing(lead);
      setForm({
        name: lead.name || '',
        customer_name: lead.customer_name || '',
        contact_person: lead.contact_person || '',
        email: lead.email || '',
        phone: lead.phone || '',
        source: lead.source || 'website',
        estimated_value: lead.estimated_value || 0,
        assignee_id: lead.assignee_id || '',
        next_followup: lead.next_followup ? String(lead.next_followup).slice(0, 10) : '',
        notes: lead.notes || '',
        stage: lead.stage || 'new',
      });
    } else {
      setEditing(null);
      setForm({ name: '', customer_name: '', contact_person: '', email: '', phone: '', source: 'website', estimated_value: 0, assignee_id: '', next_followup: '', notes: '', stage: 'enquiry' });
    }
    setDialog(true);
  };

  const save = async () => {
    try {
      if (!form.name.trim() || !form.customer_name.trim()) { alert('Lead title + customer name are required'); return; }
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
    if (!window.confirm(`Delete lead "${lead.name}"?`)) return;
    try { await api.delete(`/api/crm/leads/${lead.id}`); onRefresh(); }
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
  const totals = LEAD_STAGES.map(s => {
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
          <button className="btn-primary flex items-center gap-1" onClick={() => openDialog(null)} data-testid="add-lead-btn">
            <Plus className="w-4 h-4" /> New Lead
          </button>
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
                        {LEAD_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`status-badge ${LEAD_STAGES.find(s => s.key === l.stage)?.color || ''}`}>{LEAD_STAGES.find(s => s.key === l.stage)?.label || l.stage}</span>
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
                    {canEdit && <button onClick={() => deleteLead(l)} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`lead-delete-${l.id}`}><Trash2 className="w-4 h-4" /></button>}
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
              <div>
                <label className="block text-xs font-semibold mb-1">Customer / Company *</label>
                <input type="text" className="input-field" placeholder="Free-text company name" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} data-testid="lead-customer" />
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
                  <SelectContent>{LEAD_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
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
    </div>
  );
}

/* ============================================================================
 *  SUPPORT PANEL — Tickets
 * ========================================================================= */
function SupportPanel({ tickets, customers, users, search, onRefresh, canEdit }) {
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ subject: '', customer_id: '', description: '', priority: 'medium', assignee_id: '', linked_so_id: '', stage: 'complaint' });
  const [activityDialog, setActivityDialog] = useState({ open: false, ticket: null, note: '' });

  const openDialog = (t) => {
    if (t) {
      setEditing(t);
      setForm({
        subject: t.subject || '',
        customer_id: t.customer_id || '',
        description: t.description || '',
        priority: t.priority || 'medium',
        assignee_id: t.assignee_id || '',
        linked_so_id: t.linked_so_id || '',
        stage: t.stage || 'new',
      });
    } else {
      setEditing(null);
      setForm({ subject: '', customer_id: '', description: '', priority: 'medium', assignee_id: '', linked_so_id: '', stage: 'complaint' });
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
    if (!window.confirm(`Delete ticket "${t.ticket_no}"?`)) return;
    try { await api.delete(`/api/crm/tickets/${t.id}`); onRefresh(); }
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

  // Breach summary
  const breachedCount = filtered.filter(t => t.sla_breached).length;
  const openCount = filtered.filter(t => !['closed'].includes(t.stage)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="border border-[#E5E7EB] bg-white rounded-sm px-3 py-2 min-w-[120px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">Open Tickets</div>
            <div className="text-lg font-semibold mono text-[#1D3557]">{openCount}</div>
          </div>
          <div className={`border rounded-sm px-3 py-2 min-w-[120px] ${breachedCount > 0 ? 'border-[#9B1C1C] bg-[#FDE8E8]' : 'border-[#E5E7EB] bg-white'}`}>
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
              const stageData = TICKET_STAGES.find(s => s.key === t.stage);
              const priorityData = PRIORITY_OPTIONS.find(p => p.key === t.priority);
              return (
                <tr key={t.id} data-testid={`ticket-row-${t.id}`} className={t.sla_breached ? 'bg-[#FEF2F2]' : ''}>
                  <td className="mono font-medium">{t.ticket_no}</td>
                  <td>
                    <div className="font-medium text-[#1D3557]">{t.subject}</div>
                    <div className="text-xs text-[#4B5563]">{t.customer?.name || '—'}{t.linked_so?.order_number && <span className="ml-2 text-[10px] text-[#1E429F]">SO: {t.linked_so.order_number}</span>}</div>
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
                        <SelectContent>{TICKET_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
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
                      {canEdit && <button onClick={() => deleteTicket(t)} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`ticket-delete-${t.id}`}><Trash2 className="w-4 h-4" /></button>}
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
                  <SelectContent>{TICKET_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
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
              <div>
                <label className="block text-xs font-semibold mb-1">Linked SO (optional)</label>
                <input type="text" className="input-field mono" placeholder="Paste SO ID" value={form.linked_so_id} onChange={e => setForm({ ...form, linked_so_id: e.target.value })} data-testid="ticket-so" />
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

function emptyQuotationLine() {
  return { item_id: '', description: '', quantity: 1, uom: 'Nos', rate: 0, gst_rate: 18 };
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
      description: it?.name || '',
      uom: it?.uom || 'Nos',
      rate: it?.sale_price || it?.unit_cost || 0,
      gst_rate: it?.gst_rate ?? 18,
    });
  };

  const totals = React.useMemo(() => {
    let sub = 0, gst = 0;
    form.lines.forEach(l => {
      const a = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
      sub += a;
      gst += a * ((parseFloat(l.gst_rate) || 0) / 100);
    });
    return { sub, gst, total: sub + gst };
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
          gst_rate: parseFloat(l.gst_rate) || 0,
        })),
      };
      if (editing) await api.put(`/api/crm/quotations/${editing.id}`, payload);
      else await api.post('/api/crm/quotations', payload);
      setDialog(false); setEditing(null); setForm(emptyForm); onRefresh();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to save quotation'); }
  };

  const deleteQuotation = async (q) => {
    if (!window.confirm(`Delete quotation ${q.quotation_no}?`)) return;
    try { await api.delete(`/api/crm/quotations/${q.id}`); onRefresh(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
  };

  const quickStatusChange = async (q, status) => {
    try { await api.put(`/api/crm/quotations/${q.id}`, { status }); onRefresh(); }
    catch (e) { alert(e.response?.data?.detail || 'Failed'); }
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
              const isLocked = q.status === 'converted';
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
                        {q.converted_so_no && <span className="ml-1 text-[10px]">({q.converted_so_no})</span>}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-0.5">
                      {canEdit && !isLocked && q.status !== 'rejected' && (
                        <button onClick={() => setConvertDialog({ open: true, quotation: q })} className="p-1.5 text-[#03543F] hover:bg-[#DEF7EC] rounded" title="Convert to Sales Order" data-testid={`quotation-convert-${q.id}`}><Send className="w-4 h-4" /></button>
                      )}
                      {canEdit && !isLocked && <button onClick={() => openDialog(q, null)} className="p-1.5 text-[#4B5563] hover:text-[#1D3557] hover:bg-[#F3F4F6] rounded" title="Edit" data-testid={`quotation-edit-${q.id}`}><Edit2 className="w-4 h-4" /></button>}
                      {canEdit && !isLocked && <button onClick={() => deleteQuotation(q)} className="p-1.5 text-[#4B5563] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded" title="Delete" data-testid={`quotation-delete-${q.id}`}><Trash2 className="w-4 h-4" /></button>}
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
                      <th className="text-left p-2 min-w-[200px]">Item</th>
                      <th className="text-left p-2 min-w-[180px]">Description</th>
                      <th className="text-left p-2 w-20">Qty</th>
                      <th className="text-left p-2 w-20">UOM</th>
                      <th className="text-left p-2 w-24">Rate (₹)</th>
                      <th className="text-left p-2 w-20">GST %</th>
                      <th className="text-right p-2 w-28">Amount</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((l, idx) => {
                      const amount = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
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
                  <div className="flex justify-between"><span>Subtotal:</span><span className="mono">{formatCurrency(totals.sub)}</span></div>
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
    </div>
  );
}
