"""
Iteration 78 Backend Tests - Stock Fields Endpoint & Inventory Limit
Tests:
1. PUT /api/inventory/items/{id}/stock-fields - whitelist update, tx log, permissions
2. GET /api/inventory - limit raised to 50000 (should return all 558+ items)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestStockFieldsEndpoint:
    """Tests for PUT /api/inventory/items/{id}/stock-fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin and get a test item"""
        self.session = requests.Session()
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        # Get inventory items to pick one for testing
        inv_resp = self.session.get(f"{BASE_URL}/api/inventory")
        assert inv_resp.status_code == 200, f"Failed to get inventory: {inv_resp.text}"
        items = inv_resp.json()
        assert len(items) > 0, "No inventory items found"
        
        # Pick an item that's NOT RM-001 (already mutated per agent context)
        self.test_item = None
        for item in items:
            if item.get('part_number') != 'RM-001':
                self.test_item = item
                break
        
        if not self.test_item:
            self.test_item = items[0]
        
        self.test_item_id = self.test_item['id']
        # Store original values for cleanup
        self.original_values = {
            'safety_stock': self.test_item.get('safety_stock', 0),
            'reorder_point': self.test_item.get('reorder_point', 0),
            'lead_time_days': self.test_item.get('lead_time_days', 0),
            'unit_cost': self.test_item.get('unit_cost', 0),
            'current_stock': self.test_item.get('current_stock', 0),
        }
        yield
        # Cleanup: restore original values
        try:
            self.session.put(f"{BASE_URL}/api/inventory/items/{self.test_item_id}/stock-fields", json=self.original_values)
        except Exception:
            pass
    
    def test_update_stock_fields_decimal_values(self):
        """Test (a): PUT with decimal values for safety_stock, reorder_point, lead_time_days, unit_cost"""
        payload = {
            "safety_stock": 10.5,
            "reorder_point": 20,
            "lead_time_days": 7,
            "unit_cost": 125.50
        }
        
        resp = self.session.put(f"{BASE_URL}/api/inventory/items/{self.test_item_id}/stock-fields", json=payload)
        assert resp.status_code == 200, f"Failed to update stock fields: {resp.text}"
        
        data = resp.json()
        # Verify response contains updated values
        assert data.get('safety_stock') == 10.5, f"safety_stock mismatch: expected 10.5, got {data.get('safety_stock')}"
        assert data.get('reorder_point') == 20, f"reorder_point mismatch: expected 20, got {data.get('reorder_point')}"
        assert data.get('lead_time_days') == 7, f"lead_time_days mismatch: expected 7, got {data.get('lead_time_days')}"
        assert data.get('unit_cost') == 125.5, f"unit_cost mismatch: expected 125.5, got {data.get('unit_cost')}"
        
        # Verify persistence via GET
        get_resp = self.session.get(f"{BASE_URL}/api/items/{self.test_item_id}")
        assert get_resp.status_code == 200
        item = get_resp.json()
        assert item.get('safety_stock') == 10.5
        assert item.get('unit_cost') == 125.5
        print("TEST PASSED: Decimal values saved correctly")
    
    def test_update_current_stock_creates_transaction(self):
        """Test (b): PUT with current_stock creates inventory_transaction with type='adjust', reference_type='stock_edit'"""
        # First get current stock
        get_resp = self.session.get(f"{BASE_URL}/api/items/{self.test_item_id}")
        assert get_resp.status_code == 200
        original_stock = get_resp.json().get('current_stock', 0)
        
        new_stock = 50
        payload = {"current_stock": new_stock}
        
        resp = self.session.put(f"{BASE_URL}/api/inventory/items/{self.test_item_id}/stock-fields", json=payload)
        assert resp.status_code == 200, f"Failed to update current_stock: {resp.text}"
        
        data = resp.json()
        assert data.get('current_stock') == new_stock, f"current_stock mismatch: expected {new_stock}, got {data.get('current_stock')}"
        
        # Check that an inventory_transaction was created
        tx_resp = self.session.get(f"{BASE_URL}/api/inventory/transactions?item_id={self.test_item_id}&limit=5")
        assert tx_resp.status_code == 200, f"Failed to get transactions: {tx_resp.text}"
        
        transactions = tx_resp.json()
        assert len(transactions) > 0, "No transactions found after stock update"
        
        # Find the stock_edit transaction
        stock_edit_tx = None
        for tx in transactions:
            if tx.get('reference_type') == 'stock_edit' and tx.get('transaction_type') == 'adjust':
                stock_edit_tx = tx
                break
        
        assert stock_edit_tx is not None, "No stock_edit transaction found"
        assert stock_edit_tx.get('new_stock') == new_stock, f"Transaction new_stock mismatch"
        print(f"TEST PASSED: inventory_transaction created with type='adjust', reference_type='stock_edit'")
    
    def test_whitelist_blocks_non_stock_fields(self):
        """Test (c): PUT with non-whitelisted field (name) should NOT change the name"""
        # Get original name
        get_resp = self.session.get(f"{BASE_URL}/api/items/{self.test_item_id}")
        assert get_resp.status_code == 200
        original_name = get_resp.json().get('name')
        
        payload = {
            "name": "HACK_ATTEMPT",
            "safety_stock": 5  # Include a valid field so request doesn't fail
        }
        
        resp = self.session.put(f"{BASE_URL}/api/inventory/items/{self.test_item_id}/stock-fields", json=payload)
        assert resp.status_code == 200, f"Request failed: {resp.text}"
        
        data = resp.json()
        # Name should NOT have changed
        assert data.get('name') == original_name, f"Name was changed! Expected '{original_name}', got '{data.get('name')}'"
        print("TEST PASSED: Non-whitelisted field 'name' was NOT changed")
    
    def test_empty_payload_returns_400(self):
        """Test (d): PUT with empty body {} should return 400 'No valid stock fields'"""
        resp = self.session.put(f"{BASE_URL}/api/inventory/items/{self.test_item_id}/stock-fields", json={})
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "No valid stock fields" in data.get('detail', ''), f"Unexpected error message: {data}"
        print("TEST PASSED: Empty payload returns 400 with correct message")
    
    def test_bad_item_id_returns_404(self):
        """Test (e): PUT with non-existent item_id should return 404"""
        fake_id = "non-existent-item-id-12345"
        resp = self.session.put(f"{BASE_URL}/api/inventory/items/{fake_id}/stock-fields", json={"safety_stock": 10})
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print("TEST PASSED: Bad item_id returns 404")


class TestInventoryLimit:
    """Test that GET /api/inventory returns all items (limit raised to 50000)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    def test_inventory_returns_all_items(self):
        """GET /api/inventory should return all 558+ items (was capped at 1000, now 50000)"""
        resp = self.session.get(f"{BASE_URL}/api/inventory")
        assert resp.status_code == 200, f"Failed to get inventory: {resp.text}"
        
        items = resp.json()
        item_count = len(items)
        
        # Per agent context, there are 558 seed items
        # The endpoint should return ALL of them (not capped at 1000)
        print(f"Inventory returned {item_count} items")
        
        # Verify we get a substantial number (at least 500 based on seed data)
        assert item_count >= 500, f"Expected at least 500 items, got {item_count}. Limit may still be capped."
        
        # Also verify items have expected structure
        if items:
            sample = items[0]
            assert 'id' in sample, "Item missing 'id' field"
            assert 'part_number' in sample, "Item missing 'part_number' field"
            assert 'name' in sample, "Item missing 'name' field"
        
        print(f"TEST PASSED: Inventory endpoint returned {item_count} items (limit working correctly)")


class TestItemsEndpointLimit:
    """Test that GET /api/items also returns all items (same 50000 limit)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
    
    def test_items_returns_all(self):
        """GET /api/items should also return all items"""
        resp = self.session.get(f"{BASE_URL}/api/items")
        assert resp.status_code == 200
        
        items = resp.json()
        item_count = len(items)
        print(f"Items endpoint returned {item_count} items")
        
        assert item_count >= 500, f"Expected at least 500 items from /api/items, got {item_count}"
        print(f"TEST PASSED: Items endpoint returned {item_count} items")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
