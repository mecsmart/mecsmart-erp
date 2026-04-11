"""
Test User Management - Phase 1: Admin CRUD users + Module-wise access permissions
Tests:
- GET /api/users - Admin can list all users with permissions
- POST /api/users - Admin can create new user with role and default permissions
- PUT /api/users/{id} - Admin can update user name, role, password, permissions
- DELETE /api/users/{id} - Admin can delete user (not self)
- GET /api/users/modules - Returns all modules, actions, and default permission presets
- Non-admin users should get 403 on /api/users endpoints
- Login response includes permissions field
- GET /api/auth/me includes permissions field
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@erp.com"
ADMIN_PASSWORD = "Admin@123"
QUALITY_EMAIL = "quality@erp.com"
QUALITY_PASSWORD = "Quality@123"


class TestUserManagementAuth:
    """Test authentication and permissions field in responses"""
    
    def test_admin_login_includes_permissions(self):
        """Login response should include permissions field"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        
        # Verify permissions field exists
        assert "permissions" in data, "Login response missing 'permissions' field"
        assert isinstance(data["permissions"], dict), "Permissions should be a dict"
        
        # Admin should have all modules with all actions
        assert "dashboard" in data["permissions"], "Admin missing dashboard permission"
        assert "view" in data["permissions"]["dashboard"], "Admin missing view action on dashboard"
        print(f"✓ Admin login includes permissions: {len(data['permissions'])} modules")
    
    def test_auth_me_includes_permissions(self):
        """GET /api/auth/me should include permissions field"""
        session = requests.Session()
        # Login first
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        
        # Get current user
        response = session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Auth me failed: {response.text}"
        data = response.json()
        
        assert "permissions" in data, "/api/auth/me missing 'permissions' field"
        assert isinstance(data["permissions"], dict)
        print(f"✓ GET /api/auth/me includes permissions: {len(data['permissions'])} modules")
    
    def test_quality_inspector_login_includes_permissions(self):
        """Quality inspector login should include restricted permissions"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": QUALITY_EMAIL,
            "password": QUALITY_PASSWORD
        })
        assert response.status_code == 200, f"Quality login failed: {response.text}"
        data = response.json()
        
        assert "permissions" in data, "Login response missing 'permissions' field"
        
        # Quality inspector should have restricted permissions
        # No access to MRP, Suppliers, Customers, Purchase Orders
        mrp_perms = data["permissions"].get("mrp", [])
        assert mrp_perms == [] or "view" not in mrp_perms, "Quality inspector should not have MRP view"
        
        suppliers_perms = data["permissions"].get("suppliers", [])
        assert suppliers_perms == [] or "view" not in suppliers_perms, "Quality inspector should not have suppliers view"
        
        print(f"✓ Quality inspector has restricted permissions")


class TestUsersEndpointAdminAccess:
    """Test admin access to /api/users endpoints"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return session
    
    def test_get_users_list(self, admin_session):
        """GET /api/users - Admin can list all users"""
        response = admin_session.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200, f"Get users failed: {response.text}"
        
        users = response.json()
        assert isinstance(users, list), "Users response should be a list"
        assert len(users) >= 1, "Should have at least 1 user (admin)"
        
        # Check user structure
        for user in users:
            assert "id" in user, "User missing 'id'"
            assert "email" in user, "User missing 'email'"
            assert "name" in user, "User missing 'name'"
            assert "role" in user, "User missing 'role'"
            assert "permissions" in user, "User missing 'permissions'"
            assert "password_hash" not in user, "User should not expose password_hash"
        
        print(f"✓ GET /api/users returns {len(users)} users with permissions")
    
    def test_get_modules_list(self, admin_session):
        """GET /api/users/modules - Returns all modules, actions, and default permissions"""
        response = admin_session.get(f"{BASE_URL}/api/users/modules")
        assert response.status_code == 200, f"Get modules failed: {response.text}"
        
        data = response.json()
        assert "modules" in data, "Response missing 'modules'"
        assert "actions" in data, "Response missing 'actions'"
        assert "default_permissions" in data, "Response missing 'default_permissions'"
        
        # Verify 13 modules
        modules = data["modules"]
        assert len(modules) == 13, f"Expected 13 modules, got {len(modules)}"
        expected_modules = ["dashboard", "items", "bom", "mrp", "production", "manufacturing",
                          "quality", "inventory", "suppliers", "customers", "purchase_orders", "stores", "settings"]
        for m in expected_modules:
            assert m in modules, f"Missing module: {m}"
        
        # Verify 4 actions
        actions = data["actions"]
        assert actions == ["view", "create", "edit", "delete"], f"Unexpected actions: {actions}"
        
        # Verify default permissions for roles
        default_perms = data["default_permissions"]
        assert "admin" in default_perms, "Missing admin default permissions"
        assert "quality_inspector" in default_perms, "Missing quality_inspector default permissions"
        assert "production_manager" in default_perms, "Missing production_manager default permissions"
        assert "inventory_manager" in default_perms, "Missing inventory_manager default permissions"
        
        print(f"✓ GET /api/users/modules returns {len(modules)} modules, {len(actions)} actions, {len(default_perms)} role presets")
    
    def test_create_user(self, admin_session):
        """POST /api/users - Admin can create new user with role and default permissions"""
        test_user = {
            "email": "TEST_newuser@erp.com",
            "password": "TestPass@123",
            "name": "Test New User",
            "role": "inventory_manager"
        }
        
        response = admin_session.post(f"{BASE_URL}/api/users", json=test_user)
        assert response.status_code == 201, f"Create user failed: {response.text}"
        
        data = response.json()
        assert data["email"] == test_user["email"].lower()
        assert data["name"] == test_user["name"]
        assert data["role"] == test_user["role"]
        assert "id" in data
        assert "permissions" in data
        assert "password_hash" not in data
        
        # Verify default permissions were applied
        perms = data["permissions"]
        assert "inventory" in perms, "Inventory manager should have inventory permissions"
        assert "view" in perms["inventory"], "Inventory manager should have view on inventory"
        
        print(f"✓ POST /api/users created user with id: {data['id']}")
        
        # Cleanup - delete test user
        admin_session.delete(f"{BASE_URL}/api/users/{data['id']}")
    
    def test_update_user(self, admin_session):
        """PUT /api/users/{id} - Admin can update user name, role, password, permissions"""
        # First create a test user
        test_user = {
            "email": "TEST_updateuser@erp.com",
            "password": "TestPass@123",
            "name": "Test Update User",
            "role": "inventory_manager"
        }
        create_resp = admin_session.post(f"{BASE_URL}/api/users", json=test_user)
        assert create_resp.status_code == 201
        user_id = create_resp.json()["id"]
        
        # Update user
        update_data = {
            "name": "Updated Name",
            "role": "production_manager",
            "permissions": {
                "dashboard": ["view"],
                "items": ["view", "create"]
            }
        }
        response = admin_session.put(f"{BASE_URL}/api/users/{user_id}", json=update_data)
        assert response.status_code == 200, f"Update user failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["role"] == "production_manager"
        assert data["permissions"]["dashboard"] == ["view"]
        assert data["permissions"]["items"] == ["view", "create"]
        
        print(f"✓ PUT /api/users/{user_id} updated user successfully")
        
        # Verify with GET
        get_resp = admin_session.get(f"{BASE_URL}/api/users")
        users = get_resp.json()
        updated_user = next((u for u in users if u["id"] == user_id), None)
        assert updated_user is not None
        assert updated_user["name"] == "Updated Name"
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/users/{user_id}")
    
    def test_update_user_password(self, admin_session):
        """PUT /api/users/{id} - Admin can update user password"""
        # Create test user
        test_user = {
            "email": "TEST_pwduser@erp.com",
            "password": "OldPass@123",
            "name": "Test Password User",
            "role": "inventory_manager"
        }
        create_resp = admin_session.post(f"{BASE_URL}/api/users", json=test_user)
        assert create_resp.status_code == 201
        user_id = create_resp.json()["id"]
        
        # Update password
        update_data = {"password": "NewPass@456"}
        response = admin_session.put(f"{BASE_URL}/api/users/{user_id}", json=update_data)
        assert response.status_code == 200
        
        # Verify new password works
        new_session = requests.Session()
        login_resp = new_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": test_user["email"],
            "password": "NewPass@456"
        })
        assert login_resp.status_code == 200, "Login with new password failed"
        
        print(f"✓ Password update verified - user can login with new password")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/users/{user_id}")
    
    def test_delete_user(self, admin_session):
        """DELETE /api/users/{id} - Admin can delete user"""
        # Create test user
        test_user = {
            "email": "TEST_deleteuser@erp.com",
            "password": "TestPass@123",
            "name": "Test Delete User",
            "role": "inventory_manager"
        }
        create_resp = admin_session.post(f"{BASE_URL}/api/users", json=test_user)
        assert create_resp.status_code == 201
        user_id = create_resp.json()["id"]
        
        # Delete user
        response = admin_session.delete(f"{BASE_URL}/api/users/{user_id}")
        assert response.status_code == 200, f"Delete user failed: {response.text}"
        
        # Verify user is deleted
        get_resp = admin_session.get(f"{BASE_URL}/api/users")
        users = get_resp.json()
        deleted_user = next((u for u in users if u["id"] == user_id), None)
        assert deleted_user is None, "User should be deleted"
        
        print(f"✓ DELETE /api/users/{user_id} deleted user successfully")
    
    def test_admin_cannot_delete_self(self, admin_session):
        """DELETE /api/users/{id} - Admin cannot delete their own account"""
        # Get admin user id
        me_resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        admin_id = me_resp.json()["id"]
        
        # Try to delete self
        response = admin_session.delete(f"{BASE_URL}/api/users/{admin_id}")
        assert response.status_code == 400, f"Should not be able to delete self: {response.text}"
        assert "Cannot delete your own account" in response.json().get("detail", "")
        
        print(f"✓ Admin cannot delete their own account (400 returned)")


class TestNonAdminAccessDenied:
    """Test that non-admin users get 403 on /api/users endpoints"""
    
    @pytest.fixture
    def quality_session(self):
        """Get authenticated quality inspector session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": QUALITY_EMAIL,
            "password": QUALITY_PASSWORD
        })
        assert response.status_code == 200, f"Quality login failed: {response.text}"
        return session
    
    def test_quality_cannot_get_users(self, quality_session):
        """Quality inspector should get 403 on GET /api/users"""
        response = quality_session.get(f"{BASE_URL}/api/users")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print(f"✓ Quality inspector gets 403 on GET /api/users")
    
    def test_quality_cannot_create_user(self, quality_session):
        """Quality inspector should get 403 on POST /api/users"""
        response = quality_session.post(f"{BASE_URL}/api/users", json={
            "email": "test@test.com",
            "password": "Test@123",
            "name": "Test",
            "role": "inventory_manager"
        })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print(f"✓ Quality inspector gets 403 on POST /api/users")
    
    def test_quality_cannot_update_user(self, quality_session):
        """Quality inspector should get 403 on PUT /api/users/{id}"""
        response = quality_session.put(f"{BASE_URL}/api/users/some-id", json={
            "name": "New Name"
        })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print(f"✓ Quality inspector gets 403 on PUT /api/users/{'{id}'}")
    
    def test_quality_cannot_delete_user(self, quality_session):
        """Quality inspector should get 403 on DELETE /api/users/{id}"""
        response = quality_session.delete(f"{BASE_URL}/api/users/some-id")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print(f"✓ Quality inspector gets 403 on DELETE /api/users/{'{id}'}")
    
    def test_quality_can_get_modules(self, quality_session):
        """Quality inspector CAN access GET /api/users/modules (for UI)"""
        response = quality_session.get(f"{BASE_URL}/api/users/modules")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Quality inspector can access GET /api/users/modules")


class TestQualityInspectorPermissions:
    """Test quality inspector has correct restricted permissions"""
    
    def test_quality_inspector_permissions_structure(self):
        """Verify quality inspector default permissions"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": QUALITY_EMAIL,
            "password": QUALITY_PASSWORD
        })
        assert response.status_code == 200
        perms = response.json()["permissions"]
        
        # Should have view on: dashboard, items, bom, production, manufacturing, quality, inventory, stores, settings
        view_modules = ["dashboard", "items", "bom", "production", "manufacturing", "inventory", "stores", "settings"]
        for m in view_modules:
            assert m in perms, f"Quality inspector missing {m} permissions"
            assert "view" in perms[m], f"Quality inspector missing view on {m}"
        
        # Should have view+create+edit on quality
        assert "quality" in perms
        assert "view" in perms["quality"]
        assert "create" in perms["quality"]
        assert "edit" in perms["quality"]
        
        # Should NOT have access to: mrp, suppliers, customers, purchase_orders
        no_access_modules = ["mrp", "suppliers", "customers", "purchase_orders"]
        for m in no_access_modules:
            module_perms = perms.get(m, [])
            assert module_perms == [] or "view" not in module_perms, f"Quality inspector should not have {m} access"
        
        print(f"✓ Quality inspector permissions verified correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
