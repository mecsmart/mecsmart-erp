"""
Test MRP Reserve/Unreserve functionality
Tests:
1. POST /api/work-orders/{wo_id}/reserve - creates reserved_materials array on MO
2. POST /api/work-orders/{wo_id}/unreserve - removes reservation
3. GET /api/mrp/demand - returns ONLY raw_material category items with reserved_for_mo field
4. MRP net calculation: net = gross_req - max(on_hand - reserved_for_mo - safety_stock, 0)
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMRPReserve:
    """Test MRP Reserve/Unreserve functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
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
    
    def test_01_get_existing_data(self):
        """Get existing items, BOMs, and work orders to understand test data"""
        # Get items
        items_res = self.session.get(f"{BASE_URL}/api/items", cookies=self.cookies)
        assert items_res.status_code == 200
        items = items_res.json()
        print(f"\nTotal items: {len(items)}")
        
        # Find FG-001
        fg_001 = next((i for i in items if i.get("part_number") == "FG-001"), None)
        if fg_001:
            print(f"FG-001 found: {fg_001.get('name')}, stock: {fg_001.get('current_stock')}")
        
        # Get raw materials
        rm_items = [i for i in items if i.get("category") == "raw_material"]
        print(f"Raw materials: {len(rm_items)}")
        for rm in rm_items[:5]:
            print(f"  - {rm.get('part_number')}: {rm.get('name')}, stock: {rm.get('current_stock')}, safety: {rm.get('safety_stock')}")
        
        # Get BOMs
        boms_res = self.session.get(f"{BASE_URL}/api/bom", cookies=self.cookies)
        assert boms_res.status_code == 200
        boms = boms_res.json()
        print(f"\nTotal BOMs: {len(boms)}")
        
        # Get work orders
        wo_res = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        assert wo_res.status_code == 200
        work_orders = wo_res.json()
        print(f"\nTotal work orders: {len(work_orders)}")
        
        # Find pending MOs
        pending_mos = [wo for wo in work_orders if wo.get("status") == "pending"]
        print(f"Pending MOs: {len(pending_mos)}")
        for mo in pending_mos[:3]:
            print(f"  - {mo.get('wo_number')}: {mo.get('item', {}).get('part_number')} qty={mo.get('quantity')}, reserved={mo.get('materials_reserved')}")
    
    def test_02_create_sales_order_for_fg001(self):
        """Create a confirmed Sales Order for FG-001 to test reserve flow"""
        # First get FG-001 BOM
        boms_res = self.session.get(f"{BASE_URL}/api/bom", cookies=self.cookies)
        assert boms_res.status_code == 200
        boms = boms_res.json()
        
        # Find active BOM for FG-001
        fg_bom = next((b for b in boms if b.get("parent_item", {}).get("part_number") == "FG-001" and b.get("status") == "active"), None)
        if not fg_bom:
            pytest.skip("No active BOM for FG-001 found")
        
        print(f"\nFG-001 BOM: {fg_bom.get('name')}, id: {fg_bom.get('id')}")
        
        # Create Sales Order
        due_date = (datetime.now() + timedelta(days=14)).isoformat()
        so_data = {
            "bom_id": fg_bom.get("id"),
            "quantity": 2,
            "due_date": due_date,
            "priority": "high",
            "notes": "TEST_MRP_RESERVE - Sales Order for reserve testing"
        }
        
        so_res = self.session.post(f"{BASE_URL}/api/production", json=so_data, cookies=self.cookies)
        assert so_res.status_code in [200, 201], f"Failed to create SO: {so_res.text}"
        so = so_res.json()
        print(f"Created SO: {so.get('order_number')}, id: {so.get('id')}")
        
        # Confirm the SO
        confirm_res = self.session.post(f"{BASE_URL}/api/production/{so.get('id')}/confirm", cookies=self.cookies)
        assert confirm_res.status_code == 200, f"Failed to confirm SO: {confirm_res.text}"
        print(f"SO confirmed: {so.get('order_number')}")
        
        # Store SO ID for next tests
        self.__class__.test_so_id = so.get("id")
        self.__class__.test_so_number = so.get("order_number")
        self.__class__.test_bom_id = fg_bom.get("id")
    
    def test_03_create_manufacturing_order(self):
        """Create a Manufacturing Order from the Sales Order"""
        if not hasattr(self.__class__, 'test_so_id'):
            pytest.skip("No test SO created")
        
        # Get routing for FG-001
        routings_res = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        assert routings_res.status_code == 200
        routings = routings_res.json()
        
        # Find active routing for FG-001
        fg_routing = next((r for r in routings if r.get("item", {}).get("part_number") == "FG-001" and r.get("status") == "active"), None)
        if not fg_routing:
            pytest.skip("No active routing for FG-001 found")
        
        print(f"\nFG-001 Routing: {fg_routing.get('name')}, id: {fg_routing.get('id')}")
        
        # Create Manufacturing Order
        mo_data = {
            "production_order_id": self.__class__.test_so_id,
            "routing_id": fg_routing.get("id"),
            "quantity": 2,
            "notes": "TEST_MRP_RESERVE - MO for reserve testing"
        }
        
        mo_res = self.session.post(f"{BASE_URL}/api/work-orders", json=mo_data, cookies=self.cookies)
        assert mo_res.status_code in [200, 201], f"Failed to create MO: {mo_res.text}"
        mo_result = mo_res.json()
        print(f"MO creation result: {mo_result.get('message')}")
        
        # Get the created MO
        wo_res = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        assert wo_res.status_code == 200
        work_orders = wo_res.json()
        
        # Find the MO we just created (pending, for our SO)
        test_mo = next((wo for wo in work_orders 
                       if wo.get("production_order_id") == self.__class__.test_so_id 
                       and wo.get("status") == "pending"
                       and not wo.get("parent_wo_id")), None)
        
        if test_mo:
            print(f"Created MO: {test_mo.get('wo_number')}, id: {test_mo.get('id')}, status: {test_mo.get('status')}")
            self.__class__.test_mo_id = test_mo.get("id")
            self.__class__.test_mo_number = test_mo.get("wo_number")
        else:
            # Try to find any pending MO
            pending_mo = next((wo for wo in work_orders if wo.get("status") == "pending" and not wo.get("materials_reserved")), None)
            if pending_mo:
                print(f"Using existing pending MO: {pending_mo.get('wo_number')}")
                self.__class__.test_mo_id = pending_mo.get("id")
                self.__class__.test_mo_number = pending_mo.get("wo_number")
            else:
                pytest.skip("No pending MO found for testing")
    
    def test_04_reserve_materials_for_mo(self):
        """Test POST /api/work-orders/{wo_id}/reserve - creates reserved_materials array"""
        if not hasattr(self.__class__, 'test_mo_id'):
            pytest.skip("No test MO created")
        
        mo_id = self.__class__.test_mo_id
        
        # Reserve materials
        reserve_res = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/reserve", cookies=self.cookies)
        assert reserve_res.status_code == 200, f"Failed to reserve: {reserve_res.text}"
        
        reserve_data = reserve_res.json()
        print(f"\nReserve result: {reserve_data.get('message')}")
        
        # Verify reserved_materials array
        reserved_materials = reserve_data.get("reserved_materials", [])
        assert len(reserved_materials) > 0, "No materials reserved"
        print(f"Reserved {len(reserved_materials)} materials:")
        
        for mat in reserved_materials[:10]:
            print(f"  - {mat.get('part_number')} ({mat.get('category')}): {mat.get('quantity')} {mat.get('uom')}")
        
        # Verify the MO now has materials_reserved=True
        mo_res = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}", cookies=self.cookies)
        assert mo_res.status_code == 200
        mo = mo_res.json()
        
        assert mo.get("materials_reserved") == True, "MO should have materials_reserved=True"
        assert len(mo.get("reserved_materials", [])) > 0, "MO should have reserved_materials array"
        print(f"\nMO {mo.get('wo_number')} now has materials_reserved=True with {len(mo.get('reserved_materials', []))} items")
    
    def test_05_mrp_demand_shows_reserved_for_mo(self):
        """Test GET /api/mrp/demand - returns ONLY raw_material items with reserved_for_mo field"""
        # Get MRP demand
        demand_res = self.session.get(f"{BASE_URL}/api/mrp/demand", cookies=self.cookies)
        assert demand_res.status_code == 200, f"Failed to get MRP demand: {demand_res.text}"
        
        demand = demand_res.json()
        print(f"\nMRP Demand items: {len(demand)}")
        
        # Verify all items are raw_material category
        for d in demand:
            item = d.get("item", {})
            category = item.get("category", "")
            assert category == "raw_material", f"MRP demand should only show raw_material items, found: {category} for {item.get('part_number')}"
        
        print("All MRP demand items are raw_material category")
        
        # Check for reserved_for_mo field
        items_with_reservation = [d for d in demand if d.get("reserved_for_mo", 0) > 0]
        print(f"\nItems with reserved_for_mo > 0: {len(items_with_reservation)}")
        
        for d in items_with_reservation[:5]:
            item = d.get("item", {})
            print(f"  - {item.get('part_number')}: reserved_for_mo={d.get('reserved_for_mo')}, on_hand={d.get('on_hand')}, net={d.get('net_requirement')}")
        
        # Verify reserved_for_mo field exists in response
        if len(demand) > 0:
            first_item = demand[0]
            assert "reserved_for_mo" in first_item, "MRP demand should include reserved_for_mo field"
            print(f"\nFirst item has reserved_for_mo field: {first_item.get('reserved_for_mo')}")
    
    def test_06_mrp_net_calculation_with_reservation(self):
        """Test MRP net calculation: net = gross_req - max(on_hand - reserved_for_mo - safety_stock, 0)"""
        # Get MRP demand
        demand_res = self.session.get(f"{BASE_URL}/api/mrp/demand", cookies=self.cookies)
        assert demand_res.status_code == 200
        demand = demand_res.json()
        
        print("\nVerifying MRP net calculation formula:")
        print("Formula: net = gross_req - max(on_hand - reserved_for_mo - safety_stock, 0)")
        
        for d in demand[:5]:
            item = d.get("item", {})
            gross = d.get("gross_requirement", 0)
            on_hand = d.get("on_hand", 0)
            reserved = d.get("reserved_for_mo", 0)
            safety = d.get("safety_stock", 0)
            net = d.get("net_requirement", 0)
            
            # Calculate expected net
            available = on_hand - reserved - safety
            expected_net = max(0, gross - max(available, 0))
            
            print(f"\n{item.get('part_number')}:")
            print(f"  gross={gross}, on_hand={on_hand}, reserved={reserved}, safety={safety}")
            print(f"  available = {on_hand} - {reserved} - {safety} = {available}")
            print(f"  expected_net = max(0, {gross} - max({available}, 0)) = {expected_net}")
            print(f"  actual_net = {net}")
            
            # Allow small floating point differences
            assert abs(net - expected_net) < 0.01, f"Net calculation mismatch for {item.get('part_number')}: expected {expected_net}, got {net}"
        
        print("\nMRP net calculation formula verified!")
    
    def test_07_unreserve_materials(self):
        """Test POST /api/work-orders/{wo_id}/unreserve - removes reservation"""
        if not hasattr(self.__class__, 'test_mo_id'):
            pytest.skip("No test MO created")
        
        mo_id = self.__class__.test_mo_id
        
        # Unreserve materials
        unreserve_res = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/unreserve", cookies=self.cookies)
        assert unreserve_res.status_code == 200, f"Failed to unreserve: {unreserve_res.text}"
        
        unreserve_data = unreserve_res.json()
        print(f"\nUnreserve result: {unreserve_data.get('message')}")
        
        # Verify the MO now has materials_reserved=False
        mo_res = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}", cookies=self.cookies)
        assert mo_res.status_code == 200
        mo = mo_res.json()
        
        assert mo.get("materials_reserved") == False, "MO should have materials_reserved=False after unreserve"
        assert len(mo.get("reserved_materials", [])) == 0, "MO should have empty reserved_materials array"
        print(f"MO {mo.get('wo_number')} now has materials_reserved=False")
    
    def test_08_mrp_demand_after_unreserve(self):
        """Verify MRP demand updates after unreserving"""
        # Get MRP demand
        demand_res = self.session.get(f"{BASE_URL}/api/mrp/demand", cookies=self.cookies)
        assert demand_res.status_code == 200
        demand = demand_res.json()
        
        print(f"\nMRP Demand after unreserve: {len(demand)} items")
        
        # Check reserved_for_mo values - should be lower or zero for items that were reserved
        items_with_reservation = [d for d in demand if d.get("reserved_for_mo", 0) > 0]
        print(f"Items still with reserved_for_mo > 0: {len(items_with_reservation)}")
        
        for d in items_with_reservation[:3]:
            item = d.get("item", {})
            print(f"  - {item.get('part_number')}: reserved_for_mo={d.get('reserved_for_mo')}")
    
    def test_09_reserve_again_and_verify(self):
        """Reserve again to verify the flow works multiple times"""
        if not hasattr(self.__class__, 'test_mo_id'):
            pytest.skip("No test MO created")
        
        mo_id = self.__class__.test_mo_id
        
        # Reserve again
        reserve_res = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/reserve", cookies=self.cookies)
        assert reserve_res.status_code == 200, f"Failed to reserve again: {reserve_res.text}"
        
        reserve_data = reserve_res.json()
        print(f"\nRe-reserve result: {reserve_data.get('message')}")
        
        # Verify MRP demand shows reserved_for_mo
        demand_res = self.session.get(f"{BASE_URL}/api/mrp/demand", cookies=self.cookies)
        assert demand_res.status_code == 200
        demand = demand_res.json()
        
        items_with_reservation = [d for d in demand if d.get("reserved_for_mo", 0) > 0]
        print(f"Items with reserved_for_mo > 0 after re-reserve: {len(items_with_reservation)}")
        assert len(items_with_reservation) > 0, "Should have items with reserved_for_mo after re-reserve"
    
    def test_10_cannot_reserve_already_reserved(self):
        """Test that reserving an already reserved MO returns error"""
        if not hasattr(self.__class__, 'test_mo_id'):
            pytest.skip("No test MO created")
        
        mo_id = self.__class__.test_mo_id
        
        # Try to reserve again (should fail)
        reserve_res = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/reserve", cookies=self.cookies)
        assert reserve_res.status_code == 400, f"Should fail to reserve already reserved MO: {reserve_res.text}"
        
        error_data = reserve_res.json()
        print(f"\nExpected error: {error_data.get('detail')}")
        assert "already reserved" in error_data.get("detail", "").lower()
    
    def test_11_mrp_suggestions_only_raw_materials(self):
        """Test GET /api/mrp/suggestions - should only show raw_material items"""
        suggestions_res = self.session.get(f"{BASE_URL}/api/mrp/suggestions", cookies=self.cookies)
        assert suggestions_res.status_code == 200, f"Failed to get suggestions: {suggestions_res.text}"
        
        suggestions = suggestions_res.json()
        print(f"\nMRP Suggestions: {len(suggestions)} items")
        
        # Verify all suggestions are raw_material category
        for s in suggestions:
            item = s.get("item", {})
            category = item.get("category", "")
            assert category == "raw_material", f"MRP suggestions should only show raw_material items, found: {category} for {item.get('part_number')}"
        
        print("All MRP suggestions are raw_material category")
        
        for s in suggestions[:5]:
            item = s.get("item", {})
            print(f"  - {item.get('part_number')}: {s.get('reason')}, suggested_qty={s.get('suggested_quantity')}")
    
    def test_12_cleanup_unreserve(self):
        """Cleanup - unreserve the test MO"""
        if not hasattr(self.__class__, 'test_mo_id'):
            pytest.skip("No test MO to cleanup")
        
        mo_id = self.__class__.test_mo_id
        
        # Unreserve
        unreserve_res = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/unreserve", cookies=self.cookies)
        # Don't fail if already unreserved
        if unreserve_res.status_code == 200:
            print(f"\nCleaned up: unreserved MO {self.__class__.test_mo_number}")
        else:
            print(f"\nMO already unreserved or error: {unreserve_res.text}")


class TestMRPDemandOnlyRM:
    """Additional tests to verify MRP demand only returns raw_material items"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.cookies = login_response.cookies
        yield
    
    def test_mrp_demand_categories(self):
        """Verify MRP demand only returns raw_material category items"""
        # Get all items to see what categories exist
        items_res = self.session.get(f"{BASE_URL}/api/items", cookies=self.cookies)
        assert items_res.status_code == 200
        items = items_res.json()
        
        categories = {}
        for item in items:
            cat = item.get("category", "unknown")
            categories[cat] = categories.get(cat, 0) + 1
        
        print(f"\nItem categories in system: {categories}")
        
        # Get MRP demand
        demand_res = self.session.get(f"{BASE_URL}/api/mrp/demand", cookies=self.cookies)
        assert demand_res.status_code == 200
        demand = demand_res.json()
        
        demand_categories = {}
        for d in demand:
            item = d.get("item", {})
            cat = item.get("category", "unknown")
            demand_categories[cat] = demand_categories.get(cat, 0) + 1
        
        print(f"MRP demand categories: {demand_categories}")
        
        # Verify only raw_material
        for cat in demand_categories.keys():
            assert cat == "raw_material", f"MRP demand should only have raw_material, found: {cat}"
        
        print("PASS: MRP demand only contains raw_material items")
    
    def test_mrp_demand_has_reserved_column(self):
        """Verify MRP demand response includes reserved_for_mo field"""
        demand_res = self.session.get(f"{BASE_URL}/api/mrp/demand", cookies=self.cookies)
        assert demand_res.status_code == 200
        demand = demand_res.json()
        
        if len(demand) == 0:
            pytest.skip("No demand items to check")
        
        # Check first item has all required fields
        first = demand[0]
        required_fields = ["item", "gross_requirement", "on_hand", "reserved_for_mo", "safety_stock", "net_requirement"]
        
        for field in required_fields:
            assert field in first, f"MRP demand missing field: {field}"
        
        print(f"\nMRP demand item structure verified:")
        print(f"  - item: {first.get('item', {}).get('part_number')}")
        print(f"  - gross_requirement: {first.get('gross_requirement')}")
        print(f"  - on_hand: {first.get('on_hand')}")
        print(f"  - reserved_for_mo: {first.get('reserved_for_mo')}")
        print(f"  - safety_stock: {first.get('safety_stock')}")
        print(f"  - net_requirement: {first.get('net_requirement')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
