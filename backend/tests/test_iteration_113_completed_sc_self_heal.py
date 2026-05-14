"""
Iteration 113 - Completed SC Self-Heal Tests
=============================================
Tests for the fix that removed is_live gating from Job Card OS self-heal.

User Issue:
- JW SC Edit dialog STILL showing combined cost (90.61, 52.99, 101.12, 49.91) for Job Card OS
  lines while Send DC dialog correctly shows specific per-op cost (37.61, 5.99, 50.87, 23.21).
- Root cause: GET /api/job-work/orders self-heal was gated behind `is_live = status in (draft, in_progress)`
  — completed/closed SCs were skipped, so the polluted stored charges leaked through.

Fix:
- Removed the is_live gating from the specific-op override branch (display-only correction; DB is untouched).
- Combined-cost auto-refresh for Full MO-SC lines still respects is_live (audit preservation).

Test Scenarios:
1. BACKEND: GET /api/job-work/orders self-heals `charges` via find_routing_cost(item_id, process_name)
   for EVERY job_work_part with process_name set, regardless of SC.status (draft, in_progress, completed, closed, etc.).
2. BACKEND: When find_routing_cost returns 0, stored value is preserved.
3. REGRESSION: Combined-cost auto-refresh for Full MO-SC lines (no process_name) STILL gated by is_live.
4. REGRESSION: bom_rollup_cost and process_names auto-refresh still gated by is_live (no change there).
5. REGRESSION: All 18 existing tests from iteration 111 still pass (except the one that expected old behavior).
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestCompletedSCSelfHeal:
    """Tests for completed SC self-heal (the main fix in iteration 113)"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_113_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        yield
        # Cleanup
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
            except:
                pass
        for bom_id in self.created_boms:
            try:
                self.client.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except:
                pass
        for sup_id in self.created_suppliers:
            try:
                self.client.delete(f"{BASE_URL}/api/suppliers/{sup_id}")
            except:
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
            "state_code": "27",
            "gstin": "",
            "pin_code": "400001"
        }
        resp = api_client.post(f"{BASE_URL}/api/suppliers", json=sup_data)
        assert resp.status_code in [200, 201], f"Failed to create supplier: {resp.text}"
        sup_id = resp.json()["id"]
        self.created_suppliers.append(sup_id)
        return sup_id
    
    def test_completed_sc_job_card_os_self_heals_charges(self, api_client):
        """
        MAIN FIX TEST: GET /api/job-work/orders self-heals charges for Job Card OS lines
        even when SC.status='completed'.
        
        This is the exact scenario from the user's bug report:
        - SC with status='completed' has polluted charges=90.61 (combined cost)
        - BOM has Cutting=53, Powder Coating=37.61
        - GET should self-heal to 37.61 (specific Powder Coating cost)
        """
        item_id = self._create_test_item(api_client, "COMPLETED_PC")
        
        # Create BOM with Cutting + Powder Coating (matching user's scenario)
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_COMPLETED",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Cutting", "cost": 53.0},
                {"name": "Powder Coating", "cost": 37.61}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201], f"Failed to create BOM: {bom_resp.text}"
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "COMPLETED")
        
        # Create SC
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": item_id, "quantity": 10, "charges": 0, "process_name": "Powder Coating"}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201, f"Failed to create order: {create_resp.text}"
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set status to 'completed' and pollute charges with combined cost (90.61)
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "status": "completed",
                "reference_operation_seqs": [1],
                "subcontract_type": "without_material",
                "job_work_parts.0.charges": 90.61  # Polluted: combined cost (53 + 37.61)
            }}
        )
        
        # GET should self-heal even though status='completed'
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200, f"Failed to get orders: {list_resp.text}"
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None, f"Order {order_id} not found in list"
        
        # Charges should be self-healed to 37.61 (specific Powder Coating cost)
        assert abs(order["job_work_parts"][0]["charges"] - 37.61) < 0.01, \
            f"Completed SC NOT self-healed! Expected 37.61, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Completed SC self-healed: charges={order['job_work_parts'][0]['charges']} (was 90.61)")
    
    def test_closed_sc_job_card_os_self_heals_charges(self, api_client):
        """
        Test that GET self-heals charges for Job Card OS lines even when SC.status='closed'.
        """
        item_id = self._create_test_item(api_client, "CLOSED_PC")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_CLOSED",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Welding", "cost": 45.0},
                {"name": "Powder Coating", "cost": 52.99}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "CLOSED")
        
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": item_id, "quantity": 5, "charges": 0, "process_name": "Powder Coating"}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set status to 'closed' and pollute charges
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "status": "closed",
                "reference_operation_seqs": [1],
                "job_work_parts.0.charges": 97.99  # Polluted: combined cost
            }}
        )
        
        # GET should self-heal
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        assert abs(order["job_work_parts"][0]["charges"] - 52.99) < 0.01, \
            f"Closed SC NOT self-healed! Expected 52.99, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Closed SC self-healed: charges={order['job_work_parts'][0]['charges']}")
    
    def test_sent_sc_job_card_os_self_heals_charges(self, api_client):
        """
        Test that GET self-heals charges for Job Card OS lines even when SC.status='sent'.
        """
        item_id = self._create_test_item(api_client, "SENT_PC")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_SENT",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Grinding", "cost": 50.0},
                {"name": "Powder Coating", "cost": 101.12}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "SENT")
        
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": item_id, "quantity": 8, "charges": 0, "process_name": "Powder Coating"}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set status to 'sent' and pollute charges
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "status": "sent",
                "reference_operation_seqs": [1],
                "job_work_parts.0.charges": 151.12  # Polluted: combined cost
            }}
        )
        
        # GET should self-heal
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        assert abs(order["job_work_parts"][0]["charges"] - 101.12) < 0.01, \
            f"Sent SC NOT self-healed! Expected 101.12, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Sent SC self-healed: charges={order['job_work_parts'][0]['charges']}")
    
    def test_self_heal_preserves_when_routing_not_found(self, api_client):
        """
        Test that when find_routing_cost returns 0 (op not in any BOM), stored value is preserved.
        """
        item_id = self._create_test_item(api_client, "NO_ROUTING")
        
        # Create BOM WITHOUT Powder Coating
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_NO_PC",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Cutting", "cost": 100}
                # No Powder Coating
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "NO_ROUTING")
        
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": item_id, "quantity": 10, "charges": 0, "process_name": "Powder Coating"}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set completed status and manual charges
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "status": "completed",
                "reference_operation_seqs": [1],
                "job_work_parts.0.charges": 999.99  # Manual value
            }}
        )
        
        # GET should preserve since find_routing_cost returns 0
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        assert order["job_work_parts"][0]["charges"] == 999.99, \
            f"Charges were wiped! Expected 999.99, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Stored charges preserved when routing not found: {order['job_work_parts'][0]['charges']}")


class TestFullMOSCIsLiveGating:
    """Tests to verify Full MO-SC combined-cost auto-refresh is still gated by is_live"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_113_FULL_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        yield
        # Cleanup
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
            except:
                pass
        for bom_id in self.created_boms:
            try:
                self.client.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except:
                pass
        for sup_id in self.created_suppliers:
            try:
                self.client.delete(f"{BASE_URL}/api/suppliers/{sup_id}")
            except:
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
            "state_code": "27",
            "gstin": "",
            "pin_code": "400001"
        }
        resp = api_client.post(f"{BASE_URL}/api/suppliers", json=sup_data)
        assert resp.status_code in [200, 201]
        sup_id = resp.json()["id"]
        self.created_suppliers.append(sup_id)
        return sup_id
    
    def test_completed_full_mo_sc_preserves_charges(self, api_client):
        """
        REGRESSION: Full MO-SC (no process_name) on completed SC should NOT auto-refresh charges.
        The is_live gating still applies for combined-cost auto-refresh.
        """
        item_id = self._create_test_item(api_client, "FULL_MO_COMPLETED")
        
        # Create BOM with multiple routings
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_FULL_MO",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Op1", "cost": 100},
                {"name": "Op2", "cost": 200},
                {"name": "Op3", "cost": 300}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "FULL_MO")
        
        # Create Full MO-SC (no process_name)
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": item_id, "quantity": 10, "charges": 0}  # No process_name
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set status to 'completed' and set historical charges
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "status": "completed",
                "job_work_parts.0.charges": 500.0  # Historical value (not current BOM's 600)
            }}
        )
        
        # GET should NOT auto-refresh since is_live=False and no process_name
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        # Charges should be preserved (not refreshed to 600)
        assert order["job_work_parts"][0]["charges"] == 500.0, \
            f"Full MO-SC completed charges were modified! Expected 500.0, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Full MO-SC completed charges preserved: {order['job_work_parts'][0]['charges']}")
    
    def test_draft_full_mo_sc_auto_refreshes_charges(self, api_client):
        """
        REGRESSION: Full MO-SC (no process_name) on draft SC should auto-refresh charges.
        """
        item_id = self._create_test_item(api_client, "FULL_MO_DRAFT")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_FULL_MO_DRAFT",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Op1", "cost": 100},
                {"name": "Op2", "cost": 200}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "FULL_MO_DRAFT")
        
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": item_id, "quantity": 10, "charges": 0}  # No process_name
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set stale charges (status remains 'draft')
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "job_work_parts.0.charges": 100.0  # Stale value
            }}
        )
        
        # GET should auto-refresh since is_live=True (draft)
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        # Charges should be refreshed to 300 (100+200)
        assert order["job_work_parts"][0]["charges"] == 300, \
            f"Full MO-SC draft charges NOT refreshed! Expected 300, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Full MO-SC draft charges auto-refreshed: {order['job_work_parts'][0]['charges']}")


class TestBomRollupIsLiveGating:
    """Tests to verify bom_rollup_cost and process_names auto-refresh is still gated by is_live"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_113_ROLLUP_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        yield
        # Cleanup
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
            except:
                pass
        for bom_id in self.created_boms:
            try:
                self.client.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except:
                pass
        for sup_id in self.created_suppliers:
            try:
                self.client.delete(f"{BASE_URL}/api/suppliers/{sup_id}")
            except:
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
            "state_code": "27",
            "gstin": "",
            "pin_code": "400001"
        }
        resp = api_client.post(f"{BASE_URL}/api/suppliers", json=sup_data)
        assert resp.status_code in [200, 201]
        sup_id = resp.json()["id"]
        self.created_suppliers.append(sup_id)
        return sup_id
    
    def test_completed_sc_preserves_bom_rollup_cost(self, api_client):
        """
        REGRESSION: bom_rollup_cost on completed SC should NOT auto-refresh.
        """
        item_id = self._create_test_item(api_client, "ROLLUP_COMPLETED")
        rm_item_id = self._create_test_item(api_client, "RM_ROLLUP", category="raw_material")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_ROLLUP",
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": rm_item_id, "quantity": 2, "unit_of_measure": "pcs"}
            ],
            "parent_routings": [
                {"name": "Powder Coating", "cost": 50}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "ROLLUP")
        
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": item_id, "quantity": 10, "charges": 0, "process_name": "Powder Coating"}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set status to 'completed' and set historical bom_rollup_cost
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "status": "completed",
                "reference_operation_seqs": [1],
                "job_work_parts.0.bom_rollup_cost": 999.99  # Historical value
            }}
        )
        
        # GET should NOT auto-refresh bom_rollup_cost since is_live=False
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        # bom_rollup_cost should be preserved (not refreshed to 250)
        assert order["job_work_parts"][0].get("bom_rollup_cost") == 999.99, \
            f"bom_rollup_cost was modified! Expected 999.99, got {order['job_work_parts'][0].get('bom_rollup_cost')}"
        # But charges SHOULD be self-healed (50 for Powder Coating)
        assert order["job_work_parts"][0]["charges"] == 50, \
            f"charges NOT self-healed! Expected 50, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Completed SC: bom_rollup_cost preserved={order['job_work_parts'][0].get('bom_rollup_cost')}, charges self-healed={order['job_work_parts'][0]['charges']}")


# ============== FIXTURES ==============

@pytest.fixture
def api_client():
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
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
