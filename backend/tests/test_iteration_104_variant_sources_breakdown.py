"""
Iteration 104 - Variant Sources Breakdown Tests

Tests the new `variant_sources` field in GET /api/items/{id}/effective-variants:
1. FG with 2 variant-bearing BOM components on DIFFERENT axes → variant_sources has BOTH entries
2. Variant-CHILD references in BOM walk up to parent to surface variants
3. When source='own' (CP/RM with own variants), variant_sources is empty
4. Merged variant_attributes still contains the union of all axes

Test Coverage:
- GET /api/items/{id}/effective-variants response shape with variant_sources
- Multiple variant-bearing components on different axes
- Variant child → parent walkup logic
- source='own' returns empty variant_sources
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_BREAKDOWN_"


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


class TestVariantSourcesBreakdown:
    """Test variant_sources field in effective-variants response"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        return s
    
    @pytest.fixture(scope="class")
    def fg_with_two_variant_components(self, session):
        """
        Create FG with 2 variant-bearing BOM components on DIFFERENT axes:
        - Component A: Grit Size (16GT, 24GT, 30GT)
        - Component B: Sieve Slot (1.0mm, 1.5mm)
        
        This simulates the user's production data scenario.
        """
        unique_id = str(uuid.uuid4())[:8]
        
        # 1. Create Component A with Grit Size variants
        comp_a_data = {
            "part_number": f"{TEST_PREFIX}COMP-A-{unique_id}",
            "name": "Component A - Grit Size Variants",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
            "variant_attributes": [
                {
                    "name": "Grit Size",
                    "values": [
                        {"value": "16GT", "short_code": "16GT"},
                        {"value": "24GT", "short_code": "24GT"},
                        {"value": "30GT", "short_code": "30GT"}
                    ]
                }
            ]
        }
        comp_a_resp = session.post(f"{BASE_URL}/api/items", json=comp_a_data)
        assert comp_a_resp.status_code == 201, f"Failed to create Component A: {comp_a_resp.text}"
        comp_a = comp_a_resp.json()
        
        # 2. Create Component B with Sieve Slot variants
        comp_b_data = {
            "part_number": f"{TEST_PREFIX}COMP-B-{unique_id}",
            "name": "Component B - Sieve Slot Variants",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 30.0,
            "variant_attributes": [
                {
                    "name": "Sieve Slot",
                    "values": [
                        {"value": "1.0mm", "short_code": "10MM"},
                        {"value": "1.5mm", "short_code": "15MM"}
                    ]
                }
            ]
        }
        comp_b_resp = session.post(f"{BASE_URL}/api/items", json=comp_b_data)
        assert comp_b_resp.status_code == 201, f"Failed to create Component B: {comp_b_resp.text}"
        comp_b = comp_b_resp.json()
        
        # 3. Create FG item (no own variant_attributes)
        fg_data = {
            "part_number": f"{TEST_PREFIX}FG-{unique_id}",
            "name": "FG with Two Variant Components",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201, f"Failed to create FG: {fg_resp.text}"
        fg = fg_resp.json()
        
        # 4. Create BOM with both components
        bom_data = {
            "name": f"{TEST_PREFIX}FG-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": comp_a["id"], "quantity": 1.0},
                {"item_id": comp_b["id"], "quantity": 1.0}
            ],
            "parent_routings": [
                {"name": "Assembly", "cost": 100.0}
            ]
        }
        bom_resp = session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201], f"Failed to create BOM: {bom_resp.text}"
        bom = bom_resp.json()
        
        yield {
            "fg": fg,
            "comp_a": comp_a,
            "comp_b": comp_b,
            "bom": bom,
            "unique_id": unique_id
        }
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        session.delete(f"{BASE_URL}/api/items/{fg['id']}")
        session.delete(f"{BASE_URL}/api/items/{comp_a['id']}")
        session.delete(f"{BASE_URL}/api/items/{comp_b['id']}")
    
    def test_variant_sources_has_both_components(self, session, fg_with_two_variant_components):
        """
        Test: FG with 2 variant-bearing BOM components on DIFFERENT axes
        Expected: variant_sources has BOTH entries (Component A and Component B)
        """
        setup = fg_with_two_variant_components
        fg = setup["fg"]
        comp_a = setup["comp_a"]
        comp_b = setup["comp_b"]
        
        # Call effective-variants endpoint
        resp = session.get(f"{BASE_URL}/api/items/{fg['id']}/effective-variants")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        
        # Verify response structure
        assert "variant_sources" in data, f"Expected 'variant_sources' in response, got keys: {data.keys()}"
        assert "variant_attributes" in data, f"Expected 'variant_attributes' in response"
        assert data["source"] == "inherited", f"Expected source='inherited', got {data['source']}"
        
        # Verify variant_sources has BOTH components
        variant_sources = data["variant_sources"]
        assert len(variant_sources) == 2, \
            f"Expected 2 entries in variant_sources (one per component), got {len(variant_sources)}: {variant_sources}"
        
        # Extract component part numbers from variant_sources
        source_part_numbers = [s.get("component_part_number") for s in variant_sources]
        
        assert comp_a["part_number"] in source_part_numbers, \
            f"Expected Component A ({comp_a['part_number']}) in variant_sources, got {source_part_numbers}"
        assert comp_b["part_number"] in source_part_numbers, \
            f"Expected Component B ({comp_b['part_number']}) in variant_sources, got {source_part_numbers}"
        
        # Verify each source has correct variant_attributes
        comp_a_source = next((s for s in variant_sources if s.get("component_part_number") == comp_a["part_number"]), None)
        comp_b_source = next((s for s in variant_sources if s.get("component_part_number") == comp_b["part_number"]), None)
        
        assert comp_a_source is not None, "Component A not found in variant_sources"
        assert comp_b_source is not None, "Component B not found in variant_sources"
        
        # Component A should have Grit Size
        comp_a_attrs = [a["name"] for a in comp_a_source.get("variant_attributes", [])]
        assert "Grit Size" in comp_a_attrs, f"Expected 'Grit Size' in Component A attrs, got {comp_a_attrs}"
        
        # Component B should have Sieve Slot
        comp_b_attrs = [a["name"] for a in comp_b_source.get("variant_attributes", [])]
        assert "Sieve Slot" in comp_b_attrs, f"Expected 'Sieve Slot' in Component B attrs, got {comp_b_attrs}"
        
        print(f"TEST PASSED: variant_sources has BOTH components with correct axes")
        print(f"  - Component A ({comp_a['part_number']}): {comp_a_attrs}")
        print(f"  - Component B ({comp_b['part_number']}): {comp_b_attrs}")
    
    def test_merged_variant_attributes_has_union(self, session, fg_with_two_variant_components):
        """
        Test: Merged variant_attributes contains the union of all axes
        Expected: variant_attributes has both Grit Size AND Sieve Slot
        """
        setup = fg_with_two_variant_components
        fg = setup["fg"]
        
        # Call effective-variants endpoint
        resp = session.get(f"{BASE_URL}/api/items/{fg['id']}/effective-variants")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        
        # Verify merged variant_attributes has both axes
        variant_attributes = data.get("variant_attributes", [])
        attr_names = [a["name"] for a in variant_attributes]
        
        assert "Grit Size" in attr_names, f"Expected 'Grit Size' in merged variant_attributes, got {attr_names}"
        assert "Sieve Slot" in attr_names, f"Expected 'Sieve Slot' in merged variant_attributes, got {attr_names}"
        
        # Verify Grit Size has all 3 values
        grit_attr = next((a for a in variant_attributes if a["name"] == "Grit Size"), None)
        assert grit_attr is not None
        grit_values = [v["value"] for v in grit_attr.get("values", [])]
        assert "16GT" in grit_values, f"Expected '16GT' in Grit Size values, got {grit_values}"
        assert "24GT" in grit_values, f"Expected '24GT' in Grit Size values, got {grit_values}"
        assert "30GT" in grit_values, f"Expected '30GT' in Grit Size values, got {grit_values}"
        
        # Verify Sieve Slot has all 2 values
        sieve_attr = next((a for a in variant_attributes if a["name"] == "Sieve Slot"), None)
        assert sieve_attr is not None
        sieve_values = [v["value"] for v in sieve_attr.get("values", [])]
        assert "1.0mm" in sieve_values, f"Expected '1.0mm' in Sieve Slot values, got {sieve_values}"
        assert "1.5mm" in sieve_values, f"Expected '1.5mm' in Sieve Slot values, got {sieve_values}"
        
        print(f"TEST PASSED: Merged variant_attributes has union of both axes")
        print(f"  - Grit Size: {grit_values}")
        print(f"  - Sieve Slot: {sieve_values}")


class TestVariantChildWalkup:
    """Test that variant-CHILD references in BOM walk up to parent"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        return s
    
    @pytest.fixture(scope="class")
    def fg_with_variant_child_component(self, session):
        """
        Create setup where BOM points at a VARIANT CHILD item (not the parent):
        1. Create parent component with variants (Motor Power: 1HP, 2HP)
        2. Generate variant children (COMP-1HP, COMP-2HP)
        3. Create FG with BOM containing the CHILD (COMP-1HP), not the parent
        4. Verify FG's effective-variants still surfaces the parent's axes
        """
        unique_id = str(uuid.uuid4())[:8]
        
        # 1. Create parent component with variants
        parent_comp_data = {
            "part_number": f"{TEST_PREFIX}PARENT-COMP-{unique_id}",
            "name": "Parent Component with Variants",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0,
            "variant_attributes": [
                {
                    "name": "Motor Power",
                    "values": [
                        {"value": "1HP", "short_code": "1HP"},
                        {"value": "2HP", "short_code": "2HP"}
                    ]
                }
            ]
        }
        parent_resp = session.post(f"{BASE_URL}/api/items", json=parent_comp_data)
        assert parent_resp.status_code == 201, f"Failed to create parent component: {parent_resp.text}"
        parent_comp = parent_resp.json()
        
        # 2. Generate variant children
        gen_resp = session.post(f"{BASE_URL}/api/items/{parent_comp['id']}/generate-variants", json={})
        assert gen_resp.status_code == 200, f"Failed to generate variants: {gen_resp.text}"
        
        # Get variant children
        variants_resp = session.get(f"{BASE_URL}/api/items/{parent_comp['id']}/variants")
        assert variants_resp.status_code == 200
        variants = variants_resp.json()
        
        # Find the 1HP variant child
        child_1hp = next((v for v in variants if "1HP" in v["part_number"]), None)
        assert child_1hp is not None, f"1HP variant child not found. Variants: {[v['part_number'] for v in variants]}"
        
        # Verify child has is_variant=True and parent_item_id set
        assert child_1hp.get("is_variant") == True, f"Expected is_variant=True, got {child_1hp.get('is_variant')}"
        assert child_1hp.get("parent_item_id") == parent_comp["id"], \
            f"Expected parent_item_id={parent_comp['id']}, got {child_1hp.get('parent_item_id')}"
        
        # 3. Create FG item
        fg_data = {
            "part_number": f"{TEST_PREFIX}FG-CHILD-{unique_id}",
            "name": "FG with Variant Child Component",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201, f"Failed to create FG: {fg_resp.text}"
        fg = fg_resp.json()
        
        # 4. Create BOM with the CHILD (not the parent)
        bom_data = {
            "name": f"{TEST_PREFIX}FG-CHILD-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": child_1hp["id"], "quantity": 1.0}  # Using CHILD, not parent
            ],
            "parent_routings": [
                {"name": "Assembly", "cost": 100.0}
            ]
        }
        bom_resp = session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201], f"Failed to create BOM: {bom_resp.text}"
        bom = bom_resp.json()
        
        yield {
            "fg": fg,
            "parent_comp": parent_comp,
            "child_1hp": child_1hp,
            "variants": variants,
            "bom": bom,
            "unique_id": unique_id
        }
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        session.delete(f"{BASE_URL}/api/items/{fg['id']}")
        for v in variants:
            session.delete(f"{BASE_URL}/api/items/{v['id']}")
        session.delete(f"{BASE_URL}/api/items/{parent_comp['id']}")
    
    def test_variant_child_walks_up_to_parent(self, session, fg_with_variant_child_component):
        """
        Test: BOM points at variant CHILD (is_variant=true, parent_item_id set)
        Expected: effective-variants walks up to parent and surfaces parent's variant_attributes
        """
        setup = fg_with_variant_child_component
        fg = setup["fg"]
        parent_comp = setup["parent_comp"]
        child_1hp = setup["child_1hp"]
        
        # Call effective-variants endpoint
        resp = session.get(f"{BASE_URL}/api/items/{fg['id']}/effective-variants")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        
        # Verify source is inherited (from parent via child walkup)
        assert data["source"] == "inherited", f"Expected source='inherited', got {data['source']}"
        
        # Verify variant_attributes contains Motor Power (from parent)
        variant_attributes = data.get("variant_attributes", [])
        attr_names = [a["name"] for a in variant_attributes]
        
        assert "Motor Power" in attr_names, \
            f"Expected 'Motor Power' in variant_attributes (walked up from parent), got {attr_names}"
        
        # Verify Motor Power has both values (1HP and 2HP)
        motor_attr = next((a for a in variant_attributes if a["name"] == "Motor Power"), None)
        assert motor_attr is not None
        motor_values = [v["value"] for v in motor_attr.get("values", [])]
        assert "1HP" in motor_values, f"Expected '1HP' in Motor Power values, got {motor_values}"
        assert "2HP" in motor_values, f"Expected '2HP' in Motor Power values, got {motor_values}"
        
        # Verify variant_sources references the PARENT (not the child)
        variant_sources = data.get("variant_sources", [])
        assert len(variant_sources) >= 1, f"Expected at least 1 entry in variant_sources, got {len(variant_sources)}"
        
        source_part_numbers = [s.get("component_part_number") for s in variant_sources]
        
        # The source should be the PARENT component (walked up from child)
        assert parent_comp["part_number"] in source_part_numbers, \
            f"Expected parent ({parent_comp['part_number']}) in variant_sources (walked up from child), got {source_part_numbers}"
        
        # The child should NOT be in variant_sources (it has no own variant_attributes)
        assert child_1hp["part_number"] not in source_part_numbers, \
            f"Child ({child_1hp['part_number']}) should NOT be in variant_sources (it's a variant child, not a variant-bearing item)"
        
        print(f"TEST PASSED: Variant child walks up to parent")
        print(f"  - BOM component: {child_1hp['part_number']} (variant child)")
        print(f"  - Walked up to: {parent_comp['part_number']} (parent)")
        print(f"  - Surfaced axes: {attr_names}")


class TestSourceOwnEmptyVariantSources:
    """Test that source='own' returns empty variant_sources"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        return s
    
    @pytest.fixture(scope="class")
    def component_with_own_variants(self, session):
        """Create a component with its own variant_attributes"""
        unique_id = str(uuid.uuid4())[:8]
        
        comp_data = {
            "part_number": f"{TEST_PREFIX}OWN-COMP-{unique_id}",
            "name": "Component with Own Variants",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
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
        comp_resp = session.post(f"{BASE_URL}/api/items", json=comp_data)
        assert comp_resp.status_code == 201, f"Failed to create component: {comp_resp.text}"
        comp = comp_resp.json()
        
        yield comp
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/items/{comp['id']}")
    
    def test_source_own_has_empty_variant_sources(self, session, component_with_own_variants):
        """
        Test: Component/RM with own variant_attributes
        Expected: source='own' and variant_sources is empty (only used for inherited FG/SG)
        """
        comp = component_with_own_variants
        
        # Call effective-variants endpoint
        resp = session.get(f"{BASE_URL}/api/items/{comp['id']}/effective-variants")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        
        # Verify source is 'own'
        assert data["source"] == "own", f"Expected source='own', got {data['source']}"
        
        # Verify variant_sources is empty
        variant_sources = data.get("variant_sources", [])
        assert len(variant_sources) == 0, \
            f"Expected empty variant_sources for source='own', got {len(variant_sources)} entries: {variant_sources}"
        
        # Verify variant_attributes is still populated
        variant_attributes = data.get("variant_attributes", [])
        assert len(variant_attributes) > 0, f"Expected variant_attributes to be populated"
        
        attr_names = [a["name"] for a in variant_attributes]
        assert "Color" in attr_names, f"Expected 'Color' in variant_attributes, got {attr_names}"
        
        print(f"TEST PASSED: source='own' has empty variant_sources")
        print(f"  - source: {data['source']}")
        print(f"  - variant_sources: {variant_sources} (empty as expected)")
        print(f"  - variant_attributes: {attr_names}")


class TestRawMaterialOwnVariants:
    """Test raw material with own variants also returns empty variant_sources"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        return s
    
    @pytest.fixture(scope="class")
    def rm_with_own_variants(self, session):
        """Create a raw material with its own variant_attributes"""
        unique_id = str(uuid.uuid4())[:8]
        
        rm_data = {
            "part_number": f"{TEST_PREFIX}OWN-RM-{unique_id}",
            "name": "Raw Material with Own Variants",
            "category": "raw_material",
            "unit_of_measure": "pcs",
            "unit_cost": 10.0,
            "variant_attributes": [
                {
                    "name": "Grade",
                    "values": [
                        {"value": "A", "short_code": "A"},
                        {"value": "B", "short_code": "B"}
                    ]
                }
            ]
        }
        rm_resp = session.post(f"{BASE_URL}/api/items", json=rm_data)
        assert rm_resp.status_code == 201, f"Failed to create RM: {rm_resp.text}"
        rm = rm_resp.json()
        
        yield rm
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/items/{rm['id']}")
    
    def test_rm_source_own_has_empty_variant_sources(self, session, rm_with_own_variants):
        """
        Test: Raw Material with own variant_attributes
        Expected: source='own' and variant_sources is empty
        """
        rm = rm_with_own_variants
        
        # Call effective-variants endpoint
        resp = session.get(f"{BASE_URL}/api/items/{rm['id']}/effective-variants")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        
        # Verify source is 'own'
        assert data["source"] == "own", f"Expected source='own', got {data['source']}"
        
        # Verify variant_sources is empty
        variant_sources = data.get("variant_sources", [])
        assert len(variant_sources) == 0, \
            f"Expected empty variant_sources for RM with source='own', got {len(variant_sources)} entries"
        
        print(f"TEST PASSED: RM with source='own' has empty variant_sources")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
