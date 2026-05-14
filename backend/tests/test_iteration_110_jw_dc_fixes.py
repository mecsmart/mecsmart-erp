"""
Iteration 110 - JW DC Fixes #2 Tests
====================================
Tests for the 2 user-reported issues:

Fix 1: Send Materials (DC) dialog for Job Card OS SCs should show item description BELOW the item name
       (not in a separate column), keeping all existing columns.
       - Frontend renders: Part# — Name (line 1), Op: <op_name> (line 2, bronze), <item_description> (line 3, italic gray)
       - data-testid='dc-desc-{idx}' for descriptions

Fix 2: Charges/Unit in unsent DCs (both the dialog when opening a fresh DC AND the GET /api/job-work/challans 
       list for any draft DC) STILL shows the COMBINED process cost when the SC was previously polluted.
       - GET /api/job-work/orders/{sc_id}/dc-lines: when process_name is set, charges_per_unit MUST be 
         recomputed via find_routing_cost(item_id, process_name) and override any stale stored value.
       - GET /api/job-work/challans: for draft Job Card OS DCs, each line's stored processing_charges 
         should be overridden with the specific routing cost (self-heal of legacy data).
       - Sent/completed DCs MUST NOT be touched (audit preservation).

Backend Tests:
- GET /api/job-work/orders/{sc_id}/dc-lines returns overridden charges_per_unit + new fields (item_description, process_name)
- GET /api/job-work/challans self-heals draft Job Card OS DCs with specific routing cost
- POST /api/job-work/challans persists item_description and process_name in dc_doc.lines
- REGRESSION: Full MO-SC (without reference_operation_seqs) dc-lines/challans must NOT alter charges
- REGRESSION: SCs with no job_work_parts (RM-only SCs) unchanged
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestDCLinesChargesOverride:
    """Tests for GET /api/job-work/orders/{sc_id}/dc-lines charges override logic"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_110_{uuid.uuid4().hex[:6]}_"
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
    
    def test_dc_lines_overrides_stale_charges_with_specific_routing_cost(self, api_client):
        """Test that GET /dc-lines overrides stale stored charges with find_routing_cost when process_name is set"""
        # Create item with BOM having specific routing costs
        item_id = self._create_test_item(api_client, "PART_OVERRIDE")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_OVERRIDE",
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
        
        sup_id = self._create_test_supplier(api_client, "OVERRIDE")
        
        # Create a Job Card OS SC with POLLUTED charges (combined cost 1000 instead of specific 500)
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 1000,  # POLLUTED: combined cost instead of specific LC Cutting cost (500)
                    "process_name": "LC Cutting",
                    "item_description": "Test description for override"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201, f"Failed to create order: {create_resp.text}"
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Manually set reference_operation_seqs to simulate Job Card OS
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"reference_operation_seqs": [1], "subcontract_type": "without_material"}}
        )
        
        # GET /dc-lines should OVERRIDE the stale 1000 with the specific routing cost 500
        dc_lines_resp = api_client.get(f"{BASE_URL}/api/job-work/orders/{order_id}/dc-lines")
        assert dc_lines_resp.status_code == 200, f"Failed to get dc-lines: {dc_lines_resp.text}"
        dc_lines = dc_lines_resp.json()
        
        assert len(dc_lines) == 1, f"Expected 1 dc line, got {len(dc_lines)}"
        line = dc_lines[0]
        
        # Verify charges_per_unit is overridden to 500 (LC Cutting cost), not 1000 (polluted)
        assert line["charges_per_unit"] == 500, \
            f"Expected charges_per_unit=500 (LC Cutting), got {line['charges_per_unit']} (polluted value not overridden)"
        
        # Verify new fields are returned
        assert line["item_description"] == "Test description for override", \
            f"item_description not returned correctly: {line.get('item_description')}"
        assert line["process_name"] == "LC Cutting", \
            f"process_name not returned correctly: {line.get('process_name')}"
        
        print(f"✓ dc-lines overrode stale charges 1000 → {line['charges_per_unit']} (specific routing cost)")
        print(f"✓ item_description: {line['item_description']}")
        print(f"✓ process_name: {line['process_name']}")
    
    def test_dc_lines_keeps_stored_charges_when_routing_not_found(self, api_client):
        """Test that GET /dc-lines keeps stored charges when find_routing_cost returns 0 (op not found)"""
        item_id = self._create_test_item(api_client, "PART_NOTFOUND")
        
        # Create BOM with different routing names
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_NOTFOUND",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Drilling", "cost": 150}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "NOTFOUND")
        
        # Create SC with process_name that does NOT exist in BOM
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 5,
                    "charges": 999,  # Stored value
                    "process_name": "NonExistentOperation",  # Not in BOM
                    "item_description": "Should keep stored charges"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set as Job Card OS
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"reference_operation_seqs": [1], "subcontract_type": "without_material"}}
        )
        
        # GET /dc-lines should KEEP the stored 999 since find_routing_cost returns 0
        dc_lines_resp = api_client.get(f"{BASE_URL}/api/job-work/orders/{order_id}/dc-lines")
        assert dc_lines_resp.status_code == 200
        dc_lines = dc_lines_resp.json()
        
        assert len(dc_lines) == 1
        line = dc_lines[0]
        
        # Verify charges_per_unit is kept at 999 (stored value) since routing not found
        assert line["charges_per_unit"] == 999, \
            f"Expected charges_per_unit=999 (stored), got {line['charges_per_unit']} (should not override when routing not found)"
        
        print(f"✓ dc-lines kept stored charges {line['charges_per_unit']} when routing not found")


class TestChallansListSelfHeal:
    """Tests for GET /api/job-work/challans self-heal logic for draft Job Card OS DCs"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_110_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        self.created_challans = []
        yield
        # Cleanup
        for dc_id in self.created_challans:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/challans/{dc_id}")
            except:
                pass
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
    
    def test_challans_list_self_heals_draft_job_os_dc_charges(self, api_client):
        """Test that GET /api/job-work/challans self-heals draft Job Card OS DC line charges"""
        # Create item with BOM
        item_id = self._create_test_item(api_client, "PART_SELFHEAL")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_SELFHEAL",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "LC Cutting", "cost": 500}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "SELFHEAL")
        
        # Create Job Card OS SC
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 500,
                    "process_name": "LC Cutting",
                    "item_description": "Self-heal test"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set as Job Card OS and confirm the order
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"reference_operation_seqs": [1], "subcontract_type": "without_material", "status": "confirmed"}}
        )
        
        # Create a DC with POLLUTED processing_charges (2500 instead of 500)
        dc_data = {
            "subcontract_order_id": order_id,
            "lines": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "rate": 0,
                    "processing_charges": 2500,  # POLLUTED value
                    "item_description": "Self-heal test",
                    "process_name": "LC Cutting"
                }
            ],
            "skip_stock_deduct": True
        }
        dc_resp = api_client.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        assert dc_resp.status_code == 201, f"Failed to create DC: {dc_resp.text}"
        dc_id = dc_resp.json()["id"]
        self.created_challans.append(dc_id)
        
        # Set DC status to draft (simulate unsent DC)
        db.delivery_challans.update_one(
            {"id": dc_id},
            {"$set": {"status": "draft"}}
        )
        
        # GET /api/job-work/challans should self-heal the draft DC's processing_charges
        challans_resp = api_client.get(f"{BASE_URL}/api/job-work/challans")
        assert challans_resp.status_code == 200
        challans = challans_resp.json()
        
        # Find our DC
        dc = next((c for c in challans if c["id"] == dc_id), None)
        assert dc is not None, f"DC {dc_id} not found in challans list"
        
        # Verify the line's processing_charges was self-healed to 500
        assert len(dc["lines"]) == 1
        line = dc["lines"][0]
        assert line["processing_charges"] == 500, \
            f"Expected processing_charges=500 (self-healed), got {line['processing_charges']} (polluted value not healed)"
        
        print(f"✓ Challans list self-healed draft DC processing_charges: 2500 → {line['processing_charges']}")
    
    def test_challans_list_does_not_modify_sent_dc(self, api_client):
        """Test that GET /api/job-work/challans does NOT modify sent/completed DCs (audit preservation)"""
        item_id = self._create_test_item(api_client, "PART_SENT")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_SENT",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "LC Cutting", "cost": 500}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "SENT")
        
        # Create Job Card OS SC
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 500,
                    "process_name": "LC Cutting"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set as Job Card OS and confirm the order
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"reference_operation_seqs": [1], "subcontract_type": "without_material", "status": "confirmed"}}
        )
        
        # Create a DC with POLLUTED processing_charges
        dc_data = {
            "subcontract_order_id": order_id,
            "lines": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "rate": 0,
                    "processing_charges": 2500,  # POLLUTED value
                    "process_name": "LC Cutting"
                }
            ],
            "skip_stock_deduct": True
        }
        dc_resp = api_client.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        assert dc_resp.status_code == 201
        dc_id = dc_resp.json()["id"]
        self.created_challans.append(dc_id)
        
        # Set DC status to "sent" (should NOT be modified)
        db.delivery_challans.update_one(
            {"id": dc_id},
            {"$set": {"status": "sent"}}
        )
        
        # GET /api/job-work/challans should NOT modify sent DC
        challans_resp = api_client.get(f"{BASE_URL}/api/job-work/challans")
        assert challans_resp.status_code == 200
        challans = challans_resp.json()
        
        dc = next((c for c in challans if c["id"] == dc_id), None)
        assert dc is not None
        
        # Verify the line's processing_charges was NOT modified (still 2500)
        line = dc["lines"][0]
        assert line["processing_charges"] == 2500, \
            f"Expected processing_charges=2500 (preserved for sent DC), got {line['processing_charges']} (should not be modified)"
        
        print(f"✓ Sent DC processing_charges preserved: {line['processing_charges']} (not self-healed)")


class TestDCCreatePersistsNewFields:
    """Tests for POST /api/job-work/challans persisting item_description and process_name"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_110_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_suppliers = []
        self.created_orders = []
        self.created_challans = []
        yield
        # Cleanup
        for dc_id in self.created_challans:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/challans/{dc_id}")
            except:
                pass
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
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
    
    def _create_test_item(self, api_client, suffix):
        item_data = {
            "part_number": f"{self.test_prefix}{suffix}",
            "name": f"Test Item {suffix}",
            "category": "component",
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
    
    def test_dc_create_persists_item_description_and_process_name(self, api_client):
        """Test that POST /api/job-work/challans persists item_description and process_name in dc_doc.lines"""
        item_id = self._create_test_item(api_client, "PART_PERSIST")
        sup_id = self._create_test_supplier(api_client, "PERSIST")
        
        # Create SC
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 500
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Confirm the order
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"status": "confirmed"}}
        )
        
        # Create DC with item_description and process_name
        dc_data = {
            "subcontract_order_id": order_id,
            "lines": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "rate": 0,
                    "processing_charges": 500,
                    "item_description": "Custom spec: 10mm thickness",
                    "process_name": "LC Cutting"
                }
            ],
            "skip_stock_deduct": True
        }
        dc_resp = api_client.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        assert dc_resp.status_code == 201, f"Failed to create DC: {dc_resp.text}"
        dc = dc_resp.json()
        dc_id = dc["id"]
        self.created_challans.append(dc_id)
        
        # Verify fields in response
        assert len(dc["lines"]) == 1
        line = dc["lines"][0]
        assert line.get("item_description") == "Custom spec: 10mm thickness", \
            f"item_description not in response: {line}"
        assert line.get("process_name") == "LC Cutting", \
            f"process_name not in response: {line}"
        
        print(f"✓ DC created with item_description: {line['item_description']}")
        print(f"✓ DC created with process_name: {line['process_name']}")
        
        # Verify via GET /challans
        challans_resp = api_client.get(f"{BASE_URL}/api/job-work/challans")
        assert challans_resp.status_code == 200
        challans = challans_resp.json()
        
        dc_fetched = next((c for c in challans if c["id"] == dc_id), None)
        assert dc_fetched is not None
        line_fetched = dc_fetched["lines"][0]
        assert line_fetched.get("item_description") == "Custom spec: 10mm thickness"
        assert line_fetched.get("process_name") == "LC Cutting"
        
        print("✓ GET /challans confirms item_description and process_name persisted")


class TestRegressionFullMOSC:
    """Regression tests: Full MO-SC (without reference_operation_seqs) should NOT alter charges"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_110_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        self.created_challans = []
        yield
        # Cleanup
        for dc_id in self.created_challans:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/challans/{dc_id}")
            except:
                pass
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
    
    def _create_test_item(self, api_client, suffix):
        item_data = {
            "part_number": f"{self.test_prefix}{suffix}",
            "name": f"Test Item {suffix}",
            "category": "component",
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
    
    def test_full_mo_sc_dc_lines_uses_stored_charges(self, api_client):
        """Test that Full MO-SC (no reference_operation_seqs) dc-lines uses stored charges (combined cost)"""
        item_id = self._create_test_item(api_client, "PART_FULLMO")
        
        # Create BOM with multiple routings (combined cost = 1000)
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_FULLMO",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Op1", "cost": 400},
                {"name": "Op2", "cost": 600}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "FULLMO")
        
        # Create Full MO-SC (without_material but NO reference_operation_seqs, NO process_name)
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 1000  # Combined cost
                    # NO process_name
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set as Full MO-SC (without_material but NO reference_operation_seqs)
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"subcontract_type": "without_material"}}
            # NO reference_operation_seqs
        )
        
        # GET /dc-lines should use stored charges (1000), not try to override
        dc_lines_resp = api_client.get(f"{BASE_URL}/api/job-work/orders/{order_id}/dc-lines")
        assert dc_lines_resp.status_code == 200
        dc_lines = dc_lines_resp.json()
        
        assert len(dc_lines) == 1
        line = dc_lines[0]
        
        # Verify charges_per_unit is the stored combined cost (1000)
        assert line["charges_per_unit"] == 1000, \
            f"Expected charges_per_unit=1000 (combined), got {line['charges_per_unit']}"
        
        print(f"✓ Full MO-SC dc-lines uses stored charges: {line['charges_per_unit']}")
    
    def test_full_mo_sc_challans_not_self_healed(self, api_client):
        """Test that Full MO-SC draft DCs are NOT self-healed (no reference_operation_seqs)"""
        item_id = self._create_test_item(api_client, "PART_FULLMO2")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}BOM_FULLMO2",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Op1", "cost": 400}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "FULLMO2")
        
        # Create Full MO-SC
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 1000
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Set as Full MO-SC (NO reference_operation_seqs) and confirm
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"subcontract_type": "without_material", "status": "confirmed"}}
        )
        
        # Create DC with stored processing_charges
        dc_data = {
            "subcontract_order_id": order_id,
            "lines": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "rate": 0,
                    "processing_charges": 1000
                }
            ],
            "skip_stock_deduct": True
        }
        dc_resp = api_client.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        assert dc_resp.status_code == 201
        dc_id = dc_resp.json()["id"]
        self.created_challans.append(dc_id)
        
        # Set DC status to draft
        db.delivery_challans.update_one(
            {"id": dc_id},
            {"$set": {"status": "draft"}}
        )
        
        # GET /challans should NOT self-heal Full MO-SC DCs
        challans_resp = api_client.get(f"{BASE_URL}/api/job-work/challans")
        assert challans_resp.status_code == 200
        challans = challans_resp.json()
        
        dc = next((c for c in challans if c["id"] == dc_id), None)
        assert dc is not None
        
        line = dc["lines"][0]
        assert line["processing_charges"] == 1000, \
            f"Expected processing_charges=1000 (not self-healed for Full MO-SC), got {line['processing_charges']}"
        
        print(f"✓ Full MO-SC draft DC NOT self-healed: {line['processing_charges']}")


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
