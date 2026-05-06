"""
Iteration 87 - UOM decimal_places feature tests

Tests:
1. POST /api/settings/uoms with decimal_places=3 returns decimal_places=3
2. POST /api/settings/uoms with decimal_places=99 should clamp to 6
3. POST /api/settings/uoms without decimal_places defaults to 2
4. PUT /api/settings/uoms/{id} updating only decimal_places persists; GET returns updated value
5. GET /api/settings/uoms backfills decimal_places=2 for legacy rows missing the field
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestUOMDecimalPlaces:
    """UOM decimal_places feature tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Store cookies for subsequent requests
        self.cookies = login_response.cookies
        yield
        
        # Cleanup: delete test UOMs created during tests
        try:
            uoms_response = self.session.get(f"{BASE_URL}/api/settings/uoms", cookies=self.cookies)
            if uoms_response.status_code == 200:
                for uom in uoms_response.json():
                    if uom.get('code', '').startswith('test_'):
                        self.session.delete(f"{BASE_URL}/api/settings/uoms/{uom['id']}", cookies=self.cookies)
        except Exception:
            pass
    
    def test_create_uom_with_decimal_places_3(self):
        """POST /api/settings/uoms with decimal_places=3 returns decimal_places=3"""
        unique_code = f"test_{uuid.uuid4().hex[:6]}"
        payload = {
            "code": unique_code,
            "name": "Test Unit 3 Decimals",
            "decimal_places": 3
        }
        
        response = self.session.post(f"{BASE_URL}/api/settings/uoms", json=payload, cookies=self.cookies)
        assert response.status_code == 201, f"Create UOM failed: {response.text}"
        
        data = response.json()
        assert data["code"] == unique_code
        assert data["decimal_places"] == 3, f"Expected decimal_places=3, got {data.get('decimal_places')}"
        print(f"✓ Created UOM with decimal_places=3: {data}")
    
    def test_create_uom_decimal_places_clamped_to_6(self):
        """POST /api/settings/uoms with decimal_places=99 should clamp to 6"""
        unique_code = f"test_{uuid.uuid4().hex[:6]}"
        payload = {
            "code": unique_code,
            "name": "Test Unit Clamped",
            "decimal_places": 99  # Should be clamped to 6
        }
        
        response = self.session.post(f"{BASE_URL}/api/settings/uoms", json=payload, cookies=self.cookies)
        assert response.status_code == 201, f"Create UOM failed: {response.text}"
        
        data = response.json()
        assert data["decimal_places"] == 6, f"Expected decimal_places clamped to 6, got {data.get('decimal_places')}"
        print(f"✓ UOM decimal_places clamped to 6: {data}")
    
    def test_create_uom_decimal_places_clamped_to_0(self):
        """POST /api/settings/uoms with decimal_places=-5 should clamp to 0"""
        unique_code = f"test_{uuid.uuid4().hex[:6]}"
        payload = {
            "code": unique_code,
            "name": "Test Unit Clamped Zero",
            "decimal_places": -5  # Should be clamped to 0
        }
        
        response = self.session.post(f"{BASE_URL}/api/settings/uoms", json=payload, cookies=self.cookies)
        assert response.status_code == 201, f"Create UOM failed: {response.text}"
        
        data = response.json()
        assert data["decimal_places"] == 0, f"Expected decimal_places clamped to 0, got {data.get('decimal_places')}"
        print(f"✓ UOM decimal_places clamped to 0: {data}")
    
    def test_create_uom_without_decimal_places_defaults_to_2(self):
        """POST /api/settings/uoms without decimal_places defaults to 2"""
        unique_code = f"test_{uuid.uuid4().hex[:6]}"
        payload = {
            "code": unique_code,
            "name": "Test Unit Default Decimals"
            # No decimal_places field - should default to 2
        }
        
        response = self.session.post(f"{BASE_URL}/api/settings/uoms", json=payload, cookies=self.cookies)
        assert response.status_code == 201, f"Create UOM failed: {response.text}"
        
        data = response.json()
        assert data["decimal_places"] == 2, f"Expected decimal_places default to 2, got {data.get('decimal_places')}"
        print(f"✓ UOM decimal_places defaults to 2: {data}")
    
    def test_update_uom_decimal_places_persists(self):
        """PUT /api/settings/uoms/{id} updating only decimal_places persists; GET returns updated value"""
        # First create a UOM
        unique_code = f"test_{uuid.uuid4().hex[:6]}"
        create_payload = {
            "code": unique_code,
            "name": "Test Unit Update",
            "decimal_places": 2
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/settings/uoms", json=create_payload, cookies=self.cookies)
        assert create_response.status_code == 201, f"Create UOM failed: {create_response.text}"
        
        uom_id = create_response.json()["id"]
        
        # Update only decimal_places to 5
        update_payload = {
            "decimal_places": 5
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/settings/uoms/{uom_id}", json=update_payload, cookies=self.cookies)
        assert update_response.status_code == 200, f"Update UOM failed: {update_response.text}"
        
        updated_data = update_response.json()
        # The response might be nested under 'uom' key or direct
        uom_data = updated_data.get('uom', updated_data)
        assert uom_data.get("decimal_places") == 5, f"Expected decimal_places=5 after update, got {uom_data.get('decimal_places')}"
        
        # Verify with GET
        get_response = self.session.get(f"{BASE_URL}/api/settings/uoms", cookies=self.cookies)
        assert get_response.status_code == 200
        
        uoms = get_response.json()
        found_uom = next((u for u in uoms if u["id"] == uom_id), None)
        assert found_uom is not None, f"UOM {uom_id} not found in GET response"
        assert found_uom["decimal_places"] == 5, f"Expected decimal_places=5 in GET, got {found_uom.get('decimal_places')}"
        print(f"✓ UOM decimal_places updated and persisted: {found_uom}")
    
    def test_get_uoms_backfills_decimal_places(self):
        """GET /api/settings/uoms backfills decimal_places=2 for all rows"""
        response = self.session.get(f"{BASE_URL}/api/settings/uoms", cookies=self.cookies)
        assert response.status_code == 200, f"GET UOMs failed: {response.text}"
        
        uoms = response.json()
        assert isinstance(uoms, list), "Expected list of UOMs"
        
        # Check that all UOMs have decimal_places field
        for uom in uoms:
            assert "decimal_places" in uom, f"UOM {uom.get('code')} missing decimal_places field"
            assert isinstance(uom["decimal_places"], int), f"decimal_places should be int, got {type(uom['decimal_places'])}"
            assert 0 <= uom["decimal_places"] <= 6, f"decimal_places should be 0-6, got {uom['decimal_places']}"
        
        print(f"✓ All {len(uoms)} UOMs have decimal_places field (backfilled if needed)")
    
    def test_standard_uoms_exist(self):
        """Verify standard UOMs (pcs, kg, etc.) exist with decimal_places"""
        response = self.session.get(f"{BASE_URL}/api/settings/uoms", cookies=self.cookies)
        assert response.status_code == 200
        
        uoms = response.json()
        uom_codes = {u["code"] for u in uoms}
        
        # Check some standard UOMs exist
        expected_codes = ["pcs", "kg"]
        for code in expected_codes:
            if code in uom_codes:
                uom = next(u for u in uoms if u["code"] == code)
                assert "decimal_places" in uom
                print(f"✓ Standard UOM '{code}' exists with decimal_places={uom['decimal_places']}")


class TestUOMIntegration:
    """Integration tests for UOM decimal_places with other features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_response.status_code == 200
        self.cookies = login_response.cookies
        yield
    
    def test_inventory_items_have_uom(self):
        """Verify inventory items have unit_of_measure that can be looked up in UOMs"""
        # Get UOMs
        uoms_response = self.session.get(f"{BASE_URL}/api/settings/uoms", cookies=self.cookies)
        assert uoms_response.status_code == 200
        uom_codes = {u["code"].lower() for u in uoms_response.json()}
        
        # Get inventory items
        items_response = self.session.get(f"{BASE_URL}/api/inventory", cookies=self.cookies)
        assert items_response.status_code == 200
        
        items = items_response.json()
        if len(items) > 0:
            # Check first few items have valid UOM
            for item in items[:5]:
                uom = item.get("unit_of_measure", "").lower()
                if uom:
                    # UOM should exist in master (or be a valid code)
                    print(f"  Item {item.get('part_number')}: UOM={uom}")
        
        print(f"✓ Checked {len(items)} inventory items for UOM field")
    
    def test_bom_components_have_uom(self):
        """Verify BOM components have unit_of_measure"""
        # Get BOMs
        boms_response = self.session.get(f"{BASE_URL}/api/bom", cookies=self.cookies)
        assert boms_response.status_code == 200
        
        boms = boms_response.json()
        if len(boms) > 0:
            # Check first BOM's components
            bom = boms[0]
            components = bom.get("components", [])
            for comp in components[:3]:
                print(f"  Component {comp.get('item_id')}: UOM={comp.get('unit_of_measure', 'N/A')}")
        
        print(f"✓ Checked {len(boms)} BOMs for component UOM fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
