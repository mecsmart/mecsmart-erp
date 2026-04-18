"""
Iteration 58 Tests - Manual SC BOM Cost Fixes
Tests for:
1. Fix 1: Manual SC create (POST /api/job-work/orders) pulls process_cost from BOM
2. Fix 1 Regression: User-provided charges are preserved (not overwritten by BOM)
3. Fix 1: Manual SC update (PUT /api/job-work/orders/{id}) re-pulls BOM charges when charges=0
4. Fix 2: Same behavior for with_material SCs
5. Fix 4: process_names stored on job_work_parts from BOM routings
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return session


@pytest.fixture(scope="module")
def test_supplier(auth_session):
    """Get or create a test supplier"""
    resp = auth_session.get(f"{BASE_URL}/api/suppliers")
    assert resp.status_code == 200
    suppliers = resp.json()
    if suppliers:
        return suppliers[0]
    
    # Create supplier if none exists
    resp = auth_session.post(f"{BASE_URL}/api/suppliers", json={
        "name": f"TEST_Supplier_{uuid.uuid4().hex[:8]}",
        "code": f"SUP-TEST-{uuid.uuid4().hex[:6]}"
    })
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture(scope="module")
def test_item_with_bom_routing(auth_session):
    """
    Find or create an item that is a COMPONENT in a BOM with routing costs.
    RM-002 (5830fd71-71c2-42c6-8347-efe52998f7e3) is a component in BOM with:
    - LC Cutting: 50
    - Bending: 30
    Total process_cost = 80
    """
    # RM-002 is a component in BOM "RoutingCostTest" with routing costs
    item_id = "5830fd71-71c2-42c6-8347-efe52998f7e3"
    resp = auth_session.get(f"{BASE_URL}/api/items/{item_id}")
    if resp.status_code == 200:
        return {
            "id": item_id,
            "expected_process_cost": 80.0,  # LC Cutting:50 + Bending:30
            "expected_process_names": ["LC Cutting", "Bending"],
            "expected_rm_cost": 28.5  # unit_cost of RM-002
        }
    
    # If item doesn't exist, skip test
    pytest.skip("Test item RM-002 not found in database")


@pytest.fixture(scope="module")
def test_item_as_bom_parent(auth_session):
    """
    Find an item that IS a BOM parent with routing costs.
    RM-001 (3447f544-6d02-4ed0-89e7-79e37250923f) is the parent of BOM "RoutingCostTest" with:
    - parent_routings: Assembly:100
    - component routings: LC Cutting:50, Bending:30
    Total process_cost = 180
    """
    item_id = "3447f544-6d02-4ed0-89e7-79e37250923f"
    resp = auth_session.get(f"{BASE_URL}/api/items/{item_id}")
    if resp.status_code == 200:
        return {
            "id": item_id,
            "expected_process_cost": 180.0,  # Assembly:100 + LC Cutting:50 + Bending:30
            "expected_process_names": ["Assembly", "LC Cutting", "Bending"],
            "expected_rm_cost": 28.5  # 1 * 28.5 (RM-002 unit_cost)
        }
    
    pytest.skip("Test item RM-001 not found in database")


class TestFix1_ManualSCCreatePullsBOMCosts:
    """Fix 1: POST /api/job-work/orders with job_work_parts pulls process_cost from BOM"""
    
    def test_manual_sc_create_pulls_bom_process_cost(self, auth_session, test_supplier, test_item_with_bom_routing):
        """
        When creating manual SC with job_work_parts[{item_id, quantity}] (no charges),
        the resulting charges should be pulled from BOM process_cost.
        """
        item_info = test_item_with_bom_routing
        
        # Create SC order with job_work_parts but NO charges (charges=0)
        payload = {
            "supplier_id": test_supplier["id"],
            "lines": [],  # No RM lines for this test
            "job_work_parts": [
                {"item_id": item_info["id"], "quantity": 2, "charges": 0}  # charges=0 should trigger BOM lookup
            ],
            "notes": "TEST_iter58_manual_sc_bom_cost"
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/job-work/orders", json=payload)
        assert resp.status_code == 201, f"Failed to create SC: {resp.text}"
        
        sc_order = resp.json()
        assert "job_work_parts" in sc_order
        assert len(sc_order["job_work_parts"]) == 1
        
        jwp = sc_order["job_work_parts"][0]
        
        # Verify charges pulled from BOM process_cost
        assert jwp["charges"] == item_info["expected_process_cost"], \
            f"Expected charges={item_info['expected_process_cost']} from BOM, got {jwp['charges']}"
        
        # Verify bom_rollup_cost is set
        assert jwp["bom_rollup_cost"] == item_info["expected_rm_cost"], \
            f"Expected bom_rollup_cost={item_info['expected_rm_cost']}, got {jwp.get('bom_rollup_cost')}"
        
        # Verify process_names are stored
        assert "process_names" in jwp, "process_names should be stored on job_work_part"
        assert set(jwp["process_names"]) == set(item_info["expected_process_names"]), \
            f"Expected process_names={item_info['expected_process_names']}, got {jwp['process_names']}"
        
        print(f"✓ Manual SC created with BOM-derived charges={jwp['charges']}, process_names={jwp['process_names']}")


class TestFix1_Regression_UserChargesPreserved:
    """Fix 1 Regression: User-provided charges should NOT be overwritten by BOM"""
    
    def test_user_provided_charges_preserved(self, auth_session, test_supplier, test_item_with_bom_routing):
        """
        When creating manual SC with explicit charges=500,
        the user-provided charges should be preserved (not overwritten by BOM).
        """
        item_info = test_item_with_bom_routing
        user_charges = 500.0
        
        payload = {
            "supplier_id": test_supplier["id"],
            "lines": [],
            "job_work_parts": [
                {"item_id": item_info["id"], "quantity": 3, "charges": user_charges}  # Explicit charges
            ],
            "notes": "TEST_iter58_user_charges_preserved"
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/job-work/orders", json=payload)
        assert resp.status_code == 201, f"Failed to create SC: {resp.text}"
        
        sc_order = resp.json()
        jwp = sc_order["job_work_parts"][0]
        
        # User-provided charges should be preserved
        assert jwp["charges"] == user_charges, \
            f"User charges={user_charges} should be preserved, got {jwp['charges']}"
        
        # process_names should still be populated from BOM
        assert "process_names" in jwp
        
        print(f"✓ User-provided charges={user_charges} preserved (BOM process_cost={item_info['expected_process_cost']})")


class TestFix1_ManualSCUpdatePullsBOMCosts:
    """Fix 1: PUT /api/job-work/orders/{id} re-pulls BOM charges when charges=0"""
    
    def test_manual_sc_update_pulls_bom_charges(self, auth_session, test_supplier, test_item_with_bom_routing):
        """
        When updating SC with job_work_parts[{item_id, quantity, charges=0}],
        the charges should be re-pulled from BOM.
        """
        item_info = test_item_with_bom_routing
        
        # First create an SC with explicit charges
        create_payload = {
            "supplier_id": test_supplier["id"],
            "lines": [],
            "job_work_parts": [
                {"item_id": item_info["id"], "quantity": 1, "charges": 999}  # Initial charges
            ],
            "notes": "TEST_iter58_update_bom_charges"
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/job-work/orders", json=create_payload)
        assert resp.status_code == 201
        sc_order = resp.json()
        sc_id = sc_order["id"]
        
        # Now update with charges=0 to trigger BOM lookup
        update_payload = {
            "job_work_parts": [
                {"item_id": item_info["id"], "quantity": 2, "charges": 0}  # charges=0 triggers BOM lookup
            ]
        }
        
        resp = auth_session.put(f"{BASE_URL}/api/job-work/orders/{sc_id}", json=update_payload)
        assert resp.status_code == 200, f"Failed to update SC: {resp.text}"
        
        updated_sc = resp.json()
        jwp = updated_sc["job_work_parts"][0]
        
        # Verify charges pulled from BOM
        assert jwp["charges"] == item_info["expected_process_cost"], \
            f"Expected charges={item_info['expected_process_cost']} from BOM after update, got {jwp['charges']}"
        
        # Verify process_names updated
        assert "process_names" in jwp
        assert set(jwp["process_names"]) == set(item_info["expected_process_names"])
        
        print(f"✓ SC update with charges=0 pulled BOM charges={jwp['charges']}")


class TestFix2_WithMaterialSCBehavior:
    """Fix 2: Same BOM cost behavior for with_material SCs (default type)"""
    
    def test_with_material_sc_pulls_bom_costs(self, auth_session, test_supplier, test_item_with_bom_routing):
        """
        SC with RM lines (with_material type) should also pull BOM costs for job_work_parts.
        """
        item_info = test_item_with_bom_routing
        
        # Get a raw material item for RM lines
        resp = auth_session.get(f"{BASE_URL}/api/items?category=raw_material")
        assert resp.status_code == 200
        rm_items = resp.json()
        if not rm_items:
            pytest.skip("No raw material items found")
        rm_item = rm_items[0]
        
        # Create SC with both RM lines and job_work_parts
        payload = {
            "supplier_id": test_supplier["id"],
            "lines": [
                {"item_id": rm_item["id"], "quantity": 10, "rate": 50}  # RM line
            ],
            "job_work_parts": [
                {"item_id": item_info["id"], "quantity": 5, "charges": 0}  # Should pull from BOM
            ],
            "notes": "TEST_iter58_with_material_sc"
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/job-work/orders", json=payload)
        assert resp.status_code == 201, f"Failed to create SC: {resp.text}"
        
        sc_order = resp.json()
        
        # Verify RM lines present
        assert len(sc_order["lines"]) == 1
        
        # Verify job_work_parts has BOM-derived charges
        assert len(sc_order["job_work_parts"]) == 1
        jwp = sc_order["job_work_parts"][0]
        
        assert jwp["charges"] == item_info["expected_process_cost"], \
            f"with_material SC: Expected charges={item_info['expected_process_cost']}, got {jwp['charges']}"
        
        print(f"✓ with_material SC pulls BOM charges={jwp['charges']}")


class TestFix4_ProcessNamesStored:
    """Fix 4: process_names stored on job_work_parts from BOM routings"""
    
    def test_process_names_from_component_routings(self, auth_session, test_supplier, test_item_with_bom_routing):
        """
        When item is a COMPONENT in a BOM, process_names should be the component's routing names.
        """
        item_info = test_item_with_bom_routing
        
        payload = {
            "supplier_id": test_supplier["id"],
            "lines": [],
            "job_work_parts": [
                {"item_id": item_info["id"], "quantity": 1, "charges": 0}
            ],
            "notes": "TEST_iter58_process_names_component"
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/job-work/orders", json=payload)
        assert resp.status_code == 201
        
        sc_order = resp.json()
        jwp = sc_order["job_work_parts"][0]
        
        # Verify process_names matches expected routing names
        assert "process_names" in jwp
        assert len(jwp["process_names"]) == len(item_info["expected_process_names"])
        assert set(jwp["process_names"]) == set(item_info["expected_process_names"]), \
            f"Expected process_names={item_info['expected_process_names']}, got {jwp['process_names']}"
        
        print(f"✓ process_names stored: {jwp['process_names']}")
    
    def test_process_names_from_parent_bom(self, auth_session, test_supplier, test_item_as_bom_parent):
        """
        When item IS a BOM parent, process_names should include parent_routings + component routings.
        """
        item_info = test_item_as_bom_parent
        
        payload = {
            "supplier_id": test_supplier["id"],
            "lines": [],
            "job_work_parts": [
                {"item_id": item_info["id"], "quantity": 1, "charges": 0}
            ],
            "notes": "TEST_iter58_process_names_parent"
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/job-work/orders", json=payload)
        assert resp.status_code == 201
        
        sc_order = resp.json()
        jwp = sc_order["job_work_parts"][0]
        
        # Verify process_names includes all routing names
        assert "process_names" in jwp
        assert set(jwp["process_names"]) == set(item_info["expected_process_names"]), \
            f"Expected process_names={item_info['expected_process_names']}, got {jwp['process_names']}"
        
        # Verify charges = total process_cost
        assert jwp["charges"] == item_info["expected_process_cost"], \
            f"Expected charges={item_info['expected_process_cost']}, got {jwp['charges']}"
        
        print(f"✓ Parent BOM process_names: {jwp['process_names']}, charges={jwp['charges']}")


class TestBackfilledSCsHaveProcessNames:
    """Regression: Existing SCs (backfilled) should have process_names populated"""
    
    def test_existing_scs_have_process_names(self, auth_session):
        """
        Check that existing SC orders have process_names on their job_work_parts.
        """
        resp = auth_session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        
        orders = resp.json()
        
        # Find orders with job_work_parts
        orders_with_jwp = [o for o in orders if o.get("job_work_parts") and len(o["job_work_parts"]) > 0]
        
        if not orders_with_jwp:
            pytest.skip("No SC orders with job_work_parts found")
        
        # Check a sample of orders
        checked = 0
        for order in orders_with_jwp[:5]:  # Check up to 5 orders
            for jwp in order["job_work_parts"]:
                # process_names should exist (may be empty list if no BOM routings)
                assert "process_names" in jwp or jwp.get("process_name"), \
                    f"Order {order['order_number']}: job_work_part missing process_names"
                checked += 1
        
        print(f"✓ Checked {checked} job_work_parts across {min(5, len(orders_with_jwp))} orders - all have process_names")


class TestDCPrintProcessColumn:
    """Fix 4 FE: DC Print should show process names from process_name || process_names.join(', ')"""
    
    def test_dc_has_process_info(self, auth_session):
        """
        Verify that DCs have the necessary data for process column display.
        """
        resp = auth_session.get(f"{BASE_URL}/api/job-work/challans")
        assert resp.status_code == 200
        
        challans = resp.json()
        if not challans:
            pytest.skip("No delivery challans found")
        
        # Check challans that have order with job_work_parts
        for dc in challans[:3]:
            order = dc.get("order", {})
            jwp = order.get("job_work_parts", [])
            
            if jwp:
                for part in jwp:
                    # Either process_name or process_names should be available
                    has_process_info = part.get("process_name") or part.get("process_names")
                    if has_process_info:
                        print(f"✓ DC {dc['dc_number']}: part has process info: {part.get('process_name') or part.get('process_names')}")
        
        print("✓ DC process info check complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
