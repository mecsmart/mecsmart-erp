"""
GST Phase 2 (P2) Tests - Tax Invoice GST Split, POS Override, IRN Infrastructure, UPI QR
Tests:
1. GST split logic: CGST/SGST for intra-state (same state_code), IGST for inter-state
2. POS override: place_of_supply field flips GST split on create and update
3. HSN summary array with correct keys
4. UPI QR code uses company bank_upi (not hardcoded machineworks@upi)
5. IRN endpoint gracefully errors when not configured
6. E-invoice payload builder returns valid v1.1 JSON
7. Company settings update accepts new GST e-Invoice fields
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Login and return authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return session


@pytest.fixture(scope="module")
def company_state_code(auth_session):
    """Get company state_code (should be 27 for Maharashtra)"""
    resp = auth_session.get(f"{BASE_URL}/api/settings/company")
    assert resp.status_code == 200
    company = resp.json()
    return (company.get("state_code") or "").strip()


@pytest.fixture(scope="module")
def same_state_customer(auth_session, company_state_code):
    """Create a customer in the same state as company (state_code=27)"""
    customer_data = {
        "name": f"TEST_SameState_Customer_{uuid.uuid4().hex[:6]}",
        "gstin": "27AABCU9603R1ZM",
        "state_code": company_state_code or "27",  # Same as company
        "state": "Maharashtra",
        "city": "Pune",
        "pin_code": "411001",
        "address": "123 Test Street",
        "email": "samestate@test.com",
        "phone": "9876543210"
    }
    resp = auth_session.post(f"{BASE_URL}/api/customers", json=customer_data)
    assert resp.status_code == 201, f"Failed to create same-state customer: {resp.text}"
    customer = resp.json()
    yield customer
    # Cleanup
    auth_session.delete(f"{BASE_URL}/api/customers/{customer['id']}")


@pytest.fixture(scope="module")
def diff_state_customer(auth_session):
    """Create a customer in a different state (state_code=29 Karnataka)"""
    customer_data = {
        "name": f"TEST_DiffState_Customer_{uuid.uuid4().hex[:6]}",
        "gstin": "29AABCU9603R1ZM",
        "state_code": "29",  # Karnataka - different from company (27)
        "state": "Karnataka",
        "city": "Bangalore",
        "pin_code": "560001",
        "address": "456 Test Avenue",
        "email": "diffstate@test.com",
        "phone": "9876543211"
    }
    resp = auth_session.post(f"{BASE_URL}/api/customers", json=customer_data)
    assert resp.status_code == 201, f"Failed to create diff-state customer: {resp.text}"
    customer = resp.json()
    yield customer
    # Cleanup
    auth_session.delete(f"{BASE_URL}/api/customers/{customer['id']}")


class TestGSTSplitLogic:
    """Test CGST/SGST vs IGST split based on company state vs customer/POS state"""
    
    def test_intra_state_gst_split_cgst_sgst(self, auth_session, same_state_customer):
        """Create TI with customer in same state (27) - should have CGST+SGST, no IGST"""
        ti_data = {
            "customer_id": same_state_customer["id"],
            "customer_name": same_state_customer["name"],
            "billing_address": same_state_customer.get("address", "Test Address"),
            "lines": [
                {
                    "description": "Test Product 1",
                    "hsn_code": "8479",
                    "quantity": 10,
                    "rate": 1000.0,
                    "gst_rate": 18.0,
                    "uom": "Nos"
                }
            ]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201, f"Failed to create TI: {resp.text}"
        ti = resp.json()
        
        # Verify GST split - intra-state should have CGST+SGST, no IGST
        assert ti.get("is_inter_state") == False, f"Expected intra-state, got is_inter_state={ti.get('is_inter_state')}"
        assert ti.get("cgst", 0) > 0, f"Expected CGST > 0, got {ti.get('cgst')}"
        assert ti.get("sgst", 0) > 0, f"Expected SGST > 0, got {ti.get('sgst')}"
        assert ti.get("igst", 0) == 0, f"Expected IGST = 0, got {ti.get('igst')}"
        
        # Verify CGST = SGST (half of total GST each)
        assert ti.get("cgst") == ti.get("sgst"), f"CGST ({ti.get('cgst')}) should equal SGST ({ti.get('sgst')})"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")
    
    def test_inter_state_gst_split_igst(self, auth_session, diff_state_customer):
        """Create TI with customer in different state (29) - should have IGST only"""
        ti_data = {
            "customer_id": diff_state_customer["id"],
            "customer_name": diff_state_customer["name"],
            "billing_address": diff_state_customer.get("address", "Test Address"),
            "lines": [
                {
                    "description": "Test Product 2",
                    "hsn_code": "8479",
                    "quantity": 5,
                    "rate": 2000.0,
                    "gst_rate": 18.0,
                    "uom": "Nos"
                }
            ]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201, f"Failed to create TI: {resp.text}"
        ti = resp.json()
        
        # Verify GST split - inter-state should have IGST only
        assert ti.get("is_inter_state") == True, f"Expected inter-state, got is_inter_state={ti.get('is_inter_state')}"
        assert ti.get("igst", 0) > 0, f"Expected IGST > 0, got {ti.get('igst')}"
        assert ti.get("cgst", 0) == 0, f"Expected CGST = 0, got {ti.get('cgst')}"
        assert ti.get("sgst", 0) == 0, f"Expected SGST = 0, got {ti.get('sgst')}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")


class TestPOSOverride:
    """Test place_of_supply override flipping GST split"""
    
    def test_pos_override_on_create_makes_inter_state(self, auth_session, same_state_customer):
        """Create TI with same-state customer but POS=29 - should be inter-state (IGST)"""
        ti_data = {
            "customer_id": same_state_customer["id"],
            "customer_name": same_state_customer["name"],
            "billing_address": same_state_customer.get("address", "Test Address"),
            "place_of_supply": "29",  # Override to Karnataka (different from company 27)
            "lines": [
                {
                    "description": "Test Product POS Override",
                    "hsn_code": "8479",
                    "quantity": 2,
                    "rate": 5000.0,
                    "gst_rate": 18.0,
                    "uom": "Nos"
                }
            ]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201, f"Failed to create TI: {resp.text}"
        ti = resp.json()
        
        # Even though customer is in state 27, POS=29 should make it inter-state
        assert ti.get("is_inter_state") == True, f"POS override should make inter-state, got {ti.get('is_inter_state')}"
        assert ti.get("igst", 0) > 0, f"Expected IGST > 0 with POS override"
        assert ti.get("cgst", 0) == 0, f"Expected CGST = 0 with POS override"
        assert ti.get("sgst", 0) == 0, f"Expected SGST = 0 with POS override"
        
        # Store TI ID for update test
        ti_id = ti["id"]
        
        # Test UPDATE: Change POS back to 27 (same as company) - should flip to intra-state
        update_resp = auth_session.put(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}", json={
            "place_of_supply": "27"  # Same as company state
        })
        assert update_resp.status_code == 200, f"Failed to update TI: {update_resp.text}"
        updated_ti = update_resp.json()
        
        # Should now be intra-state with CGST+SGST
        assert updated_ti.get("is_inter_state") == False, f"POS=27 should make intra-state"
        assert updated_ti.get("cgst", 0) > 0, f"Expected CGST > 0 after POS change to 27"
        assert updated_ti.get("sgst", 0) > 0, f"Expected SGST > 0 after POS change to 27"
        assert updated_ti.get("igst", 0) == 0, f"Expected IGST = 0 after POS change to 27"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}")
    
    def test_pos_update_flips_back_to_inter_state(self, auth_session, same_state_customer):
        """Create intra-state TI, then update POS to different state - should flip to IGST"""
        # Create intra-state TI (no POS override)
        ti_data = {
            "customer_id": same_state_customer["id"],
            "customer_name": same_state_customer["name"],
            "billing_address": "Test Address",
            "lines": [
                {
                    "description": "Test Product Flip",
                    "hsn_code": "8479",
                    "quantity": 1,
                    "rate": 10000.0,
                    "gst_rate": 18.0,
                    "uom": "Nos"
                }
            ]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201
        ti = resp.json()
        ti_id = ti["id"]
        
        # Verify initially intra-state
        assert ti.get("is_inter_state") == False
        assert ti.get("cgst", 0) > 0
        
        # Update POS to 29 (Karnataka)
        update_resp = auth_session.put(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}", json={
            "place_of_supply": "29"
        })
        assert update_resp.status_code == 200
        updated_ti = update_resp.json()
        
        # Should now be inter-state with IGST
        assert updated_ti.get("is_inter_state") == True, f"POS=29 should make inter-state"
        assert updated_ti.get("igst", 0) > 0, f"Expected IGST > 0 after POS change to 29"
        assert updated_ti.get("cgst", 0) == 0, f"Expected CGST = 0 after POS change to 29"
        assert updated_ti.get("sgst", 0) == 0, f"Expected SGST = 0 after POS change to 29"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}")


class TestHSNSummary:
    """Test HSN summary array in Tax Invoice response"""
    
    def test_hsn_summary_has_correct_keys(self, auth_session, same_state_customer):
        """Verify HSN summary contains hsn, rate, taxable, cgst, sgst, igst keys"""
        ti_data = {
            "customer_id": same_state_customer["id"],
            "customer_name": same_state_customer["name"],
            "billing_address": "Test Address",
            "lines": [
                {
                    "description": "Product A",
                    "hsn_code": "8479",
                    "quantity": 2,
                    "rate": 1000.0,
                    "gst_rate": 18.0,
                    "uom": "Nos"
                },
                {
                    "description": "Product B",
                    "hsn_code": "8480",
                    "quantity": 3,
                    "rate": 500.0,
                    "gst_rate": 12.0,
                    "uom": "Nos"
                }
            ]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201
        ti = resp.json()
        
        # Verify hsn_summary exists and has correct structure
        hsn_summary = ti.get("hsn_summary", [])
        assert isinstance(hsn_summary, list), f"hsn_summary should be a list"
        assert len(hsn_summary) >= 2, f"Expected at least 2 HSN entries, got {len(hsn_summary)}"
        
        required_keys = {"hsn", "rate", "taxable", "cgst", "sgst", "igst"}
        for entry in hsn_summary:
            assert isinstance(entry, dict), f"HSN entry should be a dict"
            for key in required_keys:
                assert key in entry, f"HSN entry missing key: {key}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")


class TestUPIQRCode:
    """Test UPI QR code uses company bank_upi (not hardcoded)"""
    
    def test_qr_code_uses_company_upi(self, auth_session, same_state_customer):
        """Verify QR code starts with upi://pay?pa= and uses company config"""
        # First get company settings to check bank_upi
        company_resp = auth_session.get(f"{BASE_URL}/api/settings/company")
        assert company_resp.status_code == 200
        company = company_resp.json()
        bank_upi = (company.get("bank_upi") or "").strip()
        
        # Create a Tax Invoice
        ti_data = {
            "customer_id": same_state_customer["id"],
            "customer_name": same_state_customer["name"],
            "billing_address": "Test Address",
            "lines": [
                {
                    "description": "QR Test Product",
                    "hsn_code": "8479",
                    "quantity": 1,
                    "rate": 1000.0,
                    "gst_rate": 18.0,
                    "uom": "Nos"
                }
            ]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201
        ti = resp.json()
        
        qr_code = ti.get("qr_code", "")
        
        # Verify QR code format
        assert qr_code.startswith("upi://pay?pa="), f"QR code should start with 'upi://pay?pa=', got: {qr_code[:50]}"
        
        # Verify it does NOT use hardcoded machineworks@upi
        assert "machineworks@upi" not in qr_code, f"QR code should NOT contain hardcoded 'machineworks@upi'"
        
        # If company has bank_upi configured, verify it's used
        if bank_upi:
            assert bank_upi in qr_code, f"QR code should contain company bank_upi '{bank_upi}'"
        else:
            # If not configured, should use fallback 'na@upi'
            assert "na@upi" in qr_code, f"QR code should contain fallback 'na@upi' when bank_upi not configured"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")
    
    def test_all_existing_tis_have_proper_qr(self, auth_session):
        """Verify no existing TIs have the hardcoded machineworks@upi"""
        resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert resp.status_code == 200
        tis = resp.json()
        
        for ti in tis:
            qr_code = ti.get("qr_code", "")
            if qr_code:
                assert "machineworks@upi" not in qr_code, f"TI {ti.get('invoice_no')} still has hardcoded machineworks@upi"


class TestIRNEndpoint:
    """Test IRN generation endpoint gracefully errors when not configured"""
    
    def test_irn_endpoint_returns_400_when_not_enabled(self, auth_session, same_state_customer):
        """POST /api/crm/tax-invoices/{id}/generate-irn should return 400 with proper message"""
        # First ensure gst_einvoice_enabled is false
        company_resp = auth_session.get(f"{BASE_URL}/api/settings/company")
        assert company_resp.status_code == 200
        company = company_resp.json()
        
        # Create a Tax Invoice
        ti_data = {
            "customer_id": same_state_customer["id"],
            "customer_name": same_state_customer["name"],
            "billing_address": "Test Address",
            "lines": [
                {
                    "description": "IRN Test Product",
                    "hsn_code": "8479",
                    "quantity": 1,
                    "rate": 1000.0,
                    "gst_rate": 18.0,
                    "uom": "Nos"
                }
            ]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201
        ti = resp.json()
        ti_id = ti["id"]
        
        # Try to generate IRN - should fail gracefully
        irn_resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}/generate-irn")
        
        # Should return 400 (not 500) with clear message
        assert irn_resp.status_code == 400, f"Expected 400, got {irn_resp.status_code}: {irn_resp.text}"
        
        error_detail = irn_resp.json().get("detail", "")
        assert "GST e-Invoice is not enabled" in error_detail or "not enabled" in error_detail.lower(), \
            f"Expected 'GST e-Invoice is not enabled' message, got: {error_detail}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}")


class TestEInvoicePayload:
    """Test e-invoice payload builder returns valid v1.1 JSON"""
    
    def test_einvoice_payload_has_required_keys(self, auth_session, same_state_customer):
        """GET /api/crm/tax-invoices/{id}/einvoice-payload returns valid v1.1 JSON"""
        # Create a Tax Invoice
        ti_data = {
            "customer_id": same_state_customer["id"],
            "customer_name": same_state_customer["name"],
            "billing_address": "Test Address",
            "lines": [
                {
                    "description": "E-Invoice Test Product",
                    "hsn_code": "8479",
                    "quantity": 2,
                    "rate": 5000.0,
                    "gst_rate": 18.0,
                    "uom": "Nos"
                }
            ]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201
        ti = resp.json()
        ti_id = ti["id"]
        
        # Get e-invoice payload
        payload_resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}/einvoice-payload")
        assert payload_resp.status_code == 200, f"Failed to get einvoice-payload: {payload_resp.text}"
        
        payload = payload_resp.json()
        
        # Verify required v1.1 keys
        required_keys = ["Version", "TranDtls", "DocDtls", "SellerDtls", "BuyerDtls", "ItemList", "ValDtls"]
        for key in required_keys:
            assert key in payload, f"E-invoice payload missing required key: {key}"
        
        # Verify Version is 1.1
        assert payload.get("Version") == "1.1", f"Expected Version 1.1, got {payload.get('Version')}"
        
        # Verify TranDtls structure
        tran_dtls = payload.get("TranDtls", {})
        assert "TaxSch" in tran_dtls, "TranDtls missing TaxSch"
        assert "SupTyp" in tran_dtls, "TranDtls missing SupTyp"
        
        # Verify DocDtls structure
        doc_dtls = payload.get("DocDtls", {})
        assert "Typ" in doc_dtls, "DocDtls missing Typ"
        assert "No" in doc_dtls, "DocDtls missing No"
        assert "Dt" in doc_dtls, "DocDtls missing Dt"
        
        # Verify SellerDtls structure
        seller_dtls = payload.get("SellerDtls", {})
        assert "Gstin" in seller_dtls, "SellerDtls missing Gstin"
        assert "LglNm" in seller_dtls, "SellerDtls missing LglNm"
        
        # Verify BuyerDtls structure
        buyer_dtls = payload.get("BuyerDtls", {})
        assert "Gstin" in buyer_dtls or "LglNm" in buyer_dtls, "BuyerDtls missing Gstin/LglNm"
        
        # Verify ItemList is a list with items
        item_list = payload.get("ItemList", [])
        assert isinstance(item_list, list), "ItemList should be a list"
        assert len(item_list) > 0, "ItemList should have at least one item"
        
        # Verify ValDtls structure
        val_dtls = payload.get("ValDtls", {})
        assert "AssVal" in val_dtls, "ValDtls missing AssVal"
        assert "TotInvVal" in val_dtls, "ValDtls missing TotInvVal"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}")


class TestCompanyGSTSettings:
    """Test company settings update accepts new GST e-Invoice fields"""
    
    def test_company_settings_accepts_gst_einvoice_fields(self, auth_session):
        """PUT /api/settings/company with gst_einvoice_* fields should persist"""
        # Get current settings
        get_resp = auth_session.get(f"{BASE_URL}/api/settings/company")
        assert get_resp.status_code == 200
        original = get_resp.json()
        
        # Update with GST e-Invoice fields
        update_data = {
            "gst_einvoice_enabled": True,
            "gst_einvoice_provider": "nic_sandbox",
            "gst_einvoice_endpoint": "https://einv-apisandbox.nic.in",
            "gst_einvoice_username": "test_user",
            "gst_einvoice_password": "test_pass",
            "gst_einvoice_api_key": "test_api_key"
        }
        
        update_resp = auth_session.put(f"{BASE_URL}/api/settings/company", json=update_data)
        assert update_resp.status_code == 200, f"Failed to update company settings: {update_resp.text}"
        
        # Verify fields are persisted
        verify_resp = auth_session.get(f"{BASE_URL}/api/settings/company")
        assert verify_resp.status_code == 200
        updated = verify_resp.json()
        
        assert updated.get("gst_einvoice_enabled") == True, "gst_einvoice_enabled not persisted"
        assert updated.get("gst_einvoice_provider") == "nic_sandbox", "gst_einvoice_provider not persisted"
        assert updated.get("gst_einvoice_endpoint") == "https://einv-apisandbox.nic.in", "gst_einvoice_endpoint not persisted"
        assert updated.get("gst_einvoice_username") == "test_user", "gst_einvoice_username not persisted"
        assert updated.get("gst_einvoice_password") == "test_pass", "gst_einvoice_password not persisted"
        assert updated.get("gst_einvoice_api_key") == "test_api_key", "gst_einvoice_api_key not persisted"
        
        # Restore original settings (disable e-invoice)
        restore_data = {
            "gst_einvoice_enabled": False,
            "gst_einvoice_provider": original.get("gst_einvoice_provider", ""),
            "gst_einvoice_endpoint": original.get("gst_einvoice_endpoint", ""),
            "gst_einvoice_username": original.get("gst_einvoice_username", ""),
            "gst_einvoice_password": original.get("gst_einvoice_password", ""),
            "gst_einvoice_api_key": original.get("gst_einvoice_api_key", "")
        }
        auth_session.put(f"{BASE_URL}/api/settings/company", json=restore_data)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
