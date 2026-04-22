import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { Edit2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

/**
 * ItemGroupsCard — CRUD for item groups (Motors, Bearings, Valves …)
 * Each group optionally defines default_hsn_code + default_gst_rate.
 * When those are set, all items in the group inherit & lock to those values.
 * Used by: Inventory → Configuration tab.
 */
export function ItemGroupsCard({ isAdmin }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ name: '', parent_category: '', default_hsn_code: '', default_gst_rate: '', description: '' });
  const [deleting, setDeleting] = useState(null);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/item-groups');
      setGroups(data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load item groups');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchGroups(); }, []);

  const resetDraft = () => setDraft({ name: '', parent_category: '', default_hsn_code: '', default_gst_rate: '', description: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!draft.name.trim()) { toast.error('Group name is required'); return; }
    const payload = {
      name: draft.name.trim(),
      parent_category: draft.parent_category || null,
      default_hsn_code: (draft.default_hsn_code || '').trim() || null,
      default_gst_rate: draft.default_gst_rate === '' ? null : parseFloat(draft.default_gst_rate),
      description: draft.description || '',
    };
    try {
      if (editingId) {
        await api.put(`/api/item-groups/${editingId}`, payload);
        toast.success('Item group updated. Changes cascade to all member items.');
      } else {
        await api.post('/api/item-groups', payload);
        toast.success('Item group created');
      }
      setEditingId(null);
      resetDraft();
      fetchGroups();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save group');
    }
  };

  const handleEdit = (g) => {
    setEditingId(g.id);
    setDraft({
      name: g.name || '',
      parent_category: g.parent_category || '',
      default_hsn_code: g.default_hsn_code || '',
      default_gst_rate: g.default_gst_rate != null ? String(g.default_gst_rate) : '',
      description: g.description || '',
    });
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/api/item-groups/${deleting.id}`);
      toast.success('Group deleted');
      setDeleting(null);
      fetchGroups();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete group');
    }
  };

  return (
    <div className="card-flat p-6" data-testid="item-groups-card">
      <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] mb-1">Item Groups</h2>
      <p className="text-sm text-[#6B7280] mb-4">
        Organize items into user-defined groups (e.g. <i>Motors</i>, <i>Bearings</i>, <i>V-Belts</i>).
        If you set a <b>default HSN code / GST%</b> on a group, all items in that group will inherit those values
        — and any future change cascades automatically.
      </p>

      {isAdmin && (
        <form onSubmit={handleSubmit} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-sm p-4 mb-4" data-testid="item-group-form">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-3">
              <label className="block text-xs font-semibold text-[#374151] mb-1">Group Name *</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="input-field h-9"
                placeholder="e.g. Motors"
                data-testid="ig-name-input"
              />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-semibold text-[#374151] mb-1">Parent Category</label>
              <select
                value={draft.parent_category}
                onChange={(e) => setDraft({ ...draft, parent_category: e.target.value })}
                className="input-field h-9"
                data-testid="ig-category-select"
              >
                <option value="">(Any category)</option>
                <option value="raw_material">Raw Material</option>
                <option value="component">Component / Part</option>
                <option value="sub_assembly">Sub-Assembly</option>
                <option value="finished_good">Finished Good</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#374151] mb-1">Default HSN</label>
              <input
                type="text"
                value={draft.default_hsn_code}
                onChange={(e) => setDraft({ ...draft, default_hsn_code: e.target.value })}
                className="input-field h-9 mono"
                placeholder="e.g. 8501"
                data-testid="ig-hsn-input"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#374151] mb-1">Default GST%</label>
              <select
                value={draft.default_gst_rate}
                onChange={(e) => setDraft({ ...draft, default_gst_rate: e.target.value })}
                className="input-field h-9"
                data-testid="ig-gst-select"
              >
                <option value="">(no default)</option>
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="btn-primary h-9 flex-1 text-sm" data-testid="ig-save-btn">
                {editingId ? 'Update' : 'Add Group'}
              </button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); resetDraft(); }} className="btn-secondary h-9 text-sm">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-[#6B7280]">Loading groups…</p>
      ) : groups.length === 0 ? (
        <div className="text-center py-10 text-[#9CA3AF] border-2 border-dashed border-[#E5E7EB] rounded-sm">
          <p>No item groups defined yet.</p>
          {isAdmin && <p className="text-xs mt-1">Use the form above to create your first group.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="item-groups-table">
            <thead>
              <tr className="bg-[#1D3557] text-white text-left">
                <th className="p-2 font-semibold">Group</th>
                <th className="p-2 font-semibold">Parent Category</th>
                <th className="p-2 font-semibold">Default HSN</th>
                <th className="p-2 font-semibold text-right">Default GST%</th>
                <th className="p-2 font-semibold text-right">Items</th>
                {isAdmin && <th className="p-2 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.id} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]" data-testid={`ig-row-${g.id}`}>
                  <td className="p-2 font-medium text-[#1D3557]">{g.name}</td>
                  <td className="p-2 text-[#4B5563]">{g.parent_category ? g.parent_category.replace('_', ' ') : <span className="italic text-[#9CA3AF]">any</span>}</td>
                  <td className="p-2 mono text-[#4B5563]">{g.default_hsn_code || '-'}</td>
                  <td className="p-2 text-right mono text-[#4B5563]">{g.default_gst_rate != null ? `${g.default_gst_rate}%` : '-'}</td>
                  <td className="p-2 text-right font-medium">{g.item_count ?? 0}</td>
                  {isAdmin && (
                    <td className="p-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => handleEdit(g)} className="p-1 text-[#1D3557] hover:bg-[#E1EFFE] rounded" data-testid={`ig-edit-${g.id}`}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleting(g)} className="p-1 text-[#9B1C1C] hover:bg-[#FEF2F2] rounded" data-testid={`ig-delete-${g.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Group "{deleting?.name}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#6B7280]">
            {deleting?.item_count > 0
              ? `This group has ${deleting.item_count} item(s) assigned. Delete will fail — reassign them first.`
              : 'This will permanently delete the group. Cannot be undone.'}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setDeleting(null)} className="px-4 py-2 border border-[#D1D5DB] rounded-sm hover:bg-[#F3F4F6]">Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 bg-[#9B1C1C] text-white rounded-sm hover:bg-[#7F1D1D]" data-testid="ig-confirm-delete">
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
