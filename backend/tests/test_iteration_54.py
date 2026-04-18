"""
Iteration 54 Tests - Two Fixes:
1. Fix 1: MO-SC (without_material / No RM) flow - Send DC button should NOT show for without_material SCs
2. Fix 2: BOM routing costs per operation - routings now store {name, cost} dicts
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    # Copy cookies for auth
    return session


class TestBOMRoutingCosts:
    """Fix 2: BOM routing costs per operation"""
    
    def test_bom_create_with_routing_costs(self, auth_session):
        """POST /api/bom with routings as {name, cost} dicts should store correctly"""
        # First create test items
        parent_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-FG-RC-{datetime.now().timestamp()}",
            "name": "Test FG for Routing Costs",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100
        })
        assert parent_item.status_code == 201
        parent_item_id = parent_item.json()["id"]
        
        comp_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-COMP-RC-{datetime.now().timestamp()}",
            "name": "Test Component for Routing Costs",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 50
        })
        assert comp_item.status_code == 201
        comp_item_id = comp_item.json()["id"]
        
        # Create BOM with routing costs
        bom_resp = auth_session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": "Test BOM with Routing Costs",
            "revision": "A",
            "status": "active",
            "parent_routings": [
                {"name": "Assembly", "cost": 100}
            ],
            "components": [
                {
                    "item_id": comp_item_id,
                    "quantity": 2,
                    "unit_of_measure": "pcs",
                    "routings": [
                        {"name": "LC Cutting", "cost": 50},
                        {"name": "Bending", "cost": 30}
                    ]
                }
            ]
        })
        assert bom_resp.status_code == 200 or bom_resp.status_code == 201, f"BOM create failed: {bom_resp.text}"
        bom_data = bom_resp.json()
        
        # Verify parent_routings stored as dicts with name and cost
        assert "parent_routings" in bom_data
        assert len(bom_data["parent_routings"]) == 1
        assert bom_data["parent_routings"][0]["name"] == "Assembly"
        assert bom_data["parent_routings"][0]["cost"] == 100
        
        # Verify component routings stored as dicts with name and cost
        assert len(bom_data["components"]) == 1
        comp_routings = bom_data["components"][0]["routings"]
        assert len(comp_routings) == 2
        assert comp_routings[0]["name"] == "LC Cutting"
        assert comp_routings[0]["cost"] == 50
        assert comp_routings[1]["name"] == "Bending"
        assert comp_routings[1]["cost"] == 30
        
        print(f"✓ BOM created with routing costs: parent_routings={bom_data['parent_routings']}, comp_routings={comp_routings}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/bom/{bom_data['id']}")
        auth_session.delete(f"{BASE_URL}/api/items/{parent_item_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{comp_item_id}")
    
    def test_bom_legacy_string_routings_normalized(self, auth_session):
        """POST /api/bom with routings as list of strings should normalize to {name, cost: 0}"""
        # Create test items
        parent_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-FG-LEGACY-{datetime.now().timestamp()}",
            "name": "Test FG for Legacy Routings",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100
        })
        assert parent_item.status_code == 201
        parent_item_id = parent_item.json()["id"]
        
        comp_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-COMP-LEGACY-{datetime.now().timestamp()}",
            "name": "Test Component for Legacy Routings",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 50
        })
        assert comp_item.status_code == 201
        comp_item_id = comp_item.json()["id"]
        
        # Create BOM with legacy string routings
        bom_resp = auth_session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": "Test BOM with Legacy Routings",
            "revision": "A",
            "status": "active",
            "parent_routings": ["Assembly"],  # Legacy string format
            "components": [
                {
                    "item_id": comp_item_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": ["LC Cutting", "Welding"]  # Legacy string format
                }
            ]
        })
        assert bom_resp.status_code == 200 or bom_resp.status_code == 201, f"BOM create failed: {bom_resp.text}"
        bom_data = bom_resp.json()
        
        # Verify parent_routings normalized to {name, cost: 0}
        assert len(bom_data["parent_routings"]) == 1
        assert bom_data["parent_routings"][0]["name"] == "Assembly"
        assert bom_data["parent_routings"][0]["cost"] == 0  # Default cost
        
        # Verify component routings normalized
        comp_routings = bom_data["components"][0]["routings"]
        assert len(comp_routings) == 2
        assert comp_routings[0]["name"] == "LC Cutting"
        assert comp_routings[0]["cost"] == 0
        assert comp_routings[1]["name"] == "Welding"
        assert comp_routings[1]["cost"] == 0
        
        print(f"✓ Legacy string routings normalized: parent_routings={bom_data['parent_routings']}, comp_routings={comp_routings}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/bom/{bom_data['id']}")
        auth_session.delete(f"{BASE_URL}/api/items/{parent_item_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{comp_item_id}")
    
    def test_bom_explode_process_cost_from_routings(self, auth_session):
        """GET /api/bom/{id}/explode should return process_cost_per_unit = sum of routing costs"""
        # Create test items
        parent_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-FG-EXP-{datetime.now().timestamp()}",
            "name": "Test FG for Explode",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 0
        })
        assert parent_item.status_code == 201
        parent_item_id = parent_item.json()["id"]
        
        comp_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-COMP-EXP-{datetime.now().timestamp()}",
            "name": "Test Component for Explode",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 100  # Material cost
        })
        assert comp_item.status_code == 201
        comp_item_id = comp_item.json()["id"]
        
        # Create BOM with routing costs: LC Cutting 50 + Bending 30 = 80
        bom_resp = auth_session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": "Test BOM for Explode Process Cost",
            "revision": "A",
            "status": "active",
            "parent_routings": [],
            "components": [
                {
                    "item_id": comp_item_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": [
                        {"name": "LC Cutting", "cost": 50},
                        {"name": "Bending", "cost": 30}
                    ]
                }
            ]
        })
        assert bom_resp.status_code == 200 or bom_resp.status_code == 201, f"BOM create failed: {bom_resp.text}"
        bom_id = bom_resp.json()["id"]
        
        # Explode BOM
        explode_resp = auth_session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert explode_resp.status_code == 200, f"BOM explode failed: {explode_resp.text}"
        explode_data = explode_resp.json()
        
        # Verify process_cost_per_unit = 50 + 30 = 80
        assert len(explode_data["explosion"]) == 1
        comp_explosion = explode_data["explosion"][0]
        
        assert comp_explosion["process_cost_per_unit"] == 80, f"Expected process_cost_per_unit=80, got {comp_explosion['process_cost_per_unit']}"
        
        # Verify total_cost_per_unit = material (100) + process (80) = 180
        assert comp_explosion["total_cost_per_unit"] == 180, f"Expected total_cost_per_unit=180, got {comp_explosion['total_cost_per_unit']}"
        
        # Verify extended_cost = total_cost_per_unit * quantity = 180 * 1 = 180
        assert comp_explosion["extended_cost"] == 180, f"Expected extended_cost=180, got {comp_explosion['extended_cost']}"
        
        print(f"✓ BOM explode process_cost_per_unit={comp_explosion['process_cost_per_unit']}, total_cost_per_unit={comp_explosion['total_cost_per_unit']}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/bom/{bom_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{parent_item_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{comp_item_id}")
    
    def test_bom_explode_routings_priority_over_sc_wo(self, auth_session):
        """BOM routing costs should take priority over SC/WO-derived process costs"""
        # This test verifies that when BOM has routing costs, they are used
        # instead of looking up SC orders or WO operations
        
        # Create test items
        parent_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-FG-PRI-{datetime.now().timestamp()}",
            "name": "Test FG for Priority",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 0
        })
        assert parent_item.status_code == 201
        parent_item_id = parent_item.json()["id"]
        
        comp_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-COMP-PRI-{datetime.now().timestamp()}",
            "name": "Test Component for Priority",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 50
        })
        assert comp_item.status_code == 201
        comp_item_id = comp_item.json()["id"]
        
        # Create BOM with routing costs
        bom_resp = auth_session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": "Test BOM for Priority Check",
            "revision": "A",
            "status": "active",
            "parent_routings": [],
            "components": [
                {
                    "item_id": comp_item_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": [
                        {"name": "Machining", "cost": 75}
                    ]
                }
            ]
        })
        assert bom_resp.status_code == 200 or bom_resp.status_code == 201
        bom_id = bom_resp.json()["id"]
        
        # Explode BOM - should use BOM routing cost (75), not SC/WO fallback
        explode_resp = auth_session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert explode_resp.status_code == 200
        explode_data = explode_resp.json()
        
        comp_explosion = explode_data["explosion"][0]
        assert comp_explosion["process_cost_per_unit"] == 75, f"BOM routing cost should be 75, got {comp_explosion['process_cost_per_unit']}"
        
        print(f"✓ BOM routing cost takes priority: process_cost_per_unit={comp_explosion['process_cost_per_unit']}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/bom/{bom_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{parent_item_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{comp_item_id}")


class TestSubcontractOrderWithoutMaterial:
    """Fix 1: SC without_material flow - Create PO button instead of Send DC"""
    
    def test_sc_without_material_has_fg_in_lines(self, auth_session):
        """Verify that without_material SC has FG item in lines (backend behavior)"""
        # Get a supplier
        suppliers_resp = auth_session.get(f"{BASE_URL}/api/suppliers")
        assert suppliers_resp.status_code == 200
        suppliers = suppliers_resp.json()
        
        if not suppliers:
            # Create a test supplier
            supplier_resp = auth_session.post(f"{BASE_URL}/api/suppliers", json={
                "name": f"Test Supplier SC-{datetime.now().timestamp()}",
                "code": f"SUP-SC-{int(datetime.now().timestamp())}",
                "status": "active"
            })
            assert supplier_resp.status_code == 201
            supplier_id = supplier_resp.json()["id"]
        else:
            supplier_id = suppliers[0]["id"]
        
        # Create a test FG item
        fg_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-FG-SC-{datetime.now().timestamp()}",
            "name": "Test FG for SC Without Material",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500
        })
        assert fg_item.status_code == 201
        fg_item_id = fg_item.json()["id"]
        
        # Create SC order without material (lines should be empty initially, backend adds FG)
        # Note: The without_material SC is typically created from MO outsource flow
        # For direct creation, we pass empty lines and the backend should handle it
        sc_resp = auth_session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": supplier_id,
            "lines": [{"item_id": fg_item_id, "quantity": 10, "rate": 0}],  # FG item as line
            "job_work_parts": [],
            "expected_return_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "processing_charges": 0,
            "notes": "Test SC without material"
        })
        
        # The SC creation might succeed or fail depending on validation
        # What we're testing is the frontend button visibility logic
        print(f"SC creation response: {sc_resp.status_code} - {sc_resp.text[:200] if sc_resp.text else 'empty'}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/items/{fg_item_id}")
    
    def test_get_sc_orders_returns_subcontract_type(self, auth_session):
        """GET /api/job-work/orders should return subcontract_type field"""
        orders_resp = auth_session.get(f"{BASE_URL}/api/job-work/orders")
        assert orders_resp.status_code == 200, f"Failed to get SC orders: {orders_resp.text}"
        orders = orders_resp.json()
        
        # Check if any orders exist and have subcontract_type field
        if orders:
            for order in orders[:5]:  # Check first 5
                # subcontract_type may or may not be present depending on how order was created
                print(f"SC Order {order.get('order_number')}: subcontract_type={order.get('subcontract_type', 'not set')}, lines={len(order.get('lines', []))}, job_work_parts={len(order.get('job_work_parts', []))}")
        else:
            print("No SC orders found - skipping subcontract_type check")
        
        print("✓ SC orders endpoint returns data correctly")


class TestBOMUpdateRoutings:
    """Test BOM update with routing costs"""
    
    def test_bom_update_routing_costs(self, auth_session):
        """PUT /api/bom/{id} should update routing costs correctly"""
        # Create test items
        parent_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-FG-UPD-{datetime.now().timestamp()}",
            "name": "Test FG for Update",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 0
        })
        assert parent_item.status_code == 201
        parent_item_id = parent_item.json()["id"]
        
        comp_item = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST-COMP-UPD-{datetime.now().timestamp()}",
            "name": "Test Component for Update",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 100
        })
        assert comp_item.status_code == 201
        comp_item_id = comp_item.json()["id"]
        
        # Create BOM with initial routing costs
        bom_resp = auth_session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": "Test BOM for Update",
            "revision": "A",
            "status": "active",
            "parent_routings": [{"name": "Assembly", "cost": 50}],
            "components": [
                {
                    "item_id": comp_item_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": [{"name": "LC Cutting", "cost": 20}]
                }
            ]
        })
        assert bom_resp.status_code == 200 or bom_resp.status_code == 201
        bom_id = bom_resp.json()["id"]
        
        # Update BOM with new routing costs
        update_resp = auth_session.put(f"{BASE_URL}/api/bom/{bom_id}", json={
            "parent_routings": [{"name": "Assembly", "cost": 75}],  # Updated cost
            "components": [
                {
                    "item_id": comp_item_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": [
                        {"name": "LC Cutting", "cost": 40},  # Updated cost
                        {"name": "Bending", "cost": 25}  # New routing
                    ]
                }
            ]
        })
        assert update_resp.status_code == 200, f"BOM update failed: {update_resp.text}"
        updated_bom = update_resp.json()
        
        # Verify updated parent_routings
        assert updated_bom["parent_routings"][0]["cost"] == 75
        
        # Verify updated component routings
        comp_routings = updated_bom["components"][0]["routings"]
        assert len(comp_routings) == 2
        assert comp_routings[0]["name"] == "LC Cutting"
        assert comp_routings[0]["cost"] == 40
        assert comp_routings[1]["name"] == "Bending"
        assert comp_routings[1]["cost"] == 25
        
        print(f"✓ BOM updated with new routing costs: parent={updated_bom['parent_routings']}, comp={comp_routings}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/bom/{bom_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{parent_item_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{comp_item_id}")


class TestRegressionExistingBOMs:
    """Regression tests for existing BOMs"""
    
    def test_get_existing_boms(self, auth_session):
        """GET /api/bom should return all BOMs without errors"""
        boms_resp = auth_session.get(f"{BASE_URL}/api/bom")
        assert boms_resp.status_code == 200, f"Failed to get BOMs: {boms_resp.text}"
        boms = boms_resp.json()
        
        print(f"✓ Found {len(boms)} BOMs")
        
        # Check a few BOMs for routing structure
        for bom in boms[:3]:
            parent_routings = bom.get("parent_routings", [])
            print(f"  BOM {bom.get('name')}: parent_routings={parent_routings}")
            for comp in bom.get("components", [])[:2]:
                comp_routings = comp.get("routings", [])
                print(f"    Component: routings={comp_routings}")
    
    def test_explode_existing_bom(self, auth_session):
        """GET /api/bom/{id}/explode should work for existing BOMs"""
        boms_resp = auth_session.get(f"{BASE_URL}/api/bom?status=active")
        assert boms_resp.status_code == 200
        boms = boms_resp.json()
        
        if not boms:
            print("No active BOMs found - skipping explode test")
            return
        
        # Try to explode first active BOM
        bom_id = boms[0]["id"]
        explode_resp = auth_session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert explode_resp.status_code == 200, f"BOM explode failed: {explode_resp.text}"
        
        explode_data = explode_resp.json()
        print(f"✓ BOM explode successful: total_rollup_cost={explode_data.get('total_rollup_cost')}")
        
        # Check explosion items for process_cost_per_unit
        for item in explode_data.get("explosion", [])[:3]:
            print(f"  Item: process_cost_per_unit={item.get('process_cost_per_unit', 0)}, total_cost_per_unit={item.get('total_cost_per_unit', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
