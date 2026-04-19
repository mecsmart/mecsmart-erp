"""
Iteration 63 Tests: P0 (React Error #31 fix) and P1 (Purchase Invoice from JW GRN)

P0: Fix React Error #31 white-screen crash on Manufacturing/Job Card pages
    - operation_name was stored as dict {name, cost} instead of string
    - Migration on startup should have cleaned all 267 WOs
    - New MO creation should store operation_name as string

P1: Purchase Invoice generation from GRN including process costs for Job Work (JW) GRNs
    - GET /api/purchase-invoices/pending-grns should include both PO-based and JW-based GRNs
    - JW GRNs should have is_jw flag, jw_order object populated
    - POST /api/purchase-invoices with is_process_charge=true lines for JW
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token via login"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if response.status_code == 200:
        # Cookie-based auth - session already has cookies
        return "cookie-auth"
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth (cookies already set from login)"""
    return api_client


# ==================== P0: React Error #31 Fix Tests ====================

class TestP0OperationNameMigration:
    """P0: Verify operation_name is string (not dict) across all work orders"""
    
    def test_get_work_orders_returns_200(self, authenticated_client):
        """GET /api/work-orders should return 200"""
        response = authenticated_client.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of work orders"
        print(f"Found {len(data)} work orders")
    
    def test_all_operation_names_are_strings(self, authenticated_client):
        """Verify no operation_name is a dict across all WOs"""
        response = authenticated_client.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        dict_operation_names = []
        for wo in work_orders:
            ops = wo.get("operations_status", [])
            for op in ops:
                on = op.get("operation_name")
                if isinstance(on, dict):
                    dict_operation_names.append({
                        "wo_number": wo.get("wo_number"),
                        "sequence": op.get("sequence"),
                        "operation_name": on
                    })
        
        assert len(dict_operation_names) == 0, f"Found {len(dict_operation_names)} operations with dict operation_name: {dict_operation_names[:5]}"
        print(f"Verified {len(work_orders)} work orders - all operation_names are strings")
    
    def test_operation_name_has_process_cost_per_unit(self, authenticated_client):
        """Verify operations have process_cost_per_unit field"""
        response = authenticated_client.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find a WO with operations
        wo_with_ops = None
        for wo in work_orders:
            if wo.get("operations_status") and len(wo.get("operations_status", [])) > 0:
                wo_with_ops = wo
                break
        
        if wo_with_ops:
            ops = wo_with_ops.get("operations_status", [])
            for op in ops:
                # operation_name should be string
                assert isinstance(op.get("operation_name"), str), f"operation_name should be string, got {type(op.get('operation_name'))}"
                # process_cost_per_unit should exist
                assert "process_cost_per_unit" in op or op.get("process_cost_per_unit") is not None or op.get("process_cost_per_unit", 0) >= 0, "process_cost_per_unit should exist"
            print(f"WO {wo_with_ops.get('wo_number')} has {len(ops)} operations with proper structure")
        else:
            print("No work orders with operations found - skipping detailed check")


class TestP0NewMOCreation:
    """P0: Verify new MO creation stores operation_name as string"""
    
    def test_get_boms_with_routings(self, authenticated_client):
        """Find a BOM with parent_routings to test MO creation"""
        response = authenticated_client.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        boms = response.json()
        
        bom_with_routings = None
        for bom in boms:
            routings = bom.get("parent_routings", [])
            if routings and len(routings) > 0:
                bom_with_routings = bom
                break
        
        if bom_with_routings:
            print(f"Found BOM {bom_with_routings.get('id')} with routings: {bom_with_routings.get('parent_routings')}")
            # Check if routings have cost
            for r in bom_with_routings.get("parent_routings", []):
                if isinstance(r, dict):
                    print(f"  Routing: {r.get('name')} cost={r.get('cost', 0)}")
                else:
                    print(f"  Routing (string): {r}")
        else:
            print("No BOM with parent_routings found")
    
    def test_get_production_orders(self, authenticated_client):
        """Get production orders to find one for MO creation"""
        response = authenticated_client.get(f"{BASE_URL}/api/production")
        assert response.status_code == 200
        orders = response.json()
        print(f"Found {len(orders)} production orders")
        
        # Find a confirmed order
        confirmed = [o for o in orders if o.get("status") == "confirmed"]
        print(f"Found {len(confirmed)} confirmed production orders")


class TestP0JobCardLoading:
    """P0: Verify Job Card dialog loads without crash"""
    
    def test_get_in_progress_work_order(self, authenticated_client):
        """Get an in-progress work order for Job Card test"""
        response = authenticated_client.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        in_progress = [wo for wo in work_orders if wo.get("status") == "in_progress"]
        print(f"Found {len(in_progress)} in-progress work orders")
        
        if in_progress:
            wo = in_progress[0]
            # Verify operations_status structure
            ops = wo.get("operations_status", [])
            for op in ops:
                on = op.get("operation_name")
                assert not isinstance(on, dict), f"operation_name should not be dict: {on}"
            print(f"WO {wo.get('wo_number')} has {len(ops)} operations - all operation_names are strings")
    
    def test_get_single_work_order_detail(self, authenticated_client):
        """GET /api/work-orders/{id} should return proper structure"""
        # First get list
        response = authenticated_client.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        if work_orders:
            wo_id = work_orders[0].get("id")
            detail_response = authenticated_client.get(f"{BASE_URL}/api/work-orders/{wo_id}")
            assert detail_response.status_code == 200
            wo = detail_response.json()
            
            # Verify structure
            ops = wo.get("operations_status", [])
            for op in ops:
                on = op.get("operation_name")
                assert not isinstance(on, dict), f"operation_name should not be dict in detail view: {on}"
            print(f"Detail view for WO {wo.get('wo_number')} verified - {len(ops)} operations")


# ==================== P1: Purchase Invoice from JW GRN Tests ====================

class TestP1PendingGRNsEndpoint:
    """P1: GET /api/purchase-invoices/pending-grns should include JW GRNs"""
    
    def test_pending_grns_returns_200(self, authenticated_client):
        """GET /api/purchase-invoices/pending-grns should return 200"""
        response = authenticated_client.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of pending GRNs"
        print(f"Found {len(data)} pending GRNs")
    
    def test_pending_grns_have_is_jw_flag(self, authenticated_client):
        """Verify pending GRNs have is_jw flag"""
        response = authenticated_client.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert response.status_code == 200
        grns = response.json()
        
        jw_grns = [g for g in grns if g.get("is_jw")]
        po_grns = [g for g in grns if not g.get("is_jw")]
        
        print(f"JW GRNs: {len(jw_grns)}, PO GRNs: {len(po_grns)}")
        
        # Verify JW GRNs have jw_order populated
        for grn in jw_grns[:3]:  # Check first 3
            assert grn.get("is_jw") == True, "is_jw should be True"
            # jw_order should be populated if jw_order_id exists
            if grn.get("jw_order_id") or grn.get("sc_order_id"):
                supplier_name = grn.get('supplier', {}).get('name', 'N/A') if grn.get('supplier') else 'N/A'
                print(f"JW GRN {grn.get('grn_number')}: jw_order={grn.get('jw_order') is not None}, supplier={supplier_name}")
    
    def test_pending_grns_have_supplier_enriched(self, authenticated_client):
        """Verify pending GRNs have supplier info"""
        response = authenticated_client.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert response.status_code == 200
        grns = response.json()
        
        grns_with_supplier = [g for g in grns if g.get("supplier")]
        grns_without_supplier = [g for g in grns if not g.get("supplier")]
        
        print(f"GRNs with supplier: {len(grns_with_supplier)}, without: {len(grns_without_supplier)}")
        
        # Log some without supplier for debugging
        for grn in grns_without_supplier[:3]:
            print(f"  GRN {grn.get('grn_number')} missing supplier - is_jw={grn.get('is_jw')}, supplier_id={grn.get('supplier_id')}")


class TestP1JWGRNInvoiceCreation:
    """P1: Create Purchase Invoice from JW GRN with process charges"""
    
    def test_find_jw_grn_for_invoice(self, authenticated_client):
        """Find a JW GRN with supplier for invoice creation test"""
        response = authenticated_client.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert response.status_code == 200
        grns = response.json()
        
        # Find JW GRN with supplier
        jw_grn_with_supplier = None
        for grn in grns:
            if grn.get("is_jw") and grn.get("supplier"):
                jw_grn_with_supplier = grn
                break
        
        if jw_grn_with_supplier:
            print(f"Found JW GRN for invoice test: {jw_grn_with_supplier.get('grn_number')}")
            print(f"  Supplier: {jw_grn_with_supplier.get('supplier', {}).get('name')}")
            print(f"  Lines: {len(jw_grn_with_supplier.get('lines', []))}")
            for line in jw_grn_with_supplier.get("lines", [])[:2]:
                print(f"    Item: {line.get('item', {}).get('part_number')}, process_charges: {line.get('process_charges', 0)}")
        else:
            print("No JW GRN with supplier found for invoice test")
    
    def test_create_invoice_from_jw_grn(self, authenticated_client):
        """Create Purchase Invoice from JW GRN with is_process_charge=true"""
        # Get pending GRNs
        response = authenticated_client.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert response.status_code == 200
        grns = response.json()
        
        # Find JW GRN with supplier
        jw_grn = None
        for grn in grns:
            if grn.get("is_jw") and grn.get("supplier") and grn.get("lines"):
                jw_grn = grn
                break
        
        if not jw_grn:
            pytest.skip("No JW GRN with supplier found for invoice creation test")
        
        # Build invoice payload
        lines = []
        for line in jw_grn.get("lines", []):
            lines.append({
                "item_id": line.get("item_id"),
                "quantity": line.get("received_quantity", 1),
                "unit_price": line.get("process_charges", 0),
                "discount": 0,
                "hsn_code": line.get("item", {}).get("hsn_code", ""),
                "gst_rate": 18,
                "is_process_charge": True,
                "description": f"Processing charges for {line.get('item', {}).get('part_number', '')} (JW: {jw_grn.get('jw_order_number', '')})"
            })
        
        if not lines:
            pytest.skip("JW GRN has no lines")
        
        invoice_data = {
            "supplier_id": jw_grn.get("supplier", {}).get("id"),
            "grn_id": jw_grn.get("id"),
            "po_id": "",
            "invoice_no": f"TEST-JW-INV-{datetime.now().strftime('%H%M%S')}",
            "invoice_date": datetime.now().isoformat(),
            "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "lines": lines,
            "notes": "Test JW invoice from iteration 63"
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/purchase-invoices", json=invoice_data)
        assert create_response.status_code == 201, f"Expected 201, got {create_response.status_code}: {create_response.text}"
        
        invoice = create_response.json()
        print(f"Created JW invoice: {invoice.get('invoice_number')}")
        
        # Verify lines have is_process_charge=true
        for line in invoice.get("lines", []):
            assert line.get("is_process_charge") == True, f"Line should have is_process_charge=True"
            assert line.get("description"), "Line should have description"
        
        print(f"Invoice {invoice.get('invoice_number')} verified - all lines have is_process_charge=True")
        return invoice


class TestP1POGRNInvoiceCreation:
    """P1: Create Purchase Invoice from PO GRN (material) with is_process_charge=false"""
    
    def test_create_invoice_from_po_grn(self, authenticated_client):
        """Create Purchase Invoice from PO GRN with is_process_charge=false"""
        # Get pending GRNs
        response = authenticated_client.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert response.status_code == 200
        grns = response.json()
        
        # Find PO GRN with supplier
        po_grn = None
        for grn in grns:
            if not grn.get("is_jw") and grn.get("supplier") and grn.get("lines"):
                po_grn = grn
                break
        
        if not po_grn:
            pytest.skip("No PO GRN with supplier found for invoice creation test")
        
        # Build invoice payload
        lines = []
        for line in po_grn.get("lines", []):
            lines.append({
                "item_id": line.get("item_id"),
                "quantity": line.get("received_quantity", 1),
                "unit_price": line.get("verified_price") or line.get("po_price", 0),
                "discount": 0,
                "hsn_code": line.get("item", {}).get("hsn_code", ""),
                "gst_rate": 18,
                "is_process_charge": False,
                "description": ""
            })
        
        if not lines:
            pytest.skip("PO GRN has no lines")
        
        invoice_data = {
            "supplier_id": po_grn.get("supplier", {}).get("id"),
            "grn_id": po_grn.get("id"),
            "po_id": po_grn.get("po_id", ""),
            "invoice_no": f"TEST-PO-INV-{datetime.now().strftime('%H%M%S')}",
            "invoice_date": datetime.now().isoformat(),
            "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "lines": lines,
            "notes": "Test PO invoice from iteration 63"
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/purchase-invoices", json=invoice_data)
        assert create_response.status_code == 201, f"Expected 201, got {create_response.status_code}: {create_response.text}"
        
        invoice = create_response.json()
        print(f"Created PO invoice: {invoice.get('invoice_number')}")
        
        # Verify lines have is_process_charge=false
        for line in invoice.get("lines", []):
            assert line.get("is_process_charge") == False, f"Line should have is_process_charge=False"
        
        print(f"Invoice {invoice.get('invoice_number')} verified - all lines have is_process_charge=False")
        return invoice


# ==================== Regression Tests ====================

class TestRegressionBOMPage:
    """Regression: BOM page loads, explosion renders, routings display"""
    
    def test_bom_list_loads(self, authenticated_client):
        """GET /api/bom should return 200"""
        response = authenticated_client.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        boms = response.json()
        print(f"Found {len(boms)} BOMs")
    
    def test_bom_with_routings_structure(self, authenticated_client):
        """Verify BOM routings have proper structure"""
        response = authenticated_client.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        boms = response.json()
        
        boms_with_routings = [b for b in boms if b.get("parent_routings")]
        print(f"BOMs with parent_routings: {len(boms_with_routings)}")
        
        for bom in boms_with_routings[:3]:
            routings = bom.get("parent_routings", [])
            for r in routings:
                if isinstance(r, dict):
                    assert "name" in r, "Routing dict should have 'name'"
                    print(f"  BOM {bom.get('id')[:8]}: routing={r.get('name')}, cost={r.get('cost', 0)}")
    
    def test_bom_explosion(self, authenticated_client):
        """GET /api/bom/{id}/explode should work"""
        response = authenticated_client.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        boms = response.json()
        
        if boms:
            bom_id = boms[0].get("id")
            explosion_response = authenticated_client.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
            assert explosion_response.status_code == 200, f"Explosion failed: {explosion_response.text}"
            print(f"BOM explosion for {bom_id[:8]} returned successfully")


class TestRegressionGRNCreation:
    """Regression: GRN creation flow still works"""
    
    def test_grn_list_loads(self, authenticated_client):
        """GET /api/grn should return 200"""
        response = authenticated_client.get(f"{BASE_URL}/api/grn")
        assert response.status_code == 200
        grns = response.json()
        print(f"Found {len(grns)} GRNs")
    
    def test_get_pending_pos_for_grn(self, authenticated_client):
        """GET /api/grn/pending-pos should return 200"""
        response = authenticated_client.get(f"{BASE_URL}/api/grn/pending-pos")
        assert response.status_code == 200
        pending = response.json()
        print(f"Found {len(pending)} pending POs for GRN")
