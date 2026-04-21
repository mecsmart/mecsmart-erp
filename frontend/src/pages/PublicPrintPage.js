import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { printInvoiceDoc } from './CRMPage';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const DOC_CONFIG = {
  quotation: { title: 'QUOTATION', endpoint: 'quotation', numberKey: 'quotation_no' },
  proforma: { title: 'PROFORMA INVOICE', endpoint: 'proforma', numberKey: 'proforma_no' },
  'tax-invoice': { title: 'TAX INVOICE', endpoint: 'tax-invoice', numberKey: 'invoice_no' },
};

export default function PublicPrintPage() {
  const { doctype, id } = useParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const cfg = DOC_CONFIG[doctype];
    if (!cfg) { setError('Unknown document type'); return; }
    const run = async () => {
      try {
        const [docRes, companyRes] = await Promise.all([
          axios.get(`${BACKEND}/api/public/${cfg.endpoint}/${id}`),
          axios.get(`${BACKEND}/api/public/company`),
        ]);
        printInvoiceDoc(docRes.data, {
          kind: doctype === 'tax-invoice' ? 'tax_invoice' : doctype,
          title: cfg.title,
          numberKey: cfg.numberKey,
          company: companyRes.data,
          user: {},
          openInSameTab: true,
        });
      } catch (e) {
        setError(e.response?.data?.detail || 'Document not found or no longer available');
      }
    };
    run();
  }, [doctype, id]);

  return (
    <div style={{ padding: 48, textAlign: 'center', fontFamily: 'Helvetica,Arial,sans-serif' }}>
      {error ? <div style={{ color: '#b91c1c' }} data-testid="public-print-error">{error}</div> : <div data-testid="public-print-loading">Preparing printable document…</div>}
    </div>
  );
}
