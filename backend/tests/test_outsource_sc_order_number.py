"""
Test iteration 51 features:
1. Backend: PUT /api/work-orders/{wo_id}/operations/{seq} with outsource returns outsource_sc_order_number
2. Backend: New SC creation when no prior open Job OS SC exists
3. Backend: Consolidation - existing SC's order_number is set on new op
"""

import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestOutsourceSCOrderNumber:
    """
    Test that outsource_sc_order_number is correctly set on operations when outsourcing.
    This field should contain the JW-XXXXXX number of the SC order.
    """
    
    session = None
    test_items = {}
    test_supplier = None
    test_routing = None
    test_bom = None
    test_po = None
    test_wo = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if TestOutsourceSCOrderNumber.session is None:
            TestOutsourceSCOrderNumber.session = requests.Session()
    
    def test_01_login(self):
        """Login as admin"""
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        print("Login successful")
    
    def test_02_create_test_items(self):
        """Create test items"""
        ts = int(time.time())
        
        # Create FG item
        fg_data = {
            "part_number": f"TEST_SC_NUM_FG_{ts}",
            "name": "Test SC Number FG",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0,
            "current_stock": 0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert resp.status_code == 201, f"Failed to create FG item: {resp.text}"
        TestOutsourceSCOrderNumber.test_items['fg'] = resp.json()
        print(f"Created FG item: {self.test_items['fg']['part_number']}")
    
    def test_03_create_supplier(self):
        """Create test supplier"""
        ts = int(time.time())
        supplier_data = {
            "code": f"TEST_SC_NUM_SUP_{ts}",
            "name": "Test SC Number Supplier",
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert resp.status_code == 201, f"Failed to create supplier: {resp.text}"
        TestOutsourceSCOrderNumber.test_supplier = resp.json()
        print(f"Created supplier: {self.test_supplier['code']}")
    
    def test_04_create_routing(self):
        """Create routing"""
        ts = int(time.time())
        routing_data = {
            "name": f"TEST_SC_NUM_ROUTING_{ts}",
            "description": "Test routing for SC number test",
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing_data)
        assert resp.status_code == 201, f"Failed to create routing: {resp.text}"
        TestOutsourceSCOrderNumber.test_routing = resp.json()
        print(f"Created routing: {self.test_routing['name']}")
    
    def test_05_create_bom(self):
        """Create BOM with parent_routings"""
        ts = int(time.time())
        bom_data = {
            "parent_item_id": self.test_items['fg']['id'],
            "name": f"TEST_SC_NUM_BOM_{ts}",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [self.test_routing['name']]  # This creates operations on the MO
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert resp.status_code in [200, 201], f"Failed to create BOM: {resp.text}"
        TestOutsourceSCOrderNumber.test_bom = resp.json()
        print(f"Created BOM: {self.test_bom['name']}")
    
    def test_06_create_production_order(self):
        """Create and confirm production order"""
        po_data = {
            "bom_id": self.test_bom['id'],
            "quantity": 10,
            "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "priority": "medium"
        }
        resp = self.session.post(f"{BASE_URL}/api/production", json=po_data)
        assert resp.status_code in [200, 201], f"Failed to create PO: {resp.text}"
        po = resp.json()
        
        # Confirm PO
        resp = self.session.post(f"{BASE_URL}/api/production/{po['id']}/confirm")
        assert resp.status_code == 200, f"Failed to confirm PO: {resp.text}"
        TestOutsourceSCOrderNumber.test_po = resp.json()
        print(f"Created and confirmed PO: {self.test_po['order_number']}")
    
    def test_07_create_work_order(self):
        """Create work order from production order"""
        wo_data = {
            "production_order_id": self.test_po['id'],
            "routing_id": self.test_routing['id'],
            "quantity": 10
        }
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data)
        assert resp.status_code in [200, 201], f"Failed to create WO: {resp.text}"
        data = resp.json()
        
        # Handle response format
        wos = data.get('work_orders', [data]) if 'work_orders' in data else [data]
        assert len(wos) > 0, f"No work orders created: {data}"
        TestOutsourceSCOrderNumber.test_wo = wos[0]
        
        # Verify operations exist
        ops = self.test_wo.get('operations_status', [])
        assert len(ops) > 0, f"WO has no operations: {self.test_wo}"
        print(f"Created WO: {self.test_wo.get('wo_number')} with {len(ops)} operations")
    
    def test_08_start_work_order(self):
        """Start the work order"""
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/start")
        assert resp.status_code == 200, f"Failed to start WO: {resp.text}"
        
        # Fetch the WO again to get updated state with operations
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}")
        assert resp.status_code == 200, f"Failed to get WO: {resp.text}"
        TestOutsourceSCOrderNumber.test_wo = resp.json()
        
        assert self.test_wo.get('status') == 'in_progress', "WO should be in_progress"
        print(f"Started WO: {self.test_wo.get('wo_number')}")
    
    def test_09_outsource_operation_creates_sc_with_order_number(self):
        """
        CRITICAL TEST: Outsource operation and verify outsource_sc_order_number is set.
        This is the main feature being tested in iteration 51.
        """
        ops = self.test_wo.get('operations_status', [])
        assert len(ops) > 0, "No operations to outsource"
        
        first_op_seq = ops[0]['sequence']
        
        # Outsource the first operation
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.test_supplier['id'],
            "outsource_charges": 150
        }
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/operations/{first_op_seq}",
            json=outsource_data
        )
        assert resp.status_code == 200, f"Outsource failed: {resp.text}"
        
        updated_wo = resp.json()
        TestOutsourceSCOrderNumber.test_wo = updated_wo
        
        # Find the outsourced operation
        outsourced_op = None
        for op in updated_wo.get('operations_status', []):
            if op.get('sequence') == first_op_seq:
                outsourced_op = op
                break
        
        assert outsourced_op is not None, f"Operation {first_op_seq} not found in response"
        
        # CRITICAL ASSERTIONS
        assert outsourced_op.get('is_job_work') == True, "Operation should be marked as job work"
        assert outsourced_op.get('status') == 'in_progress', "Operation status should be in_progress"
        
        # THE KEY TEST: outsource_sc_order_number should be set
        sc_order_number = outsourced_op.get('outsource_sc_order_number')
        assert sc_order_number is not None, "outsource_sc_order_number should be set on the operation"
        assert sc_order_number != "", "outsource_sc_order_number should not be empty"
        assert sc_order_number.startswith("JW-"), f"SC order number should start with JW-, got: {sc_order_number}"
        
        print(f"SUCCESS: Operation {first_op_seq} outsourced with SC order number: {sc_order_number}")
        
        # Store for later tests
        TestOutsourceSCOrderNumber.first_sc_order_number = sc_order_number
    
    def test_10_verify_sc_order_number_persisted_in_db(self):
        """Verify outsource_sc_order_number is persisted when fetching WO again"""
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}")
        assert resp.status_code == 200, f"Failed to get WO: {resp.text}"
        
        wo_from_db = resp.json()
        ops = wo_from_db.get('operations_status', [])
        
        # Find the outsourced operation
        outsourced_op = None
        for op in ops:
            if op.get('is_job_work') == True:
                outsourced_op = op
                break
        
        assert outsourced_op is not None, "Outsourced operation not found in DB"
        
        persisted_sc_number = outsourced_op.get('outsource_sc_order_number')
        assert persisted_sc_number == self.first_sc_order_number, \
            f"Persistence failed: DB has {persisted_sc_number}, expected {self.first_sc_order_number}"
        
        print(f"SUCCESS: outsource_sc_order_number {persisted_sc_number} persisted in DB")
    
    def test_11_verify_sc_order_exists_in_subcontract_orders(self):
        """Verify the SC order was actually created in subcontract_orders collection"""
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200, f"Failed to get SC orders: {resp.text}"
        
        sc_orders = resp.json()
        found_sc = None
        for sc in sc_orders:
            if sc.get('order_number') == self.first_sc_order_number:
                found_sc = sc
                break
        
        assert found_sc is not None, f"SC order {self.first_sc_order_number} not found in subcontract_orders"
        assert found_sc.get('subcontract_type') == 'without_material', "SC should be without_material type"
        assert found_sc.get('dc_created') == False, "DC should not be created yet"
        
        print(f"SUCCESS: SC order {self.first_sc_order_number} verified in database")


class TestConsolidationSetsExistingSCOrderNumber:
    """
    Test that when consolidating into an existing SC, the new operation gets
    the EXISTING SC's order_number (not a new one).
    """
    
    session = None
    test_items = {}
    test_supplier = None
    test_routing = None
    test_bom = None
    test_po1 = None
    test_po2 = None
    test_wo1 = None
    test_wo2 = None
    first_sc_order_number = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if TestConsolidationSetsExistingSCOrderNumber.session is None:
            TestConsolidationSetsExistingSCOrderNumber.session = requests.Session()
    
    def test_01_login(self):
        """Login as admin"""
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        print("Login successful")
    
    def test_02_create_test_data(self):
        """Create items, supplier, routing, BOM"""
        ts = int(time.time())
        
        # FG item
        fg_data = {
            "part_number": f"TEST_CONSOL_SC_FG_{ts}",
            "name": "Test Consolidation SC FG",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert resp.status_code == 201, f"Failed to create FG: {resp.text}"
        TestConsolidationSetsExistingSCOrderNumber.test_items['fg'] = resp.json()
        
        # Supplier
        supplier_data = {
            "code": f"TEST_CONSOL_SC_SUP_{ts}",
            "name": "Test Consolidation SC Supplier",
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert resp.status_code == 201, f"Failed to create supplier: {resp.text}"
        TestConsolidationSetsExistingSCOrderNumber.test_supplier = resp.json()
        
        # Routing
        routing_data = {
            "name": f"TEST_CONSOL_SC_ROUTING_{ts}",
            "description": "Test routing",
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing_data)
        assert resp.status_code == 201, f"Failed to create routing: {resp.text}"
        TestConsolidationSetsExistingSCOrderNumber.test_routing = resp.json()
        
        # BOM
        bom_data = {
            "parent_item_id": self.test_items['fg']['id'],
            "name": f"TEST_CONSOL_SC_BOM_{ts}",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [self.test_routing['name']]
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert resp.status_code in [200, 201], f"Failed to create BOM: {resp.text}"
        TestConsolidationSetsExistingSCOrderNumber.test_bom = resp.json()
        
        print("Created test data")
    
    def test_03_create_two_production_orders(self):
        """Create 2 production orders"""
        # PO 1
        po_data = {
            "bom_id": self.test_bom['id'],
            "quantity": 5,
            "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "priority": "medium"
        }
        resp = self.session.post(f"{BASE_URL}/api/production", json=po_data)
        assert resp.status_code in [200, 201], f"Failed to create PO1: {resp.text}"
        po1 = resp.json()
        resp = self.session.post(f"{BASE_URL}/api/production/{po1['id']}/confirm")
        assert resp.status_code == 200
        TestConsolidationSetsExistingSCOrderNumber.test_po1 = resp.json()
        
        # PO 2
        po_data2 = {
            "bom_id": self.test_bom['id'],
            "quantity": 3,
            "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "priority": "medium"
        }
        resp = self.session.post(f"{BASE_URL}/api/production", json=po_data2)
        assert resp.status_code in [200, 201], f"Failed to create PO2: {resp.text}"
        po2 = resp.json()
        resp = self.session.post(f"{BASE_URL}/api/production/{po2['id']}/confirm")
        assert resp.status_code == 200
        TestConsolidationSetsExistingSCOrderNumber.test_po2 = resp.json()
        
        print(f"Created POs: {self.test_po1['order_number']}, {self.test_po2['order_number']}")
    
    def test_04_create_two_work_orders(self):
        """Create 2 work orders"""
        # WO 1
        wo_data = {
            "production_order_id": self.test_po1['id'],
            "routing_id": self.test_routing['id'],
            "quantity": 5
        }
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data)
        assert resp.status_code in [200, 201], f"Failed to create WO1: {resp.text}"
        data = resp.json()
        wos = data.get('work_orders', [data]) if 'work_orders' in data else [data]
        TestConsolidationSetsExistingSCOrderNumber.test_wo1 = wos[0]
        
        # WO 2
        wo_data2 = {
            "production_order_id": self.test_po2['id'],
            "routing_id": self.test_routing['id'],
            "quantity": 3
        }
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data2)
        assert resp.status_code in [200, 201], f"Failed to create WO2: {resp.text}"
        data2 = resp.json()
        wos2 = data2.get('work_orders', [data2]) if 'work_orders' in data2 else [data2]
        TestConsolidationSetsExistingSCOrderNumber.test_wo2 = wos2[0]
        
        print(f"Created WOs: {self.test_wo1.get('wo_number')}, {self.test_wo2.get('wo_number')}")
    
    def test_05_start_both_work_orders(self):
        """Start both work orders"""
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{self.test_wo1['id']}/start")
        assert resp.status_code == 200, f"Failed to start WO1: {resp.text}"
        # Fetch updated WO
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.test_wo1['id']}")
        assert resp.status_code == 200
        TestConsolidationSetsExistingSCOrderNumber.test_wo1 = resp.json()
        
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{self.test_wo2['id']}/start")
        assert resp.status_code == 200, f"Failed to start WO2: {resp.text}"
        # Fetch updated WO
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.test_wo2['id']}")
        assert resp.status_code == 200
        TestConsolidationSetsExistingSCOrderNumber.test_wo2 = resp.json()
        
        print("Started both WOs")
    
    def test_06_first_outsource_creates_new_sc(self):
        """First outsource creates a new SC"""
        ops = self.test_wo1.get('operations_status', [])
        first_op_seq = ops[0]['sequence']
        
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.test_supplier['id'],
            "outsource_charges": 100
        }
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{self.test_wo1['id']}/operations/{first_op_seq}",
            json=outsource_data
        )
        assert resp.status_code == 200, f"First outsource failed: {resp.text}"
        
        updated_wo = resp.json()
        TestConsolidationSetsExistingSCOrderNumber.test_wo1 = updated_wo
        
        # Get the SC order number
        for op in updated_wo.get('operations_status', []):
            if op.get('sequence') == first_op_seq:
                TestConsolidationSetsExistingSCOrderNumber.first_sc_order_number = op.get('outsource_sc_order_number')
                break
        
        assert self.first_sc_order_number is not None, "First outsource should have SC order number"
        assert self.first_sc_order_number.startswith("JW-"), f"Invalid SC order number: {self.first_sc_order_number}"
        
        print(f"First outsource created SC: {self.first_sc_order_number}")
    
    def test_07_second_outsource_consolidates_with_same_sc_number(self):
        """
        CRITICAL TEST: Second outsource to same supplier should consolidate
        and get the SAME SC order number.
        """
        ops = self.test_wo2.get('operations_status', [])
        first_op_seq = ops[0]['sequence']
        
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.test_supplier['id'],
            "outsource_charges": 75
        }
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{self.test_wo2['id']}/operations/{first_op_seq}",
            json=outsource_data
        )
        assert resp.status_code == 200, f"Second outsource failed: {resp.text}"
        
        updated_wo = resp.json()
        
        # Get the SC order number from second outsource
        second_sc_order_number = None
        for op in updated_wo.get('operations_status', []):
            if op.get('sequence') == first_op_seq:
                second_sc_order_number = op.get('outsource_sc_order_number')
                break
        
        assert second_sc_order_number is not None, "Second outsource should have SC order number"
        
        # CRITICAL: Both should have the SAME SC order number (consolidation)
        assert second_sc_order_number == self.first_sc_order_number, \
            f"Consolidation failed: second op has {second_sc_order_number}, expected {self.first_sc_order_number}"
        
        print(f"SUCCESS: Consolidation verified - both ops have SC: {self.first_sc_order_number}")


class TestNonOutsourcedOperationFlow:
    """
    Regression test: Non-outsourced operations can still be started/stopped/completed normally.
    """
    
    session = None
    test_items = {}
    test_routing = None
    test_bom = None
    test_po = None
    test_wo = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if TestNonOutsourcedOperationFlow.session is None:
            TestNonOutsourcedOperationFlow.session = requests.Session()
    
    def test_01_login(self):
        """Login as admin"""
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
    
    def test_02_create_test_data(self):
        """Create test data"""
        ts = int(time.time())
        
        # FG item
        fg_data = {
            "part_number": f"TEST_NORMAL_OP_FG_{ts}",
            "name": "Test Normal Op FG",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert resp.status_code == 201
        TestNonOutsourcedOperationFlow.test_items['fg'] = resp.json()
        
        # Routing
        routing_data = {
            "name": f"TEST_NORMAL_OP_ROUTING_{ts}",
            "description": "Test routing",
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing_data)
        assert resp.status_code == 201
        TestNonOutsourcedOperationFlow.test_routing = resp.json()
        
        # BOM
        bom_data = {
            "parent_item_id": self.test_items['fg']['id'],
            "name": f"TEST_NORMAL_OP_BOM_{ts}",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [self.test_routing['name']]
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert resp.status_code in [200, 201]
        TestNonOutsourcedOperationFlow.test_bom = resp.json()
    
    def test_03_create_production_and_work_order(self):
        """Create PO and WO"""
        po_data = {
            "bom_id": self.test_bom['id'],
            "quantity": 10,
            "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "priority": "medium"
        }
        resp = self.session.post(f"{BASE_URL}/api/production", json=po_data)
        assert resp.status_code in [200, 201]
        po = resp.json()
        resp = self.session.post(f"{BASE_URL}/api/production/{po['id']}/confirm")
        assert resp.status_code == 200
        TestNonOutsourcedOperationFlow.test_po = resp.json()
        
        wo_data = {
            "production_order_id": self.test_po['id'],
            "routing_id": self.test_routing['id'],
            "quantity": 10
        }
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data)
        assert resp.status_code in [200, 201]
        data = resp.json()
        wos = data.get('work_orders', [data]) if 'work_orders' in data else [data]
        TestNonOutsourcedOperationFlow.test_wo = wos[0]
    
    def test_04_start_work_order(self):
        """Start WO"""
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/start")
        assert resp.status_code == 200
        # Fetch updated WO
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}")
        assert resp.status_code == 200
        TestNonOutsourcedOperationFlow.test_wo = resp.json()
    
    def test_05_start_operation_normally(self):
        """Start operation without outsourcing"""
        ops = self.test_wo.get('operations_status', [])
        first_op_seq = ops[0]['sequence']
        
        start_data = {
            "status": "in_progress",
            "operator": "Test Operator",
            "quantity_completed": 5
        }
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/operations/{first_op_seq}",
            json=start_data
        )
        assert resp.status_code == 200, f"Start operation failed: {resp.text}"
        
        updated_wo = resp.json()
        TestNonOutsourcedOperationFlow.test_wo = updated_wo
        
        # Verify operation is in_progress and NOT job_work
        for op in updated_wo.get('operations_status', []):
            if op.get('sequence') == first_op_seq:
                assert op.get('status') == 'in_progress', "Operation should be in_progress"
                assert op.get('is_job_work') != True, "Non-outsourced op should not be job_work"
                break
        
        print("SUCCESS: Operation started normally (not outsourced)")
    
    def test_06_stop_operation(self):
        """Stop the operation"""
        ops = self.test_wo.get('operations_status', [])
        first_op_seq = ops[0]['sequence']
        
        stop_data = {
            "status": "stopped",
            "quantity_completed": 5
        }
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/operations/{first_op_seq}",
            json=stop_data
        )
        assert resp.status_code == 200, f"Stop operation failed: {resp.text}"
        
        updated_wo = resp.json()
        TestNonOutsourcedOperationFlow.test_wo = updated_wo
        
        for op in updated_wo.get('operations_status', []):
            if op.get('sequence') == first_op_seq:
                assert op.get('status') == 'stopped', "Operation should be stopped"
                break
        
        print("SUCCESS: Operation stopped")
    
    def test_07_complete_operation(self):
        """Complete the operation"""
        ops = self.test_wo.get('operations_status', [])
        first_op_seq = ops[0]['sequence']
        
        complete_data = {
            "status": "completed",
            "quantity_completed": 10,
            "quality_result": "pass"
        }
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/operations/{first_op_seq}",
            json=complete_data
        )
        assert resp.status_code == 200, f"Complete operation failed: {resp.text}"
        
        updated_wo = resp.json()
        
        for op in updated_wo.get('operations_status', []):
            if op.get('sequence') == first_op_seq:
                assert op.get('status') == 'completed', "Operation should be completed"
                break
        
        print("SUCCESS: Non-outsourced operation start/stop/complete works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
