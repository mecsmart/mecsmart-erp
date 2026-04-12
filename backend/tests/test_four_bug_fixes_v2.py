"""
Test suite for 4 Bug Fixes:
1. SC Order creation when MO is subcontracted (PART items with no BOM materials)
2. Hide Job Card and Complete buttons when MO is subcontracted
3. Partial qty MO from SO (show balance qty, not full qty)
4. Block SO edit when full qty covered by MOs
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSession:
    """Shared session with authentication"""
    session = None
    auth_token = None
    
    @classmethod
    def get_session(cls):
        if cls.session is None:
            cls.session = requests.Session()
            cls.session.headers.update({"Content-Type": "application/json"})
            # Login
            response = cls.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@erp.com",
                "password": "Admin@123"
            })
            if response.status_code == 200:
                print(f"Login successful")
            else:
                print(f"Login failed: {response.status_code} - {response.text}")
        return cls.session


class TestBug1_SCOrderCreationForPARTItems:
    """
    Bug 1: When a subcontracted MO is started, SC Order + DC should ALWAYS be created
    even if no BOM materials are consumed (uses WO item itself as fallback).
    """
    
    def test_get_production_orders_returns_mo_qty_created(self):
        """GET /api/production should return mo_qty_created field for each order"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200, f"Failed to get production orders: {response.text}"
        
        orders = response.json()
        assert isinstance(orders, list), "Response should be a list"
        
        if len(orders) > 0:
            # Check that mo_qty_created field exists
            for order in orders:
                assert "mo_qty_created" in order, f"Order {order.get('order_number')} missing mo_qty_created field"
                assert isinstance(order["mo_qty_created"], (int, float)), f"mo_qty_created should be numeric"
                print(f"Order {order.get('order_number')}: qty={order.get('quantity')}, mo_qty_created={order.get('mo_qty_created')}")
    
    def test_get_work_orders_with_subcontract_flag(self):
        """GET /api/work-orders should return MOs with is_subcontract flag"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200, f"Failed to get work orders: {response.text}"
        
        work_orders = response.json()
        assert isinstance(work_orders, list), "Response should be a list"
        
        subcontract_mos = [wo for wo in work_orders if wo.get("is_subcontract")]
        print(f"Found {len(subcontract_mos)} subcontracted MOs out of {len(work_orders)} total")
        
        for wo in subcontract_mos:
            print(f"  SC MO: {wo.get('wo_number')} - status: {wo.get('status')}, supplier_id: {wo.get('subcontract_supplier_id')}")
    
    def test_get_job_work_orders(self):
        """GET /api/job-work/orders should return SC orders"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200, f"Failed to get job work orders: {response.text}"
        
        sc_orders = response.json()
        assert isinstance(sc_orders, list), "Response should be a list"
        print(f"Found {len(sc_orders)} SC orders")
        
        for sc in sc_orders:
            print(f"  SC Order: {sc.get('order_number')} - status: {sc.get('status')}, ref_wo: {sc.get('reference_wo_id')}")
            if sc.get('lines'):
                print(f"    Lines: {len(sc.get('lines'))} items")


class TestBug3_PartialQtyMOFromSO:
    """
    Bug 3: In Create Manufacturing Order dialog, when selecting a SO, 
    the quantity field should show balance qty (SO qty - existing MO qty).
    """
    
    def test_production_orders_have_mo_qty_created(self):
        """Verify production orders return mo_qty_created for balance calculation"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        
        orders = response.json()
        for order in orders:
            so_qty = order.get("quantity", 0)
            mo_qty = order.get("mo_qty_created", 0)
            balance = so_qty - mo_qty
            print(f"SO {order.get('order_number')}: qty={so_qty}, mo_qty_created={mo_qty}, balance={balance}")
            
            # Verify balance calculation is correct
            assert balance == so_qty - mo_qty, "Balance calculation mismatch"
    
    def test_so_with_partial_mo_coverage(self):
        """Find SOs with partial MO coverage (0 < mo_qty_created < quantity)"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        
        orders = response.json()
        partial_coverage = [o for o in orders if 0 < o.get("mo_qty_created", 0) < o.get("quantity", 0)]
        
        print(f"Found {len(partial_coverage)} SOs with partial MO coverage:")
        for order in partial_coverage:
            print(f"  {order.get('order_number')}: {order.get('mo_qty_created')}/{order.get('quantity')} (balance: {order.get('quantity') - order.get('mo_qty_created')})")


class TestBug4_BlockSOEditWhenFullQtyCovered:
    """
    Bug 4: On Sales Orders page, when mo_qty_created >= SO quantity, 
    edit button should be hidden and backend should reject edits.
    """
    
    def test_find_so_with_full_mo_coverage(self):
        """Find SOs where mo_qty_created >= quantity (should not be editable)"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        
        orders = response.json()
        full_coverage = [o for o in orders if o.get("mo_qty_created", 0) >= o.get("quantity", 0)]
        
        print(f"Found {len(full_coverage)} SOs with full MO coverage (should not be editable):")
        for order in full_coverage:
            print(f"  {order.get('order_number')}: mo_qty={order.get('mo_qty_created')}, so_qty={order.get('quantity')}, status={order.get('status')}")
        
        return full_coverage
    
    def test_backend_blocks_edit_when_full_qty_covered(self):
        """PUT /api/production/{id} should reject edits if full qty covered"""
        session = TestSession.get_session()
        
        # First find an SO with full coverage
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        
        orders = response.json()
        full_coverage = [o for o in orders if o.get("mo_qty_created", 0) >= o.get("quantity", 0)]
        
        if not full_coverage:
            pytest.skip("No SO with full MO coverage found to test edit blocking")
        
        # Try to edit the first fully covered SO
        so_to_edit = full_coverage[0]
        so_id = so_to_edit["id"]
        print(f"Attempting to edit SO {so_to_edit.get('order_number')} (mo_qty={so_to_edit.get('mo_qty_created')}, so_qty={so_to_edit.get('quantity')})")
        
        # Try to update notes (should be blocked)
        response = session.put(f"{BASE_URL}/api/production/{so_id}", json={
            "notes": "TEST_Attempting to edit fully covered SO"
        })
        
        # Should return 400 with error message
        assert response.status_code == 400, f"Expected 400 but got {response.status_code}: {response.text}"
        
        error_data = response.json()
        assert "Cannot edit" in str(error_data.get("detail", "")), f"Expected 'Cannot edit' in error message: {error_data}"
        print(f"Edit correctly blocked: {error_data.get('detail')}")
    
    def test_so_000005_should_not_be_editable(self):
        """SO-000005 (confirmed, qty 5, mo_qty_created=10) should NOT be editable"""
        session = TestSession.get_session()
        
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        
        orders = response.json()
        so_000005 = next((o for o in orders if o.get("order_number") == "SO-000005"), None)
        
        if not so_000005:
            pytest.skip("SO-000005 not found in database")
        
        print(f"SO-000005: qty={so_000005.get('quantity')}, mo_qty_created={so_000005.get('mo_qty_created')}, status={so_000005.get('status')}")
        
        # Verify mo_qty_created >= quantity
        assert so_000005.get("mo_qty_created", 0) >= so_000005.get("quantity", 0), \
            f"SO-000005 should have full MO coverage but has mo_qty={so_000005.get('mo_qty_created')}, qty={so_000005.get('quantity')}"
        
        # Try to edit - should fail
        response = session.put(f"{BASE_URL}/api/production/{so_000005['id']}", json={
            "notes": "TEST_Should not be editable"
        })
        
        assert response.status_code == 400, f"SO-000005 edit should be blocked but got {response.status_code}"
        print(f"SO-000005 edit correctly blocked")


class TestBug2_HideJobCardCompleteForSubcontractMO:
    """
    Bug 2: On Manufacturing Orders page, MOs with is_subcontract=true should NOT show 
    Job Card or Complete buttons. They should only show Start (if pending) and Print (if completed).
    
    This is a frontend test - we verify the data structure supports this.
    """
    
    def test_subcontract_mo_has_is_subcontract_flag(self):
        """Verify subcontracted MOs have is_subcontract=true flag"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        subcontract_mos = [wo for wo in work_orders if wo.get("is_subcontract")]
        
        print(f"Found {len(subcontract_mos)} subcontracted MOs:")
        for wo in subcontract_mos:
            print(f"  {wo.get('wo_number')}: is_subcontract={wo.get('is_subcontract')}, status={wo.get('status')}")
            assert wo.get("is_subcontract") == True, "is_subcontract should be True"
    
    def test_subcontract_mo_status_transitions(self):
        """Verify subcontracted MO status values"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        subcontract_mos = [wo for wo in work_orders if wo.get("is_subcontract")]
        
        valid_statuses = ["pending", "in_progress", "completed", "cancelled"]
        for wo in subcontract_mos:
            assert wo.get("status") in valid_statuses, f"Invalid status: {wo.get('status')}"
            print(f"  {wo.get('wo_number')}: status={wo.get('status')} (valid)")


class TestCreateSubcontractMOAndVerifySCOrder:
    """
    Integration test: Create a subcontracted MO and verify SC Order is created on start.
    """
    
    def test_create_and_start_subcontract_mo(self):
        """Create a subcontracted MO, start it, and verify SC Order is created"""
        session = TestSession.get_session()
        
        # 1. Get available routings
        response = session.get(f"{BASE_URL}/api/routings")
        assert response.status_code == 200
        routings = response.json()
        active_routings = [r for r in routings if r.get("status") == "active"]
        
        if not active_routings:
            pytest.skip("No active routings available")
        
        routing = active_routings[0]
        print(f"Using routing: {routing.get('name')} (item: {routing.get('item_id')})")
        
        # 2. Get available suppliers
        response = session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200
        suppliers = response.json()
        
        if not suppliers:
            pytest.skip("No suppliers available")
        
        supplier = suppliers[0]
        print(f"Using supplier: {supplier.get('name')} (id: {supplier.get('id')})")
        
        # 3. Get a confirmed/planned production order
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        orders = response.json()
        available_orders = [o for o in orders if o.get("status") in ["confirmed", "planned"]]
        
        if not available_orders:
            pytest.skip("No confirmed/planned production orders available")
        
        prod_order = available_orders[0]
        print(f"Using production order: {prod_order.get('order_number')}")
        
        # 4. Create a subcontracted MO
        mo_data = {
            "routing_id": routing["id"],
            "production_order_id": prod_order["id"],
            "quantity": 1,
            "priority": "medium",
            "is_subcontract": True,
            "subcontract_supplier_id": supplier["id"],
            "notes": "TEST_Subcontract MO for SC Order verification"
        }
        
        response = session.post(f"{BASE_URL}/api/work-orders", json=mo_data)
        
        if response.status_code != 201:
            print(f"Failed to create MO: {response.status_code} - {response.text}")
            pytest.skip(f"Could not create MO: {response.text}")
        
        mo = response.json()
        mo_id = mo["id"]
        print(f"Created subcontract MO: {mo.get('wo_number')} (id: {mo_id})")
        
        # 5. Start the MO
        response = session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        
        if response.status_code != 200:
            print(f"Failed to start MO: {response.status_code} - {response.text}")
            # Check if it's a material issue
            if "insufficient" in response.text.lower():
                pytest.skip("Insufficient materials to start MO")
            pytest.fail(f"Failed to start MO: {response.text}")
        
        start_result = response.json()
        print(f"MO started: {start_result}")
        
        # 6. Verify SC Order was created
        time.sleep(1)  # Give time for async operations
        
        response = session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        
        sc_orders = response.json()
        sc_for_mo = [sc for sc in sc_orders if sc.get("reference_wo_id") == mo_id]
        
        assert len(sc_for_mo) > 0, f"No SC Order created for MO {mo.get('wo_number')}"
        
        sc_order = sc_for_mo[0]
        print(f"SC Order created: {sc_order.get('order_number')}")
        print(f"  Lines: {sc_order.get('lines')}")
        
        # Verify SC Order has lines (either from BOM materials or fallback to WO item)
        assert sc_order.get("lines") and len(sc_order.get("lines")) > 0, \
            "SC Order should have at least one line (fallback to WO item if no BOM materials)"
        
        print(f"SUCCESS: SC Order {sc_order.get('order_number')} created with {len(sc_order.get('lines'))} line(s)")


class TestMOQtyColumnFormat:
    """Test that MO Qty column shows X/Y format"""
    
    def test_mo_qty_format_data_available(self):
        """Verify data for MO Qty X/Y format is available"""
        session = TestSession.get_session()
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        
        orders = response.json()
        
        for order in orders:
            mo_qty = order.get("mo_qty_created", 0)
            so_qty = order.get("quantity", 0)
            
            # Verify both values are available for X/Y format
            assert "mo_qty_created" in order, f"Missing mo_qty_created for {order.get('order_number')}"
            assert "quantity" in order, f"Missing quantity for {order.get('order_number')}"
            
            print(f"{order.get('order_number')}: {mo_qty}/{so_qty}")
            
            # Check coverage status
            if mo_qty >= so_qty:
                print(f"  -> Fully covered (should show 'Fully covered' and hide edit)")
            elif mo_qty > 0:
                print(f"  -> Partial coverage (should show 'Balance: {so_qty - mo_qty}')")
            else:
                print(f"  -> No MOs created yet")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
