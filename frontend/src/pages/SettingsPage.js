import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { Building2, Save, MapPin } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    company_name: '', gstin: '', state_code: '', address: '',
    pan: '', cin: '', phone: '', email: ''
  });
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === 'admin';

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, statesRes] = await Promise.all([
        api.get('/api/settings/company'),
        api.get('/api/settings/states'),
      ]);
      setSettings(settingsRes.data);
      setStates(statesRes.data);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/api/settings/company', settings);
      setSettings(data);
      alert('Company settings saved successfully!');
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save settings');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#1D3557]">Company Settings</h1>
          <p className="text-sm text-[#4B5563]">Manage your company profile and GST configuration</p>
        </div>
        {isAdmin && (
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center space-x-2" data-testid="save-settings-btn">
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        )}
      </div>

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
              <label className="text-sm font-medium text-[#374151]">Address</label>
              <textarea className="w-full mt-1 px-3 py-2 border border-[#D1D5DB] rounded-sm" rows={3} value={settings.address || ''} onChange={e => setSettings({...settings, address: e.target.value})} disabled={!isAdmin} data-testid="company-address-input" />
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
              <p className="text-xs text-[#6B7280] mt-1">15-character GST Identification Number</p>
            </div>
            <div>
              <label className="text-sm font-medium text-[#374151]">State *</label>
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
    </div>
  );
}
