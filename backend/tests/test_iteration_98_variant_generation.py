"""
Iteration 98 - Item Variant Generation (Odoo-style) Backend Tests

Tests:
1. POST /api/items/{item_id}/preview-variants - returns combinations for parent with variant_attributes
2. POST /api/items/{item_id}/generate-variants - creates child items, idempotent, retires obsolete variants
3. Variant child items inherit category/uom/unit_cost from parent
4. PUT /api/items/{id} saves variant_attributes correctly with new {value, short_code} object schema
5. GET /api/items?lite=1 includes variant_attributes for items that have them
6. BOM CRUD regression (POST, GET, PUT, DELETE)
7. BOM explosion regression for SA-001
8. Sales Order CRUD with variant_selection regression
9. Manufacturing Order creation from SO with variant_selection regression
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_VAR_98_"


class TestAuth:
    """Authentication setup"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        return s


class TestVariantPreviewAndGeneration:
    """Test variant preview and generation endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        return s
    
    @pytest.fixture(scope="class")
    def test_parent_item(self, session):
        """Create a test parent item with variant attributes"""
        item_data = {
            "part_number": f"{TEST_PREFIX}MOTOR-001",
            "name": "Test Motor for Variant Generation",
            "category": "Finished Goods",
            "unit_of_measure": "nos",
            "unit_cost": 1000.0,
            "sale_price": 1500.0,
            "variant_attributes": [
                {
                    "name": "Power",
                    "values": [
                        {"value": "1HP", "short_code": "1HP"},
                        {"value": "2HP", "short_code": "2HP"}
                    ]
                },
                {
                    "name": "Voltage",
                    "values": [
                        {"value": "220V", "short_code": "220V"},
                        {"value": "440V", "short_code": "440V"}
                    ]
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201, f"Failed to create test item: {resp.text}"
        item = resp.json()
        yield item
        
        # Cleanup: Delete parent and all variants
        # First delete variants
        variants_resp = session.get(f"{BASE_URL}/api/items/{item['id']}/variants")
        if variants_resp.status_code == 200:
            for v in variants_resp.json():
                session.delete(f"{BASE_URL}/api/items/{v['id']}")
        # Then delete parent
        session.delete(f"{BASE_URL}/api/items/{item['id']}")
    
    def test_preview_variants_returns_combinations(self, session, test_parent_item):
        """POST /api/items/{item_id}/preview-variants returns all combinations"""
        resp = session.post(f"{BASE_URL}/api/items/{test_parent_item['id']}/preview-variants")
        assert resp.status_code == 200, f"Preview failed: {resp.text}"
        
        data = resp.json()
        assert "combinations" in data
        assert "parent_item_id" in data
        assert "parent_sku" in data
        assert data["parent_item_id"] == test_parent_item["id"]
        
        # Should have 2x2 = 4 combinations
        assert len(data["combinations"]) == 4
        
        # All should be marked as not existing yet
        assert data["existing_count"] == 0
        assert data["new_count"] == 4
        
        # Check SKU format
        skus = [c["sku"] for c in data["combinations"]]
        expected_skus = [
            f"{TEST_PREFIX}MOTOR-001-1HP-220V",
            f"{TEST_PREFIX}MOTOR-001-1HP-440V",
            f"{TEST_PREFIX}MOTOR-001-2HP-220V",
            f"{TEST_PREFIX}MOTOR-001-2HP-440V"
        ]
        for expected in expected_skus:
            assert expected in skus, f"Expected SKU {expected} not found in {skus}"
    
    def test_generate_variants_creates_children(self, session, test_parent_item):
        """POST /api/items/{item_id}/generate-variants creates child items"""
        # Generate all variants
        resp = session.post(f"{BASE_URL}/api/items/{test_parent_item['id']}/generate-variants", json={})
        assert resp.status_code == 200, f"Generate failed: {resp.text}"
        
        data = resp.json()
        assert "created" in data
        assert len(data["created"]) == 4
        
        # Verify each created variant
        for variant in data["created"]:
            assert variant["is_variant"] == True
            assert variant["parent_item_id"] == test_parent_item["id"]
            assert variant["category"] == test_parent_item["category"]
            assert variant["unit_of_measure"] == test_parent_item["unit_of_measure"]
            assert variant["unit_cost"] == test_parent_item["unit_cost"]
            assert "variant_short_codes" in variant
            assert "variant_values" in variant
            assert variant["is_active"] == True
    
    def test_generate_variants_idempotent(self, session, test_parent_item):
        """Re-running generate-variants does not create duplicates"""
        # Run generate again
        resp = session.post(f"{BASE_URL}/api/items/{test_parent_item['id']}/generate-variants", json={})
        assert resp.status_code == 200, f"Generate failed: {resp.text}"
        
        data = resp.json()
        # Should have 0 created (all already exist)
        assert len(data["created"]) == 0
        # Should have 4 reactivated (they were already active, but endpoint marks them)
        assert len(data["reactivated_skus"]) == 4
    
    def test_preview_shows_existing_variants(self, session, test_parent_item):
        """Preview shows existing variants with exists=true"""
        resp = session.post(f"{BASE_URL}/api/items/{test_parent_item['id']}/preview-variants")
        assert resp.status_code == 200
        
        data = resp.json()
        assert data["existing_count"] == 4
        assert data["new_count"] == 0
        
        for combo in data["combinations"]:
            assert combo["exists"] == True
    
    def test_list_variants_endpoint(self, session, test_parent_item):
        """GET /api/items/{item_id}/variants lists all child variants"""
        resp = session.get(f"{BASE_URL}/api/items/{test_parent_item['id']}/variants")
        assert resp.status_code == 200
        
        variants = resp.json()
        assert len(variants) == 4
        
        for v in variants:
            assert v["is_variant"] == True
            assert v["parent_item_id"] == test_parent_item["id"]


class TestVariantRetireReactivate:
    """Test variant retire/reactivate when attribute values change"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    @pytest.fixture(scope="class")
    def retire_test_item(self, session):
        """Create item for retire/reactivate testing"""
        item_data = {
            "part_number": f"{TEST_PREFIX}RETIRE-001",
            "name": "Test Item for Retire/Reactivate",
            "category": "Finished Goods",
            "unit_of_measure": "nos",
            "unit_cost": 500.0,
            "variant_attributes": [
                {
                    "name": "Size",
                    "values": [
                        {"value": "Small", "short_code": "S"},
                        {"value": "Medium", "short_code": "M"},
                        {"value": "Large", "short_code": "L"}
                    ]
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item = resp.json()
        
        # Generate variants
        session.post(f"{BASE_URL}/api/items/{item['id']}/generate-variants", json={})
        
        yield item
        
        # Cleanup
        variants_resp = session.get(f"{BASE_URL}/api/items/{item['id']}/variants")
        if variants_resp.status_code == 200:
            for v in variants_resp.json():
                session.delete(f"{BASE_URL}/api/items/{v['id']}")
        session.delete(f"{BASE_URL}/api/items/{item['id']}")
    
    def test_remove_attribute_value_retires_variant(self, session, retire_test_item):
        """Removing an attribute value retires the corresponding variant"""
        # Update parent to remove "Large" value
        update_data = {
            "variant_attributes": [
                {
                    "name": "Size",
                    "values": [
                        {"value": "Small", "short_code": "S"},
                        {"value": "Medium", "short_code": "M"}
                        # "Large" removed
                    ]
                }
            ]
        }
        resp = session.put(f"{BASE_URL}/api/items/{retire_test_item['id']}", json=update_data)
        assert resp.status_code == 200
        
        # Regenerate variants
        gen_resp = session.post(f"{BASE_URL}/api/items/{retire_test_item['id']}/generate-variants", json={})
        assert gen_resp.status_code == 200
        
        data = gen_resp.json()
        # "Large" variant should be deactivated
        assert f"{TEST_PREFIX}RETIRE-001-L" in data["deactivated_skus"]
    
    def test_readd_attribute_value_reactivates_variant(self, session, retire_test_item):
        """Re-adding an attribute value reactivates the retired variant"""
        # Update parent to add "Large" back
        update_data = {
            "variant_attributes": [
                {
                    "name": "Size",
                    "values": [
                        {"value": "Small", "short_code": "S"},
                        {"value": "Medium", "short_code": "M"},
                        {"value": "Large", "short_code": "L"}
                    ]
                }
            ]
        }
        resp = session.put(f"{BASE_URL}/api/items/{retire_test_item['id']}", json=update_data)
        assert resp.status_code == 200
        
        # Regenerate variants
        gen_resp = session.post(f"{BASE_URL}/api/items/{retire_test_item['id']}/generate-variants", json={})
        assert gen_resp.status_code == 200
        
        data = gen_resp.json()
        # "Large" variant should be reactivated
        assert f"{TEST_PREFIX}RETIRE-001-L" in data["reactivated_skus"]


class TestItemCRUDRegression:
    """Regression tests for item CRUD with variant_attributes"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    def test_create_item_with_variant_attributes_object_schema(self, session):
        """POST /api/items saves variant_attributes with {value, short_code} object schema"""
        item_data = {
            "part_number": f"{TEST_PREFIX}SCHEMA-001",
            "name": "Test Schema Item",
            "category": "Finished Goods",
            "unit_of_measure": "nos",
            "variant_attributes": [
                {
                    "name": "Color",
                    "values": [
                        {"value": "Red", "short_code": "RED"},
                        {"value": "Blue", "short_code": "BLU"}
                    ]
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        
        item = resp.json()
        assert "variant_attributes" in item
        assert len(item["variant_attributes"]) == 1
        assert item["variant_attributes"][0]["name"] == "Color"
        
        # Verify values are objects with value and short_code
        values = item["variant_attributes"][0]["values"]
        assert len(values) == 2
        assert values[0]["value"] == "Red"
        assert values[0]["short_code"] == "RED"
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/items/{item['id']}")
    
    def test_update_item_variant_attributes(self, session):
        """PUT /api/items/{id} updates variant_attributes correctly"""
        # Create item
        item_data = {
            "part_number": f"{TEST_PREFIX}UPDATE-001",
            "name": "Test Update Item",
            "category": "Finished Goods",
            "unit_of_measure": "nos"
        }
        create_resp = session.post(f"{BASE_URL}/api/items", json=item_data)
        assert create_resp.status_code == 201
        item = create_resp.json()
        
        # Update with variant_attributes
        update_data = {
            "variant_attributes": [
                {
                    "name": "Material",
                    "values": [
                        {"value": "Steel", "short_code": "STL"},
                        {"value": "Aluminum", "short_code": "ALU"}
                    ]
                }
            ]
        }
        update_resp = session.put(f"{BASE_URL}/api/items/{item['id']}", json=update_data)
        assert update_resp.status_code == 200
        
        updated = update_resp.json()
        assert "variant_attributes" in updated
        assert len(updated["variant_attributes"]) == 1
        assert updated["variant_attributes"][0]["values"][0]["short_code"] == "STL"
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/items/{item['id']}")
    
    def test_lite_items_includes_variant_attributes(self, session):
        """GET /api/items?lite=1 includes variant_attributes for items that have them"""
        # Create item with variant_attributes
        item_data = {
            "part_number": f"{TEST_PREFIX}LITE-001",
            "name": "Test Lite Item",
            "category": "Finished Goods",
            "unit_of_measure": "nos",
            "variant_attributes": [
                {
                    "name": "Grade",
                    "values": [{"value": "A", "short_code": "A"}]
                }
            ]
        }
        create_resp = session.post(f"{BASE_URL}/api/items", json=item_data)
        assert create_resp.status_code == 201
        item = create_resp.json()
        
        # Get lite list
        lite_resp = session.get(f"{BASE_URL}/api/items?lite=1")
        assert lite_resp.status_code == 200
        
        items = lite_resp.json()
        test_item = next((i for i in items if i["id"] == item["id"]), None)
        assert test_item is not None
        assert "variant_attributes" in test_item
        assert len(test_item["variant_attributes"]) == 1
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/items/{item['id']}")


class TestBOMCRUDRegression:
    """Regression tests for BOM CRUD operations"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    @pytest.fixture(scope="class")
    def test_items(self, session):
        """Create test items for BOM testing"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Parent item
        parent_data = {
            "part_number": f"{TEST_PREFIX}BOM-FG-{unique_id}",
            "name": "Test Finished Good",
            "category": "Finished Goods",
            "unit_of_measure": "nos",
            "unit_cost": 100.0
        }
        parent_resp = session.post(f"{BASE_URL}/api/items", json=parent_data)
        assert parent_resp.status_code == 201, f"Parent item create failed: {parent_resp.text}"
        parent = parent_resp.json()
        
        # Component item
        comp_data = {
            "part_number": f"{TEST_PREFIX}BOM-COMP-{unique_id}",
            "name": "Test Component",
            "category": "Raw Materials",
            "unit_of_measure": "nos",
            "unit_cost": 10.0
        }
        comp_resp = session.post(f"{BASE_URL}/api/items", json=comp_data)
        assert comp_resp.status_code == 201, f"Component create failed: {comp_resp.text}"
        comp = comp_resp.json()
        
        yield {"parent": parent, "component": comp, "unique_id": unique_id}
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/items/{parent['id']}")
        session.delete(f"{BASE_URL}/api/items/{comp['id']}")
    
    def test_bom_create(self, session, test_items):
        """POST /api/bom creates BOM successfully"""
        bom_data = {
            "name": f"{TEST_PREFIX}BOM-FG-{test_items['unique_id']} BOM",
            "parent_item_id": test_items["parent"]["id"],
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": test_items["component"]["id"],
                    "quantity": 2.0
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert resp.status_code in [200, 201], f"BOM create failed: {resp.text}"
        
        bom = resp.json()
        assert bom["parent_item_id"] == test_items["parent"]["id"]
        assert len(bom["components"]) == 1
        
        # Store for later tests
        test_items["bom_id"] = bom["id"]
    
    def test_bom_get_list(self, session, test_items):
        """GET /api/bom returns BOM list"""
        resp = session.get(f"{BASE_URL}/api/bom")
        assert resp.status_code == 200
        
        boms = resp.json()
        assert isinstance(boms, list)
        # Should contain our test BOM
        test_bom = next((b for b in boms if b.get("id") == test_items.get("bom_id")), None)
        if test_items.get("bom_id"):
            assert test_bom is not None
    
    def test_bom_get_by_id(self, session, test_items):
        """GET /api/bom/{id} returns specific BOM"""
        if not test_items.get("bom_id"):
            pytest.skip("No BOM created")
        
        resp = session.get(f"{BASE_URL}/api/bom/{test_items['bom_id']}")
        assert resp.status_code == 200
        
        bom = resp.json()
        assert bom["id"] == test_items["bom_id"]
    
    def test_bom_update(self, session, test_items):
        """PUT /api/bom/{id} updates BOM"""
        if not test_items.get("bom_id"):
            pytest.skip("No BOM created")
        
        update_data = {
            "components": [
                {
                    "item_id": test_items["component"]["id"],
                    "quantity": 3.0  # Changed from 2 to 3
                }
            ]
        }
        resp = session.put(f"{BASE_URL}/api/bom/{test_items['bom_id']}", json=update_data)
        assert resp.status_code == 200
        
        bom = resp.json()
        assert bom["components"][0]["quantity"] == 3.0
    
    def test_bom_delete(self, session, test_items):
        """DELETE /api/bom/{id} deletes BOM"""
        if not test_items.get("bom_id"):
            pytest.skip("No BOM created")
        
        resp = session.delete(f"{BASE_URL}/api/bom/{test_items['bom_id']}")
        assert resp.status_code == 200
        
        # Verify deleted
        get_resp = session.get(f"{BASE_URL}/api/bom/{test_items['bom_id']}")
        assert get_resp.status_code == 404


class TestBOMExplosionRegression:
    """Test BOM explosion for SA-001 (existing item)"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    def test_bom_explosion_sa001(self, session):
        """GET /api/bom/{bom_id}/explode works for SA-001's BOM"""
        # First find SA-001's BOM
        items_resp = session.get(f"{BASE_URL}/api/items?search=SA-001")
        if items_resp.status_code != 200:
            pytest.skip("Could not fetch items")
        
        items = items_resp.json()
        sa001 = next((i for i in items if i.get("part_number") == "SA-001"), None)
        if not sa001:
            pytest.skip("SA-001 item not found")
        
        # Find BOM for SA-001
        boms_resp = session.get(f"{BASE_URL}/api/bom")
        if boms_resp.status_code != 200:
            pytest.skip("Could not fetch BOMs")
        
        boms = boms_resp.json()
        sa001_bom = next((b for b in boms if b.get("parent_item_id") == sa001["id"] and b.get("status") == "active"), None)
        if not sa001_bom:
            pytest.skip("No active BOM found for SA-001")
        
        # Test explosion
        explode_resp = session.get(f"{BASE_URL}/api/bom/{sa001_bom['id']}/explode")
        assert explode_resp.status_code == 200, f"BOM explosion failed: {explode_resp.text}"
        
        explosion = explode_resp.json()
        # BOM explosion returns 'explosion' key with the tree structure
        assert "explosion" in explosion or "tree" in explosion or "components" in explosion or "bom" in explosion


class TestSalesOrderRegression:
    """Regression tests for Sales Order CRUD with variant_selection"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    @pytest.fixture(scope="class")
    def test_so_data(self, session):
        """Create test data for SO testing"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create FG item
        fg_data = {
            "part_number": f"{TEST_PREFIX}SO-FG-{unique_id}",
            "name": "Test FG for SO",
            "category": "Finished Goods",
            "unit_of_measure": "nos",
            "unit_cost": 100.0,
            "variant_attributes": [
                {
                    "name": "Size",
                    "values": [{"value": "Standard", "short_code": "STD"}]
                }
            ]
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201, f"FG item create failed: {fg_resp.text}"
        fg = fg_resp.json()
        
        # Create component
        comp_data = {
            "part_number": f"{TEST_PREFIX}SO-COMP-{unique_id}",
            "name": "Test Component for SO",
            "category": "Raw Materials",
            "unit_of_measure": "nos",
            "unit_cost": 10.0
        }
        comp_resp = session.post(f"{BASE_URL}/api/items", json=comp_data)
        assert comp_resp.status_code == 201, f"Component create failed: {comp_resp.text}"
        comp = comp_resp.json()
        
        # Create BOM
        bom_data = {
            "name": f"{TEST_PREFIX}SO-FG-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": comp["id"], "quantity": 1.0}
            ]
        }
        bom_resp = session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201], f"BOM create failed: {bom_resp.text}"
        bom = bom_resp.json()
        
        yield {"fg": fg, "component": comp, "bom": bom}
        
        # Cleanup
        # Delete any SOs created
        sos_resp = session.get(f"{BASE_URL}/api/production")
        if sos_resp.status_code == 200:
            for so in sos_resp.json():
                if so.get("bom_id") == bom["id"]:
                    session.delete(f"{BASE_URL}/api/production/{so['id']}")
        
        session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        session.delete(f"{BASE_URL}/api/items/{fg['id']}")
        session.delete(f"{BASE_URL}/api/items/{comp['id']}")
    
    def test_create_so_with_variant_selection(self, session, test_so_data):
        """POST /api/production creates SO with variant_selection on lines"""
        so_data = {
            "bom_id": test_so_data["bom"]["id"],
            "quantity": 5,
            "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "order_type": "mts",
            "lines": [
                {
                    "bom_id": test_so_data["bom"]["id"],
                    "quantity": 5,
                    "variant_selection": {"Size": "Standard"}
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/production", json=so_data)
        assert resp.status_code in [200, 201], f"SO create failed: {resp.text}"
        
        so = resp.json()
        assert "id" in so
        test_so_data["so_id"] = so["id"]
    
    def test_get_so_list(self, session, test_so_data):
        """GET /api/production returns SO list"""
        resp = session.get(f"{BASE_URL}/api/production")
        assert resp.status_code == 200
        
        sos = resp.json()
        assert isinstance(sos, list)
    
    def test_get_so_by_id(self, session, test_so_data):
        """GET /api/production/{id} returns specific SO"""
        if not test_so_data.get("so_id"):
            pytest.skip("No SO created")
        
        resp = session.get(f"{BASE_URL}/api/production/{test_so_data['so_id']}")
        assert resp.status_code == 200
        
        so = resp.json()
        assert so["id"] == test_so_data["so_id"]


class TestManufacturingOrderRegression:
    """Regression tests for Manufacturing Order creation from SO"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    def test_confirm_so_creates_mo(self, session):
        """POST /api/production/{id}/confirm creates MO from SO"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create test items
        fg_data = {
            "part_number": f"{TEST_PREFIX}MO-FG-{unique_id}",
            "name": "Test FG for MO",
            "category": "Finished Goods",
            "unit_of_measure": "nos",
            "unit_cost": 100.0
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201, f"FG item create failed: {fg_resp.text}"
        fg = fg_resp.json()
        
        comp_data = {
            "part_number": f"{TEST_PREFIX}MO-COMP-{unique_id}",
            "name": "Test Component for MO",
            "category": "Raw Materials",
            "unit_of_measure": "nos",
            "unit_cost": 10.0,
            "current_stock": 100  # Ensure stock available
        }
        comp_resp = session.post(f"{BASE_URL}/api/items", json=comp_data)
        assert comp_resp.status_code == 201, f"Component create failed: {comp_resp.text}"
        comp = comp_resp.json()
        
        # Create BOM
        bom_data = {
            "name": f"{TEST_PREFIX}MO-FG-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": comp["id"], "quantity": 1.0}
            ]
        }
        bom_resp = session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201], f"BOM create failed: {bom_resp.text}"
        bom = bom_resp.json()
        
        # Create SO
        so_data = {
            "bom_id": bom["id"],
            "quantity": 2,
            "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "order_type": "mts"
        }
        so_resp = session.post(f"{BASE_URL}/api/production", json=so_data)
        assert so_resp.status_code in [200, 201], f"SO create failed: {so_resp.text}"
        so = so_resp.json()
        
        # Confirm SO to create MO
        confirm_resp = session.post(f"{BASE_URL}/api/production/{so['id']}/confirm")
        # Confirm may return 200 or 201 depending on implementation
        assert confirm_resp.status_code in [200, 201], f"Confirm failed: {confirm_resp.text}"
        
        # Cleanup
        # Cancel SO first
        session.post(f"{BASE_URL}/api/production/{so['id']}/cancel")
        session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        session.delete(f"{BASE_URL}/api/items/{fg['id']}")
        session.delete(f"{BASE_URL}/api/items/{comp['id']}")


class TestPreviewVariantsEdgeCases:
    """Edge case tests for variant preview"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    def test_preview_no_variant_attributes(self, session):
        """Preview on item without variant_attributes returns empty"""
        # Create item without variant_attributes
        item_data = {
            "part_number": f"{TEST_PREFIX}NOVAR-001",
            "name": "Test No Variants",
            "category": "Finished Goods",
            "unit_of_measure": "nos"
        }
        resp = session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item = resp.json()
        
        # Preview should return empty combinations
        preview_resp = session.post(f"{BASE_URL}/api/items/{item['id']}/preview-variants")
        assert preview_resp.status_code == 200
        
        data = preview_resp.json()
        assert data["combinations"] == []
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/items/{item['id']}")
    
    def test_generate_no_variant_attributes_returns_400(self, session):
        """Generate on item without variant_attributes returns 400"""
        # Create item without variant_attributes
        item_data = {
            "part_number": f"{TEST_PREFIX}NOVAR-002",
            "name": "Test No Variants 2",
            "category": "Finished Goods",
            "unit_of_measure": "nos"
        }
        resp = session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item = resp.json()
        
        # Generate should return 400
        gen_resp = session.post(f"{BASE_URL}/api/items/{item['id']}/generate-variants", json={})
        assert gen_resp.status_code == 400
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/items/{item['id']}")
    
    def test_preview_nonexistent_item_returns_404(self, session):
        """Preview on non-existent item returns 404"""
        fake_id = str(uuid.uuid4())
        resp = session.post(f"{BASE_URL}/api/items/{fake_id}/preview-variants")
        assert resp.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
