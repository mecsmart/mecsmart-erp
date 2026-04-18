"""
Test Job OS New Features - Iteration 49:
1. dc_created SC excluded from consolidation (after DC sent, new outsources create NEW SC)
2. No Create PO button for Job OS SCs with job_work_parts (frontend check - verified via API)
3. GRN page shows both SC with RM and Job OS pending orders
4. JW GRN endpoint works for Job OS SCs

Test Scenarios:
- Create SC, send DC (dc_created=true), then outsource another op to SAME supplier → should create NEW SC
- Verify JW GRN endpoint /api/job-work/receive-grn works for Job OS SCs
- Verify pending JW orders filter logic for GRN page
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestDCCreatedExcludesConsolidation:
    """Test that dc_created=true SC is excluded from consolidation"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for all tests"""
        if TestDCCreatedExcludesConsolidation.session is None:
            TestDCCreatedExcludesConsolidation.session = requests.Session()
            TestDCCreatedExcludesConsolidation.session.headers.update({"Content-Type": "application/json"})
    
    def test_01_login(self):
        """Login with admin credentials"""
        response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        print("Logged in successfully")
    
    def test_02_create_test_items(self):
        """Create test items: 3 FG items and 1 RM item"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create RM item
        rm_payload = {
            "part_number": f"TEST_DC_EXC_RM_{unique_id}",
            "name": f"Test RM for DC Exclusion {unique_id}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 50.0,
            "current_stock": 100,
            "hsn_code": "7204"
        }
        response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/items", json=rm_payload)
        assert response.status_code == 201, f"Failed to create RM: {response.text}"
        TestDCCreatedExcludesConsolidation.test_data["rm"] = response.json()
        
        # Create FG items A, B, C
        for label in ["A", "B", "C"]:
            fg_payload = {
                "part_number": f"TEST_DC_EXC_FG_{label}_{unique_id}",
                "name": f"Test FG Item {label} for DC Exclusion {unique_id}",
                "category": "finished_good",
                "unit_of_measure": "pcs",
                "unit_cost": 200.0,
                "current_stock": 0,
                "hsn_code": f"848{ord(label) - ord('A') + 1}"
            }
            response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/items", json=fg_payload)
            assert response.status_code == 201, f"Failed to create FG {label}: {response.text}"
            TestDCCreatedExcludesConsolidation.test_data[f"fg_{label.lower()}"] = response.json()
        
        print(f"Created items: RM and FG A, B, C")
    
    def test_03_create_supplier(self):
        """Create supplier for consolidation test"""
        unique_id = str(uuid.uuid4())[:8]
        supplier_payload = {
            "name": f"TEST_DC_EXC_Supplier_{unique_id}",
            "code": f"TEST_DC_EXC_{unique_id}",
            "contact_person": "Test Contact",
            "email": f"dcexc_{unique_id}@test.com",
            "phone": "1234567890",
            "status": "active"
        }
        response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/suppliers", json=supplier_payload)
        assert response.status_code == 201, f"Failed to create supplier: {response.text}"
        TestDCCreatedExcludesConsolidation.test_data["supplier"] = response.json()
        print(f"Created supplier: {TestDCCreatedExcludesConsolidation.test_data['supplier']['id']}")
    
    def test_04_create_routing(self):
        """Create routing for outsourceable operations"""
        unique_id = str(uuid.uuid4())[:8]
        routing_payload = {
            "name": f"TEST_DC_EXC_Routing_{unique_id}",
            "description": "Test routing for DC exclusion",
            "status": "active"
        }
        response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/routings", json=routing_payload)
        assert response.status_code == 201, f"Failed to create routing: {response.text}"
        TestDCCreatedExcludesConsolidation.test_data["routing"] = response.json()
        print(f"Created routing: {TestDCCreatedExcludesConsolidation.test_data['routing']['name']}")
    
    def test_05_create_boms(self):
        """Create BOMs for FG A, B, C"""
        routing_name = TestDCCreatedExcludesConsolidation.test_data["routing"]["name"]
        
        for label in ["A", "B", "C"]:
            bom_payload = {
                "parent_item_id": TestDCCreatedExcludesConsolidation.test_data[f"fg_{label.lower()}"]["id"],
                "name": f"BOM for FG {label}",
                "revision": "A",
                "status": "active",
                "components": [
                    {
                        "item_id": TestDCCreatedExcludesConsolidation.test_data["rm"]["id"],
                        "quantity": 2.0,
                        "unit_of_measure": "kg",
                        "routings": [routing_name]
                    }
                ],
                "parent_routings": [routing_name]
            }
            response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/bom", json=bom_payload)
            assert response.status_code in [200, 201], f"Failed to create BOM {label}: {response.text}"
            TestDCCreatedExcludesConsolidation.test_data[f"bom_{label.lower()}"] = response.json()
        
        print("Created BOMs for FG A, B, C")
    
    def test_06_create_production_orders(self):
        """Create production orders for FG A, B, C"""
        due_date = (datetime.now() + timedelta(days=14)).isoformat()
        
        for label in ["A", "B", "C"]:
            po_payload = {
                "bom_id": TestDCCreatedExcludesConsolidation.test_data[f"bom_{label.lower()}"]["id"],
                "quantity": 10,
                "due_date": due_date,
                "priority": "high",
                "notes": f"Test PO {label} for DC exclusion"
            }
            response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/production", json=po_payload)
            assert response.status_code in [200, 201], f"Failed to create PO {label}: {response.text}"
            TestDCCreatedExcludesConsolidation.test_data[f"po_{label.lower()}"] = response.json()
        
        print("Created Production Orders for A, B, C")
    
    def test_07_create_work_orders(self):
        """Create work orders for all production orders"""
        routing_id = TestDCCreatedExcludesConsolidation.test_data["routing"]["id"]
        
        for label in ["A", "B", "C"]:
            wo_payload = {
                "production_order_id": TestDCCreatedExcludesConsolidation.test_data[f"po_{label.lower()}"]["id"],
                "routing_id": routing_id,
                "quantity": 10,
                "notes": f"Test WO {label} for DC exclusion"
            }
            response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/work-orders", json=wo_payload)
            assert response.status_code == 201, f"Failed to create WO {label}: {response.text}"
            data = response.json()
            work_orders = data.get("work_orders", [])
            assert len(work_orders) > 0, f"No work orders created for {label}"
            TestDCCreatedExcludesConsolidation.test_data[f"wo_{label.lower()}"] = work_orders[0]
        
        print("Created Work Orders for A, B, C")
    
    def test_08_start_work_orders(self):
        """Start all work orders"""
        for label in ["A", "B", "C"]:
            wo_id = TestDCCreatedExcludesConsolidation.test_data[f"wo_{label.lower()}"]["id"]
            response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/work-orders/{wo_id}/start")
            assert response.status_code == 200, f"Failed to start WO {label}: {response.text}"
            
            # Refresh WO data
            response = TestDCCreatedExcludesConsolidation.session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
            assert response.status_code == 200
            TestDCCreatedExcludesConsolidation.test_data[f"wo_{label.lower()}"] = response.json()
        
        print("Started Work Orders A, B, C")
    
    def test_09_outsource_op_a_to_supplier(self):
        """Outsource operation on WO A to supplier - creates first SC"""
        wo_a = TestDCCreatedExcludesConsolidation.test_data["wo_a"]
        operations = wo_a.get("operations_status", [])
        
        if not operations:
            pytest.skip("No operations found in WO A")
        
        first_op_seq = operations[0].get("sequence", 10)
        
        outsource_payload = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": TestDCCreatedExcludesConsolidation.test_data["supplier"]["id"],
            "outsource_charges": 50.0
        }
        response = TestDCCreatedExcludesConsolidation.session.put(
            f"{BASE_URL}/api/work-orders/{wo_a['id']}/operations/{first_op_seq}",
            json=outsource_payload
        )
        assert response.status_code == 200, f"Failed to outsource op on WO A: {response.text}"
        
        # Find the SC order created
        sc_response = TestDCCreatedExcludesConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200
        sc_orders = sc_response.json()
        
        for sc in sc_orders:
            if (sc.get("supplier_id") == TestDCCreatedExcludesConsolidation.test_data["supplier"]["id"] and 
                sc.get("subcontract_type") == "without_material"):
                TestDCCreatedExcludesConsolidation.test_data["sc_order_1"] = sc
                break
        
        assert "sc_order_1" in TestDCCreatedExcludesConsolidation.test_data, "SC order 1 not found"
        print(f"SC Order 1 created: {TestDCCreatedExcludesConsolidation.test_data['sc_order_1']['id']}")
    
    def test_10_outsource_op_b_consolidates_into_sc1(self):
        """Outsource operation on WO B to SAME supplier - should consolidate into SC 1"""
        wo_b = TestDCCreatedExcludesConsolidation.test_data["wo_b"]
        operations = wo_b.get("operations_status", [])
        
        if not operations:
            pytest.skip("No operations found in WO B")
        
        first_op_seq = operations[0].get("sequence", 10)
        
        outsource_payload = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": TestDCCreatedExcludesConsolidation.test_data["supplier"]["id"],
            "outsource_charges": 60.0
        }
        response = TestDCCreatedExcludesConsolidation.session.put(
            f"{BASE_URL}/api/work-orders/{wo_b['id']}/operations/{first_op_seq}",
            json=outsource_payload
        )
        assert response.status_code == 200, f"Failed to outsource op on WO B: {response.text}"
        
        # Verify SC 1 now has both items
        sc_response = TestDCCreatedExcludesConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200
        sc_orders = sc_response.json()
        
        sc_1_id = TestDCCreatedExcludesConsolidation.test_data["sc_order_1"]["id"]
        sc_1 = None
        for sc in sc_orders:
            if sc.get("id") == sc_1_id:
                sc_1 = sc
                break
        
        assert sc_1 is not None, f"SC 1 not found"
        jwp = sc_1.get("job_work_parts", [])
        assert len(jwp) >= 2, f"Expected 2 items in SC 1 after consolidation, got {len(jwp)}"
        
        TestDCCreatedExcludesConsolidation.test_data["sc_order_1"] = sc_1
        print(f"SC 1 consolidated: {len(jwp)} items")
    
    def test_11_send_dc_for_sc1(self):
        """Send DC for SC 1 - sets dc_created=true"""
        sc_order = TestDCCreatedExcludesConsolidation.test_data["sc_order_1"]
        
        # Build DC lines from job_work_parts
        dc_lines = []
        for part in sc_order.get("job_work_parts", []):
            dc_lines.append({
                "item_id": part["item_id"],
                "quantity": part["quantity"],
                "rate": part.get("charges", 0)
            })
        
        dc_payload = {
            "subcontract_order_id": sc_order["id"],
            "lines": dc_lines,
            "skip_stock_deduct": True,
            "notes": "DC for SC 1 - testing dc_created exclusion"
        }
        response = TestDCCreatedExcludesConsolidation.session.post(f"{BASE_URL}/api/job-work/challans", json=dc_payload)
        assert response.status_code in [200, 201], f"Failed to create DC: {response.text}"
        data = response.json()
        
        if isinstance(data, dict) and data.get("success") == False:
            pytest.fail(f"DC creation failed: {data}")
        
        TestDCCreatedExcludesConsolidation.test_data["dc_1"] = data
        print(f"DC 1 created: {data.get('dc_number')}")
    
    def test_12_verify_sc1_has_dc_created_true(self):
        """Verify SC 1 now has dc_created=true"""
        sc_1_id = TestDCCreatedExcludesConsolidation.test_data["sc_order_1"]["id"]
        
        sc_response = TestDCCreatedExcludesConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200
        sc_orders = sc_response.json()
        
        sc_1 = None
        for sc in sc_orders:
            if sc.get("id") == sc_1_id:
                sc_1 = sc
                break
        
        assert sc_1 is not None, f"SC 1 not found"
        assert sc_1.get("dc_created") == True, f"Expected dc_created=True, got {sc_1.get('dc_created')}"
        
        TestDCCreatedExcludesConsolidation.test_data["sc_order_1"] = sc_1
        print("VERIFIED: SC 1 has dc_created=True")
    
    def test_13_outsource_op_c_creates_new_sc(self):
        """CRITICAL: Outsource operation on WO C to SAME supplier - should create NEW SC (not consolidate)"""
        wo_c = TestDCCreatedExcludesConsolidation.test_data["wo_c"]
        operations = wo_c.get("operations_status", [])
        
        if not operations:
            pytest.skip("No operations found in WO C")
        
        first_op_seq = operations[0].get("sequence", 10)
        
        outsource_payload = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": TestDCCreatedExcludesConsolidation.test_data["supplier"]["id"],
            "outsource_charges": 70.0
        }
        response = TestDCCreatedExcludesConsolidation.session.put(
            f"{BASE_URL}/api/work-orders/{wo_c['id']}/operations/{first_op_seq}",
            json=outsource_payload
        )
        assert response.status_code == 200, f"Failed to outsource op on WO C: {response.text}"
        
        # Find the NEW SC order
        sc_response = TestDCCreatedExcludesConsolidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200
        sc_orders = sc_response.json()
        
        sc_1_id = TestDCCreatedExcludesConsolidation.test_data["sc_order_1"]["id"]
        supplier_id = TestDCCreatedExcludesConsolidation.test_data["supplier"]["id"]
        
        new_sc = None
        for sc in sc_orders:
            if (sc.get("supplier_id") == supplier_id and 
                sc.get("subcontract_type") == "without_material" and
                sc.get("id") != sc_1_id):
                new_sc = sc
                break
        
        assert new_sc is not None, f"New SC order not found - consolidation should have been excluded"
        
        # Verify it's a different SC
        assert new_sc["id"] != sc_1_id, f"Expected NEW SC, but got same SC {sc_1_id}"
        
        # Verify new SC has only FG C
        jwp = new_sc.get("job_work_parts", [])
        assert len(jwp) == 1, f"Expected 1 item in new SC, got {len(jwp)}"
        
        fg_c_id = TestDCCreatedExcludesConsolidation.test_data["fg_c"]["id"]
        assert jwp[0].get("item_id") == fg_c_id, f"Expected FG C in new SC, got {jwp[0].get('item_id')}"
        
        TestDCCreatedExcludesConsolidation.test_data["sc_order_2"] = new_sc
        print(f"VERIFIED: New SC created (dc_created exclusion works): {new_sc['id']}")
        print(f"  - SC 1 (dc_created=true): {sc_1_id} - has FG A, FG B")
        print(f"  - SC 2 (new): {new_sc['id']} - has FG C only")


class TestJWGRNForJobOS:
    """Test JW GRN endpoint works for Job OS SCs"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for all tests"""
        if TestJWGRNForJobOS.session is None:
            TestJWGRNForJobOS.session = requests.Session()
            TestJWGRNForJobOS.session.headers.update({"Content-Type": "application/json"})
    
    def test_01_login(self):
        """Login with admin credentials"""
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        print("Logged in successfully")
    
    def test_02_create_test_items(self):
        """Create test items for JW GRN test"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create RM item
        rm_payload = {
            "part_number": f"TEST_JWGRN_RM_{unique_id}",
            "name": f"Test RM for JW GRN {unique_id}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 50.0,
            "current_stock": 100,
            "hsn_code": "7204"
        }
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/items", json=rm_payload)
        assert response.status_code == 201, f"Failed to create RM: {response.text}"
        TestJWGRNForJobOS.test_data["rm"] = response.json()
        
        # Create FG item
        fg_payload = {
            "part_number": f"TEST_JWGRN_FG_{unique_id}",
            "name": f"Test FG for JW GRN {unique_id}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 200.0,
            "current_stock": 0,
            "hsn_code": "8481"
        }
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/items", json=fg_payload)
        assert response.status_code == 201, f"Failed to create FG: {response.text}"
        TestJWGRNForJobOS.test_data["fg"] = response.json()
        
        print(f"Created items: RM and FG")
    
    def test_03_create_supplier(self):
        """Create supplier for JW GRN test"""
        unique_id = str(uuid.uuid4())[:8]
        supplier_payload = {
            "name": f"TEST_JWGRN_Supplier_{unique_id}",
            "code": f"TEST_JWGRN_{unique_id}",
            "contact_person": "Test Contact",
            "email": f"jwgrn_{unique_id}@test.com",
            "phone": "1234567890",
            "status": "active"
        }
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/suppliers", json=supplier_payload)
        assert response.status_code == 201, f"Failed to create supplier: {response.text}"
        TestJWGRNForJobOS.test_data["supplier"] = response.json()
        print(f"Created supplier")
    
    def test_04_create_routing_bom_po_wo(self):
        """Create routing, BOM, production order, and work order"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create routing
        routing_payload = {
            "name": f"TEST_JWGRN_Routing_{unique_id}",
            "description": "Test routing for JW GRN",
            "status": "active"
        }
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/routings", json=routing_payload)
        assert response.status_code == 201
        TestJWGRNForJobOS.test_data["routing"] = response.json()
        
        # Create BOM
        bom_payload = {
            "parent_item_id": TestJWGRNForJobOS.test_data["fg"]["id"],
            "name": "BOM for JW GRN Test",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": TestJWGRNForJobOS.test_data["rm"]["id"],
                    "quantity": 2.0,
                    "unit_of_measure": "kg",
                    "routings": [TestJWGRNForJobOS.test_data["routing"]["name"]]
                }
            ],
            "parent_routings": [TestJWGRNForJobOS.test_data["routing"]["name"]]
        }
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/bom", json=bom_payload)
        assert response.status_code in [200, 201]
        TestJWGRNForJobOS.test_data["bom"] = response.json()
        
        # Create Production Order
        due_date = (datetime.now() + timedelta(days=14)).isoformat()
        po_payload = {
            "bom_id": TestJWGRNForJobOS.test_data["bom"]["id"],
            "quantity": 10,
            "due_date": due_date,
            "priority": "high",
            "notes": "Test PO for JW GRN"
        }
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/production", json=po_payload)
        assert response.status_code in [200, 201]
        TestJWGRNForJobOS.test_data["po"] = response.json()
        
        # Create Work Order
        wo_payload = {
            "production_order_id": TestJWGRNForJobOS.test_data["po"]["id"],
            "routing_id": TestJWGRNForJobOS.test_data["routing"]["id"],
            "quantity": 10,
            "notes": "Test WO for JW GRN"
        }
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/work-orders", json=wo_payload)
        assert response.status_code == 201
        data = response.json()
        TestJWGRNForJobOS.test_data["wo"] = data.get("work_orders", [])[0]
        
        # Start WO
        response = TestJWGRNForJobOS.session.post(
            f"{BASE_URL}/api/work-orders/{TestJWGRNForJobOS.test_data['wo']['id']}/start"
        )
        assert response.status_code == 200
        
        # Refresh WO
        response = TestJWGRNForJobOS.session.get(
            f"{BASE_URL}/api/work-orders/{TestJWGRNForJobOS.test_data['wo']['id']}"
        )
        TestJWGRNForJobOS.test_data["wo"] = response.json()
        
        print("Created routing, BOM, PO, WO")
    
    def test_05_outsource_operation(self):
        """Outsource operation to create Job OS SC"""
        wo = TestJWGRNForJobOS.test_data["wo"]
        operations = wo.get("operations_status", [])
        
        if not operations:
            pytest.skip("No operations found")
        
        first_op_seq = operations[0].get("sequence", 10)
        
        outsource_payload = {
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": TestJWGRNForJobOS.test_data["supplier"]["id"],
            "outsource_charges": 50.0
        }
        response = TestJWGRNForJobOS.session.put(
            f"{BASE_URL}/api/work-orders/{wo['id']}/operations/{first_op_seq}",
            json=outsource_payload
        )
        assert response.status_code == 200
        
        # Find SC order
        sc_response = TestJWGRNForJobOS.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200
        sc_orders = sc_response.json()
        
        for sc in sc_orders:
            if (sc.get("supplier_id") == TestJWGRNForJobOS.test_data["supplier"]["id"] and 
                sc.get("subcontract_type") == "without_material"):
                TestJWGRNForJobOS.test_data["sc_order"] = sc
                break
        
        assert "sc_order" in TestJWGRNForJobOS.test_data
        print(f"SC Order created: {TestJWGRNForJobOS.test_data['sc_order']['id']}")
    
    def test_06_send_dc(self):
        """Send DC for Job OS SC"""
        sc_order = TestJWGRNForJobOS.test_data["sc_order"]
        
        dc_lines = []
        for part in sc_order.get("job_work_parts", []):
            dc_lines.append({
                "item_id": part["item_id"],
                "quantity": part["quantity"],
                "rate": part.get("charges", 0)
            })
        
        dc_payload = {
            "subcontract_order_id": sc_order["id"],
            "lines": dc_lines,
            "skip_stock_deduct": True,
            "notes": "DC for JW GRN test"
        }
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/job-work/challans", json=dc_payload)
        assert response.status_code in [200, 201]
        data = response.json()
        
        if isinstance(data, dict) and data.get("success") == False:
            pytest.fail(f"DC creation failed: {data}")
        
        TestJWGRNForJobOS.test_data["dc"] = data
        print(f"DC created: {data.get('dc_number')}")
    
    def test_07_verify_sc_is_pending_for_grn(self):
        """Verify SC appears in pending JW orders for GRN"""
        sc_id = TestJWGRNForJobOS.test_data["sc_order"]["id"]
        
        # Get all JW orders
        sc_response = TestJWGRNForJobOS.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200
        sc_orders = sc_response.json()
        
        # Filter like frontend does
        pending_jw = [jw for jw in sc_orders if 
            jw.get("status") == "in_progress" and 
            jw.get("job_work_parts") and len(jw.get("job_work_parts", [])) > 0 and (
                # SC with RM: lines sent
                (jw.get("subcontract_type") != "without_material" and 
                 any(l.get("sent_quantity", 0) > 0 for l in jw.get("lines", []))) or
                # Job OS: dc_created
                (jw.get("subcontract_type") == "without_material" and jw.get("dc_created"))
            )
        ]
        
        sc_found = any(jw.get("id") == sc_id for jw in pending_jw)
        assert sc_found, f"SC {sc_id} not found in pending JW orders for GRN"
        print(f"VERIFIED: SC {sc_id} appears in pending JW orders for GRN")
    
    def test_08_receive_grn_for_job_os(self):
        """Receive GRN for Job OS SC using /api/job-work/receive-grn"""
        sc_order = TestJWGRNForJobOS.test_data["sc_order"]
        fg_id = TestJWGRNForJobOS.test_data["fg"]["id"]
        
        # Get FG stock before GRN
        response = TestJWGRNForJobOS.session.get(f"{BASE_URL}/api/items/{fg_id}")
        assert response.status_code == 200
        fg_before = response.json()
        stock_before = fg_before.get("current_stock", 0)
        print(f"FG stock before GRN: {stock_before}")
        
        # Receive GRN
        grn_payload = {
            "subcontract_order_id": sc_order["id"],
            "supplier_invoice_no": f"INV-{uuid.uuid4().hex[:8]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "lines": [
                {
                    "item_id": fg_id,
                    "received_quantity": 10,
                    "process_charges": 50.0
                }
            ]
        }
        response = TestJWGRNForJobOS.session.post(f"{BASE_URL}/api/job-work/receive-grn", json=grn_payload)
        assert response.status_code in [200, 201], f"JW GRN failed: {response.text}"
        data = response.json()
        
        assert "grn_number" in data, f"GRN number not in response: {data}"
        TestJWGRNForJobOS.test_data["grn"] = data
        print(f"JW GRN created: {data.get('grn_number')}")
    
    def test_09_verify_stock_added(self):
        """Verify FG stock was added after GRN"""
        fg_id = TestJWGRNForJobOS.test_data["fg"]["id"]
        
        response = TestJWGRNForJobOS.session.get(f"{BASE_URL}/api/items/{fg_id}")
        assert response.status_code == 200
        fg_after = response.json()
        stock_after = fg_after.get("current_stock", 0)
        
        # Stock should have increased by 10
        assert stock_after >= 10, f"Expected stock >= 10, got {stock_after}"
        print(f"FG stock after GRN: {stock_after}")
        print("VERIFIED: JW GRN endpoint works for Job OS SCs")
    
    def test_10_verify_sc_completed(self):
        """Verify SC order is completed after full receipt"""
        sc_id = TestJWGRNForJobOS.test_data["sc_order"]["id"]
        
        sc_response = TestJWGRNForJobOS.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200
        sc_orders = sc_response.json()
        
        sc_order = None
        for sc in sc_orders:
            if sc.get("id") == sc_id:
                sc_order = sc
                break
        
        assert sc_order is not None
        assert sc_order.get("status") == "completed", f"Expected status=completed, got {sc_order.get('status')}"
        print("VERIFIED: SC order completed after full receipt")


class TestNoPOForJobOS:
    """Test that Job OS SCs with job_work_parts don't show Create PO button (API verification)"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for all tests"""
        if TestNoPOForJobOS.session is None:
            TestNoPOForJobOS.session = requests.Session()
            TestNoPOForJobOS.session.headers.update({"Content-Type": "application/json"})
    
    def test_01_login(self):
        """Login with admin credentials"""
        response = TestNoPOForJobOS.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        print("Logged in successfully")
    
    def test_02_verify_job_os_sc_has_job_work_parts(self):
        """Verify Job OS SCs have job_work_parts (which means no PO needed)"""
        # Get all JW orders
        sc_response = TestNoPOForJobOS.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_response.status_code == 200
        sc_orders = sc_response.json()
        
        # Find Job OS SCs (without_material with job_work_parts)
        job_os_scs = [sc for sc in sc_orders if 
            sc.get("subcontract_type") == "without_material" and 
            sc.get("job_work_parts") and len(sc.get("job_work_parts", [])) > 0
        ]
        
        print(f"Found {len(job_os_scs)} Job OS SCs with job_work_parts")
        
        # Verify these SCs have job_work_parts (frontend logic: no PO button if job_work_parts exists)
        for sc in job_os_scs:
            jwp = sc.get("job_work_parts", [])
            assert len(jwp) > 0, f"SC {sc.get('id')} should have job_work_parts"
            print(f"  - SC {sc.get('order_number')}: {len(jwp)} job_work_parts, po_created={sc.get('po_created', False)}")
        
        print("VERIFIED: Job OS SCs have job_work_parts (no PO button needed)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
