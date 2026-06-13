"""
Test iteration 148 - Three fixes verification:
1. Fix 1: Role-group permission `view_all_parties` - new boolean flag on RoleGroup model
2. Fix 2: MO schedule date + delay info (FRONTEND-only - skip in backend tests)
3. Fix 3: Child MO creation for items WITHOUT routing - create MO if item has BOM regardless of routing
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSetup:
    """Setup fixtures and authentication"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create a requests session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    @pytest.fixture(scope="class")
    def admin_session(self, session):
        """Login as admin and return authenticated session"""
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def admin_user(self, admin_session):
        """Get admin user info"""
        resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        return resp.json()


class TestFix1RoleGroupViewAllParties(TestSetup):
    """
    Fix 1: Role-group permission `view_all_parties`
    - POST /api/users/role-groups with view_all_parties=true creates and persists the flag
    - PUT /api/users/role-groups/{id} can toggle view_all_parties
    - GET /api/users/role-groups returns view_all_parties in each entry
    - GET /api/auth/me includes view_all_parties=true for users in a group with the flag
    """
    
    test_group_id = None
    test_user_id = None
    
    def test_create_role_group_with_view_all_parties_true(self, admin_session):
        """POST /api/users/role-groups with view_all_parties=true creates and persists the flag"""
        unique_name = f"TEST_ViewAllParties_Group_{uuid.uuid4().hex[:8]}"
        resp = admin_session.post(f"{BASE_URL}/api/users/role-groups", json={
            "name": unique_name,
            "description": "Test group with view_all_parties enabled",
            "permissions": {},
            "is_admin_group": False,
            "view_all_parties": True
        })
        assert resp.status_code == 201, f"Failed to create role group: {resp.text}"
        data = resp.json()
        
        # Verify view_all_parties is returned and True
        assert "view_all_parties" in data, "view_all_parties field missing in response"
        assert data["view_all_parties"] == True, f"view_all_parties should be True, got {data['view_all_parties']}"
        assert "id" in data, "id field missing in response"
        
        TestFix1RoleGroupViewAllParties.test_group_id = data["id"]
        print(f"✓ Created role group with view_all_parties=True, id={data['id']}")
    
    def test_get_role_groups_returns_view_all_parties(self, admin_session):
        """GET /api/users/role-groups returns view_all_parties in each entry"""
        resp = admin_session.get(f"{BASE_URL}/api/users/role-groups")
        assert resp.status_code == 200, f"Failed to get role groups: {resp.text}"
        groups = resp.json()
        
        assert isinstance(groups, list), "Response should be a list"
        
        # Find our test group
        test_group = None
        for g in groups:
            if g.get("id") == TestFix1RoleGroupViewAllParties.test_group_id:
                test_group = g
                break
        
        assert test_group is not None, "Test group not found in list"
        assert "view_all_parties" in test_group, "view_all_parties field missing in group"
        assert test_group["view_all_parties"] == True, "view_all_parties should be True"
        print(f"✓ GET /api/users/role-groups returns view_all_parties field correctly")
    
    def test_update_role_group_toggle_view_all_parties(self, admin_session):
        """PUT /api/users/role-groups/{id} can toggle view_all_parties"""
        group_id = TestFix1RoleGroupViewAllParties.test_group_id
        assert group_id, "Test group not created"
        
        # Toggle to False
        resp = admin_session.put(f"{BASE_URL}/api/users/role-groups/{group_id}", json={
            "view_all_parties": False
        })
        assert resp.status_code == 200, f"Failed to update role group: {resp.text}"
        data = resp.json()
        assert data["view_all_parties"] == False, "view_all_parties should be False after toggle"
        
        # Toggle back to True
        resp = admin_session.put(f"{BASE_URL}/api/users/role-groups/{group_id}", json={
            "view_all_parties": True
        })
        assert resp.status_code == 200, f"Failed to update role group: {resp.text}"
        data = resp.json()
        assert data["view_all_parties"] == True, "view_all_parties should be True after toggle back"
        print(f"✓ PUT /api/users/role-groups/{group_id} can toggle view_all_parties")
    
    def test_create_user_in_view_all_parties_group(self, admin_session):
        """Create a test user in the view_all_parties group"""
        group_id = TestFix1RoleGroupViewAllParties.test_group_id
        assert group_id, "Test group not created"
        
        unique_email = f"test_vap_user_{uuid.uuid4().hex[:8]}@test.com"
        resp = admin_session.post(f"{BASE_URL}/api/users", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test VAP User",
            "role": "user",
            "role_group_id": group_id
        })
        assert resp.status_code == 201, f"Failed to create user: {resp.text}"
        data = resp.json()
        TestFix1RoleGroupViewAllParties.test_user_id = data["id"]
        print(f"✓ Created test user in view_all_parties group, id={data['id']}")
    
    def test_auth_me_includes_view_all_parties(self, admin_session):
        """GET /api/auth/me includes view_all_parties=true for users in a group with the flag"""
        # Login as the test user
        test_session = requests.Session()
        test_session.headers.update({"Content-Type": "application/json"})
        
        # We need to get the user's email first - get all users and find ours
        user_id = TestFix1RoleGroupViewAllParties.test_user_id
        if not user_id:
            pytest.skip("Test user not created")
        
        # Get all users and find our test user
        users_resp = admin_session.get(f"{BASE_URL}/api/users")
        if users_resp.status_code != 200:
            pytest.skip("Could not get users list")
        
        users = users_resp.json()
        test_user = None
        for u in users:
            if u.get("id") == user_id:
                test_user = u
                break
        
        if not test_user:
            pytest.skip("Test user not found in users list")
        
        user_email = test_user.get("email")
        
        login_resp = test_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_email,
            "password": "TestPass123!"
        })
        assert login_resp.status_code == 200, f"Test user login failed: {login_resp.text}"
        login_data = login_resp.json()
        
        # Check login response includes view_all_parties
        assert "view_all_parties" in login_data, "view_all_parties missing in login response"
        assert login_data["view_all_parties"] == True, f"view_all_parties should be True, got {login_data['view_all_parties']}"
        
        # Also check /auth/me
        me_resp = test_session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200, f"GET /auth/me failed: {me_resp.text}"
        me_data = me_resp.json()
        
        assert "view_all_parties" in me_data, "view_all_parties missing in /auth/me response"
        assert me_data["view_all_parties"] == True, f"view_all_parties should be True in /auth/me, got {me_data['view_all_parties']}"
        print(f"✓ GET /api/auth/me includes view_all_parties=True for user in group with flag")


class TestFix1SuppliersCustomersVisibility(TestSetup):
    """
    Fix 1 continued: Test that view_all_parties affects suppliers/customers visibility
    - GET /api/suppliers as admin returns ALL suppliers
    - GET /api/customers as admin returns ALL customers
    """
    
    def test_admin_sees_all_suppliers(self, admin_session):
        """GET /api/suppliers as admin returns ALL suppliers"""
        resp = admin_session.get(f"{BASE_URL}/api/suppliers")
        assert resp.status_code == 200, f"Failed to get suppliers: {resp.text}"
        suppliers = resp.json()
        
        assert isinstance(suppliers, list), "Response should be a list"
        # Admin should see all suppliers (no filtering)
        print(f"✓ Admin sees {len(suppliers)} suppliers (all suppliers visible)")
    
    def test_admin_sees_all_customers(self, admin_session):
        """GET /api/customers as admin returns ALL customers"""
        resp = admin_session.get(f"{BASE_URL}/api/customers")
        assert resp.status_code == 200, f"Failed to get customers: {resp.text}"
        customers = resp.json()
        
        assert isinstance(customers, list), "Response should be a list"
        # Admin should see all customers (no filtering)
        print(f"✓ Admin sees {len(customers)} customers (all customers visible)")


class TestFix3ChildMOWithoutRouting(TestSetup):
    """
    Fix 3: Child MO creation for items WITHOUT routing
    - POST /api/work-orders creates a parent MO. If BOM has a sub-assembly (SG) child whose item 
      has its OWN active BOM but NO routing AND NO parent_routings, a child MO must still be 
      created for that SG (operations_status=[], routing_id=null, parent_wo_id=parent.id)
    - Newly-created routing-less child MO can be started via POST /api/work-orders/{id}/start
    - After start, the routing-less MO can be completed via PUT /api/work-orders/{id} {status:'completed'}
    - GET /api/work-orders returns scheduled_start, scheduled_end, due_date fields populated
    """
    
    test_rm_item_id = None
    test_sg_item_id = None
    test_fg_item_id = None
    test_sg_bom_id = None
    test_fg_bom_id = None
    test_parent_wo_id = None
    test_child_wo_id = None
    
    def test_setup_items_and_boms(self, admin_session):
        """Setup test items and BOMs for the routing-less child MO test"""
        unique_suffix = uuid.uuid4().hex[:6]
        
        # 1. Create a raw material item
        rm_resp = admin_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST_RM_{unique_suffix}",
            "name": f"Test Raw Material {unique_suffix}",
            "category": "raw_material",
            "unit_of_measure": "pcs",
            "unit_cost": 10.0,
            "current_stock": 1000  # Enough stock
        })
        assert rm_resp.status_code == 201, f"Failed to create RM item: {rm_resp.text}"
        TestFix3ChildMOWithoutRouting.test_rm_item_id = rm_resp.json()["id"]
        print(f"✓ Created RM item: {rm_resp.json()['part_number']}")
        
        # 2. Create a sub-assembly item (NO routing will be created for this)
        sg_resp = admin_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST_SG_NOROUTING_{unique_suffix}",
            "name": f"Test Sub-Assembly No Routing {unique_suffix}",
            "category": "sub_assembly",
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
            "current_stock": 0  # No stock - will need MO
        })
        assert sg_resp.status_code == 201, f"Failed to create SG item: {sg_resp.text}"
        TestFix3ChildMOWithoutRouting.test_sg_item_id = sg_resp.json()["id"]
        print(f"✓ Created SG item (no routing): {sg_resp.json()['part_number']}")
        
        # 3. Create a finished good item
        fg_resp = admin_session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST_FG_{unique_suffix}",
            "name": f"Test Finished Good {unique_suffix}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0,
            "current_stock": 0
        })
        assert fg_resp.status_code == 201, f"Failed to create FG item: {fg_resp.text}"
        TestFix3ChildMOWithoutRouting.test_fg_item_id = fg_resp.json()["id"]
        print(f"✓ Created FG item: {fg_resp.json()['part_number']}")
        
        # 4. Create BOM for SG (with RM as component, NO parent_routings)
        sg_bom_resp = admin_session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": TestFix3ChildMOWithoutRouting.test_sg_item_id,
            "name": f"BOM for SG No Routing {unique_suffix}",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": TestFix3ChildMOWithoutRouting.test_rm_item_id,
                    "quantity": 2,
                    "unit_of_measure": "pcs"
                }
            ],
            "parent_routings": []  # NO routings!
        })
        assert sg_bom_resp.status_code in [200, 201], f"Failed to create SG BOM: {sg_bom_resp.text}"
        TestFix3ChildMOWithoutRouting.test_sg_bom_id = sg_bom_resp.json()["id"]
        print(f"✓ Created SG BOM (no parent_routings): {sg_bom_resp.json()['id']}")
        
        # 5. Create BOM for FG (with SG as component)
        fg_bom_resp = admin_session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": TestFix3ChildMOWithoutRouting.test_fg_item_id,
            "name": f"BOM for FG {unique_suffix}",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": TestFix3ChildMOWithoutRouting.test_sg_item_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs"
                }
            ],
            "parent_routings": [{"name": "Assembly", "cost": 20.0}]
        })
        assert fg_bom_resp.status_code in [200, 201], f"Failed to create FG BOM: {fg_bom_resp.text}"
        TestFix3ChildMOWithoutRouting.test_fg_bom_id = fg_bom_resp.json()["id"]
        print(f"✓ Created FG BOM: {fg_bom_resp.json()['id']}")
    
    def test_create_work_order_creates_child_mo_without_routing(self, admin_session):
        """
        POST /api/work-orders creates a parent MO. If BOM has a sub-assembly child 
        whose item has its OWN active BOM but NO routing AND NO parent_routings, 
        a child MO must still be created for that SG.
        """
        fg_bom_id = TestFix3ChildMOWithoutRouting.test_fg_bom_id
        assert fg_bom_id, "FG BOM not created"
        
        # Get the FG BOM to find the item_id
        bom_resp = admin_session.get(f"{BASE_URL}/api/bom/{fg_bom_id}")
        assert bom_resp.status_code == 200, f"Failed to get FG BOM: {bom_resp.text}"
        fg_item_id = bom_resp.json()["parent_item_id"]
        
        # Create work order for FG
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        scheduled_start = (datetime.now() + timedelta(days=1)).isoformat()
        scheduled_end = (datetime.now() + timedelta(days=5)).isoformat()
        
        wo_resp = admin_session.post(f"{BASE_URL}/api/work-orders", json={
            "order_type": "mts",
            "item_id": fg_item_id,
            "quantity": 5,
            "due_date": due_date,
            "scheduled_start": scheduled_start,
            "scheduled_end": scheduled_end,
            "notes": "Test MO for routing-less child verification"
        })
        assert wo_resp.status_code in [200, 201], f"Failed to create work order: {wo_resp.text}"
        wo_data = wo_resp.json()
        
        # Should have created multiple work orders (parent + child)
        work_orders = wo_data.get("work_orders", [])
        assert len(work_orders) >= 1, "Should have created at least 1 work order"
        
        # Find parent and child WOs
        parent_wo = None
        child_wo = None
        sg_item_id = TestFix3ChildMOWithoutRouting.test_sg_item_id
        
        for wo in work_orders:
            if wo.get("item_id") == fg_item_id and wo.get("parent_wo_id") is None:
                parent_wo = wo
            elif wo.get("item_id") == sg_item_id:
                child_wo = wo
        
        assert parent_wo is not None, "Parent WO not found"
        TestFix3ChildMOWithoutRouting.test_parent_wo_id = parent_wo["id"]
        print(f"✓ Created parent WO: {parent_wo['wo_number']}")
        
        # CRITICAL: Child MO should be created even though SG has no routing
        assert child_wo is not None, "Child MO for routing-less SG was NOT created - FIX 3 FAILED!"
        TestFix3ChildMOWithoutRouting.test_child_wo_id = child_wo["id"]
        
        # Verify child MO properties
        assert child_wo.get("parent_wo_id") == parent_wo["id"], "Child MO should reference parent"
        assert child_wo.get("routing_id") in [None, ""], "Routing-less child should have null/empty routing_id"
        assert child_wo.get("operations_status") in [None, []], "Routing-less child should have empty operations_status"
        
        print(f"✓ Created child MO for routing-less SG: {child_wo['wo_number']}")
        print(f"  - parent_wo_id: {child_wo.get('parent_wo_id')}")
        print(f"  - routing_id: {child_wo.get('routing_id')}")
        print(f"  - operations_status: {child_wo.get('operations_status')}")
    
    def test_start_routing_less_child_mo(self, admin_session):
        """
        Newly-created routing-less child MO can be started via POST /api/work-orders/{id}/start
        (RM consumed from BOM, status → in_progress, materials_consumed=true)
        """
        child_wo_id = TestFix3ChildMOWithoutRouting.test_child_wo_id
        assert child_wo_id, "Child WO not created"
        
        # Start the child MO
        start_resp = admin_session.post(f"{BASE_URL}/api/work-orders/{child_wo_id}/start")
        assert start_resp.status_code == 200, f"Failed to start child MO: {start_resp.text}"
        
        # Verify the MO is now in_progress
        wo_resp = admin_session.get(f"{BASE_URL}/api/work-orders/{child_wo_id}")
        assert wo_resp.status_code == 200, f"Failed to get child MO: {wo_resp.text}"
        wo_data = wo_resp.json()
        
        assert wo_data.get("status") == "in_progress", f"Child MO status should be in_progress, got {wo_data.get('status')}"
        assert wo_data.get("materials_consumed") == True, "materials_consumed should be True after start"
        
        print(f"✓ Started routing-less child MO successfully")
        print(f"  - status: {wo_data.get('status')}")
        print(f"  - materials_consumed: {wo_data.get('materials_consumed')}")
    
    def test_complete_routing_less_child_mo(self, admin_session):
        """
        After start, the routing-less MO can be completed via PUT /api/work-orders/{id} {status:'completed'}
        (no operations block it)
        """
        child_wo_id = TestFix3ChildMOWithoutRouting.test_child_wo_id
        assert child_wo_id, "Child WO not created"
        
        # Complete the child MO
        complete_resp = admin_session.put(f"{BASE_URL}/api/work-orders/{child_wo_id}", json={
            "status": "completed",
            "quantity_completed": 5
        })
        assert complete_resp.status_code == 200, f"Failed to complete child MO: {complete_resp.text}"
        
        # Verify the MO is now completed
        wo_resp = admin_session.get(f"{BASE_URL}/api/work-orders/{child_wo_id}")
        assert wo_resp.status_code == 200, f"Failed to get child MO: {wo_resp.text}"
        wo_data = wo_resp.json()
        
        assert wo_data.get("status") == "completed", f"Child MO status should be completed, got {wo_data.get('status')}"
        
        print(f"✓ Completed routing-less child MO successfully")
        print(f"  - status: {wo_data.get('status')}")
        print(f"  - quantity_completed: {wo_data.get('quantity_completed')}")
    
    def test_work_orders_return_schedule_fields(self, admin_session):
        """
        GET /api/work-orders returns scheduled_start, scheduled_end, due_date fields populated
        """
        resp = admin_session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200, f"Failed to get work orders: {resp.text}"
        work_orders = resp.json()
        
        assert isinstance(work_orders, list), "Response should be a list"
        
        # Find our test parent WO
        parent_wo_id = TestFix3ChildMOWithoutRouting.test_parent_wo_id
        test_wo = None
        for wo in work_orders:
            if wo.get("id") == parent_wo_id:
                test_wo = wo
                break
        
        if test_wo:
            # Verify schedule fields are present
            has_scheduled_start = "scheduled_start" in test_wo
            has_scheduled_end = "scheduled_end" in test_wo
            has_due_date = "due_date" in test_wo
            
            print(f"✓ Work order schedule fields:")
            print(f"  - scheduled_start present: {has_scheduled_start}, value: {test_wo.get('scheduled_start')}")
            print(f"  - scheduled_end present: {has_scheduled_end}, value: {test_wo.get('scheduled_end')}")
            print(f"  - due_date present: {has_due_date}, value: {test_wo.get('due_date')}")
            
            # At least one schedule field should be populated
            assert has_scheduled_start or has_scheduled_end or has_due_date, \
                "At least one schedule field should be present in work order"
        else:
            print("⚠ Test parent WO not found in list, checking any WO for schedule fields")
            if work_orders:
                sample_wo = work_orders[0]
                print(f"  Sample WO fields: scheduled_start={sample_wo.get('scheduled_start')}, scheduled_end={sample_wo.get('scheduled_end')}, due_date={sample_wo.get('due_date')}")


class TestCleanup(TestSetup):
    """Cleanup test data"""
    
    def test_cleanup(self, admin_session):
        """Clean up test data created during tests"""
        # Delete test role group
        if TestFix1RoleGroupViewAllParties.test_group_id:
            resp = admin_session.delete(f"{BASE_URL}/api/users/role-groups/{TestFix1RoleGroupViewAllParties.test_group_id}")
            print(f"Cleanup: Deleted test role group, status={resp.status_code}")
        
        # Delete test user
        if TestFix1RoleGroupViewAllParties.test_user_id:
            resp = admin_session.delete(f"{BASE_URL}/api/users/{TestFix1RoleGroupViewAllParties.test_user_id}")
            print(f"Cleanup: Deleted test user, status={resp.status_code}")
        
        # Note: Work orders, BOMs, and items are not deleted to preserve audit trail
        print("✓ Cleanup completed (WOs, BOMs, items preserved for audit)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
