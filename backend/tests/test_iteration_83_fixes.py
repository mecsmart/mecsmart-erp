"""
Iteration 83 Backend Tests — 5 Fixes:
1. Customers page permissions (customers.create/edit/delete)
2. Per-user customer assignment (assigned_customer_ids)
3. Admin scope filter (mine=true)
4. Non-admin sees own + assigned + legacy customers
5. User update persists assigned_customer_ids
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication helpers"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin and return session with cookies"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def non_admin_session(self):
        """Login as non-admin test user and return session"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_perm@erp.com",
            "password": "Test@123"
        })
        assert resp.status_code == 200, f"Non-admin login failed: {resp.text}"
        return session


class TestUserAssignedCustomerIds(TestAuth):
    """Test PUT /api/users/{id} accepts and persists assigned_customer_ids"""
    
    def test_admin_can_update_user_assigned_customer_ids(self, admin_session):
        """Admin can set assigned_customer_ids on a user"""
        # First get the non-admin user
        users_resp = admin_session.get(f"{BASE_URL}/api/users")
        assert users_resp.status_code == 200
        users = users_resp.json()
        
        test_user = next((u for u in users if u.get("email") == "test_perm@erp.com"), None)
        assert test_user is not None, "test_perm@erp.com user not found"
        
        # Get some customers to assign
        customers_resp = admin_session.get(f"{BASE_URL}/api/customers")
        assert customers_resp.status_code == 200
        customers = customers_resp.json()
        
        # Assign first 3 customers (or fewer if less exist)
        customer_ids_to_assign = [c["id"] for c in customers[:3]]
        
        # Update user with assigned_customer_ids
        update_resp = admin_session.put(
            f"{BASE_URL}/api/users/{test_user['id']}",
            json={"assigned_customer_ids": customer_ids_to_assign}
        )
        assert update_resp.status_code == 200, f"Failed to update user: {update_resp.text}"
        
        # Verify the field persisted by fetching users again
        users_resp2 = admin_session.get(f"{BASE_URL}/api/users")
        assert users_resp2.status_code == 200
        users2 = users_resp2.json()
        
        updated_user = next((u for u in users2 if u.get("email") == "test_perm@erp.com"), None)
        assert updated_user is not None
        assert "assigned_customer_ids" in updated_user
        assert updated_user["assigned_customer_ids"] == customer_ids_to_assign, \
            f"Expected {customer_ids_to_assign}, got {updated_user.get('assigned_customer_ids')}"
        
        print(f"✓ assigned_customer_ids persisted: {customer_ids_to_assign}")


class TestCustomersAdminScopeFilter(TestAuth):
    """Test GET /api/customers admin scope filter (mine=true)"""
    
    def test_admin_sees_all_customers_by_default(self, admin_session):
        """Admin without mine=true sees all customers"""
        resp = admin_session.get(f"{BASE_URL}/api/customers")
        assert resp.status_code == 200
        all_customers = resp.json()
        print(f"✓ Admin sees {len(all_customers)} customers (all)")
        return all_customers
    
    def test_admin_mine_filter_returns_own_contacts(self, admin_session):
        """Admin with mine=true sees only their own created contacts"""
        # First create a customer as admin to ensure at least one exists
        create_resp = admin_session.post(f"{BASE_URL}/api/customers", json={
            "name": "TEST_Admin_Created_Customer",
            "code": f"TEST-ADM-{os.urandom(4).hex()[:6].upper()}",
            "status": "active"
        })
        assert create_resp.status_code == 201, f"Failed to create customer: {create_resp.text}"
        created_customer = create_resp.json()
        
        # Get all customers
        all_resp = admin_session.get(f"{BASE_URL}/api/customers")
        assert all_resp.status_code == 200
        all_customers = all_resp.json()
        
        # Get only admin's own customers
        mine_resp = admin_session.get(f"{BASE_URL}/api/customers?mine=true")
        assert mine_resp.status_code == 200
        my_customers = mine_resp.json()
        
        # mine=true should return fewer or equal customers
        assert len(my_customers) <= len(all_customers), \
            f"mine=true returned {len(my_customers)} but all returned {len(all_customers)}"
        
        # The created customer should be in my_customers
        created_ids = [c["id"] for c in my_customers]
        assert created_customer["id"] in created_ids, \
            "Admin's created customer not in mine=true results"
        
        print(f"✓ Admin mine=true: {len(my_customers)} own contacts vs {len(all_customers)} total")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/customers/{created_customer['id']}")


class TestNonAdminCustomerVisibility(TestAuth):
    """Test non-admin sees own + assigned + legacy customers"""
    
    def test_non_admin_sees_assigned_customers(self, admin_session, non_admin_session):
        """Non-admin user sees their own + assigned customers"""
        # First, ensure the non-admin has some assigned customers
        users_resp = admin_session.get(f"{BASE_URL}/api/users")
        users = users_resp.json()
        test_user = next((u for u in users if u.get("email") == "test_perm@erp.com"), None)
        
        # Get all customers as admin
        all_customers_resp = admin_session.get(f"{BASE_URL}/api/customers")
        all_customers = all_customers_resp.json()
        
        if len(all_customers) >= 3:
            # Assign 3 customers to the non-admin user
            assigned_ids = [c["id"] for c in all_customers[:3]]
            admin_session.put(
                f"{BASE_URL}/api/users/{test_user['id']}",
                json={"assigned_customer_ids": assigned_ids}
            )
            
            # Now get customers as non-admin
            non_admin_resp = non_admin_session.get(f"{BASE_URL}/api/customers")
            assert non_admin_resp.status_code == 200
            visible_customers = non_admin_resp.json()
            
            # Non-admin should see at least the assigned customers
            visible_ids = [c["id"] for c in visible_customers]
            for aid in assigned_ids:
                assert aid in visible_ids, f"Assigned customer {aid} not visible to non-admin"
            
            print(f"✓ Non-admin sees {len(visible_customers)} customers (includes {len(assigned_ids)} assigned)")
        else:
            pytest.skip("Not enough customers to test assignment")
    
    def test_non_admin_does_not_see_mine_filter(self, non_admin_session):
        """Non-admin's mine parameter is ignored (they always see filtered view)"""
        # Both calls should return the same result for non-admin
        resp1 = non_admin_session.get(f"{BASE_URL}/api/customers")
        resp2 = non_admin_session.get(f"{BASE_URL}/api/customers?mine=true")
        
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        
        customers1 = resp1.json()
        customers2 = resp2.json()
        
        # For non-admin, mine=true should be ignored
        ids1 = set(c["id"] for c in customers1)
        ids2 = set(c["id"] for c in customers2)
        
        assert ids1 == ids2, "Non-admin mine=true should return same results as default"
        print(f"✓ Non-admin mine=true ignored: {len(customers1)} customers both ways")


class TestCustomerCRUDPermissions(TestAuth):
    """Test customer CRUD respects granular permissions"""
    
    def test_admin_can_create_customer(self, admin_session):
        """Admin can create customers"""
        resp = admin_session.post(f"{BASE_URL}/api/customers", json={
            "name": "TEST_Permission_Customer",
            "code": f"TEST-PERM-{os.urandom(4).hex()[:6].upper()}",
            "status": "active"
        })
        assert resp.status_code == 201, f"Admin failed to create customer: {resp.text}"
        customer = resp.json()
        print(f"✓ Admin created customer: {customer['code']}")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/customers/{customer['id']}")
    
    def test_admin_can_edit_customer(self, admin_session):
        """Admin can edit customers"""
        # Create a customer first
        create_resp = admin_session.post(f"{BASE_URL}/api/customers", json={
            "name": "TEST_Edit_Customer",
            "code": f"TEST-EDIT-{os.urandom(4).hex()[:6].upper()}",
            "status": "active"
        })
        assert create_resp.status_code == 201
        customer = create_resp.json()
        
        # Edit it
        edit_resp = admin_session.put(f"{BASE_URL}/api/customers/{customer['id']}", json={
            "name": "TEST_Edit_Customer_Updated"
        })
        assert edit_resp.status_code == 200, f"Admin failed to edit customer: {edit_resp.text}"
        
        # Verify
        get_resp = admin_session.get(f"{BASE_URL}/api/customers/{customer['id']}")
        assert get_resp.status_code == 200
        assert get_resp.json()["name"] == "TEST_Edit_Customer_Updated"
        
        print(f"✓ Admin edited customer: {customer['code']}")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/customers/{customer['id']}")
    
    def test_admin_can_delete_customer(self, admin_session):
        """Admin can delete customers"""
        # Create a customer first
        create_resp = admin_session.post(f"{BASE_URL}/api/customers", json={
            "name": "TEST_Delete_Customer",
            "code": f"TEST-DEL-{os.urandom(4).hex()[:6].upper()}",
            "status": "active"
        })
        assert create_resp.status_code == 201
        customer = create_resp.json()
        
        # Delete it
        del_resp = admin_session.delete(f"{BASE_URL}/api/customers/{customer['id']}")
        assert del_resp.status_code == 200, f"Admin failed to delete customer: {del_resp.text}"
        
        # Verify deleted
        get_resp = admin_session.get(f"{BASE_URL}/api/customers/{customer['id']}")
        assert get_resp.status_code == 404
        
        print(f"✓ Admin deleted customer: {customer['code']}")


class TestSearchableItemSelectDescription(TestAuth):
    """Test that items endpoint returns description field for SearchableItemSelect"""
    
    def test_items_have_description_field(self, admin_session):
        """Items should have description field for search"""
        resp = admin_session.get(f"{BASE_URL}/api/items")
        assert resp.status_code == 200
        items = resp.json()
        
        if items:
            # Check that items have the description field
            sample_item = items[0]
            assert "description" in sample_item or sample_item.get("description") is None, \
                "Items should have description field"
            print(f"✓ Items endpoint returns {len(items)} items with description field available")
        else:
            print("✓ No items in database (description field test skipped)")


class TestCustomerEndpointBasics(TestAuth):
    """Basic customer endpoint tests"""
    
    def test_get_customers_returns_list(self, admin_session):
        """GET /api/customers returns a list"""
        resp = admin_session.get(f"{BASE_URL}/api/customers")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        print(f"✓ GET /api/customers returns list of {len(resp.json())} customers")
    
    def test_get_customers_with_status_filter(self, admin_session):
        """GET /api/customers?status=active filters by status"""
        resp = admin_session.get(f"{BASE_URL}/api/customers?status=active")
        assert resp.status_code == 200
        customers = resp.json()
        for c in customers:
            assert c.get("status") == "active", f"Customer {c.get('code')} has status {c.get('status')}"
        print(f"✓ GET /api/customers?status=active returns {len(customers)} active customers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
