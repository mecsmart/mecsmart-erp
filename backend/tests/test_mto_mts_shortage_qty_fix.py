"""
Test MTO/MTS Smart Resolution Fix - Iteration 96
Bug: When parent SG is partially in stock, child MOs were being created with full BOM qty
     instead of shortage qty. Fix: line 4684 now passes shortage_qty to recursion.

Scenarios:
A) Parent SG fully in stock → No MO for SG or its children
B) Parent SG partially in stock → MO for SG with shortage qty, children scaled to shortage
C) Parent SG not in stock → Full BOM explosion
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL') or 'https://industrial-bom-suite.preview.emergentagent.com'
BASE_URL = BASE_URL.rstrip('/')

class TestMTOMTSShortageQtyFix:
    """Test that child MOs are created based on parent shortage, not full BOM qty"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.test_prefix = f"TEST_MTO_{uuid.uuid4().hex[:8].upper()}"
        self.created_items = []
        self.created_boms = []
        self.created_customers = []
        self.created_sos = []
        self.created_wos = []
        yield
        # Cleanup
        self._cleanup()
    
    def _cleanup(self):
        """Clean up test data"""
        # Delete work orders
        for wo_id in self.created_wos:
            try:
                self.session.delete(f"{BASE_URL}/api/work-orders/{wo_id}")
            except Exception:
                pass
        # Delete production orders (SOs)
        for so_id in self.created_sos:
            try:
                self.session.delete(f"{BASE_URL}/api/production/{so_id}")
            except Exception:
                pass
        # Delete BOMs
        for bom_id in self.created_boms:
            try:
                self.session.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except Exception:
                pass
        # Delete items
        for item_id in self.created_items:
            try:
                self.session.delete(f"{BASE_URL}/api/items/{item_id}")
            except Exception:
                pass
        # Delete customers
        for cust_id in self.created_customers:
            try:
                self.session.delete(f"{BASE_URL}/api/customers/{cust_id}")
            except Exception:
                pass
    
    def _create_item(self, part_number: str, category: str, current_stock: int = 0) -> dict:
        """Create a test item"""
        resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": part_number,
            "name": f"Test {category} {part_number}",
            "category": category,
            "unit_of_measure": "pcs",
            "current_stock": current_stock,
            "unit_cost": 10.0
        })
        assert resp.status_code == 201, f"Failed to create item {part_number}: {resp.text}"
        item = resp.json()
        self.created_items.append(item["id"])
        return item
    
    def _create_bom(self, parent_item_id: str, components: list, name: str) -> dict:
        """Create a BOM with parent_routings (required for MO creation)"""
        resp = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": name,
            "status": "active",
            "components": components,
            "parent_routings": [{"name": "Assembly", "cost": 50.0}]  # Required for MO creation
        })
        assert resp.status_code in [200, 201], f"Failed to create BOM {name}: {resp.text}"
        bom = resp.json()
        self.created_boms.append(bom["id"])
        return bom
    
    def _create_customer(self) -> dict:
        """Create a test customer"""
        resp = self.session.post(f"{BASE_URL}/api/customers", json={
            "name": f"{self.test_prefix}_Customer",
            "email": f"{self.test_prefix.lower()}@test.com"
        })
        assert resp.status_code == 201, f"Failed to create customer: {resp.text}"
        customer = resp.json()
        self.created_customers.append(customer["id"])
        return customer
    
    def _create_so_and_confirm(self, bom_id: str, quantity: int, customer_id: str) -> dict:
        """Create and confirm a Sales Order (Production Order)"""
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        
        # Create SO
        resp = self.session.post(f"{BASE_URL}/api/production", json={
            "bom_id": bom_id,
            "quantity": quantity,
            "customer_id": customer_id,
            "due_date": due_date,
            "priority": "medium"
        })
        assert resp.status_code in [200, 201], f"Failed to create SO: {resp.text}"
        so = resp.json()
        self.created_sos.append(so["id"])
        
        # Confirm SO
        confirm_resp = self.session.post(f"{BASE_URL}/api/production/{so['id']}/confirm")
        assert confirm_resp.status_code == 200, f"Failed to confirm SO: {confirm_resp.text}"
        
        return so
    
    def _create_work_order(self, production_order_id: str, quantity: int) -> dict:
        """Create work order which triggers child MO creation"""
        resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": production_order_id,
            "quantity": quantity
        })
        assert resp.status_code == 201, f"Failed to create work order: {resp.text}"
        result = resp.json()
        # Track created WOs for cleanup
        for wo in result.get("work_orders", []):
            self.created_wos.append(wo["id"])
        return result
    
    def _get_work_orders_for_so(self, production_order_id: str) -> list:
        """Get all work orders for a production order"""
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        all_wos = resp.json()
        return [wo for wo in all_wos if wo.get("production_order_id") == production_order_id]
    
    def _update_item_stock(self, item_id: str, new_stock: int):
        """Update item stock level"""
        resp = self.session.put(f"{BASE_URL}/api/items/{item_id}", json={
            "current_stock": new_stock
        })
        assert resp.status_code == 200, f"Failed to update stock: {resp.text}"
    
    # ==================== SCENARIO A: Parent SG Fully In Stock ====================
    
    def test_scenario_a_parent_sg_fully_in_stock(self):
        """
        Scenario A: Parent SG fully in stock
        Setup: FG needs SG1 qty=5. SG1 has BOM [SG1a qty=2, SG1b qty=3]. SG1 stock=5.
        Expected: MO for FG only. NO MO for SG1, SG1a, or SG1b (all skipped).
        """
        print("\n=== SCENARIO A: Parent SG Fully In Stock ===")
        
        # Create items
        # Raw materials (no BOM, no routing - won't get MOs)
        rm1 = self._create_item(f"{self.test_prefix}_RM1", "raw_material", current_stock=100)
        
        # Sub-components for SG1 (sub_assembly with BOM)
        sg1a = self._create_item(f"{self.test_prefix}_SG1a", "sub_assembly", current_stock=0)
        sg1b = self._create_item(f"{self.test_prefix}_SG1b", "sub_assembly", current_stock=0)
        
        # Parent SG - FULLY IN STOCK (5 units, FG needs 5)
        sg1 = self._create_item(f"{self.test_prefix}_SG1", "sub_assembly", current_stock=5)
        
        # Finished Good
        fg = self._create_item(f"{self.test_prefix}_FG", "finished_good", current_stock=0)
        
        # Create BOMs for SG1a and SG1b (so they can have MOs)
        bom_sg1a = self._create_bom(sg1a["id"], [
            {"item_id": rm1["id"], "quantity": 1, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_BOM_SG1a")
        
        bom_sg1b = self._create_bom(sg1b["id"], [
            {"item_id": rm1["id"], "quantity": 1, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_BOM_SG1b")
        
        # Create BOM for SG1 (parent SG)
        bom_sg1 = self._create_bom(sg1["id"], [
            {"item_id": sg1a["id"], "quantity": 2, "unit_of_measure": "pcs"},
            {"item_id": sg1b["id"], "quantity": 3, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_BOM_SG1")
        
        # Create BOM for FG
        bom_fg = self._create_bom(fg["id"], [
            {"item_id": sg1["id"], "quantity": 5, "unit_of_measure": "pcs"},
            {"item_id": rm1["id"], "quantity": 2, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_BOM_FG")
        
        # Create customer and SO
        customer = self._create_customer()
        so = self._create_so_and_confirm(bom_fg["id"], 1, customer["id"])
        
        # Create work order (triggers child MO creation)
        wo_result = self._create_work_order(so["id"], 1)
        
        # Get all work orders
        all_wos = self._get_work_orders_for_so(so["id"])
        
        print(f"Created {len(all_wos)} work orders:")
        for wo in all_wos:
            print(f"  - {wo.get('wo_number')}: item={wo.get('item_id')}, qty={wo.get('quantity')}")
        
        # Assertions
        # Should have ONLY 1 MO (for FG)
        assert len(all_wos) == 1, f"Expected 1 MO (FG only), got {len(all_wos)}"
        
        # The single MO should be for FG
        fg_mo = all_wos[0]
        assert fg_mo["item_id"] == fg["id"], "MO should be for FG"
        assert fg_mo["quantity"] == 1, "FG MO quantity should be 1"
        
        # Verify NO MOs for SG1, SG1a, SG1b
        item_ids_with_mo = [wo["item_id"] for wo in all_wos]
        assert sg1["id"] not in item_ids_with_mo, "SG1 should NOT have MO (fully in stock)"
        assert sg1a["id"] not in item_ids_with_mo, "SG1a should NOT have MO (parent skipped)"
        assert sg1b["id"] not in item_ids_with_mo, "SG1b should NOT have MO (parent skipped)"
        
        print("SCENARIO A PASSED: Only FG MO created, SG1 and children skipped (in stock)")
    
    # ==================== SCENARIO B: Parent SG Partially In Stock ====================
    
    def test_scenario_b_parent_sg_partially_in_stock(self):
        """
        Scenario B: Parent SG partially in stock (THE KEY BUG FIX TEST)
        Setup: FG needs SG1 qty=5. SG1 has BOM [SG1a qty=2, SG1b qty=3]. SG1 stock=3.
        Expected: 
          - MO for FG (qty=1)
          - MO for SG1 (qty=2, shortage)
          - MO for SG1a (qty=2*2=4, NOT 2*5=10!)
          - MO for SG1b (qty=3*2=6, NOT 3*5=15!)
        """
        print("\n=== SCENARIO B: Parent SG Partially In Stock (KEY BUG FIX) ===")
        
        # Create items
        rm1 = self._create_item(f"{self.test_prefix}_B_RM1", "raw_material", current_stock=100)
        
        # Sub-components for SG1
        sg1a = self._create_item(f"{self.test_prefix}_B_SG1a", "sub_assembly", current_stock=0)
        sg1b = self._create_item(f"{self.test_prefix}_B_SG1b", "sub_assembly", current_stock=0)
        
        # Parent SG - PARTIALLY IN STOCK (3 units, FG needs 5, shortage=2)
        sg1 = self._create_item(f"{self.test_prefix}_B_SG1", "sub_assembly", current_stock=3)
        
        # Finished Good
        fg = self._create_item(f"{self.test_prefix}_B_FG", "finished_good", current_stock=0)
        
        # Create BOMs for SG1a and SG1b
        bom_sg1a = self._create_bom(sg1a["id"], [
            {"item_id": rm1["id"], "quantity": 1, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_B_BOM_SG1a")
        
        bom_sg1b = self._create_bom(sg1b["id"], [
            {"item_id": rm1["id"], "quantity": 1, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_B_BOM_SG1b")
        
        # Create BOM for SG1: SG1a qty=2, SG1b qty=3
        bom_sg1 = self._create_bom(sg1["id"], [
            {"item_id": sg1a["id"], "quantity": 2, "unit_of_measure": "pcs"},
            {"item_id": sg1b["id"], "quantity": 3, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_B_BOM_SG1")
        
        # Create BOM for FG: SG1 qty=5
        bom_fg = self._create_bom(fg["id"], [
            {"item_id": sg1["id"], "quantity": 5, "unit_of_measure": "pcs"},
            {"item_id": rm1["id"], "quantity": 2, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_B_BOM_FG")
        
        # Create customer and SO
        customer = self._create_customer()
        so = self._create_so_and_confirm(bom_fg["id"], 1, customer["id"])
        
        # Create work order
        wo_result = self._create_work_order(so["id"], 1)
        
        # Get all work orders
        all_wos = self._get_work_orders_for_so(so["id"])
        
        print(f"Created {len(all_wos)} work orders:")
        wo_by_item = {}
        for wo in all_wos:
            wo_by_item[wo["item_id"]] = wo
            print(f"  - {wo.get('wo_number')}: item={wo.get('item_id')}, qty={wo.get('quantity')}")
        
        # Assertions
        # Should have 4 MOs: FG, SG1, SG1a, SG1b
        assert len(all_wos) == 4, f"Expected 4 MOs, got {len(all_wos)}"
        
        # FG MO: qty=1
        assert fg["id"] in wo_by_item, "FG should have MO"
        assert wo_by_item[fg["id"]]["quantity"] == 1, "FG MO qty should be 1"
        
        # SG1 MO: qty=2 (shortage: 5 needed - 3 in stock = 2)
        assert sg1["id"] in wo_by_item, "SG1 should have MO"
        sg1_mo_qty = wo_by_item[sg1["id"]]["quantity"]
        assert sg1_mo_qty == 2, f"SG1 MO qty should be 2 (shortage), got {sg1_mo_qty}"
        
        # SG1a MO: qty = 2 (BOM qty) * 2 (shortage) = 4, NOT 2*5=10!
        assert sg1a["id"] in wo_by_item, "SG1a should have MO"
        sg1a_mo_qty = wo_by_item[sg1a["id"]]["quantity"]
        assert sg1a_mo_qty == 4, f"SG1a MO qty should be 4 (2*2 shortage), got {sg1a_mo_qty}. BUG if 10!"
        
        # SG1b MO: qty = 3 (BOM qty) * 2 (shortage) = 6, NOT 3*5=15!
        assert sg1b["id"] in wo_by_item, "SG1b should have MO"
        sg1b_mo_qty = wo_by_item[sg1b["id"]]["quantity"]
        assert sg1b_mo_qty == 6, f"SG1b MO qty should be 6 (3*2 shortage), got {sg1b_mo_qty}. BUG if 15!"
        
        print("SCENARIO B PASSED: Child MOs correctly scaled to parent shortage (2), not full qty (5)")
        print(f"  SG1a: {sg1a_mo_qty} (expected 4, would be 10 with bug)")
        print(f"  SG1b: {sg1b_mo_qty} (expected 6, would be 15 with bug)")
    
    # ==================== SCENARIO C: Parent SG Not In Stock ====================
    
    def test_scenario_c_parent_sg_not_in_stock(self):
        """
        Scenario C: Parent SG not in stock at all
        Setup: FG needs SG1 qty=5. SG1 has BOM [SG1a qty=2, SG1b qty=3]. SG1 stock=0.
        Expected: Full BOM explosion
          - MO for FG (qty=1)
          - MO for SG1 (qty=5)
          - MO for SG1a (qty=2*5=10)
          - MO for SG1b (qty=3*5=15)
        """
        print("\n=== SCENARIO C: Parent SG Not In Stock ===")
        
        # Create items
        rm1 = self._create_item(f"{self.test_prefix}_C_RM1", "raw_material", current_stock=100)
        
        # Sub-components for SG1
        sg1a = self._create_item(f"{self.test_prefix}_C_SG1a", "sub_assembly", current_stock=0)
        sg1b = self._create_item(f"{self.test_prefix}_C_SG1b", "sub_assembly", current_stock=0)
        
        # Parent SG - NOT IN STOCK (0 units)
        sg1 = self._create_item(f"{self.test_prefix}_C_SG1", "sub_assembly", current_stock=0)
        
        # Finished Good
        fg = self._create_item(f"{self.test_prefix}_C_FG", "finished_good", current_stock=0)
        
        # Create BOMs for SG1a and SG1b
        bom_sg1a = self._create_bom(sg1a["id"], [
            {"item_id": rm1["id"], "quantity": 1, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_C_BOM_SG1a")
        
        bom_sg1b = self._create_bom(sg1b["id"], [
            {"item_id": rm1["id"], "quantity": 1, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_C_BOM_SG1b")
        
        # Create BOM for SG1
        bom_sg1 = self._create_bom(sg1["id"], [
            {"item_id": sg1a["id"], "quantity": 2, "unit_of_measure": "pcs"},
            {"item_id": sg1b["id"], "quantity": 3, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_C_BOM_SG1")
        
        # Create BOM for FG
        bom_fg = self._create_bom(fg["id"], [
            {"item_id": sg1["id"], "quantity": 5, "unit_of_measure": "pcs"},
            {"item_id": rm1["id"], "quantity": 2, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_C_BOM_FG")
        
        # Create customer and SO
        customer = self._create_customer()
        so = self._create_so_and_confirm(bom_fg["id"], 1, customer["id"])
        
        # Create work order
        wo_result = self._create_work_order(so["id"], 1)
        
        # Get all work orders
        all_wos = self._get_work_orders_for_so(so["id"])
        
        print(f"Created {len(all_wos)} work orders:")
        wo_by_item = {}
        for wo in all_wos:
            wo_by_item[wo["item_id"]] = wo
            print(f"  - {wo.get('wo_number')}: item={wo.get('item_id')}, qty={wo.get('quantity')}")
        
        # Assertions
        # Should have 4 MOs: FG, SG1, SG1a, SG1b
        assert len(all_wos) == 4, f"Expected 4 MOs, got {len(all_wos)}"
        
        # FG MO: qty=1
        assert fg["id"] in wo_by_item, "FG should have MO"
        assert wo_by_item[fg["id"]]["quantity"] == 1, "FG MO qty should be 1"
        
        # SG1 MO: qty=5 (full requirement, nothing in stock)
        assert sg1["id"] in wo_by_item, "SG1 should have MO"
        sg1_mo_qty = wo_by_item[sg1["id"]]["quantity"]
        assert sg1_mo_qty == 5, f"SG1 MO qty should be 5 (full), got {sg1_mo_qty}"
        
        # SG1a MO: qty = 2 * 5 = 10
        assert sg1a["id"] in wo_by_item, "SG1a should have MO"
        sg1a_mo_qty = wo_by_item[sg1a["id"]]["quantity"]
        assert sg1a_mo_qty == 10, f"SG1a MO qty should be 10 (2*5), got {sg1a_mo_qty}"
        
        # SG1b MO: qty = 3 * 5 = 15
        assert sg1b["id"] in wo_by_item, "SG1b should have MO"
        sg1b_mo_qty = wo_by_item[sg1b["id"]]["quantity"]
        assert sg1b_mo_qty == 15, f"SG1b MO qty should be 15 (3*5), got {sg1b_mo_qty}"
        
        print("SCENARIO C PASSED: Full BOM explosion when parent SG not in stock")
    
    # ==================== REGRESSION: Non-SG Components ====================
    
    def test_regression_non_sg_components_still_work(self):
        """
        Regression test: Ensure non-SG components (simple parts with BOM) still
        get MOs based on shortage logic.
        """
        print("\n=== REGRESSION: Non-SG Components ===")
        
        # Create items
        rm1 = self._create_item(f"{self.test_prefix}_R_RM1", "raw_material", current_stock=100)
        
        # Component (not sub_assembly) with its own BOM
        comp1 = self._create_item(f"{self.test_prefix}_R_COMP1", "component", current_stock=2)
        
        # Finished Good
        fg = self._create_item(f"{self.test_prefix}_R_FG", "finished_good", current_stock=0)
        
        # Create BOM for COMP1
        bom_comp1 = self._create_bom(comp1["id"], [
            {"item_id": rm1["id"], "quantity": 3, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_R_BOM_COMP1")
        
        # Create BOM for FG: needs 5 COMP1
        bom_fg = self._create_bom(fg["id"], [
            {"item_id": comp1["id"], "quantity": 5, "unit_of_measure": "pcs"}
        ], f"{self.test_prefix}_R_BOM_FG")
        
        # Create customer and SO
        customer = self._create_customer()
        so = self._create_so_and_confirm(bom_fg["id"], 1, customer["id"])
        
        # Create work order
        wo_result = self._create_work_order(so["id"], 1)
        
        # Get all work orders
        all_wos = self._get_work_orders_for_so(so["id"])
        
        print(f"Created {len(all_wos)} work orders:")
        wo_by_item = {}
        for wo in all_wos:
            wo_by_item[wo["item_id"]] = wo
            print(f"  - {wo.get('wo_number')}: item={wo.get('item_id')}, qty={wo.get('quantity')}")
        
        # Assertions
        # Should have 2 MOs: FG and COMP1
        assert len(all_wos) == 2, f"Expected 2 MOs, got {len(all_wos)}"
        
        # FG MO: qty=1
        assert fg["id"] in wo_by_item, "FG should have MO"
        
        # COMP1 MO: qty=3 (shortage: 5 needed - 2 in stock = 3)
        assert comp1["id"] in wo_by_item, "COMP1 should have MO"
        comp1_mo_qty = wo_by_item[comp1["id"]]["quantity"]
        assert comp1_mo_qty == 3, f"COMP1 MO qty should be 3 (shortage), got {comp1_mo_qty}"
        
        print("REGRESSION PASSED: Non-SG components still use shortage logic correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
