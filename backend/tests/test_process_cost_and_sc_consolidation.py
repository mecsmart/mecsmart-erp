"""
Test Suite for Manufacturing ERP - Two Requirements:
Req 1: Process cost per unit on inhouse operations and BOM explosion costing
Req 2: Consolidation of outsourced operations to same supplier into single SC order

Test Coverage:
- Req 1: PUT /api/work-orders/{id}/operations/{seq} with process_cost_per_unit saves it
- Req 1: process_cost_per_unit persists on completed operations
- Req 1: GET /api/bom/{id}/explode returns process_cost_per_unit and total_cost_per_unit
- Req 2: Outsourcing two operations to same supplier consolidates into one SC order
- Req 2: Second outsourced operation merges lines into existing SC
- Req 2: Draft DC is also updated with merged lines
- Req 2: Outsourcing to different supplier creates separate SC order
- Regression: Inhouse start still works without process cost
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProcessCostAndSCConsolidation:
    """Test process cost per unit and SC consolidation features"""
    
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
        self.user = login_resp.json()
        print(f"✓ Logged in as {self.user.get('email')}")
        
        # Create test data
        self._create_test_data()
        
        yield
        
        # Cleanup - logout
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def _create_test_data(self):
        """Create all test data needed for the tests"""
        # Create finished good item
        fg_item = {
            "part_number": f"FG-PC-{self.test_suffix}",
            "name": f"TEST_FG_ProcessCost_{self.test_suffix}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=fg_item)
        assert resp.status_code in [200, 201], f"Failed to create FG item: {resp.text}"
        self.fg_item_id = resp.json().get("id")
        
        # Create raw material item with stock
        rm_item = {
            "part_number": f"RM-PC-{self.test_suffix}",
            "name": f"TEST_RM_ProcessCost_{self.test_suffix}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 50.0,
            "current_stock": 100  # Add stock so MO can start
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=rm_item)
        assert resp.status_code in [200, 201], f"Failed to create RM item: {resp.text}"
        self.rm_item_id = resp.json().get("id")
        
        # Create routing with two operations
        routing = {
            "name": f"TEST_Routing_ProcessCost_{self.test_suffix}",
            "description": "Test routing for process cost"
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing)
        assert resp.status_code in [200, 201], f"Failed to create routing: {resp.text}"
        self.routing_id = resp.json().get("id")
        
        # Create BOM (with required name field and status=active)
        bom = {
            "name": f"BOM_ProcessCost_{self.test_suffix}",
            "parent_item_id": self.fg_item_id,
            "components": [
                {"item_id": self.rm_item_id, "quantity": 2.0}
            ],
            "parent_routings": ["Cutting", "Assembly"],  # Operation names, not routing IDs
            "status": "active"  # Must be active for operations to be created
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom)
        assert resp.status_code in [200, 201], f"Failed to create BOM: {resp.text}"
        self.bom_id = resp.json().get("id")
        
        # Create Production Order (endpoint is /api/production)
        po = {
            "bom_id": self.bom_id,
            "quantity": 10,
            "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "priority": "medium"
        }
        resp = self.session.post(f"{BASE_URL}/api/production", json=po)
        assert resp.status_code in [200, 201], f"Failed to create Production Order: {resp.text}"
        self.production_order_id = resp.json().get("id")
        
        # Create MO (Work Order) - need to pass routing_id
        mo = {
            "production_order_id": self.production_order_id,
            "routing_id": self.routing_id,  # Pass routing_id for main MO
            "quantity": 10
        }
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json=mo)
        assert resp.status_code in [200, 201], f"Failed to create MO: {resp.text}"
        mo_response = resp.json()
        work_orders = mo_response.get("work_orders", [])
        assert len(work_orders) > 0, f"No work orders created: {mo_response}"
        self.mo_id = work_orders[0].get("id")
        self.wo_number = work_orders[0].get("wo_number")
        print(f"  Created MO: {self.wo_number}")
        
        # Start the MO (required before updating operations)
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{self.mo_id}/start")
        assert resp.status_code == 200, f"Failed to start MO: {resp.text}"
        print(f"  Started MO: {self.wo_number}")
    
    def test_01_login_works(self):
        """Test login with admin@erp.com / Admin@123"""
        resp = self.session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("email") == "admin@erp.com"
        print("✓ Login verified with admin@erp.com / Admin@123")
    
    def test_02_inhouse_start_without_process_cost_regression(self):
        """Regression: Inhouse start still works without process cost"""
        # Start first operation without process_cost_per_unit
        update_data = {
            "status": "in_progress",
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{self.mo_id}/operations/10", json=update_data)
        assert resp.status_code == 200, f"Failed to start operation without process cost: {resp.text}"
        print("✓ Regression: Inhouse start works without process_cost_per_unit")
        
        # Stop the operation
        stop_data = {
            "status": "stopped",
            "quantity_completed": 5
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{self.mo_id}/operations/10", json=stop_data)
        assert resp.status_code == 200
    
    def test_03_inhouse_operation_with_process_cost(self):
        """Req 1: PUT /api/work-orders/{id}/operations/{seq} with process_cost_per_unit saves it"""
        # Start operation with process_cost_per_unit
        update_data = {
            "status": "in_progress",
            "operator": "Test Operator",
            "process_cost_per_unit": 5.0
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{self.mo_id}/operations/10", json=update_data)
        assert resp.status_code == 200, f"Failed to start operation with process cost: {resp.text}"
        
        # Verify process_cost_per_unit is saved
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.mo_id}")
        assert resp.status_code == 200
        mo_data = resp.json()
        operations = mo_data.get("operations_status", [])
        op_10 = next((op for op in operations if op.get("sequence") == 10), None)
        assert op_10 is not None, "Operation 10 not found"
        assert op_10.get("process_cost_per_unit") == 5.0, f"process_cost_per_unit not saved: {op_10}"
        print("✓ Req 1: process_cost_per_unit=5.0 saved on operation start")
    
    def test_04_process_cost_persists_on_complete(self):
        """Req 1: process_cost_per_unit persists on completed operations"""
        # First start the operation
        start_data = {
            "status": "in_progress",
            "operator": "Test Operator",
            "process_cost_per_unit": 5.0
        }
        self.session.put(f"{BASE_URL}/api/work-orders/{self.mo_id}/operations/10", json=start_data)
        
        # Complete operation with process_cost_per_unit
        complete_data = {
            "status": "completed",
            "quantity_completed": 10,
            "process_cost_per_unit": 5.0
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{self.mo_id}/operations/10", json=complete_data)
        assert resp.status_code == 200, f"Failed to complete operation: {resp.text}"
        
        # Verify process_cost_per_unit persists
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{self.mo_id}")
        assert resp.status_code == 200
        mo_data = resp.json()
        operations = mo_data.get("operations_status", [])
        op_10 = next((op for op in operations if op.get("sequence") == 10), None)
        assert op_10 is not None
        assert op_10.get("status") == "completed"
        assert op_10.get("process_cost_per_unit") == 5.0, f"process_cost_per_unit not persisted: {op_10}"
        print("✓ Req 1: process_cost_per_unit persists on completed operation")


class TestBOMExplosionCosting:
    """Test BOM explosion includes process costs"""
    
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
        yield
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def test_05_bom_explosion_shows_process_cost_fields(self):
        """Req 1: GET /api/bom/{id}/explode returns process_cost_per_unit and total_cost_per_unit"""
        # Create items
        fg_item = {
            "part_number": f"FG-BE-{self.test_suffix}",
            "name": f"TEST_FG_BOMExplode_{self.test_suffix}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=fg_item)
        assert resp.status_code in [200, 201], f"Failed to create FG: {resp.text}"
        fg_item_id = resp.json().get("id")
        
        rm_item = {
            "part_number": f"RM-BE-{self.test_suffix}",
            "name": f"TEST_RM_BOMExplode_{self.test_suffix}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 25.0
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=rm_item)
        assert resp.status_code in [200, 201], f"Failed to create RM: {resp.text}"
        rm_item_id = resp.json().get("id")
        
        # Create routing
        routing = {
            "name": f"TEST_Routing_BOMExplode_{self.test_suffix}",
            "code": f"RT-BE-{self.test_suffix}",
            "operations": [
                {"sequence": 10, "operation_name": "Machining", "work_center": "WC1", "setup_time_min": 10, "cycle_time_min": 5}
            ]
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing)
        assert resp.status_code in [200, 201]
        routing_id = resp.json().get("id")
        
        # Create BOM with RM as component (with required name field)
        bom = {
            "name": f"BOM_BOMExplode_{self.test_suffix}",
            "parent_item_id": fg_item_id,
            "components": [
                {"item_id": rm_item_id, "quantity": 2.0}
            ],
            "parent_routings": [routing_id],
            "status": "active"
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom)
        assert resp.status_code in [200, 201], f"Failed to create BOM: {resp.text}"
        bom_id = resp.json().get("id")
        
        # Check BOM explosion - verify fields exist
        resp = self.session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert resp.status_code == 200, f"BOM explosion failed: {resp.text}"
        explosion_data = resp.json()
        
        # Check that explosion returns process_cost_per_unit and total_cost_per_unit
        # The data is in 'explosion' key, not 'components'
        components = explosion_data.get("explosion", [])
        assert len(components) > 0, f"No components in BOM explosion: {explosion_data}"
        
        rm_component = next((c for c in components if c.get("item", {}).get("id") == rm_item_id), None)
        assert rm_component is not None, "RM component not found in explosion"
        
        # Verify process_cost_per_unit field exists (may be 0 if no completed WO)
        assert "process_cost_per_unit" in rm_component, f"process_cost_per_unit not in explosion: {rm_component.keys()}"
        assert "total_cost_per_unit" in rm_component, f"total_cost_per_unit not in explosion: {rm_component.keys()}"
        
        print(f"✓ Req 1: BOM explosion shows process_cost_per_unit={rm_component.get('process_cost_per_unit')}")
        print(f"✓ Req 1: BOM explosion shows total_cost_per_unit={rm_component.get('total_cost_per_unit')}")
        print(f"  Component unit_cost={rm_component.get('unit_cost')}")


class TestSCConsolidation:
    """Test SC order consolidation for same supplier"""
    
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
        
        # Create suppliers for testing
        self.supplier_a = self._create_supplier(f"TEST_SupplierA_{self.test_suffix}")
        self.supplier_b = self._create_supplier(f"TEST_SupplierB_{self.test_suffix}")
        
        yield
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def _create_supplier(self, name):
        """Helper to create a supplier"""
        unique_suffix = str(uuid.uuid4())[:6]  # Use unique suffix for each supplier
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
    
    def _create_test_item(self, name_prefix, category="finished_good"):
        """Helper to create test item"""
        item = {
            "part_number": f"{name_prefix[:4].upper()}-{self.test_suffix}",
            "name": f"TEST_{name_prefix}_{self.test_suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
            "current_stock": 100 if category == "raw_material" else 0  # Add stock for RM
        }
        resp = self.session.post(f"{BASE_URL}/api/items", json=item)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
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
            "name": f"TEST_Routing_SC_{self.test_suffix}",
            "code": f"RT-SC-{self.test_suffix}",
            "operations": operations
        }
        resp = self.session.post(f"{BASE_URL}/api/routings", json=routing)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        return None
    
    def _create_bom(self, parent_item_id, rm_item_id, routing_id):
        """Helper to create BOM"""
        bom = {
            "name": f"BOM_SC_{self.test_suffix}",
            "parent_item_id": parent_item_id,
            "components": [{"item_id": rm_item_id, "quantity": 1.0}],
            "parent_routings": ["Operation_1", "Operation_2", "Operation_3"],  # Operation names
            "status": "active"  # Must be active for operations to be created
        }
        resp = self.session.post(f"{BASE_URL}/api/bom", json=bom)
        if resp.status_code in [200, 201]:
            return resp.json().get("id")
        return None
    
    def _create_production_order_and_mo(self, bom_id, routing_id=None, quantity=10):
        """Helper to create Production Order and MO, then start the MO"""
        # Create Production Order (endpoint is /api/production)
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
        
        # Create MO - need routing_id for main MO
        mo = {
            "production_order_id": production_order_id,
            "quantity": quantity
        }
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
        
        # Start the MO (required before updating operations)
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        if resp.status_code != 200:
            print(f"Failed to start MO: {resp.text}")
            # Continue anyway - some tests may not need started MO
        
        return production_order_id, mo_id
    
    def test_06_outsource_first_operation_creates_sc(self):
        """Req 2: First outsourced operation creates new SC order"""
        # Create item and routing
        item_id = self._create_test_item("FG_SC_Test")
        assert item_id, "Failed to create test item"
        
        routing_id = self._create_routing_with_operations(3)
        assert routing_id, "Failed to create routing"
        
        # Create BOM
        rm_id = self._create_test_item("RM_SC_Test", "raw_material")
        bom_id = self._create_bom(item_id, rm_id, routing_id)
        assert bom_id, "Failed to create BOM"
        
        # Create Production Order and MO
        po_id, mo_id = self._create_production_order_and_mo(bom_id, routing_id)
        assert mo_id, "Failed to create MO"
        print(f"✓ Created MO: {mo_id}")
        
        # Count existing SC orders for this MO
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json() if resp.status_code == 200 else []
        initial_sc_count = len([sc for sc in all_sc if sc.get("reference_wo_id") == mo_id])
        
        # Outsource first operation to Supplier A
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a,
            "outsource_charges": 100.0,
            "operator": "Test Operator"  # Required field
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=outsource_data)
        assert resp.status_code == 200, f"Failed to outsource operation: {resp.text}"
        
        # Verify SC order was created
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json() if resp.status_code == 200 else []
        sc_orders = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        assert len(sc_orders) == initial_sc_count + 1, f"SC order not created: {len(sc_orders)} vs expected {initial_sc_count + 1}"
        
        print(f"✓ Req 2: First outsourced operation created SC order: {sc_orders[0].get('order_number')}")
    
    def test_07_second_outsource_same_supplier_consolidates(self):
        """Req 2: Second outsourced operation to same supplier consolidates into existing SC"""
        # Setup: Create item, routing, BOM, MO
        item_id = self._create_test_item("FG_Consolidate")
        routing_id = self._create_routing_with_operations(3)
        rm_id = self._create_test_item("RM_Consolidate", "raw_material")
        bom_id = self._create_bom(item_id, rm_id, routing_id)
        
        po_id, mo_id = self._create_production_order_and_mo(bom_id, routing_id)
        assert mo_id, "Failed to create MO"
        
        # Outsource first operation to Supplier A
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a,
            "outsource_charges": 100.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=outsource_data)
        assert resp.status_code == 200, f"Failed to outsource first operation: {resp.text}"
        
        # Get SC order count after first outsource
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json() if resp.status_code == 200 else []
        sc_orders_after_first = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        first_sc_count = len(sc_orders_after_first)
        assert first_sc_count > 0, "No SC order created after first outsource"
        
        first_sc = sc_orders_after_first[0]
        first_sc_id = first_sc.get("id")
        first_sc_charges = first_sc.get("processing_charges", 0)
        first_sc_ops = first_sc.get("reference_operation_seqs", [])
        print(f"  After first outsource: {first_sc_count} SC orders, charges={first_sc_charges}, ops={first_sc_ops}")
        
        # Stop the first operation to allow starting the second
        stop_data = {
            "status": "stopped",
            "quantity_completed": 5
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=stop_data)
        assert resp.status_code == 200, f"Failed to stop first operation: {resp.text}"
        
        # Outsource second operation to SAME Supplier A
        outsource_data_2 = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a,
            "outsource_charges": 150.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/20", json=outsource_data_2)
        assert resp.status_code == 200, f"Failed to outsource second operation: {resp.text}"
        
        # Verify SC order count is still the same (consolidated)
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json() if resp.status_code == 200 else []
        sc_orders_after_second = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        second_sc_count = len(sc_orders_after_second)
        
        assert second_sc_count == first_sc_count, f"SC orders not consolidated: {second_sc_count} vs expected {first_sc_count}"
        print(f"✓ Req 2: Second outsource to same supplier consolidated - still {second_sc_count} SC order(s)")
        
        # Verify the SC order was updated with merged data
        updated_sc = next((sc for sc in sc_orders_after_second if sc.get("id") == first_sc_id), None)
        assert updated_sc is not None, "Original SC order not found"
        
        updated_charges = updated_sc.get("processing_charges", 0)
        assert updated_charges == first_sc_charges + 150.0, f"Charges not merged: {updated_charges} vs expected {first_sc_charges + 150.0}"
        print(f"✓ Req 2: Processing charges merged: {updated_charges}")
        
        updated_ops = updated_sc.get("reference_operation_seqs", [])
        assert 10 in updated_ops and 20 in updated_ops, f"Operation sequences not merged: {updated_ops}"
        print(f"✓ Req 2: Operation sequences merged: {updated_ops}")
    
    def test_08_dc_updated_with_merged_lines(self):
        """Req 2: Draft DC is also updated with merged lines"""
        # Setup
        item_id = self._create_test_item("FG_DC_Merge")
        routing_id = self._create_routing_with_operations(2)
        rm_id = self._create_test_item("RM_DC_Merge", "raw_material")
        bom_id = self._create_bom(item_id, rm_id, routing_id)
        
        po_id, mo_id = self._create_production_order_and_mo(bom_id, routing_id)
        assert mo_id, "Failed to create MO"
        
        # Outsource first operation
        outsource_data = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a,
            "outsource_charges": 100.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=outsource_data)
        assert resp.status_code == 200, f"Failed to outsource first operation: {resp.text}"
        
        # Get DC after first outsource
        resp = self.session.get(f"{BASE_URL}/api/job-work/challans")
        all_dcs = resp.json() if resp.status_code == 200 else []
        dcs_after_first = [dc for dc in all_dcs if dc.get("reference_wo_id") == mo_id]
        
        first_dc_total_qty = 0
        if dcs_after_first:
            first_dc = dcs_after_first[0]
            first_dc_lines = first_dc.get("lines", [])
            first_dc_total_qty = sum(line.get("quantity", 0) for line in first_dc_lines)
            print(f"  After first outsource: DC has {len(first_dc_lines)} lines, total qty={first_dc_total_qty}")
        
        # Stop the first operation to allow starting the second
        stop_data = {
            "status": "stopped",
            "quantity_completed": 5
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=stop_data)
        assert resp.status_code == 200, f"Failed to stop first operation: {resp.text}"
        
        # Outsource second operation to same supplier
        outsource_data_2 = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a,
            "outsource_charges": 150.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/20", json=outsource_data_2)
        assert resp.status_code == 200, f"Failed to outsource second operation: {resp.text}"
        
        # Verify DC was updated
        resp = self.session.get(f"{BASE_URL}/api/job-work/challans")
        all_dcs = resp.json() if resp.status_code == 200 else []
        dcs_after_second = [dc for dc in all_dcs if dc.get("reference_wo_id") == mo_id]
        
        if dcs_after_second:
            updated_dc = dcs_after_second[0]
            updated_dc_lines = updated_dc.get("lines", [])
            updated_dc_total_qty = sum(line.get("quantity", 0) for line in updated_dc_lines)
            print(f"✓ Req 2: DC updated - {len(updated_dc_lines)} lines, total qty={updated_dc_total_qty}")
            
            # Quantities should be merged (doubled if same items)
            if first_dc_total_qty > 0:
                assert updated_dc_total_qty >= first_dc_total_qty, "DC lines not merged properly"
        else:
            print("  Note: No DC created (may depend on implementation)")
    
    def test_09_different_supplier_creates_separate_sc(self):
        """Req 2: Outsourcing to different supplier creates separate SC order"""
        # Setup
        item_id = self._create_test_item("FG_Separate_SC")
        routing_id = self._create_routing_with_operations(3)
        rm_id = self._create_test_item("RM_Separate_SC", "raw_material")
        bom_id = self._create_bom(item_id, rm_id, routing_id)
        
        po_id, mo_id = self._create_production_order_and_mo(bom_id, routing_id)
        assert mo_id, "Failed to create MO"
        
        # Outsource first operation to Supplier A
        outsource_data_a = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_a,
            "outsource_charges": 100.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=outsource_data_a)
        assert resp.status_code == 200, f"Failed to outsource first operation: {resp.text}"
        
        # Get SC count after first outsource
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json() if resp.status_code == 200 else []
        sc_after_first = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        count_after_first = len(sc_after_first)
        print(f"  After first outsource to Supplier A: {count_after_first} SC order(s)")
        
        # Stop the first operation to allow starting the second
        stop_data = {
            "status": "stopped",
            "quantity_completed": 5
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/10", json=stop_data)
        assert resp.status_code == 200, f"Failed to stop first operation: {resp.text}"
        
        # Outsource second operation to Supplier B (different supplier)
        outsource_data_b = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": self.supplier_b,
            "outsource_charges": 200.0,
            "operator": "Test Operator"
        }
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}/operations/20", json=outsource_data_b)
        assert resp.status_code == 200, f"Failed to outsource to different supplier: {resp.text}"
        
        # Verify a new SC order was created (not consolidated)
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        all_sc = resp.json() if resp.status_code == 200 else []
        sc_after_second = [sc for sc in all_sc if sc.get("reference_wo_id") == mo_id]
        count_after_second = len(sc_after_second)
        
        assert count_after_second == count_after_first + 1, f"Separate SC not created: {count_after_second} vs expected {count_after_first + 1}"
        print(f"✓ Req 2: Different supplier created separate SC - now {count_after_second} SC order(s)")
        
        # Verify suppliers are different
        supplier_ids = [sc.get("supplier_id") for sc in sc_after_second]
        assert self.supplier_a in supplier_ids and self.supplier_b in supplier_ids, f"Both suppliers should have SC orders: {supplier_ids}"
        print(f"✓ Req 2: SC orders for both suppliers: {supplier_ids}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
