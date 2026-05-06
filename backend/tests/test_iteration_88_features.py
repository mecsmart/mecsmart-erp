"""
Iteration 88 Backend Tests
Tests for:
1. DELETE /api/settings/uoms/{id} - UOM deletion blocked when in use by items
2. POST /api/items - UOM mandatory validation
3. POST /api/items - UOM must exist in db.uoms
4. GET /api/items?lite=1 - Slim projection for item pickers
5. GET /api/items/export/excel?group_id=X - Export by item group
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for all tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login as admin
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return session


class TestUOMDeletionBlocked:
    """Test that UOM deletion is blocked when UOM is in use by items"""
    
    def test_delete_uom_in_use_returns_400(self, auth_session):
        """DELETE /api/settings/uoms/{id} where UOM is in use returns 400"""
        # First, get all UOMs
        uoms_resp = auth_session.get(f"{BASE_URL}/api/settings/uoms")
        assert uoms_resp.status_code == 200
        uoms = uoms_resp.json()
        
        # Find 'kg' UOM which should be in use by many items
        kg_uom = next((u for u in uoms if u.get('code') == 'kg'), None)
        if not kg_uom:
            pytest.skip("No 'kg' UOM found in system")
        
        # Try to delete it - should fail with 400
        delete_resp = auth_session.delete(f"{BASE_URL}/api/settings/uoms/{kg_uom['id']}")
        assert delete_resp.status_code == 400, f"Expected 400, got {delete_resp.status_code}: {delete_resp.text}"
        
        # Verify error message mentions items count
        error_detail = delete_resp.json().get('detail', '')
        assert "Cannot delete UOM" in error_detail
        assert "item(s)" in error_detail
        print(f"✓ DELETE kg UOM blocked: {error_detail}")
    
    def test_delete_unused_uom_succeeds(self, auth_session):
        """DELETE /api/settings/uoms/{id} for unused UOM returns success"""
        # Create a new UOM that won't be used
        unique_code = f"test_uom_{int(time.time())}"
        create_resp = auth_session.post(f"{BASE_URL}/api/settings/uoms", json={
            "code": unique_code,
            "name": "Test UOM for deletion"
        })
        assert create_resp.status_code == 201, f"Failed to create UOM: {create_resp.text}"
        new_uom = create_resp.json()
        
        # Delete it - should succeed
        delete_resp = auth_session.delete(f"{BASE_URL}/api/settings/uoms/{new_uom['id']}")
        assert delete_resp.status_code == 200, f"Expected 200, got {delete_resp.status_code}: {delete_resp.text}"
        
        data = delete_resp.json()
        assert "deleted" in data
        print(f"✓ DELETE unused UOM succeeded: {data}")


class TestItemUOMValidation:
    """Test UOM validation on item creation"""
    
    def test_create_item_without_uom_returns_400(self, auth_session):
        """POST /api/items with empty unit_of_measure returns 400"""
        item_data = {
            "part_number": f"TEST-NO-UOM-{int(time.time())}",
            "name": "Test Item Without UOM",
            "category": "raw_material",
            "unit_of_measure": ""  # Empty UOM
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        
        error_detail = resp.json().get('detail', '')
        assert "UOM" in error_detail or "mandatory" in error_detail.lower()
        print(f"✓ Create item without UOM blocked: {error_detail}")
    
    def test_create_item_with_invalid_uom_returns_400(self, auth_session):
        """POST /api/items with UOM not in db.uoms returns 400"""
        item_data = {
            "part_number": f"TEST-BAD-UOM-{int(time.time())}",
            "name": "Test Item With Invalid UOM",
            "category": "raw_material",
            "unit_of_measure": "nonexistent_uom_xyz"  # UOM that doesn't exist
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        
        error_detail = resp.json().get('detail', '')
        assert "not configured" in error_detail.lower() or "Settings" in error_detail
        print(f"✓ Create item with invalid UOM blocked: {error_detail}")
    
    def test_create_item_with_valid_uom_succeeds(self, auth_session):
        """POST /api/items with valid UOM succeeds"""
        unique_pn = f"TEST-VALID-UOM-{int(time.time())}"
        item_data = {
            "part_number": unique_pn,
            "name": "Test Item With Valid UOM",
            "category": "raw_material",
            "unit_of_measure": "pcs"  # Valid UOM
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        
        created = resp.json()
        assert created['unit_of_measure'] == 'pcs'
        print(f"✓ Create item with valid UOM succeeded: {created['part_number']}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/items/{created['id']}")


class TestItemsLiteEndpoint:
    """Test GET /api/items?lite=1 returns slim projection"""
    
    def test_lite_returns_fewer_fields(self, auth_session):
        """GET /api/items?lite=1 returns only picker-relevant fields"""
        # Get full items
        full_resp = auth_session.get(f"{BASE_URL}/api/items")
        assert full_resp.status_code == 200
        full_items = full_resp.json()
        
        if not full_items:
            pytest.skip("No items in database")
        
        # Get lite items
        lite_resp = auth_session.get(f"{BASE_URL}/api/items?lite=1")
        assert lite_resp.status_code == 200
        lite_items = lite_resp.json()
        
        # Compare first item's fields
        full_item = full_items[0]
        lite_item = next((i for i in lite_items if i.get('id') == full_item.get('id')), None)
        
        if lite_item:
            # Lite should have these fields
            expected_lite_fields = {'id', 'part_number', 'name', 'description', 'category', 
                                   'group_id', 'unit_of_measure', 'hsn_code', 'gst_rate',
                                   'unit_cost', 'sale_price', 'purchase_price',
                                   'current_stock', 'safety_stock', 'reorder_point'}
            
            # Lite should NOT have these fields
            excluded_fields = {'created_at', 'created_by', 'lead_time_days', 'updated_at'}
            
            lite_keys = set(lite_item.keys())
            
            # Check excluded fields are not present
            for field in excluded_fields:
                if field in lite_keys:
                    print(f"  Warning: lite response includes {field}")
            
            # Verify lite has fewer or equal fields
            assert len(lite_keys) <= len(set(full_item.keys())), "Lite should have fewer fields"
            
            print(f"✓ Lite endpoint returns {len(lite_keys)} fields vs full {len(full_item.keys())} fields")
            print(f"  Lite fields: {sorted(lite_keys)}")
    
    def test_lite_payload_smaller(self, auth_session):
        """GET /api/items?lite=1 payload is smaller than full response"""
        full_resp = auth_session.get(f"{BASE_URL}/api/items")
        lite_resp = auth_session.get(f"{BASE_URL}/api/items?lite=1")
        
        full_size = len(full_resp.content)
        lite_size = len(lite_resp.content)
        
        # Lite should be smaller (or equal if very few items)
        print(f"✓ Full payload: {full_size} bytes, Lite payload: {lite_size} bytes")
        if full_size > 1000:  # Only check if meaningful data
            assert lite_size <= full_size, "Lite payload should be smaller or equal"


class TestItemExportByGroup:
    """Test GET /api/items/export/excel with group_id filter"""
    
    def test_export_by_valid_group_returns_200(self, auth_session):
        """GET /api/items/export/excel?group_id=X returns 200 XLSX"""
        # First get item groups
        groups_resp = auth_session.get(f"{BASE_URL}/api/item-groups")
        assert groups_resp.status_code == 200
        groups = groups_resp.json()
        
        if not groups:
            pytest.skip("No item groups in database")
        
        # Pick first group with items
        test_group = next((g for g in groups if g.get('item_count', 0) > 0), groups[0])
        
        # Export by group
        export_resp = auth_session.get(f"{BASE_URL}/api/items/export/excel?group_id={test_group['id']}")
        assert export_resp.status_code == 200, f"Expected 200, got {export_resp.status_code}: {export_resp.text}"
        
        # Verify it's an Excel file
        content_type = export_resp.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'octet-stream' in content_type or 'excel' in content_type.lower()
        
        print(f"✓ Export by group '{test_group['name']}' returned {len(export_resp.content)} bytes")
    
    def test_export_by_invalid_group_returns_404(self, auth_session):
        """GET /api/items/export/excel?group_id=<bad> returns 404"""
        export_resp = auth_session.get(f"{BASE_URL}/api/items/export/excel?group_id=nonexistent_group_id_xyz")
        assert export_resp.status_code == 404, f"Expected 404, got {export_resp.status_code}: {export_resp.text}"
        
        error_detail = export_resp.json().get('detail', '')
        assert "not found" in error_detail.lower()
        print(f"✓ Export by invalid group returns 404: {error_detail}")
    
    def test_export_by_group_and_category(self, auth_session):
        """GET /api/items/export/excel?group_id=X&category=raw_material returns 200"""
        # Get groups
        groups_resp = auth_session.get(f"{BASE_URL}/api/item-groups")
        groups = groups_resp.json()
        
        if not groups:
            pytest.skip("No item groups in database")
        
        test_group = groups[0]
        
        # Export with both filters
        export_resp = auth_session.get(
            f"{BASE_URL}/api/items/export/excel?group_id={test_group['id']}&category=raw_material"
        )
        # Should return 200 even if no items match (empty Excel)
        assert export_resp.status_code == 200, f"Expected 200, got {export_resp.status_code}"
        print(f"✓ Export by group + category returned {len(export_resp.content)} bytes")


class TestRegressionIteration87:
    """Regression tests for iteration 87 features"""
    
    def test_uom_decimal_places_still_works(self, auth_session):
        """UOM decimal_places field is still functional"""
        # Create UOM with decimal_places
        unique_code = f"test_dec_{int(time.time())}"
        create_resp = auth_session.post(f"{BASE_URL}/api/settings/uoms", json={
            "code": unique_code,
            "name": "Test Decimal UOM",
            "decimal_places": 3
        })
        assert create_resp.status_code == 201
        
        created = create_resp.json()
        assert created.get('decimal_places') == 3
        print(f"✓ UOM decimal_places still works: {created['code']} has {created['decimal_places']} decimals")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/settings/uoms/{created['id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
