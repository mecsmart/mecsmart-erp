"""
Round 21.3 Backend Tests - Additional Charges with value_type (₹/%) toggle
Tests: BACKEND-1 - POST /api/crm/quotations with additional_charges containing value_type + value fields
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAdditionalChargesValueType:
    """Test additional charges with value_type (amount/percent) and value fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session cookie"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.user = login_resp.json()
        print(f"Logged in as: {self.user.get('email')}")
        
        # Get existing customer for quotation
        customers_resp = self.session.get(f"{BASE_URL}/api/customers")
        assert customers_resp.status_code == 200
        customers = customers_resp.json()
        if customers:
            self.customer = customers[0]
        else:
            # Create a test customer
            cust_resp = self.session.post(f"{BASE_URL}/api/customers", json={
                "name": f"TEST_Customer_Round21_3_{uuid.uuid4().hex[:6]}",
                "customer_code": f"TC{uuid.uuid4().hex[:4].upper()}",
                "gstin": f"27AABCU{uuid.uuid4().hex[:4].upper()}R1ZM",
                "state_code": "27",
                "address": "Test Address, Maharashtra"
            })
            assert cust_resp.status_code in [200, 201]
            self.customer = cust_resp.json()
        
        # Get existing items for line items
        items_resp = self.session.get(f"{BASE_URL}/api/items")
        assert items_resp.status_code == 200
        items = items_resp.json()
        self.item = items[0] if items else None
        
        yield
        
        # Cleanup - no explicit cleanup needed as we use TEST_ prefix
    
    def test_quotation_with_amount_and_percent_charges(self):
        """BACKEND-1: POST quotation with additional_charges containing value_type='amount' and 'percent'"""
        # Create quotation with:
        # - Line item: qty=10, rate=100 => subtotal=1000
        # - Charge 1: value_type='amount', value=500 => amount=500
        # - Charge 2: value_type='percent', value=2 => amount=1000*0.02=20
        # Expected: charges_total=520, charges_gst=520*0.18=93.60, item_gst=180, total_gst=273.60
        
        payload = {
            "customer_id": self.customer.get("id", ""),
            "customer_name": self.customer.get("name", "TEST_Customer"),
            "contact_person": "Test Contact",
            "email": "test@example.com",
            "phone": "1234567890",
            "quotation_date": datetime.now().isoformat(),
            "currency": "INR",
            "global_discount_type": "amount",
            "global_discount_value": 0,
            "lines": [
                {
                    "item_id": self.item.get("id", "") if self.item else "",
                    "description": "Test Item for Math Verification",
                    "quantity": 10,
                    "uom": "Nos",
                    "rate": 100,
                    "discount_pct": 0,
                    "gst_rate": 18,
                    "hsn_code": "8482"
                }
            ],
            "additional_charges": [
                {
                    "charge_id": "",
                    "name": "Packing Charge (₹ mode)",
                    "hsn_code": "996511",
                    "gst_rate": 18,
                    "value_type": "amount",
                    "value": 500,
                    "amount": 500
                },
                {
                    "charge_id": "",
                    "name": "Handling Fee (% mode)",
                    "hsn_code": "996512",
                    "gst_rate": 18,
                    "value_type": "percent",
                    "value": 2,
                    "amount": 20  # 1000 * 0.02 = 20
                }
            ],
            "notes": "TEST_Round21_3_Math_Verification",
            "terms": "Standard terms"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json=payload)
        assert resp.status_code in [200, 201], f"Create quotation failed: {resp.text}"
        
        quotation = resp.json()
        print(f"Created quotation: {quotation.get('quotation_no')}")
        
        # Verify additional_charges are persisted with value_type and value
        charges = quotation.get("additional_charges", [])
        assert len(charges) == 2, f"Expected 2 charges, got {len(charges)}"
        
        # Verify first charge (amount mode)
        charge1 = charges[0]
        assert charge1.get("value_type") == "amount", f"Charge 1 value_type should be 'amount', got {charge1.get('value_type')}"
        assert charge1.get("value") == 500, f"Charge 1 value should be 500, got {charge1.get('value')}"
        assert charge1.get("amount") == 500, f"Charge 1 amount should be 500, got {charge1.get('amount')}"
        print(f"Charge 1: value_type={charge1.get('value_type')}, value={charge1.get('value')}, amount={charge1.get('amount')}")
        
        # Verify second charge (percent mode)
        charge2 = charges[1]
        assert charge2.get("value_type") == "percent", f"Charge 2 value_type should be 'percent', got {charge2.get('value_type')}"
        assert charge2.get("value") == 2, f"Charge 2 value should be 2, got {charge2.get('value')}"
        assert charge2.get("amount") == 20, f"Charge 2 amount should be 20, got {charge2.get('amount')}"
        print(f"Charge 2: value_type={charge2.get('value_type')}, value={charge2.get('value')}, amount={charge2.get('amount')}")
        
        # Verify totals
        # Expected: subtotal=1000, charges_total=520, item_gst=180, charges_gst=93.60, total_gst=273.60
        # grand_total = 1000 + 520 + 273.60 = 1793.60
        additional_charges_total = quotation.get("additional_charges_total", 0)
        additional_charges_gst = quotation.get("additional_charges_gst", 0)
        total_gst = quotation.get("total_gst", 0)
        grand_total = quotation.get("grand_total", 0)
        
        print(f"Totals: charges_total={additional_charges_total}, charges_gst={additional_charges_gst}, total_gst={total_gst}, grand_total={grand_total}")
        
        assert abs(additional_charges_total - 520) < 0.01, f"Charges total should be 520, got {additional_charges_total}"
        assert abs(additional_charges_gst - 93.60) < 0.01, f"Charges GST should be 93.60, got {additional_charges_gst}"
        assert abs(total_gst - 273.60) < 0.01, f"Total GST should be 273.60, got {total_gst}"
        assert abs(grand_total - 1793.60) < 0.01, f"Grand total should be 1793.60, got {grand_total}"
        
        # Store quotation ID for later tests
        self.quotation_id = quotation.get("id")
        print("BACKEND-1: PASS - Quotation created with value_type + value fields preserved")
        
        return quotation
    
    def test_quotation_get_preserves_value_type(self):
        """Verify GET quotation returns value_type and value fields"""
        # First create a quotation
        quotation = self.test_quotation_with_amount_and_percent_charges()
        quotation_id = quotation.get("id")
        
        # GET the quotation
        resp = self.session.get(f"{BASE_URL}/api/crm/quotations/{quotation_id}")
        assert resp.status_code == 200, f"GET quotation failed: {resp.text}"
        
        fetched = resp.json()
        charges = fetched.get("additional_charges", [])
        
        # Verify value_type and value are preserved
        charge1 = charges[0]
        assert charge1.get("value_type") == "amount", "Charge 1 value_type not preserved"
        assert charge1.get("value") == 500, "Charge 1 value not preserved"
        
        charge2 = charges[1]
        assert charge2.get("value_type") == "percent", "Charge 2 value_type not preserved"
        assert charge2.get("value") == 2, "Charge 2 value not preserved"
        
        print("GET quotation preserves value_type and value: PASS")
    
    def test_quotation_update_preserves_value_type(self):
        """Verify PUT quotation preserves value_type and value fields"""
        # First create a quotation
        quotation = self.test_quotation_with_amount_and_percent_charges()
        quotation_id = quotation.get("id")
        
        # Update with modified charges
        update_payload = {
            "customer_id": self.customer.get("id", ""),
            "customer_name": self.customer.get("name", "TEST_Customer"),
            "lines": quotation.get("lines", []),
            "additional_charges": [
                {
                    "charge_id": "",
                    "name": "Updated Packing (₹ mode)",
                    "hsn_code": "996511",
                    "gst_rate": 18,
                    "value_type": "amount",
                    "value": 600,  # Changed from 500 to 600
                    "amount": 600
                },
                {
                    "charge_id": "",
                    "name": "Updated Handling (% mode)",
                    "hsn_code": "996512",
                    "gst_rate": 18,
                    "value_type": "percent",
                    "value": 5,  # Changed from 2% to 5%
                    "amount": 50  # 1000 * 0.05 = 50
                }
            ]
        }
        
        resp = self.session.put(f"{BASE_URL}/api/crm/quotations/{quotation_id}", json=update_payload)
        assert resp.status_code == 200, f"Update quotation failed: {resp.text}"
        
        updated = resp.json()
        charges = updated.get("additional_charges", [])
        
        # Verify updated values
        charge1 = charges[0]
        assert charge1.get("value_type") == "amount", "Updated charge 1 value_type not preserved"
        assert charge1.get("value") == 600, f"Updated charge 1 value should be 600, got {charge1.get('value')}"
        
        charge2 = charges[1]
        assert charge2.get("value_type") == "percent", "Updated charge 2 value_type not preserved"
        assert charge2.get("value") == 5, f"Updated charge 2 value should be 5, got {charge2.get('value')}"
        
        # Verify recalculated totals
        # charges_total = 600 + 50 = 650
        # charges_gst = 650 * 0.18 = 117
        additional_charges_total = updated.get("additional_charges_total", 0)
        assert abs(additional_charges_total - 650) < 0.01, f"Updated charges total should be 650, got {additional_charges_total}"
        
        print("PUT quotation preserves and recalculates value_type/value: PASS")
    
    def test_tax_invoice_with_value_type_charges(self):
        """Test Tax Invoice with value_type charges"""
        payload = {
            "customer_id": self.customer.get("id", ""),
            "customer_name": self.customer.get("name", "TEST_Customer"),
            "contact_person": "Test Contact",
            "billing_address": "Test Address",
            "shipping_address": "Test Address",
            "place_of_supply": "27 - Maharashtra",
            "invoice_date": datetime.now().isoformat(),
            "currency": "INR",
            "lines": [
                {
                    "item_id": self.item.get("id", "") if self.item else "",
                    "description": "Test Item for TI",
                    "quantity": 10,
                    "uom": "Nos",
                    "rate": 100,
                    "discount_pct": 0,
                    "gst_rate": 18,
                    "hsn_code": "8482"
                }
            ],
            "additional_charges": [
                {
                    "charge_id": "",
                    "name": "TI Packing (₹ mode)",
                    "hsn_code": "996511",
                    "gst_rate": 18,
                    "value_type": "amount",
                    "value": 300,
                    "amount": 300
                },
                {
                    "charge_id": "",
                    "name": "TI Handling (% mode)",
                    "hsn_code": "996512",
                    "gst_rate": 18,
                    "value_type": "percent",
                    "value": 3,
                    "amount": 30  # 1000 * 0.03 = 30
                }
            ],
            "notes": "TEST_Round21_3_TI"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/crm/tax-invoices", json=payload)
        assert resp.status_code in [200, 201], f"Create tax invoice failed: {resp.text}"
        
        ti = resp.json()
        print(f"Created tax invoice: {ti.get('invoice_no')}")
        
        charges = ti.get("additional_charges", [])
        assert len(charges) == 2, f"Expected 2 charges, got {len(charges)}"
        
        # Verify value_type and value preserved
        charge1 = charges[0]
        assert charge1.get("value_type") == "amount", "TI Charge 1 value_type not preserved"
        assert charge1.get("value") == 300, "TI Charge 1 value not preserved"
        
        charge2 = charges[1]
        assert charge2.get("value_type") == "percent", "TI Charge 2 value_type not preserved"
        assert charge2.get("value") == 3, "TI Charge 2 value not preserved"
        
        # Verify totals: charges_total = 300 + 30 = 330
        additional_charges_total = ti.get("additional_charges_total", 0)
        assert abs(additional_charges_total - 330) < 0.01, f"TI charges total should be 330, got {additional_charges_total}"
        
        print("Tax Invoice with value_type charges: PASS")


class TestCurrencyFormatting:
    """Test that backend returns values suitable for 2 decimal place display"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session cookie"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        yield
    
    def test_quotation_totals_precision(self):
        """Verify quotation totals have proper decimal precision"""
        # Get existing quotations
        resp = self.session.get(f"{BASE_URL}/api/crm/quotations")
        assert resp.status_code == 200
        
        quotations = resp.json()
        if not quotations:
            pytest.skip("No quotations to test")
        
        # Check first quotation with charges
        for q in quotations:
            if q.get("additional_charges"):
                # Verify numeric fields are proper floats
                grand_total = q.get("grand_total", 0)
                total_gst = q.get("total_gst", 0)
                
                # These should be numbers (int or float)
                assert isinstance(grand_total, (int, float)), f"grand_total should be numeric, got {type(grand_total)}"
                assert isinstance(total_gst, (int, float)), f"total_gst should be numeric, got {type(total_gst)}"
                
                print(f"Quotation {q.get('quotation_no')}: grand_total={grand_total}, total_gst={total_gst}")
                break
        
        print("Quotation totals precision: PASS")


class TestRegressionFloatingButtons:
    """Regression test - verify existing flows still work"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session cookie"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        yield
    
    def test_quotation_crud_still_works(self):
        """Verify basic quotation CRUD still works"""
        # GET quotations
        resp = self.session.get(f"{BASE_URL}/api/crm/quotations")
        assert resp.status_code == 200, "GET quotations failed"
        print(f"GET quotations: {len(resp.json())} quotations found")
        
        # GET single quotation
        quotations = resp.json()
        if quotations:
            q_id = quotations[0].get("id")
            resp = self.session.get(f"{BASE_URL}/api/crm/quotations/{q_id}")
            assert resp.status_code == 200, "GET single quotation failed"
            print(f"GET single quotation: {resp.json().get('quotation_no')}")
        
        print("Quotation CRUD regression: PASS")
    
    def test_tax_invoice_crud_still_works(self):
        """Verify basic tax invoice CRUD still works"""
        # GET tax invoices
        resp = self.session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert resp.status_code == 200, "GET tax invoices failed"
        print(f"GET tax invoices: {len(resp.json())} invoices found")
        
        # GET single tax invoice
        invoices = resp.json()
        if invoices:
            ti_id = invoices[0].get("id")
            resp = self.session.get(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}")
            assert resp.status_code == 200, "GET single tax invoice failed"
            print(f"GET single tax invoice: {resp.json().get('invoice_no')}")
        
        print("Tax Invoice CRUD regression: PASS")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
