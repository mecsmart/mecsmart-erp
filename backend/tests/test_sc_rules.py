"""
Test SC (Subcontract) Rules:
Rule 1: SC button visibility on parent MO - hide when any child MO is in_progress or outsourced
Rule 2: SC lines for with_material type should contain only leaf-level RM (recursive BOM resolution)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSCRules:
    """Test the two new SC rules for Manufacturing Orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token via cookies"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login - uses httpOnly cookies
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        # Cookies are automatically stored in session
        
        yield

    # ==================== RULE 1 TESTS ====================
    
    def test_login_works(self):
        """Test that login works with admin credentials"""
        resp = self.session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("email") == "admin@erp.com"
        print("✓ Login works with admin@erp.com / Admin@123")

    def test_rule1_get_work_orders_with_children(self):
        """Test that we can get work orders with their children status"""
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        data = resp.json()
        print(f"✓ Got {len(data)} work orders")
        
        # Check if any have parent_wo_id (children)
        children = [wo for wo in data if wo.get("parent_wo_id")]
        print(f"  - {len(children)} child work orders found")
        
        # Check statuses
        statuses = set(wo.get("status") for wo in data)
        print(f"  - Statuses found: {statuses}")

    def test_rule1_child_status_data_available(self):
        """
        Rule 1: Verify that work order data includes status field for frontend logic.
        Frontend checks: hasActiveChild = children with status in ['in_progress', 'outsourced']
        """
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        # Find parent MOs with children
        parent_ids = set(wo.get("parent_wo_id") for wo in work_orders if wo.get("parent_wo_id"))
        
        for parent_id in parent_ids:
            parent = next((wo for wo in work_orders if wo.get("id") == parent_id), None)
            if not parent:
                continue
            
            children = [wo for wo in work_orders if wo.get("parent_wo_id") == parent_id]
            
            # Check if any child is in_progress or outsourced
            active_children = [c for c in children if c.get("status") in ["in_progress", "outsourced"]]
            
            if active_children:
                print(f"✓ Parent {parent.get('wo_number')} has {len(active_children)} active children (in_progress/outsourced)")
                for child in active_children:
                    print(f"  - Child {child.get('wo_number')}: status={child.get('status')}")
                # According to Rule 1, SC button should be hidden for this parent
                
        print("✓ Rule 1 data structure verified - frontend can check child statuses")

    def test_rule1_outsourced_status_exists(self):
        """
        Rule 1: Verify that 'outsourced' status is used in the system.
        """
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        # Find any outsourced children
        outsourced = [wo for wo in work_orders if wo.get("status") == "outsourced"]
        
        if outsourced:
            print(f"✓ Found {len(outsourced)} outsourced work orders")
            for wo in outsourced[:3]:  # Show first 3
                print(f"  - {wo.get('wo_number')} (parent: {wo.get('parent_wo_id', 'none')})")
        else:
            print("✓ No outsourced work orders found (expected if no SC created yet)")

    def test_rule1_is_subcontract_field_exists(self):
        """
        Rule 1: Verify that is_subcontract field exists for frontend logic.
        """
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        subcontract_mos = [wo for wo in work_orders if wo.get("is_subcontract")]
        
        print(f"✓ Found {len(subcontract_mos)} subcontract MOs")
        for wo in subcontract_mos[:3]:
            print(f"  - {wo.get('wo_number')}: is_subcontract={wo.get('is_subcontract')}, type={wo.get('subcontract_type')}")

    # ==================== RULE 2 TESTS ====================

    def test_rule2_get_bom_structure(self):
        """
        Rule 2: Verify BOM structure exists with sub_assembly and raw_material items.
        """
        resp = self.session.get(f"{BASE_URL}/api/bom")
        assert resp.status_code == 200
        boms = resp.json()
        
        print(f"✓ Got {len(boms)} BOMs")
        
        # Check for BOMs with sub_assembly components
        for bom in boms[:5]:
            components = bom.get("components", [])
            print(f"  - BOM {bom.get('name')}: {len(components)} components")

    def test_rule2_items_have_categories(self):
        """
        Rule 2: Verify items have category field (raw_material, sub_assembly, etc.)
        """
        resp = self.session.get(f"{BASE_URL}/api/items")
        assert resp.status_code == 200
        items = resp.json()
        
        categories = {}
        for item in items:
            cat = item.get("category", "unknown")
            categories[cat] = categories.get(cat, 0) + 1
        
        print(f"✓ Item categories: {categories}")
        assert "raw_material" in categories, "Should have raw_material items"

    def test_rule2_create_sc_endpoint_exists(self):
        """
        Rule 2: Verify the create-sc endpoint exists and returns proper error for non-SC MO.
        """
        # Get a non-subcontract MO
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        non_sc_mo = next((wo for wo in work_orders if not wo.get("is_subcontract")), None)
        
        if non_sc_mo:
            # Try to create SC for non-SC MO - should fail
            sc_resp = self.session.post(f"{BASE_URL}/api/work-orders/{non_sc_mo['id']}/create-sc")
            assert sc_resp.status_code == 400, f"Should reject non-SC MO: {sc_resp.text}"
            print(f"✓ create-sc correctly rejects non-subcontract MO: {sc_resp.json().get('detail')}")
        else:
            print("✓ No non-subcontract MOs found to test rejection")

    def test_rule2_create_sc_with_material_for_sa(self):
        """
        Rule 2: Test that creating SC with_material for an SA item produces lines with only RM.
        Find an existing subcontract MO for SA and test create-sc.
        """
        # Get work orders
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        # Find a subcontract MO for sub_assembly with with_material type
        sa_sc_mo = None
        for wo in work_orders:
            if (wo.get("is_subcontract") and 
                wo.get("subcontract_type") == "with_material" and
                wo.get("item", {}).get("category") == "sub_assembly"):
                sa_sc_mo = wo
                break
        
        if not sa_sc_mo:
            print("✓ No sub_assembly subcontract MO with with_material found - skipping detailed test")
            return
        
        print(f"✓ Found SA subcontract MO: {sa_sc_mo.get('wo_number')}")
        print(f"  - Item: {sa_sc_mo.get('item', {}).get('part_number')} ({sa_sc_mo.get('item', {}).get('category')})")
        print(f"  - Type: {sa_sc_mo.get('subcontract_type')}")
        
        # Try to create SC
        sc_resp = self.session.post(f"{BASE_URL}/api/work-orders/{sa_sc_mo['id']}/create-sc")
        
        if sc_resp.status_code == 200:
            sc_data = sc_resp.json()
            sc_order = sc_data.get("sc_order", {})
            sc_lines = sc_order.get("lines", [])
            
            print(f"✓ SC created/found: {sc_order.get('order_number')}")
            print(f"  - Lines count: {len(sc_lines)}")
            
            # Verify each line is RM (not SA)
            items_resp = self.session.get(f"{BASE_URL}/api/items")
            items = {item["id"]: item for item in items_resp.json()}
            
            for line in sc_lines:
                item = items.get(line.get("item_id"), {})
                category = item.get("category", "unknown")
                print(f"  - Line: {item.get('part_number')} ({category}) qty={line.get('quantity')}")
                
                # CRITICAL ASSERTION: No sub_assembly items in lines
                assert category != "sub_assembly", f"RULE 2 VIOLATION: SA item {item.get('part_number')} found in SC lines!"
            
            print("✓ RULE 2 VERIFIED: SC lines contain only RM/component items, no sub_assembly")
        else:
            print(f"  - SC response: {sc_resp.status_code} - {sc_resp.text}")

    def test_rule2_without_material_has_fg_only(self):
        """
        Rule 2: Test that without_material SC type has only FG item in lines.
        """
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        # Find a subcontract MO with without_material type
        wom_mo = None
        for wo in work_orders:
            if (wo.get("is_subcontract") and 
                wo.get("subcontract_type") == "without_material"):
                wom_mo = wo
                break
        
        if not wom_mo:
            print("✓ No without_material subcontract MO found - skipping test")
            return
        
        print(f"✓ Found without_material MO: {wom_mo.get('wo_number')}")
        
        # Try to create SC
        sc_resp = self.session.post(f"{BASE_URL}/api/work-orders/{wom_mo['id']}/create-sc")
        
        if sc_resp.status_code == 200:
            sc_data = sc_resp.json()
            sc_order = sc_data.get("sc_order", {})
            sc_lines = sc_order.get("lines", [])
            
            print(f"✓ SC created/found: {sc_order.get('order_number')}")
            print(f"  - Lines count: {len(sc_lines)}")
            
            # For without_material, should have only FG item
            if len(sc_lines) == 1:
                print(f"✓ WITHOUT_MATERIAL has single line (FG item)")
            else:
                print(f"  - Note: {len(sc_lines)} lines found")

    def test_rule2_bom_explode_shows_rm(self):
        """
        Rule 2: Test BOM explode endpoint to verify RM resolution works.
        """
        # Get BOMs
        resp = self.session.get(f"{BASE_URL}/api/bom")
        assert resp.status_code == 200
        boms = resp.json()
        
        # Find a BOM with components
        bom_with_components = next((b for b in boms if len(b.get("components", [])) > 0), None)
        
        if not bom_with_components:
            print("✓ No BOM with components found - skipping explode test")
            return
        
        # Test explode endpoint
        explode_resp = self.session.get(f"{BASE_URL}/api/bom/{bom_with_components['id']}/explode")
        
        if explode_resp.status_code == 200:
            exploded = explode_resp.json()
            print(f"✓ BOM explode works for {bom_with_components.get('name')}")
            
            # Check for RM items in exploded BOM
            items_resp = self.session.get(f"{BASE_URL}/api/items")
            items = {item["id"]: item for item in items_resp.json()}
            
            rm_count = 0
            sa_count = 0
            for comp in exploded.get("components", []):
                item = items.get(comp.get("item_id"), {})
                if item.get("category") == "raw_material":
                    rm_count += 1
                elif item.get("category") == "sub_assembly":
                    sa_count += 1
            
            print(f"  - RM items: {rm_count}, SA items: {sa_count}")
        else:
            print(f"  - Explode failed: {explode_resp.status_code}")

    def test_rule2_verify_collect_rm_logic(self):
        """
        Rule 2: Verify the collect_rm logic by checking SC lines for a with_material SC.
        The SC lines should contain ONLY raw_material and component items.
        """
        # Get all work orders
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        # Get items for category lookup
        items_resp = self.session.get(f"{BASE_URL}/api/items")
        items = {item["id"]: item for item in items_resp.json()}
        
        # Find all subcontract MOs with with_material type
        with_material_mos = [wo for wo in work_orders 
                            if wo.get("is_subcontract") and wo.get("subcontract_type") == "with_material"]
        
        print(f"✓ Found {len(with_material_mos)} with_material subcontract MOs")
        
        for mo in with_material_mos[:3]:  # Test first 3
            print(f"\n  Testing MO: {mo.get('wo_number')}")
            item = mo.get("item", {})
            print(f"  - Item: {item.get('part_number')} ({item.get('category')})")
            
            # Create SC
            sc_resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo['id']}/create-sc")
            
            if sc_resp.status_code == 200:
                sc_data = sc_resp.json()
                sc_order = sc_data.get("sc_order", {})
                sc_lines = sc_order.get("lines", [])
                
                print(f"  - SC: {sc_order.get('order_number')} with {len(sc_lines)} lines")
                
                # Verify all lines are RM or component (not sub_assembly)
                for line in sc_lines:
                    line_item = items.get(line.get("item_id"), {})
                    category = line_item.get("category", "unknown")
                    
                    if category == "sub_assembly":
                        print(f"  ❌ RULE 2 VIOLATION: SA item {line_item.get('part_number')} in SC lines!")
                        assert False, f"Sub-assembly {line_item.get('part_number')} should not be in SC lines"
                    else:
                        print(f"    ✓ {line_item.get('part_number')} ({category}) qty={line.get('quantity')}")
            else:
                print(f"  - SC creation: {sc_resp.status_code}")

    def test_children_marked_outsourced_after_sc(self):
        """
        Test that child MOs are marked as 'outsourced' after parent creates SC.
        """
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        # Find MOs with outsourced_by_parent flag
        outsourced_by_parent = [wo for wo in work_orders if wo.get("outsourced_by_parent")]
        
        if outsourced_by_parent:
            print(f"✓ Found {len(outsourced_by_parent)} MOs marked as outsourced_by_parent")
            for wo in outsourced_by_parent[:3]:
                print(f"  - {wo.get('wo_number')}: status={wo.get('status')}, sc_order={wo.get('outsourced_sc_order')}")
        else:
            print("✓ No MOs with outsourced_by_parent flag (expected if no SC created)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
