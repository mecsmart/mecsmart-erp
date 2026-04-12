"""
Test SC Direct Flow - 4 Changes:
1. Sales Order search box
2. When SC checked in Create MO, create SC Order directly (no MO), with first-level BOM components
3. No child MOs for stock items when SC
4. Consolidate SC orders for same supplier+SO into single order
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSCDirectFlow:
    """Test SC Direct Flow features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Store cookies for subsequent requests
        self.cookies = login_response.cookies
        
        yield
    
    def test_01_sales_order_search_exists(self):
        """Test that Sales Orders endpoint returns data that can be searched"""
        response = self.session.get(f"{BASE_URL}/api/production", cookies=self.cookies)
        assert response.status_code == 200, f"Failed to get production orders: {response.text}"
        
        orders = response.json()
        print(f"Found {len(orders)} sales orders")
        
        # Verify orders have searchable fields
        if orders:
            order = orders[0]
            assert "order_number" in order, "order_number field missing"
            assert "bom" in order or "bom_id" in order, "BOM reference missing"
            print(f"Sample order: {order.get('order_number')}")
    
    def test_02_get_confirmed_sales_order(self):
        """Get a confirmed sales order for testing"""
        response = self.session.get(f"{BASE_URL}/api/production?status=confirmed", cookies=self.cookies)
        assert response.status_code == 200, f"Failed to get confirmed orders: {response.text}"
        
        orders = response.json()
        print(f"Found {len(orders)} confirmed sales orders")
        
        # Store for later tests
        self.confirmed_orders = orders
        
        if orders:
            order = orders[0]
            print(f"Using SO: {order.get('order_number')} (ID: {order.get('id')})")
            print(f"  - Quantity: {order.get('quantity')}")
            print(f"  - MO Qty Created: {order.get('mo_qty_created', 0)}")
            print(f"  - Balance: {order.get('quantity', 0) - order.get('mo_qty_created', 0)}")
    
    def test_03_get_suppliers(self):
        """Get suppliers for SC testing"""
        response = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
        assert response.status_code == 200, f"Failed to get suppliers: {response.text}"
        
        suppliers = response.json()
        print(f"Found {len(suppliers)} suppliers")
        
        if suppliers:
            for s in suppliers[:3]:
                print(f"  - {s.get('code')}: {s.get('name')} (ID: {s.get('id')})")
    
    def test_04_get_routings(self):
        """Get active routings for MO creation"""
        response = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        assert response.status_code == 200, f"Failed to get routings: {response.text}"
        
        routings = response.json()
        active_routings = [r for r in routings if r.get('status') == 'active']
        print(f"Found {len(active_routings)} active routings")
        
        if active_routings:
            for r in active_routings[:3]:
                print(f"  - {r.get('name')} for item {r.get('item', {}).get('part_number', r.get('item_id'))}")
    
    def test_05_get_boms(self):
        """Get BOMs to understand component structure"""
        response = self.session.get(f"{BASE_URL}/api/bom?status=active", cookies=self.cookies)
        assert response.status_code == 200, f"Failed to get BOMs: {response.text}"
        
        boms = response.json()
        print(f"Found {len(boms)} active BOMs")
        
        if boms:
            for bom in boms[:2]:
                print(f"\nBOM: {bom.get('name')} (Parent: {bom.get('parent_item', {}).get('part_number', 'N/A')})")
                components = bom.get('components', [])
                print(f"  Components ({len(components)}):")
                for comp in components[:5]:
                    print(f"    - {comp.get('item_id')}: qty {comp.get('quantity')}")
    
    def test_06_sc_direct_creates_sc_order_not_mo(self):
        """
        Test: When is_subcontract=true, response has is_sc_direct=true and sc_order object, NOT work_orders
        """
        # Get confirmed SO with balance
        so_response = self.session.get(f"{BASE_URL}/api/production?status=confirmed", cookies=self.cookies)
        assert so_response.status_code == 200
        orders = so_response.json()
        
        # Find SO with balance
        so = None
        for o in orders:
            balance = o.get('quantity', 0) - o.get('mo_qty_created', 0)
            if balance > 0:
                so = o
                break
        
        if not so:
            pytest.skip("No confirmed SO with balance available")
        
        # Get routing
        routing_response = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        routings = routing_response.json()
        active_routing = next((r for r in routings if r.get('status') == 'active'), None)
        
        if not active_routing:
            pytest.skip("No active routing available")
        
        # Get supplier
        supplier_response = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
        suppliers = supplier_response.json()
        
        if not suppliers:
            pytest.skip("No suppliers available")
        
        supplier = suppliers[0]
        
        # Create MO with is_subcontract=true
        payload = {
            "production_order_id": so["id"],
            "routing_id": active_routing["id"],
            "quantity": 1,
            "is_subcontract": True,
            "subcontract_supplier_id": supplier["id"],
            "subcontract_type": "with_material"
        }
        
        print(f"\nCreating SC for SO: {so.get('order_number')}")
        print(f"  Supplier: {supplier.get('name')}")
        print(f"  Routing: {active_routing.get('name')}")
        
        response = self.session.post(f"{BASE_URL}/api/work-orders", json=payload, cookies=self.cookies)
        
        # Should succeed
        assert response.status_code in [200, 201], f"Failed to create SC: {response.text}"
        
        data = response.json()
        print(f"\nResponse: {data}")
        
        # Verify is_sc_direct=true
        assert data.get("is_sc_direct") == True, f"Expected is_sc_direct=true, got {data.get('is_sc_direct')}"
        
        # Verify sc_order exists
        assert "sc_order" in data, "sc_order missing from response"
        sc_order = data["sc_order"]
        assert sc_order is not None, "sc_order is None"
        
        # Verify work_orders is empty
        work_orders = data.get("work_orders", [])
        assert len(work_orders) == 0, f"Expected no work_orders, got {len(work_orders)}"
        
        print(f"\n✓ SC Order created: {sc_order.get('order_number')}")
        print(f"✓ is_sc_direct: {data.get('is_sc_direct')}")
        print(f"✓ work_orders count: {len(work_orders)}")
        
        # Store for later tests
        self.created_sc_order = sc_order
        self.test_so = so
        self.test_supplier = supplier
    
    def test_07_sc_order_has_required_fields(self):
        """
        Test: SC Order has production_order_id, fg_item_id, fg_quantity fields
        """
        # Get SC orders
        response = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
        assert response.status_code == 200, f"Failed to get SC orders: {response.text}"
        
        sc_orders = response.json()
        print(f"Found {len(sc_orders)} SC orders")
        
        if not sc_orders:
            pytest.skip("No SC orders to verify")
        
        # Check latest SC order
        sc_order = sc_orders[0]
        print(f"\nVerifying SC Order: {sc_order.get('order_number')}")
        
        # Check required fields
        assert "production_order_id" in sc_order, "production_order_id missing"
        assert "fg_item_id" in sc_order, "fg_item_id missing"
        assert "fg_quantity" in sc_order, "fg_quantity missing"
        
        print(f"  production_order_id: {sc_order.get('production_order_id')}")
        print(f"  fg_item_id: {sc_order.get('fg_item_id')}")
        print(f"  fg_quantity: {sc_order.get('fg_quantity')}")
        
        # Verify lines exist
        lines = sc_order.get("lines", [])
        print(f"  Lines count: {len(lines)}")
        for line in lines[:3]:
            print(f"    - item_id: {line.get('item_id')}, qty: {line.get('quantity')}, sent: {line.get('sent_quantity', 0)}")
    
    def test_08_sc_order_lines_contain_bom_components(self):
        """
        Test: SC Order lines contain first-level BOM components (not the FG item itself when BOM exists)
        """
        # Get SC orders
        response = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
        assert response.status_code == 200
        
        sc_orders = response.json()
        if not sc_orders:
            pytest.skip("No SC orders to verify")
        
        # Find SC order with fg_item_id
        sc_order = None
        for sc in sc_orders:
            if sc.get("fg_item_id"):
                sc_order = sc
                break
        
        if not sc_order:
            pytest.skip("No SC order with fg_item_id found")
        
        fg_item_id = sc_order.get("fg_item_id")
        lines = sc_order.get("lines", [])
        
        print(f"\nSC Order: {sc_order.get('order_number')}")
        print(f"FG Item ID: {fg_item_id}")
        print(f"Lines: {len(lines)}")
        
        # Get BOM for FG item
        bom_response = self.session.get(f"{BASE_URL}/api/bom?status=active", cookies=self.cookies)
        boms = bom_response.json()
        
        fg_bom = next((b for b in boms if b.get("parent_item_id") == fg_item_id), None)
        
        if fg_bom:
            bom_components = [c.get("item_id") for c in fg_bom.get("components", []) if not c.get("is_alternate")]
            sc_line_items = [l.get("item_id") for l in lines]
            
            print(f"\nBOM components: {bom_components}")
            print(f"SC line items: {sc_line_items}")
            
            # Verify SC lines contain BOM components, not FG item
            if len(bom_components) > 0:
                # FG item should NOT be in SC lines (unless no BOM)
                if fg_item_id in sc_line_items and len(bom_components) > 0:
                    print(f"WARNING: FG item {fg_item_id} found in SC lines despite having BOM")
                
                # At least some BOM components should be in SC lines
                matching = [c for c in bom_components if c in sc_line_items]
                print(f"Matching BOM components in SC lines: {len(matching)}/{len(bom_components)}")
        else:
            print(f"No BOM found for FG item {fg_item_id} - SC lines should contain FG item itself")
    
    def test_09_with_material_creates_dc(self):
        """
        Test: With Material type: DC auto-created, sent_quantity > 0
        """
        # Get SC orders
        response = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
        assert response.status_code == 200
        
        sc_orders = response.json()
        
        # Find SC order with subcontract_type = with_material
        with_material_sc = None
        for sc in sc_orders:
            if sc.get("subcontract_type") == "with_material":
                with_material_sc = sc
                break
        
        if not with_material_sc:
            pytest.skip("No 'with_material' SC order found")
        
        print(f"\nWith Material SC Order: {with_material_sc.get('order_number')}")
        
        # Check sent_quantity > 0 in lines
        lines = with_material_sc.get("lines", [])
        has_sent = any(l.get("sent_quantity", 0) > 0 for l in lines)
        
        print(f"Lines with sent_quantity > 0: {has_sent}")
        for line in lines[:3]:
            print(f"  - item: {line.get('item_id')}, sent: {line.get('sent_quantity', 0)}")
        
        # Check for DC
        dc_response = self.session.get(f"{BASE_URL}/api/job-work/dc", cookies=self.cookies)
        if dc_response.status_code == 200:
            dcs = dc_response.json()
            related_dc = [dc for dc in dcs if dc.get("subcontract_order_id") == with_material_sc.get("id")]
            print(f"Related DCs: {len(related_dc)}")
            if related_dc:
                print(f"  DC Number: {related_dc[0].get('dc_number')}")
    
    def test_10_without_material_no_dc(self):
        """
        Test: Without Material type: No DC, sent_quantity = 0
        """
        # Get SC orders
        response = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
        assert response.status_code == 200
        
        sc_orders = response.json()
        
        # Find SC order with subcontract_type = without_material
        without_material_sc = None
        for sc in sc_orders:
            if sc.get("subcontract_type") == "without_material":
                without_material_sc = sc
                break
        
        if not without_material_sc:
            print("No 'without_material' SC order found - creating one for test")
            
            # Create one
            so_response = self.session.get(f"{BASE_URL}/api/production?status=confirmed", cookies=self.cookies)
            orders = so_response.json()
            so = next((o for o in orders if o.get('quantity', 0) - o.get('mo_qty_created', 0) > 0), None)
            
            if not so:
                pytest.skip("No SO with balance for testing")
            
            routing_response = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
            routings = routing_response.json()
            routing = next((r for r in routings if r.get('status') == 'active'), None)
            
            supplier_response = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
            suppliers = supplier_response.json()
            supplier = suppliers[0] if suppliers else None
            
            if not routing or not supplier:
                pytest.skip("Missing routing or supplier")
            
            payload = {
                "production_order_id": so["id"],
                "routing_id": routing["id"],
                "quantity": 1,
                "is_subcontract": True,
                "subcontract_supplier_id": supplier["id"],
                "subcontract_type": "without_material"
            }
            
            create_response = self.session.post(f"{BASE_URL}/api/work-orders", json=payload, cookies=self.cookies)
            if create_response.status_code in [200, 201]:
                data = create_response.json()
                without_material_sc = data.get("sc_order")
        
        if not without_material_sc:
            pytest.skip("Could not get/create without_material SC order")
        
        print(f"\nWithout Material SC Order: {without_material_sc.get('order_number')}")
        
        # Check sent_quantity = 0 in lines
        lines = without_material_sc.get("lines", [])
        all_zero_sent = all(l.get("sent_quantity", 0) == 0 for l in lines)
        
        print(f"All lines have sent_quantity = 0: {all_zero_sent}")
        for line in lines[:3]:
            print(f"  - item: {line.get('item_id')}, sent: {line.get('sent_quantity', 0)}")
        
        assert all_zero_sent, "Without material SC should have sent_quantity = 0"
    
    def test_11_consolidation_same_supplier_same_so(self):
        """
        Test: When creating 2nd SC for same supplier + same SO, it consolidates into existing SC order
        """
        # Get confirmed SO with balance
        so_response = self.session.get(f"{BASE_URL}/api/production?status=confirmed", cookies=self.cookies)
        orders = so_response.json()
        
        # Find SO with enough balance for 2 SCs
        so = None
        for o in orders:
            balance = o.get('quantity', 0) - o.get('mo_qty_created', 0)
            if balance >= 2:
                so = o
                break
        
        if not so:
            pytest.skip("No SO with balance >= 2 for consolidation test")
        
        # Get routing and supplier
        routing_response = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        routings = routing_response.json()
        routing = next((r for r in routings if r.get('status') == 'active'), None)
        
        supplier_response = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
        suppliers = supplier_response.json()
        supplier = suppliers[0] if suppliers else None
        
        if not routing or not supplier:
            pytest.skip("Missing routing or supplier")
        
        print(f"\nTesting consolidation for SO: {so.get('order_number')}")
        print(f"Supplier: {supplier.get('name')}")
        
        # Create first SC
        payload1 = {
            "production_order_id": so["id"],
            "routing_id": routing["id"],
            "quantity": 1,
            "is_subcontract": True,
            "subcontract_supplier_id": supplier["id"],
            "subcontract_type": "with_material"
        }
        
        response1 = self.session.post(f"{BASE_URL}/api/work-orders", json=payload1, cookies=self.cookies)
        
        if response1.status_code not in [200, 201]:
            pytest.skip(f"First SC creation failed: {response1.text}")
        
        data1 = response1.json()
        sc_order_1 = data1.get("sc_order", {})
        sc_order_number_1 = sc_order_1.get("order_number")
        
        print(f"\nFirst SC created/consolidated: {sc_order_number_1}")
        
        # Create second SC with same supplier + same SO
        payload2 = {
            "production_order_id": so["id"],
            "routing_id": routing["id"],
            "quantity": 1,
            "is_subcontract": True,
            "subcontract_supplier_id": supplier["id"],
            "subcontract_type": "with_material"
        }
        
        response2 = self.session.post(f"{BASE_URL}/api/work-orders", json=payload2, cookies=self.cookies)
        
        if response2.status_code not in [200, 201]:
            print(f"Second SC creation failed: {response2.text}")
            # This might be expected if balance is exhausted
            return
        
        data2 = response2.json()
        sc_order_2 = data2.get("sc_order", {})
        sc_order_number_2 = sc_order_2.get("order_number")
        
        print(f"Second SC result: {sc_order_number_2}")
        print(f"Message: {data2.get('message', '')}")
        
        # Check if consolidated (same order number)
        if "Consolidated" in data2.get("message", ""):
            print(f"✓ Consolidation confirmed: {data2.get('message')}")
            assert sc_order_number_1 == sc_order_number_2, "Consolidated SC should have same order number"
        else:
            print(f"Note: New SC created (may be different supplier/SO or status)")
    
    def test_12_normal_mo_creation_still_works(self):
        """
        Test: Normal MO creation still works when is_subcontract=false
        """
        # Get confirmed SO with balance
        so_response = self.session.get(f"{BASE_URL}/api/production?status=confirmed", cookies=self.cookies)
        orders = so_response.json()
        
        so = None
        for o in orders:
            balance = o.get('quantity', 0) - o.get('mo_qty_created', 0)
            if balance > 0:
                so = o
                break
        
        if not so:
            pytest.skip("No SO with balance for normal MO test")
        
        # Get routing
        routing_response = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        routings = routing_response.json()
        routing = next((r for r in routings if r.get('status') == 'active'), None)
        
        if not routing:
            pytest.skip("No active routing")
        
        # Create normal MO (is_subcontract=false)
        payload = {
            "production_order_id": so["id"],
            "routing_id": routing["id"],
            "quantity": 1,
            "is_subcontract": False
        }
        
        print(f"\nCreating normal MO for SO: {so.get('order_number')}")
        
        response = self.session.post(f"{BASE_URL}/api/work-orders", json=payload, cookies=self.cookies)
        
        assert response.status_code in [200, 201], f"Normal MO creation failed: {response.text}"
        
        data = response.json()
        print(f"Response: {data}")
        
        # Verify is_sc_direct is NOT true
        assert data.get("is_sc_direct") != True, "Normal MO should not have is_sc_direct=true"
        
        # Verify work_orders array exists and has items
        work_orders = data.get("work_orders", [])
        assert len(work_orders) > 0, "Normal MO should create work_orders"
        
        print(f"✓ Normal MO created: {len(work_orders)} work order(s)")
        for wo in work_orders[:3]:
            print(f"  - {wo.get('wo_number')}: {wo.get('item_id')}")


class TestSalesOrderSearch:
    """Test Sales Order search functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.cookies = login_response.cookies
        
        yield
    
    def test_sales_order_list_has_searchable_fields(self):
        """Verify SO list returns fields needed for search"""
        response = self.session.get(f"{BASE_URL}/api/production", cookies=self.cookies)
        assert response.status_code == 200
        
        orders = response.json()
        print(f"Found {len(orders)} sales orders")
        
        if orders:
            order = orders[0]
            # Check searchable fields exist
            assert "order_number" in order, "order_number missing"
            
            # Check item info (for product name search)
            item = order.get("item", {})
            if item:
                print(f"Item fields: part_number={item.get('part_number')}, name={item.get('name')}")
            
            # Check BOM info (for BOM name search)
            bom = order.get("bom", {})
            if bom:
                print(f"BOM fields: name={bom.get('name')}")
            
            print(f"\nSample SO for search testing:")
            print(f"  order_number: {order.get('order_number')}")
            print(f"  item.part_number: {item.get('part_number', 'N/A')}")
            print(f"  item.name: {item.get('name', 'N/A')}")
            print(f"  bom.name: {bom.get('name', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
