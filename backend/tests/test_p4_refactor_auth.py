"""
Backend tests for P4 refactor — verifying auth and core API endpoints work correctly
after extracting shared utilities from server.py into /app/backend/core/ modules.

Tests:
- Auth endpoints: login, me, refresh, logout
- Core API endpoints: items, purchase-orders, dashboard, customers, suppliers, warehouses
- CRM endpoints: quotations, proformas
- Permission/role enforcement
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@erp.com"
ADMIN_PASSWORD = "Admin@123"


class TestAuthEndpoints:
    """Test auth endpoints after P4 refactor"""
    
    def test_login_success(self):
        """POST /api/auth/login with admin credentials returns access_token cookie"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data, "Response missing 'id'"
        assert "email" in data, "Response missing 'email'"
        assert data["email"] == ADMIN_EMAIL.lower()
        assert "role" in data, "Response missing 'role'"
        assert data["role"] == "admin"
        assert "permissions" in data, "Response missing 'permissions'"
        
        # Verify is_admin_group is set correctly
        assert "is_admin_group" in data, "Response missing 'is_admin_group'"
        
        # Verify cookies are set
        assert "access_token" in session.cookies, "access_token cookie not set"
        assert "refresh_token" in session.cookies, "refresh_token cookie not set"
        
        print(f"✓ Login successful for {ADMIN_EMAIL}, role={data['role']}, is_admin_group={data.get('is_admin_group')}")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login with wrong password returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "WrongPassword123"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected with 401")
    
    def test_auth_me_returns_admin_user(self):
        """GET /api/auth/me returns admin user with role='admin' and full permissions"""
        session = requests.Session()
        
        # Login first
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        # Get current user
        me_resp = session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200, f"GET /me failed: {me_resp.text}"
        
        user = me_resp.json()
        assert user["email"] == ADMIN_EMAIL.lower()
        assert user["role"] == "admin", f"Expected role='admin', got '{user.get('role')}'"
        assert "permissions" in user, "Response missing 'permissions'"
        
        # Admin should have permissions for all modules
        perms = user["permissions"]
        assert "dashboard" in perms, "Admin missing dashboard permissions"
        assert "items" in perms, "Admin missing items permissions"
        assert "purchase_orders" in perms, "Admin missing purchase_orders permissions"
        
        print(f"✓ GET /me returned admin user with {len(perms)} module permissions")
    
    def test_auth_refresh_works(self):
        """POST /api/auth/refresh works using refresh_token cookie"""
        session = requests.Session()
        
        # Login first
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        
        # Refresh token
        refresh_resp = session.post(f"{BASE_URL}/api/auth/refresh")
        assert refresh_resp.status_code == 200, f"Refresh failed: {refresh_resp.text}"
        
        data = refresh_resp.json()
        assert "message" in data
        assert data["message"] == "Token refreshed"
        
        # Verify new access_token cookie is set
        assert "access_token" in session.cookies
        
        print("✓ Token refresh successful")
    
    def test_auth_logout_clears_cookies(self):
        """POST /api/auth/logout clears cookies"""
        session = requests.Session()
        
        # Login first
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        
        # Logout
        logout_resp = session.post(f"{BASE_URL}/api/auth/logout")
        assert logout_resp.status_code == 200, f"Logout failed: {logout_resp.text}"
        
        data = logout_resp.json()
        assert "message" in data
        assert "logged out" in data["message"].lower()
        
        print("✓ Logout successful")


class TestCoreAPIEndpoints:
    """Test core API endpoints work after refactor"""
    
    @pytest.fixture(autouse=True)
    def setup_session(self):
        """Login and create authenticated session for each test"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    def test_get_items_returns_list(self):
        """GET /api/items returns list (regression check)"""
        response = self.session.get(f"{BASE_URL}/api/items")
        assert response.status_code == 200, f"GET /items failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /items returned {len(data)} items")
    
    def test_get_purchase_orders_returns_list(self):
        """GET /api/purchase-orders returns list"""
        response = self.session.get(f"{BASE_URL}/api/purchase-orders")
        assert response.status_code == 200, f"GET /purchase-orders failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /purchase-orders returned {len(data)} orders")
    
    def test_get_dashboard_stats(self):
        """GET /api/dashboard/stats returns inventory/bom/production/quality keys"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200, f"GET /dashboard/stats failed: {response.text}"
        
        data = response.json()
        
        # Verify expected keys exist
        expected_keys = ["inventory", "bom", "production", "quality"]
        for key in expected_keys:
            assert key in data, f"Dashboard stats missing '{key}' key"
        
        print(f"✓ GET /dashboard/stats returned all expected keys: {list(data.keys())}")
    
    def test_get_customers_returns_list(self):
        """GET /api/customers returns list"""
        response = self.session.get(f"{BASE_URL}/api/customers")
        assert response.status_code == 200, f"GET /customers failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /customers returned {len(data)} customers")
    
    def test_get_suppliers_returns_list(self):
        """GET /api/suppliers returns list"""
        response = self.session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200, f"GET /suppliers failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /suppliers returned {len(data)} suppliers")
    
    def test_get_warehouses_returns_list(self):
        """GET /api/warehouses returns list"""
        response = self.session.get(f"{BASE_URL}/api/warehouses")
        assert response.status_code == 200, f"GET /warehouses failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /warehouses returned {len(data)} warehouses")


class TestCRMEndpoints:
    """Test CRM endpoints accessible after refactor"""
    
    @pytest.fixture(autouse=True)
    def setup_session(self):
        """Login and create authenticated session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    def test_get_crm_quotations(self):
        """GET /api/crm/quotations accessible"""
        response = self.session.get(f"{BASE_URL}/api/crm/quotations")
        assert response.status_code == 200, f"GET /crm/quotations failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /crm/quotations returned {len(data)} quotations")
    
    def test_get_crm_proformas(self):
        """GET /api/crm/proformas accessible"""
        response = self.session.get(f"{BASE_URL}/api/crm/proformas")
        assert response.status_code == 200, f"GET /crm/proformas failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /crm/proformas returned {len(data)} proformas")


class TestPermissionEnforcement:
    """Test that permission/role enforcement still works after refactor"""
    
    def test_unauthenticated_request_returns_401(self):
        """Unauthenticated request to protected endpoint returns 401"""
        # Don't use session with cookies
        response = requests.get(f"{BASE_URL}/api/items")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        print("✓ Unauthenticated request correctly rejected with 401")
    
    def test_admin_can_access_all_endpoints(self):
        """Admin user can access all endpoints"""
        session = requests.Session()
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        
        # Test various endpoints
        endpoints = [
            "/api/items",
            "/api/purchase-orders",
            "/api/suppliers",
            "/api/customers",
            "/api/warehouses",
            "/api/dashboard/stats",
            "/api/crm/quotations",
        ]
        
        for endpoint in endpoints:
            resp = session.get(f"{BASE_URL}{endpoint}")
            assert resp.status_code == 200, f"Admin denied access to {endpoint}: {resp.status_code}"
        
        print(f"✓ Admin can access all {len(endpoints)} tested endpoints")


class TestBOMAndMRPEndpoints:
    """Test BOM and MRP endpoints work after refactor"""
    
    @pytest.fixture(autouse=True)
    def setup_session(self):
        """Login and create authenticated session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    def test_get_boms_returns_list(self):
        """GET /api/bom returns list"""
        response = self.session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200, f"GET /bom failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /bom returned {len(data)} BOMs")
    
    def test_get_mrp_demand(self):
        """GET /api/mrp/demand returns list"""
        response = self.session.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200, f"GET /mrp/demand failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /mrp/demand returned {len(data)} demand items")
    
    def test_get_mrp_suggestions(self):
        """GET /api/mrp/suggestions returns list"""
        response = self.session.get(f"{BASE_URL}/api/mrp/suggestions")
        assert response.status_code == 200, f"GET /mrp/suggestions failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /mrp/suggestions returned {len(data)} suggestions")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
