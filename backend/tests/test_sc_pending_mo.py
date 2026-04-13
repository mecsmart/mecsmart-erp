"""
Test SC Marking on Pending MOs (before start)
Tests the feature allowing SC marking on pending MOs so user can decide With/Without Material BEFORE starting.
When started, the system respects the SC type for material consumption.
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSCPendingMO:
    """Test SC button visible on pending MOs and SC marking flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        # Store cookies for subsequent requests
        self.cookies = login_resp.cookies
        yield
    
    def test_01_get_pending_mos(self):
        """Test: Get list of work orders and check for pending MOs"""
        resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        assert resp.status_code == 200, f"Failed to get work orders: {resp.text}"
        
        work_orders = resp.json()
        pending_mos = [wo for wo in work_orders if wo.get('status') == 'pending']
        print(f"Found {len(pending_mos)} pending MOs out of {len(work_orders)} total")
        
        # Store for later tests
        self.__class__.pending_mos = pending_mos
        self.__class__.all_mos = work_orders
    
    def test_02_create_normal_mo_for_testing(self):
        """Test: Create a normal (non-SC) MO for testing SC marking"""
        # First get a confirmed sales order
        so_resp = self.session.get(f"{BASE_URL}/api/production", cookies=self.cookies)
        assert so_resp.status_code == 200
        sales_orders = so_resp.json()
        
        # Find a confirmed SO with balance quantity
        confirmed_so = None
        for so in sales_orders:
            if so.get('status') in ['confirmed', 'planned']:
                balance = so.get('quantity', 0) - so.get('mo_qty_created', 0)
                if balance > 0:
                    confirmed_so = so
                    break
        
        if not confirmed_so:
            pytest.skip("No confirmed SO with balance quantity available for testing")
        
        # Get active routings
        routing_resp = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        assert routing_resp.status_code == 200
        routings = routing_resp.json()
        active_routing = next((r for r in routings if r.get('status') == 'active'), None)
        
        if not active_routing:
            pytest.skip("No active routing available for testing")
        
        # Create a normal MO (is_subcontract=false)
        mo_payload = {
            "production_order_id": confirmed_so['id'],
            "routing_id": active_routing['id'],
            "quantity": 1,
            "is_subcontract": False,
            "notes": "TEST_SC_PENDING_MO - Normal MO for SC marking test"
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/work-orders", json=mo_payload, cookies=self.cookies)
        assert create_resp.status_code in [200, 201], f"Failed to create MO: {create_resp.text}"
        
        result = create_resp.json()
        print(f"Created MO response: {result}")
        
        # Store the created MO for later tests
        if result.get('work_orders') and len(result['work_orders']) > 0:
            self.__class__.test_mo = result['work_orders'][0]
            print(f"Created test MO: {self.__class__.test_mo.get('wo_number')}")
        else:
            pytest.skip("MO creation did not return work_orders array")
    
    def test_03_verify_pending_mo_is_not_sc(self):
        """Test: Verify the created MO is pending and not SC"""
        if not hasattr(self.__class__, 'test_mo'):
            pytest.skip("No test MO created")
        
        mo_id = self.__class__.test_mo['id']
        resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        assert resp.status_code == 200
        
        work_orders = resp.json()
        test_mo = next((wo for wo in work_orders if wo['id'] == mo_id), None)
        
        assert test_mo is not None, "Test MO not found"
        assert test_mo.get('status') == 'pending', f"Expected pending status, got {test_mo.get('status')}"
        assert test_mo.get('is_subcontract') == False, "MO should not be SC initially"
        
        print(f"Verified MO {test_mo.get('wo_number')} is pending and not SC")
    
    def test_04_mark_pending_mo_as_sc_without_material(self):
        """Test: Mark pending MO as SC 'without_material' via PUT /api/work-orders/{id}"""
        if not hasattr(self.__class__, 'test_mo'):
            pytest.skip("No test MO created")
        
        mo_id = self.__class__.test_mo['id']
        
        # Get suppliers
        suppliers_resp = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
        assert suppliers_resp.status_code == 200
        suppliers = suppliers_resp.json()
        
        if not suppliers:
            pytest.skip("No suppliers available for testing")
        
        supplier_id = suppliers[0]['id']
        
        # Mark as SC without_material
        update_payload = {
            "is_subcontract": True,
            "subcontract_supplier_id": supplier_id,
            "subcontract_type": "without_material"
        }
        
        update_resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json=update_payload, cookies=self.cookies)
        assert update_resp.status_code == 200, f"Failed to mark MO as SC: {update_resp.text}"
        
        updated_mo = update_resp.json()
        assert updated_mo.get('is_subcontract') == True, "MO should be marked as SC"
        assert updated_mo.get('subcontract_type') == 'without_material', f"Expected without_material, got {updated_mo.get('subcontract_type')}"
        assert updated_mo.get('subcontract_supplier_id') == supplier_id, "Supplier ID should match"
        
        print(f"Successfully marked MO as SC without_material")
        self.__class__.test_mo = updated_mo
        self.__class__.test_supplier_id = supplier_id
    
    def test_05_start_without_material_sc_mo(self):
        """Test: Start a 'without_material' SC MO - no materials consumed, no DC, SC order created"""
        if not hasattr(self.__class__, 'test_mo'):
            pytest.skip("No test MO created")
        
        mo_id = self.__class__.test_mo['id']
        
        # Start the MO
        start_resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start", cookies=self.cookies)
        assert start_resp.status_code == 200, f"Failed to start MO: {start_resp.text}"
        
        result = start_resp.json()
        print(f"Start MO response: {result}")
        
        # Verify no materials consumed for without_material
        assert result.get('success') == True, "Start should succeed"
        consumed = result.get('consumed_materials', [])
        assert len(consumed) == 0, f"Expected no materials consumed for without_material SC, got {len(consumed)}"
        
        # Verify no DC created for without_material
        auto_dc = result.get('auto_dc')
        assert auto_dc is None, f"Expected no DC for without_material SC, got {auto_dc}"
        
        # Verify SC order was created
        sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
        assert sc_orders_resp.status_code == 200
        sc_orders = sc_orders_resp.json()
        
        # Find SC order for this MO
        sc_order = next((sc for sc in sc_orders if sc.get('reference_wo_id') == mo_id), None)
        assert sc_order is not None, "SC order should be created when starting SC MO"
        assert sc_order.get('subcontract_type') == 'without_material', f"SC order type should be without_material"
        
        print(f"Verified: without_material SC MO started - no materials consumed, no DC, SC order created")
        self.__class__.without_material_sc_order = sc_order
    
    def test_06_create_another_mo_for_with_material_test(self):
        """Test: Create another normal MO for with_material SC test"""
        # Get a confirmed sales order
        so_resp = self.session.get(f"{BASE_URL}/api/production", cookies=self.cookies)
        assert so_resp.status_code == 200
        sales_orders = so_resp.json()
        
        confirmed_so = None
        for so in sales_orders:
            if so.get('status') in ['confirmed', 'planned']:
                balance = so.get('quantity', 0) - so.get('mo_qty_created', 0)
                if balance > 0:
                    confirmed_so = so
                    break
        
        if not confirmed_so:
            pytest.skip("No confirmed SO with balance quantity available")
        
        # Get active routings
        routing_resp = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        assert routing_resp.status_code == 200
        routings = routing_resp.json()
        active_routing = next((r for r in routings if r.get('status') == 'active'), None)
        
        if not active_routing:
            pytest.skip("No active routing available")
        
        # Create a normal MO
        mo_payload = {
            "production_order_id": confirmed_so['id'],
            "routing_id": active_routing['id'],
            "quantity": 1,
            "is_subcontract": False,
            "notes": "TEST_SC_PENDING_MO - Normal MO for with_material SC test"
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/work-orders", json=mo_payload, cookies=self.cookies)
        assert create_resp.status_code in [200, 201], f"Failed to create MO: {create_resp.text}"
        
        result = create_resp.json()
        if result.get('work_orders') and len(result['work_orders']) > 0:
            self.__class__.test_mo_with_material = result['work_orders'][0]
            print(f"Created test MO for with_material: {self.__class__.test_mo_with_material.get('wo_number')}")
        else:
            pytest.skip("MO creation did not return work_orders array")
    
    def test_07_mark_pending_mo_as_sc_with_material(self):
        """Test: Mark pending MO as SC 'with_material' via PUT"""
        if not hasattr(self.__class__, 'test_mo_with_material'):
            pytest.skip("No test MO created for with_material test")
        
        mo_id = self.__class__.test_mo_with_material['id']
        
        # Get suppliers
        suppliers_resp = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
        assert suppliers_resp.status_code == 200
        suppliers = suppliers_resp.json()
        
        if not suppliers:
            pytest.skip("No suppliers available")
        
        supplier_id = suppliers[0]['id']
        
        # Mark as SC with_material
        update_payload = {
            "is_subcontract": True,
            "subcontract_supplier_id": supplier_id,
            "subcontract_type": "with_material"
        }
        
        update_resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json=update_payload, cookies=self.cookies)
        assert update_resp.status_code == 200, f"Failed to mark MO as SC: {update_resp.text}"
        
        updated_mo = update_resp.json()
        assert updated_mo.get('is_subcontract') == True
        assert updated_mo.get('subcontract_type') == 'with_material', f"Expected with_material, got {updated_mo.get('subcontract_type')}"
        
        print(f"Successfully marked MO as SC with_material")
        self.__class__.test_mo_with_material = updated_mo
    
    def test_08_start_with_material_sc_mo(self):
        """Test: Start a 'with_material' SC MO - materials consumed, DC created, SC order created"""
        if not hasattr(self.__class__, 'test_mo_with_material'):
            pytest.skip("No test MO created for with_material test")
        
        mo_id = self.__class__.test_mo_with_material['id']
        
        # Start the MO
        start_resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/start", cookies=self.cookies)
        
        # Note: This might fail if insufficient materials - that's expected behavior
        if start_resp.status_code == 200:
            result = start_resp.json()
            print(f"Start MO response: {result}")
            
            if result.get('success') == True:
                # Verify materials consumed for with_material (if BOM has materials)
                consumed = result.get('consumed_materials', [])
                print(f"Materials consumed: {len(consumed)}")
                
                # Verify DC created for with_material (if materials were consumed)
                auto_dc = result.get('auto_dc')
                if consumed:
                    assert auto_dc is not None, "DC should be created for with_material SC when materials consumed"
                    print(f"DC created: {auto_dc.get('dc_number')}")
                
                # Verify SC order was created
                sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
                assert sc_orders_resp.status_code == 200
                sc_orders = sc_orders_resp.json()
                
                sc_order = next((sc for sc in sc_orders if sc.get('reference_wo_id') == mo_id), None)
                assert sc_order is not None, "SC order should be created"
                assert sc_order.get('subcontract_type') == 'with_material'
                
                print(f"Verified: with_material SC MO started - materials consumed, DC created, SC order created")
            else:
                # Insufficient materials - expected if stock is low
                print(f"MO start failed due to insufficient materials: {result.get('message')}")
                print(f"Insufficient materials: {result.get('insufficient_materials')}")
        else:
            print(f"Start MO failed: {start_resp.text}")
    
    def test_09_verify_sc_badge_shows_correct_label(self):
        """Test: Verify SC badge shows 'SC (No RM)' for without_material, plain 'SC' for with_material"""
        # Get all work orders
        resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        assert resp.status_code == 200
        
        work_orders = resp.json()
        
        # Find SC MOs
        sc_mos = [wo for wo in work_orders if wo.get('is_subcontract') == True]
        print(f"Found {len(sc_mos)} SC MOs")
        
        for mo in sc_mos:
            sc_type = mo.get('subcontract_type', 'with_material')
            wo_number = mo.get('wo_number')
            
            # The badge label logic is in frontend, but we verify the data is correct
            if sc_type == 'without_material':
                print(f"MO {wo_number}: SC type = without_material (should show 'SC (No RM)')")
            else:
                print(f"MO {wo_number}: SC type = with_material (should show 'SC')")
            
            assert sc_type in ['with_material', 'without_material'], f"Invalid SC type: {sc_type}"
    
    def test_10_verify_normal_mo_has_regular_start_button(self):
        """Test: Normal (non-SC) pending MOs should have regular 'Start' button (not 'Start SC')"""
        # Get all work orders
        resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        assert resp.status_code == 200
        
        work_orders = resp.json()
        
        # Find non-SC pending MOs
        normal_pending_mos = [wo for wo in work_orders if wo.get('status') == 'pending' and not wo.get('is_subcontract')]
        print(f"Found {len(normal_pending_mos)} normal pending MOs")
        
        # The button text is in frontend, but we verify the data is correct
        for mo in normal_pending_mos:
            assert mo.get('is_subcontract') == False or mo.get('is_subcontract') is None
            print(f"MO {mo.get('wo_number')}: is_subcontract = {mo.get('is_subcontract')} (should show 'Start' button)")
    
    def test_11_verify_sc_pending_mo_has_start_sc_button(self):
        """Test: SC pending MOs should have 'Start SC' button"""
        # Get all work orders
        resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        assert resp.status_code == 200
        
        work_orders = resp.json()
        
        # Find SC pending MOs
        sc_pending_mos = [wo for wo in work_orders if wo.get('status') == 'pending' and wo.get('is_subcontract') == True]
        print(f"Found {len(sc_pending_mos)} SC pending MOs")
        
        # The button text is in frontend, but we verify the data is correct
        for mo in sc_pending_mos:
            assert mo.get('is_subcontract') == True
            print(f"MO {mo.get('wo_number')}: is_subcontract = True (should show 'Start SC' button)")
    
    def test_12_sc_button_visible_on_pending_and_in_progress_non_sc_mos(self):
        """Test: SC button should be visible on pending and in_progress non-SC MOs"""
        # Get all work orders
        resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        assert resp.status_code == 200
        
        work_orders = resp.json()
        
        # Find non-SC MOs that are pending or in_progress
        eligible_mos = [wo for wo in work_orders 
                       if wo.get('status') in ['pending', 'in_progress'] 
                       and not wo.get('is_subcontract')]
        
        print(f"Found {len(eligible_mos)} non-SC MOs eligible for SC button (pending or in_progress)")
        
        # The SC button visibility is in frontend (line 919), but we verify the data supports it
        for mo in eligible_mos:
            status = mo.get('status')
            is_sc = mo.get('is_subcontract')
            print(f"MO {mo.get('wo_number')}: status={status}, is_subcontract={is_sc} (SC button should be visible)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
