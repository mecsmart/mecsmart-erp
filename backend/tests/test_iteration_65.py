"""
Iteration 65 Tests - Re-testing 3 disputed features from iter 64 + 1 new performance issue
==========================================================================================
A: SC (No RM) PO should be auto-approved — verify POST /api/job-work/create-po for without_material returns status='approved'
B: MO creation SO dropdown search should behave like combobox (inline results) — UI test
C: SG/Child MO Complete button not showing — child MO can be started inhouse (no routing error)
D: Job Work & GRN screens load slowly — performance tests
"""

import pytest
import requests
import os
import time
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Session with auth cookie"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return session


class TestFeatureA_SCWithoutMaterialPOApproved:
    """Feature A: SC (No RM) PO should be auto-approved"""
    
    def test_existing_without_material_sc_po_status(self, auth_session):
        """Verify existing POs created from without_material SCs have status='approved'"""
        # Get all SC orders
        response = auth_session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        orders = response.json()
        
        # Find without_material SCs that have POs
        without_material_with_po = [o for o in orders if o.get('subcontract_type') == 'without_material' and o.get('po_created')]
        print(f"Found {len(without_material_with_po)} without_material SCs with POs")
        
        if not without_material_with_po:
            pytest.skip("No without_material SCs with POs found")
        
        # Get all POs and check their status
        po_response = auth_session.get(f"{BASE_URL}/api/purchase-orders")
        assert po_response.status_code == 200
        all_pos = po_response.json()
        
        # Build map of PO by sc_order_id
        po_by_sc = {}
        for po in all_pos:
            sc_id = po.get('sc_order_id')
            if sc_id:
                po_by_sc[sc_id] = po
        
        # Check each without_material SC's PO status
        approved_count = 0
        for sc in without_material_with_po[:5]:  # Check first 5
            sc_id = sc['id']
            po = po_by_sc.get(sc_id)
            if po:
                status = po.get('status')
                print(f"  SC {sc.get('order_number')} (without_material) → PO {po.get('po_number')}: status={status}")
                if status == 'approved':
                    approved_count += 1
                assert status == 'approved', f"PO {po.get('po_number')} should be 'approved' for without_material SC, got: {status}"
        
        print(f"✓ {approved_count} without_material SC POs verified as 'approved'")
    
    def test_create_po_from_without_material_sc_returns_approved(self, auth_session):
        """POST /api/job-work/create-po for without_material SC should return status='approved'"""
        response = auth_session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        orders = response.json()
        
        # Find a without_material SC without PO
        without_material_no_po = None
        for order in orders:
            if (order.get('subcontract_type') == 'without_material' and 
                not order.get('po_created') and
                order.get('status') in ['confirmed', 'in_progress']):
                without_material_no_po = order
                break
        
        if not without_material_no_po:
            # List available SCs for debugging
            available = [o for o in orders if not o.get('po_created') and o.get('status') in ['confirmed', 'in_progress']]
            print(f"  Available SCs without PO: {len(available)}")
            for o in available[:3]:
                print(f"    {o.get('order_number')}: type={o.get('subcontract_type')}, status={o.get('status')}")
            pytest.skip("No without_material SC without PO found to test")
        
        sc_id = without_material_no_po['id']
        sc_number = without_material_no_po.get('order_number')
        print(f"  Creating PO from SC {sc_number} (without_material)")
        
        response = auth_session.post(f"{BASE_URL}/api/job-work/create-po", json={
            "subcontract_order_id": sc_id
        })
        
        if response.status_code == 400 and "already exists" in response.text.lower():
            pytest.skip(f"PO already exists for SC {sc_number}")
        
        assert response.status_code == 200, f"Failed to create PO: {response.text}"
        
        result = response.json()
        assert 'status' in result, "Response should include 'status' field"
        assert result['status'] == 'approved', f"PO status should be 'approved' for without_material SC, got: {result['status']}"
        print(f"✓ Created PO {result.get('po_number')} with status='approved' from without_material SC {sc_number}")


class TestFeatureC_ChildMOInhouseStart:
    """Feature C: Child MO Inhouse Start - no 'Routing not found' error"""
    
    def test_find_pending_inhouse_child_mos(self, auth_session):
        """Find child MOs that are pending and inhouse (not subcontracted)"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find pending inhouse child MOs
        pending_inhouse_children = [
            wo for wo in work_orders 
            if wo.get('parent_wo_id') and 
               wo.get('status') == 'pending' and 
               not wo.get('is_subcontract')
        ]
        
        print(f"Found {len(pending_inhouse_children)} pending inhouse child MOs")
        for wo in pending_inhouse_children[:5]:
            print(f"  {wo.get('wo_number')}: status={wo.get('status')}, routing_id={wo.get('routing_id')}, is_subcontract={wo.get('is_subcontract')}")
        
        return pending_inhouse_children
    
    def test_start_inhouse_child_mo_without_routing(self, auth_session):
        """POST /api/work-orders/{id}/start on child MO without routing should succeed"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find a pending inhouse child MO (preferably without routing)
        target_child = None
        for wo in work_orders:
            if (wo.get('parent_wo_id') and 
                wo.get('status') == 'pending' and 
                not wo.get('is_subcontract')):
                target_child = wo
                break
        
        if not target_child:
            # Check for in_progress ones
            in_progress_children = [wo for wo in work_orders if wo.get('parent_wo_id') and wo.get('status') == 'in_progress' and not wo.get('is_subcontract')]
            if in_progress_children:
                print(f"  Found {len(in_progress_children)} in_progress inhouse child MOs (already started)")
                pytest.skip("No pending inhouse child MO found - some are already in_progress")
            pytest.skip("No pending inhouse child MO found")
        
        wo_id = target_child['id']
        wo_number = target_child.get('wo_number')
        routing_id = target_child.get('routing_id')
        
        print(f"  Starting child MO {wo_number} (routing_id={routing_id})")
        
        response = auth_session.post(f"{BASE_URL}/api/work-orders/{wo_id}/start")
        
        # Should NOT return "Routing not found" error
        if response.status_code == 404 and "routing not found" in response.text.lower():
            pytest.fail(f"Child MO start failed with 'Routing not found' - this should be fixed!")
        
        # Accept 200 (success) or 400 with other errors (like insufficient stock)
        if response.status_code == 400:
            error_msg = response.text.lower()
            if "routing not found" in error_msg:
                pytest.fail(f"Child MO start failed with 'Routing not found' - this should be fixed!")
            print(f"  Start blocked (expected): {response.text[:100]}")
        else:
            assert response.status_code == 200, f"Unexpected error: {response.text}"
            print(f"✓ Child MO {wo_number} started successfully (no routing error)")
    
    def test_complete_inhouse_child_mo(self, auth_session):
        """PUT /api/work-orders/{id} with status='completed' for in_progress child MO"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find an in_progress inhouse child MO
        in_progress_child = None
        for wo in work_orders:
            if (wo.get('parent_wo_id') and 
                wo.get('status') == 'in_progress' and 
                not wo.get('is_subcontract')):
                in_progress_child = wo
                break
        
        if not in_progress_child:
            # List child MOs for debugging
            child_mos = [wo for wo in work_orders if wo.get('parent_wo_id')]
            print(f"  Found {len(child_mos)} child MOs total")
            for wo in child_mos[:5]:
                print(f"    {wo.get('wo_number')}: status={wo.get('status')}, is_subcontract={wo.get('is_subcontract')}")
            pytest.skip("No in_progress inhouse child MO found")
        
        wo_id = in_progress_child['id']
        wo_number = in_progress_child.get('wo_number')
        
        print(f"  Completing child MO {wo_number}")
        
        response = auth_session.put(f"{BASE_URL}/api/work-orders/{wo_id}", json={
            "status": "completed"
        })
        
        assert response.status_code == 200, f"Failed to complete child MO: {response.text}"
        
        result = response.json()
        assert result.get('status') == 'completed', f"Child MO should be completed, got: {result.get('status')}"
        print(f"✓ Child MO {wo_number} completed successfully")


class TestFeatureD_Performance:
    """Feature D: Performance tests for Job Work & GRN screens"""
    
    def test_job_work_orders_performance(self, auth_session):
        """GET /api/job-work/orders should return in under 400ms"""
        # Warm up
        auth_session.get(f"{BASE_URL}/api/job-work/orders")
        
        # Measure 3 times and take average
        times = []
        for i in range(3):
            start = time.time()
            response = auth_session.get(f"{BASE_URL}/api/job-work/orders")
            elapsed = (time.time() - start) * 1000  # ms
            times.append(elapsed)
            assert response.status_code == 200
        
        avg_time = sum(times) / len(times)
        data = response.json()
        print(f"  GET /api/job-work/orders: {len(data)} orders, avg {avg_time:.0f}ms (times: {[f'{t:.0f}' for t in times]})")
        
        # Target: under 400ms
        assert avg_time < 400, f"Job work orders too slow: {avg_time:.0f}ms (target: <400ms)"
        print(f"✓ Job work orders performance OK: {avg_time:.0f}ms < 400ms")
    
    def test_delivery_challans_performance(self, auth_session):
        """GET /api/job-work/challans should return in under 250ms"""
        # Warm up
        auth_session.get(f"{BASE_URL}/api/job-work/challans")
        
        times = []
        for i in range(3):
            start = time.time()
            response = auth_session.get(f"{BASE_URL}/api/job-work/challans")
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)
            assert response.status_code == 200
        
        avg_time = sum(times) / len(times)
        data = response.json()
        print(f"  GET /api/job-work/challans: {len(data)} challans, avg {avg_time:.0f}ms")
        
        assert avg_time < 250, f"Delivery challans too slow: {avg_time:.0f}ms (target: <250ms)"
        print(f"✓ Delivery challans performance OK: {avg_time:.0f}ms < 250ms")
    
    def test_pending_grn_pos_performance(self, auth_session):
        """GET /api/grn/pending-pos should return in under 200ms"""
        # Warm up
        auth_session.get(f"{BASE_URL}/api/grn/pending-pos")
        
        times = []
        for i in range(3):
            start = time.time()
            response = auth_session.get(f"{BASE_URL}/api/grn/pending-pos")
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)
            assert response.status_code == 200
        
        avg_time = sum(times) / len(times)
        data = response.json()
        print(f"  GET /api/grn/pending-pos: {len(data)} POs, avg {avg_time:.0f}ms")
        
        assert avg_time < 200, f"Pending GRN POs too slow: {avg_time:.0f}ms (target: <200ms)"
        print(f"✓ Pending GRN POs performance OK: {avg_time:.0f}ms < 200ms")


class TestRegressionChecks:
    """Regression checks"""
    
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
        print(f"✓ Work orders: {len(data)} orders")
    
    def test_production_orders_endpoint(self, auth_session):
        """Production orders endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Production orders: {len(data)} orders")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
