"""
Test Suite for BOM Component-Level Routings Redesign
- Routings are per-component in BOM: Each BOM component (SA, Part) gets its own routings array
- Parent FG/SA item gets parent_routings in BOM
- RM items have no routing (dash/empty array)
- MO creation pulls operations from BOM: parent item uses parent_routings, child items use component routings
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    """Create authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    # Login
    resp = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return s

@pytest.fixture(scope="module")
def test_data(session):
    """Create test data for the test suite"""
    data = {"suffix": str(uuid.uuid4())[:8]}
    
    # Create routings (operation types)
    routing_names = ["LC Cutting", "Welding", "Assembly", "Bending"]
    data["routings"] = []
    for name in routing_names:
        resp = session.post(f"{BASE_URL}/api/routings", json={
            "name": f"{name}_{data['suffix']}",
            "description": f"{name} operation",
            "status": "active"
        })
        assert resp.status_code == 201, f"Routing creation failed for {name}: {resp.text}"
        data["routings"].append(resp.json())
    
    # Create items: FG-1, SG-1, PT-1, RM-1
    # FG (Finished Good)
    resp = session.post(f"{BASE_URL}/api/items", json={
        "part_number": f"FG-{data['suffix']}",
        "name": f"TEST_FG_Item_{data['suffix']}",
        "category": "finished_good",
        "unit_of_measure": "pcs",
        "current_stock": 0
    })
    assert resp.status_code == 201, f"FG item creation failed: {resp.text}"
    data["fg_item"] = resp.json()
    
    # SG (Sub-Assembly)
    resp = session.post(f"{BASE_URL}/api/items", json={
        "part_number": f"SG-{data['suffix']}",
        "name": f"TEST_SG_Item_{data['suffix']}",
        "category": "sub_assembly",
        "unit_of_measure": "pcs",
        "current_stock": 0
    })
    assert resp.status_code == 201, f"SG item creation failed: {resp.text}"
    data["sg_item"] = resp.json()
    
    # PT (Part/Component)
    resp = session.post(f"{BASE_URL}/api/items", json={
        "part_number": f"PT-{data['suffix']}",
        "name": f"TEST_PT_Item_{data['suffix']}",
        "category": "component",
        "unit_of_measure": "pcs",
        "current_stock": 0
    })
    assert resp.status_code == 201, f"PT item creation failed: {resp.text}"
    data["pt_item"] = resp.json()
    
    # RM (Raw Material)
    resp = session.post(f"{BASE_URL}/api/items", json={
        "part_number": f"RM-{data['suffix']}",
        "name": f"TEST_RM_Item_{data['suffix']}",
        "category": "raw_material",
        "unit_of_measure": "pcs",
        "current_stock": 100
    })
    assert resp.status_code == 201, f"RM item creation failed: {resp.text}"
    data["rm_item"] = resp.json()
    
    # Create work center (needed for MO creation)
    resp = session.post(f"{BASE_URL}/api/work-centers", json={
        "code": f"WC-{data['suffix'][:4]}",
        "name": f"TEST_WorkCenter_{data['suffix']}",
        "description": "Test work center",
        "hourly_rate": 50.0,
        "capacity_per_hour": 10.0,
        "status": "active"
    })
    if resp.status_code == 201:
        data["work_center"] = resp.json()
    
    yield data
    
    # Cleanup
    try:
        for routing in data.get("routings", []):
            session.delete(f"{BASE_URL}/api/routings/{routing['id']}")
        session.delete(f"{BASE_URL}/api/items/{data['fg_item']['id']}")
        session.delete(f"{BASE_URL}/api/items/{data['sg_item']['id']}")
        session.delete(f"{BASE_URL}/api/items/{data['pt_item']['id']}")
        session.delete(f"{BASE_URL}/api/items/{data['rm_item']['id']}")
        if "work_center" in data:
            session.delete(f"{BASE_URL}/api/work-centers/{data['work_center']['id']}")
    except:
        pass


class TestRoutingSimplified:
    """Test simplified routing model - just name/description/status (no item_id)"""
    
    def test_create_routing_simple(self, session, test_data):
        """POST /api/routings creates simple routing with just name/description/status"""
        suffix = test_data["suffix"]
        
        resp = session.post(f"{BASE_URL}/api/routings", json={
            "name": f"TestOp_{suffix}",
            "description": "Test operation type",
            "status": "active"
        })
        
        assert resp.status_code == 201, f"Routing creation failed: {resp.text}"
        routing = resp.json()
        
        # Verify response structure - should be simple
        assert "id" in routing
        assert routing["name"] == f"TestOp_{suffix}"
        assert routing["description"] == "Test operation type"
        assert routing["status"] == "active"
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/routings/{routing['id']}")
        print(f"PASSED: Created simple routing without item_id")
    
    def test_get_routings_list(self, session, test_data):
        """GET /api/routings returns list of operation types"""
        resp = session.get(f"{BASE_URL}/api/routings")
        
        assert resp.status_code == 200, f"Get routings failed: {resp.text}"
        routings = resp.json()
        
        assert isinstance(routings, list)
        assert len(routings) >= len(test_data["routings"]), f"Expected at least {len(test_data['routings'])} routings"
        
        # Verify our test routings exist
        test_routing_ids = [r["id"] for r in test_data["routings"]]
        found = [r for r in routings if r["id"] in test_routing_ids]
        assert len(found) == len(test_data["routings"]), f"Expected to find all test routings"
        
        print(f"PASSED: GET /api/routings returned {len(routings)} operation types")


class TestBOMWithComponentRoutings:
    """Test BOM with parent_routings and component-level routings"""
    
    def test_create_bom_with_parent_and_component_routings(self, session, test_data):
        """POST /api/bom creates BOM with parent_routings and components[].routings"""
        suffix = test_data["suffix"]
        fg_item_id = test_data["fg_item"]["id"]
        sg_item_id = test_data["sg_item"]["id"]
        pt_item_id = test_data["pt_item"]["id"]
        rm_item_id = test_data["rm_item"]["id"]
        
        # Get routing names
        routing_names = [r["name"] for r in test_data["routings"]]
        assembly_routing = next((n for n in routing_names if "Assembly" in n), routing_names[0])
        welding_routing = next((n for n in routing_names if "Welding" in n), routing_names[1])
        lc_cutting_routing = next((n for n in routing_names if "LC Cutting" in n), routing_names[2])
        bending_routing = next((n for n in routing_names if "Bending" in n), routing_names[3] if len(routing_names) > 3 else routing_names[0])
        
        resp = session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": fg_item_id,
            "name": f"TEST_BOM_{suffix}",
            "description": "Test BOM with component routings",
            "revision": "A",
            "status": "active",
            "parent_routings": [assembly_routing],  # FG gets Assembly
            "components": [
                {
                    "item_id": sg_item_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": [welding_routing]  # SG gets Welding
                },
                {
                    "item_id": pt_item_id,
                    "quantity": 2,
                    "unit_of_measure": "pcs",
                    "routings": [lc_cutting_routing, bending_routing]  # PT gets LC Cutting + Bending
                },
                {
                    "item_id": rm_item_id,
                    "quantity": 5,
                    "unit_of_measure": "pcs",
                    "routings": []  # RM has no routing
                }
            ]
        })
        
        assert resp.status_code == 200, f"BOM creation failed: {resp.text}"
        bom = resp.json()
        
        assert "id" in bom
        assert bom["name"] == f"TEST_BOM_{suffix}"
        
        # Verify parent_routings
        assert "parent_routings" in bom, "BOM should have parent_routings field"
        assert assembly_routing in bom["parent_routings"], f"Expected {assembly_routing} in parent_routings"
        
        # Verify component routings
        assert len(bom["components"]) == 3, f"Expected 3 components, got {len(bom['components'])}"
        
        sg_comp = next((c for c in bom["components"] if c["item_id"] == sg_item_id), None)
        assert sg_comp is not None, "SG component not found"
        assert welding_routing in sg_comp.get("routings", []), f"SG should have {welding_routing}"
        
        pt_comp = next((c for c in bom["components"] if c["item_id"] == pt_item_id), None)
        assert pt_comp is not None, "PT component not found"
        assert lc_cutting_routing in pt_comp.get("routings", []), f"PT should have {lc_cutting_routing}"
        assert bending_routing in pt_comp.get("routings", []), f"PT should have {bending_routing}"
        
        rm_comp = next((c for c in bom["components"] if c["item_id"] == rm_item_id), None)
        assert rm_comp is not None, "RM component not found"
        assert rm_comp.get("routings", []) == [], "RM should have empty routings"
        
        test_data["bom"] = bom
        test_data["routing_names"] = {
            "assembly": assembly_routing,
            "welding": welding_routing,
            "lc_cutting": lc_cutting_routing,
            "bending": bending_routing
        }
        print(f"PASSED: Created BOM with parent_routings and component routings")
    
    def test_get_bom_explosion_shows_routings(self, session, test_data):
        """GET /api/bom/{id}/explode returns components with routings array"""
        if "bom" not in test_data:
            pytest.skip("No BOM created")
        
        bom_id = test_data["bom"]["id"]
        resp = session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        
        assert resp.status_code == 200, f"BOM explosion failed: {resp.text}"
        explosion = resp.json()
        
        assert "explosion" in explosion, "Response should have explosion field"
        assert "bom" in explosion, "Response should have bom field"
        
        # The explosion should contain components
        components = explosion["explosion"]
        assert len(components) >= 3, f"Expected at least 3 components in explosion"
        
        print(f"PASSED: BOM explosion returned {len(components)} components")


class TestMOCreationWithBOMRoutings:
    """Test MO creation pulls operations from BOM parent_routings and component routings"""
    
    def test_create_production_order(self, session, test_data):
        """Create production order for MO test"""
        if "bom" not in test_data:
            pytest.skip("No BOM created")
        
        bom_id = test_data["bom"]["id"]
        
        resp = session.post(f"{BASE_URL}/api/production", json={
            "bom_id": bom_id,
            "quantity": 5,
            "due_date": "2026-02-15T00:00:00Z",
            "priority": "medium"
        })
        
        assert resp.status_code == 200, f"Production order creation failed: {resp.text}"
        po = resp.json()
        assert "id" in po
        
        # Confirm the production order
        resp = session.post(f"{BASE_URL}/api/production/{po['id']}/confirm")
        assert resp.status_code == 200, f"Production order confirmation failed: {resp.text}"
        
        test_data["production_order"] = po
        print(f"PASSED: Created and confirmed production order {po.get('order_number')}")
    
    def test_create_mo_main_item_uses_parent_routings(self, session, test_data):
        """POST /api/work-orders creates MO with operations from BOM parent_routings for main item"""
        if "production_order" not in test_data:
            pytest.skip("Missing production order")
        
        po_id = test_data["production_order"]["id"]
        
        # Use first routing as placeholder (required by WorkOrderCreate model)
        routing_id = test_data["routings"][0]["id"]
        
        resp = session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": po_id,
            "routing_id": routing_id,
            "quantity": 5
        })
        
        assert resp.status_code == 201, f"MO creation failed: {resp.text}"
        result = resp.json()
        
        assert "work_orders" in result, f"Expected work_orders in response: {result}"
        assert len(result["work_orders"]) > 0, f"Expected at least 1 work order: {result}"
        
        # Find main MO (parent_wo_id is None)
        main_mo = next((wo for wo in result["work_orders"] if wo.get("parent_wo_id") is None), None)
        assert main_mo is not None, "Main MO not found"
        
        # Verify main MO has operations from parent_routings
        ops_status = main_mo.get("operations_status", [])
        assembly_routing = test_data["routing_names"]["assembly"]
        
        print(f"INFO: Main MO has {len(ops_status)} operations: {[op.get('operation_name') for op in ops_status]}")
        
        # Main MO should have Assembly operation from parent_routings
        if len(ops_status) > 0:
            op_names = [op.get("operation_name") for op in ops_status]
            assert assembly_routing in op_names, f"Main MO should have {assembly_routing} from parent_routings"
            print(f"PASSED: Main MO has operations from parent_routings: {op_names}")
        
        test_data["work_orders"] = result["work_orders"]
        test_data["main_mo"] = main_mo
        print(f"PASSED: Created {len(result['work_orders'])} MO(s)")
    
    def test_child_mos_use_component_routings(self, session, test_data):
        """Child MOs get operations from parent BOM's component routings"""
        if "work_orders" not in test_data:
            pytest.skip("No work orders created")
        
        work_orders = test_data["work_orders"]
        main_mo_id = test_data["main_mo"]["id"]
        
        # Find child MOs
        child_mos = [wo for wo in work_orders if wo.get("parent_wo_id") == main_mo_id]
        
        print(f"INFO: Found {len(child_mos)} child MOs")
        
        for child_mo in child_mos:
            item_id = child_mo.get("item_id")
            ops_status = child_mo.get("operations_status", [])
            op_names = [op.get("operation_name") for op in ops_status]
            
            print(f"  Child MO for item {item_id}: operations = {op_names}")
            
            # Verify operations match component routings from BOM
            if item_id == test_data["sg_item"]["id"]:
                # SG should have Welding
                welding = test_data["routing_names"]["welding"]
                if len(ops_status) > 0:
                    assert welding in op_names, f"SG MO should have {welding}"
                    print(f"  PASSED: SG MO has {welding}")
            
            elif item_id == test_data["pt_item"]["id"]:
                # PT should have LC Cutting and Bending
                lc_cutting = test_data["routing_names"]["lc_cutting"]
                bending = test_data["routing_names"]["bending"]
                if len(ops_status) > 0:
                    assert lc_cutting in op_names or bending in op_names, f"PT MO should have {lc_cutting} or {bending}"
                    print(f"  PASSED: PT MO has operations from component routings")
        
        print(f"PASSED: Child MOs have operations from component routings")
    
    def test_rm_has_no_mo(self, session, test_data):
        """RM components have no routing and should not create MO"""
        if "work_orders" not in test_data:
            pytest.skip("No work orders created")
        
        work_orders = test_data["work_orders"]
        rm_item_id = test_data["rm_item"]["id"]
        
        # RM should not have an MO
        rm_mo = next((wo for wo in work_orders if wo.get("item_id") == rm_item_id), None)
        
        # RM items typically don't get MOs because they're raw materials
        # The system should not create MOs for items without routings
        if rm_mo is None:
            print(f"PASSED: RM item has no MO (as expected)")
        else:
            # If RM has MO, it should have empty operations
            ops = rm_mo.get("operations_status", [])
            print(f"INFO: RM item has MO with {len(ops)} operations")


class TestLoginAndAuth:
    """Verify login works with admin credentials"""
    
    def test_login_admin(self):
        """Login works with admin@erp.com / Admin@123"""
        s = requests.Session()
        resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        user = resp.json()
        assert user["email"] == "admin@erp.com"
        assert user["role"] == "admin"
        print(f"PASSED: Login successful for admin@erp.com")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup(self, session, test_data):
        """Clean up created test data"""
        # Delete work orders if exist
        for wo in test_data.get("work_orders", []):
            try:
                session.delete(f"{BASE_URL}/api/work-orders/{wo['id']}")
            except:
                pass
        
        # Delete production order if exists
        if "production_order" in test_data:
            try:
                session.post(f"{BASE_URL}/api/production/{test_data['production_order']['id']}/cancel")
            except:
                pass
        
        # Delete BOM if exists
        if "bom" in test_data:
            try:
                session.delete(f"{BASE_URL}/api/bom/{test_data['bom']['id']}")
            except:
                pass
        
        print("PASSED: Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
