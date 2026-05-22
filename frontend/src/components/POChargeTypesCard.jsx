import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Plus, Edit2, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

// PO Charge Types master — list/add/edit/delete the charge types that
// appear in the Purchase Order's "Additional Charges" dropdown. Mirrors
// the CRM Additional Charges master card from the CRM Configuration page
// (same backend collection: `po_charge_types`, API: /api/settings/po-charges).
export function POChargeTypesCard({ isAdmin }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', hsn_code: '', gst_rate: 18 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/settings/po-charges');
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load PO charge types');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const openDialog = (it) => {
    if (it) {
      setEditing(it);
      setForm({ name: it.name || '', hsn_code: it.hsn_code || '', gst_rate: it.gst_rate ?? 18 });
    } else {
      setEditing(null);
      setForm({ name: '', hsn_code: '', gst_rate: 18 });
    }
    setDialogOpen(true);
  };

  const save = async () => {
    try {
      if (editing) await api.put(`/api/settings/po-charges/${editing.id}`, form);
      else await api.post('/api/settings/po-charges', form);
      toast.success(`Charge type ${editing ? 'updated' : 'created'}`);
      setDialogOpen(false);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this charge type?')) return;
    try {
      await api.delete(`/api/settings/po-charges/${id}`);
      toast.success('Charge type deleted');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete');
    }
  };

  return (
    <div className="card-flat p-6" data-testid="po-charges-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] flex items-center space-x-2">
            <Truck className="w-5 h-5" /><span>Additional Charges (Purchase Orders)</span>
          </h2>
          <p className="text-sm text-[#4B5563]">Define charge types (Transportation, Handling, Packing, etc.) that appear in the PO Additional Charges dropdown.</p>
        </div>
        {isAdmin && (
          <button onClick={() => openDialog(null)} className="btn-primary flex items-center space-x-2" data-testid="add-po-charge-type-btn">
            <Plus className="w-4 h-4" /><span>Add Charge Type</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-[#6B7280] py-4">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-[#4B5563] bg-[#F3F4F6] rounded-sm">
          <Truck className="w-10 h-10 mx-auto mb-2 text-[#9CA3AF]" />
          <p className="text-sm">No charge types defined yet</p>
          <p className="text-xs text-[#9CA3AF] mt-1">Add charge types that will appear as additional cost lines on Purchase Orders</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full data-table" data-testid="po-charge-types-table">
            <thead><tr><th>Charge Name</th><th>HSN Code</th><th>GST Rate</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map(ct => (
                <tr key={ct.id} data-testid={`po-charge-type-row-${ct.id}`}>
                  <td className="font-medium">{ct.name}</td>
                  <td className="mono">{ct.hsn_code || '-'}</td>
                  <td className="mono">{ct.gst_rate}%</td>
                  <td>
                    <div className="flex items-center space-x-2">
                      {isAdmin && (<>
                        <button onClick={() => openDialog(ct)} className="p-1 text-[#4B5563] hover:text-[#1D3557]" title="Edit"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => remove(ct.id)} className="p-1 text-[#9B1C1C] hover:text-[#DC2626]" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-[Chivo]">{editing ? 'Edit' : 'Add'} Charge Type</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-3">
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">Charge Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g. Transportation Charges" data-testid="po-charge-name-input" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">HSN Code</label>
              <input type="text" value={form.hsn_code} onChange={e => setForm({ ...form, hsn_code: e.target.value })} className="input-field mono" placeholder="e.g. 996511" data-testid="po-charge-hsn-input" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">GST Rate (%)</label>
              <Select value={String(form.gst_rate)} onValueChange={v => setForm({ ...form, gst_rate: parseFloat(v) })}>
                <SelectTrigger data-testid="po-charge-gst-select"><SelectValue /></SelectTrigger>
                <SelectContent>{[0,5,12,18,28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t border-[#E5E7EB]">
              <button onClick={() => setDialogOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} className="btn-primary" disabled={!form.name.trim()} data-testid="save-po-charge-btn">{editing ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
