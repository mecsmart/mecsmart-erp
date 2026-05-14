"""
Iteration 111 - JW Process OS Self-Heal Tests
==============================================
Tests for the GET /api/job-work/orders self-heal logic that overrides stale stored
charges with the specific routing cost when process_name is set.

User Issue:
- SC Edit dialog showed 4 components tagged 'Outsourced op: Powder Coating' but the
  Process Cost/Unit column displayed the COMBINED routing cost (sum of ALL ops on the BOM)
  instead of just the Powder Coating-specific per-op cost.
- After iteration 109/110 fixes, PUT/GET stopped OVERWRITING good data but did not
  SELF-HEAL legacy data already polluted with combined cost.

Fix:
- GET /api/job-work/orders now pulls find_routing_cost(item_id, process_name) for any
  Job Card OS line and overrides stale stored charges with the specific routing's per-unit cost.
- When find_routing_cost returns 0 (op not in any BOM), the stored value is preserved.

Test Scenarios:
1. BACKEND: GET /api/job-work/orders — for any job_work_parts row where process_name is set,
   the response's charges MUST equal find_routing_cost(item_id, process_name), overriding
   stored stale value.
2. REGRESSION: For Full MO-SC parts (no process_name), charges still refresh from combined
   BOM fg_process_cost as before.
3. REGRESSION: bom_rollup_cost continues to refresh as before (independent of charges override).
4. REGRESSION: Sent/completed SCs (status NOT in draft/in_progress) — the auto-refresh block
   is skipped entirely (is_live check), so historical data is untouched.
5. Test both scenarios for find_routing_cost: (a) item's own BOM parent_routings AND
   (b) component-line routings on a parent BOM where the item appears as a component.
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestJWProcessSelfHeal:
    """Tests for GET /api/job-work/orders self-heal logic"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_111_{uuid.uuid4().hex[:6]}_"
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
    
    def test_self_heal_overrides_stale_charges_with_specific_routing_cost(self, api_client):
        """
        Test that GET /api/job-work/orders self-heals stale charges with specific routing cost.
        
        Scenario: SC has 4 components tagged with process_name='Powder Coating', but stored
        charges are polluted with combined cost (Cutting+PC). GET should override with
        specific Powder Coating cost.
        """
        # Create 4 test items (simulating the user's 4 components)
        items = []
        for i in range(4):
            item_id = self._create_test_item(api_client, f"COMP_{i+1}")
            items.append(item_id)
        
        # Create BOMs for each item with multiple routings including Powder Coating
        # Each item has different costs to verify specific override
        routing_configs = [
            {"cutting": 50, "powder_coating": 90.61},   # Combined=140.61, PC=90.61
            {"cutting": 30, "powder_coating": 52.99},   # Combined=82.99, PC=52.99
            {"cutting": 100, "powder_coating": 101.10}, # Combined=201.10, PC=101.10
            {"cutting": 40, "powder_coating": 49.91},   # Combined=89.91, PC=49.91
        ]
        
        for i, item_id in enumerate(items):
            config = routing_configs[i]
            bom_data = {
                "parent_item_id": item_id,
                "name": f"{self.test_prefix}BOM_COMP_{i+1}",
                "revision": "A",
                "status": "active",
                "components": [],
                "parent_routings": [
                    {"name": "Cutting/Welding/Bending/Grinding", "cost": config["cutting"]},
                    {"name": "Powder Coating", "cost": config["powder_coating"]}
                ]
            }
            bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
            assert bom_resp.status_code in [200, 201], f"Failed to create BOM: {bom_resp.text}"
            self.created_boms.append(bom_resp.json()["id"])
        
        # Create supplier
        sup_id = self._create_test_supplier(api_client, "PC")
        
        # Create SC with polluted charges (combined cost instead of specific PC cost)
        # This simulates legacy data before the fix
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": items[0], "quantity": 10, "charges": 140.61, "process_name": "Powder Coating"},
                {"item_id": items[1], "quantity": 10, "charges": 82.99, "process_name": "Powder Coating"},
                {"item_id": items[2], "quantity": 10, "charges": 201.10, "process_name": "Powder Coating"},
                {"item_id": items[3], "quantity": 10, "charges": 89.91, "process_name": "Powder Coating"},
            ],
            "notes": "Self-heal test - polluted charges"
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201, f"Failed to create order: {create_resp.text}"
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Manually pollute the stored charges to simulate legacy data
        # (The POST might have already corrected them, so we force pollution)
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        
        # Set polluted charges (combined cost) and mark as Job Card OS
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "reference_operation_seqs": [1],  # Mark as Job Card OS
                "subcontract_type": "without_material",
                "job_work_parts.0.charges": 140.61,  # Polluted: should be 90.61
                "job_work_parts.1.charges": 82.99,   # Polluted: should be 52.99
                "job_work_parts.2.charges": 201.10,  # Polluted: should be 101.10
                "job_work_parts.3.charges": 89.91,   # Polluted: should be 49.91
            }}
        )
        
        # GET /api/job-work/orders should self-heal the charges
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200, f"Failed to get orders: {list_resp.text}"
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None, f"Order {order_id} not found in list"
        
        # Verify self-heal: charges should now be the SPECIFIC Powder Coating cost
        expected_charges = [90.61, 52.99, 101.10, 49.91]
        for i, part in enumerate(order["job_work_parts"]):
            assert part["process_name"] == "Powder Coating", f"Part {i} process_name mismatch"
            assert abs(part["charges"] - expected_charges[i]) < 0.01, \
                f"Part {i} charges not self-healed! Expected {expected_charges[i]}, got {part['charges']}"
            print(f"✓ Part {i+1}: charges self-healed from polluted to {part['charges']} (Powder Coating specific cost)")
        
        print("✓ GET /api/job-work/orders self-heals stale charges with specific routing cost")
    
    def test_self_heal_preserves_stored_when_routing_not_found(self, api_client):
        """
        Test that when find_routing_cost returns 0 (op not in any BOM), the stored value is preserved.
        """
        item_id = self._create_test_item(api_client, "NO_ROUTING")
        
        # Create BOM WITHOUT the process_name we'll use
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_NO_ROUTING",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Cutting", "cost": 100}
                # No "Powder Coating" routing
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "NO_ROUTING")
        
        # Create SC with manually-keyed charges for a non-existent routing
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": item_id, "quantity": 10, "charges": 999.99, "process_name": "Powder Coating"}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Force the stored charges to a manual value
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "reference_operation_seqs": [1],
                "job_work_parts.0.charges": 999.99
            }}
        )
        
        # GET should preserve the stored value since find_routing_cost returns 0
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        # Charges should be preserved (not wiped to 0)
        assert order["job_work_parts"][0]["charges"] == 999.99, \
            f"Charges were wiped! Expected 999.99, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Stored charges preserved when routing not found: {order['job_work_parts'][0]['charges']}")
    
    def test_full_mo_sc_uses_combined_fg_process_cost(self, api_client):
        """
        REGRESSION: For Full MO-SC parts (no process_name), charges still refresh from
        combined BOM fg_process_cost as before.
        """
        item_id = self._create_test_item(api_client, "FULL_MO")
        
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
        
        # GET should use combined fg_process_cost (100+200+300=600)
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        # Charges should be combined fg_process_cost
        assert order["job_work_parts"][0]["charges"] == 600, \
            f"Full MO-SC charges incorrect! Expected 600, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Full MO-SC uses combined fg_process_cost: {order['job_work_parts'][0]['charges']}")
    
    def test_bom_rollup_cost_refreshes_independently(self, api_client):
        """
        REGRESSION: bom_rollup_cost continues to refresh as before (independent of charges override).
        """
        item_id = self._create_test_item(api_client, "ROLLUP")
        
        # Create BOM with RM cost
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
        
        # Create SC with process_name
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
        
        # GET should have both charges (specific) and bom_rollup_cost (RM)
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        part = order["job_work_parts"][0]
        # charges = specific Powder Coating cost = 50
        assert part["charges"] == 50, f"Charges incorrect! Expected 50, got {part['charges']}"
        # bom_rollup_cost = rm_cost + process_cost = (2 * 100) + 50 = 250 (Total/Unit)
        assert part.get("bom_rollup_cost") == 250, \
            f"bom_rollup_cost incorrect! Expected 250, got {part.get('bom_rollup_cost')}"
        print(f"✓ charges={part['charges']} (specific), bom_rollup_cost={part.get('bom_rollup_cost')} (Total/Unit)")
    
    def test_sent_completed_sc_not_modified(self, api_client):
        """
        REGRESSION: Sent/completed SCs (status NOT in draft/in_progress) — the auto-refresh
        block is skipped entirely (is_live check), so historical data is untouched.
        """
        item_id = self._create_test_item(api_client, "SENT")
        
        # Create BOM
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_SENT",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Cutting", "cost": 100},
                {"name": "Powder Coating", "cost": 200}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "SENT")
        
        # Create SC
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
        
        # Set status to 'sent' and pollute charges
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "status": "sent",
                "job_work_parts.0.charges": 999.99  # Historical polluted value
            }}
        )
        
        # GET should NOT modify sent SC
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        # Charges should be preserved (not self-healed)
        assert order["job_work_parts"][0]["charges"] == 999.99, \
            f"Sent SC was modified! Expected 999.99, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Sent SC charges preserved: {order['job_work_parts'][0]['charges']}")
    
    def test_find_routing_cost_from_component_line_routings(self, api_client):
        """
        Test find_routing_cost scenario (b): component-line routings on a parent BOM
        where the item appears as a component.
        """
        # Create parent FG item
        parent_id = self._create_test_item(api_client, "PARENT_FG", category="finished_good")
        # Create component item
        comp_id = self._create_test_item(api_client, "COMP_LINE")
        
        # Create BOM where comp_id is a component with its own routings
        bom_data = {
            "parent_item_id": parent_id,
            "name": f"{self.test_prefix}BOM_PARENT",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": comp_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": [
                        {"name": "Laser Cutting", "cost": 75.50},
                        {"name": "Powder Coating", "cost": 125.25}
                    ]
                }
            ],
            "parent_routings": []
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "COMP_LINE")
        
        # Create SC for the component with process_name matching component-line routing
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": comp_id, "quantity": 10, "charges": 0, "process_name": "Powder Coating"}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Pollute charges
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "reference_operation_seqs": [1],
                "job_work_parts.0.charges": 500.00  # Polluted
            }}
        )
        
        # GET should self-heal using component-line routing cost
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        # Charges should be 125.25 (Powder Coating from component-line routings)
        assert abs(order["job_work_parts"][0]["charges"] - 125.25) < 0.01, \
            f"Component-line routing cost not used! Expected 125.25, got {order['job_work_parts'][0]['charges']}"
        print(f"✓ Component-line routing cost used: {order['job_work_parts'][0]['charges']}")


class TestRegressionIteration108Tests:
    """Run the iteration 108 tests to ensure no regression"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_111_REG_{uuid.uuid4().hex[:6]}_"
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
    
    def test_routing_cost_endpoint_returns_specific_op_cost(self, api_client):
        """Regression: /api/bom/routing-cost returns specific op cost"""
        item_id = self._create_test_item(api_client, "ROUTING_EP")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_ROUTING_EP",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "LC Cutting", "cost": 500},
                {"name": "Bending", "cost": 200}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        # Test specific routing cost
        resp = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={"item_id": item_id, "process_name": "LC Cutting"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["cost"] == 500, f"Expected 500, got {data['cost']}"
        print(f"✓ /api/bom/routing-cost returns specific cost: {data['cost']}")
    
    def test_put_preserves_process_name_and_charges(self, api_client):
        """Regression: PUT preserves process_name and per-op charges"""
        item_id = self._create_test_item(api_client, "PUT_PRES")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_PUT_PRES",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Op_A", "cost": 100},
                {"name": "Op_B", "cost": 200}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        self.created_boms.append(bom_resp.json()["id"])
        
        sup_id = self._create_test_supplier(api_client, "PUT_PRES")
        
        # Create order with specific process_name
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {"item_id": item_id, "quantity": 10, "charges": 100, "process_name": "Op_A"}
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Mark as Job Card OS
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"reference_operation_seqs": [1], "subcontract_type": "without_material"}}
        )
        
        # PUT with bare data
        update_data = {
            "job_work_parts": [
                {"item_id": item_id, "quantity": 10, "charges": 0}
            ]
        }
        put_resp = api_client.put(f"{BASE_URL}/api/job-work/orders/{order_id}", json=update_data)
        assert put_resp.status_code == 200
        
        # Verify preservation
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        orders = list_resp.json()
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        assert order["job_work_parts"][0]["process_name"] == "Op_A", "process_name was wiped!"
        assert order["job_work_parts"][0]["charges"] == 100, "charges was changed!"
        print(f"✓ PUT preserves process_name={order['job_work_parts'][0]['process_name']}, charges={order['job_work_parts'][0]['charges']}")


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
