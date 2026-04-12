"""
Test Manufacturing Order (MO) Enhancements - 6 Features:
1. MO qty auto-fills from selected SO qty
2. Job Card Start/Stop buttons per operation
3. Start dialog allows operator name + qty change
4. Partial production - remaining qty allows assigning another operator
5. Accept/Reject/Rework quality options on Stop/Complete
6. MO print includes child MO details
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMOEnhancements:
    """Test Manufacturing Order enhancements"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get session with cookies"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.user = login_resp.json()
        yield
    
    # ==================== FEATURE 1: MO qty auto-fills from SO ====================
    def test_get_production_orders_with_quantity(self):
        """Verify production orders (SO) return quantity field for auto-fill"""
        resp = self.session.get(f"{BASE_URL}/api/production")
        assert resp.status_code == 200
        orders = resp.json()
        assert len(orders) > 0, "No production orders found"
        
        # Check that orders have quantity field
        for order in orders[:3]:
            assert "quantity" in order, f"Order {order.get('order_number')} missing quantity field"
            assert isinstance(order["quantity"], int), f"Quantity should be int, got {type(order['quantity'])}"
            print(f"SO {order.get('order_number')}: qty={order['quantity']}, status={order.get('status')}")
    
    # ==================== FEATURE 2 & 3: Operation Start with operator + qty ====================
    def test_operation_start_with_operator_and_quantity(self):
        """Test PUT /api/work-orders/{wo_id}/operations/{sequence} with status=in_progress"""
        # Find an in_progress WO with operations
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        # Find WO that is in_progress with pending operations
        target_wo = None
        target_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress" and wo.get("operations_status"):
                for op in wo["operations_status"]:
                    if op.get("status") in ["pending", "stopped"]:
                        # Check if previous ops are done
                        idx = wo["operations_status"].index(op)
                        prev_done = all(p.get("status") in ["completed", "stopped"] for p in wo["operations_status"][:idx])
                        if prev_done or idx == 0:
                            target_wo = wo
                            target_op_seq = op["sequence"]
                            break
                if target_wo:
                    break
        
        if not target_wo:
            pytest.skip("No suitable in_progress WO with pending operations found")
        
        print(f"Testing operation start on WO {target_wo['wo_number']}, operation seq {target_op_seq}")
        
        # Start operation with operator and quantity
        start_payload = {
            "status": "in_progress",
            "operator": "TEST_Operator_John",
            "quantity_completed": target_wo.get("quantity", 4)
        }
        
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{target_wo['id']}/operations/{target_op_seq}",
            json=start_payload
        )
        assert resp.status_code == 200, f"Failed to start operation: {resp.text}"
        
        updated_wo = resp.json()
        updated_op = next((op for op in updated_wo.get("operations_status", []) if op["sequence"] == target_op_seq), None)
        
        assert updated_op is not None, "Operation not found in response"
        assert updated_op["status"] == "in_progress", f"Expected in_progress, got {updated_op['status']}"
        assert updated_op.get("operator") == "TEST_Operator_John", f"Operator not set correctly"
        
        # Verify runs array was created
        runs = updated_op.get("runs", [])
        assert len(runs) > 0, "Runs array should be created on start"
        assert runs[-1].get("operator") == "TEST_Operator_John", "Run should have operator"
        print(f"Operation started successfully with operator: {updated_op.get('operator')}")
        
        # Store for cleanup/next test
        self.started_wo_id = target_wo['id']
        self.started_op_seq = target_op_seq
    
    # ==================== FEATURE 5: Stop with quality result ====================
    def test_operation_stop_with_quality_result(self):
        """Test PUT /api/work-orders/{wo_id}/operations/{sequence} with status=stopped"""
        # Find an in_progress operation
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        target_wo = None
        target_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress" and wo.get("operations_status"):
                for op in wo["operations_status"]:
                    if op.get("status") == "in_progress":
                        target_wo = wo
                        target_op_seq = op["sequence"]
                        break
                if target_wo:
                    break
        
        if not target_wo:
            pytest.skip("No in_progress operation found to stop")
        
        print(f"Testing operation stop on WO {target_wo['wo_number']}, operation seq {target_op_seq}")
        
        # Stop operation with quality result
        stop_payload = {
            "status": "stopped",
            "quantity_completed": 2,  # Partial production
            "quality_result": "accept",
            "reject_qty": 0,
            "rework_qty": 0,
            "notes": "TEST: Stopped for lunch break"
        }
        
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{target_wo['id']}/operations/{target_op_seq}",
            json=stop_payload
        )
        assert resp.status_code == 200, f"Failed to stop operation: {resp.text}"
        
        updated_wo = resp.json()
        updated_op = next((op for op in updated_wo.get("operations_status", []) if op["sequence"] == target_op_seq), None)
        
        assert updated_op is not None, "Operation not found in response"
        assert updated_op["status"] == "stopped", f"Expected stopped, got {updated_op['status']}"
        assert updated_op.get("quantity_completed") == 2, f"Quantity completed not recorded"
        
        # Verify runs array was updated
        runs = updated_op.get("runs", [])
        if runs:
            last_run = runs[-1]
            assert last_run.get("ended_at") is not None, "Run should have ended_at"
            assert last_run.get("quality_result") == "accept", "Quality result not recorded"
        
        print(f"Operation stopped successfully with qty={updated_op.get('quantity_completed')}")
    
    def test_operation_stop_with_reject_quality(self):
        """Test stopping operation with reject quality result"""
        # Find an in_progress operation
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        target_wo = None
        target_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress" and wo.get("operations_status"):
                for op in wo["operations_status"]:
                    if op.get("status") == "in_progress":
                        target_wo = wo
                        target_op_seq = op["sequence"]
                        break
                if target_wo:
                    break
        
        if not target_wo:
            pytest.skip("No in_progress operation found")
        
        # Stop with reject
        stop_payload = {
            "status": "stopped",
            "quantity_completed": 3,
            "quality_result": "reject",
            "reject_qty": 1,
            "rework_qty": 0,
            "notes": "TEST: 1 piece rejected due to defect"
        }
        
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{target_wo['id']}/operations/{target_op_seq}",
            json=stop_payload
        )
        assert resp.status_code == 200, f"Failed to stop with reject: {resp.text}"
        
        updated_wo = resp.json()
        updated_op = next((op for op in updated_wo.get("operations_status", []) if op["sequence"] == target_op_seq), None)
        
        assert updated_op.get("quantity_rejected", 0) >= 1, "Reject qty not recorded"
        print(f"Operation stopped with reject_qty={updated_op.get('quantity_rejected')}")
    
    # ==================== FEATURE 4: Partial production - Resume with new operator ====================
    def test_partial_production_resume_with_new_operator(self):
        """Test resuming stopped operation with a different operator"""
        # Find a stopped operation
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        target_wo = None
        target_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress" and wo.get("operations_status"):
                for op in wo["operations_status"]:
                    if op.get("status") == "stopped":
                        target_wo = wo
                        target_op_seq = op["sequence"]
                        break
                if target_wo:
                    break
        
        if not target_wo:
            pytest.skip("No stopped operation found to resume")
        
        print(f"Testing resume on WO {target_wo['wo_number']}, operation seq {target_op_seq}")
        
        # Resume with new operator
        resume_payload = {
            "status": "in_progress",
            "operator": "TEST_Operator_Jane",  # Different operator
            "quantity_completed": 2  # Remaining quantity
        }
        
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{target_wo['id']}/operations/{target_op_seq}",
            json=resume_payload
        )
        assert resp.status_code == 200, f"Failed to resume operation: {resp.text}"
        
        updated_wo = resp.json()
        updated_op = next((op for op in updated_wo.get("operations_status", []) if op["sequence"] == target_op_seq), None)
        
        assert updated_op["status"] == "in_progress", f"Expected in_progress, got {updated_op['status']}"
        
        # Verify multiple runs exist (original + resume)
        runs = updated_op.get("runs", [])
        assert len(runs) >= 2, f"Expected multiple runs for partial production, got {len(runs)}"
        
        # Check that different operators are recorded
        operators = [r.get("operator") for r in runs]
        print(f"Operators in runs: {operators}")
        assert "TEST_Operator_Jane" in operators, "New operator not recorded in runs"
    
    # ==================== FEATURE 5: Complete with quality data ====================
    def test_operation_complete_with_quality_data(self):
        """Test PUT /api/work-orders/{wo_id}/operations/{sequence} with status=completed"""
        # Find an in_progress operation
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        target_wo = None
        target_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress" and wo.get("operations_status"):
                for op in wo["operations_status"]:
                    if op.get("status") == "in_progress":
                        target_wo = wo
                        target_op_seq = op["sequence"]
                        break
                if target_wo:
                    break
        
        if not target_wo:
            pytest.skip("No in_progress operation found to complete")
        
        print(f"Testing operation complete on WO {target_wo['wo_number']}, operation seq {target_op_seq}")
        
        # Complete operation with quality data
        complete_payload = {
            "status": "completed",
            "quantity_completed": target_wo.get("quantity", 4),
            "quality_result": "accept",
            "reject_qty": 0,
            "rework_qty": 0,
            "notes": "TEST: Operation completed successfully"
        }
        
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{target_wo['id']}/operations/{target_op_seq}",
            json=complete_payload
        )
        assert resp.status_code == 200, f"Failed to complete operation: {resp.text}"
        
        updated_wo = resp.json()
        updated_op = next((op for op in updated_wo.get("operations_status", []) if op["sequence"] == target_op_seq), None)
        
        assert updated_op["status"] == "completed", f"Expected completed, got {updated_op['status']}"
        assert updated_op.get("actual_end") is not None, "actual_end should be set on complete"
        assert updated_op.get("quantity_accepted") is not None, "quantity_accepted should be calculated"
        
        print(f"Operation completed: qty_completed={updated_op.get('quantity_completed')}, qty_accepted={updated_op.get('quantity_accepted')}")
    
    # ==================== FEATURE 6: Print data includes child MOs ====================
    def test_print_data_includes_child_mos(self):
        """Test GET /api/work-orders/{wo_id}/print-data returns child_mos array"""
        # Get all work orders
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        # Find a parent WO (one that might have children)
        parent_wo = None
        for wo in work_orders:
            if not wo.get("parent_wo_id"):  # This is a parent WO
                parent_wo = wo
                break
        
        if not parent_wo:
            pytest.skip("No parent work order found")
        
        print(f"Testing print-data for WO {parent_wo['wo_number']}")
        
        # Get print data
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{parent_wo['id']}/print-data")
        assert resp.status_code == 200, f"Failed to get print data: {resp.text}"
        
        print_data = resp.json()
        
        # Verify structure
        assert "wo_number" in print_data, "Missing wo_number"
        assert "item" in print_data, "Missing item details"
        assert "operations_status" in print_data, "Missing operations_status"
        assert "consumed_materials" in print_data, "Missing consumed_materials"
        assert "child_mos" in print_data, "Missing child_mos array"
        assert "company" in print_data, "Missing company settings"
        
        # Check child_mos structure
        child_mos = print_data.get("child_mos", [])
        print(f"Child MOs count: {len(child_mos)}")
        
        for child in child_mos:
            assert "wo_number" in child, "Child MO missing wo_number"
            assert "item" in child, "Child MO missing item"
            assert "quantity" in child, "Child MO missing quantity"
            assert "status" in child, "Child MO missing status"
            print(f"  - Child MO: {child.get('wo_number')}, item: {child.get('item', {}).get('part_number')}")
    
    def test_print_data_includes_company_logo_and_tagline(self):
        """Test print data includes company logo and tagline in header"""
        # Get any work order
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        if not work_orders:
            pytest.skip("No work orders found")
        
        wo = work_orders[0]
        
        # Get print data
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{wo['id']}/print-data")
        assert resp.status_code == 200
        
        print_data = resp.json()
        company = print_data.get("company", {})
        
        # Verify company settings are included
        assert company is not None, "Company settings not included"
        print(f"Company name: {company.get('company_name')}")
        print(f"Tagline: {company.get('tagline')}")
        print(f"Logo present: {'Yes' if company.get('logo_data') else 'No'}")
        
        # These fields should exist (may be empty but should be present)
        assert "company_name" in company or company == {}, "Company name field missing"
    
    # ==================== Validation Tests ====================
    def test_cannot_update_pending_wo_operations(self):
        """Test that operations cannot be updated on pending WO"""
        # Find a pending WO
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        pending_wo = None
        for wo in work_orders:
            if wo.get("status") == "pending" and wo.get("operations_status"):
                pending_wo = wo
                break
        
        if not pending_wo:
            pytest.skip("No pending WO with operations found")
        
        # Try to update operation
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{pending_wo['id']}/operations/10",
            json={"status": "in_progress", "operator": "Test"}
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "not been started" in resp.text.lower() or "pending" in resp.text.lower(), f"Unexpected error: {resp.text}"
        print("Correctly rejected operation update on pending WO")
    
    def test_cannot_start_operation_before_previous_completed(self):
        """Test that operations must be done in sequence"""
        # Find a WO with multiple operations where first is not done
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        target_wo = None
        target_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress" and wo.get("operations_status"):
                ops = wo["operations_status"]
                if len(ops) >= 2:
                    # Find a pending op that has a pending predecessor
                    for i, op in enumerate(ops[1:], 1):
                        if op.get("status") == "pending" and ops[i-1].get("status") == "pending":
                            target_wo = wo
                            target_op_seq = op["sequence"]
                            break
                if target_wo:
                    break
        
        if not target_wo:
            pytest.skip("No suitable WO found for sequence test")
        
        # Try to start operation out of sequence
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{target_wo['id']}/operations/{target_op_seq}",
            json={"status": "in_progress", "operator": "Test"}
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "previous" in resp.text.lower() or "must be completed" in resp.text.lower(), f"Unexpected error: {resp.text}"
        print("Correctly rejected out-of-sequence operation start")


class TestWorkOrderOperationModel:
    """Test WorkOrderOperationUpdate model fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        yield
    
    def test_operation_update_model_accepts_all_fields(self):
        """Verify the WorkOrderOperationUpdate model accepts all required fields"""
        # Find an in_progress WO
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        work_orders = resp.json()
        
        target_wo = None
        target_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress" and wo.get("operations_status"):
                for op in wo["operations_status"]:
                    if op.get("status") in ["pending", "stopped"]:
                        idx = wo["operations_status"].index(op)
                        prev_done = all(p.get("status") in ["completed", "stopped"] for p in wo["operations_status"][:idx])
                        if prev_done or idx == 0:
                            target_wo = wo
                            target_op_seq = op["sequence"]
                            break
                if target_wo:
                    break
        
        if not target_wo:
            pytest.skip("No suitable WO found")
        
        # Test all fields in the model
        full_payload = {
            "status": "in_progress",
            "actual_start": datetime.now().isoformat(),
            "actual_end": None,
            "quantity_completed": 4,
            "operator": "TEST_Full_Model_Test",
            "quality_result": "accept",
            "reject_qty": 0,
            "rework_qty": 0,
            "notes": "Testing all model fields"
        }
        
        resp = self.session.put(
            f"{BASE_URL}/api/work-orders/{target_wo['id']}/operations/{target_op_seq}",
            json=full_payload
        )
        
        # Should accept all fields without error
        assert resp.status_code == 200, f"Model should accept all fields: {resp.text}"
        print("WorkOrderOperationUpdate model accepts all fields correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
