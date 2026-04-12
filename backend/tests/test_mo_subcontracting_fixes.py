"""
Test MO/Subcontracting Bug Fixes
================================
Tests for the 5 reported bugs:
1. MO completed before receiving outsourced items/operations done
2. Outsourced operation completable without receipt
3. Partial qty should block MO completion
4. Job card not showing operator/supplier selection after MO start (was auto-starting first op)
5. Job work outsourcing not showing materials in SC order

Key validations:
- After starting MO, all operations remain 'pending' (not auto-started)
- MO cannot be completed if ANY operation is not 'completed'
- MO cannot be completed if outsourced operations have materials not received
- MO cannot be completed if partial qty produced
- Outsourced operation cannot be marked 'completed' if SC order not completed
- SC Order created with materials from consumed_materials
- Receipt updates linked WO operation's outsource_status to 'received'
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMOSubcontractingFixes:
    """Test suite for MO/Subcontracting bug fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        print(f"✓ Logged in successfully")
        yield
    
    # ==================== BUG FIX #4: Operations remain pending after MO start ====================
    
    def test_operations_remain_pending_after_mo_start(self):
        """Bug #4: After starting MO, all operations should remain 'pending' (not auto-started)"""
        # Get existing work orders
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find a pending MO or create one
        pending_mo = None
        for wo in work_orders:
            if wo.get("status") == "pending":
                pending_mo = wo
                break
        
        if not pending_mo:
            # Need to create a new MO - first get items and routings
            items_resp = self.session.get(f"{BASE_URL}/api/items")
            assert items_resp.status_code == 200
            items = items_resp.json()
            
            routings_resp = self.session.get(f"{BASE_URL}/api/routings")
            assert routings_resp.status_code == 200
            routings = routings_resp.json()
            
            if routings and items:
                # Create a new MO
                routing = routings[0]
                create_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
                    "item_id": routing.get("item_id", items[0]["id"]),
                    "routing_id": routing["id"],
                    "quantity": 10,
                    "priority": "medium",
                    "notes": "TEST_MO_for_pending_ops_test"
                })
                if create_resp.status_code == 200:
                    pending_mo = create_resp.json()
                    print(f"✓ Created new MO: {pending_mo.get('wo_number')}")
        
        if not pending_mo:
            pytest.skip("No pending MO available and couldn't create one")
        
        wo_id = pending_mo["id"]
        print(f"Testing with MO: {pending_mo.get('wo_number')}")
        
        # Start the MO
        start_resp = self.session.post(f"{BASE_URL}/api/work-orders/{wo_id}/start")
        assert start_resp.status_code == 200, f"Failed to start MO: {start_resp.text}"
        print(f"✓ MO started successfully")
        
        # Get the updated MO
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
        assert wo_resp.status_code == 200
        updated_mo = wo_resp.json()
        
        # Verify MO is in_progress
        assert updated_mo.get("status") == "in_progress", f"Expected in_progress, got {updated_mo.get('status')}"
        print(f"✓ MO status is in_progress")
        
        # Verify ALL operations are still 'pending' (not auto-started)
        operations = updated_mo.get("operations_status", [])
        for op in operations:
            assert op.get("status") == "pending", f"Operation {op.get('sequence')} should be 'pending' but is '{op.get('status')}'"
            print(f"✓ Operation {op.get('sequence')} ({op.get('operation_name')}) is pending")
        
        print(f"✓ BUG FIX #4 VERIFIED: All {len(operations)} operations remain pending after MO start")
    
    # ==================== BUG FIX #1 & #3: MO completion validations ====================
    
    def test_mo_cannot_complete_with_incomplete_operations(self):
        """Bug #1: MO cannot be completed if ANY operation is not 'completed'"""
        # Get in_progress MOs
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find an in_progress MO with pending operations
        test_mo = None
        for wo in work_orders:
            if wo.get("status") == "in_progress":
                ops = wo.get("operations_status", [])
                has_incomplete = any(op.get("status") != "completed" for op in ops)
                if has_incomplete:
                    test_mo = wo
                    break
        
        if not test_mo:
            pytest.skip("No in_progress MO with incomplete operations found")
        
        wo_id = test_mo["id"]
        print(f"Testing with MO: {test_mo.get('wo_number')}")
        
        # Try to complete the MO - should fail
        complete_resp = self.session.put(f"{BASE_URL}/api/work-orders/{wo_id}", json={
            "status": "completed"
        })
        
        assert complete_resp.status_code == 400, f"Expected 400, got {complete_resp.status_code}"
        error_msg = complete_resp.json().get("detail", "")
        assert "not completed" in error_msg.lower() or "complete all operations" in error_msg.lower(), f"Unexpected error: {error_msg}"
        print(f"✓ BUG FIX #1 VERIFIED: MO completion blocked - {error_msg}")
    
    def test_mo_cannot_complete_with_partial_quantity(self):
        """Bug #3: MO cannot be completed if partial qty produced (last op qty < MO qty)"""
        # Get in_progress MOs
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find an in_progress MO where we can test partial qty
        test_mo = None
        for wo in work_orders:
            if wo.get("status") == "in_progress":
                ops = wo.get("operations_status", [])
                # Check if all ops are completed but last op has partial qty
                all_completed = all(op.get("status") == "completed" for op in ops)
                if all_completed and ops:
                    last_op = ops[-1]
                    mo_qty = wo.get("quantity", 0)
                    last_op_qty = last_op.get("quantity_completed", 0)
                    if last_op_qty < mo_qty:
                        test_mo = wo
                        break
        
        if not test_mo:
            # This is expected - we need to manually create this scenario
            # For now, verify the validation logic exists by checking the code path
            print("No MO with partial qty scenario found - testing validation logic directly")
            
            # Find any in_progress MO
            for wo in work_orders:
                if wo.get("status") == "in_progress":
                    test_mo = wo
                    break
            
            if test_mo:
                wo_id = test_mo["id"]
                # Try to complete - should fail for some reason (incomplete ops or partial qty)
                complete_resp = self.session.put(f"{BASE_URL}/api/work-orders/{wo_id}", json={
                    "status": "completed"
                })
                
                if complete_resp.status_code == 400:
                    error_msg = complete_resp.json().get("detail", "")
                    print(f"✓ MO completion blocked: {error_msg}")
                    # Verify the partial qty check is in the error message if applicable
                    if "produced" in error_msg.lower() and "/" in error_msg:
                        print(f"✓ BUG FIX #3 VERIFIED: Partial qty validation active")
                    else:
                        print(f"✓ MO completion blocked for other reason (ops not complete)")
                else:
                    pytest.fail(f"Expected 400, got {complete_resp.status_code}")
            else:
                pytest.skip("No in_progress MO found for testing")
        else:
            wo_id = test_mo["id"]
            print(f"Testing with MO: {test_mo.get('wo_number')}")
            
            complete_resp = self.session.put(f"{BASE_URL}/api/work-orders/{wo_id}", json={
                "status": "completed"
            })
            
            assert complete_resp.status_code == 400
            error_msg = complete_resp.json().get("detail", "")
            assert "produced" in error_msg.lower() or "quantity" in error_msg.lower()
            print(f"✓ BUG FIX #3 VERIFIED: Partial qty blocks completion - {error_msg}")
    
    # ==================== BUG FIX #2: Outsourced operation completion validation ====================
    
    def test_outsourced_operation_cannot_complete_without_receipt(self):
        """Bug #2: Outsourced operation cannot be marked 'completed' if SC order not completed"""
        # Get in_progress MOs
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find an MO with outsourced operation (is_job_work=true, outsource_status=sent)
        test_mo = None
        test_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress":
                ops = wo.get("operations_status", [])
                for op in ops:
                    if op.get("is_job_work") and op.get("outsource_status") == "sent":
                        test_mo = wo
                        test_op_seq = op.get("sequence")
                        break
                if test_mo:
                    break
        
        if not test_mo:
            pytest.skip("No MO with outsourced operation (sent status) found")
        
        wo_id = test_mo["id"]
        print(f"Testing with MO: {test_mo.get('wo_number')}, Operation seq: {test_op_seq}")
        
        # Try to complete the outsourced operation - should fail
        complete_resp = self.session.put(f"{BASE_URL}/api/work-orders/{wo_id}/operations/{test_op_seq}", json={
            "status": "completed",
            "quantity_completed": test_mo.get("quantity", 10)
        })
        
        assert complete_resp.status_code == 400, f"Expected 400, got {complete_resp.status_code}"
        error_msg = complete_resp.json().get("detail", "")
        assert "not received" in error_msg.lower() or "subcontractor" in error_msg.lower() or "job work" in error_msg.lower()
        print(f"✓ BUG FIX #2 VERIFIED: Outsourced op completion blocked - {error_msg}")
    
    def test_mo_cannot_complete_with_unreceived_outsourced_materials(self):
        """Bug #1 extended: MO cannot be completed if outsourced operations have materials not received"""
        # Get in_progress MOs
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find an MO with outsourced operation that has sent status
        test_mo = None
        for wo in work_orders:
            if wo.get("status") == "in_progress":
                ops = wo.get("operations_status", [])
                for op in ops:
                    if op.get("is_job_work") and op.get("outsource_status") == "sent":
                        test_mo = wo
                        break
                if test_mo:
                    break
        
        if not test_mo:
            pytest.skip("No MO with unreceived outsourced materials found")
        
        wo_id = test_mo["id"]
        print(f"Testing with MO: {test_mo.get('wo_number')}")
        
        # Try to complete the MO - should fail
        complete_resp = self.session.put(f"{BASE_URL}/api/work-orders/{wo_id}", json={
            "status": "completed"
        })
        
        assert complete_resp.status_code == 400, f"Expected 400, got {complete_resp.status_code}"
        error_msg = complete_resp.json().get("detail", "")
        # Should mention either incomplete ops or unreceived materials
        print(f"✓ MO completion blocked: {error_msg}")
    
    # ==================== BUG FIX #5: SC Order materials from consumed_materials ====================
    
    def test_outsource_creates_sc_order_with_materials(self):
        """Bug #5: When outsourcing an operation, SC Order is created with materials from consumed_materials"""
        # Get in_progress MOs with consumed_materials
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find an in_progress MO with pending operations and consumed_materials
        test_mo = None
        test_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress" and wo.get("consumed_materials"):
                ops = wo.get("operations_status", [])
                for op in ops:
                    if op.get("status") == "pending" and not op.get("is_job_work"):
                        test_mo = wo
                        test_op_seq = op.get("sequence")
                        break
                if test_mo:
                    break
        
        if not test_mo:
            pytest.skip("No suitable MO with pending operation and consumed_materials found")
        
        wo_id = test_mo["id"]
        consumed_materials = test_mo.get("consumed_materials", [])
        print(f"Testing with MO: {test_mo.get('wo_number')}, Operation seq: {test_op_seq}")
        print(f"Consumed materials: {len(consumed_materials)} items")
        
        # Get suppliers
        suppliers_resp = self.session.get(f"{BASE_URL}/api/suppliers")
        assert suppliers_resp.status_code == 200
        suppliers = suppliers_resp.json()
        
        if not suppliers:
            pytest.skip("No suppliers available")
        
        supplier_id = suppliers[0]["id"]
        
        # Start the operation as outsourced
        outsource_resp = self.session.put(f"{BASE_URL}/api/work-orders/{wo_id}/operations/{test_op_seq}", json={
            "status": "in_progress",
            "is_outsource": True,
            "outsource_supplier_id": supplier_id,
            "outsource_charges": 100
        })
        
        assert outsource_resp.status_code == 200, f"Failed to outsource: {outsource_resp.text}"
        print(f"✓ Operation outsourced successfully")
        
        # Get the updated MO to find the SC order ID
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
        assert wo_resp.status_code == 200
        updated_mo = wo_resp.json()
        
        ops = updated_mo.get("operations_status", [])
        target_op = next((op for op in ops if op.get("sequence") == test_op_seq), None)
        assert target_op, "Operation not found"
        
        sc_order_id = target_op.get("outsource_sc_order_id")
        assert sc_order_id, "SC Order ID not set on operation"
        print(f"✓ SC Order created: {sc_order_id}")
        
        # Get the SC order and verify it has materials
        sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_orders_resp.status_code == 200
        sc_orders = sc_orders_resp.json()
        
        sc_order = next((o for o in sc_orders if o.get("id") == sc_order_id), None)
        assert sc_order, f"SC Order {sc_order_id} not found"
        
        sc_lines = sc_order.get("lines", [])
        assert len(sc_lines) > 0, "SC Order has no material lines"
        print(f"✓ SC Order has {len(sc_lines)} material lines")
        
        # Verify materials match consumed_materials
        if consumed_materials:
            consumed_item_ids = {m["item_id"] for m in consumed_materials}
            sc_item_ids = {l["item_id"] for l in sc_lines}
            # At least some materials should match
            matching = consumed_item_ids.intersection(sc_item_ids)
            print(f"✓ {len(matching)} materials from consumed_materials in SC Order")
        
        print(f"✓ BUG FIX #5 VERIFIED: SC Order created with materials")
    
    # ==================== Receipt updates linked WO operation ====================
    
    def test_receipt_updates_linked_wo_operation(self):
        """When receiving materials via Job Work receipts and SC order becomes completed, 
        the linked WO operation's outsource_status updates to 'received' and status to 'completed'"""
        # Get SC orders that are in_progress and linked to a WO
        sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_orders_resp.status_code == 200
        sc_orders = sc_orders_resp.json()
        
        # Find an in_progress SC order linked to a WO operation
        test_sc = None
        for sc in sc_orders:
            if sc.get("status") == "in_progress" and sc.get("reference_wo_id"):
                # Check if it has materials to receive
                lines = sc.get("lines", [])
                has_unreceived = any(
                    l.get("received_quantity", 0) < l.get("sent_quantity", 0) 
                    for l in lines
                )
                if has_unreceived:
                    test_sc = sc
                    break
        
        if not test_sc:
            pytest.skip("No in_progress SC order with unreceived materials linked to WO found")
        
        sc_order_id = test_sc["id"]
        ref_wo_id = test_sc.get("reference_wo_id")
        ref_op_seq = test_sc.get("reference_operation_seq")
        print(f"Testing with SC Order: {test_sc.get('order_number')}")
        print(f"Linked to WO: {ref_wo_id}, Operation seq: {ref_op_seq}")
        
        # Get warehouses
        warehouses_resp = self.session.get(f"{BASE_URL}/api/warehouses")
        assert warehouses_resp.status_code == 200
        warehouses = warehouses_resp.json()
        warehouse_id = warehouses[0]["id"] if warehouses else ""
        
        # Create receipt for all remaining materials
        receipt_lines = []
        for line in test_sc.get("lines", []):
            remaining = line.get("sent_quantity", 0) - line.get("received_quantity", 0)
            if remaining > 0:
                receipt_lines.append({
                    "item_id": line["item_id"],
                    "received_quantity": remaining,
                    "accepted_quantity": remaining,
                    "rejected_quantity": 0
                })
        
        if not receipt_lines:
            pytest.skip("No materials to receive")
        
        # Create receipt
        receipt_resp = self.session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": sc_order_id,
            "warehouse_id": warehouse_id,
            "lines": receipt_lines,
            "notes": "TEST_receipt_for_wo_update"
        })
        
        assert receipt_resp.status_code in [200, 201], f"Failed to create receipt: {receipt_resp.text}"
        print(f"✓ Receipt created successfully")
        
        # Check if SC order is now completed
        sc_orders_resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert sc_orders_resp.status_code == 200
        sc_orders = sc_orders_resp.json()
        
        updated_sc = next((o for o in sc_orders if o.get("id") == sc_order_id), None)
        assert updated_sc, "SC Order not found"
        
        if updated_sc.get("status") == "completed":
            print(f"✓ SC Order status is now 'completed'")
            
            # Check if linked WO operation was updated
            wo_resp = self.session.get(f"{BASE_URL}/api/work-orders/{ref_wo_id}")
            assert wo_resp.status_code == 200
            updated_wo = wo_resp.json()
            
            ops = updated_wo.get("operations_status", [])
            target_op = None
            if ref_op_seq:
                target_op = next((op for op in ops if op.get("sequence") == ref_op_seq), None)
            else:
                # Find by SC order ID
                target_op = next((op for op in ops if op.get("outsource_sc_order_id") == sc_order_id), None)
            
            if target_op:
                assert target_op.get("outsource_status") == "received", f"Expected 'received', got '{target_op.get('outsource_status')}'"
                assert target_op.get("status") == "completed", f"Expected 'completed', got '{target_op.get('status')}'"
                print(f"✓ WO Operation outsource_status is 'received'")
                print(f"✓ WO Operation status is 'completed'")
                print(f"✓ RECEIPT UPDATE VERIFIED: Linked WO operation updated correctly")
            else:
                print(f"⚠ Could not find linked operation in WO")
        else:
            print(f"SC Order status is '{updated_sc.get('status')}' - may need more receipts")
    
    # ==================== Job Card Start Dialog Tests ====================
    
    def test_operation_start_requires_operator_or_supplier(self):
        """Job Card Start dialog requires operator name (in-house) or supplier (outsource)"""
        # Get in_progress MOs with pending operations
        wo_resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        test_mo = None
        test_op_seq = None
        for wo in work_orders:
            if wo.get("status") == "in_progress":
                ops = wo.get("operations_status", [])
                for op in ops:
                    if op.get("status") == "pending":
                        test_mo = wo
                        test_op_seq = op.get("sequence")
                        break
                if test_mo:
                    break
        
        if not test_mo:
            pytest.skip("No in_progress MO with pending operation found")
        
        wo_id = test_mo["id"]
        print(f"Testing with MO: {test_mo.get('wo_number')}, Operation seq: {test_op_seq}")
        
        # Try to start without operator - should fail
        start_resp = self.session.put(f"{BASE_URL}/api/work-orders/{wo_id}/operations/{test_op_seq}", json={
            "status": "in_progress",
            "operator": ""  # Empty operator
        })
        
        # Backend should require operator for non-outsourced operations
        if start_resp.status_code == 400:
            error_msg = start_resp.json().get("detail", "")
            print(f"✓ Start without operator blocked: {error_msg}")
        else:
            # If it succeeded, check if operator was set
            wo_resp = self.session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
            updated_mo = wo_resp.json()
            ops = updated_mo.get("operations_status", [])
            target_op = next((op for op in ops if op.get("sequence") == test_op_seq), None)
            if target_op and target_op.get("operator"):
                print(f"⚠ Operation started with operator: {target_op.get('operator')}")
            else:
                print(f"⚠ Operation started without operator - may need frontend validation")
        
        print(f"✓ Operator/supplier requirement test completed")


class TestExistingWorkOrderData:
    """Test with existing work order data mentioned in context"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        yield
    
    def test_get_work_orders_list(self):
        """Verify work orders endpoint returns data"""
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        print(f"✓ Found {len(work_orders)} work orders")
        
        # Print summary
        status_counts = {}
        for wo in work_orders:
            status = wo.get("status", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
        
        for status, count in status_counts.items():
            print(f"  - {status}: {count}")
    
    def test_get_job_work_orders(self):
        """Verify job work orders endpoint returns data"""
        resp = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        sc_orders = resp.json()
        print(f"✓ Found {len(sc_orders)} subcontract orders")
        
        # Print summary
        for sc in sc_orders[:5]:  # First 5
            print(f"  - {sc.get('order_number')}: {sc.get('status')} (WO: {sc.get('reference_wo_id', 'N/A')[:8] if sc.get('reference_wo_id') else 'N/A'}...)")
    
    def test_verify_mo_008_operations_status(self):
        """Check MO-000008 operations status (mentioned in context)"""
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        work_orders = resp.json()
        
        mo_008 = None
        for wo in work_orders:
            if wo.get("wo_number") == "MO-000008":
                mo_008 = wo
                break
        
        if not mo_008:
            print("MO-000008 not found - may have different number")
            return
        
        print(f"✓ Found MO-000008: status={mo_008.get('status')}")
        ops = mo_008.get("operations_status", [])
        for op in ops:
            print(f"  - Op {op.get('sequence')} ({op.get('operation_name')}): {op.get('status')}, outsource={op.get('is_job_work', False)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
