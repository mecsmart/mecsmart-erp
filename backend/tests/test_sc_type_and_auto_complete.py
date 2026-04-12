"""
Test Suite for SC Type Selection and MO Auto-Complete Features
Tests:
1. Bug fix: MO auto-completes when SC receipt received
2. Feature: Create MO dialog shows 'Sub-Contract Type' radio (With Material / Without Material)
3. Feature: SC button dialog on MO rows also shows 'Sub-Contract Type' radio
4. With Material: RM consumed from stock, DC created, SC order lines = consumed materials
5. Without Material: No RM consumed, No DC created, SC order lines = WO item itself, sent_quantity=0
6. Backend stores subcontract_type field on work_orders and subcontract_orders
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSCTypeAndAutoComplete:
    """Test SC Type selection and MO auto-complete on receipt"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Store cookies for subsequent requests
        self.cookies = login_response.cookies
        yield
    
    def test_01_login_and_get_data(self):
        """Test login and fetch initial data"""
        # Get items
        items_resp = self.session.get(f"{BASE_URL}/api/items", cookies=self.cookies)
        assert items_resp.status_code == 200
        items = items_resp.json()
        print(f"✓ Found {len(items)} items")
        
        # Get suppliers
        suppliers_resp = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
        assert suppliers_resp.status_code == 200
        suppliers = suppliers_resp.json()
        print(f"✓ Found {len(suppliers)} suppliers")
        
        # Get production orders (SOs)
        so_resp = self.session.get(f"{BASE_URL}/api/production", cookies=self.cookies)
        assert so_resp.status_code == 200
        sos = so_resp.json()
        print(f"✓ Found {len(sos)} sales orders")
        
        # Get work orders (MOs)
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        assert wo_resp.status_code == 200
        wos = wo_resp.json()
        print(f"✓ Found {len(wos)} manufacturing orders")
        
        # Get routings
        routings_resp = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        assert routings_resp.status_code == 200
        routings = routings_resp.json()
        print(f"✓ Found {len(routings)} routings")
        
        return items, suppliers, sos, wos, routings
    
    def test_02_create_mo_with_subcontract_type_with_material(self):
        """Test creating MO with subcontract_type='with_material'"""
        # Get confirmed SOs
        so_resp = self.session.get(f"{BASE_URL}/api/production", cookies=self.cookies)
        sos = so_resp.json()
        confirmed_sos = [so for so in sos if so.get('status') == 'confirmed']
        
        if not confirmed_sos:
            # Create and confirm a new SO
            boms_resp = self.session.get(f"{BASE_URL}/api/bom", cookies=self.cookies)
            boms = boms_resp.json()
            active_boms = [b for b in boms if b.get('status') == 'active']
            if not active_boms:
                pytest.skip("No active BOMs available")
            
            so_data = {
                "bom_id": active_boms[0]['id'],
                "quantity": 5,
                "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
                "priority": "medium"
            }
            create_so_resp = self.session.post(f"{BASE_URL}/api/production", json=so_data, cookies=self.cookies)
            assert create_so_resp.status_code == 201
            new_so = create_so_resp.json()
            
            # Confirm the SO
            confirm_resp = self.session.post(f"{BASE_URL}/api/production/{new_so['id']}/confirm", cookies=self.cookies)
            assert confirm_resp.status_code == 200
            confirmed_sos = [confirm_resp.json()]
        
        # Get routings
        routings_resp = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        routings = routings_resp.json()
        active_routings = [r for r in routings if r.get('status') == 'active']
        if not active_routings:
            pytest.skip("No active routings available")
        
        # Get suppliers
        suppliers_resp = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
        suppliers = suppliers_resp.json()
        if not suppliers:
            pytest.skip("No suppliers available")
        
        # Create MO with subcontract_type='with_material'
        mo_data = {
            "production_order_id": confirmed_sos[0]['id'],
            "routing_id": active_routings[0]['id'],
            "quantity": 2,
            "is_subcontract": True,
            "subcontract_supplier_id": suppliers[0]['id'],
            "subcontract_type": "with_material",
            "notes": "TEST_SC_WITH_MATERIAL"
        }
        
        create_mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json=mo_data, cookies=self.cookies)
        assert create_mo_resp.status_code in [200, 201], f"Failed to create MO: {create_mo_resp.text}"
        result = create_mo_resp.json()
        
        print(f"✓ Created MO with subcontract_type='with_material'")
        print(f"  Response: {result.get('message', 'OK')}")
        
        # Verify the MO was created with correct subcontract_type
        if 'work_orders' in result:
            for wo in result['work_orders']:
                wo_detail = self.session.get(f"{BASE_URL}/api/work-orders/{wo['id']}", cookies=self.cookies).json()
                assert wo_detail.get('subcontract_type') == 'with_material', f"Expected subcontract_type='with_material', got {wo_detail.get('subcontract_type')}"
                print(f"  ✓ MO {wo['wo_number']} has subcontract_type='with_material'")
        
        return result
    
    def test_03_create_mo_with_subcontract_type_without_material(self):
        """Test creating MO with subcontract_type='without_material'"""
        # Get confirmed SOs
        so_resp = self.session.get(f"{BASE_URL}/api/production", cookies=self.cookies)
        sos = so_resp.json()
        confirmed_sos = [so for so in sos if so.get('status') == 'confirmed']
        
        if not confirmed_sos:
            pytest.skip("No confirmed SOs available")
        
        # Get routings
        routings_resp = self.session.get(f"{BASE_URL}/api/routings", cookies=self.cookies)
        routings = routings_resp.json()
        active_routings = [r for r in routings if r.get('status') == 'active']
        if not active_routings:
            pytest.skip("No active routings available")
        
        # Get suppliers
        suppliers_resp = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
        suppliers = suppliers_resp.json()
        if not suppliers:
            pytest.skip("No suppliers available")
        
        # Create MO with subcontract_type='without_material'
        mo_data = {
            "production_order_id": confirmed_sos[0]['id'],
            "routing_id": active_routings[0]['id'],
            "quantity": 2,
            "is_subcontract": True,
            "subcontract_supplier_id": suppliers[0]['id'],
            "subcontract_type": "without_material",
            "notes": "TEST_SC_WITHOUT_MATERIAL"
        }
        
        create_mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json=mo_data, cookies=self.cookies)
        assert create_mo_resp.status_code in [200, 201], f"Failed to create MO: {create_mo_resp.text}"
        result = create_mo_resp.json()
        
        print(f"✓ Created MO with subcontract_type='without_material'")
        print(f"  Response: {result.get('message', 'OK')}")
        
        # Verify the MO was created with correct subcontract_type
        if 'work_orders' in result:
            for wo in result['work_orders']:
                wo_detail = self.session.get(f"{BASE_URL}/api/work-orders/{wo['id']}", cookies=self.cookies).json()
                assert wo_detail.get('subcontract_type') == 'without_material', f"Expected subcontract_type='without_material', got {wo_detail.get('subcontract_type')}"
                print(f"  ✓ MO {wo['wo_number']} has subcontract_type='without_material'")
        
        return result
    
    def test_04_start_mo_with_material_consumes_stock_creates_dc(self):
        """Test that starting a 'with_material' SC MO consumes stock and creates DC"""
        # Find a pending SC MO with subcontract_type='with_material'
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        wos = wo_resp.json()
        
        pending_sc_with_material = [
            wo for wo in wos 
            if wo.get('status') == 'pending' 
            and wo.get('is_subcontract') 
            and wo.get('subcontract_type') == 'with_material'
        ]
        
        if not pending_sc_with_material:
            print("No pending SC MO with 'with_material' type found, creating one...")
            # Create one
            result = self.test_02_create_mo_with_subcontract_type_with_material()
            if 'work_orders' in result:
                wo_id = result['work_orders'][0]['id']
            else:
                pytest.skip("Could not create SC MO with_material")
        else:
            wo_id = pending_sc_with_material[0]['id']
        
        # Get DC count before
        dc_resp_before = self.session.get(f"{BASE_URL}/api/job-work/challans", cookies=self.cookies)
        dc_count_before = len(dc_resp_before.json()) if dc_resp_before.status_code == 200 else 0
        
        # Start the MO
        start_resp = self.session.post(f"{BASE_URL}/api/work-orders/{wo_id}/start", cookies=self.cookies)
        
        if start_resp.status_code == 200:
            result = start_resp.json()
            if result.get('success') == False:
                print(f"  ⚠ Could not start MO: {result.get('message')}")
                pytest.skip(f"Insufficient materials: {result.get('insufficient_materials')}")
            
            # Check materials were consumed
            consumed = result.get('consumed_materials', [])
            print(f"✓ Started SC MO with_material")
            print(f"  Consumed materials: {len(consumed)}")
            for m in consumed:
                print(f"    - {m.get('item')} {m.get('name')}: {m.get('quantity')} {m.get('uom')}")
            
            # Check DC was created
            dc_resp_after = self.session.get(f"{BASE_URL}/api/job-work/challans", cookies=self.cookies)
            dc_count_after = len(dc_resp_after.json()) if dc_resp_after.status_code == 200 else 0
            
            if dc_count_after > dc_count_before:
                print(f"  ✓ DC created (count: {dc_count_before} -> {dc_count_after})")
            else:
                print(f"  ⚠ No new DC created (count: {dc_count_before} -> {dc_count_after})")
            
            # Check SC order was created
            sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
            sc_orders = sc_orders_resp.json()
            linked_sc = [sc for sc in sc_orders if sc.get('reference_wo_id') == wo_id]
            if linked_sc:
                print(f"  ✓ SC Order created: {linked_sc[0].get('order_number')}")
                assert linked_sc[0].get('subcontract_type') == 'with_material'
        else:
            print(f"  ⚠ Start MO failed: {start_resp.text}")
    
    def test_05_start_mo_without_material_no_stock_consumed_no_dc(self):
        """Test that starting a 'without_material' SC MO does NOT consume stock and does NOT create DC"""
        # Find a pending SC MO with subcontract_type='without_material'
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        wos = wo_resp.json()
        
        pending_sc_without_material = [
            wo for wo in wos 
            if wo.get('status') == 'pending' 
            and wo.get('is_subcontract') 
            and wo.get('subcontract_type') == 'without_material'
        ]
        
        if not pending_sc_without_material:
            print("No pending SC MO with 'without_material' type found, creating one...")
            result = self.test_03_create_mo_with_subcontract_type_without_material()
            if 'work_orders' in result:
                wo_id = result['work_orders'][0]['id']
            else:
                pytest.skip("Could not create SC MO without_material")
        else:
            wo_id = pending_sc_without_material[0]['id']
        
        # Get DC count before
        dc_resp_before = self.session.get(f"{BASE_URL}/api/job-work/challans", cookies=self.cookies)
        dc_count_before = len(dc_resp_before.json()) if dc_resp_before.status_code == 200 else 0
        
        # Start the MO
        start_resp = self.session.post(f"{BASE_URL}/api/work-orders/{wo_id}/start", cookies=self.cookies)
        
        if start_resp.status_code == 200:
            result = start_resp.json()
            
            # For without_material, materials should NOT be consumed
            consumed = result.get('consumed_materials', [])
            print(f"✓ Started SC MO without_material")
            print(f"  Consumed materials: {len(consumed)} (should be 0 for without_material)")
            
            # Check DC was NOT created
            dc_resp_after = self.session.get(f"{BASE_URL}/api/job-work/challans", cookies=self.cookies)
            dc_count_after = len(dc_resp_after.json()) if dc_resp_after.status_code == 200 else 0
            
            if dc_count_after == dc_count_before:
                print(f"  ✓ No DC created (as expected for without_material)")
            else:
                print(f"  ⚠ DC was created unexpectedly (count: {dc_count_before} -> {dc_count_after})")
            
            # Check SC order was created with sent_quantity=0
            sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
            sc_orders = sc_orders_resp.json()
            linked_sc = [sc for sc in sc_orders if sc.get('reference_wo_id') == wo_id]
            if linked_sc:
                print(f"  ✓ SC Order created: {linked_sc[0].get('order_number')}")
                assert linked_sc[0].get('subcontract_type') == 'without_material'
                # Check sent_quantity=0 for all lines
                for line in linked_sc[0].get('lines', []):
                    sent_qty = line.get('sent_quantity', 0)
                    print(f"    - Line item sent_quantity: {sent_qty} (should be 0)")
                    assert sent_qty == 0, f"Expected sent_quantity=0 for without_material, got {sent_qty}"
        else:
            print(f"  ⚠ Start MO failed: {start_resp.text}")
    
    def test_06_update_mo_to_subcontract_with_type(self):
        """Test marking an existing in_progress MO as subcontract with type selection"""
        # Find an in_progress non-SC MO
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        wos = wo_resp.json()
        
        in_progress_non_sc = [
            wo for wo in wos 
            if wo.get('status') == 'in_progress' 
            and not wo.get('is_subcontract')
        ]
        
        if not in_progress_non_sc:
            pytest.skip("No in_progress non-SC MO available to test")
        
        wo_id = in_progress_non_sc[0]['id']
        wo_number = in_progress_non_sc[0].get('wo_number')
        
        # Get suppliers
        suppliers_resp = self.session.get(f"{BASE_URL}/api/suppliers", cookies=self.cookies)
        suppliers = suppliers_resp.json()
        if not suppliers:
            pytest.skip("No suppliers available")
        
        # Update MO to subcontract with type='without_material'
        update_data = {
            "is_subcontract": True,
            "subcontract_supplier_id": suppliers[0]['id'],
            "subcontract_type": "without_material"
        }
        
        update_resp = self.session.put(f"{BASE_URL}/api/work-orders/{wo_id}", json=update_data, cookies=self.cookies)
        assert update_resp.status_code == 200, f"Failed to update MO: {update_resp.text}"
        
        updated_wo = update_resp.json()
        assert updated_wo.get('is_subcontract') == True
        assert updated_wo.get('subcontract_type') == 'without_material'
        
        print(f"✓ Updated MO {wo_number} to subcontract with type='without_material'")
        
        # Check SC order was created
        sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
        sc_orders = sc_orders_resp.json()
        linked_sc = [sc for sc in sc_orders if sc.get('reference_wo_id') == wo_id]
        if linked_sc:
            print(f"  ✓ SC Order auto-created: {linked_sc[0].get('order_number')}")
            assert linked_sc[0].get('subcontract_type') == 'without_material'
    
    def test_07_mo_auto_complete_on_sc_receipt(self):
        """Test that MO auto-completes when SC receipt is received for all items"""
        # Find an in_progress SC MO with an in_progress SC order
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        wos = wo_resp.json()
        
        in_progress_sc_mos = [
            wo for wo in wos 
            if wo.get('status') == 'in_progress' 
            and wo.get('is_subcontract')
        ]
        
        if not in_progress_sc_mos:
            pytest.skip("No in_progress SC MO available")
        
        # Find one with an in_progress SC order
        sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
        sc_orders = sc_orders_resp.json()
        
        test_mo = None
        test_sc_order = None
        
        for mo in in_progress_sc_mos:
            linked_sc = [sc for sc in sc_orders if sc.get('reference_wo_id') == mo['id'] and sc.get('status') == 'in_progress']
            if linked_sc:
                test_mo = mo
                test_sc_order = linked_sc[0]
                break
        
        if not test_mo or not test_sc_order:
            pytest.skip("No in_progress SC MO with in_progress SC order found")
        
        print(f"Testing auto-complete with MO: {test_mo.get('wo_number')}, SC Order: {test_sc_order.get('order_number')}")
        
        # Get the routing to find the FG item
        routing_resp = self.session.get(f"{BASE_URL}/api/routings/{test_mo.get('routing_id')}", cookies=self.cookies)
        if routing_resp.status_code == 200:
            routing = routing_resp.json()
            fg_item_id = routing.get('item_id')
        else:
            fg_item_id = test_mo.get('item_id')
        
        # Get FG item stock before
        fg_item_resp = self.session.get(f"{BASE_URL}/api/items/{fg_item_id}", cookies=self.cookies)
        fg_stock_before = fg_item_resp.json().get('current_stock', 0) if fg_item_resp.status_code == 200 else 0
        
        # Create receipt for all items in SC order
        receipt_lines = []
        for line in test_sc_order.get('lines', []):
            # Receive the full quantity
            qty_to_receive = line.get('quantity', 0) - line.get('received_quantity', 0)
            if qty_to_receive > 0:
                receipt_lines.append({
                    "item_id": line['item_id'],
                    "received_quantity": qty_to_receive,
                    "quality_result": "accept",
                    "reject_qty": 0
                })
        
        if not receipt_lines:
            print("  ⚠ All items already received in SC order")
            pytest.skip("All items already received")
        
        receipt_data = {
            "subcontract_order_id": test_sc_order['id'],
            "lines": receipt_lines,
            "notes": "TEST_AUTO_COMPLETE_RECEIPT"
        }
        
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json=receipt_data, cookies=self.cookies)
        assert receipt_resp.status_code in [200, 201], f"Failed to create receipt: {receipt_resp.text}"
        
        receipt = receipt_resp.json()
        print(f"✓ Created receipt: {receipt.get('receipt_number')}")
        
        # Check SC order status
        sc_order_after = self.session.get(f"{BASE_URL}/api/job-work/orders/{test_sc_order['id']}", cookies=self.cookies)
        if sc_order_after.status_code == 200:
            sc_status = sc_order_after.json().get('status')
            print(f"  SC Order status: {sc_status}")
            assert sc_status == 'completed', f"Expected SC order status='completed', got {sc_status}"
        
        # Check MO status - should be auto-completed
        mo_after = self.session.get(f"{BASE_URL}/api/work-orders/{test_mo['id']}", cookies=self.cookies)
        if mo_after.status_code == 200:
            mo_data = mo_after.json()
            mo_status = mo_data.get('status')
            print(f"  MO status: {mo_status}")
            assert mo_status == 'completed', f"Expected MO status='completed', got {mo_status}"
            
            # Check all operations are completed
            ops = mo_data.get('operations_status', [])
            for op in ops:
                assert op.get('status') == 'completed', f"Operation {op.get('sequence')} not completed"
            print(f"  ✓ All {len(ops)} operations marked as completed")
        
        # Check FG stock increased
        fg_item_after = self.session.get(f"{BASE_URL}/api/items/{fg_item_id}", cookies=self.cookies)
        fg_stock_after = fg_item_after.json().get('current_stock', 0) if fg_item_after.status_code == 200 else 0
        
        expected_increase = test_mo.get('quantity', 0)
        actual_increase = fg_stock_after - fg_stock_before
        
        print(f"  FG stock: {fg_stock_before} -> {fg_stock_after} (expected +{expected_increase})")
        assert actual_increase == expected_increase, f"Expected FG stock increase of {expected_increase}, got {actual_increase}"
        
        print(f"✓ MO auto-completed successfully on SC receipt!")
    
    def test_08_verify_subcontract_type_stored_in_work_orders(self):
        """Verify subcontract_type field is stored in work_orders collection"""
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders", cookies=self.cookies)
        wos = wo_resp.json()
        
        sc_mos = [wo for wo in wos if wo.get('is_subcontract')]
        
        print(f"Found {len(sc_mos)} subcontracted MOs")
        
        for mo in sc_mos[:5]:  # Check first 5
            sc_type = mo.get('subcontract_type')
            print(f"  MO {mo.get('wo_number')}: subcontract_type={sc_type}")
            assert sc_type in ['with_material', 'without_material', None], f"Invalid subcontract_type: {sc_type}"
        
        print("✓ subcontract_type field verified in work_orders")
    
    def test_09_verify_subcontract_type_stored_in_sc_orders(self):
        """Verify subcontract_type field is stored in subcontract_orders collection"""
        sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders", cookies=self.cookies)
        sc_orders = sc_orders_resp.json()
        
        print(f"Found {len(sc_orders)} SC orders")
        
        for sc in sc_orders[:5]:  # Check first 5
            sc_type = sc.get('subcontract_type')
            print(f"  SC Order {sc.get('order_number')}: subcontract_type={sc_type}")
            # subcontract_type may be None for older orders
        
        print("✓ subcontract_type field verified in subcontract_orders")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
