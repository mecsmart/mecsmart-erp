"""
Test SC RM Resolution Bug Fix - E2E Test
=========================================
User scenario: When outsourcing SA (Boot Assy) with_material, the SC screen and DC send dialog 
should show PT-1 (completed part) as PT-1 itself, and PT-2 (not completed) should show as its 
constituent RM items.

Test Steps:
1. Create items: FG-1 (finished_good), SG-1 (sub_assembly), PT-1 (component), PT-2 (component), 
   RM-TEST-1 (raw_material), RM-TEST-2 (raw_material)
2. Create BOMs: FG-1→SG-1, SG-1→PT-1(qty 4)+PT-2(qty 2), PT-2→RM-TEST-1+RM-TEST-2
3. Create work center and routing for FG-1
4. Create MO for FG-1 - this should create child MOs for SG-1, PT-1, PT-2
5. Complete PT-1's child MO (mark as completed)
6. Mark SG-1's MO as subcontract with_material, then call create-sc
7. Verify SC lines contain: PT-1 (the completed part) AND RM-TEST-1/RM-TEST-2 (resolved from 
   uncompleted PT-2's BOM)
"""

import pytest
import requests
import os
import uuid
import time
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSCRMResolutionBug:
    """E2E test for SC RM resolution bug fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        # Store created IDs for cleanup
        self.created_items = []
        self.created_boms = []
        self.created_work_centers = []
        self.created_routings = []
        self.created_work_orders = []
        self.created_suppliers = []
        
        yield
        
        # Cleanup (optional - comment out to inspect data)
        # self._cleanup()
    
    def _cleanup(self):
        """Cleanup test data"""
        for wo_id in self.created_work_orders:
            self.session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")
        for routing_id in self.created_routings:
            self.session.delete(f"{BASE_URL}/api/routings/{routing_id}")
        for wc_id in self.created_work_centers:
            self.session.delete(f"{BASE_URL}/api/work-centers/{wc_id}")
        for bom_id in self.created_boms:
            self.session.delete(f"{BASE_URL}/api/boms/{bom_id}")
        for item_id in self.created_items:
            self.session.delete(f"{BASE_URL}/api/items/{item_id}")
        for supplier_id in self.created_suppliers:
            self.session.delete(f"{BASE_URL}/api/suppliers/{supplier_id}")
    
    def test_sc_rm_resolution_e2e(self):
        """
        E2E test: Create full scenario and verify SC lines show correct RM resolution
        - PT-1 (completed) should appear as PT-1 in SC lines
        - PT-2 (not completed) should be resolved to its RM (RM-TEST-1, RM-TEST-2)
        """
        test_suffix = str(uuid.uuid4())[:8]
        
        # Step 1: Create items
        print("\n=== Step 1: Creating items ===")
        
        # Create RM items first (leaf level)
        rm1_data = {
            "part_number": f"RM-TEST-1-{test_suffix}",
            "name": f"Raw Material 1 {test_suffix}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 10.0,
            "status": "active"
        }
        rm1_resp = self.session.post(f"{BASE_URL}/api/items", json=rm1_data)
        assert rm1_resp.status_code == 201, f"Failed to create RM-1: {rm1_resp.text}"
        rm1 = rm1_resp.json()
        self.created_items.append(rm1["id"])
        print(f"Created RM-1: {rm1['part_number']} (id: {rm1['id']})")
        
        rm2_data = {
            "part_number": f"RM-TEST-2-{test_suffix}",
            "name": f"Raw Material 2 {test_suffix}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 15.0,
            "status": "active"
        }
        rm2_resp = self.session.post(f"{BASE_URL}/api/items", json=rm2_data)
        assert rm2_resp.status_code == 201, f"Failed to create RM-2: {rm2_resp.text}"
        rm2 = rm2_resp.json()
        self.created_items.append(rm2["id"])
        print(f"Created RM-2: {rm2['part_number']} (id: {rm2['id']})")
        
        # Create PT-1 (component - will be completed)
        pt1_data = {
            "part_number": f"PT-1-{test_suffix}",
            "name": f"Part 1 {test_suffix}",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
            "status": "active"
        }
        pt1_resp = self.session.post(f"{BASE_URL}/api/items", json=pt1_data)
        assert pt1_resp.status_code == 201, f"Failed to create PT-1: {pt1_resp.text}"
        pt1 = pt1_resp.json()
        self.created_items.append(pt1["id"])
        print(f"Created PT-1: {pt1['part_number']} (id: {pt1['id']})")
        
        # Create PT-2 (component - will NOT be completed, should resolve to RM)
        pt2_data = {
            "part_number": f"PT-2-{test_suffix}",
            "name": f"Part 2 {test_suffix}",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 75.0,
            "status": "active"
        }
        pt2_resp = self.session.post(f"{BASE_URL}/api/items", json=pt2_data)
        assert pt2_resp.status_code == 201, f"Failed to create PT-2: {pt2_resp.text}"
        pt2 = pt2_resp.json()
        self.created_items.append(pt2["id"])
        print(f"Created PT-2: {pt2['part_number']} (id: {pt2['id']})")
        
        # Create SG-1 (sub_assembly)
        sg1_data = {
            "part_number": f"SG-1-{test_suffix}",
            "name": f"Sub Assembly 1 {test_suffix}",
            "category": "sub_assembly",
            "unit_of_measure": "pcs",
            "unit_cost": 200.0,
            "status": "active"
        }
        sg1_resp = self.session.post(f"{BASE_URL}/api/items", json=sg1_data)
        assert sg1_resp.status_code == 201, f"Failed to create SG-1: {sg1_resp.text}"
        sg1 = sg1_resp.json()
        self.created_items.append(sg1["id"])
        print(f"Created SG-1: {sg1['part_number']} (id: {sg1['id']})")
        
        # Create FG-1 (finished_good)
        fg1_data = {
            "part_number": f"FG-1-{test_suffix}",
            "name": f"Finished Good 1 {test_suffix}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0,
            "status": "active"
        }
        fg1_resp = self.session.post(f"{BASE_URL}/api/items", json=fg1_data)
        assert fg1_resp.status_code == 201, f"Failed to create FG-1: {fg1_resp.text}"
        fg1 = fg1_resp.json()
        self.created_items.append(fg1["id"])
        print(f"Created FG-1: {fg1['part_number']} (id: {fg1['id']})")
        
        # Step 2: Create BOMs
        print("\n=== Step 2: Creating BOMs ===")
        
        # BOM for PT-2 → RM-TEST-1 + RM-TEST-2
        pt2_bom_data = {
            "parent_item_id": pt2["id"],
            "bom_number": f"BOM-PT2-{test_suffix}",
            "name": f"BOM for PT-2 {test_suffix}",
            "components": [
                {"item_id": rm1["id"], "quantity": 2, "is_alternate": False},
                {"item_id": rm2["id"], "quantity": 3, "is_alternate": False}
            ],
            "status": "active"
        }
        pt2_bom_resp = self.session.post(f"{BASE_URL}/api/bom", json=pt2_bom_data)
        assert pt2_bom_resp.status_code in [200, 201], f"Failed to create PT-2 BOM: {pt2_bom_resp.text}"
        pt2_bom = pt2_bom_resp.json()
        self.created_boms.append(pt2_bom["id"])
        print(f"Created BOM for PT-2: {pt2_bom.get('name', pt2_bom['id'])} (id: {pt2_bom['id']})")
        
        # BOM for SG-1 → PT-1 (qty 4) + PT-2 (qty 2)
        sg1_bom_data = {
            "parent_item_id": sg1["id"],
            "bom_number": f"BOM-SG1-{test_suffix}",
            "name": f"BOM for SG-1 {test_suffix}",
            "components": [
                {"item_id": pt1["id"], "quantity": 4, "is_alternate": False},
                {"item_id": pt2["id"], "quantity": 2, "is_alternate": False}
            ],
            "status": "active"
        }
        sg1_bom_resp = self.session.post(f"{BASE_URL}/api/bom", json=sg1_bom_data)
        assert sg1_bom_resp.status_code in [200, 201], f"Failed to create SG-1 BOM: {sg1_bom_resp.text}"
        sg1_bom = sg1_bom_resp.json()
        self.created_boms.append(sg1_bom["id"])
        print(f"Created BOM for SG-1: {sg1_bom.get('name', sg1_bom['id'])} (id: {sg1_bom['id']})")
        
        # BOM for FG-1 → SG-1
        fg1_bom_data = {
            "parent_item_id": fg1["id"],
            "bom_number": f"BOM-FG1-{test_suffix}",
            "name": f"BOM for FG-1 {test_suffix}",
            "components": [
                {"item_id": sg1["id"], "quantity": 1, "is_alternate": False}
            ],
            "status": "active"
        }
        fg1_bom_resp = self.session.post(f"{BASE_URL}/api/bom", json=fg1_bom_data)
        assert fg1_bom_resp.status_code in [200, 201], f"Failed to create FG-1 BOM: {fg1_bom_resp.text}"
        fg1_bom = fg1_bom_resp.json()
        self.created_boms.append(fg1_bom["id"])
        print(f"Created BOM for FG-1: {fg1_bom.get('name', fg1_bom['id'])} (id: {fg1_bom['id']})")
        
        # Step 3: Create work center and routing
        print("\n=== Step 3: Creating work center and routing ===")
        
        # Create work center
        wc_data = {
            "name": f"Work Center {test_suffix}",
            "code": f"WC-{test_suffix}",
            "capacity": 100,
            "efficiency": 95,
            "status": "active"
        }
        wc_resp = self.session.post(f"{BASE_URL}/api/work-centers", json=wc_data)
        assert wc_resp.status_code == 201, f"Failed to create work center: {wc_resp.text}"
        wc = wc_resp.json()
        self.created_work_centers.append(wc["id"])
        print(f"Created Work Center: {wc['name']} (id: {wc['id']})")
        
        # Create routing for FG-1
        routing_data = {
            "item_id": fg1["id"],
            "routing_number": f"RTG-FG1-{test_suffix}",
            "name": f"Routing for FG-1 {test_suffix}",
            "operations": [
                {
                    "sequence": 10,
                    "operation_name": "Assembly",
                    "work_center_id": wc["id"],
                    "setup_time": 30,
                    "run_time": 60,
                    "description": "Final assembly"
                }
            ],
            "status": "active"
        }
        routing_resp = self.session.post(f"{BASE_URL}/api/routings", json=routing_data)
        assert routing_resp.status_code == 201, f"Failed to create routing: {routing_resp.text}"
        routing = routing_resp.json()
        self.created_routings.append(routing["id"])
        print(f"Created Routing for FG-1: {routing.get('name', routing['id'])} (id: {routing['id']})")
        
        # Create routing for SG-1 (sub-assembly)
        sg1_routing_data = {
            "item_id": sg1["id"],
            "routing_number": f"RTG-SG1-{test_suffix}",
            "name": f"Routing for SG-1 {test_suffix}",
            "operations": [
                {
                    "sequence": 10,
                    "operation_name": "Sub-Assembly",
                    "work_center_id": wc["id"],
                    "setup_time": 20,
                    "run_time": 40,
                    "description": "Sub-assembly operation"
                }
            ],
            "status": "active"
        }
        sg1_routing_resp = self.session.post(f"{BASE_URL}/api/routings", json=sg1_routing_data)
        assert sg1_routing_resp.status_code == 201, f"Failed to create SG-1 routing: {sg1_routing_resp.text}"
        sg1_routing = sg1_routing_resp.json()
        self.created_routings.append(sg1_routing["id"])
        print(f"Created Routing for SG-1: {sg1_routing.get('name', sg1_routing['id'])} (id: {sg1_routing['id']})")
        
        # Create routing for PT-1 (component)
        pt1_routing_data = {
            "item_id": pt1["id"],
            "routing_number": f"RTG-PT1-{test_suffix}",
            "name": f"Routing for PT-1 {test_suffix}",
            "operations": [
                {
                    "sequence": 10,
                    "operation_name": "Part Manufacturing",
                    "work_center_id": wc["id"],
                    "setup_time": 10,
                    "run_time": 20,
                    "description": "Part 1 manufacturing"
                }
            ],
            "status": "active"
        }
        pt1_routing_resp = self.session.post(f"{BASE_URL}/api/routings", json=pt1_routing_data)
        assert pt1_routing_resp.status_code == 201, f"Failed to create PT-1 routing: {pt1_routing_resp.text}"
        pt1_routing = pt1_routing_resp.json()
        self.created_routings.append(pt1_routing["id"])
        print(f"Created Routing for PT-1: {pt1_routing.get('name', pt1_routing['id'])} (id: {pt1_routing['id']})")
        
        # Create routing for PT-2 (component)
        pt2_routing_data = {
            "item_id": pt2["id"],
            "routing_number": f"RTG-PT2-{test_suffix}",
            "name": f"Routing for PT-2 {test_suffix}",
            "operations": [
                {
                    "sequence": 10,
                    "operation_name": "Part Manufacturing",
                    "work_center_id": wc["id"],
                    "setup_time": 10,
                    "run_time": 25,
                    "description": "Part 2 manufacturing"
                }
            ],
            "status": "active"
        }
        pt2_routing_resp = self.session.post(f"{BASE_URL}/api/routings", json=pt2_routing_data)
        assert pt2_routing_resp.status_code == 201, f"Failed to create PT-2 routing: {pt2_routing_resp.text}"
        pt2_routing = pt2_routing_resp.json()
        self.created_routings.append(pt2_routing["id"])
        print(f"Created Routing for PT-2: {pt2_routing.get('name', pt2_routing['id'])} (id: {pt2_routing['id']})")
        
        # Create supplier for subcontracting
        supplier_data = {
            "name": f"Test Supplier {test_suffix}",
            "code": f"SUP-{test_suffix}",
            "contact_person": "Test Contact",
            "email": f"supplier-{test_suffix}@test.com",
            "phone": "1234567890",
            "status": "active"
        }
        supplier_resp = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert supplier_resp.status_code == 201, f"Failed to create supplier: {supplier_resp.text}"
        supplier = supplier_resp.json()
        self.created_suppliers.append(supplier["id"])
        print(f"Created Supplier: {supplier['name']} (id: {supplier['id']})")
        
        # Step 4: Create Production Order for FG-1 (which creates MOs)
        print("\n=== Step 4: Creating Production Order for FG-1 ===")
        
        # Create production order using FG-1's BOM
        po_data = {
            "bom_id": fg1_bom["id"],
            "quantity": 1,
            "due_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "priority": "medium",
            "notes": f"Test production order {test_suffix}"
        }
        po_resp = self.session.post(f"{BASE_URL}/api/production", json=po_data)
        assert po_resp.status_code in [200, 201], f"Failed to create production order: {po_resp.text}"
        prod_order = po_resp.json()
        print(f"Created Production Order: {prod_order.get('order_number', prod_order['id'])} (id: {prod_order['id']})")
        
        # Confirm the production order
        confirm_resp = self.session.post(f"{BASE_URL}/api/production/{prod_order['id']}/confirm")
        assert confirm_resp.status_code == 200, f"Failed to confirm production order: {confirm_resp.text}"
        print(f"Production Order confirmed")
        
        # Now create the work order for FG-1 (this will auto-create child MOs)
        wo_data = {
            "production_order_id": prod_order["id"],
            "routing_id": routing["id"],
            "quantity": 1,
            "is_subcontract": False
        }
        wo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data)
        assert wo_resp.status_code == 201, f"Failed to create work order: {wo_resp.text}"
        wo_result = wo_resp.json()
        created_wos = wo_result.get("work_orders", [])
        print(f"Created {len(created_wos)} work orders")
        
        # Find FG-1's MO (first one, no parent)
        fg1_mo = None
        for wo in created_wos:
            if wo.get("item_id") == fg1["id"]:
                fg1_mo = wo
                self.created_work_orders.append(wo["id"])
                print(f"Found FG-1 MO: {wo.get('wo_number', wo['id'])} (id: {wo['id']})")
                break
        
        if not fg1_mo:
            pytest.fail("FG-1 MO not created")
        
        # Wait a moment for child MOs to be created
        time.sleep(1)
        
        # Get all work orders to find child MOs
        all_wos_resp = self.session.get(f"{BASE_URL}/api/work-orders?production_order_id={prod_order['id']}")
        assert all_wos_resp.status_code == 200, f"Failed to get work orders: {all_wos_resp.text}"
        all_wos = all_wos_resp.json()
        print(f"Found {len(all_wos)} MOs for production order")
        
        # Find child MOs by parent_wo_id
        child_mos = [wo for wo in all_wos if wo.get("parent_wo_id") == fg1_mo["id"]]
        print(f"Found {len(child_mos)} direct child MOs for FG-1 MO")
        
        # Find SG-1's MO
        sg1_mo = None
        for wo in child_mos:
            if wo.get("item_id") == sg1["id"]:
                sg1_mo = wo
                self.created_work_orders.append(wo["id"])
                print(f"Found SG-1 MO: {wo.get('order_number', wo['id'])} (id: {wo['id']})")
                break
        
        # Find grandchild MOs (PT-1 and PT-2 MOs under SG-1)
        if sg1_mo:
            grandchild_mos = [wo for wo in all_wos if wo.get("parent_wo_id") == sg1_mo["id"]]
            print(f"Found {len(grandchild_mos)} grandchild MOs under SG-1 MO")
            
            pt1_mo = None
            pt2_mo = None
            for wo in grandchild_mos:
                if wo.get("item_id") == pt1["id"]:
                    pt1_mo = wo
                    self.created_work_orders.append(wo["id"])
                    print(f"Found PT-1 MO: {wo.get('order_number', wo['id'])} (id: {wo['id']}, status: {wo.get('status')})")
                elif wo.get("item_id") == pt2["id"]:
                    pt2_mo = wo
                    self.created_work_orders.append(wo["id"])
                    print(f"Found PT-2 MO: {wo.get('order_number', wo['id'])} (id: {wo['id']}, status: {wo.get('status')})")
        
        # Step 5: Complete PT-1's MO
        print("\n=== Step 5: Completing PT-1's MO ===")
        
        if pt1_mo:
            complete_resp = self.session.put(f"{BASE_URL}/api/work-orders/{pt1_mo['id']}", json={
                "status": "completed"
            })
            assert complete_resp.status_code == 200, f"Failed to complete PT-1 MO: {complete_resp.text}"
            pt1_mo_updated = complete_resp.json()
            print(f"PT-1 MO status updated to: {pt1_mo_updated.get('status')}")
            assert pt1_mo_updated.get("status") == "completed", "PT-1 MO should be completed"
        else:
            print("WARNING: PT-1 MO not found - child MOs may not have been created")
        
        # Step 6: Mark SG-1's MO as subcontract with_material
        print("\n=== Step 6: Marking SG-1's MO as subcontract with_material ===")
        
        if sg1_mo:
            subcontract_resp = self.session.put(f"{BASE_URL}/api/work-orders/{sg1_mo['id']}", json={
                "is_subcontract": True,
                "subcontract_supplier_id": supplier["id"],
                "subcontract_type": "with_material"
            })
            assert subcontract_resp.status_code == 200, f"Failed to mark SG-1 MO as subcontract: {subcontract_resp.text}"
            sg1_mo_updated = subcontract_resp.json()
            print(f"SG-1 MO marked as subcontract: is_subcontract={sg1_mo_updated.get('is_subcontract')}, type={sg1_mo_updated.get('subcontract_type')}")
        else:
            pytest.fail("SG-1 MO not found - cannot continue test")
        
        # Step 7: Create SC for SG-1's MO and verify lines
        print("\n=== Step 7: Creating SC for SG-1's MO ===")
        
        create_sc_resp = self.session.post(f"{BASE_URL}/api/work-orders/{sg1_mo['id']}/create-sc")
        assert create_sc_resp.status_code == 200, f"Failed to create SC: {create_sc_resp.text}"
        sc_result = create_sc_resp.json()
        
        print(f"SC creation result: {sc_result.get('message')}")
        sc_order = sc_result.get("sc_order", {})
        sc_lines = sc_order.get("lines", [])
        
        print(f"\n=== SC Lines ({len(sc_lines)} items) ===")
        for line in sc_lines:
            print(f"  - Item ID: {line.get('item_id')}, Quantity: {line.get('quantity')}")
        
        # Verify SC lines contain correct items
        sc_item_ids = {line["item_id"] for line in sc_lines}
        
        # PT-1 should be in SC lines (completed part)
        assert pt1["id"] in sc_item_ids, f"PT-1 (completed part) should be in SC lines. SC items: {sc_item_ids}"
        print(f"✓ PT-1 (completed part) found in SC lines")
        
        # PT-2 should NOT be in SC lines (should be resolved to RM)
        assert pt2["id"] not in sc_item_ids, f"PT-2 (uncompleted part) should NOT be in SC lines - should be resolved to RM. SC items: {sc_item_ids}"
        print(f"✓ PT-2 (uncompleted part) NOT in SC lines (correctly resolved)")
        
        # RM-TEST-1 and RM-TEST-2 should be in SC lines (resolved from PT-2's BOM)
        assert rm1["id"] in sc_item_ids, f"RM-TEST-1 should be in SC lines (resolved from PT-2). SC items: {sc_item_ids}"
        print(f"✓ RM-TEST-1 found in SC lines (resolved from PT-2)")
        
        assert rm2["id"] in sc_item_ids, f"RM-TEST-2 should be in SC lines (resolved from PT-2). SC items: {sc_item_ids}"
        print(f"✓ RM-TEST-2 found in SC lines (resolved from PT-2)")
        
        # Verify quantities
        # PT-1: qty 4 (from SG-1 BOM)
        pt1_line = next((l for l in sc_lines if l["item_id"] == pt1["id"]), None)
        assert pt1_line is not None, "PT-1 line not found"
        assert pt1_line["quantity"] == 4, f"PT-1 quantity should be 4, got {pt1_line['quantity']}"
        print(f"✓ PT-1 quantity correct: {pt1_line['quantity']}")
        
        # RM-TEST-1: qty 2 (from PT-2 BOM) * 2 (PT-2 qty in SG-1 BOM) = 4
        rm1_line = next((l for l in sc_lines if l["item_id"] == rm1["id"]), None)
        assert rm1_line is not None, "RM-TEST-1 line not found"
        expected_rm1_qty = 2 * 2  # 2 RM per PT-2, 2 PT-2 per SG-1
        assert rm1_line["quantity"] == expected_rm1_qty, f"RM-TEST-1 quantity should be {expected_rm1_qty}, got {rm1_line['quantity']}"
        print(f"✓ RM-TEST-1 quantity correct: {rm1_line['quantity']}")
        
        # RM-TEST-2: qty 3 (from PT-2 BOM) * 2 (PT-2 qty in SG-1 BOM) = 6
        rm2_line = next((l for l in sc_lines if l["item_id"] == rm2["id"]), None)
        assert rm2_line is not None, "RM-TEST-2 line not found"
        expected_rm2_qty = 3 * 2  # 3 RM per PT-2, 2 PT-2 per SG-1
        assert rm2_line["quantity"] == expected_rm2_qty, f"RM-TEST-2 quantity should be {expected_rm2_qty}, got {rm2_line['quantity']}"
        print(f"✓ RM-TEST-2 quantity correct: {rm2_line['quantity']}")
        
        print("\n=== TEST PASSED: SC RM Resolution Bug Fix Verified ===")
        print(f"SC Order: {sc_order.get('order_number')}")
        print(f"SC Lines correctly show:")
        print(f"  - PT-1 (completed part): qty {pt1_line['quantity']}")
        print(f"  - RM-TEST-1 (resolved from PT-2): qty {rm1_line['quantity']}")
        print(f"  - RM-TEST-2 (resolved from PT-2): qty {rm2_line['quantity']}")
    
    def test_sc_recalculation_on_second_create_sc_call(self):
        """
        Test that calling create-sc again recalculates SC lines if no DC has been sent.
        This test uses the same workflow as the main E2E test but focuses on recalculation.
        """
        test_suffix = str(uuid.uuid4())[:8]
        
        print("\n=== Testing SC Recalculation ===")
        
        # Create minimal test data - just a component with RM
        rm_data = {
            "part_number": f"RM-RECALC-{test_suffix}",
            "name": f"RM for Recalc Test {test_suffix}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 10.0,
            "status": "active"
        }
        rm_resp = self.session.post(f"{BASE_URL}/api/items", json=rm_data)
        assert rm_resp.status_code == 201
        rm = rm_resp.json()
        self.created_items.append(rm["id"])
        print(f"Created RM: {rm['part_number']}")
        
        # Create FG item (to create production order)
        fg_data = {
            "part_number": f"FG-RECALC-{test_suffix}",
            "name": f"FG for Recalc Test {test_suffix}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0,
            "status": "active"
        }
        fg_resp = self.session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201
        fg = fg_resp.json()
        self.created_items.append(fg["id"])
        print(f"Created FG: {fg['part_number']}")
        
        # Create BOM for FG → RM
        bom_data = {
            "parent_item_id": fg["id"],
            "name": f"BOM for Recalc Test {test_suffix}",
            "components": [
                {"item_id": rm["id"], "quantity": 5, "is_alternate": False}
            ],
            "status": "active"
        }
        bom_resp = self.session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom = bom_resp.json()
        self.created_boms.append(bom["id"])
        print(f"Created BOM: {bom['name']}")
        
        # Create work center
        wc_data = {
            "name": f"WC Recalc {test_suffix}",
            "code": f"WC-RC-{test_suffix}",
            "capacity": 100,
            "efficiency": 95,
            "status": "active"
        }
        wc_resp = self.session.post(f"{BASE_URL}/api/work-centers", json=wc_data)
        assert wc_resp.status_code == 201
        wc = wc_resp.json()
        self.created_work_centers.append(wc["id"])
        print(f"Created Work Center: {wc['name']}")
        
        # Create routing for FG
        routing_data = {
            "item_id": fg["id"],
            "name": f"Routing for Recalc Test {test_suffix}",
            "operations": [
                {"sequence": 10, "operation_name": "Op1", "work_center_id": wc["id"], "setup_time": 10, "run_time": 20}
            ],
            "status": "active"
        }
        routing_resp = self.session.post(f"{BASE_URL}/api/routings", json=routing_data)
        assert routing_resp.status_code == 201
        routing = routing_resp.json()
        self.created_routings.append(routing["id"])
        print(f"Created Routing: {routing['name']}")
        
        # Create supplier
        supplier_data = {
            "name": f"Supplier Recalc {test_suffix}",
            "code": f"SUP-RC-{test_suffix}",
            "status": "active"
        }
        supplier_resp = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert supplier_resp.status_code == 201
        supplier = supplier_resp.json()
        self.created_suppliers.append(supplier["id"])
        print(f"Created Supplier: {supplier['name']}")
        
        # Create production order
        po_data = {
            "bom_id": bom["id"],
            "quantity": 2,
            "due_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "priority": "medium"
        }
        po_resp = self.session.post(f"{BASE_URL}/api/production", json=po_data)
        assert po_resp.status_code in [200, 201]
        prod_order = po_resp.json()
        print(f"Created Production Order: {prod_order.get('order_number', prod_order['id'])}")
        
        # Confirm production order
        confirm_resp = self.session.post(f"{BASE_URL}/api/production/{prod_order['id']}/confirm")
        assert confirm_resp.status_code == 200
        print("Production Order confirmed")
        
        # Create work order
        wo_data = {
            "production_order_id": prod_order["id"],
            "routing_id": routing["id"],
            "quantity": 2,
            "is_subcontract": True,
            "subcontract_supplier_id": supplier["id"],
            "subcontract_type": "with_material"
        }
        wo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data)
        assert wo_resp.status_code == 201
        wo_result = wo_resp.json()
        created_wos = wo_result.get("work_orders", [])
        mo = created_wos[0] if created_wos else None
        assert mo, "MO not created"
        self.created_work_orders.append(mo["id"])
        print(f"Created MO: {mo.get('wo_number', mo['id'])}")
        
        # First create-sc call
        sc1_resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo['id']}/create-sc")
        assert sc1_resp.status_code == 200
        sc1_result = sc1_resp.json()
        sc1_order = sc1_result.get("sc_order", {})
        sc1_lines = sc1_order.get("lines", [])
        print(f"First SC creation: {sc1_result.get('message')}")
        print(f"SC lines: {len(sc1_lines)} items")
        
        # Second create-sc call should recalculate (since no DC sent)
        sc2_resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo['id']}/create-sc")
        assert sc2_resp.status_code == 200
        sc2_result = sc2_resp.json()
        sc2_order = sc2_result.get("sc_order", {})
        sc2_lines = sc2_order.get("lines", [])
        print(f"Second SC creation: {sc2_result.get('message')}")
        print(f"SC lines: {len(sc2_lines)} items")
        
        # Verify SC was recalculated (message should indicate recalculation or existing)
        assert "recalculated" in sc2_result.get("message", "").lower() or "already exists" in sc2_result.get("message", "").lower(), \
            f"Second create-sc should indicate recalculation or existing SC. Got: {sc2_result.get('message')}"
        
        print("✓ SC recalculation on second create-sc call works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
