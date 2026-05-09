"""
Iteration 95 - Testing 4 fixes:
1. Supplier/Customer GST duplicate block (backend)
2. BOM duplicate component auto-merge (frontend logic, but we test backend BOM save)
3. Inline + Add / Edit party icons in PO and Quotation (frontend)
4. BOM hover tooltip on parent + line items (frontend)

This file tests FIX 1: GST duplicate block for Suppliers and Customers
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Get authenticated session with cookies"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if response.status_code == 200:
        return session
    pytest.skip("Authentication failed - skipping authenticated tests")


class TestSupplierGSTDuplicateBlock:
    """FIX 1 - Supplier GST duplicate block tests"""
    
    TEST_GSTIN = "27AAACX1234A1Z5"
    TEST_GSTIN_2 = "27BBBCX5678B2Z6"
    
    @pytest.fixture(autouse=True)
    def cleanup_test_suppliers(self, auth_session):
        """Cleanup test suppliers before and after tests"""
        self._cleanup_suppliers(auth_session)
        yield
        self._cleanup_suppliers(auth_session)
    
    def _cleanup_suppliers(self, session):
        """Delete test suppliers by GSTIN"""
        try:
            response = session.get(f"{BASE_URL}/api/suppliers")
            if response.status_code == 200:
                suppliers = response.json()
                for s in suppliers:
                    if s.get('gstin') in [self.TEST_GSTIN, self.TEST_GSTIN_2] or s.get('name', '').startswith('TEST_'):
                        session.delete(f"{BASE_URL}/api/suppliers/{s['id']}")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    def test_create_supplier_with_unique_gstin_succeeds(self, auth_session):
        """POST /api/suppliers with unique GSTIN should succeed"""
        payload = {
            "name": "TEST_Supplier_Unique_GST",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400001",
            "status": "active"
        }
        response = auth_session.post(f"{BASE_URL}/api/suppliers", json=payload)
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("gstin") == self.TEST_GSTIN
        assert data.get("name") == "TEST_Supplier_Unique_GST"
        print(f"✓ Created supplier with GSTIN {self.TEST_GSTIN}")
    
    def test_create_supplier_with_duplicate_gstin_fails(self, auth_session):
        """POST /api/suppliers with duplicate GSTIN should return 400"""
        # First create a supplier
        payload1 = {
            "name": "TEST_Supplier_First",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400001",
            "status": "active"
        }
        response1 = auth_session.post(f"{BASE_URL}/api/suppliers", json=payload1)
        assert response1.status_code == 201, f"First supplier creation failed: {response1.text}"
        
        # Try to create another supplier with same GSTIN
        payload2 = {
            "name": "TEST_Supplier_Duplicate",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400002",
            "status": "active"
        }
        response2 = auth_session.post(f"{BASE_URL}/api/suppliers", json=payload2)
        
        assert response2.status_code == 400, f"Expected 400, got {response2.status_code}: {response2.text}"
        error_detail = response2.json().get("detail", "")
        assert "GSTIN" in error_detail and self.TEST_GSTIN in error_detail, f"Error should mention GSTIN: {error_detail}"
        assert "already exists" in error_detail.lower(), f"Error should mention 'already exists': {error_detail}"
        print(f"✓ Duplicate GSTIN blocked with error: {error_detail}")
    
    def test_update_supplier_own_gstin_succeeds(self, auth_session):
        """PUT /api/suppliers/{id} can update its OWN gstin (no false positive)"""
        # Create a supplier
        payload = {
            "name": "TEST_Supplier_Update_Own",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400001",
            "status": "active"
        }
        response = auth_session.post(f"{BASE_URL}/api/suppliers", json=payload)
        assert response.status_code == 201
        supplier_id = response.json()["id"]
        
        # Update the same supplier with same GSTIN (should succeed)
        update_payload = {
            "name": "TEST_Supplier_Update_Own_Modified",
            "gstin": self.TEST_GSTIN  # Same GSTIN
        }
        update_response = auth_session.put(f"{BASE_URL}/api/suppliers/{supplier_id}", json=update_payload)
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        data = update_response.json()
        assert data.get("name") == "TEST_Supplier_Update_Own_Modified"
        print(f"✓ Supplier can update with its own GSTIN (no false positive)")
    
    def test_update_supplier_to_another_existing_gstin_fails(self, auth_session):
        """PUT /api/suppliers/{id} trying to use another supplier's GSTIN should fail"""
        # Create first supplier
        payload1 = {
            "name": "TEST_Supplier_A",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400001",
            "status": "active"
        }
        response1 = auth_session.post(f"{BASE_URL}/api/suppliers", json=payload1)
        assert response1.status_code == 201
        
        # Create second supplier with different GSTIN
        payload2 = {
            "name": "TEST_Supplier_B",
            "gstin": self.TEST_GSTIN_2,
            "state_code": "27",
            "pin_code": "400002",
            "status": "active"
        }
        response2 = auth_session.post(f"{BASE_URL}/api/suppliers", json=payload2)
        assert response2.status_code == 201
        supplier_b_id = response2.json()["id"]
        
        # Try to update supplier B with supplier A's GSTIN
        update_payload = {
            "gstin": self.TEST_GSTIN  # Supplier A's GSTIN
        }
        update_response = auth_session.put(f"{BASE_URL}/api/suppliers/{supplier_b_id}", json=update_payload)
        
        assert update_response.status_code == 400, f"Expected 400, got {update_response.status_code}: {update_response.text}"
        error_detail = update_response.json().get("detail", "")
        assert "GSTIN" in error_detail and self.TEST_GSTIN in error_detail
        print(f"✓ Cannot update supplier to use another supplier's GSTIN: {error_detail}")


class TestCustomerGSTDuplicateBlock:
    """FIX 1 - Customer GST duplicate block tests"""
    
    TEST_GSTIN = "27CCCDE9012C3Z7"
    TEST_GSTIN_2 = "27DDDDE3456D4Z8"
    
    @pytest.fixture(autouse=True)
    def cleanup_test_customers(self, auth_session):
        """Cleanup test customers before and after tests"""
        self._cleanup_customers(auth_session)
        yield
        self._cleanup_customers(auth_session)
    
    def _cleanup_customers(self, session):
        """Delete test customers by GSTIN"""
        try:
            response = session.get(f"{BASE_URL}/api/customers")
            if response.status_code == 200:
                customers = response.json()
                for c in customers:
                    if c.get('gstin') in [self.TEST_GSTIN, self.TEST_GSTIN_2] or c.get('name', '').startswith('TEST_'):
                        session.delete(f"{BASE_URL}/api/customers/{c['id']}")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    def test_create_customer_with_unique_gstin_succeeds(self, auth_session):
        """POST /api/customers with unique GSTIN should succeed"""
        payload = {
            "name": "TEST_Customer_Unique_GST",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400001",
            "status": "active"
        }
        response = auth_session.post(f"{BASE_URL}/api/customers", json=payload)
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("gstin") == self.TEST_GSTIN
        print(f"✓ Created customer with GSTIN {self.TEST_GSTIN}")
    
    def test_create_customer_with_duplicate_gstin_fails(self, auth_session):
        """POST /api/customers with duplicate GSTIN should return 400"""
        # First create a customer
        payload1 = {
            "name": "TEST_Customer_First",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400001",
            "status": "active"
        }
        response1 = auth_session.post(f"{BASE_URL}/api/customers", json=payload1)
        assert response1.status_code == 201, f"First customer creation failed: {response1.text}"
        
        # Try to create another customer with same GSTIN
        payload2 = {
            "name": "TEST_Customer_Duplicate",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400002",
            "status": "active"
        }
        response2 = auth_session.post(f"{BASE_URL}/api/customers", json=payload2)
        
        assert response2.status_code == 400, f"Expected 400, got {response2.status_code}: {response2.text}"
        error_detail = response2.json().get("detail", "")
        assert "GSTIN" in error_detail and self.TEST_GSTIN in error_detail
        assert "already exists" in error_detail.lower()
        print(f"✓ Duplicate GSTIN blocked with error: {error_detail}")
    
    def test_update_customer_own_gstin_succeeds(self, auth_session):
        """PUT /api/customers/{id} can update its OWN gstin (no false positive)"""
        # Create a customer
        payload = {
            "name": "TEST_Customer_Update_Own",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400001",
            "status": "active"
        }
        response = auth_session.post(f"{BASE_URL}/api/customers", json=payload)
        assert response.status_code == 201
        customer_id = response.json()["id"]
        
        # Update the same customer with same GSTIN (should succeed)
        update_payload = {
            "name": "TEST_Customer_Update_Own_Modified",
            "gstin": self.TEST_GSTIN
        }
        update_response = auth_session.put(f"{BASE_URL}/api/customers/{customer_id}", json=update_payload)
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        data = update_response.json()
        assert data.get("name") == "TEST_Customer_Update_Own_Modified"
        print(f"✓ Customer can update with its own GSTIN (no false positive)")
    
    def test_update_customer_to_another_existing_gstin_fails(self, auth_session):
        """PUT /api/customers/{id} trying to use another customer's GSTIN should fail"""
        # Create first customer
        payload1 = {
            "name": "TEST_Customer_A",
            "gstin": self.TEST_GSTIN,
            "state_code": "27",
            "pin_code": "400001",
            "status": "active"
        }
        response1 = auth_session.post(f"{BASE_URL}/api/customers", json=payload1)
        assert response1.status_code == 201
        
        # Create second customer with different GSTIN
        payload2 = {
            "name": "TEST_Customer_B",
            "gstin": self.TEST_GSTIN_2,
            "state_code": "27",
            "pin_code": "400002",
            "status": "active"
        }
        response2 = auth_session.post(f"{BASE_URL}/api/customers", json=payload2)
        assert response2.status_code == 201
        customer_b_id = response2.json()["id"]
        
        # Try to update customer B with customer A's GSTIN
        update_payload = {
            "gstin": self.TEST_GSTIN
        }
        update_response = auth_session.put(f"{BASE_URL}/api/customers/{customer_b_id}", json=update_payload)
        
        assert update_response.status_code == 400, f"Expected 400, got {update_response.status_code}: {update_response.text}"
        error_detail = update_response.json().get("detail", "")
        assert "GSTIN" in error_detail and self.TEST_GSTIN in error_detail
        print(f"✓ Cannot update customer to use another customer's GSTIN: {error_detail}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
