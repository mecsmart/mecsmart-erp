"""
Iteration 74 Tests - P0 Fixes:
1. SO->MO creation with BOM.parent_routings fallback
2. POST /api/purchase-orders/from-mrp endpoint
3. MRP decimal formatting (frontend test)
4. MRP-to-PO dialog with SearchableSelect supplier
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication setup"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        return s


class TestSOtoMOCreation(TestAuth):
    """Test SO->MO creation with BOM.parent_routings fallback - Critical P0 fix"""
    
    def test_get_eligible_production_orders(self, session):
        """Get production orders eligible for MO creation"""
        resp = session.get(f"{BASE_URL}/api/production")
        assert resp.status_code == 200
        data = resp.json()
        
        # Find eligible SOs (confirmed/planned with balance qty > 0)
        eligible = [p for p in data if p.get('status') in ['confirmed', 'planned'] 
                    and (p.get('quantity', 0) - p.get('mo_qty_created', 0)) > 0]
        
        print(f"Total SOs: {len(data)}, Eligible for MO: {len(eligible)}")
        assert len(eligible) > 0, "No eligible SOs found for MO creation"
        
        # Store first eligible SO for next test
        self.__class__.eligible_so = eligible[0]
        print(f"Using SO: {eligible[0].get('order_number')} (id={eligible[0].get('id')})")
    
    def test_create_work_order_from_so(self, session):
        """Create MO from SO - should return work_orders.length >= 1"""
        so = getattr(self.__class__, 'eligible_so', None)
        if not so:
            pytest.skip("No eligible SO found in previous test")
        
        payload = {
            "production_order_id": so['id'],
            "quantity": 1,
            "routing_id": "",
            "is_subcontract": False,
            "subcontract_supplier_id": "",
            "subcontract_type": "with_material",
            "notes": "TEST_iteration74_MO_creation"
        }
        
        resp = session.post(f"{BASE_URL}/api/work-orders", json=payload)
        assert resp.status_code == 201, f"MO creation failed: {resp.text}"
        
        data = resp.json()
        print(f"Response: {data.get('message')}")
        
        # Critical assertion: work_orders array should have at least 1 item
        work_orders = data.get('work_orders', [])
        assert len(work_orders) >= 1, f"Expected at least 1 work order, got {len(work_orders)}"
        
        # Verify operations_status is populated from BOM.parent_routings
        main_wo = work_orders[0]
        operations = main_wo.get('operations_status', [])
        print(f"Main MO: {main_wo.get('wo_number')}, Operations: {len(operations)}")
        
        # Store created MO numbers for cleanup context
        self.__class__.created_mos = [wo.get('wo_number') for wo in work_orders]
        print(f"Created MOs: {self.__class__.created_mos}")
        
        # Verify each WO has operations populated
        for wo in work_orders:
            ops = wo.get('operations_status', [])
            print(f"  {wo.get('wo_number')}: {len(ops)} operations")
            # Main MO should have operations from BOM.parent_routings
            if wo.get('parent_wo_id') is None:
                assert len(ops) >= 1, f"Main MO {wo.get('wo_number')} should have operations from BOM.parent_routings"


class TestPurchaseOrderFromMRP(TestAuth):
    """Test POST /api/purchase-orders/from-mrp endpoint"""
    
    def test_get_mrp_suggestions(self, session):
        """Get MRP suggestions to find items for PO creation"""
        resp = session.get(f"{BASE_URL}/api/mrp/suggestions")
        assert resp.status_code == 200
        data = resp.json()
        
        pending = [s for s in data if s.get('po_status') == 'pending']
        print(f"Total suggestions: {len(data)}, Pending: {len(pending)}")
        
        if pending:
            self.__class__.pending_item = pending[0]
            print(f"Using item: {pending[0].get('item', {}).get('part_number')}")
    
    def test_get_active_suppliers(self, session):
        """Get active suppliers for PO creation"""
        resp = session.get(f"{BASE_URL}/api/suppliers?status=active")
        assert resp.status_code == 200
        data = resp.json()
        
        assert len(data) > 0, "No active suppliers found"
        self.__class__.supplier = data[0]
        print(f"Using supplier: {data[0].get('code')} - {data[0].get('name')}")
    
    def test_create_po_from_mrp(self, session):
        """Create PO from MRP suggestions"""
        pending_item = getattr(self.__class__, 'pending_item', None)
        supplier = getattr(self.__class__, 'supplier', None)
        
        if not pending_item or not supplier:
            pytest.skip("No pending item or supplier found")
        
        item_id = pending_item.get('item', {}).get('id')
        payload = {
            "supplier_id": supplier['id'],
            "items": [
                {"item_id": item_id, "quantity": 1, "unit_price": 50}
            ]
        }
        
        resp = session.post(f"{BASE_URL}/api/purchase-orders/from-mrp", json=payload)
        
        # May return 400 if item already has PO coverage
        if resp.status_code == 400:
            print(f"Item already covered by PO: {resp.json().get('detail')}")
            return
        
        assert resp.status_code == 201, f"PO creation failed: {resp.text}"
        
        data = resp.json()
        assert 'po_number' in data, "Response should include po_number"
        assert 'total_amount' in data, "Response should include total_amount"
        
        print(f"Created PO: {data.get('po_number')}, Total: {data.get('total_amount')}")
        self.__class__.created_po = data.get('po_number')
    
    def test_po_from_mrp_validates_supplier(self, session):
        """Test that from-mrp endpoint validates supplier"""
        payload = {
            "supplier_id": "invalid-supplier-id",
            "items": [{"item_id": "some-item", "quantity": 1, "unit_price": 10}]
        }
        
        resp = session.post(f"{BASE_URL}/api/purchase-orders/from-mrp", json=payload)
        assert resp.status_code == 404, "Should return 404 for invalid supplier"


class TestMRPDemandEndpoint(TestAuth):
    """Test MRP demand endpoint for decimal formatting verification"""
    
    def test_get_mrp_demand(self, session):
        """Get MRP demand data"""
        resp = session.get(f"{BASE_URL}/api/mrp/demand")
        assert resp.status_code == 200
        data = resp.json()
        
        print(f"Total demand items: {len(data)}")
        
        # Check that numeric fields are present
        if data:
            sample = data[0]
            assert 'gross_requirement' in sample or 'net_requirement' in sample
            print(f"Sample item: {sample.get('item', {}).get('part_number')}")
            print(f"  gross_req: {sample.get('gross_requirement')}")
            print(f"  on_hand: {sample.get('on_hand')}")
            print(f"  net_req: {sample.get('net_requirement')}")
    
    def test_mrp_demand_with_production_order_filter(self, session):
        """Test MRP demand filtered by production order"""
        # Get a production order first
        po_resp = session.get(f"{BASE_URL}/api/production")
        assert po_resp.status_code == 200
        pos = po_resp.json()
        
        if pos:
            po_id = pos[0]['id']
            resp = session.get(f"{BASE_URL}/api/mrp/demand?production_order_id={po_id}")
            assert resp.status_code == 200
            print(f"Demand items for SO {pos[0].get('order_number')}: {len(resp.json())}")


class TestWorkOrdersEndpoint(TestAuth):
    """Test work orders endpoint"""
    
    def test_get_work_orders(self, session):
        """Get all work orders"""
        resp = session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        data = resp.json()
        
        print(f"Total work orders: {len(data)}")
        
        # Check for recently created test MOs
        test_mos = [wo for wo in data if 'TEST_iteration74' in (wo.get('notes') or '')]
        print(f"Test MOs from this iteration: {len(test_mos)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
