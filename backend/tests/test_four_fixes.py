"""
Test file for verifying four fixes in Machinery Manufacturing ERP:
1) MRP demand should show only raw materials
2) Insufficient materials dialog should show item description along with code
3) Parent WO should not start when child WOs are not completed
4) BOM explosion should show rollup costing (unit cost, extended cost, total cost)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSession:
    """Shared session with authentication"""
    session = None
    auth_cookies = None
    
    @classmethod
    def get_session(cls):
        if cls.session is None:
            cls.session = requests.Session()
            cls.session.headers.update({"Content-Type": "application/json"})
            # Login
            response = cls.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@erp.com",
                "password": "Admin@123"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
            cls.auth_cookies = response.cookies
        return cls.session


class TestMRPDemandRawMaterialsOnly:
    """Fix 1: MRP demand should return ONLY raw_material category items"""
    
    def test_mrp_demand_returns_only_raw_materials(self):
        """Verify GET /api/mrp/demand returns only raw_material category items"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/mrp/demand")
        
        assert response.status_code == 200, f"MRP demand failed: {response.text}"
        demand_items = response.json()
        
        print(f"\nMRP Demand returned {len(demand_items)} items")
        
        # Verify all items are raw_material category
        for item in demand_items:
            item_data = item.get("item", {})
            category = item_data.get("category")
            part_number = item_data.get("part_number", "Unknown")
            name = item_data.get("name", "Unknown")
            
            print(f"  - {part_number}: {name} (category: {category})")
            
            assert category == "raw_material", \
                f"Item {part_number} has category '{category}' but should be 'raw_material'"
    
    def test_mrp_demand_excludes_sub_assemblies(self):
        """Verify MRP demand does NOT include sub_assembly items"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/mrp/demand")
        
        assert response.status_code == 200
        demand_items = response.json()
        
        # Check that no sub_assembly items are present
        sub_assemblies = [
            item for item in demand_items 
            if item.get("item", {}).get("category") == "sub_assembly"
        ]
        
        assert len(sub_assemblies) == 0, \
            f"Found {len(sub_assemblies)} sub_assembly items in MRP demand (should be 0)"
    
    def test_mrp_demand_excludes_components(self):
        """Verify MRP demand does NOT include component items"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/mrp/demand")
        
        assert response.status_code == 200
        demand_items = response.json()
        
        # Check that no component items are present
        components = [
            item for item in demand_items 
            if item.get("item", {}).get("category") == "component"
        ]
        
        assert len(components) == 0, \
            f"Found {len(components)} component items in MRP demand (should be 0)"
    
    def test_mrp_demand_excludes_finished_goods(self):
        """Verify MRP demand does NOT include finished_good items"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/mrp/demand")
        
        assert response.status_code == 200
        demand_items = response.json()
        
        # Check that no finished_good items are present
        finished_goods = [
            item for item in demand_items 
            if item.get("item", {}).get("category") == "finished_good"
        ]
        
        assert len(finished_goods) == 0, \
            f"Found {len(finished_goods)} finished_good items in MRP demand (should be 0)"


class TestInsufficientMaterialsShowsNameAndCode:
    """Fix 2: Insufficient materials dialog should show item name AND code"""
    
    def test_start_wo_insufficient_materials_includes_name(self):
        """Verify POST /api/work-orders/{id}/start returns item name AND code when materials insufficient"""
        session = TestSession.get_session()
        
        # Get work orders to find one that might have insufficient materials
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find a pending work order
        pending_wos = [wo for wo in work_orders if wo.get("status") == "pending"]
        
        if not pending_wos:
            pytest.skip("No pending work orders available for testing")
        
        # Try to start a work order - if materials are insufficient, check response format
        for wo in pending_wos:
            wo_id = wo.get("id")
            response = session.post(f"{BASE_URL}/api/work-orders/{wo_id}/start")
            
            if response.status_code == 200:
                data = response.json()
                # If successful but has insufficient_materials in response
                if data.get("success") == False and data.get("insufficient_materials"):
                    for material in data.get("insufficient_materials", []):
                        assert "item" in material, "Missing 'item' (part number) in insufficient_materials"
                        assert "name" in material, "Missing 'name' (description) in insufficient_materials"
                        print(f"  Insufficient material: {material.get('item')} - {material.get('name')}")
                    return
            elif response.status_code == 400:
                # Check if it's a child WO incomplete error (different error)
                if "Child work orders" in response.text:
                    continue
        
        print("Note: Could not find a work order with insufficient materials to test")


class TestParentWOBlockedByIncompleteChildren:
    """Fix 3: Parent WO should not start when child WOs are not completed"""
    
    def test_get_work_orders_with_parent_child_relationships(self):
        """Verify work orders have parent_wo_id relationships"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/work-orders")
        
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find parent-child relationships
        parent_wos = [wo for wo in work_orders if wo.get("parent_wo_id") is None]
        child_wos = [wo for wo in work_orders if wo.get("parent_wo_id") is not None]
        
        print(f"\nWork Orders: {len(parent_wos)} parents, {len(child_wos)} children")
        
        for wo in work_orders:
            parent_id = wo.get("parent_wo_id")
            status = wo.get("status")
            wo_number = wo.get("wo_number")
            print(f"  - {wo_number}: status={status}, parent_wo_id={parent_id}")
    
    def test_start_parent_wo_blocked_by_incomplete_children(self):
        """Verify starting parent WO fails if child WOs are not completed"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/work-orders")
        
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find a parent WO that has incomplete children
        for wo in work_orders:
            if wo.get("parent_wo_id") is None and wo.get("status") == "pending":
                wo_id = wo.get("id")
                wo_number = wo.get("wo_number")
                
                # Check if this WO has children
                children = [w for w in work_orders if w.get("parent_wo_id") == wo_id]
                incomplete_children = [c for c in children if c.get("status") != "completed"]
                
                if incomplete_children:
                    print(f"\nTesting parent WO {wo_number} with {len(incomplete_children)} incomplete children")
                    
                    # Try to start the parent WO
                    response = session.post(f"{BASE_URL}/api/work-orders/{wo_id}/start")
                    
                    # Should fail with 400
                    assert response.status_code == 400, \
                        f"Expected 400 error but got {response.status_code}: {response.text}"
                    
                    # Check error message mentions child work orders
                    error_detail = response.json().get("detail", "")
                    assert "Child work orders" in error_detail or "child" in error_detail.lower(), \
                        f"Error message should mention child work orders: {error_detail}"
                    
                    print(f"  Correctly blocked: {error_detail[:100]}...")
                    return
        
        pytest.skip("No parent WO with incomplete children found for testing")
    
    def test_wo_000004_has_child_wo_000005(self):
        """Verify WO-000004 (parent) has WO-000005 (child) - specific test case"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/work-orders")
        
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find WO-000004 and WO-000005
        wo_004 = next((wo for wo in work_orders if wo.get("wo_number") == "WO-000004"), None)
        wo_005 = next((wo for wo in work_orders if wo.get("wo_number") == "WO-000005"), None)
        
        if wo_004 and wo_005:
            print(f"\nWO-000004: id={wo_004.get('id')}, status={wo_004.get('status')}")
            print(f"WO-000005: id={wo_005.get('id')}, status={wo_005.get('status')}, parent_wo_id={wo_005.get('parent_wo_id')}")
            
            # Verify WO-000005 is child of WO-000004
            assert wo_005.get("parent_wo_id") == wo_004.get("id"), \
                "WO-000005 should have WO-000004 as parent"
            
            # If both are pending, try to start WO-000004 (should fail)
            if wo_004.get("status") == "pending" and wo_005.get("status") != "completed":
                response = session.post(f"{BASE_URL}/api/work-orders/{wo_004.get('id')}/start")
                assert response.status_code == 400, \
                    f"Starting WO-000004 should fail when WO-000005 is not completed"
                print("  Correctly blocked starting WO-000004 due to incomplete WO-000005")
        else:
            print("Note: WO-000004 or WO-000005 not found in current data")


class TestBOMExplosionRollupCosting:
    """Fix 4: BOM explosion should show rollup costing (unit cost, extended cost, total cost)"""
    
    def test_bom_explode_includes_unit_cost(self):
        """Verify GET /api/bom/{id}/explode includes unit_cost on each component"""
        session = TestSession.get_session()
        
        # Get BOMs
        response = session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        boms = response.json()
        
        if not boms:
            pytest.skip("No BOMs available for testing")
        
        # Test explosion for first BOM
        bom = boms[0]
        bom_id = bom.get("id")
        
        response = session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert response.status_code == 200
        explosion = response.json()
        
        print(f"\nBOM Explosion for {bom.get('name')}:")
        
        # Check each component has unit_cost
        for component in explosion.get("explosion", []):
            item = component.get("item", {})
            unit_cost = component.get("unit_cost")
            
            print(f"  - {item.get('part_number')}: unit_cost=${unit_cost}")
            
            assert "unit_cost" in component, \
                f"Component {item.get('part_number')} missing unit_cost field"
            assert unit_cost is not None, \
                f"Component {item.get('part_number')} has null unit_cost"
    
    def test_bom_explode_includes_extended_cost(self):
        """Verify GET /api/bom/{id}/explode includes extended_cost on each component"""
        session = TestSession.get_session()
        
        # Get BOMs
        response = session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        boms = response.json()
        
        if not boms:
            pytest.skip("No BOMs available for testing")
        
        # Test explosion for first BOM
        bom = boms[0]
        bom_id = bom.get("id")
        
        response = session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert response.status_code == 200
        explosion = response.json()
        
        # Check each component has extended_cost
        for component in explosion.get("explosion", []):
            item = component.get("item", {})
            extended_cost = component.get("extended_cost")
            quantity = component.get("quantity")
            unit_cost = component.get("unit_cost")
            
            print(f"  - {item.get('part_number')}: qty={quantity}, unit=${unit_cost}, extended=${extended_cost}")
            
            assert "extended_cost" in component, \
                f"Component {item.get('part_number')} missing extended_cost field"
            assert extended_cost is not None, \
                f"Component {item.get('part_number')} has null extended_cost"
    
    def test_bom_explode_includes_total_rollup_cost(self):
        """Verify GET /api/bom/{id}/explode includes total_rollup_cost at top level"""
        session = TestSession.get_session()
        
        # Get BOMs
        response = session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        boms = response.json()
        
        if not boms:
            pytest.skip("No BOMs available for testing")
        
        # Test explosion for first BOM
        bom = boms[0]
        bom_id = bom.get("id")
        
        response = session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert response.status_code == 200
        explosion = response.json()
        
        print(f"\nBOM: {bom.get('name')}")
        print(f"Total Rollup Cost: ${explosion.get('total_rollup_cost')}")
        
        assert "total_rollup_cost" in explosion, \
            "BOM explosion missing total_rollup_cost field"
        assert explosion.get("total_rollup_cost") is not None, \
            "BOM explosion has null total_rollup_cost"
    
    def test_bom_explode_extended_cost_calculation(self):
        """Verify extended_cost = unit_cost * quantity"""
        session = TestSession.get_session()
        
        # Get BOMs
        response = session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        boms = response.json()
        
        if not boms:
            pytest.skip("No BOMs available for testing")
        
        # Test explosion for first BOM
        bom = boms[0]
        bom_id = bom.get("id")
        
        response = session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert response.status_code == 200
        explosion = response.json()
        
        # Verify calculation for each component
        for component in explosion.get("explosion", []):
            item = component.get("item", {})
            unit_cost = component.get("unit_cost", 0)
            quantity = component.get("quantity", 0)
            extended_cost = component.get("extended_cost", 0)
            
            expected_extended = unit_cost * quantity
            
            # Allow small floating point differences
            assert abs(extended_cost - expected_extended) < 0.01, \
                f"Component {item.get('part_number')}: extended_cost {extended_cost} != unit_cost {unit_cost} * qty {quantity} = {expected_extended}"
    
    def test_bom_explode_total_cost_is_sum_of_extended(self):
        """Verify total_rollup_cost is sum of all extended_costs"""
        session = TestSession.get_session()
        
        # Get BOMs
        response = session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        boms = response.json()
        
        if not boms:
            pytest.skip("No BOMs available for testing")
        
        # Test explosion for first BOM
        bom = boms[0]
        bom_id = bom.get("id")
        
        response = session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert response.status_code == 200
        explosion = response.json()
        
        # Sum extended costs
        total_extended = sum(c.get("extended_cost", 0) for c in explosion.get("explosion", []))
        total_rollup = explosion.get("total_rollup_cost", 0)
        
        print(f"\nSum of extended costs: ${total_extended}")
        print(f"Total rollup cost: ${total_rollup}")
        
        # Allow small floating point differences
        assert abs(total_rollup - total_extended) < 0.01, \
            f"total_rollup_cost {total_rollup} != sum of extended_costs {total_extended}"


class TestExistingWorkOrderFlows:
    """Verify existing work order start/complete flows still work for WOs without children"""
    
    def test_start_wo_without_children_works(self):
        """Verify starting a WO without children works normally"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/work-orders")
        
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find a pending WO without children
        for wo in work_orders:
            if wo.get("status") == "pending" and wo.get("parent_wo_id") is None:
                wo_id = wo.get("id")
                
                # Check if this WO has children
                children = [w for w in work_orders if w.get("parent_wo_id") == wo_id]
                
                if not children:
                    print(f"\nFound WO without children: {wo.get('wo_number')}")
                    # This WO has no children, so starting should work (if materials available)
                    # We just verify the endpoint is accessible
                    response = session.post(f"{BASE_URL}/api/work-orders/{wo_id}/start")
                    
                    # Should either succeed (200) or fail due to materials (400), not due to children
                    assert response.status_code in [200, 400], \
                        f"Unexpected status code: {response.status_code}"
                    
                    if response.status_code == 400:
                        error = response.json().get("detail", "")
                        # Should NOT be a child WO error
                        assert "Child work orders" not in error, \
                            f"WO without children should not get child WO error: {error}"
                    
                    print(f"  Response: {response.status_code}")
                    return
        
        print("Note: No pending WO without children found for testing")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
