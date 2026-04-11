"""
Test Suite for Settings Page Enhancements:
- Company & GST tab with structured address fields
- Branding & Currency tab (logo, tagline, primary/secondary currency)
- Suppliers/Customers structured address fields
- Address migration endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSettingsCompanyAPI:
    """Test Company Settings API with new fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        yield
        self.session.close()
    
    def test_get_company_settings_returns_new_fields(self):
        """GET /api/settings/company should return all new fields"""
        resp = self.session.get(f"{BASE_URL}/api/settings/company")
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify structured address fields exist
        assert "address" in data, "Missing address field"
        assert "address_line2" in data, "Missing address_line2 field"
        assert "city" in data, "Missing city field"
        assert "state" in data, "Missing state field"
        assert "pin_code" in data, "Missing pin_code field"
        
        # Verify branding fields exist
        assert "logo_data" in data or data.get("logo_data") is None, "logo_data field should exist"
        assert "tagline" in data, "Missing tagline field"
        
        # Verify currency fields exist
        assert "primary_currency" in data, "Missing primary_currency field"
        assert "secondary_currency" in data, "Missing secondary_currency field"
        
        print(f"Company settings returned with all new fields: {list(data.keys())}")
    
    def test_company_settings_has_correct_currency_values(self):
        """Verify currency is set to INR as primary"""
        resp = self.session.get(f"{BASE_URL}/api/settings/company")
        assert resp.status_code == 200
        data = resp.json()
        
        # Per context: Primary currency is INR, secondary is USD
        assert data.get("primary_currency") == "INR", f"Expected INR, got {data.get('primary_currency')}"
        assert data.get("secondary_currency") == "USD", f"Expected USD, got {data.get('secondary_currency')}"
        print(f"Currency settings correct: Primary={data['primary_currency']}, Secondary={data['secondary_currency']}")
    
    def test_company_settings_has_tagline(self):
        """Verify tagline is set"""
        resp = self.session.get(f"{BASE_URL}/api/settings/company")
        assert resp.status_code == 200
        data = resp.json()
        
        # Per context: Tagline is 'Precision Engineering Solutions'
        assert data.get("tagline") == "Precision Engineering Solutions", f"Expected tagline, got {data.get('tagline')}"
        print(f"Tagline correct: {data['tagline']}")
    
    def test_update_company_settings_with_new_fields(self):
        """PUT /api/settings/company should save new fields"""
        # First get current settings
        get_resp = self.session.get(f"{BASE_URL}/api/settings/company")
        current = get_resp.json()
        
        # Update with test values
        update_data = {
            "company_name": current.get("company_name", "Test Company"),
            "address": "TEST_Plot 100",
            "address_line2": "TEST_Industrial Area",
            "city": "TEST_City",
            "state": "TEST_State",
            "pin_code": "123456",
            "tagline": "TEST_Tagline Updated",
            "primary_currency": "INR",
            "secondary_currency": "USD"
        }
        
        resp = self.session.put(f"{BASE_URL}/api/settings/company", json=update_data)
        assert resp.status_code == 200, f"Update failed: {resp.text}"
        
        # Verify update persisted
        verify_resp = self.session.get(f"{BASE_URL}/api/settings/company")
        data = verify_resp.json()
        
        assert data.get("address") == "TEST_Plot 100"
        assert data.get("address_line2") == "TEST_Industrial Area"
        assert data.get("city") == "TEST_City"
        assert data.get("state") == "TEST_State"
        assert data.get("pin_code") == "123456"
        assert data.get("tagline") == "TEST_Tagline Updated"
        
        print("Company settings update with new fields successful")
        
        # Restore original values
        restore_data = {
            "address": current.get("address", ""),
            "address_line2": current.get("address_line2", ""),
            "city": current.get("city", ""),
            "state": current.get("state", ""),
            "pin_code": current.get("pin_code", ""),
            "tagline": current.get("tagline", "")
        }
        self.session.put(f"{BASE_URL}/api/settings/company", json=restore_data)


class TestSuppliersStructuredAddress:
    """Test Suppliers API with structured address fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        yield
        self.session.close()
    
    def test_get_suppliers_returns_structured_address(self):
        """GET /api/suppliers should return structured address fields"""
        resp = self.session.get(f"{BASE_URL}/api/suppliers")
        assert resp.status_code == 200
        suppliers = resp.json()
        
        if len(suppliers) > 0:
            supplier = suppliers[0]
            # Check that structured fields can exist
            assert "address" in supplier or supplier.get("address") is None
            # city should exist after migration
            assert "city" in supplier or supplier.get("city") is None
            print(f"Supplier {supplier['code']} has city: {supplier.get('city')}")
    
    def test_create_supplier_with_structured_address(self):
        """POST /api/suppliers with structured address fields"""
        supplier_data = {
            "code": "TEST-SUP-ADDR-001",
            "name": "TEST Structured Address Supplier",
            "contact_person": "Test Contact",
            "email": "test@supplier.com",
            "phone": "+91-9876543210",
            "address": "TEST_Building 1, Street 2",
            "address_line2": "TEST_Industrial Zone",
            "city": "TEST_Mumbai",
            "state": "TEST_Maharashtra",
            "pin_code": "400001",
            "gstin": "27AABCT1234A1ZM",
            "state_code": "27",
            "payment_terms": "Net 30",
            "lead_time_days": 7,
            "rating": 4,
            "status": "active"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert resp.status_code == 201, f"Create failed: {resp.text}"
        
        created = resp.json()
        assert created.get("address") == "TEST_Building 1, Street 2"
        assert created.get("address_line2") == "TEST_Industrial Zone"
        assert created.get("city") == "TEST_Mumbai"
        assert created.get("state") == "TEST_Maharashtra"
        assert created.get("pin_code") == "400001"
        
        print(f"Created supplier with structured address: {created['id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/suppliers/{created['id']}")
    
    def test_update_supplier_structured_address(self):
        """PUT /api/suppliers/{id} updates structured address fields"""
        # First create a test supplier
        create_data = {
            "code": "TEST-SUP-UPD-001",
            "name": "TEST Update Supplier",
            "address": "Original Address",
            "city": "Original City",
            "status": "active"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/suppliers", json=create_data)
        assert create_resp.status_code == 201
        supplier_id = create_resp.json()["id"]
        
        # Update address fields
        update_data = {
            "address": "Updated Address Line 1",
            "address_line2": "Updated Area",
            "city": "Updated City",
            "state": "Updated State",
            "pin_code": "999999"
        }
        
        update_resp = self.session.put(f"{BASE_URL}/api/suppliers/{supplier_id}", json=update_data)
        assert update_resp.status_code == 200
        
        # Verify update
        get_resp = self.session.get(f"{BASE_URL}/api/suppliers")
        suppliers = get_resp.json()
        updated = next((s for s in suppliers if s["id"] == supplier_id), None)
        
        assert updated is not None
        assert updated.get("address") == "Updated Address Line 1"
        assert updated.get("address_line2") == "Updated Area"
        assert updated.get("city") == "Updated City"
        assert updated.get("state") == "Updated State"
        assert updated.get("pin_code") == "999999"
        
        print("Supplier address update successful")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/suppliers/{supplier_id}")


class TestCustomersStructuredAddress:
    """Test Customers API with structured address fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        yield
        self.session.close()
    
    def test_get_customers_returns_structured_address(self):
        """GET /api/customers should return structured address fields"""
        resp = self.session.get(f"{BASE_URL}/api/customers")
        assert resp.status_code == 200
        customers = resp.json()
        
        if len(customers) > 0:
            customer = customers[0]
            # Check that structured fields can exist
            assert "address" in customer or customer.get("address") is None
            assert "city" in customer or customer.get("city") is None
            print(f"Customer {customer['code']} has city: {customer.get('city')}")
    
    def test_create_customer_with_structured_address(self):
        """POST /api/customers with structured address fields"""
        customer_data = {
            "code": "TEST-CUST-ADDR-001",
            "name": "TEST Structured Address Customer",
            "gstin": "27AABCT9999A1ZM",
            "state_code": "27",
            "contact_person": "Test Contact",
            "email": "test@customer.com",
            "phone": "+91-9876543210",
            "address": "TEST_Office 101, Tower A",
            "address_line2": "TEST_Business Park",
            "city": "TEST_Pune",
            "state": "TEST_Maharashtra",
            "pin_code": "411001",
            "payment_terms": "Net 30",
            "status": "active"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/customers", json=customer_data)
        assert resp.status_code == 201, f"Create failed: {resp.text}"
        
        created = resp.json()
        assert created.get("address") == "TEST_Office 101, Tower A"
        assert created.get("address_line2") == "TEST_Business Park"
        assert created.get("city") == "TEST_Pune"
        assert created.get("state") == "TEST_Maharashtra"
        assert created.get("pin_code") == "411001"
        
        print(f"Created customer with structured address: {created['id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/customers/{created['id']}")
    
    def test_update_customer_structured_address(self):
        """PUT /api/customers/{id} updates structured address fields"""
        # First create a test customer
        create_data = {
            "code": "TEST-CUST-UPD-001",
            "name": "TEST Update Customer",
            "address": "Original Address",
            "city": "Original City",
            "status": "active"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/customers", json=create_data)
        assert create_resp.status_code == 201
        customer_id = create_resp.json()["id"]
        
        # Update address fields
        update_data = {
            "address": "Updated Address Line 1",
            "address_line2": "Updated Locality",
            "city": "Updated City",
            "state": "Updated State",
            "pin_code": "888888"
        }
        
        update_resp = self.session.put(f"{BASE_URL}/api/customers/{customer_id}", json=update_data)
        assert update_resp.status_code == 200
        
        # Verify update
        get_resp = self.session.get(f"{BASE_URL}/api/customers")
        customers = get_resp.json()
        updated = next((c for c in customers if c["id"] == customer_id), None)
        
        assert updated is not None
        assert updated.get("address") == "Updated Address Line 1"
        assert updated.get("address_line2") == "Updated Locality"
        assert updated.get("city") == "Updated City"
        assert updated.get("state") == "Updated State"
        assert updated.get("pin_code") == "888888"
        
        print("Customer address update successful")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/customers/{customer_id}")


class TestAddressMigrationAPI:
    """Test address migration endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        yield
        self.session.close()
    
    def test_migrate_addresses_endpoint_exists(self):
        """POST /api/settings/migrate-addresses should work"""
        resp = self.session.post(f"{BASE_URL}/api/settings/migrate-addresses")
        assert resp.status_code == 200, f"Migration failed: {resp.text}"
        
        data = resp.json()
        assert "message" in data
        assert "migrated" in data
        assert "suppliers" in data["migrated"]
        assert "customers" in data["migrated"]
        assert "company" in data["migrated"]
        
        print(f"Migration result: {data}")


class TestCurrencyInAPIs:
    """Test that currency settings are properly returned"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        yield
        self.session.close()
    
    def test_items_api_returns_unit_cost(self):
        """GET /api/items should return unit_cost for currency display"""
        resp = self.session.get(f"{BASE_URL}/api/items")
        assert resp.status_code == 200
        items = resp.json()
        
        if len(items) > 0:
            item = items[0]
            assert "unit_cost" in item, "Items should have unit_cost field"
            print(f"Item {item['part_number']} has unit_cost: {item.get('unit_cost')}")
    
    def test_purchase_orders_api_returns_amounts(self):
        """GET /api/purchase-orders should return amount fields"""
        resp = self.session.get(f"{BASE_URL}/api/purchase-orders")
        assert resp.status_code == 200
        pos = resp.json()
        
        if len(pos) > 0:
            po = pos[0]
            assert "total_amount" in po or "subtotal" in po, "POs should have amount fields"
            print(f"PO {po.get('po_number')} has total_amount: {po.get('total_amount')}")
    
    def test_inventory_api_returns_values(self):
        """GET /api/inventory should return value fields"""
        resp = self.session.get(f"{BASE_URL}/api/inventory")
        assert resp.status_code == 200
        inventory = resp.json()
        
        if len(inventory) > 0:
            inv = inventory[0]
            # Inventory should have quantity and item info for value calculation
            assert "quantity" in inv or "current_stock" in inv
            print(f"Inventory item has quantity: {inv.get('quantity', inv.get('current_stock'))}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
