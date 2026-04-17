"""
Test Job OS (Job Outsource) Fixes - 3 Bug Fixes:
1. Same vendor consolidation across ALL MOs (not just same WO)
2. Send DC for Job OS with skip_stock_deduct=true
3. DC creation updates job_work_parts sent_quantity and sets dc_created=true

Test Scenarios:
- Outsource op on MO-A to Supplier X → creates SC
- Outsource op on MO-B to SAME Supplier X → should consolidate into SAME SC
- Outsource to different supplier → creates separate SC
- Send DC for Job OS with skip_stock_deduct=true
- Verify DC updates job_work_parts sent_quantity and dc_created=true
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestJobOSConsolidation:
    """Test Job OS consolidation across different MOs to same supplier"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for all tests"""
        if TestJobOSConsolidation.session is None:
            TestJobOSConsolidation.session = requests.Session()
            TestJobOSConsolidation.session.headers.update({"Content-Type": "application/json"})
    
    def test_01_login(self):
        """Login with admin credentials"""
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "email" in data or "user" in data, "Login response should contain user data"
        print(f"Logged in successfully")
    
    def test_02_create_test_items(self):
        """Create test items: 2 FG items and 1 RM item"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create RM item
        rm_payload = {
            "part_number": f"TEST_JOS_RM_{unique_id}",
            "name": f"Test RM for Job OS {unique_id}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 50.0,
            "current_stock": 100,
            "hsn_code": "7204"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/items", json=rm_payload)
        assert response.status_code == 201, f"Failed to create RM: {response.text}"
        TestJobOSConsolidation.test_data["rm"] = response.json()
        print(f"Created RM item: {TestJobOSConsolidation.test_data['rm']['id']}")
        
        # Create FG item A
        fg_a_payload = {
            "part_number": f"TEST_JOS_FG_A_{unique_id}",
            "name": f"Test FG Item A for Job OS {unique_id}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 200.0,
            "current_stock": 0,
            "hsn_code": "8481"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/items", json=fg_a_payload)
        assert response.status_code == 201, f"Failed to create FG A: {response.text}"
        TestJobOSConsolidation.test_data["fg_a"] = response.json()
        print(f"Created FG item A: {TestJobOSConsolidation.test_data['fg_a']['id']}")
        
        # Create FG item B
        fg_b_payload = {
            "part_number": f"TEST_JOS_FG_B_{unique_id}",
            "name": f"Test FG Item B for Job OS {unique_id}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 300.0,
            "current_stock": 0,
            "hsn_code": "8482"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/items", json=fg_b_payload)
        assert response.status_code == 201, f"Failed to create FG B: {response.text}"
        TestJobOSConsolidation.test_data["fg_b"] = response.json()
        print(f"Created FG item B: {TestJobOSConsolidation.test_data['fg_b']['id']}")
    
    def test_03_create_suppliers(self):
        """Create 2 suppliers: Supplier X and Supplier Y"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Supplier X
        supplier_x_payload = {
            "name": f"TEST_JOS_Supplier_X_{unique_id}",
            "code": f"TEST_SUP_X_{unique_id}",
            "contact_person": "Test Contact X",
            "email": f"supplierx_{unique_id}@test.com",
            "phone": "1234567890",
            "status": "active"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/suppliers", json=supplier_x_payload)
        assert response.status_code == 201, f"Failed to create Supplier X: {response.text}"
        TestJobOSConsolidation.test_data["supplier_x"] = response.json()
        print(f"Created Supplier X: {TestJobOSConsolidation.test_data['supplier_x']['id']}")
        
        # Supplier Y
        supplier_y_payload = {
            "name": f"TEST_JOS_Supplier_Y_{unique_id}",
            "code": f"TEST_SUP_Y_{unique_id}",
            "contact_person": "Test Contact Y",
            "email": f"suppliery_{unique_id}@test.com",
            "phone": "0987654321",
            "status": "active"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/suppliers", json=supplier_y_payload)
        assert response.status_code == 201, f"Failed to create Supplier Y: {response.text}"
        TestJobOSConsolidation.test_data["supplier_y"] = response.json()
        print(f"Created Supplier Y: {TestJobOSConsolidation.test_data['supplier_y']['id']}")
    
    def test_04_create_routing(self):
        """Create routing for outsourceable operations"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create routing "Machining" that can be outsourced
        routing_payload = {
            "name": f"TEST_Machining_{unique_id}",
            "description": "Test machining operation for Job OS",
            "status": "active"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/routings", json=routing_payload)
        assert response.status_code == 201, f"Failed to create routing: {response.text}"
        TestJobOSConsolidation.test_data["routing"] = response.json()
        print(f"Created routing: {TestJobOSConsolidation.test_data['routing']['name']}")
    
    def test_05_create_boms(self):
        """Create BOMs for FG A and FG B with routing"""
        routing_name = TestJobOSConsolidation.test_data["routing"]["name"]
        
        # BOM for FG A - using /api/bom (singular)
        bom_a_payload = {
            "parent_item_id": TestJobOSConsolidation.test_data["fg_a"]["id"],
            "name": "BOM for FG A",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": TestJobOSConsolidation.test_data["rm"]["id"],
                    "quantity": 2.0,
                    "unit_of_measure": "kg",
                    "routings": [routing_name]
                }
            ],
            "parent_routings": [routing_name]
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/bom", json=bom_a_payload)
        assert response.status_code in [200, 201], f"Failed to create BOM A: {response.text}"
        TestJobOSConsolidation.test_data["bom_a"] = response.json()
        print(f"Created BOM A: {TestJobOSConsolidation.test_data['bom_a']['id']}")
        
        # BOM for FG B
        bom_b_payload = {
            "parent_item_id": TestJobOSConsolidation.test_data["fg_b"]["id"],
            "name": "BOM for FG B",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": TestJobOSConsolidation.test_data["rm"]["id"],
                    "quantity": 3.0,
                    "unit_of_measure": "kg",
                    "routings": [routing_name]
                }
            ],
            "parent_routings": [routing_name]
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/bom", json=bom_b_payload)
        assert response.status_code in [200, 201], f"Failed to create BOM B: {response.text}"
        TestJobOSConsolidation.test_data["bom_b"] = response.json()
        print(f"Created BOM B: {TestJobOSConsolidation.test_data['bom_b']['id']}")
    
    def test_06_create_production_orders(self):
        """Create 2 separate production orders for FG A and FG B"""
        due_date = (datetime.now() + timedelta(days=14)).isoformat()
        
        # Production Order A
        po_a_payload = {
            "bom_id": TestJobOSConsolidation.test_data["bom_a"]["id"],
            "quantity": 10,
            "due_date": due_date,
            "priority": "high",
            "notes": "Test PO A for Job OS consolidation"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/production", json=po_a_payload)
        assert response.status_code in [200, 201], f"Failed to create PO A: {response.text}"
        TestJobOSConsolidation.test_data["po_a"] = response.json()
        print(f"Created Production Order A: {TestJobOSConsolidation.test_data['po_a']['id']}")
        
        # Production Order B
        po_b_payload = {
            "bom_id": TestJobOSConsolidation.test_data["bom_b"]["id"],
            "quantity": 5,
            "due_date": due_date,
            "priority": "medium",
            "notes": "Test PO B for Job OS consolidation"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/production", json=po_b_payload)
        assert response.status_code in [200, 201], f"Failed to create PO B: {response.text}"
        TestJobOSConsolidation.test_data["po_b"] = response.json()
        print(f"Created Production Order B: {TestJobOSConsolidation.test_data['po_b']['id']}")
    
    def test_07_create_work_orders(self):
        """Create work orders for both production orders"""
        routing_id = TestJobOSConsolidation.test_data["routing"]["id"]
        
        # Work Order A
        wo_a_payload = {
            "production_order_id": TestJobOSConsolidation.test_data["po_a"]["id"],
            "routing_id": routing_id,
            "quantity": 10,
            "notes": "Test WO A for Job OS"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/work-orders", json=wo_a_payload)
        assert response.status_code == 201, f"Failed to create WO A: {response.text}"
        data = response.json()
        # Response is {"message": "...", "work_orders": [...]}
        work_orders = data.get("work_orders", [])
        assert len(work_orders) > 0, f"No work orders created: {data}"
        TestJobOSConsolidation.test_data["wo_a"] = work_orders[0]
        print(f"Created Work Order A: {TestJobOSConsolidation.test_data['wo_a']['id']}")
        
        # Work Order B
        wo_b_payload = {
            "production_order_id": TestJobOSConsolidation.test_data["po_b"]["id"],
            "routing_id": routing_id,
            "quantity": 5,
            "notes": "Test WO B for Job OS"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/work-orders", json=wo_b_payload)
        assert response.status_code == 201, f"Failed to create WO B: {response.text}"
        data = response.json()
        work_orders = data.get("work_orders", [])
        assert len(work_orders) > 0, f"No work orders created: {data}"
        TestJobOSConsolidation.test_data["wo_b"] = work_orders[0]
        print(f"Created Work Order B: {TestJobOSConsolidation.test_data['wo_b']['id']}")
    
    def test_08_start_work_orders(self):
        """Start both work orders to enable operation updates"""
        # Start WO A using POST /start endpoint
        response = TestJobOSConsolidation.session.post(
            f"{BASE_URL}/api/work-orders/{TestJobOSConsolidation.test_data['wo_a']['id']}/start"
        )
        assert response.status_code == 200, f"Failed to start WO A: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Failed to start WO A: {data}"
        print(f"Started WO A: {data.get('wo_number')}")
        
        # Refresh WO A data
        response = TestJobOSConsolidation.session.get(
            f"{BASE_URL}/api/work-orders/{TestJobOSConsolidation.test_data['wo_a']['id']}"
        )
        assert response.status_code == 200
        TestJobOSConsolidation.test_data["wo_a"] = response.json()
        
        # Start WO B using POST /start endpoint
        response = TestJobOSConsolidation.session.post(
            f"{BASE_URL}/api/work-orders/{TestJobOSConsolidation.test_data['wo_b']['id']}/start"
        )
        assert response.status_code == 200, f"Failed to start WO B: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Failed to start WO B: {data}"
        print(f"Started WO B: {data.get('wo_number')}")
        
        # Refresh WO B data
        response = TestJobOSConsolidation.session.get(
            f"{BASE_URL}/api/work-orders/{TestJobOSConsolidation.test_data['wo_b']['id']}"
        )
        assert response.status_code == 200
        TestJobOSConsolidation.test_data["wo_b"] = response.json()
    
    def test_09_outsource_op_on_mo_a_to_supplier_x(self):
        """Outsource operation on MO-A to Supplier X - should create new SC"""
        wo_a = TestJobOSConsolidation.test_data["wo_a"]
        operations = wo_a.get("operations_status", [])
        
        if not operations:
            pytest.skip("No operations found in WO A")
        
        # Get first operation sequence
        first_op_seq = operations[0].get("sequence", 10)
        print(f"Outsourcing operation {first_op_seq} on WO A to Supplier X")
        
        # Outsource operation to Supplier X
        outsource_payload = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": TestJobOSConsolidation.test_data["supplier_x"]["id"],
            "outsource_charges": 50.0
        }
        response = TestJobOSConsolidation.session.put(
            f"{BASE_URL}/api/work-orders/{wo_a['id']}/operations/{first_op_seq}",
            json=outsource_payload
        )
        assert response.status_code == 200, f"Failed to outsource op on WO A: {response.text}"
        data = response.json()
        print(f"Outsource response for WO A: {data.get('operations_status', [])}")
        
        # Find the SC order created - using /api/job-work/orders
        sc_response = TestJobOSConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200, f"Failed to get SC orders: {sc_response.text}"
        sc_orders = sc_response.json()
        
        # Find SC for Supplier X with without_material type
        for sc in sc_orders:
            if (sc.get("supplier_id") == TestJobOSConsolidation.test_data["supplier_x"]["id"] and 
                sc.get("subcontract_type") == "without_material"):
                TestJobOSConsolidation.test_data["sc_order"] = sc
                break
        
        assert "sc_order" in TestJobOSConsolidation.test_data, "SC order not found for Supplier X"
        print(f"SC Order created: {TestJobOSConsolidation.test_data['sc_order']['id']}")
    
    def test_10_verify_sc_order_has_item_a(self):
        """Verify SC order has item A in job_work_parts"""
        sc_id = TestJobOSConsolidation.test_data["sc_order"]["id"]
        
        # Get SC order details - using /api/job-work/orders
        sc_response = TestJobOSConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200, f"Failed to get SC orders: {sc_response.text}"
        sc_orders = sc_response.json()
        
        sc_order = None
        for sc in sc_orders:
            if sc.get("id") == sc_id:
                sc_order = sc
                break
        
        assert sc_order is not None, f"SC order {sc_id} not found"
        print(f"SC Order details: {sc_order}")
        
        # Verify job_work_parts contains item A (FG A)
        jwp = sc_order.get("job_work_parts", [])
        assert len(jwp) >= 1, f"Expected at least 1 job_work_part, got {len(jwp)}"
        
        fg_a_id = TestJobOSConsolidation.test_data["fg_a"]["id"]
        item_a_found = False
        for part in jwp:
            if part.get("item_id") == fg_a_id:
                item_a_found = True
                assert part.get("quantity") == 10, f"Expected quantity 10, got {part.get('quantity')}"
                break
        
        assert item_a_found, f"FG A not found in job_work_parts: {jwp}"
        print(f"Verified: SC order has FG A with quantity 10")
    
    def test_11_outsource_op_on_mo_b_to_same_supplier_x(self):
        """CRITICAL: Outsource operation on MO-B to SAME Supplier X - should consolidate into SAME SC"""
        wo_b = TestJobOSConsolidation.test_data["wo_b"]
        operations = wo_b.get("operations_status", [])
        
        if not operations:
            pytest.skip("No operations found in WO B")
        
        # Get first operation sequence
        first_op_seq = operations[0].get("sequence", 10)
        print(f"Outsourcing operation {first_op_seq} on WO B to Supplier X (same supplier)")
        
        # Outsource operation to Supplier X (same supplier)
        outsource_payload = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": TestJobOSConsolidation.test_data["supplier_x"]["id"],
            "outsource_charges": 75.0
        }
        response = TestJobOSConsolidation.session.put(
            f"{BASE_URL}/api/work-orders/{wo_b['id']}/operations/{first_op_seq}",
            json=outsource_payload
        )
        assert response.status_code == 200, f"Failed to outsource op on WO B: {response.text}"
        print(f"Outsource response for WO B completed")
    
    def test_12_verify_consolidated_sc_has_both_items(self):
        """CRITICAL: Verify consolidated SC has BOTH items in job_work_parts"""
        sc_id = TestJobOSConsolidation.test_data["sc_order"]["id"]
        
        # Get SC order details
        sc_response = TestJobOSConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200, f"Failed to get SC orders: {sc_response.text}"
        sc_orders = sc_response.json()
        
        sc_order = None
        for sc in sc_orders:
            if sc.get("id") == sc_id:
                sc_order = sc
                break
        
        assert sc_order is not None, f"SC order {sc_id} not found"
        print(f"Consolidated SC Order: {sc_order}")
        
        # Verify job_work_parts contains BOTH items
        jwp = sc_order.get("job_work_parts", [])
        assert len(jwp) >= 2, f"Expected at least 2 job_work_parts after consolidation, got {len(jwp)}"
        
        fg_a_id = TestJobOSConsolidation.test_data["fg_a"]["id"]
        fg_b_id = TestJobOSConsolidation.test_data["fg_b"]["id"]
        
        item_a_found = False
        item_b_found = False
        for part in jwp:
            if part.get("item_id") == fg_a_id:
                item_a_found = True
                assert part.get("quantity") == 10, f"Expected FG A quantity 10, got {part.get('quantity')}"
            if part.get("item_id") == fg_b_id:
                item_b_found = True
                assert part.get("quantity") == 5, f"Expected FG B quantity 5, got {part.get('quantity')}"
        
        assert item_a_found, f"FG A not found in consolidated job_work_parts: {jwp}"
        assert item_b_found, f"FG B not found in consolidated job_work_parts: {jwp}"
        
        # Verify reference_wo_ids contains both WO IDs
        ref_wo_ids = sc_order.get("reference_wo_ids", [])
        wo_a_id = TestJobOSConsolidation.test_data["wo_a"]["id"]
        wo_b_id = TestJobOSConsolidation.test_data["wo_b"]["id"]
        
        assert wo_a_id in ref_wo_ids, f"WO A ID not in reference_wo_ids: {ref_wo_ids}"
        assert wo_b_id in ref_wo_ids, f"WO B ID not in reference_wo_ids: {ref_wo_ids}"
        
        print(f"VERIFIED: Consolidated SC has both items and both WO IDs")
        print(f"  - job_work_parts: {len(jwp)} items")
        print(f"  - reference_wo_ids: {ref_wo_ids}")
    
    def test_13_outsource_to_different_supplier_creates_separate_sc(self):
        """Outsource to different supplier (Y) should create SEPARATE SC"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create another FG item for this test
        fg_c_payload = {
            "part_number": f"TEST_JOS_FG_C_{unique_id}",
            "name": f"Test FG Item C for Job OS {unique_id}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 400.0,
            "current_stock": 0,
            "hsn_code": "8483"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/items", json=fg_c_payload)
        assert response.status_code == 201, f"Failed to create FG C: {response.text}"
        fg_c = response.json()
        
        # Create BOM for FG C - using /api/bom (singular)
        routing_name = TestJobOSConsolidation.test_data["routing"]["name"]
        bom_c_payload = {
            "parent_item_id": fg_c["id"],
            "name": "BOM for FG C",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": TestJobOSConsolidation.test_data["rm"]["id"],
                    "quantity": 4.0,
                    "unit_of_measure": "kg",
                    "routings": [routing_name]
                }
            ],
            "parent_routings": [routing_name]
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/bom", json=bom_c_payload)
        assert response.status_code in [200, 201], f"Failed to create BOM C: {response.text}"
        bom_c = response.json()
        
        # Create Production Order C
        due_date = (datetime.now() + timedelta(days=14)).isoformat()
        po_c_payload = {
            "bom_id": bom_c["id"],
            "quantity": 8,
            "due_date": due_date,
            "priority": "low",
            "notes": "Test PO C for different supplier"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/production", json=po_c_payload)
        assert response.status_code in [200, 201], f"Failed to create PO C: {response.text}"
        po_c = response.json()
        
        # Create Work Order C
        routing_id = TestJobOSConsolidation.test_data["routing"]["id"]
        wo_c_payload = {
            "production_order_id": po_c["id"],
            "routing_id": routing_id,
            "quantity": 8,
            "notes": "Test WO C for different supplier"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/work-orders", json=wo_c_payload)
        assert response.status_code == 201, f"Failed to create WO C: {response.text}"
        data = response.json()
        work_orders = data.get("work_orders", [])
        assert len(work_orders) > 0, f"No work orders created: {data}"
        wo_c = work_orders[0]
        
        # Start WO C using POST /start endpoint
        response = TestJobOSConsolidation.session.post(
            f"{BASE_URL}/api/work-orders/{wo_c['id']}/start"
        )
        assert response.status_code == 200, f"Failed to start WO C: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Failed to start WO C: {data}"
        
        # Refresh WO C data
        response = TestJobOSConsolidation.session.get(
            f"{BASE_URL}/api/work-orders/{wo_c['id']}"
        )
        assert response.status_code == 200
        wo_c = response.json()
        
        # Get first operation sequence
        operations = wo_c.get("operations_status", [])
        if not operations:
            pytest.skip("No operations found in WO C")
        first_op_seq = operations[0].get("sequence", 10)
        
        # Outsource to Supplier Y (different supplier)
        outsource_payload = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": TestJobOSConsolidation.test_data["supplier_y"]["id"],
            "outsource_charges": 100.0
        }
        response = TestJobOSConsolidation.session.put(
            f"{BASE_URL}/api/work-orders/{wo_c['id']}/operations/{first_op_seq}",
            json=outsource_payload
        )
        assert response.status_code == 200, f"Failed to outsource op on WO C: {response.text}"
        print(f"Outsource response for WO C (different supplier) completed")
        
        # Find the new SC order for Supplier Y
        sc_response = TestJobOSConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200
        sc_orders = sc_response.json()
        
        new_sc_id = None
        for sc in sc_orders:
            if (sc.get("supplier_id") == TestJobOSConsolidation.test_data["supplier_y"]["id"] and 
                sc.get("subcontract_type") == "without_material"):
                new_sc_id = sc["id"]
                break
        
        assert new_sc_id is not None, "SC order not found for Supplier Y"
        
        # CRITICAL: Should be a DIFFERENT SC order ID
        assert new_sc_id != TestJobOSConsolidation.test_data["sc_order"]["id"], \
            f"Expected different SC for different supplier, but got same SC {new_sc_id}"
        
        TestJobOSConsolidation.test_data["sc_order_2"] = {"id": new_sc_id}
        print(f"VERIFIED: Different supplier created separate SC: {new_sc_id}")
    
    def test_14_confirm_sc_order(self):
        """Confirm the consolidated SC order before sending DC"""
        sc_id = TestJobOSConsolidation.test_data["sc_order"]["id"]
        response = TestJobOSConsolidation.session.put(
            f"{BASE_URL}/api/job-work/orders/{sc_id}",
            json={"status": "confirmed"}
        )
        assert response.status_code == 200, f"Failed to confirm SC order: {response.text}"
        TestJobOSConsolidation.test_data["sc_order"] = response.json()
        print(f"SC Order confirmed: {sc_id}")
    
    def test_15_send_dc_for_job_os_with_skip_stock_deduct(self):
        """Send DC for Job OS with skip_stock_deduct=true"""
        sc_order = TestJobOSConsolidation.test_data["sc_order"]
        
        # Build DC lines from job_work_parts
        dc_lines = []
        for part in sc_order.get("job_work_parts", []):
            dc_lines.append({
                "item_id": part["item_id"],
                "quantity": part["quantity"],
                "rate": part.get("charges", 0)
            })
        
        # Send DC with skip_stock_deduct=true
        dc_payload = {
            "subcontract_order_id": sc_order["id"],
            "lines": dc_lines,
            "skip_stock_deduct": True,
            "notes": "Job OS DC - skip stock deduct"
        }
        response = TestJobOSConsolidation.session.post(f"{BASE_URL}/api/job-work/challans", json=dc_payload)
        assert response.status_code in [200, 201], f"Failed to create DC: {response.text}"
        data = response.json()
        
        # Check if it's a success response or error
        if isinstance(data, dict) and data.get("success") == False:
            pytest.fail(f"DC creation failed: {data}")
        
        TestJobOSConsolidation.test_data["dc"] = data
        assert data.get("id") is not None, f"DC ID not found in response: {data}"
        print(f"DC created: {data.get('id')}")
        print(f"DC number: {data.get('dc_number')}")
    
    def test_16_verify_dc_updates_job_work_parts_sent_quantity(self):
        """Verify DC creation updates job_work_parts sent_quantity"""
        sc_id = TestJobOSConsolidation.test_data["sc_order"]["id"]
        
        # Get SC order details
        sc_response = TestJobOSConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200, f"Failed to get SC orders: {sc_response.text}"
        sc_orders = sc_response.json()
        
        sc_order = None
        for sc in sc_orders:
            if sc.get("id") == sc_id:
                sc_order = sc
                break
        
        assert sc_order is not None, f"SC order {sc_id} not found"
        print(f"SC Order after DC: {sc_order}")
        
        # Verify sent_quantity is updated in job_work_parts
        jwp = sc_order.get("job_work_parts", [])
        for part in jwp:
            sent_qty = part.get("sent_quantity", 0)
            expected_qty = part.get("quantity", 0)
            assert sent_qty == expected_qty, \
                f"Expected sent_quantity {expected_qty} for item {part.get('item_id')}, got {sent_qty}"
            print(f"Item {part.get('item_id')}: sent_quantity = {sent_qty}")
        
        print("VERIFIED: job_work_parts sent_quantity updated correctly")
    
    def test_17_verify_dc_sets_dc_created_true(self):
        """Verify DC creation sets dc_created=true on SC order"""
        sc_id = TestJobOSConsolidation.test_data["sc_order"]["id"]
        
        # Get SC order details
        sc_response = TestJobOSConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200, f"Failed to get SC orders: {sc_response.text}"
        sc_orders = sc_response.json()
        
        sc_order = None
        for sc in sc_orders:
            if sc.get("id") == sc_id:
                sc_order = sc
                break
        
        assert sc_order is not None, f"SC order {sc_id} not found"
        
        dc_created = sc_order.get("dc_created", False)
        assert dc_created == True, f"Expected dc_created=True, got {dc_created}"
        print("VERIFIED: dc_created=True on SC order")
    
    def test_18_verify_stock_not_deducted_for_job_os(self):
        """Verify stock was NOT deducted for Job OS items (skip_stock_deduct=true)"""
        # Get FG A stock
        fg_a_id = TestJobOSConsolidation.test_data["fg_a"]["id"]
        response = TestJobOSConsolidation.session.get(f"{BASE_URL}/api/items/{fg_a_id}")
        assert response.status_code == 200, f"Failed to get FG A: {response.text}"
        fg_a = response.json()
        
        # Get FG B stock
        fg_b_id = TestJobOSConsolidation.test_data["fg_b"]["id"]
        response = TestJobOSConsolidation.session.get(f"{BASE_URL}/api/items/{fg_b_id}")
        assert response.status_code == 200, f"Failed to get FG B: {response.text}"
        fg_b = response.json()
        
        # Stock should still be 0 (not negative) since skip_stock_deduct=true
        # For Job OS, parts go for processing, not consumed from stock
        assert fg_a.get("current_stock", 0) >= 0, f"FG A stock went negative: {fg_a.get('current_stock')}"
        assert fg_b.get("current_stock", 0) >= 0, f"FG B stock went negative: {fg_b.get('current_stock')}"
        
        print(f"FG A stock: {fg_a.get('current_stock', 0)}")
        print(f"FG B stock: {fg_b.get('current_stock', 0)}")
        print("VERIFIED: Stock not deducted for Job OS items")


class TestRegressionSCWithRM:
    """Regression test: SC with RM flow still works"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for all tests"""
        if TestRegressionSCWithRM.session is None:
            TestRegressionSCWithRM.session = requests.Session()
            TestRegressionSCWithRM.session.headers.update({"Content-Type": "application/json"})
    
    def test_01_login(self):
        """Login with admin credentials"""
        response = TestRegressionSCWithRM.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        print("Logged in for regression test")
    
    def test_02_create_items(self):
        """Create RM and FG items for regression test"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create RM item
        rm_payload = {
            "part_number": f"TEST_REG_RM_{unique_id}",
            "name": f"Test RM for Regression {unique_id}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 100.0,
            "current_stock": 500,
            "hsn_code": "7204"
        }
        response = TestRegressionSCWithRM.session.post(f"{BASE_URL}/api/items", json=rm_payload)
        assert response.status_code == 201, f"Failed to create RM: {response.text}"
        TestRegressionSCWithRM.test_data["rm"] = response.json()
        
        # Create SA item
        sa_payload = {
            "part_number": f"TEST_REG_SA_{unique_id}",
            "name": f"Test SA for Regression {unique_id}",
            "category": "sub_assembly",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0,
            "current_stock": 0,
            "hsn_code": "8481"
        }
        response = TestRegressionSCWithRM.session.post(f"{BASE_URL}/api/items", json=sa_payload)
        assert response.status_code == 201, f"Failed to create SA: {response.text}"
        TestRegressionSCWithRM.test_data["sa"] = response.json()
        print(f"Created items: RM={TestRegressionSCWithRM.test_data['rm']['id']}, SA={TestRegressionSCWithRM.test_data['sa']['id']}")
    
    def test_03_create_supplier(self):
        """Create supplier for regression test"""
        unique_id = str(uuid.uuid4())[:8]
        supplier_payload = {
            "name": f"TEST_REG_Supplier_{unique_id}",
            "code": f"TEST_REG_SUP_{unique_id}",
            "contact_person": "Test Contact",
            "email": f"regsupplier_{unique_id}@test.com",
            "phone": "1111111111",
            "status": "active"
        }
        response = TestRegressionSCWithRM.session.post(f"{BASE_URL}/api/suppliers", json=supplier_payload)
        assert response.status_code == 201, f"Failed to create supplier: {response.text}"
        TestRegressionSCWithRM.test_data["supplier"] = response.json()
        print(f"Created supplier: {TestRegressionSCWithRM.test_data['supplier']['id']}")
    
    def test_04_create_sc_with_material(self):
        """Create SC order with material (with_material type) using direct API"""
        # Create SC order with RM lines and job_work_parts
        sc_payload = {
            "supplier_id": TestRegressionSCWithRM.test_data["supplier"]["id"],
            "lines": [
                {
                    "item_id": TestRegressionSCWithRM.test_data["rm"]["id"],
                    "quantity": 50,
                    "rate": 100
                }
            ],
            "job_work_parts": [
                {
                    "item_id": TestRegressionSCWithRM.test_data["sa"]["id"],
                    "quantity": 10,
                    "charges": 200.0
                }
            ],
            "expected_return_date": (datetime.now() + timedelta(days=14)).isoformat(),
            "processing_charges": 2000,
            "notes": "Regression test SC with material"
        }
        response = TestRegressionSCWithRM.session.post(f"{BASE_URL}/api/job-work/orders", json=sc_payload)
        assert response.status_code in [200, 201], f"Failed to create SC: {response.text}"
        TestRegressionSCWithRM.test_data["sc_order"] = response.json()
        
        # Verify SC has lines (RM items)
        sc_order = TestRegressionSCWithRM.test_data["sc_order"]
        assert "lines" in sc_order, f"SC order missing lines: {sc_order}"
        assert len(sc_order.get("lines", [])) > 0, f"SC order has no lines: {sc_order}"
        
        print(f"Created SC with material: {sc_order['id']}")
        print(f"SC lines: {sc_order.get('lines', [])}")
    
    def test_05_verify_sc_with_material_has_rm_lines(self):
        """Verify SC with material has RM lines"""
        sc_id = TestRegressionSCWithRM.test_data["sc_order"]["id"]
        
        # Get SC order details from list
        sc_response = TestRegressionSCWithRM.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200, f"Failed to get SC orders: {sc_response.text}"
        sc_orders = sc_response.json()
        
        sc_order = None
        for sc in sc_orders:
            if sc.get("id") == sc_id:
                sc_order = sc
                break
        
        assert sc_order is not None, f"SC order {sc_id} not found"
        
        # Verify subcontract_type is with_material (default)
        sc_type = sc_order.get("subcontract_type", "with_material")
        assert sc_type == "with_material", f"Expected with_material, got {sc_type}"
        
        # Verify lines contain RM item
        lines = sc_order.get("lines", [])
        rm_id = TestRegressionSCWithRM.test_data["rm"]["id"]
        rm_found = False
        for line in lines:
            if line.get("item_id") == rm_id:
                rm_found = True
                break
        
        assert rm_found, f"RM item not found in SC lines: {lines}"
        print("VERIFIED: SC with material has RM lines")
    
    def test_06_confirm_and_send_dc_for_sc_with_rm(self):
        """Confirm SC and send DC for SC with RM (stock should be deducted)"""
        sc_id = TestRegressionSCWithRM.test_data["sc_order"]["id"]
        
        # Confirm SC
        response = TestRegressionSCWithRM.session.put(
            f"{BASE_URL}/api/job-work/orders/{sc_id}",
            json={"status": "confirmed"}
        )
        assert response.status_code == 200, f"Failed to confirm SC: {response.text}"
        TestRegressionSCWithRM.test_data["sc_order"] = response.json()
        print("SC confirmed")
        
        # Get RM stock before DC
        rm_id = TestRegressionSCWithRM.test_data["rm"]["id"]
        response = TestRegressionSCWithRM.session.get(f"{BASE_URL}/api/items/{rm_id}")
        assert response.status_code == 200
        rm_before = response.json()
        stock_before = rm_before.get("current_stock", 0)
        print(f"RM stock before DC: {stock_before}")
        
        # Send DC (without skip_stock_deduct - should deduct stock)
        dc_payload = {
            "subcontract_order_id": sc_id,
            "lines": [
                {
                    "item_id": rm_id,
                    "quantity": 50
                }
            ]
        }
        response = TestRegressionSCWithRM.session.post(f"{BASE_URL}/api/job-work/challans", json=dc_payload)
        assert response.status_code in [200, 201], f"Failed to create DC: {response.text}"
        dc = response.json()
        
        if isinstance(dc, dict) and dc.get("success") == False:
            pytest.fail(f"DC creation failed: {dc}")
        
        TestRegressionSCWithRM.test_data["dc"] = dc
        print(f"DC created: {dc.get('dc_number')}")
        
        # Verify stock was deducted
        response = TestRegressionSCWithRM.session.get(f"{BASE_URL}/api/items/{rm_id}")
        assert response.status_code == 200
        rm_after = response.json()
        stock_after = rm_after.get("current_stock", 0)
        print(f"RM stock after DC: {stock_after}")
        
        expected_stock = stock_before - 50
        assert stock_after == expected_stock, f"Expected stock {expected_stock}, got {stock_after}"
        print("VERIFIED: Stock deducted for SC with RM")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
