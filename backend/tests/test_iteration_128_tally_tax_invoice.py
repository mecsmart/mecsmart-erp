"""
Iteration 128 Tests: Tax Invoice Tally XML Export + Admin Bypass for Packing Lists

Tests:
1. GET /api/crm/tax-invoices/{tid}/tally-xml - Single Tax Invoice Tally XML export
2. GET /api/crm/tax-invoices/{invalid_id}/tally-xml - 404 for invalid ID
3. POST /api/crm/tax-invoices/tally-xml-bulk - Bulk Tax Invoice Tally XML export
4. POST /api/crm/tax-invoices/tally-xml-bulk with empty invoice_ids - 400 error
5. REGRESSION: PI Tally XML (single + bulk) still works
6. REGRESSION: Tax Invoice CRUD still works
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="session")
def session():
    """Create a requests session that persists cookies"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s

@pytest.fixture(scope="session")
def authenticated_session(session):
    """Login and return session with auth cookies"""
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if response.status_code == 200:
        return session
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")

@pytest.fixture(scope="session")
def existing_tax_invoices(authenticated_session):
    """Get existing tax invoices for testing"""
    response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices")
    if response.status_code == 200:
        invoices = response.json()
        if len(invoices) >= 2:
            return invoices[:2]
    pytest.skip("No existing tax invoices found for testing")

@pytest.fixture(scope="session")
def existing_purchase_invoices(authenticated_session):
    """Get existing purchase invoices for testing"""
    response = authenticated_session.get(f"{BASE_URL}/api/purchase-invoices")
    if response.status_code == 200:
        invoices = response.json()
        if len(invoices) >= 1:
            return invoices[:1]
    pytest.skip("No existing purchase invoices found for testing")


class TestTaxInvoiceTallyXMLSingle:
    """Tests for single Tax Invoice Tally XML export"""
    
    def test_tally_xml_single_returns_200_with_xml(self, authenticated_session, existing_tax_invoices):
        """GET /api/crm/tax-invoices/{tid}/tally-xml returns 200 with application/xml"""
        tid = existing_tax_invoices[0].get("id")
        response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices/{tid}/tally-xml")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/xml" in response.headers.get("Content-Type", ""), "Expected application/xml content type"
        
    def test_tally_xml_single_has_content_disposition(self, authenticated_session, existing_tax_invoices):
        """GET /api/crm/tax-invoices/{tid}/tally-xml has Content-Disposition attachment header"""
        tid = existing_tax_invoices[0].get("id")
        response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices/{tid}/tally-xml")
        
        assert response.status_code == 200
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp, f"Expected attachment in Content-Disposition, got: {content_disp}"
        assert "filename=" in content_disp, f"Expected filename in Content-Disposition, got: {content_disp}"
        
    def test_tally_xml_single_contains_sales_voucher(self, authenticated_session, existing_tax_invoices):
        """GET /api/crm/tax-invoices/{tid}/tally-xml contains VOUCHER VCHTYPE='Sales'"""
        tid = existing_tax_invoices[0].get("id")
        response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices/{tid}/tally-xml")
        
        assert response.status_code == 200
        xml_content = response.text
        assert '<VOUCHER VCHTYPE="Sales"' in xml_content, f"Expected Sales voucher type in XML"
        
    def test_tally_xml_single_contains_invoice_no(self, authenticated_session, existing_tax_invoices):
        """GET /api/crm/tax-invoices/{tid}/tally-xml contains the invoice_no"""
        tid = existing_tax_invoices[0].get("id")
        invoice_no = existing_tax_invoices[0].get("invoice_no")
        response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices/{tid}/tally-xml")
        
        assert response.status_code == 200
        xml_content = response.text
        assert invoice_no in xml_content, f"Expected invoice_no '{invoice_no}' in XML"
        
    def test_tally_xml_single_contains_customer_as_partyledger(self, authenticated_session, existing_tax_invoices):
        """GET /api/crm/tax-invoices/{tid}/tally-xml contains customer name as PARTYLEDGERNAME"""
        tid = existing_tax_invoices[0].get("id")
        customer_name = existing_tax_invoices[0].get("customer_name")
        response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices/{tid}/tally-xml")
        
        assert response.status_code == 200
        xml_content = response.text
        assert f"<PARTYLEDGERNAME>{customer_name}</PARTYLEDGERNAME>" in xml_content, f"Expected PARTYLEDGERNAME with customer name"
        
    def test_tally_xml_single_contains_sales_account_ledger(self, authenticated_session, existing_tax_invoices):
        """GET /api/crm/tax-invoices/{tid}/tally-xml contains Sales Account ledger entry"""
        tid = existing_tax_invoices[0].get("id")
        response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices/{tid}/tally-xml")
        
        assert response.status_code == 200
        xml_content = response.text
        assert "<LEDGERNAME>Sales Account</LEDGERNAME>" in xml_content, f"Expected Sales Account ledger in XML"
        
    def test_tally_xml_single_has_gst_output_ledgers(self, authenticated_session, existing_tax_invoices):
        """GET /api/crm/tax-invoices/{tid}/tally-xml has GST Output ledgers (CGST/SGST or IGST)"""
        tid = existing_tax_invoices[0].get("id")
        response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices/{tid}/tally-xml")
        
        assert response.status_code == 200
        xml_content = response.text
        # Either CGST+SGST or IGST depending on is_inter_state flag
        has_cgst = "CGST Output" in xml_content
        has_sgst = "SGST Output" in xml_content
        has_igst = "IGST Output" in xml_content
        assert (has_cgst and has_sgst) or has_igst, f"Expected GST Output ledgers in XML"


class TestTaxInvoiceTallyXML404:
    """Tests for 404 on invalid Tax Invoice ID"""
    
    def test_tally_xml_invalid_id_returns_404(self, authenticated_session):
        """GET /api/crm/tax-invoices/{invalid_id}/tally-xml returns 404"""
        invalid_id = f"invalid-{uuid.uuid4().hex}"
        response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices/{invalid_id}/tally-xml")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"


class TestTaxInvoiceTallyXMLBulk:
    """Tests for bulk Tax Invoice Tally XML export"""
    
    def test_tally_xml_bulk_returns_200_with_xml(self, authenticated_session, existing_tax_invoices):
        """POST /api/crm/tax-invoices/tally-xml-bulk with invoice_ids returns 200 XML"""
        invoice_ids = [inv.get("id") for inv in existing_tax_invoices]
        response = authenticated_session.post(
            f"{BASE_URL}/api/crm/tax-invoices/tally-xml-bulk",
            json={"invoice_ids": invoice_ids}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/xml" in response.headers.get("Content-Type", ""), "Expected application/xml content type"
        
    def test_tally_xml_bulk_contains_both_vouchers(self, authenticated_session, existing_tax_invoices):
        """POST /api/crm/tax-invoices/tally-xml-bulk contains both VOUCHER entries"""
        invoice_ids = [inv.get("id") for inv in existing_tax_invoices]
        response = authenticated_session.post(
            f"{BASE_URL}/api/crm/tax-invoices/tally-xml-bulk",
            json={"invoice_ids": invoice_ids}
        )
        
        assert response.status_code == 200
        xml_content = response.text
        # Count VOUCHER entries
        voucher_count = xml_content.count('<VOUCHER VCHTYPE="Sales"')
        assert voucher_count == 2, f"Expected 2 VOUCHER entries, found {voucher_count}"
        
    def test_tally_xml_bulk_contains_both_invoice_numbers(self, authenticated_session, existing_tax_invoices):
        """POST /api/crm/tax-invoices/tally-xml-bulk contains both invoice numbers"""
        invoice_ids = [inv.get("id") for inv in existing_tax_invoices]
        invoice_no_1 = existing_tax_invoices[0].get("invoice_no")
        invoice_no_2 = existing_tax_invoices[1].get("invoice_no")
        
        response = authenticated_session.post(
            f"{BASE_URL}/api/crm/tax-invoices/tally-xml-bulk",
            json={"invoice_ids": invoice_ids}
        )
        
        assert response.status_code == 200
        xml_content = response.text
        assert invoice_no_1 in xml_content, f"Expected invoice_no '{invoice_no_1}' in bulk XML"
        assert invoice_no_2 in xml_content, f"Expected invoice_no '{invoice_no_2}' in bulk XML"
        
    def test_tally_xml_bulk_empty_ids_returns_400(self, authenticated_session):
        """POST /api/crm/tax-invoices/tally-xml-bulk with empty invoice_ids returns 400"""
        response = authenticated_session.post(
            f"{BASE_URL}/api/crm/tax-invoices/tally-xml-bulk",
            json={"invoice_ids": []}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"


class TestPurchaseInvoiceTallyXMLRegression:
    """REGRESSION: PI Tally XML (single + bulk) still works"""
        
    def test_pi_tally_xml_single_still_works(self, authenticated_session, existing_purchase_invoices):
        """REGRESSION: GET /api/purchase-invoices/{id}/tally-xml still returns 200"""
        pi_id = existing_purchase_invoices[0].get("id")
        response = authenticated_session.get(f"{BASE_URL}/api/purchase-invoices/{pi_id}/tally-xml")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/xml" in response.headers.get("Content-Type", "")
        assert '<VOUCHER VCHTYPE="Purchase"' in response.text, "Expected Purchase voucher type"
        
    def test_pi_tally_xml_bulk_still_works(self, authenticated_session, existing_purchase_invoices):
        """REGRESSION: POST /api/purchase-invoices/tally-xml-bulk still returns 200"""
        pi_id = existing_purchase_invoices[0].get("id")
        response = authenticated_session.post(
            f"{BASE_URL}/api/purchase-invoices/tally-xml-bulk",
            json={"invoice_ids": [pi_id]}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/xml" in response.headers.get("Content-Type", "")


class TestTaxInvoiceCRUDRegression:
    """REGRESSION: Tax Invoice CRUD still works"""
    
    def test_get_tax_invoices_list(self, authenticated_session):
        """REGRESSION: GET /api/crm/tax-invoices returns list"""
        response = authenticated_session.get(f"{BASE_URL}/api/crm/tax-invoices")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert isinstance(response.json(), list), "Expected list response"
        
    def test_tax_invoice_status_change(self, authenticated_session, existing_tax_invoices):
        """REGRESSION: PUT /api/crm/tax-invoices/{id} status change works"""
        tid = existing_tax_invoices[0].get("id")
        current_status = existing_tax_invoices[0].get("status", "draft")
        # Toggle status for test
        new_status = "issued" if current_status == "draft" else "draft"
        
        response = authenticated_session.put(
            f"{BASE_URL}/api/crm/tax-invoices/{tid}",
            json={"status": new_status}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Revert status
        authenticated_session.put(
            f"{BASE_URL}/api/crm/tax-invoices/{tid}",
            json={"status": current_status}
        )


class TestPackingListRegression:
    """REGRESSION: Packing List endpoint accessible"""
    
    def test_packing_lists_endpoint_accessible(self, authenticated_session):
        """REGRESSION: GET /api/crm/packing-lists is accessible"""
        response = authenticated_session.get(f"{BASE_URL}/api/crm/packing-lists")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert isinstance(response.json(), list), "Expected list response"


class TestGRNDraftMultiPIRegression:
    """REGRESSION: GRN draft + multi-GRN to PI flows from iteration 127 still pass"""
    
    def test_grn_list_accessible(self, authenticated_session):
        """REGRESSION: GET /api/grn returns list"""
        response = authenticated_session.get(f"{BASE_URL}/api/grn")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert isinstance(response.json(), list), "Expected list response"
        
    def test_pending_grns_endpoint_accessible(self, authenticated_session):
        """REGRESSION: GET /api/purchase-invoices/pending-grns is accessible"""
        response = authenticated_session.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
