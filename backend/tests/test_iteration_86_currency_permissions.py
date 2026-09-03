"""
Iteration 86 Tests: Secondary Currency Support & Permission Modules

Tests:
1. Purchase Order currency support (INR/USD/EUR/GBP/AED) - GST zeroed for non-INR
2. Quotation currency support - GST zeroed for non-INR
3. Proforma/Tax Invoice currency inheritance from quotation
4. /api/users/assignable endpoint - open to any authenticated user
5. New permission modules: inventory_sale_price, inventory_purchase_price, inventory_configuration
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCurrencySupport:
    """Test secondary currency support across PO, Quotation, Proforma, Tax Invoice"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth cookies"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.user = login_resp.json()
        yield
        # Cleanup: delete test data
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Delete test-created data"""
        try:
            # Delete test POs
            pos = self.session.get(f"{BASE_URL}/api/purchase-orders").json()
            for po in pos:
                if po.get('notes', '').startswith('TEST_'):
                    self.session.delete(f"{BASE_URL}/api/purchase-orders/{po['id']}")
            
            # Delete test quotations
            quotes = self.session.get(f"{BASE_URL}/api/crm/quotations").json()
            for q in quotes:
                if q.get('notes', '').startswith('TEST_'):
                    try:
                        self.session.delete(f"{BASE_URL}/api/crm/quotations/{q['id']}")
                    except Exception:
                        pass
        except Exception:
            pass
    
    def _get_test_supplier(self):
        """Get or create a test supplier"""
        suppliers = self.session.get(f"{BASE_URL}/api/suppliers").json()
        if suppliers:
            return suppliers[0]['id']
        # Create one
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "name": "TEST_Supplier",
            "contact_person": "Test",
            "email": "test@supplier.com",
            "phone": "1234567890",
            "address": "Test Address",
            "state_code": "27",
            "gstin": "27AABCU9603R1ZM"
        })
        return resp.json()['id']
    
    def _get_test_item(self):
        """Get or create a test item"""
        items = self.session.get(f"{BASE_URL}/api/items").json()
        if items:
            return items[0]['id']
        # Create one
        resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": "TEST-ITEM-001",
            "name": "Test Item",
            "category": "raw_material",
            "unit_of_measure": "pcs",
            "unit_cost": 100,
            "hsn_code": "8483",
            "gst_rate": 18
        })
        return resp.json()['id']
    
    def _get_test_customer(self):
        """Get or create a test customer"""
        customers = self.session.get(f"{BASE_URL}/api/customers").json()
        if customers:
            return customers[0]['id'], customers[0].get('name', 'Test Customer')
        # Create one
        resp = self.session.post(f"{BASE_URL}/api/customers", json={
            "name": "TEST_Customer",
            "contact_person": "Test",
            "email": "test@customer.com",
            "phone": "1234567890",
            "address": "Test Address",
            "state_code": "27",
            "gstin": "27AABCU9603R1ZM"
        })
        data = resp.json()
        return data['id'], data.get('name', 'TEST_Customer')

    # ==================== PURCHASE ORDER CURRENCY TESTS ====================
    
    def test_po_create_with_usd_currency_no_gst(self):
        """POST /api/purchase-orders with currency=USD returns total_tax=0"""
        supplier_id = self._get_test_supplier()
        item_id = self._get_test_item()
        
        resp = self.session.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "currency": "USD",
            "lines": [{
                "item_id": item_id,
                "quantity": 10,
                "unit_price": 100,
                "gst_rate": 18
            }],
            "notes": "TEST_USD_PO"
        })
        
        assert resp.status_code == 201, f"PO creation failed: {resp.text}"
        po = resp.json()
        
        # Verify currency is persisted
        assert po.get('currency') == 'USD', f"Currency not persisted: {po.get('currency')}"
        
        # Verify GST is zeroed for non-INR
        assert po.get('total_tax') == 0, f"GST should be 0 for USD: {po.get('total_tax')}"
        assert po.get('total_cgst') == 0, f"CGST should be 0: {po.get('total_cgst')}"
        assert po.get('total_sgst') == 0, f"SGST should be 0: {po.get('total_sgst')}"
        assert po.get('total_igst') == 0, f"IGST should be 0: {po.get('total_igst')}"
        
        # Verify subtotal = total_amount (no tax added)
        assert po.get('subtotal') == po.get('total_amount'), f"Subtotal should equal total for export PO"
        
        print(f"✓ PO with USD currency created: {po.get('po_number')}, total_tax=0")
    
    def test_po_create_with_eur_currency_no_gst(self):
        """POST /api/purchase-orders with currency=EUR returns total_tax=0"""
        supplier_id = self._get_test_supplier()
        item_id = self._get_test_item()
        
        resp = self.session.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "currency": "EUR",
            "lines": [{
                "item_id": item_id,
                "quantity": 5,
                "unit_price": 200,
                "gst_rate": 18
            }],
            "notes": "TEST_EUR_PO"
        })
        
        assert resp.status_code == 201, f"PO creation failed: {resp.text}"
        po = resp.json()
        
        assert po.get('currency') == 'EUR'
        assert po.get('total_tax') == 0
        print(f"✓ PO with EUR currency created: {po.get('po_number')}, total_tax=0")
    
    def test_po_create_with_inr_currency_has_gst(self):
        """POST /api/purchase-orders with currency=INR (default) computes GST normally"""
        supplier_id = self._get_test_supplier()
        item_id = self._get_test_item()
        
        resp = self.session.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "currency": "INR",
            "lines": [{
                "item_id": item_id,
                "quantity": 10,
                "unit_price": 100,
                "gst_rate": 18
            }],
            "notes": "TEST_INR_PO"
        })
        
        assert resp.status_code == 201, f"PO creation failed: {resp.text}"
        po = resp.json()
        
        assert po.get('currency') == 'INR'
        # GST should be computed: 10 * 100 * 18% = 180
        assert po.get('total_tax') == 180, f"GST should be 180 for INR: {po.get('total_tax')}"
        print(f"✓ PO with INR currency created: {po.get('po_number')}, total_tax={po.get('total_tax')}")
    
    def test_po_update_currency_inr_to_usd_recomputes_gst(self):
        """PUT /api/purchase-orders/{id} flipping currency from INR → USD recomputes GST to 0"""
        supplier_id = self._get_test_supplier()
        item_id = self._get_test_item()
        
        # Create INR PO first
        create_resp = self.session.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "currency": "INR",
            "lines": [{
                "item_id": item_id,
                "quantity": 10,
                "unit_price": 100,
                "gst_rate": 18
            }],
            "notes": "TEST_FLIP_CURRENCY_PO"
        })
        assert create_resp.status_code == 201
        po = create_resp.json()
        po_id = po['id']
        
        # Verify INR has GST
        assert po.get('total_tax') == 180
        
        # Update to USD
        update_resp = self.session.put(f"{BASE_URL}/api/purchase-orders/{po_id}", json={
            "currency": "USD",
            "lines": [{
                "item_id": item_id,
                "quantity": 10,
                "unit_price": 100,
                "gst_rate": 18
            }]
        })
        assert update_resp.status_code == 200, f"PO update failed: {update_resp.text}"
        updated_po = update_resp.json()
        
        assert updated_po.get('currency') == 'USD'
        assert updated_po.get('total_tax') == 0, f"GST should be 0 after flip to USD: {updated_po.get('total_tax')}"
        print(f"✓ PO currency flipped INR→USD, GST recomputed to 0")
    
    # ==================== QUOTATION CURRENCY TESTS ====================
    
    def test_quotation_create_with_eur_no_gst(self):
        """POST /api/crm/quotations with currency=EUR returns total_gst=0"""
        customer_id, customer_name = self._get_test_customer()
        item_id = self._get_test_item()
        
        resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_id": customer_id,
            "customer_name": customer_name,
            "currency": "EUR",
            "lines": [{
                "item_id": item_id,
                "description": "Test Item",
                "quantity": 10,
                "rate": 50,
                "gst_rate": 18
            }],
            "notes": "TEST_EUR_QUOTATION"
        })
        
        assert resp.status_code == 201, f"Quotation creation failed: {resp.text}"
        q = resp.json()
        
        assert q.get('currency') == 'EUR'
        # subtotal = 10 * 50 = 500
        assert q.get('subtotal') == 500, f"Subtotal should be 500: {q.get('subtotal')}"
        assert q.get('total_gst') == 0, f"GST should be 0 for EUR: {q.get('total_gst')}"
        assert q.get('grand_total') == 500, f"Grand total should equal subtotal: {q.get('grand_total')}"
        
        print(f"✓ Quotation with EUR: subtotal=500, total_gst=0, grand_total=500")
    
    def test_quotation_create_with_inr_has_gst(self):
        """POST /api/crm/quotations with currency=INR computes GST normally"""
        customer_id, customer_name = self._get_test_customer()
        item_id = self._get_test_item()
        
        resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_id": customer_id,
            "customer_name": customer_name,
            "currency": "INR",
            "lines": [{
                "item_id": item_id,
                "description": "Test Item",
                "quantity": 10,
                "rate": 50,
                "gst_rate": 18
            }],
            "notes": "TEST_INR_QUOTATION"
        })
        
        assert resp.status_code == 201, f"Quotation creation failed: {resp.text}"
        q = resp.json()
        
        assert q.get('currency') == 'INR'
        # subtotal = 500, GST = 500 * 18% = 90
        assert q.get('subtotal') == 500
        assert q.get('total_gst') == 90, f"GST should be 90 for INR: {q.get('total_gst')}"
        assert q.get('grand_total') == 590, f"Grand total should be 590: {q.get('grand_total')}"
        
        print(f"✓ Quotation with INR: subtotal=500, total_gst=90, grand_total=590")
    
    def test_quotation_update_currency_drops_gst(self):
        """PUT /api/crm/quotations/{id} with currency: 'USD' (no line edits) recomputes grand_total to drop GST"""
        customer_id, customer_name = self._get_test_customer()
        item_id = self._get_test_item()
        
        # Create INR quotation
        create_resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_id": customer_id,
            "customer_name": customer_name,
            "currency": "INR",
            "lines": [{
                "item_id": item_id,
                "description": "Test Item",
                "quantity": 10,
                "rate": 50,
                "gst_rate": 18
            }],
            "notes": "TEST_FLIP_QUOTATION"
        })
        assert create_resp.status_code == 201
        q = create_resp.json()
        q_id = q['id']
        
        # Verify INR has GST
        assert q.get('total_gst') == 90
        assert q.get('grand_total') == 590
        
        # Update to USD (no line edits)
        update_resp = self.session.put(f"{BASE_URL}/api/crm/quotations/{q_id}", json={
            "currency": "USD"
        })
        assert update_resp.status_code == 200, f"Quotation update failed: {update_resp.text}"
        updated_q = update_resp.json()
        
        assert updated_q.get('currency') == 'USD'
        assert updated_q.get('total_gst') == 0, f"GST should be 0 after flip: {updated_q.get('total_gst')}"
        assert updated_q.get('grand_total') == 500, f"Grand total should drop to 500: {updated_q.get('grand_total')}"
        
        print(f"✓ Quotation currency flipped INR→USD, grand_total dropped from 590 to 500")
    
    # ==================== PROFORMA INHERITANCE TESTS ====================
    
    def test_convert_quotation_to_proforma_inherits_currency(self):
        """POST /api/crm/quotations/{qid}/convert-to-proforma — proforma inherits currency and GST stays zeroed"""
        customer_id, customer_name = self._get_test_customer()
        item_id = self._get_test_item()
        
        # Create EUR quotation
        create_resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_id": customer_id,
            "customer_name": customer_name,
            "currency": "EUR",
            "lines": [{
                "item_id": item_id,
                "description": "Test Item",
                "quantity": 10,
                "rate": 50,
                "gst_rate": 18
            }],
            "notes": "TEST_PROFORMA_INHERIT"
        })
        assert create_resp.status_code == 201
        q = create_resp.json()
        q_id = q['id']
        
        # Convert to proforma
        convert_resp = self.session.post(f"{BASE_URL}/api/crm/quotations/{q_id}/convert-to-proforma", json={})
        # API returns 200 or 201 depending on implementation
        assert convert_resp.status_code in [200, 201], f"Proforma conversion failed: {convert_resp.text}"
        pf = convert_resp.json()
        
        assert pf.get('currency') == 'EUR', f"Proforma should inherit EUR: {pf.get('currency')}"
        assert pf.get('total_gst') == 0, f"Proforma GST should be 0: {pf.get('total_gst')}"
        assert pf.get('grand_total') == 500, f"Proforma grand_total should be 500: {pf.get('grand_total')}"
        
        print(f"✓ Proforma inherits EUR currency from quotation, GST=0")
    
    # ==================== TAX INVOICE CURRENCY TESTS ====================
    
    def test_tax_invoice_create_with_eur_no_gst(self):
        """POST /api/crm/tax-invoices with currency=EUR — total_gst=0, no IGST/CGST/SGST"""
        customer_id, customer_name = self._get_test_customer()
        item_id = self._get_test_item()
        
        resp = self.session.post(f"{BASE_URL}/api/crm/tax-invoices", json={
            "customer_id": customer_id,
            "customer_name": customer_name,
            "currency": "EUR",
            "lines": [{
                "item_id": item_id,
                "description": "Test Item",
                "quantity": 10,
                "rate": 50,
                "gst_rate": 18
            }]
        })
        
        assert resp.status_code == 201, f"Tax Invoice creation failed: {resp.text}"
        ti = resp.json()
        
        assert ti.get('currency') == 'EUR'
        assert ti.get('total_gst') == 0, f"GST should be 0: {ti.get('total_gst')}"
        assert ti.get('cgst') == 0, f"CGST should be 0: {ti.get('cgst')}"
        assert ti.get('sgst') == 0, f"SGST should be 0: {ti.get('sgst')}"
        assert ti.get('igst') == 0, f"IGST should be 0: {ti.get('igst')}"
        # QR code should be empty for non-INR
        assert ti.get('qr_code') == '' or ti.get('qr_code') is None, f"QR code should be empty for EUR"
        
        print(f"✓ Tax Invoice with EUR: total_gst=0, no CGST/SGST/IGST, qr_code empty")


class TestAssignableUsersEndpoint:
    """Test /api/users/assignable endpoint - open to any authenticated user"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        yield
    
    def test_assignable_users_returns_light_list(self):
        """GET /api/users/assignable returns light user list (id, name, email)"""
        resp = self.session.get(f"{BASE_URL}/api/users/assignable")
        
        assert resp.status_code == 200, f"Assignable users failed: {resp.text}"
        users = resp.json()
        
        assert isinstance(users, list)
        assert len(users) > 0, "Should have at least one user"
        
        # Verify structure
        user = users[0]
        assert 'id' in user, "User should have id"
        assert 'name' in user, "User should have name"
        assert 'email' in user, "User should have email"
        
        # Should NOT have sensitive fields
        assert 'password_hash' not in user, "Should not expose password_hash"
        assert 'permissions' not in user, "Should not expose full permissions"
        
        print(f"✓ /api/users/assignable returns {len(users)} users with light payload")
    
    def test_full_users_endpoint_admin_only(self):
        """GET /api/users is admin-only (returns 200 for admin)"""
        resp = self.session.get(f"{BASE_URL}/api/users")
        
        assert resp.status_code == 200, f"Admin should access /api/users: {resp.text}"
        users = resp.json()
        
        # Full endpoint has more fields
        if users:
            user = users[0]
            assert 'permissions' in user or 'role' in user, "Full endpoint should have more fields"
        
        print(f"✓ /api/users accessible by admin, returns full user data")


class TestPermissionModules:
    """Test new permission modules: inventory_sale_price, inventory_purchase_price, inventory_configuration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        yield
    
    def test_modules_endpoint_includes_new_permissions(self):
        """GET /api/users/modules returns the 3 new permission modules"""
        resp = self.session.get(f"{BASE_URL}/api/users/modules")
        
        assert resp.status_code == 200, f"Modules endpoint failed: {resp.text}"
        data = resp.json()
        
        modules = data.get('modules', [])
        
        # Check for new modules
        assert 'inventory_sale_price' in modules, f"Missing inventory_sale_price: {modules}"
        assert 'inventory_purchase_price' in modules, f"Missing inventory_purchase_price: {modules}"
        assert 'inventory_configuration' in modules, f"Missing inventory_configuration: {modules}"
        
        print(f"✓ /api/users/modules includes inventory_sale_price, inventory_purchase_price, inventory_configuration")
    
    def test_new_modules_have_view_only_actions(self):
        """New modules should only have 'view' action (no create/edit/delete)"""
        resp = self.session.get(f"{BASE_URL}/api/users/modules")
        
        assert resp.status_code == 200
        data = resp.json()
        
        module_actions = data.get('module_actions', {})
        
        # These modules should only have 'view'
        view_only_modules = ['inventory_sale_price', 'inventory_purchase_price', 'inventory_configuration']
        
        for mod in view_only_modules:
            actions = module_actions.get(mod, [])
            assert actions == ['view'], f"{mod} should have only ['view'], got: {actions}"
        
        print(f"✓ New permission modules have view-only actions")


class TestAllCurrencies:
    """Test all supported currencies: INR, USD, EUR, GBP, AED"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        self.user = login_resp.json()
        yield
    
    def _get_test_supplier(self):
        suppliers = self.session.get(f"{BASE_URL}/api/suppliers").json()
        return suppliers[0]['id'] if suppliers else None
    
    def _get_test_item(self):
        items = self.session.get(f"{BASE_URL}/api/items").json()
        return items[0]['id'] if items else None
    
    @pytest.mark.parametrize("currency,expected_gst", [
        ("INR", True),   # INR should have GST
        ("USD", False),  # Non-INR should have no GST
        ("EUR", False),
        ("GBP", False),
        ("AED", False),
    ])
    def test_po_currency_gst_behavior(self, currency, expected_gst):
        """Test PO GST behavior for each currency"""
        supplier_id = self._get_test_supplier()
        item_id = self._get_test_item()
        
        if not supplier_id or not item_id:
            pytest.skip("No supplier or item available")
        
        resp = self.session.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier_id,
            "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "currency": currency,
            "lines": [{
                "item_id": item_id,
                "quantity": 10,
                "unit_price": 100,
                "gst_rate": 18
            }],
            "notes": f"TEST_{currency}_PO"
        })
        
        assert resp.status_code == 201, f"PO creation failed for {currency}: {resp.text}"
        po = resp.json()
        
        assert po.get('currency') == currency
        
        if expected_gst:
            assert po.get('total_tax') > 0, f"{currency} should have GST"
        else:
            assert po.get('total_tax') == 0, f"{currency} should have no GST"
        
        print(f"✓ PO with {currency}: total_tax={po.get('total_tax')} (expected_gst={expected_gst})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
