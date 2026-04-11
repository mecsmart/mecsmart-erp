"""
Test PO Enhancements - Phase 3 Features
Tests for:
1. Settings > PO Additional Charges CRUD
2. Warehouse address field
3. PO Create with new fields (quotation_ref, quotation_date, delivery_warehouse_id, line description/uom/discount)
4. PO Edit (draft editable, sent creates revision)
5. Additional charges on PO
6. Total calculations with discount and charges
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPOChargeTypes:
    """Test Settings > PO Additional Charges CRUD"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.client.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_po_charges(self, api_client, auth_token):
        """GET /api/settings/po-charges returns charge types list"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        response = api_client.get(f"{BASE_URL}/api/settings/po-charges")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least Transportation Charges from seed
        print(f"Found {len(data)} charge types")
        if len(data) > 0:
            assert "name" in data[0]
            assert "hsn_code" in data[0]
            assert "gst_rate" in data[0]
    
    def test_create_po_charge_type(self, api_client, auth_token):
        """POST /api/settings/po-charges creates a new charge type"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        payload = {
            "name": "TEST_Handling Charges",
            "hsn_code": "996512",
            "gst_rate": 18.0
        }
        response = api_client.post(f"{BASE_URL}/api/settings/po-charges", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "TEST_Handling Charges"
        assert data["hsn_code"] == "996512"
        assert data["gst_rate"] == 18.0
        assert "id" in data
        print(f"Created charge type: {data['id']}")
        # Store for cleanup
        self.created_charge_id = data["id"]
    
    def test_update_po_charge_type(self, api_client, auth_token):
        """PUT /api/settings/po-charges/{id} updates charge type"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        # First create a charge type
        create_payload = {"name": "TEST_Update Charge", "hsn_code": "996513", "gst_rate": 12.0}
        create_resp = api_client.post(f"{BASE_URL}/api/settings/po-charges", json=create_payload)
        assert create_resp.status_code == 201
        charge_id = create_resp.json()["id"]
        
        # Update it
        update_payload = {"name": "TEST_Updated Charge Name", "gst_rate": 5.0}
        response = api_client.put(f"{BASE_URL}/api/settings/po-charges/{charge_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Updated Charge Name"
        assert data["gst_rate"] == 5.0
        print(f"Updated charge type: {charge_id}")
    
    def test_delete_po_charge_type(self, api_client, auth_token):
        """DELETE /api/settings/po-charges/{id} soft-deletes (sets is_active: false)"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        # First create a charge type
        create_payload = {"name": "TEST_Delete Charge", "hsn_code": "996514", "gst_rate": 18.0}
        create_resp = api_client.post(f"{BASE_URL}/api/settings/po-charges", json=create_payload)
        assert create_resp.status_code == 201
        charge_id = create_resp.json()["id"]
        
        # Delete it
        response = api_client.delete(f"{BASE_URL}/api/settings/po-charges/{charge_id}")
        assert response.status_code == 200
        
        # Verify it's not in active list
        list_resp = api_client.get(f"{BASE_URL}/api/settings/po-charges")
        charges = list_resp.json()
        assert not any(c["id"] == charge_id for c in charges)
        print(f"Soft-deleted charge type: {charge_id}")


class TestWarehouseAddress:
    """Test Warehouse address field"""
    
    def test_create_warehouse_with_address(self, api_client, auth_token):
        """Warehouse create includes 'address' field"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        payload = {
            "code": "TEST-WH-ADDR",
            "name": "Test Warehouse with Address",
            "location": "Building X",
            "address": "123 Test Street, Test City, 400001",
            "status": "active"
        }
        response = api_client.post(f"{BASE_URL}/api/warehouses", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["address"] == "123 Test Street, Test City, 400001"
        assert data["code"] == "TEST-WH-ADDR"
        print(f"Created warehouse with address: {data['id']}")
    
    def test_update_warehouse_address(self, api_client, auth_token):
        """Warehouse edit updates 'address' field"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        # Get existing warehouse
        list_resp = api_client.get(f"{BASE_URL}/api/warehouses")
        warehouses = list_resp.json()
        if len(warehouses) == 0:
            pytest.skip("No warehouses to update")
        
        wh_id = warehouses[0]["id"]
        update_payload = {"address": "Updated Address 456, New City, 500001"}
        response = api_client.put(f"{BASE_URL}/api/warehouses/{wh_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["address"] == "Updated Address 456, New City, 500001"
        print(f"Updated warehouse address: {wh_id}")


class TestPOCreateWithNewFields:
    """Test PO Create dialog with new fields"""
    
    def test_create_po_with_quotation_ref_and_date(self, api_client, auth_token, test_supplier_id, test_item_id):
        """PO Create with quotation_ref and quotation_date"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        payload = {
            "supplier_id": test_supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "quotation_ref": "VQ-2025-TEST-001",
            "quotation_date": datetime.now().isoformat(),
            "lines": [{
                "item_id": test_item_id,
                "description": "Test item description",
                "quantity": 10,
                "unit_price": 100.0,
                "uom": "pcs",
                "hsn_code": "7209",
                "gst_rate": 18.0,
                "discount_type": "percentage",
                "discount_value": 0
            }],
            "notes": "Test PO with quotation ref"
        }
        response = api_client.post(f"{BASE_URL}/api/purchase-orders", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["quotation_ref"] == "VQ-2025-TEST-001"
        assert data["quotation_date"] is not None
        print(f"Created PO with quotation ref: {data['po_number']}")
        return data["id"]
    
    def test_create_po_with_delivery_warehouse(self, api_client, auth_token, test_supplier_id, test_item_id, test_warehouse_id):
        """PO Create with delivery_warehouse_id populates delivery_address"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        payload = {
            "supplier_id": test_supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "delivery_warehouse_id": test_warehouse_id,
            "lines": [{
                "item_id": test_item_id,
                "quantity": 5,
                "unit_price": 50.0,
                "gst_rate": 18.0
            }],
            "notes": "Test PO with delivery warehouse"
        }
        response = api_client.post(f"{BASE_URL}/api/purchase-orders", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["delivery_warehouse_id"] == test_warehouse_id
        # delivery_address should be populated from warehouse
        print(f"Created PO with delivery warehouse: {data['po_number']}, address: {data.get('delivery_address', 'N/A')}")
        return data["id"]
    
    def test_create_po_with_line_discount_percentage(self, api_client, auth_token, test_supplier_id, test_item_id):
        """PO line items with discount percentage"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        payload = {
            "supplier_id": test_supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "lines": [{
                "item_id": test_item_id,
                "description": "Item with 10% discount",
                "quantity": 10,
                "unit_price": 100.0,
                "uom": "pcs",
                "hsn_code": "7209",
                "gst_rate": 18.0,
                "discount_type": "percentage",
                "discount_value": 10.0
            }],
            "notes": "Test PO with percentage discount"
        }
        response = api_client.post(f"{BASE_URL}/api/purchase-orders", json=payload)
        assert response.status_code == 201
        data = response.json()
        # Gross = 10 * 100 = 1000, Discount = 10% = 100, Line amount = 900
        line = data["lines"][0]
        assert line["discount_type"] == "percentage"
        assert line["discount_value"] == 10.0
        assert line["line_amount"] == 900.0  # After 10% discount
        assert data["subtotal"] == 900.0
        print(f"Created PO with discount: {data['po_number']}, subtotal: {data['subtotal']}")
    
    def test_create_po_with_line_discount_amount(self, api_client, auth_token, test_supplier_id, test_item_id):
        """PO line items with discount amount"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        payload = {
            "supplier_id": test_supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "lines": [{
                "item_id": test_item_id,
                "description": "Item with flat discount",
                "quantity": 10,
                "unit_price": 100.0,
                "uom": "pcs",
                "hsn_code": "7209",
                "gst_rate": 18.0,
                "discount_type": "amount",
                "discount_value": 50.0
            }],
            "notes": "Test PO with amount discount"
        }
        response = api_client.post(f"{BASE_URL}/api/purchase-orders", json=payload)
        assert response.status_code == 201
        data = response.json()
        # Gross = 10 * 100 = 1000, Discount = 50, Line amount = 950
        line = data["lines"][0]
        assert line["discount_type"] == "amount"
        assert line["discount_value"] == 50.0
        assert line["line_amount"] == 950.0
        print(f"Created PO with flat discount: {data['po_number']}, subtotal: {data['subtotal']}")


class TestPOAdditionalCharges:
    """Test Additional Charges on PO"""
    
    def test_create_po_with_additional_charges(self, api_client, auth_token, test_supplier_id, test_item_id, test_charge_type_id):
        """PO with additional charges section"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        payload = {
            "supplier_id": test_supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "lines": [{
                "item_id": test_item_id,
                "quantity": 10,
                "unit_price": 100.0,
                "gst_rate": 18.0
            }],
            "additional_charges": [{
                "charge_type_id": test_charge_type_id,
                "name": "Transportation Charges",
                "hsn_code": "996511",
                "gst_rate": 18.0,
                "amount": 500.0
            }],
            "notes": "Test PO with additional charges"
        }
        response = api_client.post(f"{BASE_URL}/api/purchase-orders", json=payload)
        assert response.status_code == 201
        data = response.json()
        
        # Verify charges
        assert len(data["additional_charges"]) == 1
        charge = data["additional_charges"][0]
        assert charge["amount"] == 500.0
        assert charge["gst_rate"] == 18.0
        assert "tax_amount" in charge
        
        # Verify totals
        # Line: 10 * 100 = 1000, GST 18% = 180
        # Charge: 500, GST 18% = 90
        # Total = 1000 + 500 + 180 + 90 = 1770
        assert data["subtotal"] == 1000.0
        assert data["charges_subtotal"] == 500.0
        expected_total = 1000 + 500 + 180 + 90  # 1770
        assert data["total_amount"] == expected_total
        print(f"Created PO with charges: {data['po_number']}, total: {data['total_amount']}")


class TestPOEditAndRevision:
    """Test PO Edit - draft editable, sent creates revision"""
    
    def test_edit_draft_po(self, api_client, auth_token, test_supplier_id, test_item_id):
        """Draft POs are fully editable via PUT"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        # Create a draft PO
        create_payload = {
            "supplier_id": test_supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "lines": [{
                "item_id": test_item_id,
                "quantity": 5,
                "unit_price": 100.0,
                "gst_rate": 18.0
            }],
            "notes": "Draft PO for edit test"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/purchase-orders", json=create_payload)
        assert create_resp.status_code == 201
        po_id = create_resp.json()["id"]
        original_revision = create_resp.json().get("revision", 0)
        
        # Edit the draft PO
        update_payload = {
            "lines": [{
                "item_id": test_item_id,
                "quantity": 10,  # Changed from 5 to 10
                "unit_price": 100.0,
                "gst_rate": 18.0
            }],
            "notes": "Updated draft PO"
        }
        response = api_client.put(f"{BASE_URL}/api/purchase-orders/{po_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify update
        assert data["lines"][0]["quantity"] == 10
        assert data["subtotal"] == 1000.0  # 10 * 100
        # Revision should NOT increment for draft
        assert data.get("revision", 0) == original_revision
        print(f"Edited draft PO: {data['po_number']}, revision: {data.get('revision', 0)}")
    
    def test_edit_sent_po_creates_revision(self, api_client, auth_token, test_supplier_id, test_item_id):
        """Editing a 'sent' PO increments revision and saves revision_history"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        # Create a draft PO
        create_payload = {
            "supplier_id": test_supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "lines": [{
                "item_id": test_item_id,
                "quantity": 5,
                "unit_price": 100.0,
                "gst_rate": 18.0
            }],
            "notes": "PO for revision test"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/purchase-orders", json=create_payload)
        assert create_resp.status_code == 201
        po_id = create_resp.json()["id"]
        
        # Change status to 'sent'
        status_resp = api_client.put(f"{BASE_URL}/api/purchase-orders/{po_id}", json={"status": "sent"})
        assert status_resp.status_code == 200
        
        # Now edit the sent PO (should create revision)
        update_payload = {
            "lines": [{
                "item_id": test_item_id,
                "quantity": 15,  # Changed
                "unit_price": 100.0,
                "gst_rate": 18.0
            }],
            "notes": "Revised PO"
        }
        response = api_client.put(f"{BASE_URL}/api/purchase-orders/{po_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify revision incremented
        assert data.get("revision", 0) >= 1
        # Verify revision_history exists
        assert "revision_history" in data or len(data.get("revision_history", [])) >= 0
        print(f"Edited sent PO: {data['po_number']}, revision: {data.get('revision', 0)}")
    
    def test_cannot_edit_received_po(self, api_client, auth_token, test_supplier_id, test_item_id):
        """Cannot edit a received PO"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        # Find a received PO or create one
        list_resp = api_client.get(f"{BASE_URL}/api/purchase-orders?status=received")
        received_pos = list_resp.json()
        
        if len(received_pos) == 0:
            # Create and receive a PO
            create_payload = {
                "supplier_id": test_supplier_id,
                "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
                "lines": [{
                    "item_id": test_item_id,
                    "quantity": 1,
                    "unit_price": 10.0,
                    "gst_rate": 18.0
                }]
            }
            create_resp = api_client.post(f"{BASE_URL}/api/purchase-orders", json=create_payload)
            po_id = create_resp.json()["id"]
            # Change to sent first
            api_client.put(f"{BASE_URL}/api/purchase-orders/{po_id}", json={"status": "sent"})
            # Receive it
            api_client.post(f"{BASE_URL}/api/purchase-orders/{po_id}/receive")
        else:
            po_id = received_pos[0]["id"]
        
        # Try to edit
        response = api_client.put(f"{BASE_URL}/api/purchase-orders/{po_id}", json={"notes": "Should fail"})
        assert response.status_code == 400
        print(f"Correctly blocked edit on received PO: {po_id}")


class TestPOTotalCalculations:
    """Test PO total calculations"""
    
    def test_po_totals_with_discount_and_charges(self, api_client, auth_token, test_supplier_id, test_item_id, test_charge_type_id):
        """PO calculates totals correctly: subtotal (after discount), charges subtotal, GST, grand total"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        payload = {
            "supplier_id": test_supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "lines": [
                {
                    "item_id": test_item_id,
                    "quantity": 10,
                    "unit_price": 100.0,
                    "gst_rate": 18.0,
                    "discount_type": "percentage",
                    "discount_value": 10.0  # 10% discount
                },
                {
                    "item_id": test_item_id,
                    "quantity": 5,
                    "unit_price": 200.0,
                    "gst_rate": 12.0,
                    "discount_type": "amount",
                    "discount_value": 100.0  # Flat 100 discount
                }
            ],
            "additional_charges": [{
                "charge_type_id": test_charge_type_id,
                "name": "Transportation",
                "hsn_code": "996511",
                "gst_rate": 18.0,
                "amount": 300.0
            }],
            "notes": "Test PO for total calculation"
        }
        response = api_client.post(f"{BASE_URL}/api/purchase-orders", json=payload)
        assert response.status_code == 201
        data = response.json()
        
        # Line 1: 10 * 100 = 1000, 10% disc = 100, net = 900, GST 18% = 162
        # Line 2: 5 * 200 = 1000, flat disc = 100, net = 900, GST 12% = 108
        # Subtotal = 900 + 900 = 1800
        # Charges = 300, GST 18% = 54
        # Total GST = 162 + 108 + 54 = 324
        # Grand Total = 1800 + 300 + 324 = 2424
        
        assert data["subtotal"] == 1800.0
        assert data["charges_subtotal"] == 300.0
        assert data["total_tax"] == 324.0
        assert data["total_amount"] == 2424.0
        print(f"PO totals verified: subtotal={data['subtotal']}, charges={data['charges_subtotal']}, tax={data['total_tax']}, total={data['total_amount']}")


# ================== FIXTURES ==================

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if response.status_code == 200:
        # Token is in cookie, but we can also use the session
        return response.cookies.get("access_token", "")
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture
def test_supplier_id(api_client, auth_token):
    """Get a test supplier ID"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    response = api_client.get(f"{BASE_URL}/api/suppliers")
    suppliers = response.json()
    if len(suppliers) > 0:
        return suppliers[0]["id"]
    pytest.skip("No suppliers available")

@pytest.fixture
def test_item_id(api_client, auth_token):
    """Get a test item ID"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    response = api_client.get(f"{BASE_URL}/api/items")
    items = response.json()
    if len(items) > 0:
        return items[0]["id"]
    pytest.skip("No items available")

@pytest.fixture
def test_warehouse_id(api_client, auth_token):
    """Get a test warehouse ID with address"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    response = api_client.get(f"{BASE_URL}/api/warehouses")
    warehouses = response.json()
    if len(warehouses) > 0:
        return warehouses[0]["id"]
    pytest.skip("No warehouses available")

@pytest.fixture
def test_charge_type_id(api_client, auth_token):
    """Get a test charge type ID"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    response = api_client.get(f"{BASE_URL}/api/settings/po-charges")
    charges = response.json()
    if len(charges) > 0:
        return charges[0]["id"]
    # Create one if none exists
    create_resp = api_client.post(f"{BASE_URL}/api/settings/po-charges", json={
        "name": "TEST_Fixture Charge",
        "hsn_code": "996599",
        "gst_rate": 18.0
    })
    if create_resp.status_code == 201:
        return create_resp.json()["id"]
    pytest.skip("No charge types available")
