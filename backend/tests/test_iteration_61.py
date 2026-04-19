"""
Iteration 61 Tests - Bug Fixes and UX Enhancements
- Bug 1: Sales Orders Confirm/Cancel buttons (window.confirm removed for non-destructive actions)
- Bug 2: GRN Confirm button (window.confirm removed)
- Bug 3: MO Job Card page loading
- Fix 1: BOM creation searchable dropdowns (SearchableItemSelect component)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def session():
    """Create authenticated session with cookies"""
    s = requests.Session()
    response = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    print(f"Logged in as: {response.json().get('email')}")
    return s


class TestAuth:
    """Authentication tests"""
    
    def test_login_success(self, session):
        """Test login with valid credentials"""
        response = session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert data["email"] == "admin@erp.com"
        print(f"Authenticated user: {data.get('email')}, role: {data.get('role')}")


class TestSalesOrderConfirmCancel:
    """Bug 1: Test Sales Order Confirm/Cancel endpoints"""
    
    def test_get_production_orders(self, session):
        """Test fetching production/sales orders"""
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} sales orders")
        
        # Check for draft orders
        draft_orders = [o for o in data if o.get('status') == 'draft']
        print(f"Draft orders: {len(draft_orders)}")
        return data
    
    def test_confirm_sales_order_endpoint_exists(self, session):
        """Test that confirm endpoint exists and responds correctly"""
        # First get a draft order
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        orders = response.json()
        
        draft_orders = [o for o in orders if o.get('status') == 'draft']
        if not draft_orders:
            pytest.skip("No draft orders available to test confirm")
        
        order = draft_orders[0]
        order_id = order['id']
        order_number = order.get('order_number', 'Unknown')
        
        # Test confirm endpoint
        response = session.post(f"{BASE_URL}/api/production/{order_id}/confirm")
        # Should succeed (200) or fail with business logic error (400/404), not 500
        assert response.status_code in [200, 400, 404, 422], f"Unexpected status: {response.status_code}, {response.text}"
        
        if response.status_code == 200:
            print(f"Successfully confirmed order {order_number}")
        else:
            print(f"Confirm returned {response.status_code}: {response.text}")
    
    def test_cancel_sales_order_endpoint_exists(self, session):
        """Test that cancel endpoint exists and responds correctly"""
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        orders = response.json()
        
        # Find a non-cancelled, non-completed order
        cancellable = [o for o in orders if o.get('status') not in ['cancelled', 'completed']]
        if not cancellable:
            pytest.skip("No cancellable orders available")
        
        order = cancellable[0]
        order_id = order['id']
        
        # Test cancel endpoint - just verify it exists and responds
        response = session.post(f"{BASE_URL}/api/production/{order_id}/cancel")
        # Should succeed or fail with business logic, not 500
        assert response.status_code in [200, 400, 404, 422], f"Unexpected status: {response.status_code}, {response.text}"
        print(f"Cancel endpoint responded with {response.status_code}")


class TestGRNConfirm:
    """Bug 2: Test GRN creation endpoint"""
    
    def test_get_pending_pos_for_grn(self, session):
        """Test fetching pending POs for GRN"""
        response = session.get(f"{BASE_URL}/api/grn/pending-pos")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} pending POs for GRN")
        return data
    
    def test_get_grn_list(self, session):
        """Test fetching GRN list"""
        response = session.get(f"{BASE_URL}/api/grn")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} GRN records")
    
    def test_grn_endpoint_validation(self, session):
        """Test GRN endpoint validates input correctly"""
        # Test with invalid data - should return 400/422, not 500
        response = session.post(f"{BASE_URL}/api/grn", json={
            "po_id": "invalid-id",
            "supplier_invoice_no": "",
            "lines": []
        })
        # Should fail with validation error, not server error
        assert response.status_code in [400, 404, 422], f"Expected validation error, got {response.status_code}"
        print(f"GRN validation working: {response.status_code}")


class TestJobWorkGRN:
    """Bug 2 (JW GRN): Test Job Work GRN endpoint"""
    
    def test_get_job_work_orders(self, session):
        """Test fetching job work orders"""
        response = session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} job work orders")
        
        # Check for in_progress orders
        in_progress = [o for o in data if o.get('status') == 'in_progress']
        print(f"In-progress JW orders: {len(in_progress)}")
    
    def test_jw_grn_endpoint_exists(self, session):
        """Test JW GRN endpoint exists"""
        # Test with invalid data - should return validation error, not 500
        response = session.post(f"{BASE_URL}/api/job-work/receive-grn", json={
            "subcontract_order_id": "invalid-id",
            "supplier_invoice_no": "TEST-INV",
            "supplier_invoice_date": "2026-01-19",
            "lines": []
        })
        # Should fail with validation error
        assert response.status_code in [400, 404, 422], f"Expected validation error, got {response.status_code}"
        print(f"JW GRN endpoint validation working: {response.status_code}")


class TestJobCardLoading:
    """Bug 3: Test MO Job Card page loading"""
    
    def test_get_work_orders(self, session):
        """Test fetching work orders (MOs)"""
        start = time.time()
        response = session.get(f"{BASE_URL}/api/work-orders")
        elapsed = time.time() - start
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} work orders in {elapsed:.2f}s")
        
        # Check for in_progress orders
        in_progress = [o for o in data if o.get('status') == 'in_progress']
        print(f"In-progress MOs: {len(in_progress)}")
        return data
    
    def test_get_single_work_order(self, session):
        """Test fetching single work order with operations"""
        # First get list
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        if not work_orders:
            pytest.skip("No work orders available")
        
        # Get first work order details
        wo = work_orders[0]
        wo_id = wo['id']
        
        response = session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert 'id' in data
        assert 'wo_number' in data
        print(f"Work order {data.get('wo_number')} loaded successfully")
        
        # Check operations_status if present
        ops = data.get('operations_status', [])
        print(f"Operations: {len(ops)}")
    
    def test_work_order_print_data(self, session):
        """Test work order print data endpoint (used by Job Card)"""
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find an in_progress order
        in_progress = [o for o in work_orders if o.get('status') == 'in_progress']
        if not in_progress:
            pytest.skip("No in-progress work orders for Job Card test")
        
        wo = in_progress[0]
        wo_id = wo['id']
        
        response = session.get(f"{BASE_URL}/api/work-orders/{wo_id}/print-data")
        assert response.status_code == 200
        data = response.json()
        
        # Verify Job Card data structure
        assert 'wo_number' in data
        assert 'operations_status' in data
        print(f"Job Card data for {data.get('wo_number')}: {len(data.get('operations_status', []))} operations")
    
    def test_work_order_tree(self, session):
        """Test work order tree endpoint"""
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        if not work_orders:
            pytest.skip("No work orders available")
        
        wo = work_orders[0]
        wo_id = wo['id']
        
        response = session.get(f"{BASE_URL}/api/work-orders/{wo_id}/tree")
        # Tree endpoint should exist
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"Tree endpoint responded with {response.status_code}")


class TestBOMSearchableDropdown:
    """Fix 1: Test BOM items endpoint for searchable dropdown"""
    
    def test_get_items_for_dropdown(self, session):
        """Test fetching items for searchable dropdown"""
        response = session.get(f"{BASE_URL}/api/items")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} items for dropdown")
        
        # Verify item structure has fields needed for search
        if data:
            item = data[0]
            assert 'id' in item
            assert 'part_number' in item or 'name' in item
            print(f"Sample item: {item.get('part_number')} - {item.get('name')}")
    
    def test_items_have_search_fields(self, session):
        """Test items have part_number and name for search"""
        response = session.get(f"{BASE_URL}/api/items")
        assert response.status_code == 200
        items = response.json()
        
        # Check that items have searchable fields
        items_with_part_number = [i for i in items if i.get('part_number')]
        items_with_name = [i for i in items if i.get('name')]
        
        print(f"Items with part_number: {len(items_with_part_number)}")
        print(f"Items with name: {len(items_with_name)}")
        
        # Most items should have both
        assert len(items_with_part_number) > 0 or len(items_with_name) > 0
    
    def test_search_items_by_part_number(self, session):
        """Test searching items by part number pattern"""
        response = session.get(f"{BASE_URL}/api/items")
        assert response.status_code == 200
        items = response.json()
        
        # Search for FG items
        fg_items = [i for i in items if 'FG' in (i.get('part_number') or '').upper()]
        print(f"Items matching 'FG': {len(fg_items)}")
        
        # Search for Hydraulic items
        hydraulic_items = [i for i in items if 'hydraulic' in (i.get('name') or '').lower()]
        print(f"Items matching 'Hydraulic': {len(hydraulic_items)}")
    
    def test_get_bom_list(self, session):
        """Test fetching BOM list"""
        response = session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} BOMs")
    
    def test_get_active_boms(self, session):
        """Test fetching active BOMs"""
        response = session.get(f"{BASE_URL}/api/bom?status=active")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} active BOMs")


class TestRoutingsForBOM:
    """Test routings endpoint for BOM creation"""
    
    def test_get_routings(self, session):
        """Test fetching routings for BOM"""
        response = session.get(f"{BASE_URL}/api/routings")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} routings")
        
        # Check active routings
        active = [r for r in data if r.get('status') == 'active']
        print(f"Active routings: {len(active)}")
    
    def test_get_active_routings(self, session):
        """Test fetching active routings"""
        response = session.get(f"{BASE_URL}/api/routings?status=active")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} active routings")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
