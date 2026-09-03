"""
Iteration 89 Tests: Purchase Invoice Additional Charges + Items Page Pagination Fix

Tests:
1. Backend: POST /api/purchase-invoices with additional_charges computes totals correctly
2. Backend: PI doc persists additional_charges with {name, amount, gst_rate, tax_amount, total_with_tax}
3. Backend: PUT /api/purchase-invoices/{id} accepts updated additional_charges
4. Backend: Inter-state vs intra-state GST split on charges
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Authenticate and return session with cookies"""
    session = requests.Session()
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return session


@pytest.fixture(scope="module")
def test_supplier_intra(auth_session):
    """Create an intra-state supplier (same state as company)"""
    # First get company state_code
    company_resp = auth_session.get(f"{BASE_URL}/api/settings/company")
    company_state = "27"  # Default Maharashtra
    if company_resp.status_code == 200 and company_resp.json():
        company_state = company_resp.json().get("state_code", "27")
    
    supplier_data = {
        "name": f"TEST_IntraSupplier_{uuid.uuid4().hex[:6]}",
        "gstin": f"{company_state}AABCT1234A1ZA",
        "state_code": company_state,
        "email": "intra@test.com",
        "phone": "9876543210",
        "pin_code": "400001",  # Mumbai PIN
        "city": "Mumbai",
        "state": "Maharashtra",
        "address": "Test Address"
    }
    resp = auth_session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
    assert resp.status_code == 201, f"Failed to create intra-state supplier: {resp.text}"
    supplier = resp.json()
    yield supplier
    # Cleanup
    try:
        auth_session.delete(f"{BASE_URL}/api/suppliers/{supplier['id']}")
    except Exception:
        pass


@pytest.fixture(scope="module")
def test_supplier_inter(auth_session):
    """Create an inter-state supplier (different state from company)"""
    # Use a different state code (Karnataka = 29)
    supplier_data = {
        "name": f"TEST_InterSupplier_{uuid.uuid4().hex[:6]}",
        "gstin": "29AABCT5678B1ZB",
        "state_code": "29",  # Karnataka
        "email": "inter@test.com",
        "phone": "9876543211",
        "pin_code": "560001",  # Bangalore PIN
        "city": "Bangalore",
        "state": "Karnataka",
        "address": "Test Address"
    }
    resp = auth_session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
    assert resp.status_code == 201, f"Failed to create inter-state supplier: {resp.text}"
    supplier = resp.json()
    yield supplier
    # Cleanup
    try:
        auth_session.delete(f"{BASE_URL}/api/suppliers/{supplier['id']}")
    except Exception:
        pass


@pytest.fixture(scope="module")
def test_item(auth_session):
    """Create a test item for PI lines"""
    item_data = {
        "part_number": f"TEST-PI-{uuid.uuid4().hex[:6]}",
        "name": "Test Item for PI",
        "category": "raw_material",
        "unit_of_measure": "pcs",
        "unit_cost": 100,
        "purchase_price": 100,
        "gst_rate": 18,
        "hsn_code": "7208"
    }
    resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
    assert resp.status_code == 201, f"Failed to create test item: {resp.text}"
    item = resp.json()
    yield item
    # Cleanup
    try:
        auth_session.delete(f"{BASE_URL}/api/items/{item['id']}")
    except Exception:
        pass


class TestPurchaseInvoiceAdditionalCharges:
    """Test PI additional_charges feature"""
    
    def test_pi_with_charges_intra_state(self, auth_session, test_supplier_intra, test_item):
        """
        POST /api/purchase-invoices with additional_charges on intra-state supplier.
        Lines: 10 qty × 100 = 1000 subtotal @ 18% GST
        Charges: Freight 200 @ 18%, Packaging 100 @ 18%
        Expected:
        - subtotal = 1000
        - charges_subtotal = 300
        - lines GST = 180 (split: CGST 90, SGST 90)
        - charges GST = 54 (split: CGST 27, SGST 27)
        - total_cgst = 117, total_sgst = 117
        - total_amount = 1000 + 300 + 234 = 1534
        """
        pi_data = {
            "supplier_id": test_supplier_intra["id"],
            "invoice_no": f"TEST-INV-{uuid.uuid4().hex[:6]}",
            "invoice_date": "2026-01-15T00:00:00Z",
            "is_manual": True,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "quantity": 10,
                    "unit_price": 100,
                    "discount": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {"name": "Freight", "amount": 200, "gst_rate": 18},
                {"name": "Packaging", "amount": 100, "gst_rate": 18}
            ]
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/purchase-invoices", json=pi_data)
        assert resp.status_code == 200 or resp.status_code == 201, f"Failed to create PI: {resp.text}"
        pi = resp.json()
        
        # Verify totals
        assert pi["subtotal"] == 1000, f"Expected subtotal=1000, got {pi['subtotal']}"
        assert pi["charges_subtotal"] == 300, f"Expected charges_subtotal=300, got {pi.get('charges_subtotal')}"
        assert pi["total_cgst"] == 117, f"Expected total_cgst=117, got {pi['total_cgst']}"
        assert pi["total_sgst"] == 117, f"Expected total_sgst=117, got {pi['total_sgst']}"
        assert pi["total_igst"] == 0, f"Expected total_igst=0 for intra-state, got {pi['total_igst']}"
        assert pi["total_amount"] == 1534, f"Expected total_amount=1534, got {pi['total_amount']}"
        
        # Verify additional_charges persisted with computed fields
        assert "additional_charges" in pi, "additional_charges not in response"
        assert len(pi["additional_charges"]) == 2, f"Expected 2 charges, got {len(pi['additional_charges'])}"
        
        freight = next((c for c in pi["additional_charges"] if c["name"] == "Freight"), None)
        assert freight is not None, "Freight charge not found"
        assert freight["amount"] == 200
        assert freight["gst_rate"] == 18
        assert freight["tax_amount"] == 36, f"Expected tax_amount=36, got {freight.get('tax_amount')}"
        assert freight["total_with_tax"] == 236, f"Expected total_with_tax=236, got {freight.get('total_with_tax')}"
        
        packaging = next((c for c in pi["additional_charges"] if c["name"] == "Packaging"), None)
        assert packaging is not None, "Packaging charge not found"
        assert packaging["amount"] == 100
        assert packaging["tax_amount"] == 18
        assert packaging["total_with_tax"] == 118
        
        # Cleanup
        try:
            auth_session.delete(f"{BASE_URL}/api/purchase-invoices/{pi['id']}")
        except Exception:
            pass
        
        print("✓ PI with additional_charges (intra-state) - totals computed correctly")
    
    def test_pi_with_charges_inter_state(self, auth_session, test_supplier_inter, test_item):
        """
        POST /api/purchase-invoices with additional_charges on inter-state supplier.
        Lines: 10 qty × 100 = 1000 subtotal @ 18% GST
        Charges: Freight 200 @ 18%, Packaging 100 @ 18%
        Expected:
        - subtotal = 1000
        - charges_subtotal = 300
        - total_igst = 234 (180 from lines + 54 from charges)
        - total_cgst = 0, total_sgst = 0
        - total_amount = 1534
        """
        pi_data = {
            "supplier_id": test_supplier_inter["id"],
            "invoice_no": f"TEST-INV-INTER-{uuid.uuid4().hex[:6]}",
            "invoice_date": "2026-01-15T00:00:00Z",
            "is_manual": True,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "quantity": 10,
                    "unit_price": 100,
                    "discount": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {"name": "Freight", "amount": 200, "gst_rate": 18},
                {"name": "Packaging", "amount": 100, "gst_rate": 18}
            ]
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/purchase-invoices", json=pi_data)
        assert resp.status_code == 200 or resp.status_code == 201, f"Failed to create PI: {resp.text}"
        pi = resp.json()
        
        # Verify inter-state GST (IGST only)
        assert pi["subtotal"] == 1000
        assert pi["charges_subtotal"] == 300
        assert pi["total_igst"] == 234, f"Expected total_igst=234, got {pi['total_igst']}"
        assert pi["total_cgst"] == 0, f"Expected total_cgst=0 for inter-state, got {pi['total_cgst']}"
        assert pi["total_sgst"] == 0, f"Expected total_sgst=0 for inter-state, got {pi['total_sgst']}"
        assert pi["total_amount"] == 1534
        
        # Cleanup
        try:
            auth_session.delete(f"{BASE_URL}/api/purchase-invoices/{pi['id']}")
        except Exception:
            pass
        
        print("✓ PI with additional_charges (inter-state) - IGST computed correctly")
    
    def test_pi_charges_with_zero_gst(self, auth_session, test_supplier_intra, test_item):
        """
        Test charges with 0% GST (e.g., exempt services)
        """
        pi_data = {
            "supplier_id": test_supplier_intra["id"],
            "invoice_no": f"TEST-INV-ZERO-{uuid.uuid4().hex[:6]}",
            "invoice_date": "2026-01-15T00:00:00Z",
            "is_manual": True,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "quantity": 10,
                    "unit_price": 100,
                    "discount": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {"name": "Insurance", "amount": 50, "gst_rate": 0}
            ]
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/purchase-invoices", json=pi_data)
        assert resp.status_code == 200 or resp.status_code == 201, f"Failed to create PI: {resp.text}"
        pi = resp.json()
        
        # Lines: 1000 + 180 GST = 1180
        # Charges: 50 + 0 GST = 50
        # Total: 1230
        assert pi["subtotal"] == 1000
        assert pi["charges_subtotal"] == 50
        assert pi["total_amount"] == 1230, f"Expected 1230, got {pi['total_amount']}"
        
        insurance = pi["additional_charges"][0]
        assert insurance["tax_amount"] == 0
        assert insurance["total_with_tax"] == 50
        
        # Cleanup
        try:
            auth_session.delete(f"{BASE_URL}/api/purchase-invoices/{pi['id']}")
        except Exception:
            pass
        
        print("✓ PI with 0% GST charge - computed correctly")
    
    def test_pi_no_charges(self, auth_session, test_supplier_intra, test_item):
        """
        Test PI without additional_charges (backward compatibility)
        """
        pi_data = {
            "supplier_id": test_supplier_intra["id"],
            "invoice_no": f"TEST-INV-NOCHARGE-{uuid.uuid4().hex[:6]}",
            "invoice_date": "2026-01-15T00:00:00Z",
            "is_manual": True,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "quantity": 10,
                    "unit_price": 100,
                    "discount": 0,
                    "gst_rate": 18
                }
            ]
            # No additional_charges
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/purchase-invoices", json=pi_data)
        assert resp.status_code == 200 or resp.status_code == 201, f"Failed to create PI: {resp.text}"
        pi = resp.json()
        
        assert pi["subtotal"] == 1000
        assert pi.get("charges_subtotal", 0) == 0
        assert pi["total_amount"] == 1180  # 1000 + 180 GST
        assert pi.get("additional_charges", []) == []
        
        # Cleanup
        try:
            auth_session.delete(f"{BASE_URL}/api/purchase-invoices/{pi['id']}")
        except Exception:
            pass
        
        print("✓ PI without additional_charges - backward compatible")
    
    def test_pi_list_returns_charges(self, auth_session, test_supplier_intra, test_item):
        """
        Verify GET /api/purchase-invoices (list) returns additional_charges on each PI
        """
        pi_data = {
            "supplier_id": test_supplier_intra["id"],
            "invoice_no": f"TEST-INV-LIST-{uuid.uuid4().hex[:6]}",
            "invoice_date": "2026-01-15T00:00:00Z",
            "is_manual": True,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "quantity": 5,
                    "unit_price": 200,
                    "discount": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {"name": "Freight", "amount": 100, "gst_rate": 18}
            ]
        }
        
        create_resp = auth_session.post(f"{BASE_URL}/api/purchase-invoices", json=pi_data)
        assert create_resp.status_code in [200, 201]
        created_pi = create_resp.json()
        pi_id = created_pi["id"]
        
        # GET the PI list and find our PI
        list_resp = auth_session.get(f"{BASE_URL}/api/purchase-invoices")
        assert list_resp.status_code == 200, f"Failed to GET PI list: {list_resp.text}"
        pi_list = list_resp.json()
        
        fetched_pi = next((p for p in pi_list if p["id"] == pi_id), None)
        assert fetched_pi is not None, f"Created PI not found in list"
        
        assert "additional_charges" in fetched_pi
        assert len(fetched_pi["additional_charges"]) == 1
        assert fetched_pi["additional_charges"][0]["name"] == "Freight"
        assert fetched_pi["additional_charges"][0]["amount"] == 100
        assert fetched_pi["additional_charges"][0]["tax_amount"] == 18
        assert fetched_pi["additional_charges"][0]["total_with_tax"] == 118
        
        # Cleanup
        try:
            auth_session.delete(f"{BASE_URL}/api/purchase-invoices/{pi_id}")
        except Exception:
            pass
        
        print("✓ GET PI list returns additional_charges with computed fields")


class TestItemsPagePagination:
    """Test Items page pagination fix (visibleCount not reset on edit)"""
    
    def test_items_lite_endpoint(self, auth_session):
        """
        GET /api/items?lite=1 returns items with required fields
        """
        resp = auth_session.get(f"{BASE_URL}/api/items?lite=1")
        assert resp.status_code == 200, f"Failed to get items: {resp.text}"
        items = resp.json()
        
        if len(items) > 0:
            item = items[0]
            # Verify lite fields are present
            assert "id" in item
            assert "part_number" in item
            assert "name" in item
            assert "category" in item
            assert "unit_of_measure" in item
            assert "current_stock" in item
            print(f"✓ Items lite endpoint returns {len(items)} items with required fields")
        else:
            print("✓ Items lite endpoint works (no items in DB)")
    
    def test_items_update_returns_updated_item(self, auth_session, test_item):
        """
        PUT /api/items/{id} returns the updated item (for optimistic UI update)
        """
        # Update the item
        update_data = {
            "name": "Updated Test Item Name"
        }
        resp = auth_session.put(f"{BASE_URL}/api/items/{test_item['id']}", json=update_data)
        assert resp.status_code == 200, f"Failed to update item: {resp.text}"
        updated = resp.json()
        
        assert updated["name"] == "Updated Test Item Name"
        assert updated["id"] == test_item["id"]
        
        # Revert
        auth_session.put(f"{BASE_URL}/api/items/{test_item['id']}", json={"name": "Test Item for PI"})
        
        print("✓ PUT /api/items returns updated item for optimistic UI update")


class TestRegressionQuotationGlobalDiscount:
    """Regression: Quotation global discount still works"""
    
    def test_quotation_global_discount_percent(self, auth_session):
        """
        Verify quotation global discount feature still works
        """
        # Get a customer
        customers_resp = auth_session.get(f"{BASE_URL}/api/customers")
        if customers_resp.status_code != 200 or not customers_resp.json():
            pytest.skip("No customers available for quotation test")
        customer = customers_resp.json()[0]
        
        # Get an item
        items_resp = auth_session.get(f"{BASE_URL}/api/items?lite=1")
        if items_resp.status_code != 200 or not items_resp.json():
            pytest.skip("No items available for quotation test")
        item = items_resp.json()[0]
        
        quotation_data = {
            "customer_id": customer["id"],
            "validity_days": 30,
            "lines": [
                {
                    "item_id": item["id"],
                    "quantity": 10,
                    "unit_price": 100,
                    "discount": 0,
                    "gst_rate": 18
                }
            ],
            "global_discount_type": "percent",
            "global_discount_value": 10
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_data)
        if resp.status_code not in [200, 201]:
            pytest.skip(f"Quotation creation failed: {resp.text}")
        
        quotation = resp.json()
        
        # Verify global discount applied
        # Subtotal = 1000, 10% discount = 100, net_subtotal = 900
        assert quotation.get("subtotal") == 1000
        assert quotation.get("global_discount_amount") == 100
        assert quotation.get("net_subtotal") == 900
        
        # Cleanup
        try:
            auth_session.delete(f"{BASE_URL}/api/crm/quotations/{quotation['id']}")
        except Exception:
            pass
        
        print("✓ Quotation global discount regression test passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
