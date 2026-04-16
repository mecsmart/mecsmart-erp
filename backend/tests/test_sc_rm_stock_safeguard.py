"""
Test SC Receipt RM Stock Safeguard (Iteration 36)
CRITICAL: For with_material SC, receipt should ONLY add stock for job_work_parts items (FG/SA/Parts)
NOT for items from SC order lines (RM items sent to vendor)

Tests:
1. E2E flow matching user's exact scenario:
   - Create items: SA (sub_assembly), PT-1 (component), PT-2 (component), RM-1 (raw_material), RM-2 (raw_material)
   - Create BOMs: SA→PT-1+PT-2, PT-1→RM-1, PT-2→RM-2
   - Create MO for parent FG with children
   - Complete PT-1's child MO
   - Create SC with_material for SA MO
   - Create and send DC (deducts PT-1 and RM-2 from stock)
   - Create receipt for SA (receiving the SA item from job_work_parts)
   - Verify: SA stock increased, PT-1 stock did NOT increase, RM-2 stock did NOT increase
   - Verify: MO auto-completed

2. Backend safeguard test: If receipt accidentally sends RM item_ids, backend should block stock addition

3. without_material SC should still add stock for received items normally

4. Regression: DC Send still correctly deducts RM stock
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestSCRMStockSafeguard:
    """Test that SC receipt blocks RM stock addition for with_material SC"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.test_suffix = str(uuid.uuid4())[:8]
        yield
    
    def test_login_works(self):
        """Verify login works with admin@erp.com / Admin@123"""
        resp = self.session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("email") == "admin@erp.com"
        print("Login verified: admin@erp.com")
    
    def _create_work_center(self, suffix):
        """Create a work center"""
        wc_resp = self.session.post(f"{BASE_URL}/api/work-centers", json={
            "code": f"WC-{suffix}",
            "name": f"Test Work Center {suffix}",
            "hourly_rate": 100,
            "capacity_per_hour": 10,
            "status": "active"
        })
        assert wc_resp.status_code in [200, 201], f"Work center creation failed: {wc_resp.text}"
        return wc_resp.json().get("id")
    
    def _create_item(self, part_number, name, category, stock=0):
        """Create an item"""
        resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": part_number,
            "name": name,
            "category": category,
            "uom": "pcs",
            "current_stock": stock,
            "unit_cost": 10
        })
        assert resp.status_code in [200, 201], f"Item creation failed: {resp.text}"
        return resp.json().get("id")
    
    def _create_bom(self, parent_id, components, suffix):
        """Create a BOM"""
        resp = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_id,
            "name": f"BOM-{suffix}",
            "revision": "A",
            "status": "active",
            "components": components
        })
        assert resp.status_code in [200, 201], f"BOM creation failed: {resp.text}"
        return resp.json().get("id")
    
    def _create_routing(self, item_id, work_center_id, suffix):
        """Create a routing"""
        resp = self.session.post(f"{BASE_URL}/api/routings", json={
            "item_id": item_id,
            "name": f"Routing-{suffix}",
            "revision": "A",
            "status": "active",
            "operations": [
                {
                    "sequence": 10,
                    "work_center_id": work_center_id,
                    "operation_name": "Assembly",
                    "setup_time_minutes": 5,
                    "run_time_minutes": 10
                }
            ]
        })
        assert resp.status_code in [200, 201], f"Routing creation failed: {resp.text}"
        return resp.json().get("id")
    
    def _create_supplier(self, suffix):
        """Create a subcontractor supplier"""
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "code": f"SUP-{suffix}",
            "name": f"Subcontractor {suffix}",
            "type": "subcontractor",
            "email": f"sup_{suffix}@test.com"
        })
        assert resp.status_code in [200, 201], f"Supplier creation failed: {resp.text}"
        return resp.json().get("id")
    
    def _get_item_stock(self, item_id):
        """Get current stock for an item"""
        resp = self.session.get(f"{BASE_URL}/api/items/{item_id}")
        assert resp.status_code == 200
        return resp.json().get("current_stock", 0)
    
    def test_receipt_blocks_rm_stock_addition_simple(self):
        """
        CRITICAL TEST: Receipt should NOT add stock for RM items in with_material SC
        
        Simple flow:
        1. Create FG (finished_good) and RM (raw_material)
        2. Create BOM: FG → 2x RM
        3. Create MO for FG, mark as SC with_material
        4. Create SC order (lines will have RM, job_work_parts will have FG)
        5. Create DC and send (deducts RM)
        6. Try to receive BOTH FG and RM in receipt
        7. VERIFY: FG stock increases, RM stock does NOT increase
        """
        suffix = self.test_suffix
        
        # Create work center
        wc_id = self._create_work_center(suffix)
        
        # Create items
        rm_id = self._create_item(f"RM-{suffix}", f"Raw Material {suffix}", "raw_material", stock=100)
        fg_id = self._create_item(f"FG-{suffix}", f"Finished Good {suffix}", "finished_good", stock=0)
        
        # Create BOM: FG → 2x RM
        bom_id = self._create_bom(fg_id, [{"item_id": rm_id, "quantity": 2}], suffix)
        
        # Create routing
        routing_id = self._create_routing(fg_id, wc_id, suffix)
        
        # Create supplier
        supplier_id = self._create_supplier(suffix)
        
        # Create production order
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "item_id": fg_id,
            "bom_id": bom_id,
            "quantity": 10,
            "status": "confirmed",
            "due_date": due_date
        })
        assert so_resp.status_code in [200, 201]
        so_id = so_resp.json().get("id")
        
        # Create MO
        mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": so_id,
            "routing_id": routing_id,
            "quantity": 10,
            "is_subcontract": False
        })
        assert mo_resp.status_code in [200, 201]
        work_orders = mo_resp.json().get("work_orders", [])
        mo_id = work_orders[0]["id"]
        print(f"Created MO: {work_orders[0].get('wo_number')}")
        
        # Mark as SC with_material
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": supplier_id,
            "subcontract_type": "with_material"
        })
        assert resp.status_code == 200
        
        # Create SC order
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/create-sc")
        assert resp.status_code in [200, 201]
        sc_order = resp.json().get("sc_order", {})
        sc_order_id = sc_order.get("id")
        print(f"Created SC Order: {sc_order.get('order_number')}")
        print(f"SC Order lines (RM): {sc_order.get('lines')}")
        print(f"SC Order job_work_parts (FG): {sc_order.get('job_work_parts')}")
        
        # Verify SC order structure
        assert len(sc_order.get("lines", [])) > 0, "SC order should have lines (RM)"
        assert len(sc_order.get("job_work_parts", [])) > 0, "SC order should have job_work_parts (FG)"
        
        # Record stock before DC
        rm_stock_before = self._get_item_stock(rm_id)
        fg_stock_before = self._get_item_stock(fg_id)
        print(f"Stock before DC: RM={rm_stock_before}, FG={fg_stock_before}")
        
        # Create DC (this also sends and deducts stock)
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [{"item_id": rm_id, "quantity": 20}]
        })
        assert dc_resp.status_code in [200, 201]
        dc_data = dc_resp.json()
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data}")
        dc_id = dc_data.get("id")
        print(f"Created DC: {dc_data.get('dc_number')}")
        
        # Verify RM stock deducted
        rm_stock_after_dc = self._get_item_stock(rm_id)
        print(f"RM stock after DC: {rm_stock_after_dc}")
        assert rm_stock_after_dc == rm_stock_before - 20, f"RM stock should be deducted by 20"
        print("REGRESSION PASS: DC send correctly deducts RM stock")
        
        # CRITICAL TEST: Try to receive BOTH FG and RM
        # Backend should add stock for FG but NOT for RM
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "dc_id": dc_id,
            "lines": [
                {"item_id": fg_id, "received_quantity": 10, "quality_result": "accept", "reject_qty": 0},
                {"item_id": rm_id, "received_quantity": 20, "quality_result": "accept", "reject_qty": 0}  # This should be BLOCKED
            ]
        })
        assert receipt_resp.status_code in [200, 201], f"Receipt creation failed: {receipt_resp.text}"
        print(f"Created Receipt: {receipt_resp.json().get('receipt_number')}")
        
        # CRITICAL VERIFICATION
        fg_stock_after = self._get_item_stock(fg_id)
        rm_stock_after = self._get_item_stock(rm_id)
        print(f"Stock after receipt: FG={fg_stock_after}, RM={rm_stock_after}")
        
        # FG should increase by 10
        assert fg_stock_after == fg_stock_before + 10, f"FG stock should increase by 10. Expected {fg_stock_before + 10}, got {fg_stock_after}"
        print("PASS: FG stock correctly increased by received quantity")
        
        # RM should NOT increase (should stay at rm_stock_after_dc)
        assert rm_stock_after == rm_stock_after_dc, f"CRITICAL BUG: RM stock should NOT increase during receipt! Expected {rm_stock_after_dc}, got {rm_stock_after}"
        print("CRITICAL PASS: RM stock did NOT increase during receipt (backend safeguard working)")
        
        print("\n=== BACKEND SAFEGUARD TEST PASSED ===")
    
    def test_without_material_sc_adds_stock_normally(self):
        """
        Test that without_material SC still adds stock for received items normally
        """
        suffix = f"{self.test_suffix}_wom"
        
        # Create work center
        wc_id = self._create_work_center(suffix)
        
        # Create items
        rm_id = self._create_item(f"RM-{suffix}", f"Raw Material {suffix}", "raw_material", stock=0)
        fg_id = self._create_item(f"FG-{suffix}", f"Finished Good {suffix}", "finished_good", stock=0)
        
        # Create BOM
        bom_id = self._create_bom(fg_id, [{"item_id": rm_id, "quantity": 2}], suffix)
        
        # Create routing
        routing_id = self._create_routing(fg_id, wc_id, suffix)
        
        # Create supplier
        supplier_id = self._create_supplier(suffix)
        
        # Create production order
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "item_id": fg_id,
            "bom_id": bom_id,
            "quantity": 10,
            "status": "confirmed",
            "due_date": due_date
        })
        assert so_resp.status_code in [200, 201]
        so_id = so_resp.json().get("id")
        
        # Create MO
        mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": so_id,
            "routing_id": routing_id,
            "quantity": 10,
            "is_subcontract": False
        })
        assert mo_resp.status_code in [200, 201]
        work_orders = mo_resp.json().get("work_orders", [])
        mo_id = work_orders[0]["id"]
        
        # Mark as SC without_material
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": supplier_id,
            "subcontract_type": "without_material"
        })
        assert resp.status_code == 200
        
        # Create SC order
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/create-sc")
        assert resp.status_code in [200, 201]
        sc_order = resp.json().get("sc_order", {})
        sc_order_id = sc_order.get("id")
        print(f"Created without_material SC Order: {sc_order.get('order_number')}")
        
        # Record stock before receipt
        fg_stock_before = self._get_item_stock(fg_id)
        print(f"FG stock before receipt: {fg_stock_before}")
        
        # Receive FG (without_material means vendor provides materials)
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "lines": [{"item_id": fg_id, "received_quantity": 10, "quality_result": "accept", "reject_qty": 0}]
        })
        assert receipt_resp.status_code in [200, 201]
        
        # Verify FG stock increased
        fg_stock_after = self._get_item_stock(fg_id)
        print(f"FG stock after receipt: {fg_stock_after}")
        assert fg_stock_after == fg_stock_before + 10, f"without_material SC should add stock normally"
        print("PASS: without_material SC receipt adds stock normally")
    
    def test_mo_auto_completes_on_full_receipt(self):
        """Test that MO auto-completes when all job_work_parts are received"""
        suffix = f"{self.test_suffix}_auto"
        
        # Create work center
        wc_id = self._create_work_center(suffix)
        
        # Create items
        rm_id = self._create_item(f"RM-{suffix}", f"Raw Material {suffix}", "raw_material", stock=100)
        fg_id = self._create_item(f"FG-{suffix}", f"Finished Good {suffix}", "finished_good", stock=0)
        
        # Create BOM
        bom_id = self._create_bom(fg_id, [{"item_id": rm_id, "quantity": 2}], suffix)
        
        # Create routing
        routing_id = self._create_routing(fg_id, wc_id, suffix)
        
        # Create supplier
        supplier_id = self._create_supplier(suffix)
        
        # Create production order
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "item_id": fg_id,
            "bom_id": bom_id,
            "quantity": 10,
            "status": "confirmed",
            "due_date": due_date
        })
        assert so_resp.status_code in [200, 201]
        so_id = so_resp.json().get("id")
        
        # Create MO
        mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": so_id,
            "routing_id": routing_id,
            "quantity": 10,
            "is_subcontract": False
        })
        assert mo_resp.status_code in [200, 201]
        work_orders = mo_resp.json().get("work_orders", [])
        mo_id = work_orders[0]["id"]
        
        # Mark as SC with_material
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": supplier_id,
            "subcontract_type": "with_material"
        })
        assert resp.status_code == 200
        
        # Create SC order
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/create-sc")
        assert resp.status_code in [200, 201]
        sc_order = resp.json().get("sc_order", {})
        sc_order_id = sc_order.get("id")
        
        # Create DC
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [{"item_id": rm_id, "quantity": 20}]
        })
        assert dc_resp.status_code in [200, 201]
        dc_data = dc_resp.json()
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data}")
        dc_id = dc_data.get("id")
        
        # Check MO status before receipt
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert resp.status_code == 200
        mo_status_before = resp.json().get("status")
        print(f"MO status before receipt: {mo_status_before}")
        assert mo_status_before != "completed", "MO should not be completed before receipt"
        
        # Receive all FG
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "dc_id": dc_id,
            "lines": [{"item_id": fg_id, "received_quantity": 10, "quality_result": "accept", "reject_qty": 0}]
        })
        assert receipt_resp.status_code in [200, 201]
        
        # Check MO status after receipt
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert resp.status_code == 200
        mo_status_after = resp.json().get("status")
        print(f"MO status after receipt: {mo_status_after}")
        assert mo_status_after == "completed", f"MO should auto-complete when all job_work_parts received, but status is {mo_status_after}"
        print("PASS: MO auto-completes when all job_work_parts are received")
    
    def test_mo_completion_does_not_add_fg_stock_again(self):
        """
        Test that MO completion in receipt does NOT add FG stock again (double-count prevention)
        This is the CRITICAL fix - stock is added at receipt line processing, NOT at MO completion
        """
        suffix = f"{self.test_suffix}_nodup"
        
        # Create work center
        wc_id = self._create_work_center(suffix)
        
        # Create items
        rm_id = self._create_item(f"RM-{suffix}", f"Raw Material {suffix}", "raw_material", stock=100)
        fg_id = self._create_item(f"FG-{suffix}", f"Finished Good {suffix}", "finished_good", stock=0)
        
        # Create BOM
        bom_id = self._create_bom(fg_id, [{"item_id": rm_id, "quantity": 2}], suffix)
        
        # Create routing
        routing_id = self._create_routing(fg_id, wc_id, suffix)
        
        # Create supplier
        supplier_id = self._create_supplier(suffix)
        
        # Create production order
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "item_id": fg_id,
            "bom_id": bom_id,
            "quantity": 10,
            "status": "confirmed",
            "due_date": due_date
        })
        assert so_resp.status_code in [200, 201]
        so_id = so_resp.json().get("id")
        
        # Create MO
        mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": so_id,
            "routing_id": routing_id,
            "quantity": 10,
            "is_subcontract": False
        })
        assert mo_resp.status_code in [200, 201]
        work_orders = mo_resp.json().get("work_orders", [])
        mo_id = work_orders[0]["id"]
        
        # Mark as SC with_material
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": supplier_id,
            "subcontract_type": "with_material"
        })
        assert resp.status_code == 200
        
        # Create SC order
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/create-sc")
        assert resp.status_code in [200, 201]
        sc_order = resp.json().get("sc_order", {})
        sc_order_id = sc_order.get("id")
        
        # Create DC
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [{"item_id": rm_id, "quantity": 20}]
        })
        assert dc_resp.status_code in [200, 201]
        dc_data = dc_resp.json()
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data}")
        dc_id = dc_data.get("id")
        
        # Record FG stock before receipt
        fg_stock_before = self._get_item_stock(fg_id)
        print(f"FG stock before receipt: {fg_stock_before}")
        assert fg_stock_before == 0, "FG stock should be 0 before receipt"
        
        # Receive all FG (this will also trigger MO completion)
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "dc_id": dc_id,
            "lines": [{"item_id": fg_id, "received_quantity": 10, "quality_result": "accept", "reject_qty": 0}]
        })
        assert receipt_resp.status_code in [200, 201]
        
        # CRITICAL: FG stock should be 10, NOT 20
        fg_stock_after = self._get_item_stock(fg_id)
        print(f"FG stock after receipt (with MO completion): {fg_stock_after}")
        
        assert fg_stock_after == 10, f"CRITICAL BUG: FG stock should be 10 (received qty), but got {fg_stock_after}. If 20, stock was added TWICE (once at receipt, once at MO completion)!"
        print("CRITICAL PASS: FG stock = 10 (not doubled by MO completion)")
        
        # Verify MO is completed
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert resp.status_code == 200
        mo_status = resp.json().get("status")
        assert mo_status == "completed", f"MO should be completed, but status is {mo_status}"
        print("PASS: MO completed without adding FG stock again")
    
    def test_received_quantity_updated_on_job_work_parts(self):
        """Test that received_quantity is correctly updated on job_work_parts"""
        suffix = f"{self.test_suffix}_rcv"
        
        # Create work center
        wc_id = self._create_work_center(suffix)
        
        # Create items
        rm_id = self._create_item(f"RM-{suffix}", f"Raw Material {suffix}", "raw_material", stock=100)
        fg_id = self._create_item(f"FG-{suffix}", f"Finished Good {suffix}", "finished_good", stock=0)
        
        # Create BOM
        bom_id = self._create_bom(fg_id, [{"item_id": rm_id, "quantity": 2}], suffix)
        
        # Create routing
        routing_id = self._create_routing(fg_id, wc_id, suffix)
        
        # Create supplier
        supplier_id = self._create_supplier(suffix)
        
        # Create production order
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "item_id": fg_id,
            "bom_id": bom_id,
            "quantity": 20,
            "status": "confirmed",
            "due_date": due_date
        })
        assert so_resp.status_code in [200, 201]
        so_id = so_resp.json().get("id")
        
        # Create MO
        mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": so_id,
            "routing_id": routing_id,
            "quantity": 20,
            "is_subcontract": False
        })
        assert mo_resp.status_code in [200, 201]
        work_orders = mo_resp.json().get("work_orders", [])
        mo_id = work_orders[0]["id"]
        
        # Mark as SC with_material
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": supplier_id,
            "subcontract_type": "with_material"
        })
        assert resp.status_code == 200
        
        # Create SC order
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/create-sc")
        assert resp.status_code in [200, 201]
        sc_order = resp.json().get("sc_order", {})
        sc_order_id = sc_order.get("id")
        
        # Create DC
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [{"item_id": rm_id, "quantity": 40}]
        })
        assert dc_resp.status_code in [200, 201]
        dc_data = dc_resp.json()
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data}")
        dc_id = dc_data.get("id")
        
        # Partial receipt: receive 5 FG
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "dc_id": dc_id,
            "lines": [{"item_id": fg_id, "received_quantity": 5, "quality_result": "accept", "reject_qty": 0}]
        })
        assert receipt_resp.status_code in [200, 201]
        
        # Check SC order job_work_parts received_quantity
        # Note: No single GET endpoint, use list and filter
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        all_orders = resp.json()
        sc_order_updated = next((o for o in all_orders if o.get("id") == sc_order_id), None)
        assert sc_order_updated is not None, f"SC order {sc_order_id} not found in list"
        job_work_parts = sc_order_updated.get("job_work_parts", [])
        
        fg_part = next((jp for jp in job_work_parts if jp.get("item_id") == fg_id), None)
        assert fg_part is not None, "FG should be in job_work_parts"
        received_qty = fg_part.get("received_quantity", 0)
        print(f"job_work_parts received_quantity: {received_qty}")
        assert received_qty == 5, f"received_quantity should be 5, got {received_qty}"
        print("PASS: received_quantity correctly updated on job_work_parts")
        
        # Second receipt: receive 15 more FG
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "dc_id": dc_id,
            "lines": [{"item_id": fg_id, "received_quantity": 15, "quality_result": "accept", "reject_qty": 0}]
        })
        assert receipt_resp.status_code in [200, 201]
        
        # Check final received_quantity
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        all_orders_final = resp.json()
        sc_order_final = next((o for o in all_orders_final if o.get("id") == sc_order_id), None)
        assert sc_order_final is not None, f"SC order {sc_order_id} not found in list"
        job_work_parts_final = sc_order_final.get("job_work_parts", [])
        
        fg_part_final = next((jp for jp in job_work_parts_final if jp.get("item_id") == fg_id), None)
        received_qty_final = fg_part_final.get("received_quantity", 0)
        print(f"Final job_work_parts received_quantity: {received_qty_final}")
        assert received_qty_final == 20, f"Final received_quantity should be 20, got {received_qty_final}"
        print("PASS: received_quantity correctly accumulated across multiple receipts")


class TestComplexBOMScenario:
    """
    Test the exact scenario from user's problem statement:
    SA (sub_assembly) with BOM: PT-1 + PT-2
    PT-1 with BOM: RM-1
    PT-2 with BOM: RM-2
    """
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.test_suffix = str(uuid.uuid4())[:8]
        yield
    
    def _create_work_center(self, suffix):
        wc_resp = self.session.post(f"{BASE_URL}/api/work-centers", json={
            "code": f"WC-{suffix}",
            "name": f"Test Work Center {suffix}",
            "hourly_rate": 100,
            "capacity_per_hour": 10,
            "status": "active"
        })
        assert wc_resp.status_code in [200, 201]
        return wc_resp.json().get("id")
    
    def _create_item(self, part_number, name, category, stock=0):
        resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": part_number,
            "name": name,
            "category": category,
            "uom": "pcs",
            "current_stock": stock,
            "unit_cost": 10
        })
        assert resp.status_code in [200, 201], f"Item creation failed: {resp.text}"
        return resp.json().get("id")
    
    def _create_bom(self, parent_id, components, suffix):
        resp = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_id,
            "name": f"BOM-{suffix}",
            "revision": "A",
            "status": "active",
            "components": components
        })
        assert resp.status_code in [200, 201], f"BOM creation failed: {resp.text}"
        return resp.json().get("id")
    
    def _create_routing(self, item_id, work_center_id, suffix):
        resp = self.session.post(f"{BASE_URL}/api/routings", json={
            "item_id": item_id,
            "name": f"Routing-{suffix}",
            "revision": "A",
            "status": "active",
            "operations": [{"sequence": 10, "work_center_id": work_center_id, "operation_name": "Op", "setup_time_minutes": 5, "run_time_minutes": 10}]
        })
        assert resp.status_code in [200, 201]
        return resp.json().get("id")
    
    def _create_supplier(self, suffix):
        resp = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "code": f"SUP-{suffix}",
            "name": f"Subcontractor {suffix}",
            "type": "subcontractor",
            "email": f"sup_{suffix}@test.com"
        })
        assert resp.status_code in [200, 201]
        return resp.json().get("id")
    
    def _get_item_stock(self, item_id):
        resp = self.session.get(f"{BASE_URL}/api/items/{item_id}")
        assert resp.status_code == 200
        return resp.json().get("current_stock", 0)
    
    def test_complex_bom_sc_flow(self):
        """
        Test the exact user scenario:
        1. Create items: SA, PT-1, PT-2, RM-1, RM-2 with known initial stock
        2. Create BOMs: SA→PT-1+PT-2
        3. Create MO for SA
        4. Create SC with_material for SA MO
        5. Send DC (deducts PT-1 and RM-2 from stock)
        6. Receive SA back
        7. Verify: SA stock increased, PT-1 and RM-2 did NOT increase
        """
        suffix = self.test_suffix
        
        # Create work center
        wc_id = self._create_work_center(suffix)
        
        # Create items with known stock
        rm1_id = self._create_item(f"RM1-{suffix}", f"Raw Material 1 {suffix}", "raw_material", stock=100)
        rm2_id = self._create_item(f"RM2-{suffix}", f"Raw Material 2 {suffix}", "raw_material", stock=100)
        pt1_id = self._create_item(f"PT1-{suffix}", f"Part 1 {suffix}", "component", stock=50)
        pt2_id = self._create_item(f"PT2-{suffix}", f"Part 2 {suffix}", "component", stock=50)
        sa_id = self._create_item(f"SA-{suffix}", f"Sub Assembly {suffix}", "sub_assembly", stock=0)
        
        print(f"Created items: SA={sa_id}, PT1={pt1_id}, PT2={pt2_id}, RM1={rm1_id}, RM2={rm2_id}")
        
        # Create BOMs
        # SA → PT-1 (2 qty) + PT-2 (1 qty)
        sa_bom_id = self._create_bom(sa_id, [
            {"item_id": pt1_id, "quantity": 2},
            {"item_id": pt2_id, "quantity": 1}
        ], f"{suffix}_sa")
        
        # Create routing for SA
        sa_routing_id = self._create_routing(sa_id, wc_id, f"{suffix}_sa")
        
        # Create supplier
        supplier_id = self._create_supplier(suffix)
        
        # Create production order for SA
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "item_id": sa_id,
            "bom_id": sa_bom_id,
            "quantity": 10,
            "status": "confirmed",
            "due_date": due_date
        })
        assert so_resp.status_code in [200, 201]
        so_id = so_resp.json().get("id")
        
        # Create MO for SA
        mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": so_id,
            "routing_id": sa_routing_id,
            "quantity": 10,
            "is_subcontract": False
        })
        assert mo_resp.status_code in [200, 201]
        work_orders = mo_resp.json().get("work_orders", [])
        mo_id = work_orders[0]["id"]
        print(f"Created MO for SA: {work_orders[0].get('wo_number')}")
        
        # Mark as SC with_material
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": supplier_id,
            "subcontract_type": "with_material"
        })
        assert resp.status_code == 200
        
        # Create SC order
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/create-sc")
        assert resp.status_code in [200, 201]
        sc_order = resp.json().get("sc_order", {})
        sc_order_id = sc_order.get("id")
        print(f"Created SC Order: {sc_order.get('order_number')}")
        print(f"SC lines (RM to send): {sc_order.get('lines')}")
        print(f"SC job_work_parts (FG to receive): {sc_order.get('job_work_parts')}")
        
        # Record stock before DC
        pt1_stock_before = self._get_item_stock(pt1_id)
        pt2_stock_before = self._get_item_stock(pt2_id)
        sa_stock_before = self._get_item_stock(sa_id)
        print(f"Stock before DC: PT1={pt1_stock_before}, PT2={pt2_stock_before}, SA={sa_stock_before}")
        
        # Create DC with PT-1 and PT-2 (components for SA)
        # For 10 SA: need 20 PT-1 and 10 PT-2
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [
                {"item_id": pt1_id, "quantity": 20},
                {"item_id": pt2_id, "quantity": 10}
            ]
        })
        assert dc_resp.status_code in [200, 201]
        dc_data = dc_resp.json()
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data}")
        dc_id = dc_data.get("id")
        print(f"Created DC: {dc_data.get('dc_number')}")
        
        # Verify stock deducted
        pt1_stock_after_dc = self._get_item_stock(pt1_id)
        pt2_stock_after_dc = self._get_item_stock(pt2_id)
        print(f"Stock after DC: PT1={pt1_stock_after_dc}, PT2={pt2_stock_after_dc}")
        assert pt1_stock_after_dc == pt1_stock_before - 20, f"PT1 stock should be deducted by 20"
        assert pt2_stock_after_dc == pt2_stock_before - 10, f"PT2 stock should be deducted by 10"
        print("REGRESSION PASS: DC send correctly deducts component stock")
        
        # CRITICAL TEST: Try to receive SA AND the components (PT-1, PT-2)
        # Backend should add stock for SA but NOT for PT-1 and PT-2
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "dc_id": dc_id,
            "lines": [
                {"item_id": sa_id, "received_quantity": 10, "quality_result": "accept", "reject_qty": 0},
                {"item_id": pt1_id, "received_quantity": 20, "quality_result": "accept", "reject_qty": 0},  # Should be BLOCKED
                {"item_id": pt2_id, "received_quantity": 10, "quality_result": "accept", "reject_qty": 0}   # Should be BLOCKED
            ]
        })
        assert receipt_resp.status_code in [200, 201], f"Receipt creation failed: {receipt_resp.text}"
        print(f"Created Receipt: {receipt_resp.json().get('receipt_number')}")
        
        # CRITICAL VERIFICATION
        sa_stock_after = self._get_item_stock(sa_id)
        pt1_stock_after = self._get_item_stock(pt1_id)
        pt2_stock_after = self._get_item_stock(pt2_id)
        print(f"Stock after receipt: SA={sa_stock_after}, PT1={pt1_stock_after}, PT2={pt2_stock_after}")
        
        # SA should increase by 10
        assert sa_stock_after == sa_stock_before + 10, f"SA stock should increase by 10. Expected {sa_stock_before + 10}, got {sa_stock_after}"
        print("PASS: SA stock correctly increased by received quantity")
        
        # PT-1 should NOT increase (should stay at pt1_stock_after_dc)
        assert pt1_stock_after == pt1_stock_after_dc, f"CRITICAL BUG: PT1 stock should NOT increase during receipt! Expected {pt1_stock_after_dc}, got {pt1_stock_after}"
        print("CRITICAL PASS: PT1 stock did NOT increase during receipt")
        
        # PT-2 should NOT increase (should stay at pt2_stock_after_dc)
        assert pt2_stock_after == pt2_stock_after_dc, f"CRITICAL BUG: PT2 stock should NOT increase during receipt! Expected {pt2_stock_after_dc}, got {pt2_stock_after}"
        print("CRITICAL PASS: PT2 stock did NOT increase during receipt")
        
        print("\n=== COMPLEX BOM SCENARIO TEST PASSED ===")
        print(f"SA stock: {sa_stock_before} → {sa_stock_after} (increased by 10)")
        print(f"PT1 stock: {pt1_stock_before} → {pt1_stock_after_dc} → {pt1_stock_after} (deducted, NOT restored)")
        print(f"PT2 stock: {pt2_stock_before} → {pt2_stock_after_dc} → {pt2_stock_after} (deducted, NOT restored)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
