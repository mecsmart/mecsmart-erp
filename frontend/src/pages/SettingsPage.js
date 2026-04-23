import React, { useState, useEffect, useRef } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Building2, Save, MapPin, Plus, Trash2, Edit2, Truck, X, Upload, Image, DollarSign, FileText, Database, Download, UploadCloud, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

const CURRENCIES = [
  { code: 'INR', symbol: '\u20B9', name: 'Indian Rupee (\u20B9)' },
  { code: 'USD', symbol: '$', name: 'US Dollar ($)' },
];

export default function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const { refreshSettings } = useCompanySettings();
  const [settings, setSettings] = useState({
    company_name: '', gstin: '', state_code: '',
    address: '', address_line2: '', city: '', state: '', pin_code: '', country: 'India',
    pan: '', cin: '', phone: '', email: '', website: '',
    logo_data: '', tagline: '', primary_currency: 'INR', secondary_currency: 'USD'
  });
  const [states, setStates] = useState([]);
  const [chargeTypes, setChargeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('company');
  const [chargeDialog, setChargeDialog] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);
  const [chargeForm, setChargeForm] = useState({ name: '', hsn_code: '', gst_rate: 18 });
  const [numberSeries, setNumberSeries] = useState([]);
  const [savingSeries, setSavingSeries] = useState({});
  // Editable GST slabs
  const [taxSlabs, setTaxSlabs] = useState([]);
  const [newSlab, setNewSlab] = useState('');
  // Units of Measure master
  const [uoms, setUoms] = useState([]);
  const [uomDialog, setUomDialog] = useState(false);
  const [editingUom, setEditingUom] = useState(null);
  const [uomForm, setUomForm] = useState({ code: '', name: '', description: '' });
  const fileInputRef = useRef(null);
  const isAdmin = user?.role === 'admin' || hasPermission('settings', 'edit');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, statesRes, chargesRes, seriesRes, slabsRes, uomsRes] = await Promise.all([
        api.get('/api/settings/company'),
        api.get('/api/settings/states'),
        api.get('/api/settings/po-charges'),
        api.get('/api/settings/number-series'),
        api.get('/api/settings/gst-slabs'),
        api.get('/api/settings/uoms'),
      ]);
      setSettings(settingsRes.data);
      setStates(statesRes.data);
      setChargeTypes(chargesRes.data);
      setNumberSeries(seriesRes.data || []);
      setTaxSlabs(Array.isArray(slabsRes.data) ? slabsRes.data : []);
      setUoms(Array.isArray(uomsRes.data) ? uomsRes.data : []);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally { setLoading(false); }
  };

  const addTaxSlab = async () => {
    const r = parseFloat(newSlab);
    if (isNaN(r) || r < 0 || r > 100) { toast.error('Enter a rate between 0 and 100'); return; }
    try {
      await api.post('/api/settings/gst-slabs', { rate: r });
      const { data } = await api.get('/api/settings/gst-slabs');
      setTaxSlabs(data);
      setNewSlab('');
      toast.success(`GST ${r}% slab added`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add slab');
    }
  };

  const deleteTaxSlab = async (rate) => {
    if (!window.confirm(`Remove ${rate}% slab?`)) return;
    try {
      await api.delete(`/api/settings/gst-slabs/${rate}`);
      setTaxSlabs(prev => prev.filter(r => r !== rate));
      toast.success(`GST ${rate}% slab removed`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to remove slab');
    }
  };

  const openUomDialog = (u = null) => {
    setEditingUom(u);
    setUomForm(u ? { code: u.code || '', name: u.name || '', description: u.description || '' }
                 : { code: '', name: '', description: '' });
    setUomDialog(true);
  };

  const saveUom = async () => {
    const payload = {
      code: (uomForm.code || '').trim().toLowerCase(),
      name: (uomForm.name || '').trim(),
      description: (uomForm.description || '').trim(),
    };
    if (!payload.code || !payload.name) { toast.error('Code and Name are required'); return; }
    try {
      if (editingUom) {
        const { data } = await api.put(`/api/settings/uoms/${editingUom.id}`, payload);
        const c = data?.cascaded || {};
        const totalCascaded = Object.values(c).reduce((s, v) => s + (Number(v) || 0), 0);
        if (totalCascaded > 0) {
          toast.success(`UOM ${payload.code} updated — cascaded to ${c.items || 0} item(s), ${c.purchase_orders || 0} PO(s), ${c.purchase_invoices || 0} PI(s).`);
        } else {
          toast.success(`UOM ${payload.code} updated`);
        }
      } else {
        await api.post('/api/settings/uoms', payload);
        toast.success(`UOM ${payload.code} created`);
      }
      setUomDialog(false);
      const { data } = await api.get('/api/settings/uoms');
      setUoms(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save UOM');
    }
  };

  const deleteUom = async (id, code) => {
    if (!window.confirm(`Delete UOM '${code}'?`)) return;
    try {
      await api.delete(`/api/settings/uoms/${id}`);
      setUoms(prev => prev.filter(u => u.id !== id));
      toast.success(`UOM ${code} deleted`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete UOM');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/api/settings/company', settings);
      setSettings(data);
      refreshSettings();
      alert('Company settings saved successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save settings');
    } finally { setSaving(false); }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert('Logo file must be under 500KB'); return; }
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setSettings({ ...settings, logo_data: ev.target.result });
    reader.readAsDataURL(file);
  };

  const removeLogo = () => setSettings({ ...settings, logo_data: '' });

  const handlePrimaryCurrencyChange = (val) => {
    const other = CURRENCIES.find(c => c.code !== val);
    setSettings({ ...settings, primary_currency: val, secondary_currency: other?.code || (val === 'INR' ? 'USD' : 'INR') });
  };

  const openChargeDialog = (charge = null) => {
    setEditingCharge(charge);
    setChargeForm(charge ? { name: charge.name, hsn_code: charge.hsn_code || '', gst_rate: charge.gst_rate != null ? charge.gst_rate : 18 } : { name: '', hsn_code: '', gst_rate: 18 });
    setChargeDialog(true);
  };

  const saveCharge = async () => {
    try {
      if (editingCharge) { await api.put(`/api/settings/po-charges/${editingCharge.id}`, chargeForm); }
      else { await api.post('/api/settings/po-charges', chargeForm); }
      setChargeDialog(false);
      fetchData();
    } catch (error) { alert(error.response?.data?.detail || 'Failed to save charge type'); }
  };

  const deleteCharge = async (id) => {
    if (!window.confirm('Delete this charge type?')) return;
    try { await api.delete(`/api/settings/po-charges/${id}`); fetchData(); }
    catch (error) { alert('Failed to delete charge type'); }
  };

  const updateSeriesField = (key, field, value) => {
    setNumberSeries(prev => prev.map(s => s.key === key ? { ...s, [field]: value } : s));
  };

  const saveSeries = async (key) => {
    const s = numberSeries.find(x => x.key === key);
    if (!s) return;
    setSavingSeries(p => ({ ...p, [key]: true }));
    try {
      const payload = {
        prefix: s.prefix || '',
        padding: parseInt(s.padding) || 4,
        next_number: parseInt(s.next_number) || 1,
        reset_yearly: !!s.reset_yearly,
      };
      const { data } = await api.put(`/api/settings/number-series/${key}`, payload);
      setNumberSeries(prev => prev.map(x => x.key === key ? data : x));
      alert(`${s.label} series saved`);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save series');
    } finally {
      setSavingSeries(p => ({ ...p, [key]: false }));
    }
  };

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#1D3557]">Settings</h1>
          <p className="text-sm text-[#4B5563]">Manage company profile, branding, currency and PO configuration</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="company">Company Details</TabsTrigger>
          <TabsTrigger value="branding" data-testid="branding-tab">Branding & Currency</TabsTrigger>
          <TabsTrigger value="po-charges" data-testid="po-charges-tab">PO Section</TabsTrigger>
          <TabsTrigger value="number-series" data-testid="number-series-tab">Number Series</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="integrations-tab">Integrations</TabsTrigger>
        </TabsList>

        {/* ====== Company & GST Tab ====== */}
        <TabsContent value="company" className="space-y-6 mt-4">
          {isAdmin && (
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center space-x-2" data-testid="save-settings-btn">
                <Save className="w-4 h-4" /><span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-flat p-6">
              <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] mb-4 flex items-center space-x-2">
                <Building2 className="w-5 h-5" /><span>Company Information</span>
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[#374151]">Company Name *</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={settings.company_name || ''} onChange={e => setSettings({...settings, company_name: e.target.value})} disabled={!isAdmin} data-testid="company-name-input" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151]">Address Line 1</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" placeholder="Plot/Building/Street" value={settings.address || ''} onChange={e => setSettings({...settings, address: e.target.value})} disabled={!isAdmin} data-testid="company-address-input" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151]">Address Line 2</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" placeholder="Area/Locality" value={settings.address_line2 || ''} onChange={e => setSettings({...settings, address_line2: e.target.value})} disabled={!isAdmin} data-testid="company-address2-input" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium text-[#374151]">City</label>
                    <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={settings.city || ''} onChange={e => setSettings({...settings, city: e.target.value})} disabled={!isAdmin} data-testid="company-city-input" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#374151]">State</label>
                    <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={settings.state || ''} onChange={e => setSettings({...settings, state: e.target.value})} disabled={!isAdmin} data-testid="company-state-name-input" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#374151]">Pin Code</label>
                    <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono" maxLength={6} placeholder="411019" value={settings.pin_code || ''} onChange={e => setSettings({...settings, pin_code: e.target.value.replace(/\D/g, '')})} disabled={!isAdmin} data-testid="company-pincode-input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#374151]">Phone</label>
                    <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={settings.phone || ''} onChange={e => setSettings({...settings, phone: e.target.value})} disabled={!isAdmin} data-testid="company-phone-input" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#374151]">Email</label>
                    <input type="email" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" value={settings.email || ''} onChange={e => setSettings({...settings, email: e.target.value})} disabled={!isAdmin} data-testid="company-email-input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#374151]">Website</label>
                    <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" placeholder="www.company.com" value={settings.website || ''} onChange={e => setSettings({...settings, website: e.target.value})} disabled={!isAdmin} data-testid="company-website-input" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#374151]">Country</label>
                    <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" placeholder="India" value={settings.country || ''} onChange={e => setSettings({...settings, country: e.target.value})} disabled={!isAdmin} data-testid="company-country-input" />
                  </div>
                </div>
              </div>
            </div>

            <div className="card-flat p-6">
              <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] mb-4 flex items-center space-x-2">
                <MapPin className="w-5 h-5" /><span>GST Configuration</span>
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[#374151]">GSTIN *</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono uppercase" maxLength={15} placeholder="22AAAAA0000A1Z5" value={settings.gstin || ''} onChange={e => setSettings({...settings, gstin: e.target.value.toUpperCase()})} disabled={!isAdmin} data-testid="company-gstin-input" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151]">GST State *</label>
                  <Select value={settings.state_code || ''} onValueChange={v => setSettings({...settings, state_code: v})} disabled={!isAdmin}>
                    <SelectTrigger data-testid="company-state-select"><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>
                      {states.map(s => <SelectItem key={s.code} value={s.code}>{s.code} - {s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151]">PAN</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono uppercase" maxLength={10} placeholder="AAAAA0000A" value={settings.pan || ''} onChange={e => setSettings({...settings, pan: e.target.value.toUpperCase()})} disabled={!isAdmin} data-testid="company-pan-input" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151]">CIN</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono uppercase" value={settings.cin || ''} onChange={e => setSettings({...settings, cin: e.target.value.toUpperCase()})} disabled={!isAdmin} data-testid="company-cin-input" />
                </div>
              </div>
            </div>
          </div>
          <div className="card-flat p-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557]">GST Tax Slabs</h2>
                <p className="text-sm text-[#4B5563]">Configured GST rates used across Items, POs, Invoices & Quotations.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-center" data-testid="gst-slabs-list">
              {(taxSlabs.length ? taxSlabs : [0,5,12,18,28]).map(rate => (
                <div key={rate} className="relative group flex items-center justify-center w-20 h-16 rounded-sm border-2 border-[#1D3557] bg-[#F0F4F8]" data-testid={`gst-slab-${rate}`}>
                  <span className="font-mono font-bold text-lg text-[#1D3557]">{rate}%</span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => deleteTaxSlab(rate)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#FDE8E8] text-[#9B1C1C] border border-[#9B1C1C] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs"
                      title={`Remove ${rate}% slab`}
                      data-testid={`gst-slab-delete-${rate}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {isAdmin && (
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={newSlab}
                    onChange={e => setNewSlab(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTaxSlab(); } }}
                    placeholder="e.g. 3"
                    className="w-24 px-2 py-1 border border-[#D1D5DB] rounded-sm text-sm mono"
                    data-testid="gst-slab-new-input"
                  />
                  <button
                    type="button"
                    onClick={addTaxSlab}
                    className="btn-secondary flex items-center space-x-1 text-sm"
                    data-testid="gst-slab-add-btn"
                  >
                    <Plus className="w-4 h-4" /><span>Add Slab</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="card-flat p-6" data-testid="uom-master-card">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557]">Units of Measure</h2>
                <p className="text-sm text-[#4B5563]">Global UOM master used by Items, BOM, POs & Invoices. Codes are case-insensitive.</p>
              </div>
              {isAdmin && (
                <button onClick={() => openUomDialog()} className="btn-primary flex items-center space-x-2" data-testid="uom-add-btn">
                  <Plus className="w-4 h-4" /><span>Add Unit</span>
                </button>
              )}
            </div>
            {uoms.length === 0 ? (
              <div className="text-center py-6 text-[#4B5563] bg-[#F3F4F6] rounded-sm text-sm">No units defined yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="uoms-table">
                  <thead><tr><th className="w-24">Code</th><th>Name</th><th>Description</th><th className="w-24 text-right">Actions</th></tr></thead>
                  <tbody>
                    {uoms.map(u => (
                      <tr key={u.id} data-testid={`uom-row-${u.code}`}>
                        <td className="mono font-semibold">{u.code}</td>
                        <td>{u.name}</td>
                        <td className="text-[#6B7280]">{u.description || '-'}</td>
                        <td>
                          <div className="flex items-center justify-end space-x-2">
                            {isAdmin && (<>
                              <button onClick={() => openUomDialog(u)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Edit" data-testid={`uom-edit-${u.code}`}>
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => deleteUom(u.id, u.code)} className="p-1 text-[#9B1C1C] hover:text-[#DC2626]" title="Delete" data-testid={`uom-delete-${u.code}`}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Dialog open={uomDialog} onOpenChange={setUomDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle className="font-[Chivo]">{editingUom ? 'Edit' : 'Add'} Unit of Measure</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-3">
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Code *</label>
                  <input type="text" value={uomForm.code} onChange={e => setUomForm({...uomForm, code: e.target.value.toLowerCase()})} className="input-field mono" placeholder="e.g. kg" data-testid="uom-code-input" maxLength={12} />
                  <p className="text-[11px] text-[#6B7280] mt-1">Short code (stored lowercased).</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Name *</label>
                  <input type="text" value={uomForm.name} onChange={e => setUomForm({...uomForm, name: e.target.value})} className="input-field" placeholder="Kilogram" data-testid="uom-name-input" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Description</label>
                  <input type="text" value={uomForm.description} onChange={e => setUomForm({...uomForm, description: e.target.value})} className="input-field" placeholder="(optional)" data-testid="uom-description-input" />
                </div>
                <div className="flex justify-end space-x-3 pt-3 border-t border-[#E5E7EB]">
                  <button onClick={() => setUomDialog(false)} className="btn-secondary">Cancel</button>
                  <button onClick={saveUom} className="btn-primary" disabled={!uomForm.code.trim() || !uomForm.name.trim()} data-testid="uom-save-btn">{editingUom ? 'Update' : 'Create'}</button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <div className="card-flat p-6">
            <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] mb-2">Bank Details</h2>
            <p className="text-sm text-[#4B5563] mb-4">Printed on Proforma &amp; Tax Invoices (auto-injected into the &quot;Bank Details&quot; block of every invoice layout).</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-[#374151]">Bank Name</label>
                <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" placeholder="e.g. HDFC Bank" value={settings.bank_name || ''} onChange={e => setSettings({ ...settings, bank_name: e.target.value })} disabled={!isAdmin} data-testid="company-bank-name-input" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151]">Branch</label>
                <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" placeholder="e.g. Koramangala, Bangalore" value={settings.bank_branch || ''} onChange={e => setSettings({ ...settings, bank_branch: e.target.value })} disabled={!isAdmin} data-testid="company-bank-branch-input" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151]">Account Number</label>
                <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono" placeholder="e.g. 50100XXXXXX" value={settings.bank_account || ''} onChange={e => setSettings({ ...settings, bank_account: e.target.value })} disabled={!isAdmin} data-testid="company-bank-account-input" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151]">IFSC Code</label>
                <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono uppercase" maxLength={11} placeholder="HDFC0000XXX" value={settings.bank_ifsc || ''} onChange={e => setSettings({ ...settings, bank_ifsc: e.target.value.toUpperCase() })} disabled={!isAdmin} data-testid="company-bank-ifsc-input" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-[#374151]">UPI ID <span className="text-xs text-[#9CA3AF]">(optional)</span></label>
                <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm font-mono" placeholder="e.g. machineworks@upi" value={settings.bank_upi || ''} onChange={e => setSettings({ ...settings, bank_upi: e.target.value })} disabled={!isAdmin} data-testid="company-bank-upi-input" />
              </div>
            </div>
          </div>

          {isAdmin && <DataBackupRestoreCard />}
        </TabsContent>
        <TabsContent value="branding" className="space-y-6 mt-4">
          {isAdmin && (
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center space-x-2" data-testid="save-branding-btn">
                <Save className="w-4 h-4" /><span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Logo & Tagline */}
            <div className="card-flat p-6">
              <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] mb-4 flex items-center space-x-2">
                <Image className="w-5 h-5" /><span>Company Logo & Tagline</span>
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[#374151] mb-2 block">Company Logo</label>
                  {settings.logo_data ? (
                    <div className="relative inline-block">
                      <div className="border-2 border-dashed border-[#D1D5DB] rounded-sm p-3 bg-white inline-block">
                        <img src={settings.logo_data} alt="Company Logo" className="max-h-24 max-w-[200px] object-contain" data-testid="logo-preview" />
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => fileInputRef.current?.click()} className="text-xs text-[#1D3557] hover:underline flex items-center gap-1" data-testid="change-logo-btn">
                            <Upload className="w-3 h-3" /> Change
                          </button>
                          <button onClick={removeLogo} className="text-xs text-[#9B1C1C] hover:underline flex items-center gap-1" data-testid="remove-logo-btn">
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`border-2 border-dashed border-[#D1D5DB] rounded-sm p-6 text-center bg-[#F9FAFB] ${isAdmin ? 'cursor-pointer hover:border-[#1D3557] hover:bg-[#F0F4F8] transition-colors' : ''}`}
                      onClick={() => isAdmin && fileInputRef.current?.click()}
                      data-testid="logo-upload-area"
                    >
                      <Upload className="w-8 h-8 mx-auto mb-2 text-[#9CA3AF]" />
                      <p className="text-sm text-[#6B7280]">Click to upload company logo</p>
                      <p className="text-xs text-[#9CA3AF] mt-1">PNG, JPG up to 500KB. Appears on printed documents.</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoUpload} className="hidden" data-testid="logo-file-input" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151]">Tagline</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" placeholder="e.g. Precision Engineering Solutions" value={settings.tagline || ''} onChange={e => setSettings({...settings, tagline: e.target.value})} disabled={!isAdmin} data-testid="tagline-input" />
                  <p className="text-xs text-[#9CA3AF] mt-1">Displayed below company name on print formats</p>
                </div>
              </div>
            </div>

            {/* Currency Settings */}
            <div className="card-flat p-6">
              <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] mb-4 flex items-center space-x-2">
                <DollarSign className="w-5 h-5" /><span>Currency Configuration</span>
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-[#374151] mb-1 block">Primary Currency</label>
                  <p className="text-xs text-[#9CA3AF] mb-2">Default currency used across the application</p>
                  <Select value={settings.primary_currency || 'INR'} onValueChange={handlePrimaryCurrencyChange} disabled={!isAdmin}>
                    <SelectTrigger data-testid="primary-currency-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="flex items-center gap-2"><span className="font-mono text-base font-bold">{c.symbol}</span><span>{c.name}</span></span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151] mb-1 block">Secondary Currency</label>
                  <p className="text-xs text-[#9CA3AF] mb-2">Available as an alternative on individual transactions</p>
                  <Select value={settings.secondary_currency || 'USD'} onValueChange={v => setSettings({...settings, secondary_currency: v})} disabled={!isAdmin}>
                    <SelectTrigger data-testid="secondary-currency-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.filter(c => c.code !== settings.primary_currency).map(c => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="flex items-center gap-2"><span className="font-mono text-base font-bold">{c.symbol}</span><span>{c.name}</span></span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-[#F0F4F8] rounded-sm p-4 border border-[#E5E7EB]">
                  <p className="text-xs font-semibold text-[#374151] uppercase tracking-wide mb-3">Preview</p>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#6B7280]">Primary display:</span>
                      <span className="mono font-bold text-[#1D3557] text-lg" data-testid="currency-preview-primary">
                        {(CURRENCIES.find(c => c.code === settings.primary_currency) || CURRENCIES[0]).symbol}1,25,000.00
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#6B7280]">Secondary:</span>
                      <span className="mono text-[#6B7280]" data-testid="currency-preview-secondary">
                        {(CURRENCIES.find(c => c.code === settings.secondary_currency) || CURRENCIES[1]).symbol}1,500.00
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ====== PO Charges Tab ====== */}
        <TabsContent value="po-charges" className="space-y-6 mt-4">
          <div className="card-flat p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] flex items-center space-x-2">
                  <Truck className="w-5 h-5" /><span>PO Section</span>
                </h2>
                <p className="text-sm text-[#4B5563]">Define charge types (Transportation, Handling, Packing, etc.) that appear as additional cost lines on every Purchase Order. Default PO Terms &amp; Conditions have moved to <span className="font-medium">Inventory → Configuration</span>.</p>
              </div>
              {isAdmin && (
                <button onClick={() => openChargeDialog()} className="btn-primary flex items-center space-x-2" data-testid="add-charge-type-btn">
                  <Plus className="w-4 h-4" /><span>Add Charge Type</span>
                </button>
              )}
            </div>
            {chargeTypes.length === 0 ? (
              <div className="text-center py-8 text-[#4B5563] bg-[#F3F4F6] rounded-sm">
                <Truck className="w-10 h-10 mx-auto mb-2 text-[#9CA3AF]" />
                <p className="text-sm">No charge types defined yet</p>
                <p className="text-xs text-[#9CA3AF] mt-1">Add charge types that will appear as additional cost lines on Purchase Orders</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table" data-testid="charge-types-table">
                  <thead><tr><th>Charge Name</th><th>HSN Code</th><th>GST Rate</th><th>Actions</th></tr></thead>
                  <tbody>
                    {chargeTypes.map(ct => (
                      <tr key={ct.id} data-testid={`charge-type-row-${ct.id}`}>
                        <td className="font-medium">{ct.name}</td>
                        <td className="mono">{ct.hsn_code || '-'}</td>
                        <td className="mono">{ct.gst_rate}%</td>
                        <td>
                          <div className="flex items-center space-x-2">
                            {isAdmin && (<>
                              <button onClick={() => openChargeDialog(ct)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Edit"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => deleteCharge(ct.id)} className="p-1 text-[#9B1C1C] hover:text-[#DC2626]" title="Delete"><Trash2 className="w-4 h-4" /></button>
                            </>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <Dialog open={chargeDialog} onOpenChange={setChargeDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle className="font-[Chivo]">{editingCharge ? 'Edit' : 'Add'} Charge Type</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-3">
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">Charge Name *</label>
                  <input type="text" value={chargeForm.name} onChange={e => setChargeForm({...chargeForm, name: e.target.value})} className="input-field" placeholder="e.g. Transportation Charges" data-testid="charge-name-input" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">HSN Code</label>
                  <input type="text" value={chargeForm.hsn_code} onChange={e => setChargeForm({...chargeForm, hsn_code: e.target.value})} className="input-field mono" placeholder="e.g. 996511" data-testid="charge-hsn-input" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#111827] mb-1">GST Rate (%)</label>
                  <Select value={String(chargeForm.gst_rate)} onValueChange={v => setChargeForm({...chargeForm, gst_rate: parseFloat(v)})}>
                    <SelectTrigger data-testid="charge-gst-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{[0,5,12,18,28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end space-x-3 pt-3 border-t border-[#E5E7EB]">
                  <button onClick={() => setChargeDialog(false)} className="btn-secondary">Cancel</button>
                  <button onClick={saveCharge} className="btn-primary" disabled={!chargeForm.name.trim()} data-testid="save-charge-btn">{editingCharge ? 'Update' : 'Create'}</button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ====== Number Series Tab ====== */}
        <TabsContent value="number-series" className="space-y-4 mt-4" data-testid="number-series-tab-content">
          <div className="bg-white border border-[#E5E7EB] rounded-sm p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[#111827] mb-1">Number Series</h2>
                <p className="text-xs text-[#6B7280]">Configure auto-incrementing prefix, padding, and start number for each document type. Enable <strong>Reset on new Financial Year</strong> to restart the counter every April 1st — the FY tag (e.g. <span className="mono bg-[#E1EFFE] text-[#1E429F] px-1 rounded">2627</span>) is automatically inserted between the prefix and the number.</p>
              </div>
              <div className="bg-[#F3F4F6] border border-[#D1D5DB] rounded-sm px-3 py-2 text-xs text-[#374151] shrink-0 ml-4">
                <div className="text-[10px] uppercase tracking-wide text-[#6B7280]">Current FY</div>
                <div className="mono font-semibold text-sm text-[#1D3557]" data-testid="current-fy-badge">{numberSeries[0]?.current_fy || 'FY—'}</div>
              </div>
            </div>

            {(() => {
              const groups = [
                { key: 'crm', label: 'CRM — Sales Cycle', desc: 'Quotation → Proforma → Tax Invoice issued to customers' },
                { key: 'sales', label: 'Sales Orders', desc: 'Internal SO numbering for confirmed orders' },
                { key: 'procurement', label: 'Procurement', desc: 'Purchase Orders and Purchase Invoices' },
                { key: 'stores', label: 'Stores — Dispatch', desc: 'Packing Lists generated from Tax Invoices' },
                { key: 'masters', label: 'Master Codes', desc: 'Vendor and Customer code generation' },
              ];
              return groups.map(g => {
                const items = numberSeries.filter(s => (s.group || 'misc') === g.key);
                if (items.length === 0) return null;
                return (
                  <div key={g.key} className="mb-5 last:mb-0">
                    <div className="flex items-baseline gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-[#1D3557]">{g.label}</h3>
                      <span className="text-[11px] text-[#6B7280]">{g.desc}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map(s => {
                        const preview = s.preview || `${s.prefix || ''}${String(s.next_number || 1).padStart(s.padding || 4, '0')}`;
                        return (
                          <div key={s.key} className="grid grid-cols-12 gap-3 items-end border border-[#E5E7EB] rounded-sm p-3 bg-[#F9FAFB]" data-testid={`series-row-${s.key}`}>
                            <div className="col-span-3">
                              <label className="block text-xs font-semibold text-[#6B7280] uppercase mb-1">{s.label}</label>
                              <div className="mono text-xs bg-[#E1EFFE] text-[#1E429F] inline-block px-2 py-1 rounded" data-testid={`series-preview-${s.key}`}>Next: {preview}</div>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-[#374151] mb-1">Prefix</label>
                              <input
                                type="text"
                                value={s.prefix || ''}
                                onChange={e => updateSeriesField(s.key, 'prefix', e.target.value)}
                                className="input-field mono"
                                disabled={!isAdmin}
                                placeholder="e.g. QUO-"
                                data-testid={`series-prefix-${s.key}`}
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-[#374151] mb-1">Start / Next #</label>
                              <input
                                type="number"
                                min="1"
                                value={s.next_number || 1}
                                onChange={e => updateSeriesField(s.key, 'next_number', parseInt(e.target.value) || 1)}
                                className="input-field mono"
                                disabled={!isAdmin}
                                data-testid={`series-start-${s.key}`}
                              />
                            </div>
                            <div className="col-span-1">
                              <label className="block text-xs text-[#374151] mb-1">Padding</label>
                              <input
                                type="number"
                                min="1"
                                max="12"
                                value={s.padding || 4}
                                onChange={e => updateSeriesField(s.key, 'padding', parseInt(e.target.value) || 4)}
                                className="input-field mono"
                                disabled={!isAdmin}
                                data-testid={`series-padding-${s.key}`}
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="flex items-center gap-2 text-xs text-[#374151] pt-5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!s.reset_yearly}
                                  onChange={e => updateSeriesField(s.key, 'reset_yearly', e.target.checked)}
                                  disabled={!isAdmin}
                                  className="w-4 h-4 accent-[#1D3557]"
                                  data-testid={`series-reset-yearly-${s.key}`}
                                />
                                <span>Reset on new FY</span>
                              </label>
                            </div>
                            <div className="col-span-2">
                              <button
                                onClick={() => saveSeries(s.key)}
                                disabled={!isAdmin || savingSeries[s.key]}
                                className="btn-primary w-full disabled:opacity-50"
                                data-testid={`series-save-${s.key}`}
                              >
                                {savingSeries[s.key] ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
            {numberSeries.length === 0 && <p className="text-sm text-[#9CA3AF] italic">No series configured.</p>}
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4 mt-4" data-testid="integrations-tab-content">
          <div className="card-flat p-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557]">GSTIN Lookup (Appyflow)</h2>
                <p className="text-sm text-[#4B5563]">Auto-fetch supplier / vendor details (legal name, trade name, state, PIN, principal address) from GST portal by entering a GSTIN. Free 50 lookups/month, then ₹0.40–0.50/call on Appyflow.</p>
              </div>
              <a href="https://appyflow.in/verify-gst/" target="_blank" rel="noopener noreferrer" className="text-xs text-[#1E429F] underline whitespace-nowrap">Get key →</a>
            </div>
            <div className="space-y-3 mt-4">
              <div className="bg-[#FFFBEB] border border-[#F59E0B] rounded-sm p-3 text-xs text-[#92400E]">
                <strong>Note on Appyflow free tier:</strong> The first 50 lookups are free but Appyflow returns the SAME demo record (<em>DISHANT MAHAJAN / AppyFlow Technologies</em>) for every free-tier call — this is by their design to discourage abuse. To get live GST portal data for any GSTIN, top-up credits (min ≈ ₹500 = 1,250 lookups at ₹0.40/call) at <a href="https://dashboard.gstapi.appyflow.in/#/app/buy-credits" target="_blank" rel="noopener noreferrer" className="underline">dashboard.gstapi.appyflow.in</a>. Existing key/code works immediately after top-up — no changes needed here.
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#111827] mb-1">Appyflow API Key (key_secret)</label>
                <input
                  type="text"
                  value={settings.appyflow_api_key || ''}
                  onChange={e => setSettings({ ...settings, appyflow_api_key: e.target.value })}
                  className="input-field mono"
                  placeholder="Leave blank to use backend APPYFLOW_API_KEY env var"
                  disabled={!isAdmin}
                  data-testid="appyflow-key-input"
                />
                <p className="text-[11px] text-[#6B7280] mt-1">Override: this value takes precedence over the backend .env key. Keeps key portable when you switch environments.</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {isAdmin && (
                  <button onClick={handleSave} disabled={saving} className="btn-primary" data-testid="save-integrations-btn">
                    {saving ? 'Saving…' : 'Save Integrations'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const g = prompt('Enter a 15-char GSTIN to verify the integration:');
                    if (!g) return;
                    try {
                      const { data } = await api.post('/api/suppliers/lookup-gstin', { gstin: g.trim().toUpperCase() });
                      if (data.sandbox_mode) {
                        toast.warning('⚠️ Sandbox / free-tier response. Top up credits at appyflow.in to fetch real data.');
                      } else {
                        toast.success(`Live: ${data.legal_name || data.trade_name || 'Fetched'} (${data.status})`);
                      }
                    } catch (e) {
                      toast.error(e.response?.data?.detail || 'Lookup failed');
                    }
                  }}
                  className="btn-secondary"
                  data-testid="test-appyflow-btn"
                >
                  Test Lookup
                </button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------
// DataBackupRestoreCard — admin-only JSON backup/restore
// Renders under Settings → Company tab. POST/GET /api/settings/(backup|restore)
// ------------------------------------------------------------------
function DataBackupRestoreCard() {
  const fileRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [pendingFileName, setPendingFileName] = useState('');

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { data } = await api.get('/api/settings/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `mechsmart-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded successfully');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to download backup');
    } finally {
      setDownloading(false);
    }
  };

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.backup_version !== 1 || !parsed.collections) {
          toast.error('Invalid backup file — expected v1 format');
          return;
        }
        setPendingPayload(parsed);
        setPendingFileName(file.name);
        setConfirmOpen(true);
      } catch {
        toast.error('Could not parse JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!pendingPayload) return;
    setRestoring(true);
    try {
      const { data } = await api.post('/api/settings/restore', pendingPayload);
      const totalDocs = Object.values(data.summary || {}).reduce((s, n) => s + (n || 0), 0);
      toast.success(`Restore complete — ${totalDocs} documents loaded across ${Object.keys(data.summary || {}).length} collections`);
      setConfirmOpen(false);
      setPendingPayload(null);
      setPendingFileName('');
      // Force reload so stale state is dropped
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const collectionCount = pendingPayload ? Object.keys(pendingPayload.collections || {}).length : 0;
  const totalDocs = pendingPayload
    ? Object.values(pendingPayload.collections || {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0)
    : 0;

  return (
    <div className="card-flat p-6" data-testid="data-backup-restore-card">
      <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] mb-4 flex items-center space-x-2">
        <Database className="w-5 h-5" /><span>Data Backup & Restore</span>
      </h2>
      <p className="text-sm text-[#6B7280] mb-4">
        Export the entire ERP database as a single JSON file, or restore from a previously downloaded backup.
        <span className="block mt-1 text-[#9B1C1C]">Restore will <b>wipe & replace</b> every collection — use with caution.</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-[#D1D5DB] rounded-sm p-4 bg-[#F9FAFB]">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-4 h-4 text-[#1D3557]" />
            <span className="font-medium text-[#1D3557]">Download Backup</span>
          </div>
          <p className="text-xs text-[#6B7280] mb-3">Saves a timestamped <code>.json</code> file with all masters, transactions, users and settings.</p>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="backup-download-btn"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Preparing backup…' : 'Download Backup (JSON)'}
          </button>
        </div>

        <div className="border border-[#F87171] rounded-sm p-4 bg-[#FEF2F2]">
          <div className="flex items-center gap-2 mb-2">
            <UploadCloud className="w-4 h-4 text-[#9B1C1C]" />
            <span className="font-medium text-[#9B1C1C]">Restore from Backup</span>
          </div>
          <p className="text-xs text-[#991B1B] mb-3">Select a <code>.json</code> file saved earlier. Current data will be <b>replaced</b>.</p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFilePick}
            className="hidden"
            data-testid="backup-restore-file-input"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#9B1C1C] text-white rounded-sm hover:bg-[#7F1D1D]"
            data-testid="backup-restore-btn"
          >
            <UploadCloud className="w-4 h-4" />
            Choose Backup File…
          </button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!restoring) setConfirmOpen(o); }}>
        <DialogContent className="max-w-lg" data-testid="restore-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#9B1C1C]">
              <AlertTriangle className="w-5 h-5" /> Confirm Database Restore
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="bg-[#FEF2F2] border border-[#F87171] rounded-sm p-3 text-[#991B1B]">
              <p className="font-semibold mb-1">This action cannot be undone.</p>
              <p>Every listed collection will be wiped and replaced with the backup contents.
                We strongly recommend downloading a fresh backup first.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[#374151]">
              <div>
                <div className="text-xs text-[#6B7280]">File</div>
                <div className="font-mono text-xs truncate">{pendingFileName}</div>
              </div>
              <div>
                <div className="text-xs text-[#6B7280]">Generated</div>
                <div className="text-xs">{pendingPayload?.generated_at?.slice(0, 19)?.replace('T', ' ') || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-[#6B7280]">Collections</div>
                <div className="font-semibold">{collectionCount}</div>
              </div>
              <div>
                <div className="text-xs text-[#6B7280]">Documents</div>
                <div className="font-semibold">{totalDocs}</div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => { setConfirmOpen(false); setPendingPayload(null); }}
              disabled={restoring}
              className="px-4 py-2 border border-[#D1D5DB] text-[#374151] rounded-sm hover:bg-[#F3F4F6]"
              data-testid="restore-cancel-btn"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmRestore}
              disabled={restoring}
              className="px-4 py-2 bg-[#9B1C1C] text-white rounded-sm hover:bg-[#7F1D1D] disabled:opacity-50 flex items-center gap-2"
              data-testid="restore-confirm-btn"
            >
              <UploadCloud className="w-4 h-4" />
              {restoring ? 'Restoring…' : 'Yes, Wipe & Restore'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


