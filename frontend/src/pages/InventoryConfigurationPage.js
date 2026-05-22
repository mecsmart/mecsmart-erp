import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { Cog, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { ItemGroupsCard } from '../components/ItemGroupsCard';
import { POChargeTypesCard } from '../components/POChargeTypesCard';

export default function InventoryConfigurationPage() {
  const { user, hasPermission } = useAuth();
  // Edit is allowed for admin OR anyone with settings.edit or inventory.edit.
  // We prefer a wider check here so operations leads can maintain module config
  // without needing full admin rights.
  const canEdit = user?.role === 'admin'
    || hasPermission('settings', 'edit')
    || hasPermission('inventory', 'edit');
  const isAdmin = canEdit; // legacy name retained in JSX below; now permission-driven.
  const [poTerms, setPoTerms] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/settings/company');
        setPoTerms(data?.po_terms_conditions || '');
      } catch (e) {
        console.error('Failed to load PO terms', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const savePoTerms = async () => {
    setSaving(true);
    try {
      const { data: current } = await api.get('/api/settings/company');
      await api.put('/api/settings/company', { ...current, po_terms_conditions: poTerms });
      toast.success('Default PO Terms & Conditions saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save terms');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="inventory-configuration-page">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-[#E1EFFE] rounded-sm">
          <Cog className="w-5 h-5 text-[#1E429F]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold font-[Chivo] text-[#111827]">Inventory Configuration</h1>
          <p className="text-sm text-[#6B7280]">Central place to configure module-level settings for Inventory, Purchasing & Stores.</p>
        </div>
      </div>

      {/* Item Groups */}
      <ItemGroupsCard isAdmin={isAdmin} />

      {/* Additional Charges master for Purchase Orders */}
      <POChargeTypesCard isAdmin={isAdmin} />

      {/* Default PO Terms & Conditions */}
      <div className="card-flat p-6" data-testid="po-terms-card">
        <h2 className="text-lg font-semibold font-[Chivo] text-[#1D3557] flex items-center space-x-2 mb-1">
          <FileText className="w-5 h-5" /><span>Default PO Terms &amp; Conditions</span>
        </h2>
        <p className="text-sm text-[#4B5563] mb-4">These terms are auto-filled on every Purchase Order print. Supervisors can still override per-PO.</p>
        <textarea
          rows={8}
          value={poTerms}
          onChange={e => setPoTerms(e.target.value)}
          className="input-field w-full mono text-xs"
          placeholder={`1. Payment: Net 30 days from invoice date.\n2. Delivery: As per schedule mentioned above.\n3. Quality: Supplier to provide material/test certificates.\n4. Warranty: 12 months from the date of receipt.\n5. Taxes: GST extra as applicable.\n6. Any deviation to this PO needs to be approved in writing before dispatch.`}
          data-testid="po-terms-textarea"
          disabled={!isAdmin || loading}
        />
        {isAdmin && (
          <div className="flex justify-end mt-3">
            <button onClick={savePoTerms} disabled={saving || loading} className="btn-primary" data-testid="save-po-terms-btn">
              {saving ? 'Saving...' : 'Save Terms'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
