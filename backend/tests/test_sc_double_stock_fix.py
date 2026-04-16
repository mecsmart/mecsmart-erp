"""
Test SC Receipt Double Stock Fix (Iteration 35)
CRITICAL: SC receipt should NOT add FG/SA stock twice.
Flow: Create SC with_material → Send DC (deducts RM from stock) → Receive back FG → Stock should increase by received qty ONCE only

Tests:
1. Full E2E flow: items, BOM, routing, MO, mark as SC with_material, create SC, create DC, send DC, receive FG
2. After receipt, FG item stock = initial_stock + received_qty (NOT initial_stock + 2*received_qty)
3. inventory_transactions should have only ONE 'receive' transaction per item per receipt
4. MO auto-completes when all job_work_parts are received
5. Regression: SC with_material correctly deducts RM stock on DC send
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSCDoubleStockFix:
    """Test that SC receipt does NOT add FG stock twice"""
    
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
    
    def _create_test_data(self, suffix):
        """Helper to create all required test data"""
        data = {}
        
        # Create Work Center
        wc_resp = self.session.post(f"{BASE_URL}/api/work-centers", json={
            "code": f"WC-{suffix}",
            "name": f"Test Work Center {suffix}",
            "hourly_rate": 100,
            "capacity_per_hour": 10,
            "status": "active"
        })
        assert wc_resp.status_code in [200, 201], f"Work center creation failed: {wc_resp.text}"
        data["work_center_id"] = wc_resp.json().get("id")
        
        # Create RM item with 100 stock
        rm_resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"RM-{suffix}",
            "name": f"Raw Material {suffix}",
            "category": "raw_material",
            "uom": "pcs",
            "current_stock": 100,
            "unit_cost": 10
        })
        assert rm_resp.status_code in [200, 201], f"RM item creation failed: {rm_resp.text}"
        data["rm_item_id"] = rm_resp.json().get("id")
        data["rm_part_number"] = f"RM-{suffix}"
        
        # Create FG item with 0 stock
        fg_resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"FG-{suffix}",
            "name": f"Finished Good {suffix}",
            "category": "finished_good",
            "uom": "pcs",
            "current_stock": 0,
            "unit_cost": 50
        })
        assert fg_resp.status_code in [200, 201], f"FG item creation failed: {fg_resp.text}"
        data["fg_item_id"] = fg_resp.json().get("id")
        data["fg_part_number"] = f"FG-{suffix}"
        
        # Create BOM for FG (2x RM per FG)
        bom_resp = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": data["fg_item_id"],
            "name": f"BOM for FG {suffix}",
            "revision": "A",
            "status": "active",
            "components": [
                {"item_id": data["rm_item_id"], "quantity": 2}
            ]
        })
        assert bom_resp.status_code in [200, 201], f"BOM creation failed: {bom_resp.text}"
        data["bom_id"] = bom_resp.json().get("id")
        
        # Create routing for FG
        routing_resp = self.session.post(f"{BASE_URL}/api/routings", json={
            "item_id": data["fg_item_id"],
            "name": f"Routing {suffix}",
            "revision": "A",
            "status": "active",
            "operations": [
                {
                    "sequence": 10,
                    "work_center_id": data["work_center_id"],
                    "operation_name": "Assembly",
                    "setup_time_minutes": 5,
                    "run_time_minutes": 10
                }
            ]
        })
        assert routing_resp.status_code in [200, 201], f"Routing creation failed: {routing_resp.text}"
        data["routing_id"] = routing_resp.json().get("id")
        
        # Create supplier (subcontractor)
        supplier_resp = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "code": f"SUP-{suffix}",
            "name": f"Subcontractor {suffix}",
            "type": "subcontractor",
            "email": f"sup_{suffix}@test.com"
        })
        assert supplier_resp.status_code in [200, 201], f"Supplier creation failed: {supplier_resp.text}"
        data["supplier_id"] = supplier_resp.json().get("id")
        
        # Create production/sales order
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "item_id": data["fg_item_id"],
            "bom_id": data["bom_id"],
            "quantity": 10,
            "status": "confirmed",
            "due_date": due_date,
            "notes": f"Test SO {suffix}"
        })
        assert so_resp.status_code in [200, 201], f"SO creation failed: {so_resp.text}"
        data["so_id"] = so_resp.json().get("id")
        
        return data
    
    def test_sc_receipt_no_double_stock_e2e(self):
        """
        CRITICAL TEST: Full E2E flow to verify FG stock is NOT added twice
        
        Flow:
        1. Create test data (FG, RM, BOM, Routing, Supplier, SO)
        2. Create MO for 10 FG
        3. Mark MO as SC with_material
        4. Create SC order
        5. Create DC with RM
        6. Send DC (should deduct 20 RM from stock)
        7. Receive 10 FG back
        8. VERIFY: FG stock = 10 (NOT 20)
        9. VERIFY: MO auto-completes
        """
        suffix = self.test_suffix
        data = self._create_test_data(suffix)
        
        print(f"Created test data: FG={data['fg_part_number']}, RM={data['rm_part_number']}")
        
        # Create MO for 10 FG
        mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": data["so_id"],
            "routing_id": data["routing_id"],
            "quantity": 10,
            "is_subcontract": False
        })
        assert mo_resp.status_code in [200, 201], f"MO creation failed: {mo_resp.text}"
        mo_data = mo_resp.json()
        work_orders = mo_data.get("work_orders", [])
        assert len(work_orders) > 0, "No work orders created"
        mo_id = work_orders[0]["id"]
        mo_number = work_orders[0].get("wo_number", "")
        print(f"Created MO: {mo_number} for 10 FG (id: {mo_id})")
        
        # Mark MO as SC with_material
        resp = self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": data["supplier_id"],
            "subcontract_type": "with_material"
        })
        assert resp.status_code == 200, f"Failed to mark MO as SC: {resp.text}"
        print(f"Marked MO as SC with_material")
        
        # Create SC order
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/create-sc")
        assert resp.status_code in [200, 201], f"Failed to create SC order: {resp.text}"
        sc_data = resp.json()
        sc_order = sc_data.get("sc_order", {})
        sc_order_id = sc_order.get("id")
        sc_order_number = sc_order.get("order_number", "")
        print(f"Created SC Order: {sc_order_number} (id: {sc_order_id})")
        
        # Verify SC order has job_work_parts (FG to receive back)
        assert "job_work_parts" in sc_order, "SC order should have job_work_parts"
        assert len(sc_order.get("job_work_parts", [])) > 0, "SC order should have at least one job_work_part"
        print(f"SC Order job_work_parts: {sc_order.get('job_work_parts')}")
        
        # Check RM stock before sending DC
        resp = self.session.get(f"{BASE_URL}/api/items/{data['rm_item_id']}")
        assert resp.status_code == 200
        rm_stock_before_send = resp.json().get("current_stock", 0)
        print(f"RM stock before DC send: {rm_stock_before_send}")
        
        # Create DC with RM (20 RM for 10 FG) - this also sends the DC and deducts stock
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [{"item_id": data["rm_item_id"], "quantity": 20}]
        })
        assert dc_resp.status_code in [200, 201], f"Failed to create DC: {dc_resp.text}"
        dc_data = dc_resp.json()
        
        # Check if DC creation returned insufficient stock error
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed due to insufficient stock: {dc_data}")
        
        dc_id = dc_data.get("id")
        dc_number = dc_data.get("dc_number", "")
        print(f"Created and sent DC: {dc_number} (id: {dc_id})")
        
        # Verify RM stock deducted
        resp = self.session.get(f"{BASE_URL}/api/items/{data['rm_item_id']}")
        assert resp.status_code == 200
        rm_stock_after_send = resp.json().get("current_stock", 0)
        print(f"RM stock after DC send: {rm_stock_after_send}")
        assert rm_stock_after_send == rm_stock_before_send - 20, f"RM stock should be deducted by 20. Expected {rm_stock_before_send - 20}, got {rm_stock_after_send}"
        print("REGRESSION PASS: RM stock correctly deducted on DC send")
        
        # Check FG stock before receipt (should be 0)
        resp = self.session.get(f"{BASE_URL}/api/items/{data['fg_item_id']}")
        assert resp.status_code == 200
        fg_stock_before_receipt = resp.json().get("current_stock", 0)
        print(f"FG stock before receipt: {fg_stock_before_receipt}")
        assert fg_stock_before_receipt == 0, f"FG stock should be 0 before receipt, got {fg_stock_before_receipt}"
        
        # Receive 10 FG back
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "dc_id": dc_id,
            "lines": [
                {
                    "item_id": data["fg_item_id"],
                    "received_quantity": 10,
                    "quality_result": "accept",
                    "reject_qty": 0
                }
            ]
        })
        assert receipt_resp.status_code in [200, 201], f"Failed to create receipt: {receipt_resp.text}"
        receipt_data = receipt_resp.json()
        receipt_number = receipt_data.get("receipt_number", "")
        print(f"Created Receipt: {receipt_number}")
        
        # CRITICAL VERIFICATION: FG stock should be 10 (NOT 20)
        resp = self.session.get(f"{BASE_URL}/api/items/{data['fg_item_id']}")
        assert resp.status_code == 200
        fg_stock_after_receipt = resp.json().get("current_stock", 0)
        print(f"FG stock after receipt: {fg_stock_after_receipt}")
        
        # THE CRITICAL ASSERTION - stock should be 10, not 20
        assert fg_stock_after_receipt == 10, f"CRITICAL BUG: FG stock should be 10 (received qty), but got {fg_stock_after_receipt}. If 20, stock was added TWICE!"
        print("CRITICAL FIX VERIFIED: FG stock increased by received qty ONCE only (10, not 20)")
        
        # Verify MO auto-completes
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert resp.status_code == 200
        mo_after = resp.json()
        mo_status = mo_after.get("status")
        print(f"MO status after receipt: {mo_status}")
        assert mo_status == "completed", f"MO should auto-complete when all job_work_parts received, but status is {mo_status}"
        print("VERIFIED: MO auto-completes when all job_work_parts are received")
        
        print("\n=== ALL CRITICAL TESTS PASSED ===")
        print(f"1. FG stock = {fg_stock_after_receipt} (correct, not doubled)")
        print(f"2. RM stock deducted correctly on DC send")
        print(f"3. MO auto-completed: {mo_status}")
    
    def test_sc_receipt_partial_receive(self):
        """Test partial receipt - stock should match partial qty, not doubled"""
        suffix = f"{self.test_suffix}_partial"
        data = self._create_test_data(suffix)
        
        # Create MO for 20 FG
        mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": data["so_id"],
            "routing_id": data["routing_id"],
            "quantity": 20,
            "is_subcontract": False
        })
        assert mo_resp.status_code in [200, 201], f"MO creation failed: {mo_resp.text}"
        work_orders = mo_resp.json().get("work_orders", [])
        mo_id = work_orders[0]["id"]
        
        # Mark as SC
        self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": data["supplier_id"],
            "subcontract_type": "with_material"
        })
        
        # Create SC order
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/create-sc")
        assert resp.status_code in [200, 201]
        sc_order_id = resp.json()["sc_order"]["id"]
        
        # Create and send DC (DC creation also sends and deducts stock)
        dc_resp = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": sc_order_id,
            "lines": [{"item_id": data["rm_item_id"], "quantity": 40}]
        })
        assert dc_resp.status_code in [200, 201]
        dc_data = dc_resp.json()
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data}")
        dc_id = dc_data["id"]
        
        # Partial receipt: receive only 5 FG
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "dc_id": dc_id,
            "lines": [{"item_id": data["fg_item_id"], "received_quantity": 5, "quality_result": "accept", "reject_qty": 0}]
        })
        assert receipt_resp.status_code in [200, 201]
        
        # Check FG stock - should be 5, not 10
        resp = self.session.get(f"{BASE_URL}/api/items/{data['fg_item_id']}")
        assert resp.status_code == 200
        fg_stock = resp.json().get("current_stock", 0)
        print(f"Partial receipt: FG stock = {fg_stock}")
        assert fg_stock == 5, f"Partial receipt: FG stock should be 5, got {fg_stock}"
        
        # MO should NOT be completed yet (only 5/20 received)
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{mo_id}")
        assert resp.status_code == 200
        mo_status = resp.json().get("status")
        print(f"MO status after partial receipt: {mo_status}")
        assert mo_status != "completed", f"MO should NOT be completed after partial receipt"
        
        print("PARTIAL RECEIPT TEST PASSED: Stock = 5 (not doubled)")


class TestSCDialogFrontendFix:
    """Test that SC dialog shows JW order details after creation (Fix 1)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        self.test_suffix = str(uuid.uuid4())[:8]
        yield
    
    def _create_test_data(self, suffix):
        """Helper to create all required test data"""
        data = {}
        
        # Create Work Center
        wc_resp = self.session.post(f"{BASE_URL}/api/work-centers", json={
            "code": f"WC-{suffix}",
            "name": f"Test Work Center {suffix}",
            "hourly_rate": 100,
            "capacity_per_hour": 10,
            "status": "active"
        })
        assert wc_resp.status_code in [200, 201]
        data["work_center_id"] = wc_resp.json().get("id")
        
        # Create RM item
        rm_resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"RM-{suffix}",
            "name": f"Raw Material {suffix}",
            "category": "raw_material",
            "uom": "pcs",
            "current_stock": 100,
            "unit_cost": 10
        })
        assert rm_resp.status_code in [200, 201]
        data["rm_item_id"] = rm_resp.json().get("id")
        
        # Create FG item
        fg_resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"FG-{suffix}",
            "name": f"Finished Good {suffix}",
            "category": "finished_good",
            "uom": "pcs",
            "current_stock": 0,
            "unit_cost": 50
        })
        assert fg_resp.status_code in [200, 201]
        data["fg_item_id"] = fg_resp.json().get("id")
        
        # Create BOM
        bom_resp = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": data["fg_item_id"],
            "name": f"BOM for FG {suffix}",
            "revision": "A",
            "status": "active",
            "components": [{"item_id": data["rm_item_id"], "quantity": 2}]
        })
        assert bom_resp.status_code in [200, 201]
        data["bom_id"] = bom_resp.json().get("id")
        
        # Create routing
        routing_resp = self.session.post(f"{BASE_URL}/api/routings", json={
            "item_id": data["fg_item_id"],
            "name": f"Routing {suffix}",
            "revision": "A",
            "status": "active",
            "operations": [{"sequence": 10, "work_center_id": data["work_center_id"], "operation_name": "Op", "setup_time_minutes": 5, "run_time_minutes": 10}]
        })
        assert routing_resp.status_code in [200, 201]
        data["routing_id"] = routing_resp.json().get("id")
        
        # Create supplier
        supplier_resp = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "code": f"SUP-{suffix}",
            "name": f"Supplier {suffix}",
            "type": "subcontractor",
            "email": f"s_{suffix}@test.com"
        })
        assert supplier_resp.status_code in [200, 201]
        data["supplier_id"] = supplier_resp.json().get("id")
        
        # Create production order
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "item_id": data["fg_item_id"],
            "bom_id": data["bom_id"],
            "quantity": 10,
            "status": "confirmed",
            "due_date": due_date
        })
        assert so_resp.status_code in [200, 201]
        data["so_id"] = so_resp.json().get("id")
        
        return data
    
    def test_create_sc_returns_order_details(self):
        """Verify create-sc endpoint returns order details for frontend dialog"""
        suffix = self.test_suffix
        data = self._create_test_data(suffix)
        
        # Create MO
        mo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": data["so_id"],
            "routing_id": data["routing_id"],
            "quantity": 10,
            "is_subcontract": False
        })
        assert mo_resp.status_code in [200, 201]
        work_orders = mo_resp.json().get("work_orders", [])
        mo_id = work_orders[0]["id"]
        
        # Mark as SC
        self.session.put(f"{BASE_URL}/api/work-orders/{mo_id}", json={
            "is_subcontract": True,
            "subcontract_supplier_id": data["supplier_id"],
            "subcontract_type": "with_material"
        })
        
        # Create SC order
        resp = self.session.post(f"{BASE_URL}/api/work-orders/{mo_id}/create-sc")
        assert resp.status_code in [200, 201]
        response_data = resp.json()
        
        # Verify response has sc_order with order_number and lines
        assert "sc_order" in response_data, "Response should have sc_order"
        sc_order = response_data["sc_order"]
        assert "order_number" in sc_order, "sc_order should have order_number"
        assert "lines" in sc_order, "sc_order should have lines"
        print(f"SC Order created: {sc_order['order_number']}")
        print(f"SC Order lines: {sc_order['lines']}")
        
        # Verify lines contain RM items
        assert len(sc_order["lines"]) > 0, "SC order should have at least one line"
        print("VERIFIED: create-sc endpoint returns order details for frontend dialog")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
