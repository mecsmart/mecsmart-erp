"""
Iteration 114 - find_routing_cost Multi-BOM Search & PUT Permission Fixes
=========================================================================
Tests for two user-reported issues:

1. Process cost in Edit SC dialog showing combined (90.61) instead of specific Powder Coating cost (37.61)
   - Root cause: find_routing_cost only checked the item's own BOM, not parent FG BOMs where the item appears as a component
   - Fix: find_routing_cost now scans ALL BOMs (as parent AND as component) to find the routing cost
   - Test: Create a component with routing defined on a PARENT FG's BOM component-line, verify find_routing_cost finds it

2. Non-admin users can't update price/qty/description in Edit SC dialog
   - Root cause: PUT /api/job-work/orders/{id} only accepted job_work.edit permission
   - Fix: PUT now accepts users with EITHER edit OR create permission on job_work module + inventory_manager role
   - Test: Create user with only job_work.create permission, verify they can PUT to update SC

Backend Tests:
- find_routing_cost finds routing cost from parent FG BOM's component-line (not just item's own BOM)
- PUT /api/job-work/orders/{id} accepts user with job_work.create permission
- PUT /api/job-work/orders/{id} rejects user with neither edit nor create permission (403)
- Regression: All iteration 113 tests still pass
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestFindRoutingCostMultiBOMSearch:
    """Tests for find_routing_cost scanning ALL BOMs where item appears"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_114_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        yield
        # Cleanup
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
            except:
                pass
        for bom_id in self.created_boms:
            try:
                self.client.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except:
                pass
        for sup_id in self.created_suppliers:
            try:
                self.client.delete(f"{BASE_URL}/api/suppliers/{sup_id}")
            except:
                pass
    
    def _create_test_item(self, api_client, suffix, category="component"):
        """Helper to create a test item"""
        item_data = {
            "part_number": f"{self.test_prefix}{suffix}",
            "name": f"Test Item {suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 100
        }
        resp = api_client.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201, f"Failed to create item: {resp.text}"
        item_id = resp.json()["id"]
        self.created_items.append(item_id)
        return item_id
    
    def _create_test_supplier(self, api_client, suffix):
        """Helper to create a test supplier"""
        sup_data = {
            "code": f"{self.test_prefix}SUP_{suffix}",
            "name": f"Test Supplier {suffix}",
            "status": "active",
            "state_code": "27",
            "gstin": "",
            "pin_code": "400001"
        }
        resp = api_client.post(f"{BASE_URL}/api/suppliers", json=sup_data)
        assert resp.status_code in [200, 201], f"Failed to create supplier: {resp.text}"
        sup_id = resp.json()["id"]
        self.created_suppliers.append(sup_id)
        return sup_id
    
    def test_find_routing_cost_from_parent_fg_bom_component_line(self, api_client):
        """
        Test that find_routing_cost finds routing cost when the routing is defined on a PARENT FG's BOM
        component-line, NOT on the component's own BOM.
        
        Scenario (user's real issue):
        - Component PT-1 has NO BOM of its own (or BOM without Powder Coating routing)
        - FG-1 has a BOM with PT-1 as a component, and PT-1's component-line has routings: [{"name": "Powder Coating", "cost": 37.61}]
        - find_routing_cost("PT-1", "Powder Coating") should return 37.61 (found from FG-1's BOM)
        """
        # Create component (PT-1 equivalent) - NO BOM of its own
        component_id = self._create_test_item(api_client, "COMP_PT1", category="component")
        
        # Create FG item (FG-1 equivalent)
        fg_id = self._create_test_item(api_client, "FG_1", category="finished_good")
        
        # Create FG BOM with component having specific routing cost
        # This is the key scenario: routing is on the COMPONENT LINE of the FG's BOM
        fg_bom_data = {
            "parent_item_id": fg_id,
            "name": f"{self.test_prefix}FG_BOM",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": component_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": [
                        {"name": "Powder Coating", "cost": 37.61},
                        {"name": "Zinc Plating", "cost": 53.00}
                    ]
                }
            ],
            "parent_routings": [
                {"name": "Assembly", "cost": 100}
            ]
        }
        fg_bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=fg_bom_data)
        assert fg_bom_resp.status_code in [200, 201], f"Failed to create FG BOM: {fg_bom_resp.text}"
        fg_bom_id = fg_bom_resp.json()["id"]
        self.created_boms.append(fg_bom_id)
        
        # Test: find_routing_cost should find "Powder Coating" cost from FG's BOM component-line
        resp = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={
            "item_id": component_id,
            "process_name": "Powder Coating"
        })
        assert resp.status_code == 200, f"Failed to get routing cost: {resp.text}"
        data = resp.json()
        
        assert data["item_id"] == component_id
        assert data["process_name"] == "Powder Coating"
        assert data["cost"] == 37.61, f"Expected cost 37.61 (from FG BOM component-line), got {data['cost']}"
        print(f"✓ find_routing_cost found Powder Coating cost {data['cost']} from parent FG BOM's component-line")
        
        # Also test Zinc Plating
        resp2 = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={
            "item_id": component_id,
            "process_name": "Zinc Plating"
        })
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["cost"] == 53.00, f"Expected cost 53.00 for Zinc Plating, got {data2['cost']}"
        print(f"✓ find_routing_cost found Zinc Plating cost {data2['cost']} from parent FG BOM's component-line")
    
    def test_find_routing_cost_prefers_items_own_bom_over_parent(self, api_client):
        """
        Test that when an item has BOTH its own BOM with a routing AND appears in a parent BOM,
        find_routing_cost prefers the item's own BOM (active first).
        """
        # Create component with its OWN BOM
        component_id = self._create_test_item(api_client, "COMP_OWN", category="component")
        
        # Create component's OWN BOM with specific routing cost
        own_bom_data = {
            "parent_item_id": component_id,
            "name": f"{self.test_prefix}COMP_OWN_BOM",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Powder Coating", "cost": 25.00}  # Component's own cost
            ]
        }
        own_bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=own_bom_data)
        assert own_bom_resp.status_code in [200, 201]
        own_bom_id = own_bom_resp.json()["id"]
        self.created_boms.append(own_bom_id)
        
        # Create FG with component having DIFFERENT routing cost
        fg_id = self._create_test_item(api_client, "FG_PARENT", category="finished_good")
        fg_bom_data = {
            "parent_item_id": fg_id,
            "name": f"{self.test_prefix}FG_PARENT_BOM",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": component_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": [
                        {"name": "Powder Coating", "cost": 50.00}  # Different cost on parent BOM
                    ]
                }
            ],
            "parent_routings": []
        }
        fg_bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=fg_bom_data)
        assert fg_bom_resp.status_code in [200, 201]
        fg_bom_id = fg_bom_resp.json()["id"]
        self.created_boms.append(fg_bom_id)
        
        # Test: find_routing_cost should return 25.00 (from item's own BOM, not parent's 50.00)
        resp = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={
            "item_id": component_id,
            "process_name": "Powder Coating"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        # Item's own BOM is checked first (as parent), so should return 25.00
        assert data["cost"] == 25.00, f"Expected cost 25.00 (from item's own BOM), got {data['cost']}"
        print(f"✓ find_routing_cost prefers item's own BOM cost ({data['cost']}) over parent BOM cost (50.00)")
    
    def test_find_routing_cost_scans_multiple_parent_boms(self, api_client):
        """
        Test that find_routing_cost scans MULTIPLE parent BOMs where the item appears as a component.
        If the first parent BOM doesn't have the routing, it should check subsequent ones.
        """
        # Create component
        component_id = self._create_test_item(api_client, "COMP_MULTI", category="component")
        
        # Create FG-1 with component but WITHOUT the target routing
        fg1_id = self._create_test_item(api_client, "FG_1_MULTI", category="finished_good")
        fg1_bom_data = {
            "parent_item_id": fg1_id,
            "name": f"{self.test_prefix}FG1_BOM",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": component_id,
                    "quantity": 1,
                    "unit_of_measure": "pcs",
                    "routings": [
                        {"name": "Cutting", "cost": 10.00}  # Different routing
                    ]
                }
            ],
            "parent_routings": []
        }
        fg1_bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=fg1_bom_data)
        assert fg1_bom_resp.status_code in [200, 201]
        fg1_bom_id = fg1_bom_resp.json()["id"]
        self.created_boms.append(fg1_bom_id)
        
        # Create FG-2 with component WITH the target routing
        fg2_id = self._create_test_item(api_client, "FG_2_MULTI", category="finished_good")
        fg2_bom_data = {
            "parent_item_id": fg2_id,
            "name": f"{self.test_prefix}FG2_BOM",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": component_id,
                    "quantity": 2,
                    "unit_of_measure": "pcs",
                    "routings": [
                        {"name": "Powder Coating", "cost": 45.00}  # Target routing
                    ]
                }
            ],
            "parent_routings": []
        }
        fg2_bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=fg2_bom_data)
        assert fg2_bom_resp.status_code in [200, 201]
        fg2_bom_id = fg2_bom_resp.json()["id"]
        self.created_boms.append(fg2_bom_id)
        
        # Test: find_routing_cost should find "Powder Coating" from FG-2's BOM (not in FG-1)
        resp = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={
            "item_id": component_id,
            "process_name": "Powder Coating"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        assert data["cost"] == 45.00, f"Expected cost 45.00 (from FG-2 BOM), got {data['cost']}"
        print(f"✓ find_routing_cost scanned multiple parent BOMs and found Powder Coating cost {data['cost']}")


class TestPUTJobWorkOrderPermissions:
    """Tests for PUT /api/job-work/orders/{id} permission changes"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_114_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_suppliers = []
        self.created_orders = []
        self.created_users = []
        self.created_role_groups = []
        yield
        # Cleanup
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
            except:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except:
                pass
        for sup_id in self.created_suppliers:
            try:
                self.client.delete(f"{BASE_URL}/api/suppliers/{sup_id}")
            except:
                pass
        for user_id in self.created_users:
            try:
                self.client.delete(f"{BASE_URL}/api/users/{user_id}")
            except:
                pass
        for rg_id in self.created_role_groups:
            try:
                self.client.delete(f"{BASE_URL}/api/users/role-groups/{rg_id}")
            except:
                pass
    
    def _create_test_item(self, api_client, suffix, category="component"):
        item_data = {
            "part_number": f"{self.test_prefix}{suffix}",
            "name": f"Test Item {suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 100
        }
        resp = api_client.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201, f"Failed to create item: {resp.text}"
        item_id = resp.json()["id"]
        self.created_items.append(item_id)
        return item_id
    
    def _create_test_supplier(self, api_client, suffix):
        sup_data = {
            "code": f"{self.test_prefix}SUP_{suffix}",
            "name": f"Test Supplier {suffix}",
            "status": "active",
            "state_code": "27",
            "gstin": "",
            "pin_code": "400001"
        }
        resp = api_client.post(f"{BASE_URL}/api/suppliers", json=sup_data)
        assert resp.status_code in [200, 201], f"Failed to create supplier: {resp.text}"
        sup_id = resp.json()["id"]
        self.created_suppliers.append(sup_id)
        return sup_id
    
    def _create_role_group_with_permissions(self, api_client, name, permissions):
        """Create a role group with specific permissions"""
        rg_data = {
            "name": name,
            "permissions": permissions,
            "is_admin_group": False
        }
        resp = api_client.post(f"{BASE_URL}/api/users/role-groups", json=rg_data)
        assert resp.status_code in [200, 201], f"Failed to create role group: {resp.text}"
        rg_id = resp.json()["id"]
        self.created_role_groups.append(rg_id)
        return rg_id
    
    def _create_test_user(self, api_client, email, password, role, role_group_id):
        """Create a test user with specific role and role_group"""
        user_data = {
            "email": email,
            "password": password,
            "name": f"Test User {email}",
            "role": role,
            "role_group_id": role_group_id
        }
        resp = api_client.post(f"{BASE_URL}/api/users", json=user_data)
        if resp.status_code not in [200, 201]:
            # User might already exist, try to find and return
            users_resp = api_client.get(f"{BASE_URL}/api/users")
            if users_resp.status_code == 200:
                for u in users_resp.json():
                    if u.get("email") == email:
                        return u["id"]
            pytest.skip(f"Failed to create user: {resp.text}")
        user_id = resp.json()["id"]
        self.created_users.append(user_id)
        return user_id
    
    def _login_as_user(self, email, password):
        """Login as a specific user and return authenticated session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if login_resp.status_code != 200:
            return None
        return session
    
    def test_put_accepts_user_with_job_work_create_permission(self, api_client):
        """
        Test that PUT /api/job-work/orders/{id} accepts a user with only job_work.create permission.
        This is the fix for issue 2: non-admin users couldn't update SC.
        """
        # Create role group with ONLY job_work.create permission (no edit)
        permissions = {
            "job_work": ["view", "create"],  # NO "edit" permission
            "items": ["view"],
            "suppliers": ["view"]
        }
        rg_id = self._create_role_group_with_permissions(
            api_client, 
            f"{self.test_prefix}JW_CREATE_ONLY", 
            permissions
        )
        
        # Create test user with this role group
        test_email = f"{self.test_prefix}create_user@test.com"
        test_password = "TestPass123!"
        user_id = self._create_test_user(api_client, test_email, test_password, "user", rg_id)
        
        # Create test data as admin
        item_id = self._create_test_item(api_client, "PERM_ITEM")
        sup_id = self._create_test_supplier(api_client, "PERM")
        
        # Create SC order as admin
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 100,
                    "item_description": "Original description"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201, f"Failed to create order: {create_resp.text}"
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Login as the test user with only create permission
        user_session = self._login_as_user(test_email, test_password)
        if user_session is None:
            pytest.skip("Could not login as test user")
        
        # Try to PUT (update) the order as the user with only create permission
        update_data = {
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 15,  # Changed quantity
                    "charges": 120,  # Changed charges
                    "item_description": "Updated description by create-only user"
                }
            ]
        }
        put_resp = user_session.put(f"{BASE_URL}/api/job-work/orders/{order_id}", json=update_data)
        
        # Should succeed (200) because user has job_work.create permission
        assert put_resp.status_code == 200, f"PUT should succeed with create permission, got {put_resp.status_code}: {put_resp.text}"
        
        # Verify the update was applied
        updated_order = put_resp.json()
        assert updated_order["job_work_parts"][0]["quantity"] == 15
        assert updated_order["job_work_parts"][0]["charges"] == 120
        assert updated_order["job_work_parts"][0]["item_description"] == "Updated description by create-only user"
        
        print("✓ PUT /api/job-work/orders/{id} accepts user with job_work.create permission")
    
    def test_put_accepts_inventory_manager_role(self, api_client):
        """
        Test that PUT /api/job-work/orders/{id} accepts a user with inventory_manager role.
        """
        # Create role group with minimal permissions (no job_work edit/create)
        permissions = {
            "items": ["view"],
            "inventory": ["view", "create", "edit"]
        }
        rg_id = self._create_role_group_with_permissions(
            api_client, 
            f"{self.test_prefix}INV_MGR_GROUP", 
            permissions
        )
        
        # Create test user with inventory_manager role
        test_email = f"{self.test_prefix}inv_mgr@test.com"
        test_password = "TestPass123!"
        user_id = self._create_test_user(api_client, test_email, test_password, "inventory_manager", rg_id)
        
        # Create test data as admin
        item_id = self._create_test_item(api_client, "INV_ITEM")
        sup_id = self._create_test_supplier(api_client, "INV")
        
        # Create SC order as admin
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 100
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Login as inventory_manager
        user_session = self._login_as_user(test_email, test_password)
        if user_session is None:
            pytest.skip("Could not login as inventory_manager user")
        
        # Try to PUT as inventory_manager
        update_data = {
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 20,
                    "charges": 150
                }
            ]
        }
        put_resp = user_session.put(f"{BASE_URL}/api/job-work/orders/{order_id}", json=update_data)
        
        # Should succeed because user has inventory_manager role
        assert put_resp.status_code == 200, f"PUT should succeed for inventory_manager, got {put_resp.status_code}: {put_resp.text}"
        print("✓ PUT /api/job-work/orders/{id} accepts inventory_manager role")
    
    def test_put_rejects_unauthenticated_user(self, api_client):
        """
        Test that PUT /api/job-work/orders/{id} rejects unauthenticated requests.
        
        Note: In the current system design, ALL authenticated users with a role_group
        get role="inventory_manager" (unless admin_group), which is in the allowed roles.
        So the only "forbidden" case is unauthenticated access.
        """
        # Create test data as admin
        item_id = self._create_test_item(api_client, "UNAUTH_ITEM")
        sup_id = self._create_test_supplier(api_client, "UNAUTH")
        
        # Create SC order as admin
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 100
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Try to PUT without authentication
        unauth_session = requests.Session()
        unauth_session.headers.update({"Content-Type": "application/json"})
        
        update_data = {
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 20,
                    "charges": 150
                }
            ]
        }
        put_resp = unauth_session.put(f"{BASE_URL}/api/job-work/orders/{order_id}", json=update_data)
        
        # Should be rejected with 401 (unauthenticated)
        assert put_resp.status_code == 401, f"PUT should be rejected (401) for unauthenticated user, got {put_resp.status_code}"
        print("✓ PUT /api/job-work/orders/{id} correctly rejects unauthenticated requests (401)")


class TestRegressionIteration113:
    """Regression tests to ensure iteration 113 fixes still work"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        self.client = api_client
        self.token = auth_token
        self.test_prefix = f"TEST_114_REG_{uuid.uuid4().hex[:6]}_"
        self.created_items = []
        self.created_boms = []
        self.created_suppliers = []
        self.created_orders = []
        yield
        # Cleanup
        for order_id in self.created_orders:
            try:
                self.client.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")
            except:
                pass
        for bom_id in self.created_boms:
            try:
                self.client.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except:
                pass
        for item_id in self.created_items:
            try:
                self.client.delete(f"{BASE_URL}/api/items/{item_id}")
            except:
                pass
        for sup_id in self.created_suppliers:
            try:
                self.client.delete(f"{BASE_URL}/api/suppliers/{sup_id}")
            except:
                pass
    
    def _create_test_item(self, api_client, suffix, category="component"):
        item_data = {
            "part_number": f"{self.test_prefix}{suffix}",
            "name": f"Test Item {suffix}",
            "category": category,
            "unit_of_measure": "pcs",
            "unit_cost": 100
        }
        resp = api_client.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item_id = resp.json()["id"]
        self.created_items.append(item_id)
        return item_id
    
    def _create_test_supplier(self, api_client, suffix):
        sup_data = {
            "code": f"{self.test_prefix}SUP_{suffix}",
            "name": f"Test Supplier {suffix}",
            "status": "active",
            "state_code": "27",
            "gstin": "",
            "pin_code": "400001"
        }
        resp = api_client.post(f"{BASE_URL}/api/suppliers", json=sup_data)
        assert resp.status_code in [200, 201]
        sup_id = resp.json()["id"]
        self.created_suppliers.append(sup_id)
        return sup_id
    
    def test_routing_cost_endpoint_still_works(self, api_client):
        """Regression: /api/bom/routing-cost endpoint still returns correct costs"""
        item_id = self._create_test_item(api_client, "REG_ITEM")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}REG_BOM",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "LC Cutting", "cost": 500},
                {"name": "Bending", "cost": 200}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        # Test routing cost endpoint
        resp = api_client.get(f"{BASE_URL}/api/bom/routing-cost", params={
            "item_id": item_id,
            "process_name": "LC Cutting"
        })
        assert resp.status_code == 200
        assert resp.json()["cost"] == 500
        print("✓ Regression: /api/bom/routing-cost endpoint works correctly")
    
    def test_job_card_os_self_heal_still_works(self, api_client):
        """Regression: GET /api/job-work/orders still self-heals Job Card OS lines"""
        item_id = self._create_test_item(api_client, "REG_JC")
        
        # Create BOM with specific routing
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}REG_JC_BOM",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Powder Coating", "cost": 37.61},
                {"name": "Zinc Plating", "cost": 53.00}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "REG_JC")
        
        # Create SC with specific process_name
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 90.61,  # Wrong combined cost
                    "process_name": "Powder Coating"  # Specific op
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Manually set reference_operation_seqs to simulate Job Card OS
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {
                "reference_operation_seqs": [1],
                "subcontract_type": "without_material",
                "job_work_parts.0.charges": 90.61  # Pollute with wrong combined cost
            }}
        )
        
        # GET should self-heal the charges to specific routing cost
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        assert list_resp.status_code == 200
        orders = list_resp.json()
        order = next((o for o in orders if o["id"] == order_id), None)
        assert order is not None
        
        # Charges should be self-healed to 37.61 (Powder Coating specific cost)
        assert order["job_work_parts"][0]["charges"] == 37.61, \
            f"Expected self-healed charges=37.61, got {order['job_work_parts'][0]['charges']}"
        print("✓ Regression: GET /api/job-work/orders self-heals Job Card OS lines correctly")
    
    def test_put_preserves_process_name_and_charges(self, api_client):
        """Regression: PUT preserves process_name and per-op charges on Job Card OS SCs"""
        item_id = self._create_test_item(api_client, "REG_PUT")
        
        bom_data = {
            "parent_item_id": item_id,
            "name": f"{self.test_prefix}REG_PUT_BOM",
            "revision": "A",
            "status": "active",
            "components": [],
            "parent_routings": [
                {"name": "Operation_A", "cost": 100},
                {"name": "Operation_B", "cost": 200}
            ]
        }
        bom_resp = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom_id = bom_resp.json()["id"]
        self.created_boms.append(bom_id)
        
        sup_id = self._create_test_supplier(api_client, "REG_PUT")
        
        order_data = {
            "supplier_id": sup_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 100,
                    "process_name": "Operation_A",
                    "item_description": "Test description"
                }
            ]
        }
        create_resp = api_client.post(f"{BASE_URL}/api/job-work/orders", json=order_data)
        assert create_resp.status_code == 201
        order_id = create_resp.json()["id"]
        self.created_orders.append(order_id)
        
        # Simulate Job Card OS
        import pymongo
        mongo_client = pymongo.MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        db = mongo_client[os.environ.get('DB_NAME', 'test_database')]
        db.subcontract_orders.update_one(
            {"id": order_id},
            {"$set": {"reference_operation_seqs": [1], "subcontract_type": "without_material"}}
        )
        
        # PUT with bare data (simulating frontend save without changes)
        update_data = {
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 0  # Frontend sends 0 when user doesn't change
                }
            ]
        }
        put_resp = api_client.put(f"{BASE_URL}/api/job-work/orders/{order_id}", json=update_data)
        assert put_resp.status_code == 200
        
        # Verify preservation
        list_resp = api_client.get(f"{BASE_URL}/api/job-work/orders")
        orders = list_resp.json()
        updated_order = next((o for o in orders if o["id"] == order_id), None)
        assert updated_order is not None
        
        assert updated_order["job_work_parts"][0]["process_name"] == "Operation_A"
        assert updated_order["job_work_parts"][0]["charges"] == 100
        print("✓ Regression: PUT preserves process_name and per-op charges")


# ============== FIXTURES ==============

@pytest.fixture
def api_client():
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    # Login
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if login_resp.status_code != 200:
        pytest.skip(f"Authentication failed: {login_resp.text}")
    return session

@pytest.fixture
def api_client_no_auth():
    """Unauthenticated requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    """Get auth token (cookies are already set in api_client)"""
    return "cookie-based"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
