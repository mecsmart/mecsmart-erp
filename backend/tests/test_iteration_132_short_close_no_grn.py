"""
Iteration 132 Tests: Short Close No GRN + UI Code Review

Tests:
1. POST /api/work-orders/{wo_id}/operations/{seq}/short-close-no-grn with admin auth
   - Returns 200, op.status='completed', op.short_closed=true, op.short_close_reason='Test'
   - op.quantity_completed/accepted set to the op qty
   - Matching SC line gets short_closed=true
   - If it was the last open line, SC.status='short_closed'
2. POST short-close-no-grn without admin auth returns 403
3. POST short-close-no-grn on an op that's NOT in_progress or not is_job_work returns 400
4. REGRESSION: existing short-close endpoint (/short-close) still returns 200 and reverts an op to pending
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def admin_session():
    """Login as admin and return session with cookies"""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return session


@pytest.fixture(scope="module")
def non_admin_session(admin_session):
    """Create a non-admin user and return session"""
    # Create a non-admin user
    unique_id = str(uuid.uuid4())[:8]
    email = f"test_nonadmin_{unique_id}@test.com"
    
    # First get a role group that's not admin
    groups_resp = admin_session.get(f"{BASE_URL}/api/role-groups")
    if groups_resp.status_code == 200:
        groups = groups_resp.json()
        non_admin_group = next((g for g in groups if not g.get('is_admin_group')), None)
        if non_admin_group:
            role_group_id = non_admin_group['id']
        else:
            # Create a non-admin role group
            create_group_resp = admin_session.post(f"{BASE_URL}/api/role-groups", json={
                "name": f"Test Non-Admin Group {unique_id}",
                "is_admin_group": False,
                "permissions": {"manufacturing": ["view"]}
            })
            if create_group_resp.status_code == 201:
                role_group_id = create_group_resp.json()['id']
            else:
                pytest.skip("Could not create non-admin role group")
    else:
        pytest.skip("Could not fetch role groups")
    
    # Create user
    user_resp = admin_session.post(f"{BASE_URL}/api/users", json={
        "email": email,
        "password": "Test@123",
        "name": "Test Non-Admin",
        "role": "user",
        "role_group_id": role_group_id
    })
    if user_resp.status_code not in [200, 201]:
        pytest.skip(f"Could not create non-admin user: {user_resp.text}")
    
    # Login as non-admin
    session = requests.Session()
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": email,
        "password": "Test@123"
    })
    assert login_resp.status_code == 200, f"Non-admin login failed: {login_resp.text}"
    return session


@pytest.fixture(scope="module")
def test_data(admin_session):
    """Create test data: item, BOM, supplier, work order with OS operation"""
    unique_id = str(uuid.uuid4())[:8]
    
    # Create a test item
    item_resp = admin_session.post(f"{BASE_URL}/api/items", json={
        "part_number": f"TEST-SCNG-{unique_id}",
        "name": f"Test Short Close No GRN Item {unique_id}",
        "category": "finished_good",
        "unit_of_measure": "pcs",
        "unit_cost": 100
    })
    assert item_resp.status_code == 201, f"Item creation failed: {item_resp.text}"
    item = item_resp.json()
    
    # Create a BOM with a routing operation
    bom_resp = admin_session.post(f"{BASE_URL}/api/bom", json={
        "parent_item_id": item['id'],
        "name": f"BOM for {item['part_number']}",
        "revision": "A",
        "status": "active",
        "components": [],
        "parent_routings": [{"name": "Outsource Process", "cost": 50}]
    })
    assert bom_resp.status_code in [200, 201], f"BOM creation failed: {bom_resp.text}"
    bom = bom_resp.json()
    
    # Create a supplier
    supplier_resp = admin_session.post(f"{BASE_URL}/api/suppliers", json={
        "name": f"Test Supplier {unique_id}",
        "code": f"SUP-{unique_id}",
        "status": "active",
        "state_code": "27",  # Maharashtra
        "pin_code": "411001"
    })
    assert supplier_resp.status_code == 201, f"Supplier creation failed: {supplier_resp.text}"
    supplier = supplier_resp.json()
    
    return {
        "item": item,
        "bom": bom,
        "supplier": supplier,
        "unique_id": unique_id
    }


def create_wo_with_os_operation(admin_session, test_data):
    """Helper to create a WO and start an OS operation on it"""
    unique_id = str(uuid.uuid4())[:8]
    
    # Create MTS work order
    wo_resp = admin_session.post(f"{BASE_URL}/api/work-orders", json={
        "order_type": "mts",
        "item_id": test_data['item']['id'],
        "quantity": 10,
        "notes": f"Test WO for short-close-no-grn {unique_id}"
    })
    assert wo_resp.status_code in [200, 201], f"WO creation failed: {wo_resp.text}"
    wo_data = wo_resp.json()
    
    # Get the created WO
    if 'work_orders' in wo_data and wo_data['work_orders']:
        wo_id = wo_data['work_orders'][0]['id']
    else:
        wo_id = wo_data.get('id')
    
    assert wo_id, "Could not get WO ID"
    
    # Start the MO first (required before starting operations)
    start_mo_resp = admin_session.post(f"{BASE_URL}/api/work-orders/{wo_id}/start")
    # It's OK if this fails due to no materials - we just need the MO to be in_progress
    if start_mo_resp.status_code != 200:
        # Try to update status directly
        admin_session.put(f"{BASE_URL}/api/work-orders/{wo_id}", json={"status": "in_progress"})
    
    # Fetch the WO to get operations
    wo_fetch = admin_session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
    assert wo_fetch.status_code == 200, f"WO fetch failed: {wo_fetch.text}"
    wo = wo_fetch.json()
    
    ops = wo.get('operations_status') or []
    if not ops:
        pytest.skip("WO has no operations")
    
    # Find the first operation
    op = ops[0]
    seq = op['sequence']
    
    # Start the operation as outsourced
    start_resp = admin_session.put(f"{BASE_URL}/api/work-orders/{wo_id}/operations/{seq}", json={
        "status": "in_progress",
        "is_outsource": True,
        "outsource_supplier_id": test_data['supplier']['id'],
        "outsource_charges": 50,
        "quantity_completed": 10,
        "outsource_quantity": 10,
        "operator": f"OS: {test_data['supplier']['name']}"
    })
    assert start_resp.status_code == 200, f"Start OS operation failed: {start_resp.text}"
    
    # Fetch updated WO
    wo_fetch2 = admin_session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
    assert wo_fetch2.status_code == 200
    wo = wo_fetch2.json()
    
    # Verify the operation is now in_progress and is_job_work
    ops = wo.get('operations_status') or []
    target_op = next((o for o in ops if o['sequence'] == seq), None)
    assert target_op, "Could not find target operation"
    assert target_op.get('status') == 'in_progress', f"Op status should be in_progress, got {target_op.get('status')}"
    assert target_op.get('is_job_work') == True, "Op should be is_job_work=True"
    
    return wo, seq, target_op.get('outsource_sc_order_id')


class TestShortCloseNoGRN:
    """Tests for the new short-close-no-grn endpoint"""
    
    def test_short_close_no_grn_success(self, admin_session, test_data):
        """Test successful short-close-no-grn with admin auth"""
        wo, seq, sc_order_id = create_wo_with_os_operation(admin_session, test_data)
        wo_id = wo['id']
        
        # Call short-close-no-grn
        resp = admin_session.post(
            f"{BASE_URL}/api/work-orders/{wo_id}/operations/{seq}/short-close-no-grn",
            json={"reason": "Test short close reason"}
        )
        assert resp.status_code == 200, f"short-close-no-grn failed: {resp.text}"
        result = resp.json()
        
        assert result.get('ok') == True
        assert result.get('completed_qty') == 10
        
        # Verify the operation is now completed and short_closed
        wo_fetch = admin_session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
        assert wo_fetch.status_code == 200
        wo = wo_fetch.json()
        
        ops = wo.get('operations_status') or []
        target_op = next((o for o in ops if o['sequence'] == seq), None)
        assert target_op, "Could not find target operation"
        assert target_op.get('status') == 'completed', f"Op status should be completed, got {target_op.get('status')}"
        assert target_op.get('short_closed') == True, "Op should have short_closed=True"
        assert target_op.get('short_close_reason') == "Test short close reason"
        assert target_op.get('quantity_completed') == 10
        assert target_op.get('quantity_accepted') == 10
        
        # Verify SC line is marked short_closed
        if sc_order_id:
            sc_resp = admin_session.get(f"{BASE_URL}/api/job-work/orders/{sc_order_id}")
            if sc_resp.status_code == 200:
                sc = sc_resp.json()
                jwp = sc.get('job_work_parts') or []
                matching_line = next((p for p in jwp if p.get('wo_id') == wo_id), None)
                if matching_line:
                    assert matching_line.get('short_closed') == True, "SC line should be short_closed"
    
    def test_short_close_no_grn_without_admin_returns_403(self, non_admin_session, admin_session, test_data):
        """Test that non-admin users get 403"""
        wo, seq, _ = create_wo_with_os_operation(admin_session, test_data)
        wo_id = wo['id']
        
        # Try to call short-close-no-grn as non-admin
        resp = non_admin_session.post(
            f"{BASE_URL}/api/work-orders/{wo_id}/operations/{seq}/short-close-no-grn",
            json={"reason": "Test"}
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
    
    def test_short_close_no_grn_on_non_os_op_returns_400(self, admin_session, test_data):
        """Test that calling on a non-OS operation returns 400"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create a WO but don't start it as OS
        wo_resp = admin_session.post(f"{BASE_URL}/api/work-orders", json={
            "order_type": "mts",
            "item_id": test_data['item']['id'],
            "quantity": 5,
            "notes": f"Test WO non-OS {unique_id}"
        })
        assert wo_resp.status_code in [200, 201], f"WO creation failed: {wo_resp.text}"
        wo_data = wo_resp.json()
        
        if 'work_orders' in wo_data and wo_data['work_orders']:
            wo_id = wo_data['work_orders'][0]['id']
        else:
            wo_id = wo_data.get('id')
        
        # Fetch WO
        wo_fetch = admin_session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
        assert wo_fetch.status_code == 200
        wo = wo_fetch.json()
        
        ops = wo.get('operations_status') or []
        if not ops:
            pytest.skip("WO has no operations")
        
        seq = ops[0]['sequence']
        
        # Try to short-close-no-grn on a pending (non-OS) operation
        resp = admin_session.post(
            f"{BASE_URL}/api/work-orders/{wo_id}/operations/{seq}/short-close-no-grn",
            json={"reason": "Test"}
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    
    def test_short_close_no_grn_on_completed_op_returns_400(self, admin_session, test_data):
        """Test that calling on an already completed operation returns 400"""
        wo, seq, _ = create_wo_with_os_operation(admin_session, test_data)
        wo_id = wo['id']
        
        # First short-close it
        resp1 = admin_session.post(
            f"{BASE_URL}/api/work-orders/{wo_id}/operations/{seq}/short-close-no-grn",
            json={"reason": "First close"}
        )
        assert resp1.status_code == 200
        
        # Try to short-close again
        resp2 = admin_session.post(
            f"{BASE_URL}/api/work-orders/{wo_id}/operations/{seq}/short-close-no-grn",
            json={"reason": "Second close"}
        )
        assert resp2.status_code == 400, f"Expected 400 on already completed op, got {resp2.status_code}"


class TestRegressionShortClose:
    """Regression tests for the existing short-close endpoint (revoke)"""
    
    def test_existing_short_close_reverts_to_pending(self, admin_session, test_data):
        """Test that the existing /short-close endpoint still reverts an op to pending"""
        wo, seq, sc_order_id = create_wo_with_os_operation(admin_session, test_data)
        wo_id = wo['id']
        
        # Call the existing short-close endpoint (now labeled "Revoke" in UI)
        resp = admin_session.post(f"{BASE_URL}/api/work-orders/{wo_id}/operations/{seq}/short-close")
        assert resp.status_code == 200, f"short-close (revoke) failed: {resp.text}"
        result = resp.json()
        
        assert result.get('ok') == True
        assert result.get('released') == True
        
        # Verify the operation is now pending (reverted)
        wo_fetch = admin_session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
        assert wo_fetch.status_code == 200
        wo = wo_fetch.json()
        
        ops = wo.get('operations_status') or []
        target_op = next((o for o in ops if o['sequence'] == seq), None)
        assert target_op, "Could not find target operation"
        assert target_op.get('status') == 'pending', f"Op status should be pending after revoke, got {target_op.get('status')}"
        assert target_op.get('is_job_work') != True, "Op should no longer be is_job_work after revoke"


class TestRegressionOtherFlows:
    """Regression tests for other critical flows"""
    
    def test_grn_list_works(self, admin_session):
        """GRN list endpoint works"""
        resp = admin_session.get(f"{BASE_URL}/api/grn")
        assert resp.status_code == 200, f"GRN list failed: {resp.text}"
    
    def test_subcontract_orders_list_works(self, admin_session):
        """Subcontract orders list works"""
        resp = admin_session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200, f"SC orders list failed: {resp.text}"
    
    def test_tax_invoices_list_works(self, admin_session):
        """Tax invoices list works"""
        resp = admin_session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert resp.status_code == 200, f"Tax invoices list failed: {resp.text}"
    
    def test_work_orders_list_works(self, admin_session):
        """Work orders list works"""
        resp = admin_session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200, f"Work orders list failed: {resp.text}"
    
    def test_items_list_works(self, admin_session):
        """Items list works"""
        resp = admin_session.get(f"{BASE_URL}/api/items")
        assert resp.status_code == 200, f"Items list failed: {resp.text}"
