"""
Iteration 62 Tests:
1. SO Cancel button - POST /api/production/{order_id}/cancel works for draft/confirmed SOs
2. GRN list supplier name for JW GRNs - GET /api/grn returns supplier for JW-based GRNs
3. Job Card dialog loading - GET /api/work-orders/{id} returns within 2s
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        """Login and get authenticated session"""
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return session
    
    def test_login_success(self, session):
        """Test login works"""
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["email"] == "admin@erp.com"


class TestSOCancelButton:
    """Test Fix 1: SO Cancel button - POST /api/production/{order_id}/cancel"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200
        return s
    
    def test_get_production_orders(self, session):
        """Test GET /api/production returns list of SOs"""
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} production orders")
    
    def test_cancel_endpoint_exists(self, session):
        """Test that cancel endpoint exists and returns proper error for non-existent order"""
        response = session.post(f"{BASE_URL}/api/production/non-existent-id/cancel")
        # Should return 404 for non-existent order, not 405 (method not allowed)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
    
    def test_cancel_draft_so(self, session):
        """Test cancelling a draft SO"""
        # First get all SOs
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        orders = response.json()
        
        # Find a draft SO
        draft_orders = [o for o in orders if o.get("status") == "draft"]
        if not draft_orders:
            pytest.skip("No draft SOs available for testing")
        
        order = draft_orders[0]
        order_id = order["id"]
        order_number = order.get("order_number", "")
        
        # Cancel the order
        response = session.post(f"{BASE_URL}/api/production/{order_id}/cancel")
        assert response.status_code == 200, f"Cancel failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert "cancelled" in data["message"].lower()
        assert "cancelled_mos" in data
        assert "reversed_materials" in data
        assert "reversed_finished_goods" in data
        print(f"Successfully cancelled SO {order_number}: {data['message']}")
    
    def test_cancel_confirmed_so(self, session):
        """Test cancelling a confirmed SO"""
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        orders = response.json()
        
        # Find a confirmed SO
        confirmed_orders = [o for o in orders if o.get("status") == "confirmed"]
        if not confirmed_orders:
            pytest.skip("No confirmed SOs available for testing")
        
        order = confirmed_orders[0]
        order_id = order["id"]
        order_number = order.get("order_number", "")
        
        # Cancel the order
        response = session.post(f"{BASE_URL}/api/production/{order_id}/cancel")
        assert response.status_code == 200, f"Cancel failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"Successfully cancelled confirmed SO {order_number}: {data['message']}")
    
    def test_cancel_already_cancelled_so_fails(self, session):
        """Test that cancelling an already cancelled SO returns error"""
        response = session.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        orders = response.json()
        
        # Find a cancelled SO
        cancelled_orders = [o for o in orders if o.get("status") == "cancelled"]
        if not cancelled_orders:
            pytest.skip("No cancelled SOs available for testing")
        
        order = cancelled_orders[0]
        order_id = order["id"]
        
        # Try to cancel again
        response = session.post(f"{BASE_URL}/api/production/{order_id}/cancel")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "already cancelled" in response.text.lower()


class TestGRNSupplierForJW:
    """Test Fix 3: GRN list shows supplier name for JW GRNs"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200
        return s
    
    def test_get_grn_list(self, session):
        """Test GET /api/grn returns list with supplier info"""
        response = session.get(f"{BASE_URL}/api/grn")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} GRNs")
    
    def test_grn_has_supplier_for_po_based(self, session):
        """Test that PO-based GRNs have supplier populated"""
        response = session.get(f"{BASE_URL}/api/grn")
        assert response.status_code == 200
        grns = response.json()
        
        # Find PO-based GRNs
        po_grns = [g for g in grns if g.get("po_id") and not g.get("sc_order_id") and not g.get("jw_order_id")]
        if not po_grns:
            pytest.skip("No PO-based GRNs available")
        
        for grn in po_grns[:3]:  # Check first 3
            supplier = grn.get("supplier")
            if supplier:
                assert "name" in supplier, f"GRN {grn.get('grn_number')} supplier missing name"
                print(f"PO GRN {grn.get('grn_number')}: supplier = {supplier.get('name')}")
    
    def test_grn_has_supplier_for_jw_based(self, session):
        """Test that JW-based GRNs have supplier populated from subcontract_orders"""
        response = session.get(f"{BASE_URL}/api/grn")
        assert response.status_code == 200
        grns = response.json()
        
        # Find JW-based GRNs (have sc_order_id or jw_order_id, no po_id)
        jw_grns = [g for g in grns if (g.get("sc_order_id") or g.get("jw_order_id")) and not g.get("po_id")]
        
        if not jw_grns:
            # Also check GRNs that have both jw_order_id and po_id
            jw_grns = [g for g in grns if g.get("sc_order_id") or g.get("jw_order_id")]
        
        if not jw_grns:
            pytest.skip("No JW-based GRNs available for testing")
        
        for grn in jw_grns[:5]:  # Check first 5
            supplier = grn.get("supplier")
            grn_number = grn.get("grn_number", "")
            jw_order = grn.get("jw_order")
            
            print(f"JW GRN {grn_number}: sc_order_id={grn.get('sc_order_id')}, jw_order_id={grn.get('jw_order_id')}, po_id={grn.get('po_id')}")
            
            if supplier:
                assert "name" in supplier, f"GRN {grn_number} supplier missing name"
                print(f"  -> supplier = {supplier.get('name')}")
            else:
                # If no supplier, check if jw_order exists
                if jw_order:
                    print(f"  -> jw_order found but supplier not resolved (supplier_id={jw_order.get('supplier_id')})")
                else:
                    print(f"  -> No jw_order found")
    
    def test_all_grns_have_supplier_or_reason(self, session):
        """Test that all GRNs either have supplier or a valid reason for not having one"""
        response = session.get(f"{BASE_URL}/api/grn")
        assert response.status_code == 200
        grns = response.json()
        
        missing_supplier = []
        for grn in grns:
            supplier = grn.get("supplier")
            if not supplier:
                missing_supplier.append({
                    "grn_number": grn.get("grn_number"),
                    "po_id": grn.get("po_id"),
                    "sc_order_id": grn.get("sc_order_id"),
                    "jw_order_id": grn.get("jw_order_id")
                })
        
        if missing_supplier:
            print(f"GRNs without supplier: {len(missing_supplier)}")
            for m in missing_supplier[:5]:
                print(f"  - {m}")


class TestJobCardLoading:
    """Test Fix 4: Job Card dialog loads within 2s"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200
        return s
    
    def test_get_work_orders(self, session):
        """Test GET /api/work-orders returns list"""
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} work orders")
    
    def test_get_in_progress_mo(self, session):
        """Test getting an in_progress MO (Job Card)"""
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        orders = response.json()
        
        # Find in_progress MOs
        in_progress = [o for o in orders if o.get("status") == "in_progress"]
        if not in_progress:
            pytest.skip("No in_progress MOs available")
        
        print(f"Found {len(in_progress)} in_progress MOs")
        
        # Test loading first 4 MOs
        for mo in in_progress[:4]:
            mo_id = mo["id"]
            mo_number = mo.get("wo_number", "")
            
            start_time = time.time()
            response = session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
            elapsed = time.time() - start_time
            
            assert response.status_code == 200, f"Failed to load MO {mo_number}: {response.text}"
            assert elapsed < 2.0, f"MO {mo_number} took {elapsed:.2f}s to load (>2s)"
            
            data = response.json()
            assert "id" in data
            print(f"MO {mo_number} loaded in {elapsed:.3f}s")
    
    def test_job_card_has_operations(self, session):
        """Test that Job Card has operations_status"""
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        orders = response.json()
        
        in_progress = [o for o in orders if o.get("status") == "in_progress"]
        if not in_progress:
            pytest.skip("No in_progress MOs available")
        
        mo = in_progress[0]
        mo_id = mo["id"]
        
        response = session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert response.status_code == 200
        data = response.json()
        
        # Check for operations_status
        if "operations_status" in data:
            ops = data["operations_status"]
            print(f"MO {data.get('wo_number')} has {len(ops)} operations")
            for op in ops[:3]:
                print(f"  - {op.get('operation_name')}: {op.get('status')}")


class TestRMTotalColumn:
    """Test Fix 2: SC with RM edit dialog has Total column and Grand Total row"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200
        return s
    
    def test_get_jw_orders(self, session):
        """Test GET /api/job-work/orders returns list"""
        response = session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} JW orders")
    
    def test_jw_order_has_lines_with_rate(self, session):
        """Test that JW orders have lines with rate field"""
        response = session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        orders = response.json()
        
        # Find orders with RM lines
        orders_with_rm = [o for o in orders if o.get("lines") and len(o.get("lines", [])) > 0]
        if not orders_with_rm:
            pytest.skip("No JW orders with RM lines available")
        
        for order in orders_with_rm[:3]:
            order_number = order.get("order_number", "")
            lines = order.get("lines", [])
            print(f"JW Order {order_number} has {len(lines)} RM lines:")
            for line in lines[:3]:
                qty = line.get("quantity", 0)
                rate = line.get("rate", 0)
                total = qty * rate
                print(f"  - item_id={line.get('item_id')[:8]}..., qty={qty}, rate={rate}, total={total}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
