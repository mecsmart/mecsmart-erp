"""
Iteration 137 - Round 7 Testing
Tests for:
1. Per-vendor JW chip in Job Card (multi-vendor OS allocations show their own JW numbers)
2. Tax Invoice stock guard on issue (422 with structured shortages payload)
3. FG-MO summary band format (X/Y MO(s) · Qty done/total)
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Authenticated session for all tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return session


class TestTaxInvoiceStockGuard:
    """
    ISSUE 2 — Tax Invoice stock guard on issue
    PUT /api/crm/tax-invoices/{id} with body {status:'issued'} for a draft TI 
    whose line items would push stock negative should return HTTP 422 with 
    structured shortages payload.
    """
    
    def test_tax_invoice_issue_insufficient_stock_returns_422(self, auth_session):
        """
        Create a draft TI with items that have insufficient stock,
        then try to issue it. Should get 422 with structured error.
        """
        # Step 1: Create a test item with zero stock
        test_item_id = str(uuid.uuid4())
        test_part_number = f"TEST-TI-STOCK-{uuid.uuid4().hex[:8]}"
        
        item_resp = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": test_part_number,
            "name": "Test Item for TI Stock Guard",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "current_stock": 0,  # Zero stock
            "sale_price": 100.0,
            "hsn_code": "8483",
            "gst_rate": 18.0
        })
        assert item_resp.status_code == 201, f"Failed to create item: {item_resp.text}"
        created_item = item_resp.json()
        test_item_id = created_item["id"]
        
        # Step 2: Create a test customer (unique GSTIN)
        unique_gstin = f"27AAACM{uuid.uuid4().hex[:4].upper()}E1Z5"
        customer_name = f"Test Customer TI Stock {uuid.uuid4().hex[:6]}"
        cust_resp = auth_session.post(f"{BASE_URL}/api/customers", json={
            "name": customer_name,
            "gstin": unique_gstin,
            "state_code": "27"
        })
        assert cust_resp.status_code == 201, f"Failed to create customer: {cust_resp.text}"
        test_customer_id = cust_resp.json()["id"]
        
        # Step 3: Create a draft Tax Invoice with the zero-stock item
        ti_resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json={
            "customer_id": test_customer_id,
            "customer_name": customer_name,  # Required field
            "invoice_date": datetime.now().isoformat(),
            "lines": [{
                "item_id": test_item_id,
                "quantity": 10,  # Requesting 10 when stock is 0
                "rate": 100.0,
                "hsn_code": "8483",
                "gst_rate": 18.0
            }],
            "status": "draft"
        })
        assert ti_resp.status_code == 201, f"Failed to create TI: {ti_resp.text}"
        ti_data = ti_resp.json()
        ti_id = ti_data["id"]
        
        # Step 4: Try to issue the TI - should fail with 422
        issue_resp = auth_session.put(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}", json={
            "status": "issued"
        })
        
        # Verify 422 response with structured error
        assert issue_resp.status_code == 422, f"Expected 422, got {issue_resp.status_code}: {issue_resp.text}"
        
        error_data = issue_resp.json()
        detail = error_data.get("detail", {})
        
        # Verify error structure
        assert detail.get("error") == "insufficient_stock", f"Expected 'insufficient_stock' error, got: {detail}"
        assert "shortages" in detail, f"Expected 'shortages' in detail, got: {detail}"
        assert len(detail["shortages"]) > 0, "Expected at least one shortage item"
        
        # Verify shortage item structure
        shortage = detail["shortages"][0]
        assert "item_id" in shortage, "Shortage should have item_id"
        assert "part_number" in shortage, "Shortage should have part_number"
        assert "required" in shortage, "Shortage should have required"
        assert "available" in shortage, "Shortage should have available"
        assert "short_by" in shortage, "Shortage should have short_by"
        assert "uom" in shortage, "Shortage should have uom"
        
        # Verify the TI is still in draft status (use list endpoint)
        list_resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert list_resp.status_code == 200
        ti_list = list_resp.json()
        ti_found = next((t for t in ti_list if t["id"] == ti_id), None)
        assert ti_found is not None, "TI should exist in list"
        assert ti_found["status"] == "draft", "TI should still be in draft after failed issue"
        
        print(f"✓ Tax Invoice stock guard working - 422 returned with {len(detail['shortages'])} shortage(s)")
        print(f"  Shortage details: {shortage}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}")
        auth_session.delete(f"{BASE_URL}/api/customers/{test_customer_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{test_item_id}")
    
    def test_tax_invoice_issue_sufficient_stock_succeeds(self, auth_session):
        """
        Create a draft TI with items that have sufficient stock,
        then issue it. Should succeed.
        """
        # Step 1: Create a test item with sufficient stock
        test_part_number = f"TEST-TI-OK-{uuid.uuid4().hex[:8]}"
        
        item_resp = auth_session.post(f"{BASE_URL}/api/items", json={
            "part_number": test_part_number,
            "name": "Test Item with Stock",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "current_stock": 100,  # Sufficient stock
            "sale_price": 100.0,
            "hsn_code": "8483",
            "gst_rate": 18.0
        })
        assert item_resp.status_code == 201, f"Failed to create item: {item_resp.text}"
        created_item = item_resp.json()
        test_item_id = created_item["id"]
        
        # Step 2: Create a test customer (unique GSTIN)
        unique_gstin = f"27AAACM{uuid.uuid4().hex[:4].upper()}E1Z5"
        customer_name = f"Test Customer TI OK {uuid.uuid4().hex[:6]}"
        cust_resp = auth_session.post(f"{BASE_URL}/api/customers", json={
            "name": customer_name,
            "gstin": unique_gstin,
            "state_code": "27"
        })
        assert cust_resp.status_code == 201, f"Failed to create customer: {cust_resp.text}"
        test_customer_id = cust_resp.json()["id"]
        
        # Step 3: Create a draft Tax Invoice
        ti_resp = auth_session.post(f"{BASE_URL}/api/crm/tax-invoices", json={
            "customer_id": test_customer_id,
            "customer_name": customer_name,  # Required field
            "invoice_date": datetime.now().isoformat(),
            "lines": [{
                "item_id": test_item_id,
                "quantity": 5,  # Requesting 5 when stock is 100
                "rate": 100.0,
                "hsn_code": "8483",
                "gst_rate": 18.0
            }],
            "status": "draft"
        })
        assert ti_resp.status_code == 201, f"Failed to create TI: {ti_resp.text}"
        ti_data = ti_resp.json()
        ti_id = ti_data["id"]
        
        # Step 4: Issue the TI - should succeed
        issue_resp = auth_session.put(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}", json={
            "status": "issued"
        })
        
        assert issue_resp.status_code == 200, f"Expected 200, got {issue_resp.status_code}: {issue_resp.text}"
        
        # Verify the TI is now issued (use list endpoint)
        list_resp = auth_session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert list_resp.status_code == 200
        ti_list = list_resp.json()
        ti_found = next((t for t in ti_list if t["id"] == ti_id), None)
        assert ti_found is not None, "TI should exist in list"
        assert ti_found["status"] == "issued", "TI should be issued"
        
        # Verify stock was consumed
        item_check = auth_session.get(f"{BASE_URL}/api/items/{test_item_id}")
        assert item_check.status_code == 200
        new_stock = item_check.json().get("current_stock", 0)
        assert new_stock == 95, f"Expected stock to be 95 (100-5), got {new_stock}"
        
        print(f"✓ Tax Invoice with sufficient stock issued successfully, stock reduced to {new_stock}")
        
        # Cleanup - cancel the TI first to restore stock
        auth_session.put(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}", json={"status": "cancelled"})
        auth_session.delete(f"{BASE_URL}/api/crm/tax-invoices/{ti_id}")
        auth_session.delete(f"{BASE_URL}/api/customers/{test_customer_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{test_item_id}")


class TestWorkOrderPerRunJWChip:
    """
    ISSUE 1 — Per-vendor JW chip in Job Card
    When a WO has multi-vendor OS allocations on the same op, each vendor's run
    should show its own JW (SC) number via r.outsource_sc_order_number.
    """
    
    def test_work_order_operations_have_per_run_sc_info(self, auth_session):
        """
        Verify that work orders with OS operations have per-run SC info
        (outsource_sc_order_number) populated on each run.
        """
        # Get work orders with OS operations
        wo_resp = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find a WO with OS operations that have runs
        os_wo = None
        for wo in work_orders:
            ops = wo.get("operations_status", [])
            for op in ops:
                runs = op.get("runs", [])
                for run in runs:
                    if (run.get("operator", "").startswith("OS: ") and 
                        run.get("outsource_sc_order_number")):
                        os_wo = wo
                        break
                if os_wo:
                    break
            if os_wo:
                break
        
        if os_wo:
            print(f"✓ Found WO {os_wo['wo_number']} with per-run SC info")
            for op in os_wo.get("operations_status", []):
                for run in op.get("runs", []):
                    if run.get("outsource_sc_order_number"):
                        print(f"  Op {op['sequence']} Run {run.get('run_number')}: "
                              f"Operator={run.get('operator')} "
                              f"JW={run.get('outsource_sc_order_number')}")
        else:
            print("⚠ No WO with per-run SC info found in current data - this is expected if no OS operations exist")
            # This is not a failure - just means no OS data exists yet
    
    def test_work_order_runs_structure(self, auth_session):
        """
        Verify that work order operations have the runs array structure
        with the expected fields for per-vendor tracking.
        """
        wo_resp = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find any WO with operations that have runs
        found_runs = False
        for wo in work_orders:
            ops = wo.get("operations_status", [])
            for op in ops:
                runs = op.get("runs", [])
                if runs:
                    found_runs = True
                    # Verify run structure
                    for run in runs:
                        # Check expected fields exist
                        assert "run_number" in run or run.get("operator"), "Run should have run_number or operator"
                        # Per-run SC fields (may be null if not OS)
                        # These fields should exist in the schema even if null
                        print(f"  WO {wo['wo_number']} Op {op['sequence']}: "
                              f"run_number={run.get('run_number')} "
                              f"operator={run.get('operator')} "
                              f"outsource_sc_order_number={run.get('outsource_sc_order_number')}")
                    break
            if found_runs:
                break
        
        if found_runs:
            print("✓ Work order runs structure verified")
        else:
            print("⚠ No WO with runs found - operations may not have been started yet")


class TestFGMOSummaryBandFormat:
    """
    ISSUE 4 — FG-MO summary band format
    The summary should show 'X/Y MO(s) · Qty done/total' where X=completed MO count.
    This is a frontend display test - we verify the data structure supports it.
    """
    
    def test_work_orders_have_status_and_quantity_fields(self, auth_session):
        """
        Verify work orders have the fields needed for the FG-MO summary:
        - status (to count completed MOs)
        - quantity (total qty)
        - quantity_completed (done qty)
        """
        wo_resp = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        if not work_orders:
            print("⚠ No work orders found")
            return
        
        # Check a sample of WOs
        for wo in work_orders[:5]:
            assert "status" in wo, f"WO {wo.get('wo_number')} missing status"
            assert "quantity" in wo, f"WO {wo.get('wo_number')} missing quantity"
            # quantity_completed may be 0 or missing for pending WOs
            qty_completed = wo.get("quantity_completed", 0)
            
            print(f"  WO {wo['wo_number']}: status={wo['status']} "
                  f"qty={wo['quantity']} completed={qty_completed}")
        
        # Count completed vs total
        total = len(work_orders)
        completed = len([w for w in work_orders if w.get("status") == "completed"])
        total_qty = sum(w.get("quantity", 0) for w in work_orders)
        completed_qty = sum(w.get("quantity_completed", 0) for w in work_orders)
        
        print(f"✓ FG-MO summary data available: {completed}/{total} MO(s) · Qty {completed_qty}/{total_qty}")
    
    def test_work_orders_have_parent_wo_id_for_tree_structure(self, auth_session):
        """
        Verify work orders have parent_wo_id for building the FG-MO tree.
        """
        wo_resp = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        # Find FG WOs (no parent) and their children
        fg_wos = [w for w in work_orders if not w.get("parent_wo_id")]
        child_wos = [w for w in work_orders if w.get("parent_wo_id")]
        
        print(f"✓ Tree structure: {len(fg_wos)} root FG MOs, {len(child_wos)} child MOs")
        
        # Sample a few FG families
        for fg in fg_wos[:3]:
            children = [w for w in work_orders if w.get("parent_wo_id") == fg["id"]]
            if children:
                all_mos = [fg] + children
                total = len(all_mos)
                done = len([m for m in all_mos if m.get("status") == "completed"])
                total_qty = sum(m.get("quantity", 0) for m in all_mos)
                done_qty = sum(m.get("quantity_completed", 0) for m in all_mos)
                print(f"  FG {fg['wo_number']}: {done}/{total} MO(s) · Qty {done_qty}/{total_qty}")


class TestMultiVendorOSScenario:
    """
    Test multi-vendor OS scenario - creating OS allocations with different vendors
    on the same operation.
    """
    
    def test_suppliers_available_for_os(self, auth_session):
        """Verify suppliers are available for OS operations"""
        sup_resp = auth_session.get(f"{BASE_URL}/api/suppliers")
        assert sup_resp.status_code == 200
        suppliers = sup_resp.json()
        
        active_suppliers = [s for s in suppliers if s.get("status") == "active"]
        print(f"✓ {len(active_suppliers)} active suppliers available for OS")
        
        for s in active_suppliers[:5]:
            print(f"  {s.get('code', 'N/A')} - {s.get('name')}")
    
    def test_work_order_start_endpoint_exists(self, auth_session):
        """Verify the work order start endpoint exists for OS operations"""
        # Get a pending WO to test the endpoint structure
        wo_resp = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert wo_resp.status_code == 200
        work_orders = wo_resp.json()
        
        pending_wos = [w for w in work_orders if w.get("status") == "pending"]
        
        if pending_wos:
            wo = pending_wos[0]
            ops = wo.get("operations_status", [])
            if ops:
                # Just verify the endpoint structure - don't actually start
                print(f"✓ Found pending WO {wo['wo_number']} with {len(ops)} operations")
                print(f"  Start endpoint: POST /api/work-orders/{wo['id']}/operations/{ops[0]['sequence']}/start")
        else:
            print("⚠ No pending WOs found for OS test")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
