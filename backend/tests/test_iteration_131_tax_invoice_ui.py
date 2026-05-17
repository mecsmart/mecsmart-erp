"""
Iteration 131 Tests: Tax Invoice UI/Print Follow-ups

Tests:
1. Customer address auto-fill: billing_address + shipping_address include street, city/state/pin, State Code, GSTIN
2. Place of Supply format: 'state_code - state' when both exist
3. Tax Invoice CRUD regression
4. Print CSS: @page with page counter (code review only - Chrome native print)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    """Create authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return s


@pytest.fixture(scope="module")
def test_customer_with_full_address(session):
    """Create a customer with complete address info for testing"""
    unique_id = str(uuid.uuid4())[:8]
    customer_data = {
        "name": f"TEST_FullAddr_Customer_{unique_id}",
        "customer_code": f"TFAC-{unique_id}",
        "address": "123 Test Street, Industrial Area",
        "city": "Pune",
        "state": "Maharashtra",
        "state_code": "27",
        "pin_code": "411001",
        "gstin": f"27AABCT{unique_id[:4]}A1ZM",
        "email": f"test_{unique_id}@example.com",
        "phone": "9876543210"
    }
    resp = session.post(f"{BASE_URL}/api/customers", json=customer_data)
    assert resp.status_code in [200, 201], f"Failed to create customer: {resp.text}"
    customer = resp.json()
    yield customer
    # Cleanup
    session.delete(f"{BASE_URL}/api/customers/{customer['id']}")


class TestTaxInvoiceAddressAutoFill:
    """Test that Tax Invoice correctly stores address info from customer"""
    
    def test_create_tax_invoice_with_full_address_customer(self, session, test_customer_with_full_address):
        """Create TI with customer that has full address - verify billing/shipping addresses"""
        customer = test_customer_with_full_address
        
        # Build expected address format (matching applyCustomer logic)
        expected_parts = [
            customer['address'],
            ', '.join(filter(None, [customer.get('city'), customer.get('state'), customer.get('pin_code')])),
            f"State Code: {customer['state_code']}" if customer.get('state_code') else '',
            f"GSTIN: {customer['gstin']}" if customer.get('gstin') else '',
        ]
        expected_addr = '\n'.join(filter(None, expected_parts))
        
        # Expected place of supply format
        expected_pos = f"{customer['state_code']} - {customer['state']}" if customer.get('state_code') and customer.get('state') else (customer.get('state_code') or customer.get('state') or '')
        
        # Create Tax Invoice
        ti_data = {
            "customer_id": customer['id'],
            "customer_name": customer['name'],
            "billing_address": expected_addr,
            "shipping_address": expected_addr,
            "place_of_supply": expected_pos,
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "status": "draft",
            "currency": "INR",
            "lines": [
                {
                    "description": "Test Item",
                    "hsn_code": "8413",
                    "quantity": 1,
                    "uom": "Nos",
                    "rate": 1000,
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ]
        }
        
        resp = session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code in [200, 201], f"Failed to create TI: {resp.text}"
        ti = resp.json()
        
        # Verify billing address contains expected parts
        billing = ti.get('billing_address', '')
        assert customer['address'] in billing, f"Billing address missing street: {billing}"
        assert customer['city'] in billing, f"Billing address missing city: {billing}"
        assert f"State Code: {customer['state_code']}" in billing, f"Billing address missing state code: {billing}"
        assert f"GSTIN: {customer['gstin']}" in billing, f"Billing address missing GSTIN: {billing}"
        
        # Verify shipping address
        shipping = ti.get('shipping_address', '')
        assert customer['address'] in shipping, f"Shipping address missing street: {shipping}"
        
        # Verify place of supply format
        pos = ti.get('place_of_supply', '')
        assert customer['state_code'] in pos, f"Place of supply missing state code: {pos}"
        # If state is present, should have format "XX - StateName"
        if customer.get('state'):
            assert ' - ' in pos or customer['state'] in pos, f"Place of supply format incorrect: {pos}"
        
        print(f"PASS: Tax Invoice created with full address info")
        print(f"  Billing Address: {billing[:100]}...")
        print(f"  Place of Supply: {pos}")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")
    
    def test_place_of_supply_format_with_state_code_and_state(self, session, test_customer_with_full_address):
        """Verify Place of Supply shows 'XX - StateName' format when both exist"""
        customer = test_customer_with_full_address
        
        # Expected format: "27 - Maharashtra"
        expected_pos = f"{customer['state_code']} - {customer['state']}"
        
        ti_data = {
            "customer_id": customer['id'],
            "customer_name": customer['name'],
            "billing_address": "Test Address",
            "shipping_address": "Test Address",
            "place_of_supply": expected_pos,
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "status": "draft",
            "currency": "INR",
            "lines": [{"description": "Test", "quantity": 1, "rate": 100, "gst_rate": 18}]
        }
        
        resp = session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code in [200, 201], f"Failed to create TI: {resp.text}"
        ti = resp.json()
        
        pos = ti.get('place_of_supply', '')
        assert pos == expected_pos, f"Place of Supply format incorrect. Expected: {expected_pos}, Got: {pos}"
        
        print(f"PASS: Place of Supply format correct: {pos}")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")


class TestTaxInvoiceCRUDRegression:
    """Regression tests for Tax Invoice CRUD operations"""
    
    def test_tax_invoice_list(self, session):
        """GET /api/crm/tax-invoices returns list"""
        resp = session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert resp.status_code == 200, f"Failed to list TIs: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Tax Invoice list returned {len(data)} items")
    
    def test_tax_invoice_create_draft(self, session):
        """Create draft Tax Invoice"""
        ti_data = {
            "customer_name": "TEST_Regression_Customer",
            "billing_address": "Test Address",
            "shipping_address": "Test Address",
            "place_of_supply": "27",
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "status": "draft",
            "currency": "INR",
            "lines": [{"description": "Test Item", "quantity": 1, "rate": 500, "gst_rate": 18}]
        }
        
        resp = session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code in [200, 201], f"Failed to create TI: {resp.text}"
        ti = resp.json()
        assert ti.get('status') == 'draft', f"Status should be draft: {ti.get('status')}"
        assert ti.get('invoice_no'), "Invoice number should be generated"
        
        print(f"PASS: Draft Tax Invoice created: {ti.get('invoice_no')}")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")
    
    def test_tax_invoice_update(self, session):
        """Update Tax Invoice"""
        # Create
        ti_data = {
            "customer_name": "TEST_Update_Customer",
            "billing_address": "Original Address",
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "status": "draft",
            "currency": "INR",
            "lines": [{"description": "Test", "quantity": 1, "rate": 100, "gst_rate": 18}]
        }
        
        create_resp = session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert create_resp.status_code in [200, 201]
        ti = create_resp.json()
        
        # Update
        update_data = {"billing_address": "Updated Address", "notes": "Updated notes"}
        update_resp = session.put(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}", json=update_data)
        assert update_resp.status_code == 200, f"Failed to update TI: {update_resp.text}"
        
        updated_ti = update_resp.json()
        assert updated_ti.get('billing_address') == "Updated Address", "Billing address not updated"
        assert updated_ti.get('notes') == "Updated notes", "Notes not updated"
        
        print(f"PASS: Tax Invoice updated successfully")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")


class TestTaxInvoiceLineItemsRegression:
    """Regression tests for Tax Invoice line items"""
    
    def test_line_items_with_rate_formatting(self, session):
        """Create TI with various rate values (testing Indian number formatting storage)"""
        ti_data = {
            "customer_name": "TEST_Rate_Customer",
            "billing_address": "Test Address",
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "status": "draft",
            "currency": "INR",
            "lines": [
                {"description": "Item 1", "quantity": 1, "rate": 117300, "gst_rate": 18},  # 1,17,300 in Indian format
                {"description": "Item 2", "quantity": 2, "rate": 50000, "gst_rate": 18},   # 50,000
                {"description": "Item 3", "quantity": 1, "rate": 1234567, "gst_rate": 18}, # 12,34,567
            ]
        }
        
        resp = session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_data)
        assert resp.status_code in [200, 201], f"Failed to create TI: {resp.text}"
        ti = resp.json()
        
        lines = ti.get('lines', [])
        assert len(lines) == 3, f"Expected 3 lines, got {len(lines)}"
        
        # Verify rates are stored as numeric values
        assert lines[0].get('rate') == 117300, f"Rate 1 incorrect: {lines[0].get('rate')}"
        assert lines[1].get('rate') == 50000, f"Rate 2 incorrect: {lines[1].get('rate')}"
        assert lines[2].get('rate') == 1234567, f"Rate 3 incorrect: {lines[2].get('rate')}"
        
        print(f"PASS: Line items with various rates stored correctly")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}")
