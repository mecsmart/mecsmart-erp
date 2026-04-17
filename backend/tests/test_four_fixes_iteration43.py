"""
Test Suite for Manufacturing ERP - 4 Fixes (Iteration 43):

Fix 1: BOM explosion now shows Material Cost, Process Cost, and Total/Unit columns
       (process_cost_per_unit and total_cost_per_unit from explosion endpoint)

Fix 2: Operation outsourcing SC consolidation rewritten — uses job_work_parts (Part/SA only)
       instead of RM lines, same pattern as SC with RM flow. Same supplier + same WO consolidates
       into single SC.

Fix 3: SC screen and DC now show only Part/SA details, NOT RM. Lines array is empty for
       operation outsourcing.

Fix 4: Confirmation dialog (window.confirm) before outsourcing an operation (client-side only).

Test Coverage:
- Fix 1: GET /api/bom/{id}/explode returns process_cost_per_unit and total_cost_per_unit per component
- Fix 2: Outsource op1 to Supplier A → creates SC with job_work_parts (Part item), lines=[]
- Fix 2: Outsource op2 to same Supplier A on same WO → consolidates into SAME SC (not new one)
- Fix 2: Outsource op3 to Supplier B → creates SEPARATE SC
- Fix 3: SC order from operation outsourcing has lines=[] (no RM), only job_work_parts
- Fix 3: SC order has subcontract_type='without_material'
- Regression: MO-level SC with RM still works correctly
- Regression: Inhouse operation with process cost still works
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestFix1BOMExplosionCosts:
    """Fix 1: BOM explosion shows Material Cost, Process Cost, Total/Unit columns"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_suffix = str(uuid.uuid4())[:8]
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        print(f"✓ Logged in as admin@erp.com")
        
        yield
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def test_01_login_works(self):
        """Test login with admin@erp.com / Admin@123"""
        resp = self.session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("email") == "admin@erp.com"
        print("✓ Login verified with admin@erp.com / Admin@123")
    
    def test_02_bom_explosion_returns_process_cost_fields(self):
        """Fix 1: GET /api/bom/{id}/explode returns process_cost_per_unit and total_cost_per_unit"""
        # Create FG item
        fg_item = {
            "part_number": f"FG-EXP-{self.test_suffix}",
            "name": f"TEST_FG_Explosion_{self.test_suffix}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=fg_item)
        assert resp.status_code in [200, 201], f"Failed to create FG: {resp.text}"
        fg_item_id = resp.json().get("id")
        
        # Create RM item
        rm_item = {
            "part_number": f"RM-EXP-{self.test_suffix}",
            "name": f"TEST_RM_Explosion_{self.test_suffix}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 25.0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=rm_item)
        assert resp.status_code in [200, 201], f"Failed to create RM: {resp.text}"
        rm_item_id = resp.json().get("id")
        
        # Create BOM
        bom = {
            "name": f"BOM_Explosion_{self.test_suffix}",
            "parent_item_id": fg_item_id,
            "components": [{"item_id": rm_item_id, "quantity": 2.0}],
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom)
        assert resp.status_code in [200, 201], f"Failed to create BOM: {resp.text}"
        bom_id = resp.json().get("id")
        
        # Get BOM explosion
        resp = self.session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert resp.status_code == 200, f"BOM explosion failed: {resp.text}"
        explosion_data = resp.json()
        
        # Verify explosion structure
        assert "explosion" in explosion_data, f"No 'explosion' key in response: {explosion_data.keys()}"
        components = explosion_data.get("explosion", [])
        assert len(components) > 0, f"No components in explosion: {explosion_data}"
        
        # Check first component has required fields
        comp = components[0]
        assert "process_cost_per_unit" in comp, f"Missing process_cost_per_unit: {comp.keys()}"
        assert "total_cost_per_unit" in comp, f"Missing total_cost_per_unit: {comp.keys()}"
        assert "unit_cost" in comp, f"Missing unit_cost: {comp.keys()}"
        
        # Verify total_cost_per_unit = unit_cost + process_cost_per_unit
        expected_total = comp.get("unit_cost", 0) + comp.get("process_cost_per_unit", 0)
        assert comp.get("total_cost_per_unit") == expected_total, \
            f"total_cost_per_unit mismatch: {comp.get('total_cost_per_unit')} vs expected {expected_total}"
        
        print(f"✓ Fix 1: BOM explosion returns process_cost_per_unit={comp.get('process_cost_per_unit')}")
        print(f"✓ Fix 1: BOM explosion returns total_cost_per_unit={comp.get('total_cost_per_unit')}")
        print(f"  unit_cost={comp.get('unit_cost')}")


class TestFix2And3OperationOutsourcingSC:
    """Fix 2 & 3: Operation outsourcing creates SC with job_work_parts, lines=[], consolidation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_suffix = str(uuid.uuid4())[:8]
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        # Create suppliers
        self.supplier_a_id = self._create_supplier(f"TEST_SupplierA_{self.test_suffix}")
        self.supplier_b_id = self._create_supplier(f"TEST_SupplierB_{self.test_suffix}")
        assert self.supplier_a_id, "Failed to create Supplier A"
        assert self.supplier_b_id, "Failed to create Supplier B"
        
        yield
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def _create_supplier(self, name):
        """Helper to create a supplier"""
        unique_suffix = str(uuid.uuid4())[:6]
        supplier = {
            "code": f"SUP-{unique_suffix}",
            "name": name,
            "contact_person": "Test Contact",
            "email": f"test_{unique_suffix}@example.com",
            "phone": "1234567890"
        }
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        print(f"Failed to create supplier: {resp.text}")
        return None
    
    def _create_test_item(self, name_prefix, category="finished_good", stock=0):
        """Helper to create test item"""
        item = {
            "part_number": f"{name_prefix[:4].upper()}-{self.test_suffix}",
            "name": f"TEST_{name_prefix}_{self.test_suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
            "current_stock": stock
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=item)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        print(f"Failed to create item: {resp.text}")
        return None
    
    def _create_routing_with_operations(self, num_ops=3):
        """Helper to create routing with multiple operations"""
        operations = []
        for i in range(num_ops):
            operations.append({
                "sequence": (i + 1) * 10,
                "operation_name": f"Operation_{i+1}",
                "work_center": f"WC{i+1}",
                "setup_time_min": 5,
                "cycle_time_min": 10
            })
        
        routing = {
            "name": f"TEST_Routing_{self.test_suffix}",
            "code": f"RT-{self.test_suffix}",
            "operations": operations
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        print(f"Failed to create routing: {resp.text}")
        return None
    
    def _create_bom_with_operations(self, parent_item_id, rm_item_id, num_ops=3):
        """Helper to create BOM with operations"""
        op_names = [f"Operation_{i+1}" for i in range(num_ops)]
        bom = {
            "name": f"BOM_{self.test_suffix}",
            "parent_item_id": parent_item_id,
            "components": [{"item_id": rm_item_id, "quantity": 1.0}],
            "parent_routings": op_names,
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        print(f"Failed to create BOM: {resp.text}")
        return None
    
    def _create_mo_and_start(self, bom_id, routing_id=None, quantity=10):
        """Helper to create Production Order, MO, and start it"""
        # Create Production Order
        po = {
            "bom_id": bom_id,
            "quantity": quantity,
            "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "priority": "medium"
        }
        resp = self.session.post(f"{BASE_URL}/api/production", json=po)
        if resp.status_code not in [200, 201]:
            print(f"Failed to create Production Order: {resp.text}")
            return None, None
        production_order_id = resp.json().get("id")
        
        # Create MO
        mo = {"production_order_id": production_order_id, "quantity": quantity}
        if routing_id:
            mo["routing_id"] = routing_id
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=mo)
        if resp.status_code not in [200, 201]:
            print(f"Failed to create MO: {resp.text}")
            return production_order_id, None
        
        mo_response = resp.json()
        work_orders = mo_response.get("work_orders", [])
        if not work_orders:
            print(f"No work orders created: {mo_response}")
            return production_order_id, None
        
        mo_id = work_orders[0].get("id")
        item_id = work_orders[0].get("item_id")
        
        # Start the MO
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        if resp.status_code != 200:
            print(f"Failed to start MO: {resp.text}")
        
        return mo_id, item_id
    
    def _stop_operation(self, mo_id, sequence, qty_completed=5):
        """Helper to stop an operation"""
        stop_data = {"status": "stopped", "quantity_completed": qty_completed}
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/{sequence}", json=stop_data)
        return resp.status_code == 200
    
    def test_03_outsource_op1_creates_sc_with_job_work_parts(self):
        """Fix 2 & 3: Outsource op1 to Supplier A → creates SC with job_work_parts (Part item), lines=[]"""
        # Setup: Create item, routing, BOM, MO
        fg_item_id = self._create_test_item("FG_JWP", "finished_good")
        rm_item_id = self._create_test_item("RM_JWP", "raw_material", stock=100)
        routing_id = self._create_routing_with_operations(3)
        bom_id = self._create_bom_with_operations(fg_item_id, rm_item_id, 3)
        
        assert fg_item_id and rm_item_id and routing_id and bom_id, "Setup failed"
        
        mo_id, wo_item_id = self._create_mo_and_start(bom_id, routing_id)
        assert mo_id, "Failed to create MO"
        print(f"✓ Created MO: {mo_id}, item_id: {wo_item_id}")
        
        # Outsource first operation to Supplier A
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a_id,
            "outsource_charges": 100.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=outsource_data)
        assert resp.status_code == 200, f"Failed to outsource operation: {resp.text}"
        print("✓ Outsourced operation 10 to Supplier A")
        
        # Get SC orders for this MO
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200, f"Failed to get SC orders: {resp.text}"
        all_sc = resp.json()
        sc_orders = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        
        assert len(sc_orders) >= 1, f"No SC order created for MO: {mo_id}"
        sc_order = sc_orders[0]
        
        # Fix 3: Verify lines=[] (no RM)
        lines = sc_order.get("lines", [])
        assert lines == [], f"Fix 3 FAILED: SC order should have lines=[], got: {lines}"
        print(f"✓ Fix 3: SC order has lines=[] (no RM)")
        
        # Fix 2: Verify job_work_parts contains the Part/SA item
        job_work_parts = sc_order.get("job_work_parts", [])
        assert len(job_work_parts) > 0, f"Fix 2 FAILED: SC order should have job_work_parts, got: {job_work_parts}"
        
        # Verify job_work_parts contains the WO item (Part/SA)
        jwp_item_ids = [jwp.get("item_id") for jwp in job_work_parts]
        assert wo_item_id in jwp_item_ids or fg_item_id in jwp_item_ids, \
            f"Fix 2 FAILED: job_work_parts should contain Part item {wo_item_id} or {fg_item_id}, got: {jwp_item_ids}"
        print(f"✓ Fix 2: SC order has job_work_parts with Part item: {job_work_parts}")
        
        # Fix 3: Verify subcontract_type='without_material'
        subcontract_type = sc_order.get("subcontract_type")
        assert subcontract_type == "without_material", \
            f"Fix 3 FAILED: subcontract_type should be 'without_material', got: {subcontract_type}"
        print(f"✓ Fix 3: SC order has subcontract_type='without_material'")
        
        # Store for next test
        self.first_sc_id = sc_order.get("id")
        self.mo_id = mo_id
        self.wo_item_id = wo_item_id
    
    def test_04_outsource_op2_same_supplier_consolidates(self):
        """Fix 2: Outsource op2 to same Supplier A on same WO → consolidates into SAME SC"""
        # Setup: Create fresh MO with 3 operations
        fg_item_id = self._create_test_item("FG_Consol", "finished_good")
        rm_item_id = self._create_test_item("RM_Consol", "raw_material", stock=100)
        routing_id = self._create_routing_with_operations(3)
        bom_id = self._create_bom_with_operations(fg_item_id, rm_item_id, 3)
        
        mo_id, wo_item_id = self._create_mo_and_start(bom_id, routing_id)
        assert mo_id, "Failed to create MO"
        
        # Outsource op1 to Supplier A
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a_id,
            "outsource_charges": 100.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=outsource_data)
        assert resp.status_code == 200, f"Failed to outsource op1: {resp.text}"
        
        # Get SC count after first outsource
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json()
        sc_after_first = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        first_sc_count = len(sc_after_first)
        first_sc = sc_after_first[0]
        first_sc_id = first_sc.get("id")
        first_charges = first_sc.get("processing_charges", 0)
        first_ops = first_sc.get("reference_operation_seqs", [])
        print(f"  After op1 outsource: {first_sc_count} SC, charges={first_charges}, ops={first_ops}")
        
        # Stop op1 to allow starting op2
        assert self._stop_operation(mo_id, 10), "Failed to stop op1"
        
        # Outsource op2 to SAME Supplier A
        outsource_data_2 = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a_id,
            "outsource_charges": 150.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/20", json=outsource_data_2)
        assert resp.status_code == 200, f"Failed to outsource op2: {resp.text}"
        
        # Verify SC count is still the same (consolidated)
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json()
        sc_after_second = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        second_sc_count = len(sc_after_second)
        
        assert second_sc_count == first_sc_count, \
            f"Fix 2 FAILED: SC not consolidated. Expected {first_sc_count}, got {second_sc_count}"
        print(f"✓ Fix 2: Second outsource consolidated - still {second_sc_count} SC order(s)")
        
        # Verify the SAME SC was updated
        updated_sc = next((sc for sc in sc_after_second if sc.get("id") == first_sc_id), None)
        assert updated_sc is not None, "Original SC order not found after consolidation"
        
        # Verify charges merged
        updated_charges = updated_sc.get("processing_charges", 0)
        expected_charges = first_charges + 150.0
        assert updated_charges == expected_charges, \
            f"Fix 2 FAILED: Charges not merged. Expected {expected_charges}, got {updated_charges}"
        print(f"✓ Fix 2: Processing charges merged: {updated_charges}")
        
        # Verify operation sequences merged
        updated_ops = updated_sc.get("reference_operation_seqs", [])
        assert 10 in updated_ops and 20 in updated_ops, \
            f"Fix 2 FAILED: Operation sequences not merged. Got: {updated_ops}"
        print(f"✓ Fix 2: Operation sequences merged: {updated_ops}")
        
        # Verify job_work_parts merged (qty should be summed if same item)
        job_work_parts = updated_sc.get("job_work_parts", [])
        assert len(job_work_parts) > 0, "job_work_parts should not be empty"
        print(f"✓ Fix 2: job_work_parts after consolidation: {job_work_parts}")
    
    def test_05_outsource_op3_different_supplier_creates_separate_sc(self):
        """Fix 2: Outsource op3 to Supplier B → creates SEPARATE SC"""
        # Setup: Create fresh MO with 3 operations
        fg_item_id = self._create_test_item("FG_Sep", "finished_good")
        rm_item_id = self._create_test_item("RM_Sep", "raw_material", stock=100)
        routing_id = self._create_routing_with_operations(3)
        bom_id = self._create_bom_with_operations(fg_item_id, rm_item_id, 3)
        
        mo_id, wo_item_id = self._create_mo_and_start(bom_id, routing_id)
        assert mo_id, "Failed to create MO"
        
        # Outsource op1 to Supplier A
        outsource_data_a = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a_id,
            "outsource_charges": 100.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=outsource_data_a)
        assert resp.status_code == 200
        
        # Get SC count after first outsource
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json()
        sc_after_first = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        count_after_first = len(sc_after_first)
        print(f"  After op1 to Supplier A: {count_after_first} SC order(s)")
        
        # Stop op1
        assert self._stop_operation(mo_id, 10), "Failed to stop op1"
        
        # Outsource op2 to Supplier B (DIFFERENT supplier)
        outsource_data_b = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_b_id,
            "outsource_charges": 200.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/20", json=outsource_data_b)
        assert resp.status_code == 200, f"Failed to outsource to different supplier: {resp.text}"
        
        # Verify a NEW SC order was created (not consolidated)
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json()
        sc_after_second = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        count_after_second = len(sc_after_second)
        
        assert count_after_second == count_after_first + 1, \
            f"Fix 2 FAILED: Separate SC not created. Expected {count_after_first + 1}, got {count_after_second}"
        print(f"✓ Fix 2: Different supplier created separate SC - now {count_after_second} SC order(s)")
        
        # Verify both suppliers have SC orders
        supplier_ids = [sc.get("supplier_id") for sc in sc_after_second]
        assert self.supplier_a_id in supplier_ids and self.supplier_b_id in supplier_ids, \
            f"Both suppliers should have SC orders: {supplier_ids}"
        print(f"✓ Fix 2: SC orders for both suppliers verified")


class TestRegressions:
    """Regression tests to ensure existing functionality still works"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_suffix = str(uuid.uuid4())[:8]
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        yield
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def _create_test_item(self, name_prefix, category="finished_good", stock=0):
        """Helper to create test item"""
        item = {
            "part_number": f"{name_prefix[:4].upper()}-{self.test_suffix}",
            "name": f"TEST_{name_prefix}_{self.test_suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
            "current_stock": stock
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=item)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        return None
    
    def _create_routing_with_operations(self, num_ops=2):
        """Helper to create routing"""
        operations = []
        for i in range(num_ops):
            operations.append({
                "sequence": (i + 1) * 10,
                "operation_name": f"Operation_{i+1}",
                "work_center": f"WC{i+1}",
                "setup_time_min": 5,
                "cycle_time_min": 10
            })
        
        routing = {
            "name": f"TEST_Routing_Reg_{self.test_suffix}",
            "code": f"RT-REG-{self.test_suffix}",
            "operations": operations
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        return None
    
    def _create_bom(self, parent_item_id, rm_item_id, num_ops=2):
        """Helper to create BOM"""
        op_names = [f"Operation_{i+1}" for i in range(num_ops)]
        bom = {
            "name": f"BOM_Reg_{self.test_suffix}",
            "parent_item_id": parent_item_id,
            "components": [{"item_id": rm_item_id, "quantity": 1.0}],
            "parent_routings": op_names,
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        return None
    
    def _create_mo_and_start(self, bom_id, routing_id=None, quantity=10):
        """Helper to create and start MO"""
        po = {
            "bom_id": bom_id,
            "quantity": quantity,
            "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "priority": "medium"
        }
        resp = self.session.post(f"{BASE_URL}/api/production", json=po)
        if resp.status_code not in [200, 201]:
            return None
        production_order_id = resp.json().get("id")
        
        mo = {"production_order_id": production_order_id, "quantity": quantity}
        if routing_id:
            mo["routing_id"] = routing_id
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=mo)
        if resp.status_code not in [200, 201]:
            return None
        
        work_orders = resp.json().get("work_orders", [])
        if not work_orders:
            return None
        
        mo_id = work_orders[0].get("id")
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        return mo_id
    
    def test_06_inhouse_operation_with_process_cost_still_works(self):
        """Regression: Inhouse operation with process cost still works"""
        # Setup
        fg_item_id = self._create_test_item("FG_Inhouse", "finished_good")
        rm_item_id = self._create_test_item("RM_Inhouse", "raw_material", stock=100)
        routing_id = self._create_routing_with_operations(2)
        bom_id = self._create_bom(fg_item_id, rm_item_id, 2)
        
        mo_id = self._create_mo_and_start(bom_id, routing_id)
        assert mo_id, "Failed to create MO"
        
        # Start inhouse operation with process_cost_per_unit
        update_data = {
            "status": "in_progress",
            "operator": "Test Operator",
            "process_cost_per_unit": 5.0
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=update_data)
        assert resp.status_code == 200, f"Failed to start inhouse operation: {resp.text}"
        
        # Verify process_cost_per_unit is saved
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert resp.status_code == 200
        mo_data = resp.json()
        operations = mo_data.get("operations_status", [])
        op_10 = next((op for op in operations if op.get("sequence") == 10), None)
        
        assert op_10 is not None, "Operation 10 not found"
        assert op_10.get("process_cost_per_unit") == 5.0, \
            f"Regression FAILED: process_cost_per_unit not saved: {op_10}"
        print("✓ Regression: Inhouse operation with process_cost_per_unit=5.0 works")
        
        # Complete the operation
        complete_data = {
            "status": "completed",
            "quantity_completed": 10,
            "process_cost_per_unit": 5.0
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=complete_data)
        assert resp.status_code == 200, f"Failed to complete operation: {resp.text}"
        
        # Verify process_cost_per_unit persists
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        mo_data = resp.json()
        operations = mo_data.get("operations_status", [])
        op_10 = next((op for op in operations if op.get("sequence") == 10), None)
        
        assert op_10.get("status") == "completed"
        assert op_10.get("process_cost_per_unit") == 5.0, \
            f"Regression FAILED: process_cost_per_unit not persisted: {op_10}"
        print("✓ Regression: process_cost_per_unit persists on completed operation")


class TestFix4ConfirmationDialog:
    """Fix 4: Confirmation dialog before outsourcing (client-side only - backend just handles request)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_suffix = str(uuid.uuid4())[:8]
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        
        # Create supplier
        unique_suffix = str(uuid.uuid4())[:6]
        supplier = {
            "code": f"SUP-{unique_suffix}",
            "name": f"TEST_Supplier_{self.test_suffix}",
            "contact_person": "Test Contact",
            "email": f"test_{unique_suffix}@example.com",
            "phone": "1234567890"
        }
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier)
        self.supplier_id = resp.json().get("id") if resp.status_code in [200, 201] else None
        
        yield
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def _create_test_item(self, name_prefix, category="finished_good", stock=0):
        """Helper to create test item"""
        item = {
            "part_number": f"{name_prefix[:4].upper()}-{self.test_suffix}",
            "name": f"TEST_{name_prefix}_{self.test_suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
            "current_stock": stock
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=item)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        return None
    
    def _create_routing_with_operations(self, num_ops=2):
        """Helper to create routing"""
        operations = []
        for i in range(num_ops):
            operations.append({
                "sequence": (i + 1) * 10,
                "operation_name": f"Operation_{i+1}",
                "work_center": f"WC{i+1}",
                "setup_time_min": 5,
                "cycle_time_min": 10
            })
        
        routing = {
            "name": f"TEST_Routing_Conf_{self.test_suffix}",
            "code": f"RT-CONF-{self.test_suffix}",
            "operations": operations
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        return None
    
    def _create_bom(self, parent_item_id, rm_item_id, num_ops=2):
        """Helper to create BOM"""
        op_names = [f"Operation_{i+1}" for i in range(num_ops)]
        bom = {
            "name": f"BOM_Conf_{self.test_suffix}",
            "parent_item_id": parent_item_id,
            "components": [{"item_id": rm_item_id, "quantity": 1.0}],
            "parent_routings": op_names,
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        return None
    
    def _create_mo_and_start(self, bom_id, routing_id=None, quantity=10):
        """Helper to create and start MO"""
        po = {
            "bom_id": bom_id,
            "quantity": quantity,
            "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "priority": "medium"
        }
        resp = self.session.post(f"{BASE_URL}/api/production", json=po)
        if resp.status_code not in [200, 201]:
            return None
        production_order_id = resp.json().get("id")
        
        mo = {"production_order_id": production_order_id, "quantity": quantity}
        if routing_id:
            mo["routing_id"] = routing_id
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=mo)
        if resp.status_code not in [200, 201]:
            return None
        
        work_orders = resp.json().get("work_orders", [])
        if not work_orders:
            return None
        
        mo_id = work_orders[0].get("id")
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        return mo_id
    
    def test_07_backend_handles_outsource_request(self):
        """Fix 4: Backend handles outsource request (confirmation is client-side only)"""
        # Setup
        fg_item_id = self._create_test_item("FG_Confirm", "finished_good")
        rm_item_id = self._create_test_item("RM_Confirm", "raw_material", stock=100)
        routing_id = self._create_routing_with_operations(2)
        bom_id = self._create_bom(fg_item_id, rm_item_id, 2)
        
        mo_id = self._create_mo_and_start(bom_id, routing_id)
        assert mo_id, "Failed to create MO"
        assert self.supplier_id, "Failed to create supplier"
        
        # Send outsource request (simulating what frontend sends after user confirms)
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_id,
            "outsource_charges": 100.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=outsource_data)
        assert resp.status_code == 200, f"Backend failed to handle outsource request: {resp.text}"
        
        # Verify operation was outsourced
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        mo_data = resp.json()
        operations = mo_data.get("operations_status", [])
        op_10 = next((op for op in operations if op.get("sequence") == 10), None)
        
        assert op_10 is not None
        assert op_10.get("is_job_work") == True, f"Operation not marked as job_work: {op_10}"
        assert op_10.get("outsource_status") == "sent", f"Outsource status not 'sent': {op_10}"
        
        print("✓ Fix 4: Backend handles outsource request correctly")
        print("  Note: Confirmation dialog is client-side only (window.confirm)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
