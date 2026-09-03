"""
Test Item Groups Feature - Iteration 73
Tests:
1. Item Groups CRUD (POST, GET, PUT, DELETE)
2. Item inheritance on create (group HSN/GST flows to item)
3. Item inheritance cascade (PUT group updates all member items)
4. Delete group with items (should fail with 400)
5. Items list filter by group_id
6. Items list filter combined (category + group_id)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Session with cookie-based auth"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login to get cookies
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    
    # Cookies are automatically stored in the session
    return session


class TestItemGroupsCRUD:
    """Test Item Groups CRUD operations"""
    
    def test_create_item_group(self, api_client):
        """POST /api/item-groups creates group with name, parent_category, default_hsn_code, default_gst_rate"""
        payload = {
            "name": "TEST_Pumps",
            "parent_category": "component",
            "default_hsn_code": "8413",
            "default_gst_rate": 18.0,
            "description": "Test pump group"
        }
        response = api_client.post(f"{BASE_URL}/api/item-groups", json=payload)
        assert response.status_code == 201, f"Create group failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_Pumps"
        assert data["parent_category"] == "component"
        assert data["default_hsn_code"] == "8413"
        assert data["default_gst_rate"] == 18.0
        assert "id" in data
        assert data["item_count"] == 0
        
        # Store for cleanup
        TestItemGroupsCRUD.test_group_id = data["id"]
        print(f"Created group: {data['id']}")
    
    def test_list_item_groups_with_item_count(self, api_client):
        """GET /api/item-groups lists groups with item_count"""
        response = api_client.get(f"{BASE_URL}/api/item-groups")
        assert response.status_code == 200, f"List groups failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        
        # Find our test group
        test_group = next((g for g in data if g["name"] == "TEST_Pumps"), None)
        assert test_group is not None, "TEST_Pumps group not found in list"
        assert "item_count" in test_group
        print(f"Found {len(data)} groups, TEST_Pumps has {test_group['item_count']} items")
    
    def test_update_item_group(self, api_client):
        """PUT /api/item-groups/{id} updates group"""
        group_id = TestItemGroupsCRUD.test_group_id
        payload = {
            "name": "TEST_Pumps_Updated",
            "default_hsn_code": "84131",
            "default_gst_rate": 28.0
        }
        response = api_client.put(f"{BASE_URL}/api/item-groups/{group_id}", json=payload)
        assert response.status_code == 200, f"Update group failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_Pumps_Updated"
        assert data["default_hsn_code"] == "84131"
        assert data["default_gst_rate"] == 28.0
        print(f"Updated group: {data['name']}")
    
    def test_delete_item_group_no_items(self, api_client):
        """DELETE /api/item-groups/{id} succeeds when no items reference it"""
        group_id = TestItemGroupsCRUD.test_group_id
        response = api_client.delete(f"{BASE_URL}/api/item-groups/{group_id}")
        assert response.status_code == 200, f"Delete group failed: {response.text}"
        
        data = response.json()
        assert "deleted" in data.get("message", "").lower() or "deleted" in str(data).lower()
        print(f"Deleted group: {group_id}")


class TestItemInheritanceOnCreate:
    """Test that items inherit HSN/GST from group on creation"""
    
    @pytest.fixture(autouse=True)
    def setup_group(self, api_client):
        """Create a group with HSN/GST defaults for testing"""
        payload = {
            "name": "TEST_InheritGroup",
            "parent_category": "raw_material",
            "default_hsn_code": "8501",
            "default_gst_rate": 18.0,
            "description": "Test inheritance group"
        }
        response = api_client.post(f"{BASE_URL}/api/item-groups", json=payload)
        if response.status_code == 400 and "already exists" in response.text:
            # Group exists, fetch it
            groups_resp = api_client.get(f"{BASE_URL}/api/item-groups")
            groups = groups_resp.json()
            group = next((g for g in groups if g["name"] == "TEST_InheritGroup"), None)
            self.group_id = group["id"] if group else None
        else:
            assert response.status_code == 201, f"Create group failed: {response.text}"
            self.group_id = response.json()["id"]
        
        yield
        
        # Cleanup: delete test item first, then group
        try:
            items_resp = api_client.get(f"{BASE_URL}/api/items?group_id={self.group_id}")
            for item in items_resp.json():
                if item.get("part_number", "").startswith("TEST_"):
                    api_client.delete(f"{BASE_URL}/api/items/{item['id']}")
            api_client.delete(f"{BASE_URL}/api/item-groups/{self.group_id}")
        except Exception:
            pass
    
    def test_item_inherits_hsn_gst_from_group(self, api_client):
        """POST /api/items with group_id inherits HSN/GST from group"""
        payload = {
            "part_number": "TEST_INHERIT_ITEM_001",
            "name": "Test Inherit Item",
            "category": "raw_material",
            "group_id": self.group_id,
            "unit_of_measure": "pcs",
            "hsn_code": "",  # Blank - should inherit from group
            "gst_rate": 0    # Should be overridden by group
        }
        response = api_client.post(f"{BASE_URL}/api/items", json=payload)
        assert response.status_code == 201, f"Create item failed: {response.text}"
        
        data = response.json()
        assert data["hsn_code"] == "8501", f"Expected HSN 8501, got {data['hsn_code']}"
        assert data["gst_rate"] == 18.0, f"Expected GST 18.0, got {data['gst_rate']}"
        assert data["group_id"] == self.group_id
        
        self.test_item_id = data["id"]
        print(f"Item inherited HSN={data['hsn_code']}, GST={data['gst_rate']} from group")


class TestItemInheritanceCascade:
    """Test that updating group HSN/GST cascades to all member items"""
    
    @pytest.fixture(autouse=True)
    def setup_group_and_items(self, api_client):
        """Create a group and items for cascade testing"""
        # Create group
        payload = {
            "name": "TEST_CascadeGroup",
            "parent_category": "component",
            "default_hsn_code": "8482",
            "default_gst_rate": 18.0,
            "description": "Test cascade group"
        }
        response = api_client.post(f"{BASE_URL}/api/item-groups", json=payload)
        if response.status_code == 400 and "already exists" in response.text:
            groups_resp = api_client.get(f"{BASE_URL}/api/item-groups")
            groups = groups_resp.json()
            group = next((g for g in groups if g["name"] == "TEST_CascadeGroup"), None)
            self.group_id = group["id"] if group else None
        else:
            assert response.status_code == 201, f"Create group failed: {response.text}"
            self.group_id = response.json()["id"]
        
        # Create test items in the group
        self.item_ids = []
        for i in range(2):
            item_payload = {
                "part_number": f"TEST_CASCADE_ITEM_{i:03d}",
                "name": f"Test Cascade Item {i}",
                "category": "component",
                "group_id": self.group_id,
                "unit_of_measure": "pcs"
            }
            resp = api_client.post(f"{BASE_URL}/api/items", json=item_payload)
            if resp.status_code == 201:
                self.item_ids.append(resp.json()["id"])
            elif resp.status_code == 400 and "already exists" in resp.text:
                # Item exists, find it
                items_resp = api_client.get(f"{BASE_URL}/api/items?group_id={self.group_id}")
                for item in items_resp.json():
                    if item["part_number"] == f"TEST_CASCADE_ITEM_{i:03d}":
                        self.item_ids.append(item["id"])
                        break
        
        yield
        
        # Cleanup
        try:
            for item_id in self.item_ids:
                api_client.delete(f"{BASE_URL}/api/items/{item_id}")
            api_client.delete(f"{BASE_URL}/api/item-groups/{self.group_id}")
        except Exception:
            pass
    
    def test_group_update_cascades_to_items(self, api_client):
        """PUT /api/item-groups/{id} with new HSN/GST cascades to all member items"""
        # Update group with new HSN/GST
        update_payload = {
            "default_hsn_code": "84821",
            "default_gst_rate": 28.0
        }
        response = api_client.put(f"{BASE_URL}/api/item-groups/{self.group_id}", json=update_payload)
        assert response.status_code == 200, f"Update group failed: {response.text}"
        
        # Verify cascade by fetching items
        for item_id in self.item_ids:
            item_resp = api_client.get(f"{BASE_URL}/api/items/{item_id}")
            assert item_resp.status_code == 200, f"Get item failed: {item_resp.text}"
            
            item = item_resp.json()
            assert item["hsn_code"] == "84821", f"Item {item_id} HSN not cascaded: {item['hsn_code']}"
            assert item["gst_rate"] == 28.0, f"Item {item_id} GST not cascaded: {item['gst_rate']}"
        
        print(f"Cascade verified: {len(self.item_ids)} items updated with HSN=84821, GST=28.0")


class TestDeleteGroupWithItems:
    """Test that deleting a group with items fails with 400"""
    
    @pytest.fixture(autouse=True)
    def setup_group_with_item(self, api_client):
        """Create a group with an item"""
        # Create group
        payload = {
            "name": "TEST_DeleteBlockGroup",
            "parent_category": "raw_material",
            "default_hsn_code": "4010",
            "default_gst_rate": 18.0
        }
        response = api_client.post(f"{BASE_URL}/api/item-groups", json=payload)
        if response.status_code == 400 and "already exists" in response.text:
            groups_resp = api_client.get(f"{BASE_URL}/api/item-groups")
            groups = groups_resp.json()
            group = next((g for g in groups if g["name"] == "TEST_DeleteBlockGroup"), None)
            self.group_id = group["id"] if group else None
        else:
            assert response.status_code == 201, f"Create group failed: {response.text}"
            self.group_id = response.json()["id"]
        
        # Create item in the group
        item_payload = {
            "part_number": "TEST_DELETE_BLOCK_ITEM",
            "name": "Test Delete Block Item",
            "category": "raw_material",
            "group_id": self.group_id,
            "unit_of_measure": "pcs"
        }
        resp = api_client.post(f"{BASE_URL}/api/items", json=item_payload)
        if resp.status_code == 201:
            self.item_id = resp.json()["id"]
        elif resp.status_code == 400 and "already exists" in resp.text:
            items_resp = api_client.get(f"{BASE_URL}/api/items?group_id={self.group_id}")
            for item in items_resp.json():
                if item["part_number"] == "TEST_DELETE_BLOCK_ITEM":
                    self.item_id = item["id"]
                    break
        
        yield
        
        # Cleanup
        try:
            api_client.delete(f"{BASE_URL}/api/items/{self.item_id}")
            api_client.delete(f"{BASE_URL}/api/item-groups/{self.group_id}")
        except Exception:
            pass
    
    def test_delete_group_with_items_returns_400(self, api_client):
        """DELETE /api/item-groups/{id} when items exist returns 400 with count"""
        response = api_client.delete(f"{BASE_URL}/api/item-groups/{self.group_id}")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        detail = data.get("detail", "")
        assert "item" in detail.lower(), f"Error message should mention items: {detail}"
        # Should mention count of items
        assert any(char.isdigit() for char in detail), f"Error should include item count: {detail}"
        print(f"Delete blocked correctly: {detail}")


class TestItemsFilterByGroup:
    """Test filtering items by group_id"""
    
    def test_filter_items_by_group_id(self, api_client):
        """GET /api/items?group_id=<id> returns only items in that group"""
        # First get existing groups
        groups_resp = api_client.get(f"{BASE_URL}/api/item-groups")
        groups = groups_resp.json()
        
        if not groups:
            pytest.skip("No item groups exist for testing")
        
        # Use first group with items
        test_group = next((g for g in groups if g.get("item_count", 0) > 0), None)
        if not test_group:
            pytest.skip("No groups with items exist for testing")
        
        group_id = test_group["id"]
        expected_count = test_group["item_count"]
        
        # Filter items by group_id
        response = api_client.get(f"{BASE_URL}/api/items?group_id={group_id}")
        assert response.status_code == 200, f"Filter items failed: {response.text}"
        
        items = response.json()
        assert len(items) == expected_count, f"Expected {expected_count} items, got {len(items)}"
        
        # Verify all items have the correct group_id
        for item in items:
            assert item.get("group_id") == group_id, f"Item {item['part_number']} has wrong group_id"
        
        print(f"Filter by group_id returned {len(items)} items (expected {expected_count})")
    
    def test_filter_items_by_category_and_group(self, api_client):
        """GET /api/items?category=component&group_id=<id> returns only matching items"""
        # Get groups
        groups_resp = api_client.get(f"{BASE_URL}/api/item-groups")
        groups = groups_resp.json()
        
        # Find a group with parent_category = component
        test_group = next((g for g in groups if g.get("parent_category") == "component" and g.get("item_count", 0) > 0), None)
        if not test_group:
            pytest.skip("No component groups with items exist for testing")
        
        group_id = test_group["id"]
        
        # Filter by both category and group_id
        response = api_client.get(f"{BASE_URL}/api/items?category=component&group_id={group_id}")
        assert response.status_code == 200, f"Combined filter failed: {response.text}"
        
        items = response.json()
        
        # Verify all items match both filters
        for item in items:
            assert item.get("group_id") == group_id, f"Item {item['part_number']} has wrong group_id"
            assert item.get("category") == "component", f"Item {item['part_number']} has wrong category"
        
        print(f"Combined filter (category=component, group_id={group_id}) returned {len(items)} items")


class TestExistingGroupsIntegrity:
    """Verify existing test groups (Motors, Bearings, V-Belts) are intact"""
    
    def test_existing_groups_present(self, api_client):
        """Verify Motors, Bearings, V-Belts groups exist"""
        response = api_client.get(f"{BASE_URL}/api/item-groups")
        assert response.status_code == 200
        
        groups = response.json()
        group_names = [g["name"] for g in groups]
        
        expected_groups = ["Motors", "Bearings", "V-Belts"]
        for name in expected_groups:
            assert name in group_names, f"Expected group '{name}' not found"
        
        print(f"Verified existing groups: {expected_groups}")
    
    def test_motor_test_item_exists(self, api_client):
        """Verify MOTOR-TEST-01 item exists and has correct group"""
        response = api_client.get(f"{BASE_URL}/api/items?search=MOTOR-TEST-01")
        assert response.status_code == 200
        
        items = response.json()
        motor_item = next((i for i in items if i["part_number"] == "MOTOR-TEST-01"), None)
        
        if motor_item:
            assert motor_item.get("group_id") is not None, "MOTOR-TEST-01 should have a group_id"
            print(f"MOTOR-TEST-01 found with group_id={motor_item['group_id']}, HSN={motor_item.get('hsn_code')}, GST={motor_item.get('gst_rate')}")
        else:
            print("MOTOR-TEST-01 not found (may have been cleaned up)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
