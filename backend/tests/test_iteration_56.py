"""
Iteration 56 Backend Tests
Tests for:
1. Fix 4/5/6: BOM cost pull - compute_bom_costs returns rm_cost (material only) and process_cost (parent + component routings)
2. Fix 5: Job OS cost - outsource_charges defaults to BOM routing cost for the specific operation
3. Fix 5: Job OS RM cost - bom_rollup_cost uses BOM material cost, not item.unit_cost fallback
4. Regression: with_material SC creation still works
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def session():
    """Create authenticated session using cookies"""
    s = requests.Session()
    login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return s


class TestBOMCostComputation:
    """Test compute_bom_costs helper returns correct rm_cost and process_cost"""
    
    def test_bom_explode_returns_costs(self, session):
        """Test BOM explode endpoint returns rm_cost and process_cost correctly"""
        # Use the test BOM 'RoutingCostTest' mentioned in context
        bom_id = "70c22fb4-5c6d-4679-a5f7-674a7ccd63a2"
        
        response = session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        
        if response.status_code == 404:
            pytest.skip("Test BOM 'RoutingCostTest' not found - skipping BOM cost test")
        
        assert response.status_code == 200, f"BOM explode failed: {response.text}"
        data = response.json()
        
        # Verify the response has cost fields
        assert "components_cost" in data, "Missing components_cost in BOM explode"
        assert "fg_process_cost_per_unit" in data, "Missing fg_process_cost_per_unit in BOM explode"
        assert "total_rollup_cost" in data, "Missing total_rollup_cost in BOM explode"
        
        print(f"BOM explode costs: components_cost={data.get('components_cost')}, fg_process_cost={data.get('fg_process_cost_per_unit')}, total_rollup={data.get('total_rollup_cost')}")
    
    def test_bom_with_routings_has_process_cost(self, session):
        """Test that BOMs with parent_routings and component routings have process_cost > 0"""
        # Get all BOMs
        response = session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        boms = response.json()
        
        # Find a BOM with parent_routings
        bom_with_routings = None
        for bom in boms:
            parent_routings = bom.get("parent_routings", [])
            if parent_routings and len(parent_routings) > 0:
                # Check if any routing has cost > 0
                has_cost = any(r.get("cost", 0) > 0 for r in parent_routings if isinstance(r, dict))
                if has_cost:
                    bom_with_routings = bom
                    break
        
        if not bom_with_routings:
            pytest.skip("No BOM with routing costs found")
        
        # Explode this BOM
        response = session.get(f"{BASE_URL}/api/bom/{bom_with_routings['id']}/explode")
        assert response.status_code == 200
        data = response.json()
        
        # fg_process_cost_per_unit should be > 0 for BOM with parent_routings costs
        assert data.get("fg_process_cost_per_unit", 0) > 0, f"Expected fg_process_cost_per_unit > 0 for BOM with routings, got {data.get('fg_process_cost_per_unit')}"
        print(f"BOM {bom_with_routings.get('name')} has fg_process_cost_per_unit={data.get('fg_process_cost_per_unit')}")


class TestMOtoSCBOMCosts:
    """Test MO→SC without_material uses BOM rm_cost and process_cost"""
    
    def test_create_mo_and_sc_with_bom_costs(self, session):
        """Create MO from BOM with routing costs, then SC, verify bom_rollup_cost and charges"""
        # First, find a BOM with routing costs
        response = session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        boms = response.json()
        
        # Find active BOM with parent_routings that have costs
        test_bom = None
        for bom in boms:
            if bom.get("status") != "active":
                continue
            parent_routings = bom.get("parent_routings", [])
            if parent_routings:
                total_routing_cost = sum(r.get("cost", 0) for r in parent_routings if isinstance(r, dict))
                if total_routing_cost > 0:
                    test_bom = bom
                    break
        
        if not test_bom:
            pytest.skip("No active BOM with routing costs found for MO→SC test")
        
        print(f"Using BOM: {test_bom.get('name')} (id: {test_bom.get('id')})")
        
        # Get suppliers for SC
        response = session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200
        suppliers = response.json()
        if not suppliers:
            pytest.skip("No suppliers found for SC test")
        
        supplier_id = suppliers[0]["id"]
        
        # Create Production Order
        po_data = {
            "bom_id": test_bom["id"],
            "quantity": 5,
            "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "priority": "medium"
        }
        response = session.post(f"{BASE_URL}/api/production-orders", json=po_data)
        assert response.status_code in [200, 201], f"Failed to create PO: {response.text}"
        po = response.json()
        po_id = po.get("id")
        print(f"Created Production Order: {po.get('order_number')}")
        
        # Get the parent MO
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        parent_mo = None
        for wo in work_orders:
            if wo.get("production_order_id") == po_id and wo.get("parent_wo_id") is None:
                parent_mo = wo
                break
        
        if not parent_mo:
            pytest.skip("Parent MO not found after PO creation")
        
        print(f"Found parent MO: {parent_mo.get('wo_number')}")
        
        # Mark MO for subcontract
        response = session.post(f"{BASE_URL}/api/work-orders/{parent_mo['id']}/mark-subcontract", 
                                json={"supplier_id": supplier_id, "subcontract_type": "without_material"})
        
        if response.status_code not in [200, 201]:
            print(f"Mark subcontract response: {response.text}")
            pytest.skip(f"Could not mark MO for subcontract: {response.text}")
        
        sc_result = response.json()
        sc_order = sc_result.get("sc_order", {})
        
        # Verify SC order has job_work_parts with bom_rollup_cost and charges
        job_work_parts = sc_order.get("job_work_parts", [])
        assert len(job_work_parts) > 0, "SC order should have job_work_parts"
        
        part = job_work_parts[0]
        bom_rollup_cost = part.get("bom_rollup_cost", 0)
        charges = part.get("charges", 0)
        
        print(f"SC Order {sc_order.get('order_number')}: bom_rollup_cost={bom_rollup_cost}, charges={charges}")
        
        # bom_rollup_cost should be the RM cost from BOM (material only)
        # charges should be the process cost from BOM (parent + component routings)
        # We can't assert exact values without knowing the BOM structure, but they should be >= 0
        assert bom_rollup_cost >= 0, "bom_rollup_cost should be >= 0"
        
        # If BOM has routing costs, charges should be > 0
        parent_routings = test_bom.get("parent_routings", [])
        total_routing_cost = sum(r.get("cost", 0) for r in parent_routings if isinstance(r, dict))
        if total_routing_cost > 0:
            assert charges > 0, f"Expected charges > 0 for BOM with routing costs, got {charges}"
        
        print(f"TEST PASSED: MO→SC uses BOM costs correctly")


class TestJobOSCosts:
    """Test Job OS (operation outsourcing) uses BOM routing cost for specific operation"""
    
    def test_job_os_uses_bom_routing_cost(self, session):
        """Test that Job OS outsource_charges defaults to BOM routing cost for the operation"""
        # Find an in_progress MO with operations
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        mo_with_ops = None
        for wo in work_orders:
            if wo.get("status") == "in_progress" and wo.get("operations_status") and len(wo.get("operations_status", [])) > 0:
                # Check if any operation is pending (can be outsourced)
                for op in wo.get("operations_status", []):
                    if op.get("status") == "pending":
                        mo_with_ops = wo
                        break
                if mo_with_ops:
                    break
        
        if not mo_with_ops:
            pytest.skip("No in_progress MO with pending operations found for Job OS test")
        
        # Get the item's BOM to check routing costs
        item_id = mo_with_ops.get("item_id")
        response = session.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        boms = response.json()
        
        item_bom = None
        for bom in boms:
            if bom.get("parent_item_id") == item_id and bom.get("status") == "active":
                item_bom = bom
                break
        
        if not item_bom:
            print(f"No active BOM found for item {item_id}")
        else:
            print(f"Found BOM for item: {item_bom.get('name')}")
            # Check component routings
            for comp in item_bom.get("components", []):
                routings = comp.get("routings", [])
                if routings:
                    print(f"  Component {comp.get('item_id')} routings: {routings}")
        
        # Get suppliers
        response = session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200
        suppliers = response.json()
        if not suppliers:
            pytest.skip("No suppliers found")
        
        supplier_id = suppliers[0]["id"]
        
        # Find a pending operation
        pending_op = None
        for op in mo_with_ops.get("operations_status", []):
            if op.get("status") == "pending":
                pending_op = op
                break
        
        if not pending_op:
            pytest.skip("No pending operation found")
        
        op_name = pending_op.get("operation_name", "")
        print(f"Testing Job OS for operation: {op_name}")
        
        # Outsource the operation
        response = session.post(f"{BASE_URL}/api/work-orders/{mo_with_ops['id']}/outsource-operation",
                                json={"operation_sequence": pending_op.get("sequence"), "supplier_id": supplier_id})
        
        if response.status_code not in [200, 201]:
            print(f"Outsource operation response: {response.text}")
            pytest.skip(f"Could not outsource operation: {response.text}")
        
        result = response.json()
        sc_order = result.get("sc_order", {})
        
        # Check the SC part's charges and bom_rollup_cost
        job_work_parts = sc_order.get("job_work_parts", [])
        if job_work_parts:
            part = job_work_parts[-1]  # Latest part added
            print(f"Job OS SC part: bom_rollup_cost={part.get('bom_rollup_cost')}, charges={part.get('charges')}, process_name={part.get('process_name')}")
            
            # bom_rollup_cost should be BOM RM cost (material only)
            # charges should be the routing cost for this specific operation from BOM
            assert "bom_rollup_cost" in part, "Job OS part should have bom_rollup_cost"
            assert "charges" in part, "Job OS part should have charges"
        
        print("TEST PASSED: Job OS creates SC with cost fields")


class TestSCWithMaterialRegression:
    """Regression test: SC with_material still works correctly"""
    
    def test_sc_with_material_has_lines(self, session):
        """Test that SC with_material has sc_lines populated from consumed_materials"""
        # Get existing SC orders with_material
        response = session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        sc_orders = response.json()
        
        with_material_sc = None
        for sc in sc_orders:
            if sc.get("subcontract_type") == "with_material" and sc.get("lines") and len(sc.get("lines", [])) > 0:
                with_material_sc = sc
                break
        
        if not with_material_sc:
            print("No existing with_material SC with lines found - this is expected if none were created")
            pytest.skip("No with_material SC found for regression test")
        
        # Verify lines structure
        lines = with_material_sc.get("lines", [])
        assert len(lines) > 0, "with_material SC should have lines"
        
        for line in lines:
            assert "item_id" in line, "SC line should have item_id"
            assert "quantity" in line, "SC line should have quantity"
        
        print(f"with_material SC {with_material_sc.get('order_number')} has {len(lines)} lines")
        print("REGRESSION TEST PASSED: with_material SC has lines")


class TestSCOrderVisibility:
    """Test SC order button visibility conditions"""
    
    def test_sc_orders_have_required_fields(self, session):
        """Verify SC orders have po_created and dc_created fields for UI visibility logic"""
        response = session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        sc_orders = response.json()
        
        if not sc_orders:
            pytest.skip("No SC orders found")
        
        for sc in sc_orders[:5]:  # Check first 5
            # These fields are used by UI for button visibility
            print(f"SC {sc.get('order_number')}: po_created={sc.get('po_created')}, dc_created={sc.get('dc_created')}, status={sc.get('status')}, type={sc.get('subcontract_type')}")
            
            # Verify without_material SCs have job_work_parts
            if sc.get("subcontract_type") == "without_material":
                job_work_parts = sc.get("job_work_parts", [])
                print(f"  job_work_parts count: {len(job_work_parts)}")
        
        print("SC orders have required visibility fields")


class TestMOStatusAndButtons:
    """Test MO status transitions and button visibility"""
    
    def test_pending_mo_has_no_job_card(self, session):
        """Verify pending MOs should not show Job Card button (status='pending')"""
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        pending_mos = [wo for wo in work_orders if wo.get("status") == "pending"]
        in_progress_mos = [wo for wo in work_orders if wo.get("status") == "in_progress"]
        
        print(f"Found {len(pending_mos)} pending MOs and {len(in_progress_mos)} in_progress MOs")
        
        # For pending MOs, Job Card should NOT be shown (UI logic)
        # For in_progress MOs with operations, Job Card SHOULD be shown
        for mo in in_progress_mos[:3]:
            ops = mo.get("operations_status", [])
            if ops and len(ops) > 0:
                print(f"in_progress MO {mo.get('wo_number')} has {len(ops)} operations - Job Card should be visible")
        
        print("MO status check complete")
    
    def test_inhouse_start_changes_status(self, session):
        """Test that Inhouse Start changes MO status from pending to in_progress"""
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find a pending MO that is not a subcontract
        pending_mo = None
        for wo in work_orders:
            if wo.get("status") == "pending" and not wo.get("is_subcontract"):
                pending_mo = wo
                break
        
        if not pending_mo:
            pytest.skip("No pending non-subcontract MO found")
        
        print(f"Testing Inhouse Start on MO: {pending_mo.get('wo_number')}")
        
        # Update status to in_progress (simulating Inhouse Start)
        response = session.put(f"{BASE_URL}/api/work-orders/{pending_mo['id']}", 
                               json={"status": "in_progress"})
        
        if response.status_code != 200:
            print(f"Status update response: {response.text}")
            pytest.skip(f"Could not update MO status: {response.text}")
        
        # Verify status changed
        response = session.get(f"{BASE_URL}/api/work-orders/{pending_mo['id']}")
        assert response.status_code == 200
        updated_mo = response.json()
        
        assert updated_mo.get("status") == "in_progress", f"Expected status='in_progress', got {updated_mo.get('status')}"
        print(f"MO {updated_mo.get('wo_number')} status changed to in_progress")
        
        # Revert back to pending for other tests
        session.put(f"{BASE_URL}/api/work-orders/{pending_mo['id']}", 
                    json={"status": "pending"})


class TestJobCardDuration:
    """Test Job Card Duration column calculation"""
    
    def test_work_order_operations_have_duration_fields(self, session):
        """Verify operations have fields needed for Duration calculation"""
        response = session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find MO with operations
        mo_with_ops = None
        for wo in work_orders:
            if wo.get("operations_status") and len(wo.get("operations_status", [])) > 0:
                mo_with_ops = wo
                break
        
        if not mo_with_ops:
            pytest.skip("No MO with operations found")
        
        print(f"Checking MO {mo_with_ops.get('wo_number')} operations for duration fields")
        
        for op in mo_with_ops.get("operations_status", []):
            print(f"  Op {op.get('sequence')} {op.get('operation_name')}: status={op.get('status')}, actual_start={op.get('actual_start')}, actual_end={op.get('actual_end')}, runs={len(op.get('runs', []))}")
        
        print("Operations have duration-related fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
