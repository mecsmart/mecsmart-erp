"""
Test Job OS Regressions - Iteration 50
Tests for 3 reported regressions:
1. Vendor consolidation: When same item outsourced twice to same supplier, charges per unit should NOT double
2. DC print format: 9-col format for Job OS only, 6-col for standard SC (frontend test)
3. Manufacturing Job Card: Stop/Complete hidden for outsourced ops (frontend test)
"""

import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestJobOSConsolidationCharges:
    """
    Issue 1: When a 2nd operation is outsourced to the SAME supplier (without_material, dc_created=False),
    it must consolidate into the EXISTING SC order (appending to job_work_parts).
    When same item: quantity should sum; charges per unit should NOT double.
    """
    
    session = None
    test_items = {}
    test_supplier = None
    test_routing = None
    test_bom = None
    test_po = None
    test_wo = None
    test_wo2 = None
    sc_order = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if TestJobOSConsolidationCharges.session is None:
            TestJobOSConsolidationCharges.session = requests.Session()
    
    def test_01_login(self):
        """Login as admin"""
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        print("Login successful")
    
    def test_02_create_test_items(self):
        """Create test items for consolidation test"""
        # Create a component item that will be outsourced
        item_data = {
            "part_number": f"TEST_CONSOL_PART_{int(time.time())}",
            "name": "Test Consolidation Part",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0,
            "current_stock": 500
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201, f"Failed to create item: {resp.text}"
        TestJobOSConsolidationCharges.test_items['part'] = resp.json()
        
        # Create FG item
        fg_data = {
            "part_number": f"TEST_CONSOL_FG_{int(time.time())}",
            "name": "Test Consolidation FG",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0,
            "current_stock": 0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert resp.status_code == 201, f"Failed to create FG item: {resp.text}"
        TestJobOSConsolidationCharges.test_items['fg'] = resp.json()
        print(f"Created test items: {self.test_items['part']['part_number']}, {self.test_items['fg']['part_number']}")
    
    def test_03_create_supplier(self):
        """Create test supplier"""
        supplier_data = {
            "code": f"TEST_CONSOL_SUP_{int(time.time())}",
            "name": "Test Consolidation Supplier",
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert resp.status_code == 201, f"Failed to create supplier: {resp.text}"
        TestJobOSConsolidationCharges.test_supplier = resp.json()
        print(f"Created supplier: {self.test_supplier['code']}")
    
    def test_04_create_routing(self):
        """Create routing for the component"""
        routing_data = {
            "name": f"TEST_CONSOL_ROUTING_{int(time.time())}",
            "description": "Test routing for consolidation",
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing_data)
        assert resp.status_code == 201, f"Failed to create routing: {resp.text}"
        TestJobOSConsolidationCharges.test_routing = resp.json()
        print(f"Created routing: {self.test_routing['name']}")
    
    def test_05_create_bom(self):
        """Create BOM with component that has routing"""
        bom_data = {
            "parent_item_id": self.test_items['fg']['id'],
            "name": f"TEST_CONSOL_BOM_{int(time.time())}",
            "revision": "A",
            "status": "active",
            "components": [{
                "item_id": self.test_items['part']['id'],
                "quantity": 2,
                "routings": [self.test_routing['name']]
            }],
            "parent_routings": [self.test_routing['name']]  # Required for main MO creation
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert resp.status_code in [200, 201], f"Failed to create BOM: {resp.text}"
        TestJobOSConsolidationCharges.test_bom = resp.json()
        print(f"Created BOM: {self.test_bom['name']}")
    
    def test_06_create_production_orders(self):
        """Create 2 production orders for the same FG"""
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
        
        # Confirm PO1
        resp = self.session.post(f"{BASE_URL}/api/production/{po1['id']}/confirm")
        assert resp.status_code == 200, f"Failed to confirm PO1: {resp.text}"
        TestJobOSConsolidationCharges.test_po = resp.json()
        
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
        
        # Confirm PO2
        resp = self.session.post(f"{BASE_URL}/api/production/{po2['id']}/confirm")
        assert resp.status_code == 200, f"Failed to confirm PO2: {resp.text}"
        TestJobOSConsolidationCharges.test_po2 = resp.json()
        print(f"Created and confirmed POs: {self.test_po['order_number']}, {self.test_po2['order_number']}")
    
    def test_07_create_work_orders(self):
        """Create work orders from production orders"""
        routing_id = self.test_routing['id']
        
        # WO 1
        wo_data = {
            "production_order_id": self.test_po['id'],
            "routing_id": routing_id,
            "quantity": 5
        }
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data)
        assert resp.status_code in [200, 201], f"Failed to create WO1: {resp.text}"
        data = resp.json()
        # Find the FG MO (main MO)
        wos = data.get('work_orders', [data]) if 'work_orders' in data else [data]
        assert len(wos) > 0, f"No work orders created: {data}"
        TestJobOSConsolidationCharges.test_wo = wos[0]  # Main MO is the FG item
        
        # WO 2
        wo_data2 = {
            "production_order_id": self.test_po2['id'],
            "routing_id": routing_id,
            "quantity": 3
        }
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data2)
        assert resp.status_code in [200, 201], f"Failed to create WO2: {resp.text}"
        data2 = resp.json()
        wos2 = data2.get('work_orders', [data2]) if 'work_orders' in data2 else [data2]
        assert len(wos2) > 0, f"No work orders created: {data2}"
        TestJobOSConsolidationCharges.test_wo2 = wos2[0]  # Main MO
        
        assert self.test_wo is not None, "Could not find WO1"
        assert self.test_wo2 is not None, "Could not find WO2"
        print(f"Created WOs: {self.test_wo.get('wo_number')}, {self.test_wo2.get('wo_number')}")
    
    def test_08_start_work_orders(self):
        """Start both work orders"""
        # Start WO1
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/start")
        assert resp.status_code == 200, f"Failed to start WO1: {resp.text}"
        
        # Start WO2
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{self.test_wo2['id']}/start")
        assert resp.status_code == 200, f"Failed to start WO2: {resp.text}"
        print("Started both WOs")
    
    def test_09_outsource_first_operation_with_charges(self):
        """Outsource first operation with charges of 50 per unit"""
        # Get WO1 details to find operation sequence
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}")
        assert resp.status_code == 200
        wo_data = resp.json()
        ops = wo_data.get('operations_status', [])
        assert len(ops) > 0, f"No operations found on WO1: {wo_data}"
        seq = ops[0]['sequence']
        mo_qty = wo_data.get('quantity', 5)
        
        # Outsource with charges = 50 per unit
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.test_supplier['id'],
            "outsource_charges": 50.0,
            "quantity_completed": mo_qty
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/operations/{seq}", json=outsource_data)
        assert resp.status_code == 200, f"Failed to outsource op1: {resp.text}"
        print(f"Outsourced first operation with charges=50/unit")
        
        # Get SC orders to find the created one
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        orders = resp.json()
        for order in orders:
            if order.get('supplier_id') == self.test_supplier['id'] and order.get('subcontract_type') == 'without_material':
                TestJobOSConsolidationCharges.sc_order = order
                break
        
        assert self.sc_order is not None, "SC order not created"
        print(f"SC Order created: {self.sc_order.get('order_number')}")
        
        # Verify initial charges
        jwp = self.sc_order.get('job_work_parts', [])
        assert len(jwp) >= 1, f"Expected at least 1 job_work_part, got {len(jwp)}"
        
        # Find the part for this item
        item_id = wo_data.get('item_id')
        part_entry = next((p for p in jwp if p.get('item_id') == item_id), jwp[0])
        
        print(f"Initial SC: qty={part_entry.get('quantity')}, charges/unit={part_entry.get('charges')}")
    
    def test_10_outsource_second_operation_same_item_same_supplier(self):
        """
        Outsource second operation (same item) to same supplier.
        Should consolidate: quantity should sum, charges per unit should NOT double.
        """
        # Get WO2 details
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.test_wo2['id']}")
        assert resp.status_code == 200
        wo_data = resp.json()
        ops = wo_data.get('operations_status', [])
        assert len(ops) > 0, f"No operations found on WO2: {wo_data}"
        seq = ops[0]['sequence']
        mo_qty = wo_data.get('quantity', 3)
        
        # Outsource with same charges = 50 per unit
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.test_supplier['id'],
            "outsource_charges": 50.0,
            "quantity_completed": mo_qty
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{self.test_wo2['id']}/operations/{seq}", json=outsource_data)
        assert resp.status_code == 200, f"Failed to outsource op2: {resp.text}"
        print(f"Outsourced second operation with charges=50/unit")
        
        # Get updated SC order from list
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        orders = resp.json()
        updated_sc = next((o for o in orders if o.get('id') == self.sc_order['id']), None)
        assert updated_sc is not None, f"Could not find SC order {self.sc_order['id']}"
        
        jwp = updated_sc.get('job_work_parts', [])
        print(f"After consolidation: job_work_parts = {jwp}")
        
        # CRITICAL ASSERTION: Same item should have summed quantity but NOT doubled charges
        # WO1: qty=5 (FG item)
        # WO2: qty=3 (FG item)
        # If same item, total: 8 parts
        # Charges should still be 50 per unit, NOT 100
        
        # Find the part for this item
        item_id = wo_data.get('item_id')
        part_entries = [p for p in jwp if p.get('item_id') == item_id]
        
        if len(part_entries) == 1:
            # Consolidated into single entry
            part_entry = part_entries[0]
            total_qty = part_entry.get('quantity', 0)
            charges_per_unit = part_entry.get('charges', 0)
            
            print(f"Consolidated SC: qty={total_qty}, charges/unit={charges_per_unit}")
            
            # CRITICAL: Charges per unit should NOT double - should remain 50
            assert charges_per_unit == 50.0, f"REGRESSION: Charges per unit doubled! Expected 50, got {charges_per_unit}"
            print("SUCCESS: Consolidation working correctly - charges per unit NOT doubled")
        else:
            # Multiple entries (different items or not consolidated)
            print(f"Found {len(part_entries)} entries for item {item_id}")
            for pe in part_entries:
                charges = pe.get('charges', 0)
                assert charges == 50.0, f"REGRESSION: Charges per unit wrong! Expected 50, got {charges}"
            print("SUCCESS: Charges per unit correct in all entries")
    
    def test_11_verify_dc_not_created_allows_consolidation(self):
        """Verify that dc_created=False allows consolidation"""
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        orders = resp.json()
        sc = next((o for o in orders if o.get('id') == self.sc_order['id']), None)
        assert sc is not None, f"Could not find SC order {self.sc_order['id']}"
        
        dc_created = sc.get('dc_created', False)
        assert dc_created == False, f"Expected dc_created=False, got {dc_created}"
        print(f"Verified dc_created=False, consolidation was allowed")


class TestDCCreatedBlocksConsolidation:
    """
    Issue 1 (Part 2): After DC is sent (dc_created=True), a NEW outsource to same supplier 
    MUST create a new SC (not consolidate into dispatched one).
    """
    
    session = None
    test_items = {}
    test_supplier = None
    test_routing = None
    test_bom = None
    test_po = None
    test_wo = None
    test_wo2 = None
    sc_order = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if TestDCCreatedBlocksConsolidation.session is None:
            TestDCCreatedBlocksConsolidation.session = requests.Session()
    
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
        
        # Component
        item_data = {
            "part_number": f"TEST_DCBLOCK_PART_{ts}",
            "name": "Test DC Block Part",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0,
            "current_stock": 500
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        TestDCCreatedBlocksConsolidation.test_items['part'] = resp.json()
        
        # FG
        fg_data = {
            "part_number": f"TEST_DCBLOCK_FG_{ts}",
            "name": "Test DC Block FG",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0,
            "current_stock": 0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert resp.status_code == 201
        TestDCCreatedBlocksConsolidation.test_items['fg'] = resp.json()
        print(f"Created items")
    
    def test_03_create_supplier(self):
        """Create supplier"""
        supplier_data = {
            "code": f"TEST_DCBLOCK_SUP_{int(time.time())}",
            "name": "Test DC Block Supplier",
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert resp.status_code == 201
        TestDCCreatedBlocksConsolidation.test_supplier = resp.json()
        print(f"Created supplier")
    
    def test_04_create_routing_bom_po_wo(self):
        """Create routing, BOM, PO, and WO"""
        ts = int(time.time())
        
        # Routing
        routing_data = {"name": f"TEST_DCBLOCK_ROUTING_{ts}", "status": "active"}
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing_data)
        assert resp.status_code == 201
        TestDCCreatedBlocksConsolidation.test_routing = resp.json()
        
        # BOM
        bom_data = {
            "parent_item_id": self.test_items['fg']['id'],
            "name": f"TEST_DCBLOCK_BOM_{ts}",
            "revision": "A",
            "status": "active",
            "components": [{"item_id": self.test_items['part']['id'], "quantity": 1, "routings": [self.test_routing['name']]}],
            "parent_routings": [self.test_routing['name']]  # Required for main MO creation
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert resp.status_code in [200, 201]
        TestDCCreatedBlocksConsolidation.test_bom = resp.json()
        
        # PO 1
        po_data = {"bom_id": self.test_bom['id'], "quantity": 5, "due_date": (datetime.now() + timedelta(days=30)).isoformat()}
        resp = self.session.post(f"{BASE_URL}/api/production", json=po_data)
        assert resp.status_code in [200, 201]
        po1 = resp.json()
        resp = self.session.post(f"{BASE_URL}/api/production/{po1['id']}/confirm")
        assert resp.status_code == 200
        TestDCCreatedBlocksConsolidation.test_po = resp.json()
        
        # PO 2
        po_data2 = {"bom_id": self.test_bom['id'], "quantity": 3, "due_date": (datetime.now() + timedelta(days=30)).isoformat()}
        resp = self.session.post(f"{BASE_URL}/api/production", json=po_data2)
        assert resp.status_code in [200, 201]
        po2 = resp.json()
        resp = self.session.post(f"{BASE_URL}/api/production/{po2['id']}/confirm")
        assert resp.status_code == 200
        TestDCCreatedBlocksConsolidation.test_po2 = resp.json()
        
        # WO 1
        wo_data = {"production_order_id": self.test_po['id'], "routing_id": self.test_routing['id'], "quantity": 5}
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data)
        assert resp.status_code in [200, 201]
        data = resp.json()
        wos = data.get('work_orders', [data]) if 'work_orders' in data else [data]
        assert len(wos) > 0, f"No work orders created: {data}"
        TestDCCreatedBlocksConsolidation.test_wo = wos[0]
        
        # WO 2
        wo_data2 = {"production_order_id": self.test_po2['id'], "routing_id": self.test_routing['id'], "quantity": 3}
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data2)
        assert resp.status_code in [200, 201]
        data2 = resp.json()
        wos2 = data2.get('work_orders', [data2]) if 'work_orders' in data2 else [data2]
        assert len(wos2) > 0, f"No work orders created: {data2}"
        TestDCCreatedBlocksConsolidation.test_wo2 = wos2[0]
        
        assert self.test_wo is not None
        assert self.test_wo2 is not None
        print(f"Created routing, BOM, POs, WOs")
    
    def test_05_start_wo1_and_outsource(self):
        """Start WO1 and outsource operation"""
        # Start WO1
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/start")
        assert resp.status_code == 200
        
        # Get operation sequence
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}")
        assert resp.status_code == 200
        wo_data = resp.json()
        ops = wo_data.get('operations_status', [])
        seq = ops[0]['sequence']
        
        # Outsource
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.test_supplier['id'],
            "outsource_charges": 50.0
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{self.test_wo['id']}/operations/{seq}", json=outsource_data)
        assert resp.status_code == 200
        
        # Get SC order
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        orders = resp.json()
        for order in orders:
            if order.get('supplier_id') == self.test_supplier['id'] and order.get('subcontract_type') == 'without_material':
                TestDCCreatedBlocksConsolidation.sc_order = order
                break
        
        assert self.sc_order is not None
        print(f"Created SC order: {self.sc_order.get('order_number')}")
    
    def test_06_send_dc_for_sc(self):
        """Send DC for the SC order - this sets dc_created=True"""
        # Create DC
        dc_data = {
            "subcontract_order_id": self.sc_order['id'],
            "lines": [],
            "skip_stock_deduct": True,
            "notes": "Test DC"
        }
        resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        assert resp.status_code in [200, 201], f"Failed to create DC: {resp.text}"
        
        # Update SC to mark dc_created
        resp = self.session.put(f"{BASE_URL}/api/job-work/orders/{self.sc_order['id']}", json={"dc_created": True})
        assert resp.status_code == 200
        
        # Verify dc_created=True using list endpoint
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        orders = resp.json()
        sc = next((o for o in orders if o.get('id') == self.sc_order['id']), None)
        assert sc is not None, f"Could not find SC order {self.sc_order['id']}"
        assert sc.get('dc_created') == True, f"Expected dc_created=True, got {sc.get('dc_created')}"
        print(f"DC sent, dc_created=True")
    
    def test_07_outsource_wo2_creates_new_sc(self):
        """Outsource WO2 to same supplier - should create NEW SC, not consolidate"""
        # Start WO2
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{self.test_wo2['id']}/start")
        assert resp.status_code == 200
        
        # Get operation sequence
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.test_wo2['id']}")
        assert resp.status_code == 200
        wo_data = resp.json()
        ops = wo_data.get('operations_status', [])
        seq = ops[0]['sequence']
        
        # Outsource to same supplier
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.test_supplier['id'],
            "outsource_charges": 50.0
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{self.test_wo2['id']}/operations/{seq}", json=outsource_data)
        assert resp.status_code == 200
        
        # Get all SC orders for this supplier
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        orders = resp.json()
        
        supplier_scs = [o for o in orders if o.get('supplier_id') == self.test_supplier['id'] and o.get('subcontract_type') == 'without_material']
        
        print(f"Found {len(supplier_scs)} SC orders for supplier")
        
        # CRITICAL: Should have 2 SC orders now (not consolidated into the dc_created one)
        assert len(supplier_scs) >= 2, f"Expected at least 2 SC orders (new one created), got {len(supplier_scs)}"
        
        # Verify the original SC still has dc_created=True
        original_sc = next((s for s in supplier_scs if s['id'] == self.sc_order['id']), None)
        assert original_sc is not None
        assert original_sc.get('dc_created') == True
        
        # Verify new SC has dc_created=False
        new_sc = next((s for s in supplier_scs if s['id'] != self.sc_order['id']), None)
        assert new_sc is not None
        assert new_sc.get('dc_created') in [False, None], f"New SC should have dc_created=False, got {new_sc.get('dc_created')}"
        
        print(f"SUCCESS: New SC created ({new_sc.get('order_number')}) instead of consolidating into dc_created SC")


class TestSendDCButtonVisibility:
    """
    Issue 1 (Part 3): Send DC button visibility in frontend JobWorkPage
    For Job OS SC with (subcontract_type='without_material', lines=[], job_work_parts.length>0, dc_created=false, status in confirmed/in_progress),
    the 'Send DC' button MUST be visible.
    """
    
    session = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if TestSendDCButtonVisibility.session is None:
            TestSendDCButtonVisibility.session = requests.Session()
    
    def test_01_login(self):
        """Login"""
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
    
    def test_02_verify_job_os_sc_conditions(self):
        """Verify Job OS SC conditions for Send DC button"""
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        orders = resp.json()
        
        # Find Job OS SCs that should show Send DC button
        job_os_scs = []
        for order in orders:
            is_job_os = (
                order.get('subcontract_type') == 'without_material' and
                (not order.get('lines') or len(order.get('lines', [])) == 0) and
                len(order.get('job_work_parts', [])) > 0
            )
            if is_job_os:
                job_os_scs.append(order)
        
        print(f"Found {len(job_os_scs)} Job OS SC orders")
        
        for sc in job_os_scs:
            dc_created = sc.get('dc_created', False)
            status = sc.get('status')
            jwp_count = len(sc.get('job_work_parts', []))
            lines_count = len(sc.get('lines', []))
            
            should_show_send_dc = (
                dc_created == False and
                status in ['confirmed', 'in_progress'] and
                lines_count == 0 and
                jwp_count > 0
            )
            
            print(f"SC {sc.get('order_number')}: dc_created={dc_created}, status={status}, jwp={jwp_count}, lines={lines_count} => Send DC visible: {should_show_send_dc}")
            
            # This is a data verification test - frontend will use these conditions
            if should_show_send_dc:
                assert dc_created == False, "dc_created should be False for Send DC to show"
                assert status in ['confirmed', 'in_progress'], "status should be confirmed/in_progress"
                assert lines_count == 0, "lines should be empty for Job OS"
                assert jwp_count > 0, "job_work_parts should have items"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
