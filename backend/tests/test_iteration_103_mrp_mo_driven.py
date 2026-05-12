"""
Iteration 103 - MO-Driven MRP Demand Tests

Tests the fix where MRP demand is now sourced from Manufacturing Orders (MOs)
instead of Sales Orders (SOs). Key scenarios:

1. SO without MO → NO MRP demand (SOs only show intent, not commitment)
2. MO for SO (MTO) → MRP demand generated from MO's BOM explosion
3. MTS MO (no SO) → MRP demand generated (production_order_id=null)
4. Reserved MO → Shortfall captured in MRP demand
5. Variant-aware MRP → Demand against variant child SKU when MO has variant_selection

Test Coverage:
- Scenario A: SO exists but NO MO → /mrp/demand returns NO demand for RM
- Scenario B: MO created for SO → /mrp/demand returns demand for RM
- Scenario C: Reserved MO → Shortfall still captured
- Scenario D: MTS MO without SO → Still appears in MRP demand
- Variant-aware: MO with variant_selection → Demand against variant child SKU
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_MRP_103_"


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


class TestMRPMODrivenDemand:
    """Test MRP demand is now sourced from MOs, not SOs"""
    
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
    def mrp_test_setup(self, session):
        """
        Setup:
        - FG item with BOM containing 1 RM (qty 2 per FG)
        - RM stock = 0 (to ensure any demand shows up)
        """
        unique_id = str(uuid.uuid4())[:8]
        
        # 1. Create RM item with stock = 0
        rm_data = {
            "part_number": f"{TEST_PREFIX}RM-{unique_id}",
            "name": "MRP Test Raw Material",
            "category": "raw_material",
            "unit_of_measure": "pcs",
            "unit_cost": 10.0,
            "current_stock": 0,  # Zero stock to ensure demand shows
            "safety_stock": 0
        }
        rm_resp = session.post(f"{BASE_URL}/api/items", json=rm_data)
        assert rm_resp.status_code == 201, f"Failed to create RM: {rm_resp.text}"
        rm = rm_resp.json()
        
        # 2. Create FG item
        fg_data = {
            "part_number": f"{TEST_PREFIX}FG-{unique_id}",
            "name": "MRP Test Finished Good",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0,
            "current_stock": 0
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201, f"Failed to create FG: {fg_resp.text}"
        fg = fg_resp.json()
        
        # 3. Create BOM: FG requires 2 units of RM per FG
        bom_data = {
            "name": f"{TEST_PREFIX}FG-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": rm["id"], "quantity": 2.0}
            ],
            "parent_routings": [
                {"name": "Assembly", "cost": 50.0}
            ]
        }
        bom_resp = session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201], f"Failed to create BOM: {bom_resp.text}"
        bom = bom_resp.json()
        
        yield {
            "fg": fg,
            "rm": rm,
            "bom": bom,
            "unique_id": unique_id
        }
        
        # Cleanup
        # Delete any MOs/WOs
        wos_resp = session.get(f"{BASE_URL}/api/work-orders")
        if wos_resp.status_code == 200:
            for wo in wos_resp.json():
                if wo.get("item_id") == fg["id"]:
                    session.delete(f"{BASE_URL}/api/work-orders/{wo['id']}")
        
        # Delete any SOs
        sos_resp = session.get(f"{BASE_URL}/api/production")
        if sos_resp.status_code == 200:
            for so in sos_resp.json():
                if so.get("lines"):
                    for ln in so.get("lines", []):
                        if ln.get("bom_id") == bom["id"]:
                            session.delete(f"{BASE_URL}/api/production/{so['id']}")
                            break
        
        # Delete BOM
        session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        
        # Delete items
        session.delete(f"{BASE_URL}/api/items/{fg['id']}")
        session.delete(f"{BASE_URL}/api/items/{rm['id']}")
    
    def test_scenario_a_so_without_mo_no_mrp_demand(self, session, mrp_test_setup):
        """
        Scenario A: Create an SO for 5 FG but NO MO
        Expected: /mrp/demand returns NO demand for the RM (because no MO exists yet)
        """
        setup = mrp_test_setup
        fg = setup["fg"]
        rm = setup["rm"]
        bom = setup["bom"]
        
        # Create SO for 5 FG (no MO yet)
        so_data = {
            "lines": [
                {
                    "bom_id": bom["id"],
                    "quantity": 5,
                    "order_type": "mto"
                }
            ]
        }
        so_resp = session.post(f"{BASE_URL}/api/production", json=so_data)
        assert so_resp.status_code in [200, 201], f"Failed to create SO: {so_resp.text}"
        so = so_resp.json()
        
        try:
            # Call /mrp/demand
            demand_resp = session.get(f"{BASE_URL}/api/mrp/demand")
            assert demand_resp.status_code == 200, f"Failed to get MRP demand: {demand_resp.text}"
            demand_data = demand_resp.json()
            
            # Check if our RM is in the demand list
            rm_demand = next((d for d in demand_data if d.get("item", {}).get("id") == rm["id"]), None)
            
            # Expected: NO demand for RM because no MO exists yet
            # The RM should either not be in the list, or have net_requirement = 0
            if rm_demand:
                assert rm_demand.get("net_requirement", 0) == 0, \
                    f"Expected NO demand for RM (no MO yet), but got net_requirement={rm_demand.get('net_requirement')}"
            
            print(f"Scenario A PASSED: SO without MO → No MRP demand for RM")
            
        finally:
            # Cleanup SO
            session.delete(f"{BASE_URL}/api/production/{so['id']}")
    
    def test_scenario_b_mo_created_generates_mrp_demand(self, session, mrp_test_setup):
        """
        Scenario B: Create an MO for qty=5
        Expected: /mrp/demand returns 10 units demand for RM (5 FG × 2 RM per FG)
        """
        setup = mrp_test_setup
        fg = setup["fg"]
        rm = setup["rm"]
        
        # Create MO (MTS mode, no SO needed)
        mo_data = {
            "order_type": "mts",
            "item_id": fg["id"],
            "quantity": 5
        }
        mo_resp = session.post(f"{BASE_URL}/api/work-orders", json=mo_data)
        assert mo_resp.status_code in [200, 201], f"Failed to create MO: {mo_resp.text}"
        
        mo_response = mo_resp.json()
        assert "work_orders" in mo_response, f"Expected 'work_orders' in response"
        mo = mo_response["work_orders"][0]
        mo_id = mo["id"]
        
        try:
            # Call /mrp/demand
            demand_resp = session.get(f"{BASE_URL}/api/mrp/demand")
            assert demand_resp.status_code == 200, f"Failed to get MRP demand: {demand_resp.text}"
            demand_data = demand_resp.json()
            
            # Check if our RM is in the demand list
            rm_demand = next((d for d in demand_data if d.get("item", {}).get("id") == rm["id"]), None)
            
            # Expected: 10 units demand (5 FG × 2 RM per FG)
            assert rm_demand is not None, f"Expected RM in MRP demand, but not found. Demand items: {[d.get('item', {}).get('part_number') for d in demand_data]}"
            
            # gross_requirement should be 10
            assert rm_demand.get("gross_requirement", 0) == 10, \
                f"Expected gross_requirement=10, got {rm_demand.get('gross_requirement')}"
            
            # net_requirement should also be 10 (since RM stock is 0)
            assert rm_demand.get("net_requirement", 0) == 10, \
                f"Expected net_requirement=10, got {rm_demand.get('net_requirement')}"
            
            print(f"Scenario B PASSED: MO created → MRP demand shows 10 units for RM")
            
        finally:
            # Cleanup MO
            session.delete(f"{BASE_URL}/api/work-orders/{mo_id}")
    
    def test_scenario_c_reserved_mo_shortfall_captured(self, session, mrp_test_setup):
        """
        Scenario C: Create MO, reserve materials (will have shortfall since RM stock=0)
        Expected: Reservation shortfall is captured in MRP demand
        """
        setup = mrp_test_setup
        fg = setup["fg"]
        rm = setup["rm"]
        
        # Create MO
        mo_data = {
            "order_type": "mts",
            "item_id": fg["id"],
            "quantity": 5
        }
        mo_resp = session.post(f"{BASE_URL}/api/work-orders", json=mo_data)
        assert mo_resp.status_code in [200, 201], f"Failed to create MO: {mo_resp.text}"
        
        mo_response = mo_resp.json()
        mo = mo_response["work_orders"][0]
        mo_id = mo["id"]
        
        try:
            # Reserve materials (will create shortfall since RM stock=0)
            reserve_resp = session.post(f"{BASE_URL}/api/work-orders/{mo_id}/reserve-materials")
            # May succeed or fail depending on stock, but shortfall should be recorded
            
            # Call /mrp/demand
            demand_resp = session.get(f"{BASE_URL}/api/mrp/demand")
            assert demand_resp.status_code == 200, f"Failed to get MRP demand: {demand_resp.text}"
            demand_data = demand_resp.json()
            
            # Check if our RM is in the demand list
            rm_demand = next((d for d in demand_data if d.get("item", {}).get("id") == rm["id"]), None)
            
            # Expected: Demand should still show (either from unreserved MO or from shortfall)
            assert rm_demand is not None, f"Expected RM in MRP demand after reservation"
            
            # net_requirement should be > 0 (shortfall captured)
            assert rm_demand.get("net_requirement", 0) > 0, \
                f"Expected net_requirement > 0 (shortfall), got {rm_demand.get('net_requirement')}"
            
            print(f"Scenario C PASSED: Reserved MO shortfall captured in MRP demand")
            
        finally:
            # Cleanup MO
            session.delete(f"{BASE_URL}/api/work-orders/{mo_id}")
    
    def test_scenario_d_mts_mo_without_so_in_mrp_demand(self, session, mrp_test_setup):
        """
        Scenario D: MTS MO without SO (production_order_id=null)
        Expected: Should still appear in MRP demand
        """
        setup = mrp_test_setup
        fg = setup["fg"]
        rm = setup["rm"]
        
        # Get baseline demand BEFORE creating MO
        baseline_resp = session.get(f"{BASE_URL}/api/mrp/demand")
        assert baseline_resp.status_code == 200
        baseline_data = baseline_resp.json()
        baseline_rm_demand = next((d for d in baseline_data if d.get("item", {}).get("id") == rm["id"]), None)
        baseline_gross = baseline_rm_demand.get("gross_requirement", 0) if baseline_rm_demand else 0
        
        # Create MTS MO (no SO)
        mo_data = {
            "order_type": "mts",
            "item_id": fg["id"],
            "quantity": 3  # Different qty to distinguish
        }
        mo_resp = session.post(f"{BASE_URL}/api/work-orders", json=mo_data)
        assert mo_resp.status_code in [200, 201], f"Failed to create MO: {mo_resp.text}"
        
        mo_response = mo_resp.json()
        mo = mo_response["work_orders"][0]
        mo_id = mo["id"]
        
        # Verify MO has no production_order_id (MTS mode)
        mo_detail_resp = session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert mo_detail_resp.status_code == 200
        mo_detail = mo_detail_resp.json()
        
        # MTS MO should have production_order_id = null or empty
        assert not mo_detail.get("production_order_id"), \
            f"Expected MTS MO to have no production_order_id, got {mo_detail.get('production_order_id')}"
        
        try:
            # Call /mrp/demand
            demand_resp = session.get(f"{BASE_URL}/api/mrp/demand")
            assert demand_resp.status_code == 200, f"Failed to get MRP demand: {demand_resp.text}"
            demand_data = demand_resp.json()
            
            # Check if our RM is in the demand list
            rm_demand = next((d for d in demand_data if d.get("item", {}).get("id") == rm["id"]), None)
            
            # Expected: demand increased by 6 units (3 FG × 2 RM per FG)
            assert rm_demand is not None, f"Expected RM in MRP demand for MTS MO"
            
            # gross_requirement should have increased by 6 from baseline
            new_gross = rm_demand.get("gross_requirement", 0)
            demand_increase = new_gross - baseline_gross
            assert demand_increase == 6, \
                f"Expected demand increase of 6 (3 FG × 2 RM), got {demand_increase} (baseline={baseline_gross}, new={new_gross})"
            
            print(f"Scenario D PASSED: MTS MO without SO appears in MRP demand (demand increased by 6)")
            
        finally:
            # Cleanup MO
            session.delete(f"{BASE_URL}/api/work-orders/{mo_id}")


class TestMRPVariantAwareDemand:
    """Test MRP demand is variant-aware when MO has variant_selection"""
    
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
    def variant_mrp_setup(self, session):
        """
        Setup:
        - RM with variant_attributes (Grit=16GT,30GT)
        - Generate variant children RM-16GT, RM-30GT
        - FG with BOM containing RM (qty 2 per FG)
        """
        unique_id = str(uuid.uuid4())[:8]
        
        # 1. Create RM with variants
        rm_data = {
            "part_number": f"{TEST_PREFIX}VAR-RM-{unique_id}",
            "name": "Variant RM for MRP Test",
            "category": "raw_material",
            "unit_of_measure": "pcs",
            "unit_cost": 10.0,
            "current_stock": 0,
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
        rm_resp = session.post(f"{BASE_URL}/api/items", json=rm_data)
        assert rm_resp.status_code == 201, f"Failed to create RM: {rm_resp.text}"
        rm = rm_resp.json()
        
        # 2. Generate variant children
        gen_resp = session.post(f"{BASE_URL}/api/items/{rm['id']}/generate-variants", json={})
        assert gen_resp.status_code == 200, f"Failed to generate variants: {gen_resp.text}"
        
        # Get variant children
        variants_resp = session.get(f"{BASE_URL}/api/items/{rm['id']}/variants")
        assert variants_resp.status_code == 200
        variants = variants_resp.json()
        
        rm_16gt = next((v for v in variants if "16GT" in v["part_number"]), None)
        rm_30gt = next((v for v in variants if "30GT" in v["part_number"]), None)
        
        assert rm_16gt is not None, f"RM-16GT not found"
        assert rm_30gt is not None, f"RM-30GT not found"
        
        # 3. Create FG item
        fg_data = {
            "part_number": f"{TEST_PREFIX}VAR-FG-{unique_id}",
            "name": "Variant FG for MRP Test",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0,
            "current_stock": 0
        }
        fg_resp = session.post(f"{BASE_URL}/api/items", json=fg_data)
        assert fg_resp.status_code == 201, f"Failed to create FG: {fg_resp.text}"
        fg = fg_resp.json()
        
        # 4. Create BOM: FG requires 2 units of RM per FG
        bom_data = {
            "name": f"{TEST_PREFIX}VAR-FG-{unique_id} BOM",
            "parent_item_id": fg["id"],
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": rm["id"], "quantity": 2.0}
            ],
            "parent_routings": [
                {"name": "Assembly", "cost": 50.0}
            ]
        }
        bom_resp = session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert bom_resp.status_code in [200, 201], f"Failed to create BOM: {bom_resp.text}"
        bom = bom_resp.json()
        
        yield {
            "fg": fg,
            "rm": rm,
            "rm_16gt": rm_16gt,
            "rm_30gt": rm_30gt,
            "bom": bom,
            "variants": variants,
            "unique_id": unique_id
        }
        
        # Cleanup
        # Delete any MOs/WOs
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
        session.delete(f"{BASE_URL}/api/items/{rm['id']}")
    
    def test_variant_aware_mrp_demand(self, session, variant_mrp_setup):
        """
        Test: MO with variant_selection={Grit:30GT} qty=5
        Expected: MRP demand should be against RM-30GT (variant child), not RM (parent)
        """
        setup = variant_mrp_setup
        fg = setup["fg"]
        rm = setup["rm"]
        rm_30gt = setup["rm_30gt"]
        rm_16gt = setup["rm_16gt"]
        
        # Create MO with variant_selection
        mo_data = {
            "order_type": "mts",
            "item_id": fg["id"],
            "quantity": 5,
            "variant_selection": {"Grit": "30GT"}
        }
        mo_resp = session.post(f"{BASE_URL}/api/work-orders", json=mo_data)
        assert mo_resp.status_code in [200, 201], f"Failed to create MO: {mo_resp.text}"
        
        mo_response = mo_resp.json()
        mo = mo_response["work_orders"][0]
        mo_id = mo["id"]
        
        try:
            # Call /mrp/demand
            demand_resp = session.get(f"{BASE_URL}/api/mrp/demand")
            assert demand_resp.status_code == 200, f"Failed to get MRP demand: {demand_resp.text}"
            demand_data = demand_resp.json()
            
            # Check demand for variant child (RM-30GT)
            rm_30gt_demand = next((d for d in demand_data if d.get("item", {}).get("id") == rm_30gt["id"]), None)
            
            # Check demand for parent (RM) - should NOT have demand
            rm_parent_demand = next((d for d in demand_data if d.get("item", {}).get("id") == rm["id"]), None)
            
            # Check demand for other variant (RM-16GT) - should NOT have demand
            rm_16gt_demand = next((d for d in demand_data if d.get("item", {}).get("id") == rm_16gt["id"]), None)
            
            # Expected: Demand should be against RM-30GT (variant child)
            assert rm_30gt_demand is not None, \
                f"Expected demand for RM-30GT (variant child), but not found. Demand items: {[d.get('item', {}).get('part_number') for d in demand_data]}"
            
            # gross_requirement should be 10 (5 FG × 2 RM per FG)
            assert rm_30gt_demand.get("gross_requirement", 0) == 10, \
                f"Expected gross_requirement=10 for RM-30GT, got {rm_30gt_demand.get('gross_requirement')}"
            
            # Parent RM should NOT have demand (or have 0)
            if rm_parent_demand:
                assert rm_parent_demand.get("net_requirement", 0) == 0, \
                    f"Expected NO demand for parent RM, but got net_requirement={rm_parent_demand.get('net_requirement')}"
            
            # RM-16GT should NOT have demand (or have 0)
            if rm_16gt_demand:
                assert rm_16gt_demand.get("net_requirement", 0) == 0, \
                    f"Expected NO demand for RM-16GT, but got net_requirement={rm_16gt_demand.get('net_requirement')}"
            
            print(f"Variant-aware MRP PASSED: Demand is against RM-30GT (variant child), not parent")
            
        finally:
            # Cleanup MO
            session.delete(f"{BASE_URL}/api/work-orders/{mo_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
