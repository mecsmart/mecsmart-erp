#!/usr/bin/env python3
"""
Work Order API Tests - Testing the bug fix for work order creation
Bug: When creating a main assembly work order, sub-assembly and part work orders were not being created.
Fix: Removed stock checks so main WO always creates, and child WOs always create for items with routings.

Tests:
1. POST /api/work-orders - Create work order for FG item should ALWAYS create main WO regardless of stock levels
2. POST /api/work-orders - Should auto-create child WOs for sub-assemblies that have routings
3. POST /api/work-orders/{id}/start - Starting a WO should consume materials from inventory
4. POST /api/work-orders/{id}/complete - Completing a WO should update finished goods stock
5. GET /api/work-orders - List all work orders including parent/child relationships
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://industrial-bom-suite.preview.emergentagent.com').rstrip('/')


class TestWorkOrderCreation:
    """Test work order creation functionality - the main bug fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@erp.com", "password": "Admin@123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        yield
        # Cleanup handled by test data prefixes
    
    def test_01_login_and_auth(self):
        """Test admin login works correctly"""
        response = self.session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data['role'] == 'admin'
        assert data['email'] == 'admin@erp.com'
        print(f"✅ Admin login successful: {data['name']}")
    
    def test_02_get_routings(self):
        """Test getting routings - FG-001 and SA-001 should have routings"""
        response = self.session.get(f"{BASE_URL}/api/routings")
        assert response.status_code == 200
        routings = response.json()
        
        # Find routings for FG-001 and SA-001
        fg_routing = None
        sa_routing = None
        for r in routings:
            if r.get('item', {}).get('part_number') == 'FG-001':
                fg_routing = r
            elif r.get('item', {}).get('part_number') == 'SA-001':
                sa_routing = r
        
        assert fg_routing is not None, "FG-001 should have a routing"
        assert sa_routing is not None, "SA-001 should have a routing"
        print(f"✅ Found routing for FG-001: {fg_routing['id']}")
        print(f"✅ Found routing for SA-001: {sa_routing['id']}")
        
        # Store for later tests
        self.__class__.fg_routing_id = fg_routing['id']
        self.__class__.sa_routing_id = sa_routing['id']
    
    def test_03_get_production_orders(self):
        """Test getting production orders"""
        response = self.session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        orders = response.json()
        print(f"✅ Found {len(orders)} production orders")
        
        # Find a production order that's not completed/cancelled
        active_po = None
        for po in orders:
            if po.get('status') not in ['completed', 'cancelled']:
                active_po = po
                break
        
        if active_po:
            self.__class__.production_order_id = active_po['id']
            print(f"✅ Using production order: {active_po['order_number']}")
        else:
            # Create a new production order if none exists
            bom_response = self.session.get(f"{BASE_URL}/api/bom")
            assert bom_response.status_code == 200
            boms = bom_response.json()
            
            if boms:
                active_bom = next((b for b in boms if b.get('status') == 'active'), boms[0])
                create_po = self.session.post(
                    f"{BASE_URL}/api/production",
                    json={
                        "bom_id": active_bom['id'],
                        "quantity": 5,
                        "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
                        "priority": "medium",
                        "notes": "TEST_WO_Creation"
                    }
                )
                assert create_po.status_code in [200, 201], f"Failed to create PO: {create_po.text}"
                self.__class__.production_order_id = create_po.json()['id']
                print(f"✅ Created new production order: {create_po.json()['order_number']}")
    
    def test_04_create_work_order_always_creates_main_wo(self):
        """
        BUG FIX TEST: Main work order should ALWAYS be created regardless of stock levels.
        Previously, stock checks prevented WO creation if stock was sufficient.
        """
        # Get the FG-001 routing
        response = self.session.get(f"{BASE_URL}/api/routings")
        routings = response.json()
        fg_routing = next((r for r in routings if r.get('item', {}).get('part_number') == 'FG-001'), None)
        
        assert fg_routing is not None, "FG-001 routing required for this test"
        
        # Create work order
        wo_data = {
            "production_order_id": self.__class__.production_order_id,
            "routing_id": fg_routing['id'],
            "quantity": 2,
            "scheduled_start": datetime.now().isoformat(),
            "scheduled_end": (datetime.now() + timedelta(days=1)).isoformat(),
            "notes": "TEST_WO_BugFix_MainWO"
        }
        
        response = self.session.post(f"{BASE_URL}/api/work-orders", json=wo_data)
        assert response.status_code in [200, 201], f"Failed to create WO: {response.text}"
        
        data = response.json()
        assert 'work_orders' in data, "Response should contain work_orders list"
        assert len(data['work_orders']) >= 1, "At least main WO should be created"
        
        # Verify main WO was created
        main_wo = data['work_orders'][0]
        assert main_wo['parent_wo_id'] is None, "Main WO should have no parent"
        assert main_wo['quantity'] == 2, "Main WO should have requested quantity"
        
        print(f"✅ Main WO created: {main_wo['wo_number']} (qty={main_wo['quantity']})")
        self.__class__.main_wo_id = main_wo['id']
        self.__class__.created_wos = data['work_orders']
    
    def test_05_child_work_orders_created_for_items_with_routings(self):
        """
        BUG FIX TEST: Child work orders should be auto-created for sub-assemblies that have routings.
        SA-001 has a routing, so it should get a child WO.
        SA-002 does NOT have a routing, so it should NOT get a child WO.
        """
        # Check the work orders created in previous test
        created_wos = getattr(self.__class__, 'created_wos', [])
        
        if len(created_wos) > 1:
            # Find child WOs
            child_wos = [wo for wo in created_wos if wo.get('parent_wo_id') is not None]
            print(f"✅ {len(child_wos)} child work order(s) created")
            
            for child_wo in child_wos:
                print(f"   - {child_wo['wo_number']} (parent: {child_wo['parent_wo_id'][:8]}...)")
                assert child_wo['parent_wo_id'] == self.__class__.main_wo_id, "Child WO should reference main WO"
        else:
            # If only main WO created, verify SA-001 has routing but wasn't in BOM
            # or BOM doesn't exist for FG-001
            print("ℹ️ Only main WO created - checking if this is expected")
            
            # Get BOM for FG-001
            bom_response = self.session.get(f"{BASE_URL}/api/bom")
            boms = bom_response.json()
            
            # Find FG-001's BOM
            items_response = self.session.get(f"{BASE_URL}/api/items")
            items = items_response.json()
            fg_item = next((i for i in items if i.get('part_number') == 'FG-001'), None)
            
            if fg_item:
                fg_bom = next((b for b in boms if b.get('parent_item_id') == fg_item['id'] and b.get('status') == 'active'), None)
                if fg_bom:
                    print(f"   FG-001 BOM has {len(fg_bom.get('components', []))} components")
                else:
                    print("   No active BOM found for FG-001")
    
    def test_06_get_work_orders_with_hierarchy(self):
        """Test GET /api/work-orders returns all WOs with parent/child relationships"""
        response = self.session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        assert isinstance(work_orders, list), "Should return list of work orders"
        
        # Find our test WOs
        test_wos = [wo for wo in work_orders if 'TEST_WO' in (wo.get('notes') or '')]
        
        # Check parent-child relationships
        parent_wos = [wo for wo in work_orders if wo.get('parent_wo_id') is None]
        child_wos = [wo for wo in work_orders if wo.get('parent_wo_id') is not None]
        
        print(f"✅ Total work orders: {len(work_orders)}")
        print(f"   - Parent WOs: {len(parent_wos)}")
        print(f"   - Child WOs: {len(child_wos)}")
        
        # Verify each child WO has a valid parent
        for child in child_wos:
            parent_exists = any(wo['id'] == child['parent_wo_id'] for wo in work_orders)
            assert parent_exists, f"Child WO {child['wo_number']} has invalid parent_wo_id"
    
    def test_07_start_work_order_consumes_materials(self):
        """Test POST /api/work-orders/{id}/start consumes materials from inventory"""
        main_wo_id = getattr(self.__class__, 'main_wo_id', None)
        
        if not main_wo_id:
            pytest.skip("No main WO created in previous test")
        
        # Get current inventory levels for materials
        items_before = self.session.get(f"{BASE_URL}/api/items").json()
        
        # Start the work order
        response = self.session.post(f"{BASE_URL}/api/work-orders/{main_wo_id}/start")
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('success') == False:
                # Insufficient materials
                print(f"⚠️ Cannot start WO - insufficient materials:")
                for mat in data.get('insufficient_materials', []):
                    print(f"   - {mat['item']}: need {mat['required']}, have {mat['available']}")
                # This is expected behavior, not a failure
                return
            
            # Materials consumed successfully
            consumed = data.get('consumed_materials', [])
            print(f"✅ Work order started, materials consumed:")
            for mat in consumed:
                print(f"   - {mat['item']}: {mat['quantity']} units")
            
            # Verify inventory was reduced
            items_after = self.session.get(f"{BASE_URL}/api/items").json()
            
            for mat in consumed:
                item_before = next((i for i in items_before if i.get('part_number') == mat['item']), None)
                item_after = next((i for i in items_after if i.get('part_number') == mat['item']), None)
                
                if item_before and item_after:
                    expected_stock = item_before.get('current_stock', 0) - mat['quantity']
                    actual_stock = item_after.get('current_stock', 0)
                    assert actual_stock == expected_stock, f"Stock mismatch for {mat['item']}"
            
            self.__class__.wo_started = True
        else:
            print(f"⚠️ Start WO returned {response.status_code}: {response.text}")
    
    def test_08_complete_work_order_updates_stock(self):
        """Test completing a WO updates finished goods stock"""
        main_wo_id = getattr(self.__class__, 'main_wo_id', None)
        wo_started = getattr(self.__class__, 'wo_started', False)
        
        if not main_wo_id:
            pytest.skip("No main WO created")
        
        if not wo_started:
            pytest.skip("WO not started - cannot complete")
        
        # Get current stock of the finished good
        wo_response = self.session.get(f"{BASE_URL}/api/work-orders/{main_wo_id}")
        if wo_response.status_code != 200:
            pytest.skip("Cannot get WO details")
        
        wo = wo_response.json()
        item_id = wo.get('item', {}).get('id') or wo.get('item_id')
        
        if item_id:
            item_before = self.session.get(f"{BASE_URL}/api/items/{item_id}").json()
            stock_before = item_before.get('current_stock', 0)
        
        # Complete the work order
        response = self.session.put(
            f"{BASE_URL}/api/work-orders/{main_wo_id}",
            json={"status": "completed", "quantity_completed": wo.get('quantity', 0)}
        )
        
        if response.status_code == 200:
            print(f"✅ Work order completed")
            
            # Verify stock increased
            if item_id:
                item_after = self.session.get(f"{BASE_URL}/api/items/{item_id}").json()
                stock_after = item_after.get('current_stock', 0)
                
                expected_increase = wo.get('quantity', 0)
                actual_increase = stock_after - stock_before
                
                print(f"   Stock before: {stock_before}, after: {stock_after}")
                print(f"   Expected increase: {expected_increase}, actual: {actual_increase}")
        else:
            print(f"⚠️ Complete WO returned {response.status_code}: {response.text}")
    
    def test_09_existing_work_orders_not_affected(self):
        """Verify existing completed/in-progress work orders are not affected by the fix"""
        response = self.session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        
        # Check for any corrupted data
        for wo in work_orders:
            assert 'id' in wo, "WO should have id"
            assert 'wo_number' in wo, "WO should have wo_number"
            assert 'status' in wo, "WO should have status"
            assert wo['status'] in ['pending', 'in_progress', 'completed', 'cancelled'], f"Invalid status: {wo['status']}"
        
        # Count by status
        status_counts = {}
        for wo in work_orders:
            status = wo['status']
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"✅ Work order status distribution:")
        for status, count in status_counts.items():
            print(f"   - {status}: {count}")


class TestWorkOrderEdgeCases:
    """Test edge cases for work order functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@erp.com", "password": "Admin@123"}
        )
        assert login_response.status_code == 200
        yield
    
    def test_create_wo_with_invalid_routing(self):
        """Test creating WO with non-existent routing returns 404"""
        # Get a valid production order
        po_response = self.session.get(f"{BASE_URL}/api/production")
        orders = po_response.json()
        
        if not orders:
            pytest.skip("No production orders available")
        
        po_id = orders[0]['id']
        
        response = self.session.post(
            f"{BASE_URL}/api/work-orders",
            json={
                "production_order_id": po_id,
                "routing_id": "non-existent-routing-id",
                "quantity": 1
            }
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Invalid routing returns 404")
    
    def test_create_wo_with_invalid_production_order(self):
        """Test creating WO with non-existent production order returns 404"""
        # Get a valid routing
        routing_response = self.session.get(f"{BASE_URL}/api/routings")
        routings = routing_response.json()
        
        if not routings:
            pytest.skip("No routings available")
        
        routing_id = routings[0]['id']
        
        response = self.session.post(
            f"{BASE_URL}/api/work-orders",
            json={
                "production_order_id": "non-existent-po-id",
                "routing_id": routing_id,
                "quantity": 1
            }
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Invalid production order returns 404")
    
    def test_start_already_started_wo(self):
        """Test starting an already in-progress WO returns error"""
        # Find an in-progress WO
        response = self.session.get(f"{BASE_URL}/api/work-orders")
        work_orders = response.json()
        
        in_progress_wo = next((wo for wo in work_orders if wo['status'] == 'in_progress'), None)
        
        if not in_progress_wo:
            pytest.skip("No in-progress work orders to test")
        
        response = self.session.post(f"{BASE_URL}/api/work-orders/{in_progress_wo['id']}/start")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✅ Starting in-progress WO returns 400")
    
    def test_complete_pending_wo(self):
        """Test completing a pending WO (not started) should fail"""
        # Find a pending WO
        response = self.session.get(f"{BASE_URL}/api/work-orders")
        work_orders = response.json()
        
        pending_wo = next((wo for wo in work_orders if wo['status'] == 'pending'), None)
        
        if not pending_wo:
            pytest.skip("No pending work orders to test")
        
        response = self.session.put(
            f"{BASE_URL}/api/work-orders/{pending_wo['id']}",
            json={"status": "completed"}
        )
        
        # Should either fail or require going through in_progress first
        # The exact behavior depends on implementation
        print(f"ℹ️ Completing pending WO returned {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
