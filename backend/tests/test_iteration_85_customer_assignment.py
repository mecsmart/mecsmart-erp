"""
Iteration 85 - Customer Assignment & Sidebar Tests
Tests for:
1. PUT /api/customers/{id} accepts assigned_user_ids and persists it
2. GET /api/customers as admin returns ALL customers (no mine param)
3. GET /api/customers with mine=true returns only admin-created customers
4. GET /api/customers as non-admin returns ONLY customers where created_by==user.id OR user.id IN assigned_user_ids
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCustomerAssignment:
    """Tests for customer-side salesperson assignment (Odoo-style)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        self.admin_user = login_resp.json()
        yield
    
    def test_01_get_all_customers_as_admin(self):
        """Admin without mine param should see ALL customers"""
        resp = self.session.get(f"{BASE_URL}/api/customers")
        assert resp.status_code == 200, f"GET customers failed: {resp.text}"
        customers = resp.json()
        print(f"Admin sees {len(customers)} customers (all)")
        assert isinstance(customers, list)
        # Should include customers regardless of assignment
        return customers
    
    def test_02_get_own_customers_as_admin(self):
        """Admin with mine=true should see only admin-created customers"""
        resp = self.session.get(f"{BASE_URL}/api/customers?mine=true")
        assert resp.status_code == 200, f"GET customers mine=true failed: {resp.text}"
        customers = resp.json()
        print(f"Admin sees {len(customers)} own customers (mine=true)")
        # All returned customers should have created_by == admin's id
        for c in customers:
            if c.get('created_by'):
                assert c['created_by'] == self.admin_user['id'], f"Customer {c['code']} not created by admin"
        return customers
    
    def test_03_update_customer_with_assigned_user_ids(self):
        """PUT /api/customers/{id} should accept and persist assigned_user_ids"""
        # First get all customers to find one to update
        resp = self.session.get(f"{BASE_URL}/api/customers")
        assert resp.status_code == 200
        customers = resp.json()
        
        if not customers:
            pytest.skip("No customers to test with")
        
        # Find Tata Motors (CUST-001) or use first customer
        target = next((c for c in customers if c.get('code') == 'CUST-001'), customers[0])
        customer_id = target['id']
        
        # Get test_perm user id
        users_resp = self.session.get(f"{BASE_URL}/api/users")
        assert users_resp.status_code == 200
        users = users_resp.json()
        test_perm_user = next((u for u in users if u.get('email') == 'test_perm@erp.com'), None)
        
        if not test_perm_user:
            pytest.skip("test_perm@erp.com user not found")
        
        # Update customer with assigned_user_ids
        update_resp = self.session.put(f"{BASE_URL}/api/customers/{customer_id}", json={
            "assigned_user_ids": [test_perm_user['id']]
        })
        assert update_resp.status_code == 200, f"PUT customer failed: {update_resp.text}"
        updated = update_resp.json()
        
        # Verify assigned_user_ids is returned
        assert 'assigned_user_ids' in updated, "assigned_user_ids not in response"
        assert test_perm_user['id'] in updated['assigned_user_ids'], "User not in assigned_user_ids"
        print(f"Customer {target['code']} assigned to {test_perm_user['email']}")
        
        # GET to verify persistence
        get_resp = self.session.get(f"{BASE_URL}/api/customers/{customer_id}")
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert test_perm_user['id'] in fetched.get('assigned_user_ids', []), "Assignment not persisted"
        
        return customer_id, test_perm_user['id']
    
    def test_04_non_admin_sees_only_assigned_customers(self):
        """Non-admin user should only see customers they created OR are assigned to"""
        # Login as non-admin
        non_admin_session = requests.Session()
        non_admin_session.headers.update({"Content-Type": "application/json"})
        
        login_resp = non_admin_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_perm@erp.com",
            "password": "Test@123"
        })
        assert login_resp.status_code == 200, f"Non-admin login failed: {login_resp.text}"
        non_admin_user = login_resp.json()
        
        # Get customers as non-admin
        resp = non_admin_session.get(f"{BASE_URL}/api/customers")
        assert resp.status_code == 200, f"GET customers as non-admin failed: {resp.text}"
        customers = resp.json()
        
        print(f"Non-admin ({non_admin_user['email']}) sees {len(customers)} customers")
        
        # Verify each customer is either created by this user OR has this user in assigned_user_ids
        for c in customers:
            created_by_user = c.get('created_by') == non_admin_user['id']
            assigned_to_user = non_admin_user['id'] in (c.get('assigned_user_ids') or [])
            assert created_by_user or assigned_to_user, \
                f"Customer {c['code']} should not be visible to non-admin (created_by={c.get('created_by')}, assigned={c.get('assigned_user_ids')})"
        
        # If test_perm is assigned to Tata Motors, should see at least 1 customer
        tata = next((c for c in customers if c.get('code') == 'CUST-001'), None)
        if tata:
            print(f"Non-admin can see Tata Motors (CUST-001) as expected")
        
        return customers


class TestCustomerAssignmentEdgeCases:
    """Edge case tests for customer assignment"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        self.admin_user = login_resp.json()
        yield
    
    def test_create_customer_with_assigned_user_ids(self):
        """Create a new customer with assigned_user_ids"""
        # Get a user to assign
        users_resp = self.session.get(f"{BASE_URL}/api/users")
        users = users_resp.json()
        test_user = next((u for u in users if u.get('email') == 'test_perm@erp.com'), None)
        
        if not test_user:
            pytest.skip("test_perm@erp.com not found")
        
        # Create customer with assignment
        create_resp = self.session.post(f"{BASE_URL}/api/customers", json={
            "name": "TEST_Assigned Customer",
            "code": f"TEST-ASSIGN-{os.urandom(2).hex().upper()}",
            "assigned_user_ids": [test_user['id']]
        })
        assert create_resp.status_code == 201, f"Create customer failed: {create_resp.text}"
        created = create_resp.json()
        
        # Verify assignment
        assert test_user['id'] in created.get('assigned_user_ids', []), "Assignment not set on create"
        print(f"Created customer {created['code']} with assignment to {test_user['email']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/customers/{created['id']}")
    
    def test_clear_assigned_user_ids(self):
        """Update customer to clear all assignments"""
        # Get a customer
        resp = self.session.get(f"{BASE_URL}/api/customers")
        customers = resp.json()
        if not customers:
            pytest.skip("No customers")
        
        target = customers[0]
        original_assignments = target.get('assigned_user_ids', [])
        
        # Clear assignments
        update_resp = self.session.put(f"{BASE_URL}/api/customers/{target['id']}", json={
            "assigned_user_ids": []
        })
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated.get('assigned_user_ids') == [], "Assignments not cleared"
        
        # Restore original
        if original_assignments:
            self.session.put(f"{BASE_URL}/api/customers/{target['id']}", json={
                "assigned_user_ids": original_assignments
            })


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
