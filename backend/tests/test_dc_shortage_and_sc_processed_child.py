"""
Test file for Bug 1: DC creation material shortage popup shows ALL items

Bug 1: DC creation should show ALL shortage items (not just first one) when stock is insufficient
Response format: {success: false, message, insufficient_materials: [{item, name, required, available, shortage}]}
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestDCShortageAllItems:
    """Bug 1: Test that DC creation returns ALL insufficient items, not just the first one"""
    
    def test_dc_creation_returns_all_insufficient_items(self, api_client, auth_token):
        """
        Create SC order with multiple items that have insufficient stock.
        POST /api/job-work/challans should return ALL items with shortage, not just first.
        """
        suffix = str(uuid.uuid4())[:8]
        api = api_client
        api.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        # Step 1: Create multiple items with ZERO stock
        items = []
        for i in range(3):
            item_data = {
                "part_number": f"TEST-SHORT-{i}-{suffix}",
                "name": f"Test Shortage Item {i}",
                "category": "raw_material",
                "unit_of_measure": "PCS",
                "current_stock": 0  # Zero stock
            }
            resp = api.post(f"{BASE_URL}/api/items", json=item_data)
            assert resp.status_code == 201, f"Failed to create item {i}: {resp.text}"
            items.append(resp.json())
        
        # Step 2: Create a supplier
        supplier_data = {
            "code": f"SUP-SHORT-{suffix}",
            "name": f"Test Shortage Supplier {suffix}",
            "contact_person": "Test",
            "email": f"test-{suffix}@test.com",
            "phone": "1234567890"
        }
        resp = api.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert resp.status_code == 201, f"Failed to create supplier: {resp.text}"
        supplier = resp.json()
        
        # Step 3: Create SC order with all 3 items
        sc_lines = [
            {"item_id": items[0]["id"], "quantity": 10, "rate": 100},
            {"item_id": items[1]["id"], "quantity": 20, "rate": 200},
            {"item_id": items[2]["id"], "quantity": 30, "rate": 300}
        ]
        sc_data = {
            "supplier_id": supplier["id"],
            "subcontract_type": "with_material",
            "lines": sc_lines,
            "job_work_parts": []
        }
        resp = api.post(f"{BASE_URL}/api/job-work/orders", json=sc_data)
        assert resp.status_code == 201, f"Failed to create SC order: {resp.text}"
        sc_order = resp.json()
        
        # Step 3.5: Confirm the SC order (required before creating DC)
        resp = api.put(f"{BASE_URL}/api/job-work/orders/{sc_order['id']}", json={"status": "confirmed"})
        assert resp.status_code == 200, f"Failed to confirm SC order: {resp.text}"
        
        # Step 4: Try to create DC - should fail with ALL 3 items in insufficient_materials
        dc_data = {
            "subcontract_order_id": sc_order["id"],
            "lines": [
                {"item_id": items[0]["id"], "quantity": 10},
                {"item_id": items[1]["id"], "quantity": 20},
                {"item_id": items[2]["id"], "quantity": 30}
            ],
            "warehouse_id": "",
            "notes": ""
        }
        resp = api.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        
        # Should return 200 with success=false and insufficient_materials
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert data.get("success") == False, "Expected success=false for insufficient stock"
        assert "insufficient_materials" in data, "Expected insufficient_materials in response"
        
        insufficient = data["insufficient_materials"]
        assert len(insufficient) == 3, f"Expected 3 insufficient items, got {len(insufficient)}"
        
        # Verify each item has correct fields
        for item in insufficient:
            assert "item" in item, "Missing 'item' (part_number) field"
            assert "name" in item, "Missing 'name' field"
            assert "required" in item, "Missing 'required' field"
            assert "available" in item, "Missing 'available' field"
            assert "shortage" in item, "Missing 'shortage' field"
        
        # Verify specific values
        part_numbers = [i["item"] for i in insufficient]
        assert f"TEST-SHORT-0-{suffix}" in part_numbers, "Missing first item in shortage list"
        assert f"TEST-SHORT-1-{suffix}" in part_numbers, "Missing second item in shortage list"
        assert f"TEST-SHORT-2-{suffix}" in part_numbers, "Missing third item in shortage list"
        
        print(f"✓ Bug 1 VERIFIED: DC creation returns ALL {len(insufficient)} insufficient items")
        
    def test_dc_creation_partial_shortage(self, api_client, auth_token):
        """
        Test when some items have partial stock - should still show all shortages
        """
        suffix = str(uuid.uuid4())[:8]
        api = api_client
        api.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        # Create items with varying stock levels
        items = []
        stock_levels = [5, 0, 15]  # Item 0: partial, Item 1: zero, Item 2: partial
        for i, stock in enumerate(stock_levels):
            item_data = {
                "part_number": f"TEST-PARTIAL-{i}-{suffix}",
                "name": f"Test Partial Item {i}",
                "category": "raw_material",
                "unit_of_measure": "PCS",
                "current_stock": stock
            }
            resp = api.post(f"{BASE_URL}/api/items", json=item_data)
            assert resp.status_code == 201
            items.append(resp.json())
        
        # Create supplier
        supplier_data = {
            "code": f"SUP-PART-{suffix}",
            "name": f"Test Partial Supplier {suffix}",
            "contact_person": "Test",
            "email": f"partial-{suffix}@test.com",
            "phone": "1234567890"
        }
        resp = api.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert resp.status_code == 201
        supplier = resp.json()
        
        # Create SC order
        sc_lines = [
            {"item_id": items[0]["id"], "quantity": 10, "rate": 100},  # Need 10, have 5 -> shortage 5
            {"item_id": items[1]["id"], "quantity": 20, "rate": 200},  # Need 20, have 0 -> shortage 20
            {"item_id": items[2]["id"], "quantity": 30, "rate": 300}   # Need 30, have 15 -> shortage 15
        ]
        sc_data = {
            "supplier_id": supplier["id"],
            "subcontract_type": "with_material",
            "lines": sc_lines,
            "job_work_parts": []
        }
        resp = api.post(f"{BASE_URL}/api/job-work/orders", json=sc_data)
        assert resp.status_code == 201
        sc_order = resp.json()
        
        # Confirm the SC order
        resp = api.put(f"{BASE_URL}/api/job-work/orders/{sc_order['id']}", json={"status": "confirmed"})
        assert resp.status_code == 200
        
        # Try to create DC
        dc_data = {
            "subcontract_order_id": sc_order["id"],
            "lines": [
                {"item_id": items[0]["id"], "quantity": 10},
                {"item_id": items[1]["id"], "quantity": 20},
                {"item_id": items[2]["id"], "quantity": 30}
            ],
            "warehouse_id": "",
            "notes": ""
        }
        resp = api.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") == False
        
        insufficient = data.get("insufficient_materials", [])
        assert len(insufficient) == 3, f"Expected 3 items with shortage, got {len(insufficient)}"
        
        # Verify shortage calculations
        shortage_map = {i["item"]: i for i in insufficient}
        
        item0 = shortage_map.get(f"TEST-PARTIAL-0-{suffix}")
        assert item0 is not None, "Missing item 0 in shortage"
        assert item0["required"] == 10
        assert item0["available"] == 5
        assert item0["shortage"] == 5
        
        item1 = shortage_map.get(f"TEST-PARTIAL-1-{suffix}")
        assert item1 is not None, "Missing item 1 in shortage"
        assert item1["required"] == 20
        assert item1["available"] == 0
        assert item1["shortage"] == 20
        
        item2 = shortage_map.get(f"TEST-PARTIAL-2-{suffix}")
        assert item2 is not None, "Missing item 2 in shortage"
        assert item2["required"] == 30
        assert item2["available"] == 15
        assert item2["shortage"] == 15
        
        print("✓ Bug 1 VERIFIED: Partial shortage correctly calculated for all items")

    def test_dc_creation_success_when_stock_sufficient(self, api_client, auth_token):
        """
        Regression test: DC creation should succeed when stock is sufficient
        """
        suffix = str(uuid.uuid4())[:8]
        api = api_client
        api.headers.update({"Authorization": f"Bearer {auth_token}"})
        
        # Create item with sufficient stock
        item_data = {
            "part_number": f"TEST-SUFFICIENT-{suffix}",
            "name": f"Test Sufficient Item",
            "category": "raw_material",
            "unit_of_measure": "PCS",
            "current_stock": 100  # Plenty of stock
        }
        resp = api.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item = resp.json()
        
        # Create supplier
        supplier_data = {
            "code": f"SUP-SUFF-{suffix}",
            "name": f"Test Sufficient Supplier {suffix}",
            "contact_person": "Test",
            "email": f"suff-{suffix}@test.com",
            "phone": "1234567890"
        }
        resp = api.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert resp.status_code == 201
        supplier = resp.json()
        
        # Create SC order
        sc_data = {
            "supplier_id": supplier["id"],
            "subcontract_type": "with_material",
            "lines": [{"item_id": item["id"], "quantity": 10, "rate": 100}],
            "job_work_parts": []
        }
        resp = api.post(f"{BASE_URL}/api/job-work/orders", json=sc_data)
        assert resp.status_code == 201
        sc_order = resp.json()
        
        # Confirm the SC order
        resp = api.put(f"{BASE_URL}/api/job-work/orders/{sc_order['id']}", json={"status": "confirmed"})
        assert resp.status_code == 200
        
        # Create DC - should succeed
        dc_data = {
            "subcontract_order_id": sc_order["id"],
            "lines": [{"item_id": item["id"], "quantity": 10}],
            "warehouse_id": "",
            "notes": ""
        }
        resp = api.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        
        # Should return 201 with DC created
        assert resp.status_code == 201, f"Expected 201 for successful DC, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "dc_number" in data or "id" in data, "Expected DC to be created"
        
        print("✓ Regression VERIFIED: DC creation succeeds when stock is sufficient")


# Fixtures
@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    """Get authentication token via cookie-based auth"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if response.status_code == 200:
        # The auth is cookie-based, so we just need to ensure session has cookies
        return "cookie-auth"
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
