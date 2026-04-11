import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { Building2, Save, MapPin, Plus, Trash2, Edit2, Truck, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    company_name: '', gstin: '', state_code: '', address: '',
    pan: '', cin: '', phone: '', email: ''
  });
  const [states, setStates] = useState([]);
  const [chargeTypes, setChargeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('company');
  const [chargeDialog, setChargeDialog] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);
  const [chargeForm, setChargeForm] = useState({ name: '', hsn_code: '', gst_rate: 18 });
  const isAdmin = user?.role === 'admin';

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, statesRes, chargesRes] = await Promise.all([
        api.get('/api/settings/company'),
        api.get('/api/settings/states'),
        api.get('/api/settings/po-charges'),
      ]);
      setSettings(settingsRes.data);
      setStates(statesRes.data);
      setChargeTypes(chargesRes.data);
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

  const openChargeDialog = (charge = null) => {
    setEditingCharge(charge);
    setChargeForm(charge ? { name: charge.name, hsn_code: charge.hsn_code || '', gst_rate: charge.gst_rate != null ? charge.gst_rate : 18 } : { name: '', hsn_code: '', gst_rate: 18 });
    setChargeDialog(true);
  };

  const saveCharge = async () => {
    try {
      if (editingCharge) {
        await api.put(`/api/settings/po-charges/${editingCharge.id}`, chargeForm);
      } else {
        await api.post('/api/settings/po-charges', chargeForm);
      }
      setChargeDialog(false);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save charge type');
    }
  };

  const deleteCharge = async (id) => {
    if (!window.confirm('Delete this charge type?')) return;
    try {
      await api.delete(`/api/settings/po-charges/${id}`);
      fetchData();
    } catch (error) {
      alert('Failed to delete charge type');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div></div>;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] text-[#1D3557]">Settings</h1>
          <p className="text-sm text-[#4B5563]">Manage company profile, GST and PO configuration</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="company">Company & GST</TabsTrigger>
          <TabsTrigger value="po-charges" data-testid="po-charges-tab">PO Additional Charges</TabsTrigger>
        </TabsList>

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
        </TabsContent>

        <TabsContent value="po-charges" className="space-y-6 mt-4">
          <div className="card-flat p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] flex items-center space-x-2">
                  <Truck className="w-5 h-5" /><span>PO Additional Charge Types</span>
                </h2>
                <p className="text-sm text-[#4B5563]">Define charge types like Transportation, Handling, Packing etc. with HSN & GST rates</p>
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
                  <thead>
                    <tr>
                      <th>Charge Name</th>
                      <th>HSN Code</th>
                      <th>GST Rate</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chargeTypes.map(ct => (
                      <tr key={ct.id} data-testid={`charge-type-row-${ct.id}`}>
                        <td className="font-medium">{ct.name}</td>
                        <td className="mono">{ct.hsn_code || '-'}</td>
                        <td className="mono">{ct.gst_rate}%</td>
                        <td>
                          <div className="flex items-center space-x-2">
                            {isAdmin && (
                              <>
                                <button onClick={() => openChargeDialog(ct)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Edit">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => deleteCharge(ct.id)} className="p-1 text-[#9B1C1C] hover:text-[#DC2626]" title="Delete">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
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

          {/* Charge Type Dialog */}
          <Dialog open={chargeDialog} onOpenChange={setChargeDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">{editingCharge ? 'Edit' : 'Add'} Charge Type</DialogTitle>
              </DialogHeader>
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
                    <SelectContent>
                      {[0,5,12,18,28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end space-x-3 pt-3 border-t border-[#E5E7EB]">
                  <button onClick={() => setChargeDialog(false)} className="btn-secondary">Cancel</button>
                  <button onClick={saveCharge} className="btn-primary" disabled={!chargeForm.name.trim()} data-testid="save-charge-btn">
                    {editingCharge ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
