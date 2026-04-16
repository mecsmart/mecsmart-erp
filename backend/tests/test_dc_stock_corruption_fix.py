"""
Test for CRITICAL stock corruption bug fix in DC creation endpoint POST /api/job-work/challans

BUG DESCRIPTION:
The variable 'current_stock' was NOT re-read for each item in the deduction loop — 
it retained the value from the last item in the stock-check loop. This caused Item A's 
stock to be set to (Item B's stock - Item A's quantity), massively corrupting stock values.

Example: PT-1 (stock: 0) and RM-2 (stock: 2500). First-pass ends with current_stock=2500. 
Second-pass deducts: PT-1 new_stock = 2500 - 4 = 2496 (WRONG! should be 0 - 4 = -4 or blocked).

FIX: Now reads item.get('current_stock', 0) from the fresh item document in the deduction loop.
"""

import pytest
import requests
import uuid
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestDCStockCorruptionFix:
    """Tests for the critical stock corruption bug fix in DC creation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        self.test_suffix = str(uuid.uuid4())[:8]
        yield
    
    def test_login_works(self):
        """Verify login works with admin credentials"""
        resp = self.session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("email") == "admin@erp.com"
        print("Login verified: admin@erp.com")
    
    def test_dc_creation_stock_deduction_per_item(self):
        """
        CRITICAL TEST: Each item's stock should be deducted from ITS OWN current_stock,
        not from another item's value.
        
        Setup:
        - Item A (PT-1): stock = 10
        - Item B (RM-2): stock = 200
        
        Create DC with both items (qty 5 each):
        - Item A new stock should be: 10 - 5 = 5 (NOT 200 - 5 = 195)
        - Item B new stock should be: 200 - 5 = 195
        """
        # Create two items with DIFFERENT stock levels
        item_a_pn = f"TEST-PT-{self.test_suffix}"
        item_b_pn = f"TEST-RM-{self.test_suffix}"
        
        # Item A: Low stock (10)
        item_a_resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": item_a_pn,
            "name": f"Test Part A {self.test_suffix}",
            "item_type": "part",
            "category": "component",
            "current_stock": 10,
            "unit": "pcs"
        })
        assert item_a_resp.status_code in [200, 201], f"Failed to create item A: {item_a_resp.text}"
        item_a = item_a_resp.json()
        item_a_id = item_a["id"]
        print(f"Created Item A: {item_a_pn} with stock=10")
        
        # Item B: High stock (200)
        item_b_resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": item_b_pn,
            "name": f"Test Raw Material B {self.test_suffix}",
            "item_type": "raw_material",
            "category": "raw_material",
            "current_stock": 200,
            "unit": "pcs"
        })
        assert item_b_resp.status_code in [200, 201], f"Failed to create item B: {item_b_resp.text}"
        item_b = item_b_resp.json()
        item_b_id = item_b["id"]
        print(f"Created Item B: {item_b_pn} with stock=200")
        
        # Create supplier
        supplier_resp = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "name": f"Test Supplier {self.test_suffix}",
            "code": f"SUP-{self.test_suffix}",
            "contact_person": "Test Contact",
            "email": f"supplier-{self.test_suffix}@test.com",
            "phone": "1234567890"
        })
        assert supplier_resp.status_code in [200, 201], f"Failed to create supplier: {supplier_resp.text}"
        supplier = supplier_resp.json()
        supplier_id = supplier["id"]
        print(f"Created Supplier: {supplier['name']}")
        
        # Create SC order with both items
        sc_resp = self.session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": supplier_id,
            "sc_type": "without_material",
            "lines": [
                {"item_id": item_a_id, "quantity": 10, "rate": 100},
                {"item_id": item_b_id, "quantity": 50, "rate": 50}
            ],
            "notes": f"Test SC for stock corruption fix {self.test_suffix}"
        })
        assert sc_resp.status_code in [200, 201], f"Failed to create SC: {sc_resp.text}"
        sc_order = sc_resp.json()
        sc_order_id = sc_order["id"]
        print(f"Created SC Order: {sc_order.get('order_number')}")
        
        # Confirm the SC order (required before creating DC)
        confirm_resp = self.session.post(f"{BASE_URL}/api/job-work/orders/{sc_order_id}/confirm")
        assert confirm_resp.status_code in [200, 201], f"Failed to confirm SC: {confirm_resp.text}"
        print(f"Confirmed SC Order: {sc_order.get('order_number')}")
        
        # Create DC with both items (qty 5 each)
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [
                {"item_id": item_a_id, "quantity": 5, "rate": 100},
                {"item_id": item_b_id, "quantity": 5, "rate": 50}
            ],
            "notes": f"Test DC for stock corruption fix {self.test_suffix}"
        })
        assert dc_resp.status_code in [200, 201], f"Failed to create DC: {dc_resp.text}"
        dc_data = dc_resp.json()
        
        # Check if DC was created successfully
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data.get('message')}")
        
        print(f"Created DC: {dc_data.get('dc_number')}")
        
        # Verify Item A stock: should be 10 - 5 = 5 (NOT 200 - 5 = 195)
        item_a_after = self.session.get(f"{BASE_URL}/api/items/{item_a_id}").json()
        item_a_new_stock = item_a_after.get("current_stock", 0)
        print(f"Item A stock after DC: {item_a_new_stock} (expected: 5)")
        
        # Verify Item B stock: should be 200 - 5 = 195
        item_b_after = self.session.get(f"{BASE_URL}/api/items/{item_b_id}").json()
        item_b_new_stock = item_b_after.get("current_stock", 0)
        print(f"Item B stock after DC: {item_b_new_stock} (expected: 195)")
        
        # CRITICAL ASSERTIONS
        assert item_a_new_stock == 5, f"STOCK CORRUPTION BUG! Item A stock should be 5, got {item_a_new_stock}"
        assert item_b_new_stock == 195, f"Item B stock should be 195, got {item_b_new_stock}"
        
        print("SUCCESS: Each item's stock was deducted from its own value, not cross-contaminated!")
    
    def test_inventory_transactions_show_correct_previous_stock(self):
        """
        Verify inventory transactions show correct previous_stock and new_stock for each item.
        This catches the bug where previous_stock would show the wrong item's stock.
        """
        # Create two items with VERY different stock levels
        item_a_pn = f"TEST-TX-A-{self.test_suffix}"
        item_b_pn = f"TEST-TX-B-{self.test_suffix}"
        
        # Item A: stock = 15
        item_a_resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": item_a_pn,
            "name": f"Test TX Item A {self.test_suffix}",
            "item_type": "part",
            "category": "component",
            "current_stock": 15,
            "unit": "pcs"
        })
        assert item_a_resp.status_code in [200, 201]
        item_a = item_a_resp.json()
        item_a_id = item_a["id"]
        
        # Item B: stock = 500
        item_b_resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": item_b_pn,
            "name": f"Test TX Item B {self.test_suffix}",
            "item_type": "raw_material",
            "category": "raw_material",
            "current_stock": 500,
            "unit": "pcs"
        })
        assert item_b_resp.status_code in [200, 201]
        item_b = item_b_resp.json()
        item_b_id = item_b["id"]
        
        # Create supplier
        supplier_resp = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "name": f"Test TX Supplier {self.test_suffix}",
            "code": f"SUPTX-{self.test_suffix}",
            "contact_person": "Test Contact",
            "email": f"supplier-tx-{self.test_suffix}@test.com",
            "phone": "1234567890"
        })
        assert supplier_resp.status_code in [200, 201]
        supplier = supplier_resp.json()
        supplier_id = supplier["id"]
        
        # Create SC order
        sc_resp = self.session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": supplier_id,
            "sc_type": "without_material",
            "lines": [
                {"item_id": item_a_id, "quantity": 20, "rate": 100},
                {"item_id": item_b_id, "quantity": 100, "rate": 50}
            ]
        })
        assert sc_resp.status_code in [200, 201]
        sc_order = sc_resp.json()
        sc_order_id = sc_order["id"]
        
        # Confirm the SC order
        confirm_resp = self.session.post(f"{BASE_URL}/api/job-work/orders/{sc_order_id}/confirm")
        assert confirm_resp.status_code in [200, 201]
        
        # Create DC with qty 3 for item A, qty 10 for item B
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [
                {"item_id": item_a_id, "quantity": 3, "rate": 100},
                {"item_id": item_b_id, "quantity": 10, "rate": 50}
            ]
        })
        assert dc_resp.status_code in [200, 201]
        dc_data = dc_resp.json()
        
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data.get('message')}")
        
        dc_number = dc_data.get("dc_number")
        print(f"Created DC: {dc_number}")
        
        # Get inventory transactions for this DC
        tx_resp = self.session.get(f"{BASE_URL}/api/inventory/transactions")
        assert tx_resp.status_code in [200, 201]
        all_transactions = tx_resp.json()
        
        # Filter transactions for this DC
        dc_transactions = [tx for tx in all_transactions if tx.get("reference_id") == dc_number]
        
        # Find transactions for each item
        tx_a = next((tx for tx in dc_transactions if tx.get("item_id") == item_a_id), None)
        tx_b = next((tx for tx in dc_transactions if tx.get("item_id") == item_b_id), None)
        
        assert tx_a is not None, "Transaction for Item A not found"
        assert tx_b is not None, "Transaction for Item B not found"
        
        # Verify Item A transaction: previous_stock=15, new_stock=12
        print(f"Item A transaction: previous_stock={tx_a.get('previous_stock')}, new_stock={tx_a.get('new_stock')}")
        assert tx_a.get("previous_stock") == 15, f"Item A previous_stock should be 15, got {tx_a.get('previous_stock')}"
        assert tx_a.get("new_stock") == 12, f"Item A new_stock should be 12, got {tx_a.get('new_stock')}"
        
        # Verify Item B transaction: previous_stock=500, new_stock=490
        print(f"Item B transaction: previous_stock={tx_b.get('previous_stock')}, new_stock={tx_b.get('new_stock')}")
        assert tx_b.get("previous_stock") == 500, f"Item B previous_stock should be 500, got {tx_b.get('previous_stock')}"
        assert tx_b.get("new_stock") == 490, f"Item B new_stock should be 490, got {tx_b.get('new_stock')}"
        
        print("SUCCESS: Inventory transactions show correct previous_stock and new_stock for each item!")
    
    def test_insufficient_stock_check_still_works(self):
        """
        Regression test: Insufficient stock check should still block DC creation
        if ANY item has insufficient stock.
        """
        # Create item with low stock
        item_pn = f"TEST-LOW-{self.test_suffix}"
        item_resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": item_pn,
            "name": f"Test Low Stock Item {self.test_suffix}",
            "item_type": "part",
            "category": "component",
            "current_stock": 2,  # Only 2 in stock
            "unit": "pcs"
        })
        assert item_resp.status_code in [200, 201]
        item = item_resp.json()
        item_id = item["id"]
        
        # Create supplier
        supplier_resp = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "name": f"Test Low Supplier {self.test_suffix}",
            "code": f"SUPLOW-{self.test_suffix}",
            "contact_person": "Test Contact",
            "email": f"supplier-low-{self.test_suffix}@test.com",
            "phone": "1234567890"
        })
        assert supplier_resp.status_code in [200, 201]
        supplier = supplier_resp.json()
        supplier_id = supplier["id"]
        
        # Create SC order
        sc_resp = self.session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": supplier_id,
            "sc_type": "without_material",
            "lines": [
                {"item_id": item_id, "quantity": 10, "rate": 100}
            ]
        })
        assert sc_resp.status_code in [200, 201]
        sc_order = sc_resp.json()
        sc_order_id = sc_order["id"]
        
        # Confirm the SC order
        confirm_resp = self.session.post(f"{BASE_URL}/api/job-work/orders/{sc_order_id}/confirm")
        assert confirm_resp.status_code in [200, 201]
        
        # Try to create DC with qty 5 (more than available stock of 2)
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [
                {"item_id": item_id, "quantity": 5, "rate": 100}  # Requesting 5, only 2 available
            ]
        })
        assert dc_resp.status_code in [200, 201]
        dc_data = dc_resp.json()
        
        # Should fail with insufficient stock message
        assert dc_data.get("success") == False, "DC should have been blocked due to insufficient stock"
        assert "insufficient" in dc_data.get("message", "").lower(), f"Expected insufficient stock message, got: {dc_data.get('message')}"
        
        # Verify insufficient_materials contains the item
        insufficient = dc_data.get("insufficient_materials", [])
        assert len(insufficient) > 0, "Should have insufficient_materials list"
        assert insufficient[0].get("available") == 2, f"Available should be 2, got {insufficient[0].get('available')}"
        assert insufficient[0].get("required") == 5, f"Required should be 5, got {insufficient[0].get('required')}"
        
        print("SUCCESS: Insufficient stock check correctly blocks DC creation!")
    
    def test_multiple_items_mixed_stock_levels(self):
        """
        Test with 3+ items with very different stock levels to ensure no cross-contamination.
        """
        items = []
        stock_levels = [5, 100, 1000]  # Very different stock levels
        
        # Create 3 items with different stock levels
        for i, stock in enumerate(stock_levels):
            item_pn = f"TEST-MULTI-{i}-{self.test_suffix}"
            item_resp = self.session.post(f"{BASE_URL}/api/items", json={
                "part_number": item_pn,
                "name": f"Test Multi Item {i} {self.test_suffix}",
                "item_type": "part",
                "category": "component",
                "current_stock": stock,
                "unit": "pcs"
            })
            assert item_resp.status_code in [200, 201]
            item = item_resp.json()
            items.append({"id": item["id"], "initial_stock": stock, "part_number": item_pn})
            print(f"Created Item {i}: {item_pn} with stock={stock}")
        
        # Create supplier
        supplier_resp = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "name": f"Test Multi Supplier {self.test_suffix}",
            "code": f"SUPMULTI-{self.test_suffix}",
            "contact_person": "Test Contact",
            "email": f"supplier-multi-{self.test_suffix}@test.com",
            "phone": "1234567890"
        })
        assert supplier_resp.status_code in [200, 201]
        supplier = supplier_resp.json()
        supplier_id = supplier["id"]
        
        # Create SC order with all items
        sc_lines = [{"item_id": item["id"], "quantity": 50, "rate": 100} for item in items]
        sc_resp = self.session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": supplier_id,
            "sc_type": "without_material",
            "lines": sc_lines
        })
        assert sc_resp.status_code in [200, 201]
        sc_order = sc_resp.json()
        sc_order_id = sc_order["id"]
        
        # Confirm the SC order
        confirm_resp = self.session.post(f"{BASE_URL}/api/job-work/orders/{sc_order_id}/confirm")
        assert confirm_resp.status_code in [200, 201]
        
        # Create DC with qty 2 for each item
        dc_lines = [{"item_id": item["id"], "quantity": 2, "rate": 100} for item in items]
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": dc_lines
        })
        assert dc_resp.status_code in [200, 201]
        dc_data = dc_resp.json()
        
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data.get('message')}")
        
        print(f"Created DC: {dc_data.get('dc_number')}")
        
        # Verify each item's stock was deducted correctly
        for i, item in enumerate(items):
            item_after = self.session.get(f"{BASE_URL}/api/items/{item['id']}").json()
            new_stock = item_after.get("current_stock", 0)
            expected_stock = item["initial_stock"] - 2
            
            print(f"Item {i} ({item['part_number']}): initial={item['initial_stock']}, after={new_stock}, expected={expected_stock}")
            
            assert new_stock == expected_stock, \
                f"STOCK CORRUPTION! Item {i} stock should be {expected_stock}, got {new_stock}"
        
        print("SUCCESS: All 3 items have correct stock after DC creation - no cross-contamination!")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
