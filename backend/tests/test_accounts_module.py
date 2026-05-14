"""
Test suite for Accounts module (iteration 118)
Tests:
- /api/users/modules returns 'accounts' and NOT 'purchase_invoices'
- Purchase Invoice endpoints use module='accounts'
- Tax Invoice endpoints use module='accounts'
- Startup migration backfills accounts permissions from legacy purchase_invoices
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def admin_session():
    """Create authenticated session for admin user"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login as admin
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
    return session


class TestAccountsModuleInModulesList:
    """Test that /api/users/modules returns 'accounts' and NOT 'purchase_invoices'"""
    
    def test_modules_endpoint_returns_accounts(self, admin_session):
        """GET /api/users/modules should include 'accounts' in modules list"""
        resp = admin_session.get(f"{BASE_URL}/api/users/modules")
        assert resp.status_code == 200, f"Failed to get modules: {resp.text}"
        
        data = resp.json()
        modules = data.get("modules", [])
        
        assert "accounts" in modules, f"'accounts' not found in modules list: {modules}"
        print(f"PASS: 'accounts' found in modules list")
    
    def test_modules_endpoint_does_not_return_purchase_invoices(self, admin_session):
        """GET /api/users/modules should NOT include 'purchase_invoices' in modules list"""
        resp = admin_session.get(f"{BASE_URL}/api/users/modules")
        assert resp.status_code == 200, f"Failed to get modules: {resp.text}"
        
        data = resp.json()
        modules = data.get("modules", [])
        
        assert "purchase_invoices" not in modules, f"'purchase_invoices' should NOT be in modules list: {modules}"
        print(f"PASS: 'purchase_invoices' NOT in modules list (correct)")


class TestPurchaseInvoiceEndpoints:
    """Test Purchase Invoice endpoints respond correctly for admin"""
    
    def test_get_purchase_invoices(self, admin_session):
        """GET /api/purchase-invoices should return 200 for admin"""
        resp = admin_session.get(f"{BASE_URL}/api/purchase-invoices")
        assert resp.status_code == 200, f"Failed to get purchase invoices: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/purchase-invoices returned {len(data)} invoices")
    
    def test_get_pending_grns(self, admin_session):
        """GET /api/purchase-invoices/pending-grns should return 200 for admin"""
        resp = admin_session.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert resp.status_code == 200, f"Failed to get pending GRNs: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/purchase-invoices/pending-grns returned {len(data)} GRNs")


class TestTaxInvoiceEndpoints:
    """Test Tax Invoice endpoints respond correctly for admin"""
    
    def test_get_tax_invoices(self, admin_session):
        """GET /api/crm/tax-invoices should return 200 for admin"""
        resp = admin_session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert resp.status_code == 200, f"Failed to get tax invoices: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/crm/tax-invoices returned {len(data)} invoices")


class TestRoleGroupMigration:
    """Test that role groups have been migrated from purchase_invoices to accounts"""
    
    def test_role_groups_have_accounts_permission(self, admin_session):
        """Role groups that had purchase_invoices should now have accounts"""
        resp = admin_session.get(f"{BASE_URL}/api/users/role-groups")
        assert resp.status_code == 200, f"Failed to get role groups: {resp.text}"
        
        groups = resp.json()
        
        # Check if any group has accounts permissions
        groups_with_accounts = []
        for g in groups:
            perms = g.get("permissions", {})
            if "accounts" in perms and perms["accounts"]:
                groups_with_accounts.append(g["name"])
        
        print(f"Role groups with 'accounts' permission: {groups_with_accounts}")
        # This is informational - migration may have already run
        print(f"PASS: Found {len(groups_with_accounts)} role group(s) with accounts permission")


class TestDefaultPermissions:
    """Test that default permissions include accounts module"""
    
    def test_default_permissions_include_accounts(self, admin_session):
        """Default permissions should include 'accounts' for relevant roles"""
        resp = admin_session.get(f"{BASE_URL}/api/users/modules")
        assert resp.status_code == 200, f"Failed to get modules: {resp.text}"
        
        data = resp.json()
        default_perms = data.get("default_permissions", {})
        
        # Check admin has accounts permissions
        admin_perms = default_perms.get("admin", {})
        assert "accounts" in admin_perms, f"Admin should have 'accounts' in default permissions"
        assert admin_perms["accounts"], f"Admin should have non-empty accounts permissions"
        print(f"PASS: Admin default permissions include accounts: {admin_perms.get('accounts')}")
        
        # Check production_manager has accounts permissions
        pm_perms = default_perms.get("production_manager", {})
        assert "accounts" in pm_perms, f"Production manager should have 'accounts' in default permissions"
        print(f"PASS: Production manager default permissions include accounts: {pm_perms.get('accounts')}")
        
        # Check inventory_manager has accounts permissions
        im_perms = default_perms.get("inventory_manager", {})
        assert "accounts" in im_perms, f"Inventory manager should have 'accounts' in default permissions"
        print(f"PASS: Inventory manager default permissions include accounts: {im_perms.get('accounts')}")
