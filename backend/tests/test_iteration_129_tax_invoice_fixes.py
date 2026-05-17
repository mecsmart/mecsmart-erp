"""
Iteration 129 Tests: Seven Tax Invoice Fixes

Tests:
1. Packing List duplicate guard - POST /api/crm/packing-lists returns 400 when TI already has a PL
2. Packing List delete clears TI back-link, allowing re-creation
3. Tally XML enrichment - BUYERADDRESS.LIST, PARTYGSTIN, PLACEOFSUPPLY, per-line DESCRIPTION, DISCOUNT
4. Tally XML - Discount Allowed ledger entry when any line has discount_pct > 0
5. Tally XML bulk endpoint still works with enriched output
6. REGRESSION: PI Tally XML (single + bulk) still works
7. REGRESSION: Tax Invoice CRUD still works
8. REGRESSION: Packing List CRUD still works
9. REGRESSION: GRN draft + multi-GRN→PI from iteration 127 still pass
"""

import pytest
import requests
import os
import re
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for all tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login as admin
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return session


@pytest.fixture(scope="module")
def test_customer(auth_session):
    """Create or get a test customer with GSTIN for Tally XML tests"""
    # Try to find existing test customer
    resp = auth_session.get(f"{BASE_URL}/api/customers")
    assert resp.status_code == 200
    customers = resp.json()
    
    # Look for a customer with GSTIN
    for c in customers:
        if c.get("gstin"):
            return c
    
    # Create a new test customer with GSTIN
    customer_data = {
        "name": "TEST_TallyXML_Customer",
        "gstin": "27AABCU9603R1ZM",
        "state_code": "27",
        "address": "123 Test Street\nMumbai",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pin_code": "400001",
        "contact_person": "Test Contact",
        "email": "test@example.com",
        "phone": "9876543210"
    }
    resp = auth_session.post(f"{BASE_URL}/api/customers", json=customer_data)
    if resp.status_code == 201:
        return resp.json()
    # If customer code exists, find it
    resp = auth_session.get(f"{BASE_URL}/api/customers")
    for c in resp.json():
        if c.get("name") == "TEST_TallyXML_Customer":
            return c
    return customers[0] if customers else None


@pytest.fixture(scope="module")
def test_item(auth_session):
    """Create or get a test item for tax invoice lines"""
    resp = auth_session.get(f"{BASE_URL}/api/items")
    assert resp.status_code == 200
    items = resp.json()
    
    # Look for an item with description
    for it in items:
        if it.get("description"):
            return it
    
    # Return first item if available
    if items:
        return items[0]
    
    # Create a test item
    item_data = {
        "part_number": "TEST-TI-ITEM-129",
        "name": "Test Tax Invoice Item",
        "description": "This is a test item description for Tally XML",
        "category": "finished_good",
        "unit_of_measure": "pcs",
        "hsn_code": "8413",
        "gst_rate": 18,
        "sale_price": 1000
    }
    resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
    if resp.status_code == 201:
        return resp.json()
    return None


class TestPackingListDuplicateGuard:
    """Test that multiple Packing Lists are blocked per Tax Invoice"""
    
    def test_create_tax_invoice_for_packing_list_test(self, auth_session, test_customer, test_item):
        """Create a fresh Tax Invoice for packing list tests"""
        if not test_customer or not test_item:
            pytest.skip("No test customer or item available")
        
        ti_data = {
            "customer_id": test_customer["id"],
            "customer_name": test_customer["name"],
            "billing_address": test_customer.get("address", "Test Address"),
            "invoice_date": datetime.now().isoformat(),
            "lines": [{
                "item_id": test_item["id"],
                "description": test_item.get("description", "Test item"),
                "hsn_code": test_item.get("hsn_code", "8413"),
                "quantity": 5,
                "uom": test_item.get("unit_of_measure", "pcs"),
                "rate": 1000,
                "discount_pct": 0,
                "gst_rate": 18
            }]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201, f"Failed to create TI: {resp.text}"
        ti = resp.json()
        assert "id" in ti
        assert "invoice_no" in ti
        # Store for later tests - including lines for building PL
        self.__class__.test_ti_id = ti["id"]
        self.__class__.test_ti_no = ti.get("invoice_no", "")
        self.__class__.test_ti_lines = ti.get("lines", [])
        print(f"Created Tax Invoice: {ti.get('invoice_no')}")
    
    def test_first_packing_list_succeeds(self, auth_session):
        """First packing list creation should succeed (201)"""
        ti_id = getattr(self.__class__, 'test_ti_id', None)
        ti_lines = getattr(self.__class__, 'test_ti_lines', [])
        if not ti_id:
            pytest.skip("No test TI created")
        
        # Build packing list lines from TI lines with required fields
        pl_lines = []
        for idx, ln in enumerate(ti_lines):
            pl_lines.append({
                "source_line_index": idx,
                "item_id": ln.get("item_id", ""),
                "item_name": ln.get("item", {}).get("name", "") or ln.get("description", "Test Item"),
                "invoice_qty": float(ln.get("quantity", 0)),
                "packed_qty": float(ln.get("quantity", 0)),
                "uom": ln.get("uom", "pcs"),
                "expanded": False,
                "components": []
            })
        
        pl_data = {
            "tax_invoice_id": ti_id,
            "lines": pl_lines,
            "notes": "Test packing list"
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/packing-lists", json=pl_data)
        assert resp.status_code == 201, f"First PL should succeed: {resp.text}"
        pl = resp.json()
        assert "id" in pl
        assert "packing_list_no" in pl
        self.__class__.test_pl_id = pl["id"]
        self.__class__.test_pl_no = pl.get("packing_list_no", "")
        print(f"Created Packing List: {pl.get('packing_list_no')}")
    
    def test_second_packing_list_blocked_400(self, auth_session):
        """Second packing list for same TI should return 400 with 'already exists' message"""
        ti_id = getattr(self.__class__, 'test_ti_id', None)
        ti_lines = getattr(self.__class__, 'test_ti_lines', [])
        if not ti_id:
            pytest.skip("No test TI created")
        
        # Build packing list lines from TI lines with required fields
        pl_lines = []
        for idx, ln in enumerate(ti_lines):
            pl_lines.append({
                "source_line_index": idx,
                "item_id": ln.get("item_id", ""),
                "item_name": ln.get("item", {}).get("name", "") or ln.get("description", "Test Item"),
                "invoice_qty": float(ln.get("quantity", 0)),
                "packed_qty": float(ln.get("quantity", 0)),
                "uom": ln.get("uom", "pcs"),
                "expanded": False,
                "components": []
            })
        
        pl_data = {
            "tax_invoice_id": ti_id,
            "lines": pl_lines,
            "notes": "Duplicate packing list attempt"
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/packing-lists", json=pl_data)
        assert resp.status_code == 400, f"Second PL should be blocked: {resp.text}"
        detail = resp.json().get("detail", "")
        assert "already exists" in detail.lower(), f"Error should mention 'already exists': {detail}"
        print(f"Correctly blocked duplicate PL: {detail}")
    
    def test_delete_packing_list_clears_backlink(self, auth_session):
        """Deleting PL should clear TI back-link (packing_list_id, packing_list_no)"""
        pl_id = getattr(self.__class__, 'test_pl_id', None)
        ti_id = getattr(self.__class__, 'test_ti_id', None)
        if not pl_id or not ti_id:
            pytest.skip("No test PL or TI created")
        
        # Delete the packing list
        resp = auth_session.delete(f"{BASE_URL}/api/crm/packing-lists/{pl_id}")
        assert resp.status_code == 200, f"Delete PL failed: {resp.text}"
        
        # Verify TI back-link is cleared by fetching from list
        ti_list_resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert ti_list_resp.status_code == 200
        ti_list = ti_list_resp.json()
        ti = next((t for t in ti_list if t.get("id") == ti_id), None)
        if not ti:
            pytest.skip("Test TI not found in list")
        
        assert not ti.get("packing_list_id"), f"packing_list_id should be cleared, got: {ti.get('packing_list_id')}"
        assert not ti.get("packing_list_no"), f"packing_list_no should be cleared, got: {ti.get('packing_list_no')}"
        print("PL deleted and TI back-link cleared")
    
    def test_recreate_packing_list_after_delete(self, auth_session):
        """After deleting PL, creating a new one should succeed"""
        ti_id = getattr(self.__class__, 'test_ti_id', None)
        ti_lines = getattr(self.__class__, 'test_ti_lines', [])
        if not ti_id:
            pytest.skip("No test TI created")
        
        # Build packing list lines from TI lines with required fields
        pl_lines = []
        for idx, ln in enumerate(ti_lines):
            pl_lines.append({
                "source_line_index": idx,
                "item_id": ln.get("item_id", ""),
                "item_name": ln.get("item", {}).get("name", "") or ln.get("description", "Test Item"),
                "invoice_qty": float(ln.get("quantity", 0)),
                "packed_qty": float(ln.get("quantity", 0)),
                "uom": ln.get("uom", "pcs"),
                "expanded": False,
                "components": []
            })
        
        pl_data = {
            "tax_invoice_id": ti_id,
            "lines": pl_lines,
            "notes": "Recreated packing list"
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/packing-lists", json=pl_data)
        assert resp.status_code == 201, f"Recreate PL should succeed: {resp.text}"
        pl = resp.json()
        print(f"Recreated Packing List: {pl.get('packing_list_no')}")
        
        # Cleanup - delete the recreated PL
        auth_session.delete(f"{BASE_URL}/api/crm/packing-lists/{pl['id']}")


class TestTallyXMLEnrichment:
    """Test Tally Sales Voucher XML enrichment for Tax Invoices"""
    
    def test_create_tax_invoice_with_discount_and_description(self, auth_session, test_customer, test_item):
        """Create a Tax Invoice with discount and description for Tally XML tests"""
        if not test_customer or not test_item:
            pytest.skip("No test customer or item available")
        
        ti_data = {
            "customer_id": test_customer["id"],
            "customer_name": test_customer["name"],
            "billing_address": test_customer.get("address", "Test Address"),
            "place_of_supply": "Maharashtra",
            "invoice_date": datetime.now().isoformat(),
            "lines": [{
                "item_id": test_item["id"],
                "description": "Custom line description for Tally",
                "hsn_code": test_item.get("hsn_code", "8413"),
                "quantity": 10,
                "uom": test_item.get("unit_of_measure", "pcs"),
                "rate": 1000,
                "discount_pct": 5,  # 5% discount to trigger Discount Allowed ledger
                "gst_rate": 18
            }]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code == 201, f"Failed to create TI: {resp.text}"
        ti = resp.json()
        self.__class__.tally_ti_id = ti["id"]
        self.__class__.tally_ti_no = ti.get("invoice_no", "")
        print(f"Created Tax Invoice for Tally test: {ti.get('invoice_no')}")
    
    def test_tally_xml_contains_buyeraddress_list(self, auth_session):
        """Tally XML should contain BUYERADDRESS.LIST with customer address"""
        ti_id = getattr(self.__class__, 'tally_ti_id', None)
        if not ti_id:
            pytest.skip("No test TI created")
        
        resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}/tally-xml")
        assert resp.status_code == 200, f"Tally XML export failed: {resp.text}"
        assert resp.headers.get("content-type", "").startswith("application/xml")
        
        xml = resp.text
        assert "<BUYERADDRESS.LIST>" in xml, "Missing BUYERADDRESS.LIST"
        assert "<BASICBUYERADDRESS.LIST>" in xml, "Missing BASICBUYERADDRESS.LIST"
        assert "<ADDRESS>" in xml, "Missing ADDRESS elements inside BUYERADDRESS.LIST"
        print("BUYERADDRESS.LIST present in Tally XML")
    
    def test_tally_xml_contains_partygstin(self, auth_session, test_customer):
        """Tally XML should contain PARTYGSTIN when customer has GSTIN"""
        ti_id = getattr(self.__class__, 'tally_ti_id', None)
        if not ti_id:
            pytest.skip("No test TI created")
        
        if not test_customer.get("gstin"):
            pytest.skip("Test customer has no GSTIN")
        
        resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}/tally-xml")
        assert resp.status_code == 200
        
        xml = resp.text
        assert "<PARTYGSTIN>" in xml, "Missing PARTYGSTIN"
        assert test_customer["gstin"] in xml, f"GSTIN {test_customer['gstin']} not found in XML"
        print(f"PARTYGSTIN present: {test_customer['gstin']}")
    
    def test_tally_xml_contains_placeofsupply(self, auth_session):
        """Tally XML should contain PLACEOFSUPPLY when invoice has place_of_supply"""
        ti_id = getattr(self.__class__, 'tally_ti_id', None)
        if not ti_id:
            pytest.skip("No test TI created")
        
        resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}/tally-xml")
        assert resp.status_code == 200
        
        xml = resp.text
        assert "<PLACEOFSUPPLY>" in xml, "Missing PLACEOFSUPPLY"
        assert "Maharashtra" in xml, "Place of supply value not found"
        print("PLACEOFSUPPLY present in Tally XML")
    
    def test_tally_xml_contains_per_line_description(self, auth_session):
        """Tally XML should contain DESCRIPTION tag for lines with description"""
        ti_id = getattr(self.__class__, 'tally_ti_id', None)
        if not ti_id:
            pytest.skip("No test TI created")
        
        resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}/tally-xml")
        assert resp.status_code == 200
        
        xml = resp.text
        assert "<DESCRIPTION>" in xml, "Missing per-line DESCRIPTION"
        assert "Custom line description for Tally" in xml, "Line description content not found"
        print("Per-line DESCRIPTION present in Tally XML")
    
    def test_tally_xml_contains_per_line_discount(self, auth_session):
        """Tally XML should contain DISCOUNT tag for each line"""
        ti_id = getattr(self.__class__, 'tally_ti_id', None)
        if not ti_id:
            pytest.skip("No test TI created")
        
        resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}/tally-xml")
        assert resp.status_code == 200
        
        xml = resp.text
        assert "<DISCOUNT>" in xml, "Missing per-line DISCOUNT"
        # Should have 5.00 for 5% discount
        assert "5.00" in xml or "<DISCOUNT>5" in xml, "Discount value not found"
        print("Per-line DISCOUNT present in Tally XML")
    
    def test_tally_xml_contains_discount_allowed_ledger(self, auth_session):
        """Tally XML should contain 'Discount Allowed' ledger entry when lines have discount"""
        ti_id = getattr(self.__class__, 'tally_ti_id', None)
        if not ti_id:
            pytest.skip("No test TI created")
        
        resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}/tally-xml")
        assert resp.status_code == 200
        
        xml = resp.text
        assert "<LEDGERNAME>Discount Allowed</LEDGERNAME>" in xml, "Missing 'Discount Allowed' ledger entry"
        print("'Discount Allowed' ledger entry present in Tally XML")
    
    def test_tally_xml_bulk_endpoint_works(self, auth_session):
        """POST /api/crm/tax-invoices/tally-xml-bulk should work with enriched output"""
        ti_id = getattr(self.__class__, 'tally_ti_id', None)
        if not ti_id:
            pytest.skip("No test TI created")
        
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices/tally-xml-bulk", json={
            "invoice_ids": [ti_id]
        })
        assert resp.status_code == 200, f"Bulk Tally XML failed: {resp.text}"
        assert resp.headers.get("content-type", "").startswith("application/xml")
        
        xml = resp.text
        # Should have all the enriched elements
        assert "<BUYERADDRESS.LIST>" in xml
        assert "<DISCOUNT>" in xml
        print("Bulk Tally XML export works with enriched output")
    
    def test_tally_xml_bulk_empty_ids_returns_400(self, auth_session):
        """POST /api/crm/tax-invoices/tally-xml-bulk with empty ids should return 400"""
        resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices/tally-xml-bulk", json={
            "invoice_ids": []
        })
        assert resp.status_code == 400, f"Empty bulk should return 400: {resp.text}"
        print("Empty bulk Tally XML correctly returns 400")


class TestRegressionPITallyXML:
    """Regression: PI Tally XML (single + bulk) should still work"""
    
    def test_pi_tally_xml_single_endpoint_exists(self, auth_session):
        """GET /api/purchase-invoices/{id}/tally-xml endpoint should exist"""
        # Get a PI to test with
        resp = auth_session.get(f"{BASE_URL}/api/purchase-invoices")
        assert resp.status_code == 200
        pis = resp.json()
        
        if not pis:
            pytest.skip("No purchase invoices available for testing")
        
        pi = pis[0]
        resp = auth_session.get(f"{BASE_URL}/api/purchase-invoices/{pi['id']}/tally-xml")
        # Should return 200 with XML or 404 if PI not found
        assert resp.status_code in [200, 404], f"Unexpected status: {resp.status_code}"
        if resp.status_code == 200:
            assert resp.headers.get("content-type", "").startswith("application/xml")
            print(f"PI Tally XML single endpoint works for PI {pi.get('invoice_no')}")
    
    def test_pi_tally_xml_bulk_endpoint_exists(self, auth_session):
        """POST /api/purchase-invoices/tally-xml-bulk endpoint should exist"""
        resp = auth_session.get(f"{BASE_URL}/api/purchase-invoices")
        assert resp.status_code == 200
        pis = resp.json()
        
        if not pis:
            pytest.skip("No purchase invoices available for testing")
        
        pi_ids = [p["id"] for p in pis[:2]]
        resp = auth_session.post(f"{BASE_URL}/api/purchase-invoices/tally-xml-bulk", json={
            "invoice_ids": pi_ids
        })
        assert resp.status_code == 200, f"PI bulk Tally XML failed: {resp.text}"
        assert resp.headers.get("content-type", "").startswith("application/xml")
        print("PI Tally XML bulk endpoint works")


class TestRegressionTaxInvoiceCRUD:
    """Regression: Tax Invoice CRUD should still work"""
    
    def test_list_tax_invoices(self, auth_session):
        """GET /api/crm/tax-invoices should return 200"""
        resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert resp.status_code == 200
        invoices = resp.json()
        assert isinstance(invoices, list)
        print(f"Tax Invoices list: {len(invoices)} invoices")
    
    def test_tax_invoice_status_change(self, auth_session):
        """PUT /api/crm/tax-invoices/{id} status change should work"""
        resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert resp.status_code == 200
        invoices = resp.json()
        
        if not invoices:
            pytest.skip("No tax invoices available")
        
        # Find a draft invoice to test status change
        draft_ti = next((ti for ti in invoices if ti.get("status") == "draft"), None)
        if not draft_ti:
            pytest.skip("No draft tax invoices available")
        
        # Change to issued
        resp = auth_session.put(f"{BASE_URL}/api/crm/tax-invoices/{draft_ti['id']}", json={
            "status": "issued"
        })
        assert resp.status_code == 200, f"Status change failed: {resp.text}"
        
        # Change back to draft
        resp = auth_session.put(f"{BASE_URL}/api/crm/tax-invoices/{draft_ti['id']}", json={
            "status": "draft"
        })
        assert resp.status_code == 200
        print("Tax Invoice status change works")


class TestRegressionPackingListCRUD:
    """Regression: Packing List CRUD should still work"""
    
    def test_list_packing_lists(self, auth_session):
        """GET /api/crm/packing-lists should return 200"""
        resp = auth_session.get(f"{BASE_URL}/api/crm/packing-lists")
        assert resp.status_code == 200
        pls = resp.json()
        assert isinstance(pls, list)
        print(f"Packing Lists: {len(pls)} lists")


class TestRegressionGRNAndPI:
    """Regression: GRN draft + multi-GRN→PI from iteration 127"""
    
    def test_grn_list_endpoint(self, auth_session):
        """GET /api/grn should return 200"""
        resp = auth_session.get(f"{BASE_URL}/api/grn")
        assert resp.status_code == 200
        grns = resp.json()
        assert isinstance(grns, list)
        print(f"GRN list: {len(grns)} GRNs")
    
    def test_pending_grns_endpoint(self, auth_session):
        """GET /api/purchase-invoices/pending-grns should return 200"""
        resp = auth_session.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert resp.status_code == 200
        pending = resp.json()
        assert isinstance(pending, list)
        print(f"Pending GRNs for PI: {len(pending)} GRNs")


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup(auth_session):
    """Cleanup test data after all tests"""
    yield
    # Cleanup is handled within individual tests
    print("Test cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
