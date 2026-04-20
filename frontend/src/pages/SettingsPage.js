import React, { useState, useEffect, useRef } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../context/CompanySettingsContext';
import { Building2, Save, MapPin, Plus, Trash2, Edit2, Truck, X, Upload, Image, DollarSign, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

const CURRENCIES = [
  { code: 'INR', symbol: '\u20B9', name: 'Indian Rupee (\u20B9)' },
  { code: 'USD', symbol: '$', name: 'US Dollar ($)' },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { refreshSettings } = useCompanySettings();
  const [settings, setSettings] = useState({
    company_name: '', gstin: '', state_code: '',
    address: '', address_line2: '', city: '', state: '', pin_code: '',
    pan: '', cin: '', phone: '', email: '',
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
  const fileInputRef = useRef(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, statesRes, chargesRes, seriesRes] = await Promise.all([
        api.get('/api/settings/company'),
        api.get('/api/settings/states'),
        api.get('/api/settings/po-charges'),
        api.get('/api/settings/number-series'),
      ]);
      setSettings(settingsRes.data);
      setStates(statesRes.data);
      setChargeTypes(chargesRes.data);
      setNumberSeries(seriesRes.data || []);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally { setLoading(false); }
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
          <TabsTrigger value="company">Company & GST</TabsTrigger>
          <TabsTrigger value="branding" data-testid="branding-tab">Branding & Currency</TabsTrigger>
          <TabsTrigger value="po-charges" data-testid="po-charges-tab">PO Section</TabsTrigger>
          <TabsTrigger value="number-series" data-testid="number-series-tab">Number Series</TabsTrigger>
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
            <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] mb-2">GST Tax Slabs</h2>
            <p className="text-sm text-[#4B5563] mb-4">Standard GST rates applicable on items</p>
            <div className="flex space-x-3">
              {[0, 5, 12, 18, 28].map(rate => (
                <div key={rate} className="flex items-center justify-center w-16 h-16 rounded-sm border-2 border-[#1D3557] bg-[#F0F4F8]" data-testid={`gst-slab-${rate}`}>
                  <span className="font-mono font-bold text-lg text-[#1D3557]">{rate}%</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ====== Branding & Currency Tab ====== */}
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
                <p className="text-sm text-[#4B5563]">Define charge types (Transportation, Handling, Packing, etc.) and default Terms &amp; Conditions printed on every Purchase Order.</p>
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

          {/* Default PO Terms & Conditions (prints on every PO) */}
          <div className="card-flat p-6">
            <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] flex items-center space-x-2 mb-1">
              <FileText className="w-5 h-5" /><span>Default Terms &amp; Conditions</span>
            </h2>
            <p className="text-sm text-[#4B5563] mb-4">These terms are auto-filled on every Purchase Order print. Supervisors can still override per-PO.</p>
            <textarea
              rows={8}
              value={settings.po_terms_conditions || ''}
              onChange={e => setSettings({ ...settings, po_terms_conditions: e.target.value })}
              className="input-field w-full mono text-xs"
              placeholder={`1. Payment: Net 30 days from invoice date.\n2. Delivery: As per schedule mentioned above.\n3. Quality: Supplier to provide material/test certificates.\n4. Warranty: 12 months from the date of receipt.\n5. Taxes: GST extra as applicable.\n6. Any deviation to this PO needs to be approved in writing before dispatch.`}
              data-testid="po-terms-textarea"
              disabled={!isAdmin}
            />
            <div className="flex justify-end mt-3">
              {isAdmin && (
                <button onClick={handleSave} disabled={saving} className="btn-primary" data-testid="save-po-terms-btn">
                  {saving ? 'Saving...' : 'Save Terms'}
                </button>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ====== Number Series Tab ====== */}
        <TabsContent value="number-series" className="space-y-4 mt-4" data-testid="number-series-tab-content">
          <div className="bg-white border border-[#E5E7EB] rounded-sm p-5">
            <h2 className="text-lg font-semibold text-[#111827] mb-1">Number Series</h2>
            <p className="text-xs text-[#6B7280] mb-4">Configure auto-incrementing prefix and starting number for vendors, customers, POs and sales invoices. Existing records keep their old numbers; only new records use the updated series.</p>
            <div className="space-y-3">
              {numberSeries.map(s => {
                const preview = `${s.prefix || ''}${String(s.next_number || 1).padStart(s.padding || 4, '0')}`;
                return (
                  <div key={s.key} className="grid grid-cols-12 gap-3 items-end border border-[#E5E7EB] rounded-sm p-3 bg-[#F9FAFB]" data-testid={`series-row-${s.key}`}>
                    <div className="col-span-3">
                      <label className="block text-xs font-semibold text-[#6B7280] uppercase mb-1">{s.label}</label>
                      <div className="mono text-xs bg-[#E1EFFE] text-[#1E429F] inline-block px-2 py-1 rounded">Next: {preview}</div>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-[#374151] mb-1">Prefix</label>
                      <input
                        type="text"
                        value={s.prefix || ''}
                        onChange={e => updateSeriesField(s.key, 'prefix', e.target.value)}
                        className="input-field mono"
                        disabled={!isAdmin}
                        placeholder="e.g. SUP-"
                        data-testid={`series-prefix-${s.key}`}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-[#374151] mb-1">Start #</label>
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
                    <div className="col-span-2">
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
              {numberSeries.length === 0 && <p className="text-sm text-[#9CA3AF] italic">No series configured.</p>}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
