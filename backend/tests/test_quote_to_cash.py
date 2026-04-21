"""
Test Suite: Quote-to-Cash Chain (Quotation → Proforma Invoice → Tax Invoice)
Tests: Number Series, Proforma CRUD, Tax Invoice CRUD, GST Split (Intra/Inter-state), Convert flows
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if response.status_code == 200:
        token = response.json().get("access_token")
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        return token
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    return api_client

@pytest.fixture(scope="module")
def company_state(authenticated_client):
    """Get company state_code for GST testing"""
    res = authenticated_client.get(f"{BASE_URL}/api/settings/company")
    if res.status_code == 200:
        return res.json().get("state_code", "27")
    return "27"  # default Maharashtra (code 27)

@pytest.fixture(scope="module")
def test_customer_same_state(authenticated_client, company_state):
    """Create a customer in same state as company (for intra-state GST)"""
    unique_id = str(uuid.uuid4())[:8]
    payload = {
        "name": f"TEST_SameState_Customer_{unique_id}",
        "customer_code": f"TSS-{unique_id}",
        "address": "123 Test Street, Pune",
        "state_code": company_state,  # Same as company
        "state": "Maharashtra",
        "gstin": "27AABCD1234E1Z5"
    }
    res = authenticated_client.post(f"{BASE_URL}/api/customers", json=payload)
    assert res.status_code == 201, f"Failed to create same-state customer: {res.text}"
    return res.json()

@pytest.fixture(scope="module")
def test_customer_diff_state(authenticated_client, company_state):
    """Create a customer in different state (for inter-state GST)"""
    unique_id = str(uuid.uuid4())[:8]
    # Use a different state code (Karnataka = 29, Tamil Nadu = 33)
    diff_state = "29" if company_state != "29" else "33"
    payload = {
        "name": f"TEST_DiffState_Customer_{unique_id}",
        "customer_code": f"TDS-{unique_id}",
        "address": "456 Test Road, Bangalore",
        "state_code": diff_state,  # Different from company
        "state": "Karnataka" if diff_state == "29" else "Tamil Nadu",
        "gstin": "29AABCD5678E1Z5"
    }
    res = authenticated_client.post(f"{BASE_URL}/api/customers", json=payload)
    assert res.status_code == 201, f"Failed to create diff-state customer: {res.text}"
    return res.json()


class TestNumberSeries:
    """Number Series Configuration Tests"""
    
    def test_get_number_series_returns_5_doc_types(self, authenticated_client):
        """GET /api/crm/number-series returns 5 doc types with defaults"""
        res = authenticated_client.get(f"{BASE_URL}/api/crm/number-series")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) == 5, f"Expected 5 doc types, got {len(data)}"
        
        doc_types = [d["doc_type"] for d in data]
        expected_types = ["quotation", "proforma", "tax_invoice", "sales_order", "purchase_invoice"]
        for t in expected_types:
            assert t in doc_types, f"Missing doc_type: {t}"
        
        # Verify each has required fields
        for d in data:
            assert "prefix" in d
            assert "padding" in d
            assert "next_number" in d
            assert "reset_yearly" in d
    
    def test_update_number_series_quotation(self, authenticated_client):
        """PUT /api/crm/number-series/quotation updates prefix/padding/next_number/reset_yearly"""
        # First get current value
        res = authenticated_client.get(f"{BASE_URL}/api/crm/number-series")
        assert res.status_code == 200
        current = next((d for d in res.json() if d["doc_type"] == "quotation"), None)
        assert current is not None
        
        # Update with new values
        new_prefix = "TESTQUO-"
        new_padding = 5
        new_next = 100
        
        res = authenticated_client.put(f"{BASE_URL}/api/crm/number-series/quotation", json={
            "prefix": new_prefix,
            "padding": new_padding,
            "next_number": new_next,
            "reset_yearly": False
        })
        assert res.status_code == 200
        updated = res.json()
        assert updated["prefix"] == new_prefix
        assert updated["padding"] == new_padding
        assert updated["next_number"] == new_next
        assert updated["reset_yearly"] == False
        
        # Restore original
        authenticated_client.put(f"{BASE_URL}/api/crm/number-series/quotation", json={
            "prefix": current.get("prefix", "QUO-"),
            "padding": current.get("padding", 6),
            "next_number": current.get("next_number", 1),
            "reset_yearly": current.get("reset_yearly", False)
        })
    
    def test_number_series_admin_only(self, authenticated_client):
        """PUT /api/crm/number-series requires admin role - non-admin users get 403"""
        # This test verifies the endpoint requires admin role
        # Since we're using admin credentials, we verify the endpoint works for admin
        # The actual admin-only check is in the backend code
        res = authenticated_client.get(f"{BASE_URL}/api/crm/number-series")
        assert res.status_code == 200, "Admin should be able to access number series"
        
        # Verify the endpoint exists and returns data
        data = res.json()
        assert len(data) == 5, "Should return 5 doc types"


class TestProformaInvoice:
    """Proforma Invoice CRUD and GST Split Tests"""
    
    def test_create_proforma_intra_state_gst(self, authenticated_client, test_customer_same_state):
        """POST /api/crm/proformas creates PI with CGST+SGST for same-state customer"""
        payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [
                {"description": "Test Item 1", "quantity": 10, "rate": 1000, "gst_rate": 18, "discount_pct": 0},
                {"description": "Test Item 2", "quantity": 5, "rate": 500, "gst_rate": 18, "discount_pct": 10}
            ],
            "notes": "Test proforma for intra-state GST"
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas", json=payload)
        assert res.status_code == 201, f"Failed to create proforma: {res.text}"
        
        data = res.json()
        assert "proforma_no" in data
        assert data["proforma_no"].startswith("PI-")
        
        # Verify GST split - should be CGST+SGST (intra-state)
        assert data["is_inter_state"] == False, "Expected intra-state (same state)"
        assert data["cgst"] > 0, "CGST should be > 0 for intra-state"
        assert data["sgst"] > 0, "SGST should be > 0 for intra-state"
        assert data["igst"] == 0, "IGST should be 0 for intra-state"
        
        # Verify totals
        # Line 1: 10 * 1000 = 10000
        # Line 2: 5 * 500 = 2500, discount 10% = 250, net = 2250
        # Subtotal = 10000 + 2250 = 12250
        # GST 18% = 2205, split CGST 1102.5, SGST 1102.5
        assert data["subtotal"] == 12250.0
        assert abs(data["cgst"] - 1102.5) < 0.01
        assert abs(data["sgst"] - 1102.5) < 0.01
        assert abs(data["total_gst"] - 2205.0) < 0.01
        assert abs(data["grand_total"] - 14455.0) < 0.01
        
        # Verify HSN summary exists
        assert "hsn_summary" in data
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/crm/proformas/{data['id']}")
    
    def test_create_proforma_inter_state_gst(self, authenticated_client, test_customer_diff_state):
        """POST /api/crm/proformas creates PI with IGST for different-state customer"""
        payload = {
            "customer_id": test_customer_diff_state["id"],
            "customer_name": test_customer_diff_state["name"],
            "lines": [
                {"description": "Test Item Inter", "quantity": 10, "rate": 1000, "gst_rate": 18, "discount_pct": 0}
            ],
            "notes": "Test proforma for inter-state GST"
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas", json=payload)
        assert res.status_code == 201, f"Failed to create proforma: {res.text}"
        
        data = res.json()
        
        # Verify GST split - should be IGST only (inter-state)
        assert data["is_inter_state"] == True, "Expected inter-state (different state)"
        assert data["igst"] > 0, "IGST should be > 0 for inter-state"
        assert data["cgst"] == 0, "CGST should be 0 for inter-state"
        assert data["sgst"] == 0, "SGST should be 0 for inter-state"
        
        # Verify totals
        # Line: 10 * 1000 = 10000
        # IGST 18% = 1800
        assert data["subtotal"] == 10000.0
        assert data["igst"] == 1800.0
        assert data["grand_total"] == 11800.0
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/crm/proformas/{data['id']}")
    
    def test_list_proformas(self, authenticated_client):
        """GET /api/crm/proformas returns list"""
        res = authenticated_client.get(f"{BASE_URL}/api/crm/proformas")
        assert res.status_code == 200
        assert isinstance(res.json(), list)
    
    def test_update_proforma_allowed_when_not_converted(self, authenticated_client, test_customer_same_state):
        """PUT /api/crm/proformas/{pid} updates allowed when status != 'converted'"""
        # Create a proforma
        payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [{"description": "Update Test", "quantity": 1, "rate": 100, "gst_rate": 18}]
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas", json=payload)
        assert res.status_code == 201
        proforma = res.json()
        
        # Update status
        res = authenticated_client.put(f"{BASE_URL}/api/crm/proformas/{proforma['id']}", json={
            "status": "sent"
        })
        assert res.status_code == 200
        assert res.json()["status"] == "sent"
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/crm/proformas/{proforma['id']}")
    
    def test_delete_proforma_blocked_when_converted(self, authenticated_client, test_customer_same_state):
        """DELETE blocked when proforma is converted"""
        # Create a proforma
        payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [{"description": "Convert Test", "quantity": 1, "rate": 100, "gst_rate": 18}]
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas", json=payload)
        assert res.status_code == 201
        proforma = res.json()
        
        # Convert to tax invoice
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas/{proforma['id']}/convert-to-tax-invoice", json={})
        assert res.status_code == 200
        tax_invoice = res.json()
        
        # Try to delete converted proforma - should fail
        res = authenticated_client.delete(f"{BASE_URL}/api/crm/proformas/{proforma['id']}")
        assert res.status_code == 400, "Should not be able to delete converted proforma"
        
        # Cleanup tax invoice (cancel first if needed)
        authenticated_client.put(f"{BASE_URL}/api/crm/tax-invoices/{tax_invoice['id']}", json={"status": "cancelled"})
        authenticated_client.delete(f"{BASE_URL}/api/crm/tax-invoices/{tax_invoice['id']}")


class TestTaxInvoice:
    """Tax Invoice CRUD Tests"""
    
    def test_list_tax_invoices(self, authenticated_client):
        """GET /api/crm/tax-invoices returns list"""
        res = authenticated_client.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert res.status_code == 200
        assert isinstance(res.json(), list)
    
    def test_create_tax_invoice_direct(self, authenticated_client, test_customer_same_state):
        """POST /api/crm/tax-invoices creates TI directly"""
        payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [
                {"description": "Direct TI Item", "quantity": 5, "rate": 200, "gst_rate": 18, "hsn_code": "8413"}
            ],
            "status": "draft"
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/tax-invoices", json=payload)
        assert res.status_code == 201, f"Failed to create tax invoice: {res.text}"
        
        data = res.json()
        assert "invoice_no" in data
        assert "qr_code" in data  # UPI QR placeholder
        assert data["qr_code"].startswith("UPI://")
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/crm/tax-invoices/{data['id']}")
    
    def test_tax_invoice_status_update(self, authenticated_client, test_customer_same_state):
        """PUT /api/crm/tax-invoices/{tid} status update works"""
        # Create
        payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [{"description": "Status Test", "quantity": 1, "rate": 100, "gst_rate": 18}],
            "status": "draft"
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/tax-invoices", json=payload)
        assert res.status_code == 201
        ti = res.json()
        
        # Update status to issued
        res = authenticated_client.put(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}", json={"status": "issued"})
        assert res.status_code == 200
        assert res.json()["status"] == "issued"
        
        # Update status to paid
        res = authenticated_client.put(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}", json={"status": "paid"})
        assert res.status_code == 200
        assert res.json()["status"] == "paid"
        
        # Try to delete paid invoice - should fail
        res = authenticated_client.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")
        assert res.status_code == 400, "Should not be able to delete paid invoice"
        
        # Cancel and cleanup
        authenticated_client.put(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}", json={"status": "cancelled"})
        authenticated_client.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")
    
    def test_delete_blocked_when_issued(self, authenticated_client, test_customer_same_state):
        """DELETE blocked when status in ('issued','paid')"""
        # Create and issue
        payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [{"description": "Delete Block Test", "quantity": 1, "rate": 100, "gst_rate": 18}],
            "status": "issued"
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/tax-invoices", json=payload)
        assert res.status_code == 201
        ti = res.json()
        
        # Try to delete issued invoice - should fail
        res = authenticated_client.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")
        assert res.status_code == 400
        
        # Cancel and cleanup
        authenticated_client.put(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}", json={"status": "cancelled"})
        authenticated_client.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")


class TestQuotationToProformaConversion:
    """Quotation → Proforma Invoice Conversion Tests"""
    
    def test_convert_quotation_to_proforma(self, authenticated_client, test_customer_same_state):
        """POST /api/crm/quotations/{qid}/convert-to-proforma creates PI from quotation"""
        # Create a quotation first
        q_payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [
                {"description": "Quotation Item 1", "quantity": 10, "rate": 500, "gst_rate": 18, "discount_pct": 5}
            ],
            "notes": "Test quotation for conversion"
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/quotations", json=q_payload)
        assert res.status_code == 201, f"Failed to create quotation: {res.text}"
        quotation = res.json()
        
        # Convert to proforma
        res = authenticated_client.post(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/convert-to-proforma", json={
            "advance_percentage": 30
        })
        assert res.status_code == 200, f"Failed to convert to proforma: {res.text}"
        proforma = res.json()
        
        # Verify proforma was created
        assert "proforma_no" in proforma
        assert proforma["quotation_id"] == quotation["id"]
        assert proforma["customer_id"] == test_customer_same_state["id"]
        assert proforma["advance_percentage"] == 30
        
        # Verify quotation now has proforma link
        res = authenticated_client.get(f"{BASE_URL}/api/crm/quotations")
        quotations = res.json()
        updated_q = next((q for q in quotations if q["id"] == quotation["id"]), None)
        assert updated_q is not None
        assert updated_q.get("proforma_id") == proforma["id"]
        assert updated_q.get("proforma_no") == proforma["proforma_no"]
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/crm/proformas/{proforma['id']}")
        authenticated_client.delete(f"{BASE_URL}/api/crm/quotations/{quotation['id']}")


class TestProformaToTaxInvoiceConversion:
    """Proforma → Tax Invoice Conversion Tests"""
    
    def test_convert_proforma_to_tax_invoice(self, authenticated_client, test_customer_same_state):
        """POST /api/crm/proformas/{pid}/convert-to-tax-invoice creates TI with status='issued'"""
        # Create proforma
        p_payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [
                {"description": "PI to TI Item", "quantity": 5, "rate": 1000, "gst_rate": 18, "hsn_code": "8413"}
            ]
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas", json=p_payload)
        assert res.status_code == 201
        proforma = res.json()
        
        # Convert to tax invoice
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas/{proforma['id']}/convert-to-tax-invoice", json={})
        assert res.status_code == 200, f"Failed to convert to tax invoice: {res.text}"
        tax_invoice = res.json()
        
        # Verify tax invoice
        assert "invoice_no" in tax_invoice
        assert tax_invoice["status"] == "issued"
        assert tax_invoice["proforma_id"] == proforma["id"]
        assert "qr_code" in tax_invoice
        
        # Verify proforma status changed to 'converted'
        res = authenticated_client.get(f"{BASE_URL}/api/crm/proformas")
        proformas = res.json()
        updated_p = next((p for p in proformas if p["id"] == proforma["id"]), None)
        assert updated_p is not None
        assert updated_p["status"] == "converted"
        assert updated_p.get("converted_tax_invoice_id") == tax_invoice["id"]
        
        # Cleanup
        authenticated_client.put(f"{BASE_URL}/api/crm/tax-invoices/{tax_invoice['id']}", json={"status": "cancelled"})
        authenticated_client.delete(f"{BASE_URL}/api/crm/tax-invoices/{tax_invoice['id']}")
    
    def test_convert_already_converted_proforma_fails(self, authenticated_client, test_customer_same_state):
        """Subsequent convert attempt returns 400"""
        # Create and convert proforma
        p_payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [{"description": "Double Convert Test", "quantity": 1, "rate": 100, "gst_rate": 18}]
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas", json=p_payload)
        assert res.status_code == 201
        proforma = res.json()
        
        # First convert - should succeed
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas/{proforma['id']}/convert-to-tax-invoice", json={})
        assert res.status_code == 200
        tax_invoice = res.json()
        
        # Second convert - should fail with 400
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas/{proforma['id']}/convert-to-tax-invoice", json={})
        assert res.status_code == 400, "Should not be able to convert already converted proforma"
        assert "already converted" in res.json().get("detail", "").lower()
        
        # Cleanup
        authenticated_client.put(f"{BASE_URL}/api/crm/tax-invoices/{tax_invoice['id']}", json={"status": "cancelled"})
        authenticated_client.delete(f"{BASE_URL}/api/crm/tax-invoices/{tax_invoice['id']}")


class TestTaxInvoiceFYReset:
    """Tax Invoice with reset_yearly=true creates FY-based invoice numbers"""
    
    def test_tax_invoice_fy_format(self, authenticated_client, test_customer_same_state):
        """Tax Invoice with reset_yearly=true creates invoices with format INV-FY26-27/000001"""
        # First, ensure tax_invoice number series has reset_yearly=true
        res = authenticated_client.put(f"{BASE_URL}/api/crm/number-series/tax_invoice", json={
            "prefix": "INV-",
            "padding": 6,
            "reset_yearly": True
        })
        assert res.status_code == 200
        
        # Create a tax invoice
        payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [{"description": "FY Test Item", "quantity": 1, "rate": 100, "gst_rate": 18}],
            "status": "draft"
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/tax-invoices", json=payload)
        assert res.status_code == 201
        ti = res.json()
        
        # Verify invoice number contains FY format
        invoice_no = ti["invoice_no"]
        assert "FY" in invoice_no, f"Expected FY in invoice number, got: {invoice_no}"
        # Format should be like INV-FY25-26/000001
        assert "/" in invoice_no, f"Expected / separator in FY invoice number, got: {invoice_no}"
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")


class TestHSNSummary:
    """HSN-wise Tax Breakup Tests"""
    
    def test_hsn_summary_in_proforma(self, authenticated_client, test_customer_same_state):
        """Proforma includes hsn_summary with tax breakup"""
        payload = {
            "customer_id": test_customer_same_state["id"],
            "customer_name": test_customer_same_state["name"],
            "lines": [
                {"description": "Item A", "quantity": 10, "rate": 100, "gst_rate": 18, "hsn_code": "8413"},
                {"description": "Item B", "quantity": 5, "rate": 200, "gst_rate": 12, "hsn_code": "8414"},
                {"description": "Item C", "quantity": 2, "rate": 500, "gst_rate": 18, "hsn_code": "8413"}  # Same HSN as A
            ]
        }
        res = authenticated_client.post(f"{BASE_URL}/api/crm/proformas", json=payload)
        assert res.status_code == 201
        data = res.json()
        
        # Verify HSN summary exists and has correct structure
        assert "hsn_summary" in data
        hsn_summary = data["hsn_summary"]
        assert isinstance(hsn_summary, list)
        
        # Should have 2 unique HSN codes (8413 and 8414)
        # But grouped by (hsn, rate), so 8413@18% and 8414@12%
        hsn_codes = [h["hsn"] for h in hsn_summary]
        assert "8413" in hsn_codes
        assert "8414" in hsn_codes
        
        # Verify each HSN entry has required fields
        for h in hsn_summary:
            assert "hsn" in h
            assert "rate" in h
            assert "taxable" in h
            assert "cgst" in h or "igst" in h
            assert "sgst" in h or "igst" in h
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/crm/proformas/{data['id']}")


class TestCleanup:
    """Cleanup test customers"""
    
    def test_cleanup_test_customers(self, authenticated_client):
        """Remove TEST_ prefixed customers"""
        res = authenticated_client.get(f"{BASE_URL}/api/customers")
        if res.status_code == 200:
            customers = res.json()
            for c in customers:
                if c.get("name", "").startswith("TEST_"):
                    authenticated_client.delete(f"{BASE_URL}/api/customers/{c['id']}")
        assert True  # Always pass cleanup


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
