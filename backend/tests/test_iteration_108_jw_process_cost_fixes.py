"""
Iteration 108 - JW Process Cost Fixes Tests
============================================
Tests for the 3 user-reported issues on JW Subcontract Order Edit dialog and DC:

1. JW Process OS cost shown in DC was the COMBINED process cost instead of SPECIFIC outsourced routing's cost
   - Job Card OS (auto-created SC tied to one specific operation via reference_operation_seqs) must use that specific routing's per-op cost
   - Full MO-SC (without_material, no reference_operation_seqs) should keep combined cost

2. JW Process OS edit dialog must offer an editable Item Description / Remarks per part

3. Need an 'Add Part' button at the BOTTOM of the parts table too

Backend Tests:
- GET /api/bom/routing-cost?item_id=X&process_name=Y — returns {item_id, process_name, cost}; 0.0 for unknown op
- PUT /api/job-work/orders/{id} preserves per-line process_name and per-op charges on Job Card OS SCs
- POST /api/job-work/orders accepts new optional fields process_name and item_description on job_work_parts
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRoutingCostEndpoint:
    """Tests for GET /api/bom/routing-cost endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_108_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        yield
        # Cleanup
        for bom_id in self.created_boms:
            try:
                self.client.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except Exception:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except Exception:
                pass
    
    def test_routing_cost_returns_specific_op_cost(self, api_client):
        """Test that /api/bom/routing-cost returns the cost for a specific routing operation"""
        # Create a test item with BOM that has multiple routings with different costs
        item_data = {
            "part_number": f"{self.test_prefix}PART_1",
            "name": "Test Part with Routings",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 100
        }
        item_resp = api_client.post(f"{BASE_URL}/api/items", json=item_data)
        assert item_resp.status_code == 201, f"Failed to create item: {item_resp.text}"
        item_id = item_resp.json()["id"]
        self.created_items.append(item_id)
        
        # Create a BOM with parent_routings that have different costs
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_1",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "LC Cutting", "cost": 500},
                {"name": "Bending", "cost": 200},
                {"name": "Welding", "cost": 300}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201], f"Failed to create BOM: {bom_resp.text}"
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        # Test: Get specific routing cost for "LC Cutting"
        resp = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={"item_id": item_id, "process_name": "LC Cutting"})
        assert resp.status_code == 200, f"Failed to get routing cost: {resp.text}"
        data = resp.json()
        assert data["item_id"] == item_id
        assert data["process_name"] == "LC Cutting"
        assert data["cost"] == 500, f"Expected cost 500 for LC Cutting, got {data['cost']}"
        print(f"✓ LC Cutting cost: {data['cost']}")
        
        # Test: Get specific routing cost for "Bending"
        resp = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={"item_id": item_id, "process_name": "Bending"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["cost"] == 200, f"Expected cost 200 for Bending, got {data['cost']}"
        print(f"✓ Bending cost: {data['cost']}")
        
        # Test: Get specific routing cost for "Welding"
        resp = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={"item_id": item_id, "process_name": "Welding"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["cost"] == 300, f"Expected cost 300 for Welding, got {data['cost']}"
        print(f"✓ Welding cost: {data['cost']}")
    
    def test_routing_cost_returns_zero_for_unknown_op(self, api_client):
        """Test that /api/bom/routing-cost returns 0.0 for non-existent operation"""
        # Create a test item
        item_data = {
            "part_number": f"{self.test_prefix}PART_2",
            "name": "Test Part 2",
            "category": "component",
            "unit_of_measure": "pcs"
        }
        item_resp = api_client.post(f"{BASE_URL}/api/items", json=item_data)
        assert item_resp.status_code == 201
        item_id = item_resp.json()["id"]
        self.created_items.append(item_id)
        
        # Create BOM with specific routings
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_2",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [{"name": "Drilling", "cost": 150}]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        # Test: Get cost for non-existent operation
        resp = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={"item_id": item_id, "process_name": "NonExistentOp"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["cost"] == 0.0, f"Expected cost 0.0 for unknown op, got {data['cost']}"
        print(f"✓ Unknown operation returns cost: {data['cost']}")
    
    def test_routing_cost_requires_auth(self, api_client_no_auth):
        """Test that /api/bom/routing-cost requires authentication"""
        resp = api_client_no_auth.get(f"{BASE_URL}/api/bom/routing-cost", params={"item_id": "test", "process_name": "test"})
        assert resp.status_code == 401, f"Expected 401 for unauthenticated request, got {resp.status_code}"
        print("✓ Endpoint requires authentication")


class TestJobWorkOrderPreservation:
    """Tests for PUT /api/job-work/orders/{id} preservation logic"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_108_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        yield
        # Cleanup
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
            except Exception:
                pass
        for bom_id in self.created_boms:
            try:
                self.client.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except Exception:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except Exception:
                pass
        for sup_id in self.created_suppliers:
            try:
                self.client.delete(f"{BASE_URL}/api/suppliers/{sup_id}")
            except Exception:
                pass
    
    def _create_test_item(self, api_client, suffix, category="component"):
        """Helper to create a test item"""
        item_data = {
            "part_number": f"{self.test_prefix}{suffix}",
            "name": f"Test Item {suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 100
        }
        resp = api_client.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201, f"Failed to create item: {resp.text}"
        item_id = resp.json()["id"]
        self.created_items.append(item_id)
        return item_id
    
    def _create_test_supplier(self, api_client, suffix):
        """Helper to create a test supplier"""
        sup_data = {
            "code": f"{self.test_prefix}SUP_{suffix}",
            "name": f"Test Supplier {suffix}",
            "status": "active",
            "state_code": "27",  # Maharashtra
            "gstin": "",
            "pin_code": "400001"  # Mumbai PIN
        }
        resp = api_client.post(f"{BASE_URL}/api/suppliers", json=sup_data)
        assert resp.status_code in [200, 201], f"Failed to create supplier: {resp.text}"
        sup_id = resp.json()["id"]
        self.created_suppliers.append(sup_id)
        return sup_id
    
    def test_put_preserves_process_name_and_charges_on_job_card_os(self, api_client):
        """Test that PUT preserves process_name and per-op charges on Job Card OS SCs"""
        # Create test item with BOM
        item_id = self._create_test_item(api_client, "PART_JC")
        
        # Create BOM with specific routing
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_JC",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Operation_2", "cost": 100},
                {"name": "Operation_3", "cost": 200}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        # Create supplier
        sup_id = self._create_test_supplier(api_client, "JC")
        
        # Create a Job Card OS SC (simulating what the system creates from Job Card outsource)
        # This SC has reference_operation_seqs which marks it as Job Card OS
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 100,  # Specific per-op cost for Operation_2
                    "process_name": "Operation_2",
                    "item_description": "Test description"
                }
            ],
            "notes": "Job Card OS test"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201, f"Failed to create order: {create_resp.text}"
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Manually set reference_operation_seqs to simulate Job Card OS
        # (In real flow, this is set by the Job Card outsource action)
        import pymongo
        from bson import ObjectId
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"reference_operation_seqs": [2], "subcontract_type": "without_material"}}
        )
        
        # Verify initial state - use list endpoint and filter
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None, f"Order {order_id} not found in list"
        assert order["job_work_parts"][0]["process_name"] == "Operation_2"
        assert order["job_work_parts"][0]["charges"] == 100
        assert order["job_work_parts"][0]["item_description"] == "Test description"
        print(f"✓ Initial state: process_name={order['job_work_parts'][0]['process_name']}, charges={order['job_work_parts'][0]['charges']}")
        
        # Now PUT with bare job_work_parts (simulating frontend save without changes)
        # The frontend sends: {item_id, quantity, charges:0} without process_name
        update_data = {
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 0  # Frontend sends 0 when user doesn't change
                }
            ]
        }
        put_resp = api_client.put(f"{BASE_URL}/api/job-work/orders/{order_id}", json=update_data)
        assert put_resp.status_code == 200, f"Failed to update order: {put_resp.text}"
        
        # Verify preservation - use list endpoint and filter
        list_resp2 = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp2.status_code == 200
        orders2 = list_resp2.json()
        updated_order = next((o for o in orders2 if o["id"] == order_id), None)
        assert updated_order is not None, f"Order {order_id} not found after PUT"
        
        # process_name should be preserved
        assert updated_order["job_work_parts"][0]["process_name"] == "Operation_2", \
            f"process_name was wiped! Got: {updated_order['job_work_parts'][0].get('process_name')}"
        
        # charges should be preserved (not replaced with combined cost)
        assert updated_order["job_work_parts"][0]["charges"] == 100, \
            f"charges was changed! Expected 100, got: {updated_order['job_work_parts'][0]['charges']}"
        
        print(f"✓ After PUT: process_name={updated_order['job_work_parts'][0]['process_name']}, charges={updated_order['job_work_parts'][0]['charges']}")
        print("✓ PUT preserves process_name and per-op charges on Job Card OS SC")
    
    def test_put_preserves_item_description(self, api_client):
        """Test that PUT preserves item_description field"""
        item_id = self._create_test_item(api_client, "PART_DESC")
        sup_id = self._create_test_supplier(api_client, "DESC")
        
        # Create order with item_description
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 5,
                    "charges": 50,
                    "item_description": "Custom spec: 10mm thickness, polished finish"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Verify initial description - use list endpoint
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        orders = list_resp.json()
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        assert order["job_work_parts"][0]["item_description"] == "Custom spec: 10mm thickness, polished finish"
        print(f"✓ Initial item_description: {order['job_work_parts'][0]['item_description']}")
        
        # PUT without item_description (should preserve existing)
        update_data = {
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 5,
                    "charges": 50
                    # item_description not provided
                }
            ]
        }
        put_resp = api_client.put(f"{BASE_URL}/api/job-work/orders/{order_id}", json=update_data)
        assert put_resp.status_code == 200
        
        # Verify preservation - use list endpoint
        list_resp2 = api_client.get(f"{BASE_URL}/api/job-work/orders")
        orders2 = list_resp2.json()
        updated_order = next((o for o in orders2 if o["id"] == order_id), None)
        assert updated_order is not None
        assert updated_order["job_work_parts"][0]["item_description"] == "Custom spec: 10mm thickness, polished finish", \
            f"item_description was wiped! Got: {updated_order['job_work_parts'][0].get('item_description')}"
        print(f"✓ After PUT: item_description preserved: {updated_order['job_work_parts'][0]['item_description']}")
    
    def test_put_allows_updating_item_description(self, api_client):
        """Test that PUT allows updating item_description to a new value"""
        item_id = self._create_test_item(api_client, "PART_DESC2")
        sup_id = self._create_test_supplier(api_client, "DESC2")
        
        # Create order
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 5,
                    "charges": 50,
                    "item_description": "Original description"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # PUT with new item_description
        update_data = {
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 5,
                    "charges": 50,
                    "item_description": "Updated description with new specs"
                }
            ]
        }
        put_resp = api_client.put(f"{BASE_URL}/api/job-work/orders/{order_id}", json=update_data)
        assert put_resp.status_code == 200
        
        # Verify update - use list endpoint
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        orders = list_resp.json()
        updated_order = next((o for o in orders if o["id"] == order_id), None)
        assert updated_order is not None
        assert updated_order["job_work_parts"][0]["item_description"] == "Updated description with new specs"
        print(f"✓ item_description updated to: {updated_order['job_work_parts'][0]['item_description']}")


class TestJobWorkOrderCreate:
    """Tests for POST /api/job-work/orders with new fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_108_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        yield
        # Cleanup
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
            except Exception:
                pass
        for bom_id in self.created_boms:
            try:
                self.client.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except Exception:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except Exception:
                pass
        for sup_id in self.created_suppliers:
            try:
                self.client.delete(f"{BASE_URL}/api/suppliers/{sup_id}")
            except Exception:
                pass
    
    def _create_test_item(self, api_client, suffix, category="component"):
        item_data = {
            "part_number": f"{self.test_prefix}{suffix}",
            "name": f"Test Item {suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 100
        }
        resp = api_client.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item_id = resp.json()["id"]
        self.created_items.append(item_id)
        return item_id
    
    def _create_test_supplier(self, api_client, suffix):
        sup_data = {
            "code": f"{self.test_prefix}SUP_{suffix}",
            "name": f"Test Supplier {suffix}",
            "status": "active",
            "state_code": "27",  # Maharashtra
            "gstin": "",
            "pin_code": "400001"  # Mumbai PIN
        }
        resp = api_client.post(f"{BASE_URL}/api/suppliers", json=sup_data)
        assert resp.status_code in [200, 201]
        sup_id = resp.json()["id"]
        self.created_suppliers.append(sup_id)
        return sup_id
    
    def test_post_accepts_process_name_and_uses_specific_routing_cost(self, api_client):
        """Test that POST accepts process_name and uses find_routing_cost for that specific op"""
        # Create item with BOM having multiple routings
        item_id = self._create_test_item(api_client, "PART_POST")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_POST",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Op_A", "cost": 150},
                {"name": "Op_B", "cost": 250},
                {"name": "Op_C", "cost": 350}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "POST")
        
        # Create order with process_name specified (no charges - should auto-resolve)
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 0,  # Not specified - should use find_routing_cost
                    "process_name": "Op_B"  # Specific operation
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201, f"Failed to create order: {create_resp.text}"
        order = create_resp.json()
        order_id = order["id"]
        self.created_orders.append(order_id)
        
        # Verify the charges were set to Op_B's cost (250), not combined (750)
        assert order["job_work_parts"][0]["process_name"] == "Op_B"
        assert order["job_work_parts"][0]["charges"] == 250, \
            f"Expected charges=250 (Op_B cost), got {order['job_work_parts'][0]['charges']}"
        print(f"✓ POST with process_name='Op_B' set charges to {order['job_work_parts'][0]['charges']} (specific op cost)")
    
    def test_post_accepts_item_description(self, api_client):
        """Test that POST accepts and persists item_description field"""
        item_id = self._create_test_item(api_client, "PART_DESC_POST")
        sup_id = self._create_test_supplier(api_client, "DESC_POST")
        
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 5,
                    "charges": 100,
                    "item_description": "Special handling required: fragile parts"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order = create_resp.json()
        order_id = order["id"]
        self.created_orders.append(order_id)
        
        # Verify item_description was persisted
        assert order["job_work_parts"][0]["item_description"] == "Special handling required: fragile parts"
        print(f"✓ POST persisted item_description: {order['job_work_parts'][0]['item_description']}")
        
        # Verify via GET - use list endpoint
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        orders = list_resp.json()
        fetched_order = next((o for o in orders if o["id"] == order_id), None)
        assert fetched_order is not None
        assert fetched_order["job_work_parts"][0]["item_description"] == "Special handling required: fragile parts"
        print("✓ GET confirms item_description persisted")
    
    def test_post_without_process_name_uses_combined_cost(self, api_client):
        """Test that POST without process_name uses combined BOM process_cost (Full MO-SC behavior)"""
        item_id = self._create_test_item(api_client, "PART_FULL")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_FULL",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Op_X", "cost": 100},
                {"name": "Op_Y", "cost": 200}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "FULL")
        
        # Create order WITHOUT process_name (Full MO-SC scenario)
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 0  # Should use combined process_cost
                    # No process_name
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order = create_resp.json()
        order_id = order["id"]
        self.created_orders.append(order_id)
        
        # Verify charges = combined cost (100 + 200 = 300)
        assert order["job_work_parts"][0]["charges"] == 300, \
            f"Expected combined charges=300, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ POST without process_name set charges to {order['job_work_parts'][0]['charges']} (combined cost)")


class TestMultiLineJobCardOS:
    """Tests for consolidated Job Card OS where same item has multiple ops"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_108_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        yield
        # Cleanup
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
            except Exception:
                pass
        for bom_id in self.created_boms:
            try:
                self.client.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except Exception:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except Exception:
                pass
        for sup_id in self.created_suppliers:
            try:
                self.client.delete(f"{BASE_URL}/api/suppliers/{sup_id}")
            except Exception:
                pass
    
    def _create_test_item(self, api_client, suffix, category="component"):
        item_data = {
            "part_number": f"{self.test_prefix}{suffix}",
            "name": f"Test Item {suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 100
        }
        resp = api_client.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item_id = resp.json()["id"]
        self.created_items.append(item_id)
        return item_id
    
    def _create_test_supplier(self, api_client, suffix):
        sup_data = {
            "code": f"{self.test_prefix}SUP_{suffix}",
            "name": f"Test Supplier {suffix}",
            "status": "active",
            "state_code": "27",  # Maharashtra
            "gstin": "",
            "pin_code": "400001"  # Mumbai PIN
        }
        resp = api_client.post(f"{BASE_URL}/api/suppliers", json=sup_data)
        assert resp.status_code in [200, 201]
        sup_id = resp.json()["id"]
        self.created_suppliers.append(sup_id)
        return sup_id
    
    def test_multi_line_same_item_different_ops_preserved(self, api_client):
        """Test that consolidated Job Card OS with same item in multiple ops preserves each line's process_name and charges"""
        item_id = self._create_test_item(api_client, "PART_MULTI")
        
        # Create BOM with multiple routings
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_MULTI",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Cutting", "cost": 100},
                {"name": "Grinding", "cost": 150},
                {"name": "Polishing", "cost": 200}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "MULTI")
        
        # Create order with SAME item appearing twice with DIFFERENT process_names
        # This simulates a consolidated Job Card OS where multiple ops on the same part are outsourced
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 100,
                    "process_name": "Cutting",
                    "item_description": "Cutting operation"
                },
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 150,
                    "process_name": "Grinding",
                    "item_description": "Grinding operation"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order = create_resp.json()
        order_id = order["id"]
        self.created_orders.append(order_id)
        
        # Verify both lines created with correct process_names
        assert len(order["job_work_parts"]) == 2
        cutting_line = next((p for p in order["job_work_parts"] if p["process_name"] == "Cutting"), None)
        grinding_line = next((p for p in order["job_work_parts"] if p["process_name"] == "Grinding"), None)
        
        assert cutting_line is not None, "Cutting line not found"
        assert grinding_line is not None, "Grinding line not found"
        assert cutting_line["charges"] == 100
        assert grinding_line["charges"] == 150
        print(f"✓ Created multi-line order: Cutting={cutting_line['charges']}, Grinding={grinding_line['charges']}")
        
        # Simulate Job Card OS by setting reference_operation_seqs
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"reference_operation_seqs": [1, 2], "subcontract_type": "without_material"}}
        )
        
        # PUT with bare data (simulating frontend save)
        update_data = {
            "job_work_parts": [
                {"item_id": item_id, "quantity": 10, "charges": 0, "process_name": "Cutting"},
                {"item_id": item_id, "quantity": 10, "charges": 0, "process_name": "Grinding"}
            ]
        }
        put_resp = api_client.put(f"{BASE_URL}/api/job-work/orders/{order_id}", json=update_data)
        assert put_resp.status_code == 200
        
        # Verify preservation - use list endpoint
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        orders = list_resp.json()
        updated_order = next((o for o in orders if o["id"] == order_id), None)
        assert updated_order is not None
        
        cutting_updated = next((p for p in updated_order["job_work_parts"] if p["process_name"] == "Cutting"), None)
        grinding_updated = next((p for p in updated_order["job_work_parts"] if p["process_name"] == "Grinding"), None)
        
        assert cutting_updated is not None, "Cutting line lost after PUT"
        assert grinding_updated is not None, "Grinding line lost after PUT"
        assert cutting_updated["charges"] == 100, f"Cutting charges changed from 100 to {cutting_updated['charges']}"
        assert grinding_updated["charges"] == 150, f"Grinding charges changed from 150 to {grinding_updated['charges']}"
        print(f"✓ After PUT: Cutting={cutting_updated['charges']}, Grinding={grinding_updated['charges']} (preserved)")


# ============== FIXTURES ==============

@pytest.fixture
def api_client():
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    # Login
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if login_resp.status_code != 200:
        pytest.skip(f"Authentication failed: {login_resp.text}")
    return session

@pytest.fixture
def api_client_no_auth():
    """Unauthenticated requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    """Get auth token (cookies are already set in api_client)"""
    return "cookie-based"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
