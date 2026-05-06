"""
Iteration 89 - Quotation Global Discount & Items Page Scroll Preservation Tests

Tests for:
1. POST /api/crm/quotations with global_discount_type='percent' & value=10 on lines totaling ₹1000 (18% GST)
2. POST /api/crm/quotations with global_discount_type='amount' & value=50 on lines totaling ₹950
3. Global discount value larger than subtotal is clamped (grand_total never goes negative)
4. PUT /api/crm/quotations/{id} updating only global_discount_type/value recomputes totals & GST split
5. Currency=USD with global_discount=10% — GST stays 0 (export); grand_total = net_subtotal
6. GET /api/items?lite=1 includes lead_time_days field
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Authenticate and return session with cookies."""
    session = requests.Session()
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return session


@pytest.fixture(scope="module")
def test_customer(auth_session):
    """Create a test customer for quotations."""
    customer_data = {
        "name": f"TEST_Customer_{uuid.uuid4().hex[:8]}",
        "gstin": "27AAACM1234E1Z5",  # Maharashtra state code 27
        "state_code": "27",
        "email": "test@example.com",
        "phone": "9876543210"
    }
    resp = auth_session.post(f"{BASE_URL}/api/customers", json=customer_data)
    assert resp.status_code == 201, f"Failed to create customer: {resp.text}"
    return resp.json()


@pytest.fixture(scope="module")
def test_item(auth_session):
    """Create a test item for quotation lines."""
    item_data = {
        "part_number": f"TEST-ITEM-{uuid.uuid4().hex[:8]}",
        "name": "Test Item for Quotation",
        "category": "finished_good",
        "unit_of_measure": "pcs",
        "unit_cost": 100,
        "sale_price": 100,
        "hsn_code": "8483",
        "gst_rate": 18,
        "lead_time_days": 7
    }
    resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
    assert resp.status_code == 201, f"Failed to create item: {resp.text}"
    return resp.json()


class TestQuotationGlobalDiscountPercent:
    """Test global discount as percentage."""
    
    def test_global_discount_percent_10_on_1000_subtotal(self, auth_session, test_customer, test_item):
        """
        POST /api/crm/quotations with global_discount_type='percent' & value=10 
        on lines totaling ₹1000 (18% GST) returns:
        - subtotal=1000
        - global_discount_amount=100
        - net_subtotal=900
        - total_gst=162 (18% of 900)
        - grand_total=1062
        """
        quotation_data = {
            "customer_id": test_customer["id"],
            "customer_name": test_customer["name"],
            "currency": "INR",
            "global_discount_type": "percent",
            "global_discount_value": 10,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "description": "Test item",
                    "quantity": 10,
                    "rate": 100,  # 10 * 100 = 1000
                    "uom": "pcs",
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ]
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_data)
        assert resp.status_code == 201, f"Failed to create quotation: {resp.text}"
        
        data = resp.json()
        
        # Verify totals
        assert data["subtotal"] == 1000, f"Expected subtotal=1000, got {data['subtotal']}"
        assert data["global_discount_amount"] == 100, f"Expected global_discount_amount=100, got {data['global_discount_amount']}"
        assert data["net_subtotal"] == 900, f"Expected net_subtotal=900, got {data['net_subtotal']}"
        assert data["total_gst"] == 162, f"Expected total_gst=162, got {data['total_gst']}"
        assert data["grand_total"] == 1062, f"Expected grand_total=1062, got {data['grand_total']}"
        
        # Verify GST split (CGST + SGST for intra-state)
        gst_sum = data.get("cgst", 0) + data.get("sgst", 0) + data.get("igst", 0)
        assert gst_sum == 162, f"Expected CGST+SGST+IGST=162, got {gst_sum}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{data['id']}")


class TestQuotationGlobalDiscountAmount:
    """Test global discount as absolute amount."""
    
    def test_global_discount_amount_50_on_950_subtotal(self, auth_session, test_customer, test_item):
        """
        POST /api/crm/quotations with global_discount_type='amount' & value=50 
        on lines totaling ₹950 (after line discount):
        - global_discount_amount=50
        - net_subtotal=900
        - total_gst=162 (18% of 900)
        - grand_total=1062
        """
        quotation_data = {
            "customer_id": test_customer["id"],
            "customer_name": test_customer["name"],
            "currency": "INR",
            "global_discount_type": "amount",
            "global_discount_value": 50,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "description": "Test item",
                    "quantity": 10,
                    "rate": 100,  # 10 * 100 = 1000
                    "uom": "pcs",
                    "discount_pct": 5,  # 5% line discount = 50, so net = 950
                    "gst_rate": 18
                }
            ]
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_data)
        assert resp.status_code == 201, f"Failed to create quotation: {resp.text}"
        
        data = resp.json()
        
        # Subtotal after line discount = 1000 - 50 = 950
        assert data["subtotal"] == 950, f"Expected subtotal=950, got {data['subtotal']}"
        assert data["global_discount_amount"] == 50, f"Expected global_discount_amount=50, got {data['global_discount_amount']}"
        assert data["net_subtotal"] == 900, f"Expected net_subtotal=900, got {data['net_subtotal']}"
        assert data["total_gst"] == 162, f"Expected total_gst=162, got {data['total_gst']}"
        assert data["grand_total"] == 1062, f"Expected grand_total=1062, got {data['grand_total']}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{data['id']}")


class TestQuotationGlobalDiscountClamping:
    """Test that global discount is clamped to prevent negative totals."""
    
    def test_global_discount_larger_than_subtotal_is_clamped(self, auth_session, test_customer, test_item):
        """
        Global discount value larger than subtotal is clamped.
        grand_total never goes negative.
        """
        quotation_data = {
            "customer_id": test_customer["id"],
            "customer_name": test_customer["name"],
            "currency": "INR",
            "global_discount_type": "amount",
            "global_discount_value": 5000,  # Much larger than subtotal
            "lines": [
                {
                    "item_id": test_item["id"],
                    "description": "Test item",
                    "quantity": 10,
                    "rate": 100,  # 10 * 100 = 1000
                    "uom": "pcs",
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ]
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_data)
        assert resp.status_code == 201, f"Failed to create quotation: {resp.text}"
        
        data = resp.json()
        
        # Global discount should be clamped to subtotal (1000)
        assert data["subtotal"] == 1000, f"Expected subtotal=1000, got {data['subtotal']}"
        assert data["global_discount_amount"] == 1000, f"Expected global_discount_amount=1000 (clamped), got {data['global_discount_amount']}"
        assert data["net_subtotal"] == 0, f"Expected net_subtotal=0, got {data['net_subtotal']}"
        assert data["total_gst"] == 0, f"Expected total_gst=0, got {data['total_gst']}"
        assert data["grand_total"] == 0, f"Expected grand_total=0, got {data['grand_total']}"
        assert data["grand_total"] >= 0, "grand_total should never be negative"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{data['id']}")


class TestQuotationUpdateGlobalDiscount:
    """Test updating quotation with only global discount changes."""
    
    def test_put_quotation_update_global_discount_only(self, auth_session, test_customer, test_item):
        """
        PUT /api/crm/quotations/{id} updating only global_discount_type/value 
        (without lines) recomputes totals & GST split correctly.
        """
        # First create a quotation without global discount
        quotation_data = {
            "customer_id": test_customer["id"],
            "customer_name": test_customer["name"],
            "currency": "INR",
            "global_discount_type": "amount",
            "global_discount_value": 0,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "description": "Test item",
                    "quantity": 10,
                    "rate": 100,  # 10 * 100 = 1000
                    "uom": "pcs",
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ]
        }
        
        create_resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_data)
        assert create_resp.status_code == 201, f"Failed to create quotation: {create_resp.text}"
        created = create_resp.json()
        
        # Verify initial totals (no global discount)
        assert created["subtotal"] == 1000
        assert created["global_discount_amount"] == 0
        assert created["net_subtotal"] == 1000
        assert created["total_gst"] == 180  # 18% of 1000
        assert created["grand_total"] == 1180
        
        # Now update ONLY the global discount (no lines in payload)
        update_data = {
            "global_discount_type": "percent",
            "global_discount_value": 10
        }
        
        update_resp = auth_session.put(f"{BASE_URL}/api/crm/quotations/{created['id']}", json=update_data)
        assert update_resp.status_code == 200, f"Failed to update quotation: {update_resp.text}"
        updated = update_resp.json()
        
        # Verify updated totals
        assert updated["subtotal"] == 1000, f"Expected subtotal=1000, got {updated['subtotal']}"
        assert updated["global_discount_amount"] == 100, f"Expected global_discount_amount=100, got {updated['global_discount_amount']}"
        assert updated["net_subtotal"] == 900, f"Expected net_subtotal=900, got {updated['net_subtotal']}"
        assert updated["total_gst"] == 162, f"Expected total_gst=162, got {updated['total_gst']}"
        assert updated["grand_total"] == 1062, f"Expected grand_total=1062, got {updated['grand_total']}"
        
        # Verify GST split was also updated
        gst_sum = updated.get("cgst", 0) + updated.get("sgst", 0) + updated.get("igst", 0)
        assert gst_sum == 162, f"Expected CGST+SGST+IGST=162, got {gst_sum}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{created['id']}")


class TestQuotationExportCurrency:
    """Test quotation with non-INR currency (export)."""
    
    def test_usd_currency_with_global_discount_no_gst(self, auth_session, test_customer, test_item):
        """
        Currency=USD with global_discount=10% — GST stays 0 (export).
        grand_total = net_subtotal (no GST added).
        """
        quotation_data = {
            "customer_id": test_customer["id"],
            "customer_name": test_customer["name"],
            "currency": "USD",  # Export currency
            "global_discount_type": "percent",
            "global_discount_value": 10,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "description": "Test item",
                    "quantity": 10,
                    "rate": 100,  # 10 * 100 = 1000
                    "uom": "pcs",
                    "discount_pct": 0,
                    "gst_rate": 18  # GST rate specified but should be ignored for export
                }
            ]
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_data)
        assert resp.status_code == 201, f"Failed to create quotation: {resp.text}"
        
        data = resp.json()
        
        # Verify totals - GST should be 0 for export
        assert data["subtotal"] == 1000, f"Expected subtotal=1000, got {data['subtotal']}"
        assert data["global_discount_amount"] == 100, f"Expected global_discount_amount=100, got {data['global_discount_amount']}"
        assert data["net_subtotal"] == 900, f"Expected net_subtotal=900, got {data['net_subtotal']}"
        assert data["total_gst"] == 0, f"Expected total_gst=0 for export, got {data['total_gst']}"
        assert data["grand_total"] == 900, f"Expected grand_total=900 (net_subtotal, no GST), got {data['grand_total']}"
        
        # Verify GST split is all zeros
        assert data.get("cgst", 0) == 0, f"Expected cgst=0 for export, got {data.get('cgst')}"
        assert data.get("sgst", 0) == 0, f"Expected sgst=0 for export, got {data.get('sgst')}"
        assert data.get("igst", 0) == 0, f"Expected igst=0 for export, got {data.get('igst')}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{data['id']}")


class TestItemsLiteEndpoint:
    """Test GET /api/items?lite=1 includes lead_time_days."""
    
    def test_items_lite_includes_lead_time_days(self, auth_session, test_item):
        """
        GET /api/items?lite=1 includes lead_time_days field.
        Other heavy fields stripped.
        """
        resp = auth_session.get(f"{BASE_URL}/api/items?lite=1")
        assert resp.status_code == 200, f"Failed to get items: {resp.text}"
        
        items = resp.json()
        assert len(items) > 0, "Expected at least one item"
        
        # Find our test item
        test_item_found = None
        for item in items:
            if item.get("id") == test_item["id"]:
                test_item_found = item
                break
        
        assert test_item_found is not None, f"Test item {test_item['id']} not found in lite response"
        
        # Verify lead_time_days is included
        assert "lead_time_days" in test_item_found, "lead_time_days should be included in lite response"
        assert test_item_found["lead_time_days"] == 7, f"Expected lead_time_days=7, got {test_item_found['lead_time_days']}"
        
        # Verify other essential fields are present
        essential_fields = ["id", "part_number", "name", "category", "unit_of_measure", 
                          "hsn_code", "gst_rate", "sale_price", "unit_cost", "current_stock"]
        for field in essential_fields:
            assert field in test_item_found, f"Field '{field}' should be in lite response"


class TestQuotationPersistence:
    """Test that global discount values are persisted and retrieved correctly."""
    
    def test_quotation_save_and_retrieve_global_discount(self, auth_session, test_customer, test_item):
        """
        Quotation form save persists global_discount_type & global_discount_value.
        Reopening the quotation pre-fills the same values.
        """
        quotation_data = {
            "customer_id": test_customer["id"],
            "customer_name": test_customer["name"],
            "currency": "INR",
            "global_discount_type": "percent",
            "global_discount_value": 15,
            "lines": [
                {
                    "item_id": test_item["id"],
                    "description": "Test item",
                    "quantity": 10,
                    "rate": 100,
                    "uom": "pcs",
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ]
        }
        
        # Create quotation
        create_resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_data)
        assert create_resp.status_code == 201, f"Failed to create quotation: {create_resp.text}"
        created = create_resp.json()
        
        # Retrieve quotation from list endpoint
        get_resp = auth_session.get(f"{BASE_URL}/api/crm/quotations")
        assert get_resp.status_code == 200, f"Failed to get quotations: {get_resp.text}"
        quotations = get_resp.json()
        
        # Find our quotation
        retrieved = None
        for q in quotations:
            if q.get("id") == created["id"]:
                retrieved = q
                break
        
        assert retrieved is not None, f"Quotation {created['id']} not found in list"
        
        # Verify global discount values are persisted
        assert retrieved["global_discount_type"] == "percent", f"Expected global_discount_type='percent', got {retrieved.get('global_discount_type')}"
        assert retrieved["global_discount_value"] == 15, f"Expected global_discount_value=15, got {retrieved.get('global_discount_value')}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{created['id']}")


class TestLineAndGlobalDiscountCoexistence:
    """Regression test: line-level discount + global discount can coexist."""
    
    def test_line_discount_plus_global_discount(self, auth_session, test_customer, test_item):
        """
        Line-level discount + global discount can coexist.
        Line discount applied first, then global discount.
        """
        quotation_data = {
            "customer_id": test_customer["id"],
            "customer_name": test_customer["name"],
            "currency": "INR",
            "global_discount_type": "percent",
            "global_discount_value": 10,  # 10% global discount
            "lines": [
                {
                    "item_id": test_item["id"],
                    "description": "Test item",
                    "quantity": 10,
                    "rate": 100,  # 10 * 100 = 1000 gross
                    "uom": "pcs",
                    "discount_pct": 10,  # 10% line discount = 100, so line net = 900
                    "gst_rate": 18
                }
            ]
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_data)
        assert resp.status_code == 201, f"Failed to create quotation: {resp.text}"
        
        data = resp.json()
        
        # Line discount: 1000 * 10% = 100, so subtotal = 900
        # Global discount: 900 * 10% = 90, so net_subtotal = 810
        # GST: 810 * 18% = 145.8
        # Grand total: 810 + 145.8 = 955.8
        
        assert data["subtotal"] == 900, f"Expected subtotal=900 (after line discount), got {data['subtotal']}"
        assert data["total_discount"] == 100, f"Expected total_discount=100, got {data['total_discount']}"
        assert data["global_discount_amount"] == 90, f"Expected global_discount_amount=90, got {data['global_discount_amount']}"
        assert data["net_subtotal"] == 810, f"Expected net_subtotal=810, got {data['net_subtotal']}"
        assert data["total_gst"] == 145.8, f"Expected total_gst=145.8, got {data['total_gst']}"
        assert data["grand_total"] == 955.8, f"Expected grand_total=955.8, got {data['grand_total']}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{data['id']}")


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup(auth_session, test_customer, test_item):
    """Cleanup test data after all tests."""
    yield
    # Cleanup customer
    try:
        auth_session.delete(f"{BASE_URL}/api/customers/{test_customer['id']}")
    except:
        pass
    # Cleanup item
    try:
        auth_session.delete(f"{BASE_URL}/api/items/{test_item['id']}")
    except:
        pass
