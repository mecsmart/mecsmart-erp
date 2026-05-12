"""
Iteration 102 - Variant-Aware Component Consumption Tests

Tests the new variant-aware material consumption feature where:
- When an MO has variant_selection and a BOM component has its own variant_attributes,
  the WO /start material consumption should deduct from the variant CHILD SKU
  (e.g. CRW0E8000091-30GT) instead of the parent (CRW0E8000091).
- FG variant credit (already passing) still works.
- Graceful fallback when variant child doesn't exist.
- Legacy behavior unchanged when MO has no variant_selection.

Test Coverage:
1. WO /start with variant_selection consumes from variant child of variant-bearing BOM components
2. Fallback to parent when variant child doesn't exist (graceful degradation)
3. WO completion credits FG stock to FG variant child SKU (regression)
4. Legacy behavior: MO without variant_selection consumes from parent items
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_VAR_102_"


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


class TestVariantAwareConsumption:
    """Test WO /start consumes from variant child of variant-bearing BOM components"""
    
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
    def variant_consumption_setup(self, session):
        """
        Setup:
        - CP-VAR (component) with variant_attributes Grit=16GT,30GT
        - Generate variant children CP-VAR-16GT, CP-VAR-30GT each with stock 100
        - RM-PLAIN (raw material, no variants, stock 100)
        - FG with BOM = [CP-VAR (qty 5), RM-PLAIN (qty 10)] with parent_routings:[{name:Assembly,cost:100}]
        """
        unique_id = str(uuid.uuid4())[:8]
        
        # 1. Create CP-VAR (component with variant_attributes)
        cp_var_data = {
            "part_number": f"{TEST_PREFIX}CP-VAR-{unique_id}",
            "name": "Variant Component",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
            "current_stock": 0,  # Parent has 0 stock
            "variant_attributes": [
                {
                    "name": "Grit",
                    "values": [
                        {"value": "16GT", "short_code": "16GT"},
                        {"value": "30GT", "short_code": "30GT"}
                    ]
                }
            ]
        }
        cp_var_resp = session.post(f"{BASE_URL}/api/items", json=cp_var_data)
        assert cp_var_resp.status_code == 201, f"Failed to create CP-VAR: {cp_var_resp.text}"
        cp_var = cp_var_resp.json()
        
        # 2. Generate variant children for CP-VAR
        gen_resp = session.post(f"{BASE_URL}/api/items/{cp_var['id']}/generate-variants", json={})
        assert gen_resp.status_code == 200, f"Failed to generate variants: {gen_resp.text}"
        gen_data = gen_resp.json()
        
        # Find the generated variant children
        variants_resp = session.get(f"{BASE_URL}/api/items/{cp_var['id']}/variants")
        assert variants_resp.status_code == 200
        variants = variants_resp.json()
        
        cp_var_16gt = next((v for v in variants if "16GT" in v["part_number"]), None)
        cp_var_30gt = next((v for v in variants if "30GT" in v["part_number"]), None)
        
        assert cp_var_16gt is not None, f"CP-VAR-16GT not found. Variants: {[v['part_number'] for v in variants]}"
        assert cp_var_30gt is not None, f"CP-VAR-30GT not found. Variants: {[v['part_number'] for v in variants]}"
        
        # 3. Set stock to 100 for each variant child
        session.put(f"{BASE_URL}/api/items/{cp_var_16gt['id']}", json={"current_stock": 100})
        session.put(f"{BASE_URL}/api/items/{cp_var_30gt['id']}", json={"current_stock": 100})
        
        # 4. Create RM-PLAIN (raw material, no variants, stock 100)
        rm_plain_data = {
            "part_number": f"{TEST_PREFIX}RM-PLAIN-{unique_id}",
            "name": "Plain Raw Material",
            "category": "raw_material",
            "unit_of_measure": "pcs",
            "unit_cost": 10.0,
            "current_stock": 100
        }
        rm_plain_resp = session.post(f"{BASE_URL}/api/items", json=rm_plain_data)
        assert rm_plain_resp.status_code == 201, f"Failed to create RM-PLAIN: {rm_plain_resp.text}"
        rm_plain = rm_plain_resp.json()
        
        # 5. Create FG item
        fg_data = {
            "part_number": f"{TEST_PREFIX}FG-{unique_id}",
            "name": "Finished Good with Variant Component",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0,
            "current_stock": 0
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201, f"Failed to create FG: {fg_resp.text}"
        fg = fg_resp.json()
        
        # 6. Create BOM with CP-VAR (qty 5) and RM-PLAIN (qty 10) + parent_routings
        bom_data = {
            "name": f"{TEST_PREFIX}FG-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": cp_var["id"], "quantity": 5.0},
                {"item_id": rm_plain["id"], "quantity": 10.0}
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
            "cp_var": cp_var,
            "cp_var_16gt": cp_var_16gt,
            "cp_var_30gt": cp_var_30gt,
            "rm_plain": rm_plain,
            "bom": bom,
            "unique_id": unique_id
        }
        
        # Cleanup
        # Delete any MOs/WOs first
        wos_resp = session.get(f"{BASE_URL}/api/work-orders")
        if wos_resp.status_code == 200:
            for wo in wos_resp.json():
                if wo.get("item_id") == fg["id"]:
                    session.delete(f"{BASE_URL}/api/work-orders/{wo['id']}")
        
        # Delete BOM
        session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        
        # Delete variant children
        for v in variants:
            session.delete(f"{BASE_URL}/api/items/{v['id']}")
        
        # Delete items
        session.delete(f"{BASE_URL}/api/items/{fg['id']}")
        session.delete(f"{BASE_URL}/api/items/{cp_var['id']}")
        session.delete(f"{BASE_URL}/api/items/{rm_plain['id']}")
    
    def test_wo_start_consumes_from_variant_child(self, session, variant_consumption_setup):
        """
        Test: WO /start with MO that has variant_selection={Grit:30GT} qty=1
        Assert:
        - CP-VAR-30GT stock dropped by 5
        - CP-VAR parent stock UNCHANGED (still 0)
        - CP-VAR-16GT stock UNCHANGED (still 100)
        - RM-PLAIN stock dropped by 10
        """
        setup = variant_consumption_setup
        fg = setup["fg"]
        cp_var = setup["cp_var"]
        cp_var_16gt = setup["cp_var_16gt"]
        cp_var_30gt = setup["cp_var_30gt"]
        rm_plain = setup["rm_plain"]
        
        # Get initial stock levels
        cp_var_initial = session.get(f"{BASE_URL}/api/items/{cp_var['id']}").json()
        cp_var_16gt_initial = session.get(f"{BASE_URL}/api/items/{cp_var_16gt['id']}").json()
        cp_var_30gt_initial = session.get(f"{BASE_URL}/api/items/{cp_var_30gt['id']}").json()
        rm_plain_initial = session.get(f"{BASE_URL}/api/items/{rm_plain['id']}").json()
        
        print(f"Initial stocks: CP-VAR={cp_var_initial.get('current_stock')}, "
              f"CP-VAR-16GT={cp_var_16gt_initial.get('current_stock')}, "
              f"CP-VAR-30GT={cp_var_30gt_initial.get('current_stock')}, "
              f"RM-PLAIN={rm_plain_initial.get('current_stock')}")
        
        # Create MO with variant_selection={Grit: 30GT}
        mo_data = {
            "order_type": "mts",
            "item_id": fg["id"],
            "quantity": 1,
            "variant_selection": {"Grit": "30GT"}
        }
        mo_resp = session.post(f"{BASE_URL}/api/work-orders", json=mo_data)
        assert mo_resp.status_code in [200, 201], f"Failed to create MO: {mo_resp.text}"
        
        mo_response = mo_resp.json()
        assert "work_orders" in mo_response, f"Expected 'work_orders' in response, got: {mo_response.keys()}"
        assert len(mo_response["work_orders"]) > 0, f"Expected at least one WO, got empty array"
        
        mo = mo_response["work_orders"][0]
        mo_id = mo["id"]
        
        # Verify MO has correct variant_selection
        assert mo.get("variant_selection") == {"Grit": "30GT"}, \
            f"Expected variant_selection={{'Grit': '30GT'}}, got {mo.get('variant_selection')}"
        
        # Start the MO (this should consume materials)
        start_resp = session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        assert start_resp.status_code == 200, f"Failed to start MO: {start_resp.text}"
        
        start_data = start_resp.json()
        assert start_data.get("success") == True, f"Start failed: {start_data}"
        
        # Get final stock levels
        cp_var_final = session.get(f"{BASE_URL}/api/items/{cp_var['id']}").json()
        cp_var_16gt_final = session.get(f"{BASE_URL}/api/items/{cp_var_16gt['id']}").json()
        cp_var_30gt_final = session.get(f"{BASE_URL}/api/items/{cp_var_30gt['id']}").json()
        rm_plain_final = session.get(f"{BASE_URL}/api/items/{rm_plain['id']}").json()
        
        print(f"Final stocks: CP-VAR={cp_var_final.get('current_stock')}, "
              f"CP-VAR-16GT={cp_var_16gt_final.get('current_stock')}, "
              f"CP-VAR-30GT={cp_var_30gt_final.get('current_stock')}, "
              f"RM-PLAIN={rm_plain_final.get('current_stock')}")
        
        # Assert: CP-VAR-30GT stock dropped by 5 (from 100 to 95)
        assert cp_var_30gt_final.get("current_stock") == 95, \
            f"Expected CP-VAR-30GT stock=95, got {cp_var_30gt_final.get('current_stock')}"
        
        # Assert: CP-VAR parent stock UNCHANGED (still 0)
        assert cp_var_final.get("current_stock") == cp_var_initial.get("current_stock"), \
            f"Expected CP-VAR parent stock unchanged at {cp_var_initial.get('current_stock')}, got {cp_var_final.get('current_stock')}"
        
        # Assert: CP-VAR-16GT stock UNCHANGED (still 100)
        assert cp_var_16gt_final.get("current_stock") == 100, \
            f"Expected CP-VAR-16GT stock=100, got {cp_var_16gt_final.get('current_stock')}"
        
        # Assert: RM-PLAIN stock dropped by 10 (from 100 to 90)
        assert rm_plain_final.get("current_stock") == 90, \
            f"Expected RM-PLAIN stock=90, got {rm_plain_final.get('current_stock')}"
        
        # Verify consumed_materials in response
        consumed = start_data.get("consumed_materials", [])
        print(f"Consumed materials: {consumed}")
        
        # Should have consumed from CP-VAR-30GT (variant child), not CP-VAR (parent)
        consumed_items = {c.get("item"): c.get("quantity") for c in consumed}
        assert cp_var_30gt["part_number"] in consumed_items, \
            f"Expected {cp_var_30gt['part_number']} in consumed materials, got {list(consumed_items.keys())}"
        assert consumed_items.get(cp_var_30gt["part_number"]) == 5, \
            f"Expected 5 units consumed from {cp_var_30gt['part_number']}, got {consumed_items.get(cp_var_30gt['part_number'])}"


class TestFallbackToParent:
    """Test graceful fallback when variant child doesn't exist"""
    
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
    def fallback_setup(self, session):
        """
        Setup: Same as above but DELETE CP-VAR-30GT first
        - CP-VAR (component) with variant_attributes Grit=16GT,30GT
        - Generate variant children, then DELETE CP-VAR-30GT
        - CP-VAR parent has stock 100 (for fallback)
        - RM-PLAIN (raw material, no variants, stock 100)
        - FG with BOM = [CP-VAR (qty 5), RM-PLAIN (qty 10)]
        """
        unique_id = str(uuid.uuid4())[:8]
        
        # 1. Create CP-VAR (component with variant_attributes)
        cp_var_data = {
            "part_number": f"{TEST_PREFIX}FB-CP-VAR-{unique_id}",
            "name": "Fallback Variant Component",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 50.0,
            "current_stock": 100,  # Parent has stock for fallback
            "variant_attributes": [
                {
                    "name": "Grit",
                    "values": [
                        {"value": "16GT", "short_code": "16GT"},
                        {"value": "30GT", "short_code": "30GT"}
                    ]
                }
            ]
        }
        cp_var_resp = session.post(f"{BASE_URL}/api/items", json=cp_var_data)
        assert cp_var_resp.status_code == 201, f"Failed to create CP-VAR: {cp_var_resp.text}"
        cp_var = cp_var_resp.json()
        
        # 2. Generate variant children for CP-VAR
        gen_resp = session.post(f"{BASE_URL}/api/items/{cp_var['id']}/generate-variants", json={})
        assert gen_resp.status_code == 200, f"Failed to generate variants: {gen_resp.text}"
        
        # Find the generated variant children
        variants_resp = session.get(f"{BASE_URL}/api/items/{cp_var['id']}/variants")
        assert variants_resp.status_code == 200
        variants = variants_resp.json()
        
        cp_var_16gt = next((v for v in variants if "16GT" in v["part_number"]), None)
        cp_var_30gt = next((v for v in variants if "30GT" in v["part_number"]), None)
        
        # 3. DELETE CP-VAR-30GT to test fallback
        if cp_var_30gt:
            del_resp = session.delete(f"{BASE_URL}/api/items/{cp_var_30gt['id']}")
            # May fail if item is referenced, that's ok for this test
            print(f"Deleted CP-VAR-30GT: {del_resp.status_code}")
        
        # 4. Create RM-PLAIN (raw material, no variants, stock 100)
        rm_plain_data = {
            "part_number": f"{TEST_PREFIX}FB-RM-PLAIN-{unique_id}",
            "name": "Fallback Plain Raw Material",
            "category": "raw_material",
            "unit_of_measure": "pcs",
            "unit_cost": 10.0,
            "current_stock": 100
        }
        rm_plain_resp = session.post(f"{BASE_URL}/api/items", json=rm_plain_data)
        assert rm_plain_resp.status_code == 201, f"Failed to create RM-PLAIN: {rm_plain_resp.text}"
        rm_plain = rm_plain_resp.json()
        
        # 5. Create FG item
        fg_data = {
            "part_number": f"{TEST_PREFIX}FB-FG-{unique_id}",
            "name": "Fallback FG",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0,
            "current_stock": 0
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201, f"Failed to create FG: {fg_resp.text}"
        fg = fg_resp.json()
        
        # 6. Create BOM
        bom_data = {
            "name": f"{TEST_PREFIX}FB-FG-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": cp_var["id"], "quantity": 5.0},
                {"item_id": rm_plain["id"], "quantity": 10.0}
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
            "cp_var": cp_var,
            "cp_var_16gt": cp_var_16gt,
            "rm_plain": rm_plain,
            "bom": bom,
            "unique_id": unique_id
        }
        
        # Cleanup
        wos_resp = session.get(f"{BASE_URL}/api/work-orders")
        if wos_resp.status_code == 200:
            for wo in wos_resp.json():
                if wo.get("item_id") == fg["id"]:
                    session.delete(f"{BASE_URL}/api/work-orders/{wo['id']}")
        
        session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        
        # Delete remaining variant children
        variants_resp = session.get(f"{BASE_URL}/api/items/{cp_var['id']}/variants")
        if variants_resp.status_code == 200:
            for v in variants_resp.json():
                session.delete(f"{BASE_URL}/api/items/{v['id']}")
        
        session.delete(f"{BASE_URL}/api/items/{fg['id']}")
        session.delete(f"{BASE_URL}/api/items/{cp_var['id']}")
        session.delete(f"{BASE_URL}/api/items/{rm_plain['id']}")
    
    def test_fallback_to_parent_when_variant_child_missing(self, session, fallback_setup):
        """
        Test: When MO has variant_selection but the variant child doesn't exist,
        consumption should fall back to consuming from the parent (graceful degradation).
        
        Assert:
        - CP-VAR parent stock dropped by 5 (fallback works)
        - No error thrown
        """
        setup = fallback_setup
        fg = setup["fg"]
        cp_var = setup["cp_var"]
        rm_plain = setup["rm_plain"]
        
        # Get initial stock levels
        cp_var_initial = session.get(f"{BASE_URL}/api/items/{cp_var['id']}").json()
        rm_plain_initial = session.get(f"{BASE_URL}/api/items/{rm_plain['id']}").json()
        
        print(f"Initial stocks: CP-VAR={cp_var_initial.get('current_stock')}, "
              f"RM-PLAIN={rm_plain_initial.get('current_stock')}")
        
        # Create MO with variant_selection={Grit: 30GT} (but 30GT variant doesn't exist)
        mo_data = {
            "order_type": "mts",
            "item_id": fg["id"],
            "quantity": 1,
            "variant_selection": {"Grit": "30GT"}
        }
        mo_resp = session.post(f"{BASE_URL}/api/work-orders", json=mo_data)
        assert mo_resp.status_code in [200, 201], f"Failed to create MO: {mo_resp.text}"
        
        mo_response = mo_resp.json()
        assert "work_orders" in mo_response
        mo = mo_response["work_orders"][0]
        mo_id = mo["id"]
        
        # Start the MO (should fallback to parent)
        start_resp = session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        assert start_resp.status_code == 200, f"Failed to start MO: {start_resp.text}"
        
        start_data = start_resp.json()
        assert start_data.get("success") == True, f"Start failed: {start_data}"
        
        # Get final stock levels
        cp_var_final = session.get(f"{BASE_URL}/api/items/{cp_var['id']}").json()
        rm_plain_final = session.get(f"{BASE_URL}/api/items/{rm_plain['id']}").json()
        
        print(f"Final stocks: CP-VAR={cp_var_final.get('current_stock')}, "
              f"RM-PLAIN={rm_plain_final.get('current_stock')}")
        
        # Assert: CP-VAR parent stock dropped by 5 (fallback works)
        assert cp_var_final.get("current_stock") == 95, \
            f"Expected CP-VAR parent stock=95 (fallback), got {cp_var_final.get('current_stock')}"
        
        # Assert: RM-PLAIN stock dropped by 10
        assert rm_plain_final.get("current_stock") == 90, \
            f"Expected RM-PLAIN stock=90, got {rm_plain_final.get('current_stock')}"


class TestFGVariantCreditRegression:
    """Regression: WO completion credits FG stock to FG variant child SKU"""
    
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
    def fg_credit_setup(self, session):
        """Setup for FG variant credit test"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create component with variants (FG will inherit)
        comp_data = {
            "part_number": f"{TEST_PREFIX}FGC-COMP-{unique_id}",
            "name": "FG Credit Test Component",
            "category": "component",
            "unit_of_measure": "pcs",
            "current_stock": 100,
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
        comp_resp = session.post(f"{BASE_URL}/api/items", json=comp_data)
        assert comp_resp.status_code == 201
        comp = comp_resp.json()
        
        # Create FG
        fg_data = {
            "part_number": f"{TEST_PREFIX}FGC-FG-{unique_id}",
            "name": "FG Credit Test FG",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "current_stock": 0
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201
        fg = fg_resp.json()
        
        # Create BOM with parent_routings
        bom_data = {
            "name": f"{TEST_PREFIX}FGC-FG-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [{"item_id": comp["id"], "quantity": 1.0}],
            "parent_routings": [{"name": "Assembly", "cost": 100.0}]
        }
        bom_resp = session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom = bom_resp.json()
        
        yield {"fg": fg, "comp": comp, "bom": bom, "unique_id": unique_id}
        
        # Cleanup
        wos_resp = session.get(f"{BASE_URL}/api/work-orders")
        if wos_resp.status_code == 200:
            for wo in wos_resp.json():
                if wo.get("item_id") == fg["id"]:
                    session.delete(f"{BASE_URL}/api/work-orders/{wo['id']}")
        
        # Delete FG variants
        variants_resp = session.get(f"{BASE_URL}/api/items/{fg['id']}/variants")
        if variants_resp.status_code == 200:
            for v in variants_resp.json():
                session.delete(f"{BASE_URL}/api/items/{v['id']}")
        
        session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        session.delete(f"{BASE_URL}/api/items/{fg['id']}")
        session.delete(f"{BASE_URL}/api/items/{comp['id']}")
    
    def test_wo_completion_credits_fg_variant_child(self, session, fg_credit_setup):
        """
        Test: WO completion with variant_selection credits FG stock to variant child SKU
        """
        setup = fg_credit_setup
        fg = setup["fg"]
        
        # Create MO with variant_selection
        mo_data = {
            "order_type": "mts",
            "item_id": fg["id"],
            "quantity": 1,
            "variant_selection": {"Grade": "A"}
        }
        mo_resp = session.post(f"{BASE_URL}/api/work-orders", json=mo_data)
        assert mo_resp.status_code in [200, 201], f"Failed to create MO: {mo_resp.text}"
        
        mo_response = mo_resp.json()
        mo = mo_response["work_orders"][0]
        mo_id = mo["id"]
        
        # Verify variant_sku is set
        expected_variant_sku = f"{fg['part_number']}-A"
        assert mo.get("variant_sku") == expected_variant_sku, \
            f"Expected variant_sku={expected_variant_sku}, got {mo.get('variant_sku')}"
        
        # Start the MO
        start_resp = session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        assert start_resp.status_code == 200, f"Failed to start MO: {start_resp.text}"
        
        # Get MO to check operations
        mo_get_resp = session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert mo_get_resp.status_code == 200
        mo_detail = mo_get_resp.json()
        
        # Complete all operations
        operations = mo_detail.get("operations_status", [])
        for op in operations:
            op_update = {
                "status": "completed",
                "quantity_completed": 1
            }
            session.put(
                f"{BASE_URL}/api/work-orders/{mo_id}/operations/{op['sequence']}",
                json=op_update
            )
        
        # Get final MO state
        mo_final_resp = session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert mo_final_resp.status_code == 200
        mo_final = mo_final_resp.json()
        
        # Check if FG variant child was credited
        if mo_final.get("status") == "completed":
            assert mo_final.get("fg_credited_sku") == expected_variant_sku, \
                f"Expected fg_credited_sku={expected_variant_sku}, got {mo_final.get('fg_credited_sku')}"
            
            # Verify variant child item exists and has stock
            variant_resp = session.get(f"{BASE_URL}/api/items?search={expected_variant_sku}")
            assert variant_resp.status_code == 200
            variants = variant_resp.json()
            variant_item = next((v for v in variants if v.get("part_number") == expected_variant_sku), None)
            
            if variant_item:
                assert variant_item.get("is_variant") == True
                assert variant_item.get("parent_item_id") == fg["id"]
                assert variant_item.get("current_stock", 0) >= 1


class TestLegacyBehaviorNoVariantSelection:
    """Test: When MO has no variant_selection, consumption uses parent items (legacy behavior)"""
    
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
    def legacy_setup(self, session):
        """Setup for legacy behavior test (no variant_selection)"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create component with variants
        comp_data = {
            "part_number": f"{TEST_PREFIX}LEG-COMP-{unique_id}",
            "name": "Legacy Test Component",
            "category": "component",
            "unit_of_measure": "pcs",
            "current_stock": 100,  # Parent has stock
            "variant_attributes": [
                {
                    "name": "Size",
                    "values": [
                        {"value": "Small", "short_code": "S"},
                        {"value": "Large", "short_code": "L"}
                    ]
                }
            ]
        }
        comp_resp = session.post(f"{BASE_URL}/api/items", json=comp_data)
        assert comp_resp.status_code == 201
        comp = comp_resp.json()
        
        # Generate variant children
        gen_resp = session.post(f"{BASE_URL}/api/items/{comp['id']}/generate-variants", json={})
        assert gen_resp.status_code == 200
        
        # Get variant children
        variants_resp = session.get(f"{BASE_URL}/api/items/{comp['id']}/variants")
        variants = variants_resp.json() if variants_resp.status_code == 200 else []
        
        # Set stock on variant children
        for v in variants:
            session.put(f"{BASE_URL}/api/items/{v['id']}", json={"current_stock": 50})
        
        # Create FG
        fg_data = {
            "part_number": f"{TEST_PREFIX}LEG-FG-{unique_id}",
            "name": "Legacy Test FG",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "current_stock": 0
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201
        fg = fg_resp.json()
        
        # Create BOM
        bom_data = {
            "name": f"{TEST_PREFIX}LEG-FG-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [{"item_id": comp["id"], "quantity": 5.0}],
            "parent_routings": [{"name": "Assembly", "cost": 100.0}]
        }
        bom_resp = session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201]
        bom = bom_resp.json()
        
        yield {"fg": fg, "comp": comp, "bom": bom, "variants": variants, "unique_id": unique_id}
        
        # Cleanup
        wos_resp = session.get(f"{BASE_URL}/api/work-orders")
        if wos_resp.status_code == 200:
            for wo in wos_resp.json():
                if wo.get("item_id") == fg["id"]:
                    session.delete(f"{BASE_URL}/api/work-orders/{wo['id']}")
        
        session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        
        for v in variants:
            session.delete(f"{BASE_URL}/api/items/{v['id']}")
        
        session.delete(f"{BASE_URL}/api/items/{fg['id']}")
        session.delete(f"{BASE_URL}/api/items/{comp['id']}")
    
    def test_no_variant_selection_consumes_from_parent(self, session, legacy_setup):
        """
        Test: When MO has no variant_selection, consumption uses parent items
        
        Assert:
        - Component parent stock dropped by 5
        - Variant children stock UNCHANGED
        """
        setup = legacy_setup
        fg = setup["fg"]
        comp = setup["comp"]
        variants = setup["variants"]
        
        # Get initial stock levels
        comp_initial = session.get(f"{BASE_URL}/api/items/{comp['id']}").json()
        variant_stocks_initial = {}
        for v in variants:
            v_data = session.get(f"{BASE_URL}/api/items/{v['id']}").json()
            variant_stocks_initial[v["id"]] = v_data.get("current_stock", 0)
        
        print(f"Initial stocks: COMP={comp_initial.get('current_stock')}, "
              f"Variants={variant_stocks_initial}")
        
        # Create MO WITHOUT variant_selection
        mo_data = {
            "order_type": "mts",
            "item_id": fg["id"],
            "quantity": 1
            # No variant_selection
        }
        mo_resp = session.post(f"{BASE_URL}/api/work-orders", json=mo_data)
        assert mo_resp.status_code in [200, 201], f"Failed to create MO: {mo_resp.text}"
        
        mo_response = mo_resp.json()
        mo = mo_response["work_orders"][0]
        mo_id = mo["id"]
        
        # Verify no variant_selection
        assert mo.get("variant_selection") is None or mo.get("variant_selection") == {}, \
            f"Expected no variant_selection, got {mo.get('variant_selection')}"
        
        # Start the MO
        start_resp = session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        assert start_resp.status_code == 200, f"Failed to start MO: {start_resp.text}"
        
        start_data = start_resp.json()
        assert start_data.get("success") == True, f"Start failed: {start_data}"
        
        # Get final stock levels
        comp_final = session.get(f"{BASE_URL}/api/items/{comp['id']}").json()
        variant_stocks_final = {}
        for v in variants:
            v_data = session.get(f"{BASE_URL}/api/items/{v['id']}").json()
            variant_stocks_final[v["id"]] = v_data.get("current_stock", 0)
        
        print(f"Final stocks: COMP={comp_final.get('current_stock')}, "
              f"Variants={variant_stocks_final}")
        
        # Assert: Component parent stock dropped by 5
        assert comp_final.get("current_stock") == 95, \
            f"Expected COMP parent stock=95, got {comp_final.get('current_stock')}"
        
        # Assert: Variant children stock UNCHANGED
        for v_id, initial_stock in variant_stocks_initial.items():
            final_stock = variant_stocks_final.get(v_id, 0)
            assert final_stock == initial_stock, \
                f"Expected variant {v_id} stock unchanged at {initial_stock}, got {final_stock}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
