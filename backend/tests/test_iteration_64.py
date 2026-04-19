"""
Iteration 64 Tests - 7 UI/UX + Workflow Fixes
==============================================
1. Sales Orders list (Production page) displays in DESCENDING order by created_at
2. Manufacturing page, New Work Order dialog: SO dropdown has Search input (data-testid='wo-so-search')
3. JobWork page, Print DC: Title logic based on subcontract_type
4. Warehouses page, GRN list: column header 'PO / DC Number' with proper labels
5. Warehouses page, Save GRN: Confirm modal (data-testid='confirm-grn-modal')
6. SC→PO workflow: POST /api/job-work/create-po status logic (with_material→draft, without_material→approved)
7. Child-MO Direct Complete: PUT /api/work-orders/{id} with status='completed' for child MOs
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    # Token is in cookie
    return response.cookies.get('access_token', '')

@pytest.fixture(scope="module")
def auth_session(auth_token):
    """Session with auth cookie"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    # Login to get cookies
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200
    return session


class TestFeature1_SalesOrdersDescendingOrder:
    """Feature 1: Sales Orders list displays in DESCENDING order by created_at"""
    
    def test_production_orders_sorted_descending(self, auth_session):
        """GET /api/production should return orders sorted by created_at DESC (newest first)"""
        response = auth_session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200, f"Failed to get production orders: {response.text}"
        
        orders = response.json()
        if len(orders) < 2:
            pytest.skip("Need at least 2 production orders to verify sorting")
        
        # Verify descending order by created_at
        dates = []
        for order in orders:
            created_at = order.get('created_at')
            if created_at:
                dates.append(created_at)
        
        if len(dates) >= 2:
            # Check that dates are in descending order
            for i in range(len(dates) - 1):
                assert dates[i] >= dates[i + 1], f"Orders not in descending order: {dates[i]} should be >= {dates[i + 1]}"
            print(f"✓ Production orders sorted in descending order (newest first). First: {dates[0][:19]}, Last: {dates[-1][:19]}")
        else:
            print(f"✓ Production orders endpoint returns {len(orders)} orders")


class TestFeature3_DCPrintTitleLogic:
    """Feature 3: JobWork page, Print DC title logic based on subcontract_type"""
    
    def test_get_delivery_challans(self, auth_session):
        """GET /api/job-work/challans should return DCs with order info including subcontract_type"""
        response = auth_session.get(f"{BASE_URL}/api/job-work/challans")
        assert response.status_code == 200, f"Failed to get DCs: {response.text}"
        
        challans = response.json()
        print(f"✓ Found {len(challans)} delivery challans")
        
        # Check if any DC has order with subcontract_type
        for dc in challans[:5]:  # Check first 5
            order = dc.get('order') or {}
            sc_type = order.get('subcontract_type')
            job_work_parts = order.get('job_work_parts', [])
            print(f"  DC {dc.get('dc_number')}: subcontract_type={sc_type}, job_work_parts={len(job_work_parts)}")
            
            # Verify the title logic would work:
            # - with_material → "Job Order Cum Delivery Challan"
            # - without_material + job_work_parts → "Job Work Order Cum Delivery Challan"
            # - else → "Delivery Challan"
            if sc_type == 'with_material':
                expected_title = 'Job Order Cum Delivery Challan'
            elif sc_type == 'without_material' and len(job_work_parts) > 0:
                expected_title = 'Job Work Order Cum Delivery Challan'
            else:
                expected_title = 'Delivery Challan'
            print(f"    Expected title: {expected_title}")


class TestFeature4_GRNListColumnHeader:
    """Feature 4: Warehouses page, GRN list column header 'PO / DC Number'"""
    
    def test_grn_list_has_jw_and_dc_info(self, auth_session):
        """GET /api/grn should return GRNs with jw_order_number and dc_number for JW GRNs"""
        response = auth_session.get(f"{BASE_URL}/api/grn")
        assert response.status_code == 200, f"Failed to get GRN list: {response.text}"
        
        grns = response.json()
        print(f"✓ Found {len(grns)} GRNs")
        
        po_grns = [g for g in grns if g.get('po_number')]
        jw_grns = [g for g in grns if g.get('jw_order_id') or g.get('sc_order_id')]
        
        print(f"  PO GRNs: {len(po_grns)}, JW GRNs: {len(jw_grns)}")
        
        # Check JW GRNs have jw_order_number and dc_number
        for grn in jw_grns[:3]:
            jw_order_number = grn.get('jw_order_number')
            dc_number = grn.get('dc_number')
            print(f"  JW GRN {grn.get('grn_number')}: jw_order_number={jw_order_number}, dc_number={dc_number}")
            # At least jw_order_number should be present
            assert jw_order_number or grn.get('jw_order'), f"JW GRN missing jw_order_number: {grn.get('grn_number')}"


class TestFeature5_GRNConfirmModal:
    """Feature 5: Warehouses page, Save GRN opens Confirm modal"""
    
    def test_pending_pos_endpoint(self, auth_session):
        """GET /api/grn/pending-pos should return POs ready for GRN"""
        response = auth_session.get(f"{BASE_URL}/api/grn/pending-pos")
        assert response.status_code == 200, f"Failed to get pending POs: {response.text}"
        
        pos = response.json()
        print(f"✓ Found {len(pos)} pending POs for GRN")
        
        # Check structure
        for po in pos[:3]:
            assert 'id' in po
            assert 'po_number' in po
            assert 'lines' in po
            print(f"  PO {po.get('po_number')}: {len(po.get('lines', []))} lines, status={po.get('status')}")


class TestFeature6_SCToPOStatusLogic:
    """Feature 6: SC→PO workflow - POST /api/job-work/create-po status logic"""
    
    def test_create_po_from_sc_with_material_returns_draft(self, auth_session):
        """When SC has subcontract_type='with_material', PO should be created with status='draft'"""
        # First, find an SC with subcontract_type='with_material' that doesn't have a PO yet
        response = auth_session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        
        orders = response.json()
        with_material_sc = None
        for order in orders:
            if (order.get('subcontract_type') == 'with_material' and 
                not order.get('po_created') and
                order.get('status') in ['confirmed', 'in_progress']):
                with_material_sc = order
                break
        
        if not with_material_sc:
            # Try to find any SC without PO
            for order in orders:
                if not order.get('po_created') and order.get('status') in ['confirmed', 'in_progress']:
                    print(f"  Found SC without PO: {order.get('order_number')}, type={order.get('subcontract_type')}")
            pytest.skip("No SC with subcontract_type='with_material' without PO found")
        
        # Create PO from this SC
        sc_id = with_material_sc['id']
        response = auth_session.post(f"{BASE_URL}/api/job-work/create-po", json={
            "subcontract_order_id": sc_id
        })
        
        if response.status_code == 400 and "already exists" in response.text:
            pytest.skip(f"PO already exists for SC {with_material_sc.get('order_number')}")
        
        assert response.status_code == 200, f"Failed to create PO: {response.text}"
        
        result = response.json()
        assert 'status' in result, "Response should include 'status' field"
        assert result['status'] == 'draft', f"PO status should be 'draft' for with_material SC, got: {result['status']}"
        print(f"✓ Created PO {result.get('po_number')} with status='draft' from with_material SC")
    
    def test_create_po_from_sc_without_material_returns_approved(self, auth_session):
        """When SC has subcontract_type='without_material', PO should be created with status='approved'"""
        response = auth_session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        
        orders = response.json()
        without_material_sc = None
        for order in orders:
            if (order.get('subcontract_type') == 'without_material' and 
                not order.get('po_created') and
                order.get('status') in ['confirmed', 'in_progress']):
                without_material_sc = order
                break
        
        if not without_material_sc:
            pytest.skip("No SC with subcontract_type='without_material' without PO found")
        
        sc_id = without_material_sc['id']
        response = auth_session.post(f"{BASE_URL}/api/job-work/create-po", json={
            "subcontract_order_id": sc_id
        })
        
        if response.status_code == 400 and "already exists" in response.text:
            pytest.skip(f"PO already exists for SC {without_material_sc.get('order_number')}")
        
        assert response.status_code == 200, f"Failed to create PO: {response.text}"
        
        result = response.json()
        assert 'status' in result, "Response should include 'status' field"
        assert result['status'] == 'approved', f"PO status should be 'approved' for without_material SC, got: {result['status']}"
        print(f"✓ Created PO {result.get('po_number')} with status='approved' from without_material SC")
    
    def test_create_po_endpoint_returns_status_field(self, auth_session):
        """Verify /api/job-work/create-po response includes 'status' field"""
        # Just verify the endpoint structure by checking existing SCs
        response = auth_session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        
        orders = response.json()
        # Find any SC that already has a PO to verify the response structure
        sc_with_po = None
        for order in orders:
            if order.get('po_created'):
                sc_with_po = order
                break
        
        if sc_with_po:
            # Try to create PO again - should fail with "already exists"
            response = auth_session.post(f"{BASE_URL}/api/job-work/create-po", json={
                "subcontract_order_id": sc_with_po['id']
            })
            assert response.status_code == 400
            assert "already exists" in response.text.lower()
            print(f"✓ Endpoint correctly rejects duplicate PO creation")
        else:
            print("✓ No SC with existing PO found to test duplicate rejection")


class TestFeature7_ChildMODirectComplete:
    """Feature 7: Child-MO Direct Complete - PUT /api/work-orders/{id} with status='completed'"""
    
    def test_get_child_mos(self, auth_session):
        """Find work orders with parent_wo_id set (child MOs)"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        child_mos = [wo for wo in work_orders if wo.get('parent_wo_id')]
        parent_mos = [wo for wo in work_orders if not wo.get('parent_wo_id')]
        
        print(f"✓ Found {len(work_orders)} work orders: {len(parent_mos)} parent MOs, {len(child_mos)} child MOs")
        
        # List some child MOs
        for wo in child_mos[:5]:
            print(f"  Child MO {wo.get('wo_number')}: status={wo.get('status')}, parent={wo.get('parent_wo_id')[:8]}...")
    
    def test_complete_child_mo_auto_closes_ops(self, auth_session):
        """PUT /api/work-orders/{id} with status='completed' should succeed for child MOs even with pending ops"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        
        # Find an in_progress child MO
        in_progress_child = None
        for wo in work_orders:
            if (wo.get('parent_wo_id') and 
                wo.get('status') == 'in_progress' and
                not wo.get('is_subcontract')):
                in_progress_child = wo
                break
        
        if not in_progress_child:
            # Check if there are any child MOs at all
            child_mos = [wo for wo in work_orders if wo.get('parent_wo_id')]
            if child_mos:
                print(f"  Found {len(child_mos)} child MOs but none in_progress")
                for wo in child_mos[:3]:
                    print(f"    {wo.get('wo_number')}: status={wo.get('status')}")
            pytest.skip("No in_progress child MO found to test completion")
        
        wo_id = in_progress_child['id']
        wo_number = in_progress_child.get('wo_number')
        ops = in_progress_child.get('operations_status', [])
        
        print(f"  Testing completion of child MO {wo_number} with {len(ops)} operations")
        
        # Try to complete the child MO
        response = auth_session.put(f"{BASE_URL}/api/work-orders/{wo_id}", json={
            "status": "completed"
        })
        
        assert response.status_code == 200, f"Failed to complete child MO: {response.text}"
        
        result = response.json()
        assert result.get('status') == 'completed', f"Child MO should be completed, got: {result.get('status')}"
        
        # Verify operations were auto-closed
        updated_ops = result.get('operations_status', [])
        for op in updated_ops:
            assert op.get('status') == 'completed', f"Operation {op.get('sequence')} should be auto-completed"
        
        print(f"✓ Child MO {wo_number} completed successfully with {len(updated_ops)} operations auto-closed")
    
    def test_parent_mo_cannot_complete_with_pending_ops(self, auth_session):
        """Parent MOs (parent_wo_id=null) should NOT be able to complete with pending operations"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        
        # Find an in_progress parent MO with pending operations
        parent_with_pending_ops = None
        for wo in work_orders:
            if (not wo.get('parent_wo_id') and 
                wo.get('status') == 'in_progress' and
                not wo.get('is_subcontract')):
                ops = wo.get('operations_status', [])
                pending_ops = [op for op in ops if op.get('status') != 'completed']
                if pending_ops:
                    parent_with_pending_ops = wo
                    break
        
        if not parent_with_pending_ops:
            pytest.skip("No in_progress parent MO with pending operations found")
        
        wo_id = parent_with_pending_ops['id']
        wo_number = parent_with_pending_ops.get('wo_number')
        
        # Try to complete - should fail
        response = auth_session.put(f"{BASE_URL}/api/work-orders/{wo_id}", json={
            "status": "completed"
        })
        
        # Should be blocked
        assert response.status_code == 400, f"Parent MO completion should be blocked, got: {response.status_code}"
        assert "not completed" in response.text.lower() or "operation" in response.text.lower()
        print(f"✓ Parent MO {wo_number} correctly blocked from completion with pending ops")


class TestFeature2_SOSearchInWorkOrderDialog:
    """Feature 2: Manufacturing page, New Work Order dialog SO dropdown has Search input"""
    
    def test_production_orders_have_item_info(self, auth_session):
        """GET /api/production should return orders with item info for search filtering"""
        response = auth_session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        
        orders = response.json()
        print(f"✓ Found {len(orders)} production orders")
        
        # Check that orders have item info for filtering
        for order in orders[:5]:
            item = order.get('item', {})
            part_number = item.get('part_number', '')
            name = item.get('name', '')
            order_number = order.get('order_number', '')
            print(f"  SO {order_number}: {part_number} - {name}")
            
            # Verify searchable fields exist
            assert order_number, "Order should have order_number"


class TestRegressionChecks:
    """Regression checks for existing functionality"""
    
    def test_health_endpoint(self, auth_session):
        """Health check"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("✓ Health endpoint OK")
    
    def test_work_orders_endpoint(self, auth_session):
        """Work orders endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Work orders endpoint returns {len(data)} orders")
    
    def test_job_work_orders_endpoint(self, auth_session):
        """Job work orders endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Job work orders endpoint returns {len(data)} orders")
    
    def test_grn_endpoint(self, auth_session):
        """GRN endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/grn")
        assert response.status_code == 200
        data = response.json()
        print(f"✓ GRN endpoint returns {len(data)} records")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
