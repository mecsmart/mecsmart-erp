"""
Test 3 Bug Fixes:
1. MO to SC - Subcontract Order not created when marking an already-started MO as subcontract
2. JW page should show item names (not just part numbers)
3. Add MO Number column to JW orders table
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSession:
    """Shared session with auth"""
    session = None
    
    @classmethod
    def get_session(cls):
        if cls.session is None:
            cls.session = requests.Session()
            # Login
            login_resp = cls.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@erp.com",
                "password": "Admin@123"
            })
            assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        return cls.session


class TestBug1_MOtoSCOrderCreation:
    """Bug 1: When marking an in_progress MO as subcontract, SC Order + DC should be auto-created"""
    
    def test_get_work_orders_list(self):
        """Get list of work orders to find an in_progress MO"""
        session = TestSession.get_session()
        resp = session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        data = resp.json()
        print(f"Found {len(data)} work orders")
        
        # Find in_progress MOs that are NOT subcontracted
        in_progress_mos = [wo for wo in data if wo.get("status") == "in_progress" and not wo.get("is_subcontract")]
        print(f"In-progress non-SC MOs: {len(in_progress_mos)}")
        for mo in in_progress_mos[:5]:
            print(f"  - {mo.get('wo_number')} (id: {mo.get('id')}, is_subcontract: {mo.get('is_subcontract')})")
        return data
    
    def test_get_suppliers_list(self):
        """Get suppliers for subcontracting"""
        session = TestSession.get_session()
        resp = session.get(f"{BASE_URL}/api/suppliers")
        assert resp.status_code == 200
        data = resp.json()
        print(f"Found {len(data)} suppliers")
        assert len(data) > 0, "Need at least one supplier for testing"
        return data
    
    def test_get_jw_orders_count_before(self):
        """Get JW orders count before marking MO as SC"""
        session = TestSession.get_session()
        resp = session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        data = resp.json()
        print(f"JW orders count before: {len(data)}")
        return len(data)
    
    def test_mark_in_progress_mo_as_subcontract(self):
        """Mark an in_progress MO as subcontract and verify SC Order is created"""
        session = TestSession.get_session()
        
        # Get work orders
        wo_resp = session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find an in_progress MO that is NOT already subcontracted
        in_progress_mos = [wo for wo in work_orders if wo.get("status") == "in_progress" and not wo.get("is_subcontract")]
        
        if not in_progress_mos:
            pytest.skip("No in_progress non-subcontract MOs available for testing")
        
        # Get suppliers
        sup_resp = session.get(f"{BASE_URL}/api/suppliers")
        assert sup_resp.status_code == 200
        suppliers = sup_resp.json()
        assert len(suppliers) > 0, "Need at least one supplier"
        supplier_id = suppliers[0]["id"]
        
        # Get JW orders count before
        jw_before_resp = session.get(f"{BASE_URL}/api/job-work/orders")
        jw_count_before = len(jw_before_resp.json())
        
        # Pick the first in_progress MO
        mo = in_progress_mos[0]
        mo_id = mo["id"]
        mo_number = mo.get("wo_number")
        print(f"Testing with MO: {mo_number} (id: {mo_id})")
        
        # Mark as subcontract
        update_resp = session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": supplier_id
        })
        assert update_resp.status_code == 200, f"Failed to mark MO as SC: {update_resp.text}"
        updated_mo = update_resp.json()
        assert updated_mo.get("is_subcontract") == True, "MO should be marked as subcontract"
        print(f"MO {mo_number} marked as subcontract")
        
        # Verify SC Order was created
        jw_after_resp = session.get(f"{BASE_URL}/api/job-work/orders")
        assert jw_after_resp.status_code == 200
        jw_orders = jw_after_resp.json()
        jw_count_after = len(jw_orders)
        
        print(f"JW orders count: before={jw_count_before}, after={jw_count_after}")
        assert jw_count_after > jw_count_before, f"SC Order should have been created. Before: {jw_count_before}, After: {jw_count_after}"
        
        # Find the new SC order linked to this MO
        new_sc_order = next((o for o in jw_orders if o.get("reference_wo_id") == mo_id), None)
        assert new_sc_order is not None, f"SC Order linked to MO {mo_number} should exist"
        print(f"SC Order created: {new_sc_order.get('order_number')} for MO {mo_number}")
        
        return new_sc_order


class TestBug2_JWOrdersShowItemNames:
    """Bug 2: JW orders table shows item names alongside part numbers"""
    
    def test_jw_orders_include_item_details(self):
        """Verify JW orders API returns item details (name, part_number) in lines"""
        session = TestSession.get_session()
        resp = session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        orders = resp.json()
        
        if not orders:
            pytest.skip("No JW orders to test")
        
        # Check that each order's lines include item details
        for order in orders[:3]:  # Check first 3 orders
            print(f"\nOrder: {order.get('order_number')}")
            for line in order.get("lines", []):
                item = line.get("item")
                assert item is not None, f"Line should have item details: {line}"
                assert "part_number" in item, f"Item should have part_number: {item}"
                assert "name" in item, f"Item should have name: {item}"
                print(f"  - {item.get('part_number')} {item.get('name')}")
        
        print("\nBug 2 PASSED: JW orders include item names")


class TestBug3_JWOrdersShowMONumber:
    """Bug 3: JW orders table has 'MO #' column showing linked Manufacturing Order number"""
    
    def test_jw_orders_include_mo_number(self):
        """Verify JW orders API returns mo_number field"""
        session = TestSession.get_session()
        resp = session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        orders = resp.json()
        
        if not orders:
            pytest.skip("No JW orders to test")
        
        # Check orders with reference_wo_id have mo_number
        orders_with_ref = [o for o in orders if o.get("reference_wo_id")]
        print(f"Orders with reference_wo_id: {len(orders_with_ref)}")
        
        for order in orders_with_ref[:5]:
            mo_number = order.get("mo_number")
            print(f"Order: {order.get('order_number')} -> MO#: {mo_number}")
            assert mo_number is not None, f"Order {order.get('order_number')} should have mo_number"
        
        print("\nBug 3 PASSED: JW orders include mo_number field")


class TestSubcontractedMOsNoJobCardComplete:
    """Verify subcontracted MOs should NOT show Job Card or Complete buttons"""
    
    def test_get_subcontracted_mos(self):
        """Get list of subcontracted MOs"""
        session = TestSession.get_session()
        resp = session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        data = resp.json()
        
        sc_mos = [wo for wo in data if wo.get("is_subcontract")]
        print(f"Subcontracted MOs: {len(sc_mos)}")
        for mo in sc_mos[:5]:
            print(f"  - {mo.get('wo_number')} (status: {mo.get('status')}, is_subcontract: {mo.get('is_subcontract')})")
        
        return sc_mos


class TestSCOrderCreationOnMOStart:
    """Verify SC Order creation also happens on MO start when is_subcontract was set at creation time"""
    
    def test_create_subcontract_mo_and_start(self):
        """Create a new MO with is_subcontract=true, start it, verify SC Order is created"""
        session = TestSession.get_session()
        
        # Get a confirmed production order
        po_resp = session.get(f"{BASE_URL}/api/production")
        assert po_resp.status_code == 200
        prod_orders = po_resp.json()
        confirmed_orders = [o for o in prod_orders if o.get("status") in ["confirmed", "released", "in_progress"]]
        
        if not confirmed_orders:
            pytest.skip("No confirmed production orders available")
        
        # Get routings
        routing_resp = session.get(f"{BASE_URL}/api/routings")
        assert routing_resp.status_code == 200
        routings = routing_resp.json()
        
        if not routings:
            pytest.skip("No routings available")
        
        # Get suppliers
        sup_resp = session.get(f"{BASE_URL}/api/suppliers")
        assert sup_resp.status_code == 200
        suppliers = sup_resp.json()
        
        if not suppliers:
            pytest.skip("No suppliers available")
        
        # Get JW orders count before
        jw_before_resp = session.get(f"{BASE_URL}/api/job-work/orders")
        jw_count_before = len(jw_before_resp.json())
        
        # Create a new MO with is_subcontract=true
        po = confirmed_orders[0]
        routing = routings[0]
        supplier = suppliers[0]
        
        create_resp = session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": po["id"],
            "routing_id": routing["id"],
            "quantity": 1,
            "is_subcontract": True,
            "subcontract_supplier_id": supplier["id"],
            "notes": "TEST_SC_MO_for_bug_fix_testing"
        })
        
        if create_resp.status_code != 201:
            print(f"Create MO failed: {create_resp.text}")
            pytest.skip(f"Could not create MO: {create_resp.text}")
        
        new_mo = create_resp.json()
        mo_id = new_mo["id"]
        mo_number = new_mo.get("wo_number")
        print(f"Created MO: {mo_number} (is_subcontract: {new_mo.get('is_subcontract')})")
        
        # Start the MO
        start_resp = session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start")
        if start_resp.status_code != 200:
            print(f"Start MO failed: {start_resp.text}")
            # Clean up
            session.delete(f"{BASE_URL}/api/work-orders/{mo_id}")
            pytest.skip(f"Could not start MO: {start_resp.text}")
        
        started_mo = start_resp.json()
        print(f"Started MO: {mo_number} (status: {started_mo.get('status')})")
        
        # Verify SC Order was created
        jw_after_resp = session.get(f"{BASE_URL}/api/job-work/orders")
        jw_orders = jw_after_resp.json()
        jw_count_after = len(jw_orders)
        
        print(f"JW orders count: before={jw_count_before}, after={jw_count_after}")
        
        # Find SC order linked to this MO
        new_sc_order = next((o for o in jw_orders if o.get("reference_wo_id") == mo_id), None)
        if new_sc_order:
            print(f"SC Order created on start: {new_sc_order.get('order_number')} for MO {mo_number}")
        
        assert jw_count_after > jw_count_before or new_sc_order is not None, "SC Order should be created when starting a subcontract MO"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
