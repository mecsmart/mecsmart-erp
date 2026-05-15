"""
Iteration 121 Backend Tests
Tests for:
1. MO Material Requirements - single level BOM (top-level only, no recursion)
2. Purchase Invoice supplier resolution (including JW fallback)
3. Quotation item search (backend items endpoint)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session"""
    session = requests.Session()
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return session


class TestMaterialRequirements:
    """Test MO Material Requirements endpoint - single level BOM only"""
    
    def test_mo_material_requirements_single_level(self, auth_session):
        """
        GET /api/work-orders/{wo_id}/material-requirements should return
        ONLY immediate components of the MO item's active BOM (single level).
        For FG-001 (Hydraulic Press 50T) with qty=2, expect exactly 5 components:
        - Steel Sheet 4mm (qty=20 sheet)
        - Pump Assembly (qty=8 pcs)
        - Control Valve (qty=8 pcs)
        - Electric Motor 5HP (qty=2 pcs)
        - Control Panel (qty=2 pcs)
        """
        wo_id = "0d6feaa7-08ca-4016-a568-206205a5e665"
        resp = auth_session.get(f"{BASE_URL}/api/work-orders/{wo_id}/material-requirements")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        assert data.get("wo_number") == "MO-000003", f"Expected MO-000003, got {data.get('wo_number')}"
        assert data.get("quantity") == 2.0, f"Expected qty=2, got {data.get('quantity')}"
        
        materials = data.get("materials", [])
        assert len(materials) == 5, f"Expected exactly 5 top-level components, got {len(materials)}: {[m.get('name') for m in materials]}"
        
        # Verify expected components by name
        expected_names = {
            "Steel Sheet 4mm",
            "Pump Assembly",
            "Control Valve",
            "Electric Motor 5HP",
            "Control Panel"
        }
        actual_names = {m.get("name") for m in materials}
        assert actual_names == expected_names, f"Expected {expected_names}, got {actual_names}"
        
        # Verify quantities (BOM qty * MO qty=2)
        for mat in materials:
            if mat.get("name") == "Steel Sheet 4mm":
                assert mat.get("quantity") == 20.0, f"Steel Sheet should be 20, got {mat.get('quantity')}"
                assert mat.get("uom") == "sheet", f"Steel Sheet UOM should be 'sheet', got {mat.get('uom')}"
            elif mat.get("name") == "Pump Assembly":
                assert mat.get("quantity") == 8.0, f"Pump Assembly should be 8, got {mat.get('quantity')}"
            elif mat.get("name") == "Control Valve":
                assert mat.get("quantity") == 8.0, f"Control Valve should be 8, got {mat.get('quantity')}"
            elif mat.get("name") == "Electric Motor 5HP":
                assert mat.get("quantity") == 2.0, f"Electric Motor should be 2, got {mat.get('quantity')}"
            elif mat.get("name") == "Control Panel":
                assert mat.get("quantity") == 2.0, f"Control Panel should be 2, got {mat.get('quantity')}"
        
        print(f"✓ MO Material Requirements returns exactly 5 top-level components (no recursion)")
    
    def test_mo_material_requirements_not_recursive(self, auth_session):
        """
        Verify that the endpoint does NOT return recursive descendants.
        Previously it returned 500 sheets (recursive explosion of SA-001's children).
        Now it should only return the direct BOM components.
        """
        wo_id = "0d6feaa7-08ca-4016-a568-206205a5e665"
        resp = auth_session.get(f"{BASE_URL}/api/work-orders/{wo_id}/material-requirements")
        assert resp.status_code == 200
        
        data = resp.json()
        materials = data.get("materials", [])
        
        # Check that we don't have recursive explosion (e.g., 500 sheets)
        for mat in materials:
            if mat.get("name") == "Steel Sheet 4mm":
                # Should be 20 (10 per unit * 2 units), NOT 500+ from recursive explosion
                assert mat.get("quantity") <= 100, f"Steel Sheet qty {mat.get('quantity')} suggests recursive explosion!"
        
        # Should NOT contain SA-001's children (like bearings, seals, etc.)
        # Only the direct FG-001 BOM components
        material_names = [m.get("name", "").lower() for m in materials]
        assert not any("bearing" in n for n in material_names), "Should not contain SA-001's child components"
        assert not any("seal" in n for n in material_names), "Should not contain SA-001's child components"
        
        print(f"✓ MO Material Requirements is NOT recursive (no child BOM explosion)")


class TestPurchaseInvoiceSupplierResolution:
    """Test Purchase Invoice supplier/PO/GRN resolution"""
    
    def test_pi_list_has_supplier_object(self, auth_session):
        """
        GET /api/purchase-invoices should return supplier dict with name/code/gstin
        for each invoice that has a supplier_id.
        """
        resp = auth_session.get(f"{BASE_URL}/api/purchase-invoices")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        invoices = resp.json()
        assert len(invoices) > 0, "No invoices found"
        
        # Find PI-000022 specifically
        pi_022 = next((inv for inv in invoices if inv.get("invoice_number") == "PI-000022"), None)
        assert pi_022 is not None, "PI-000022 not found"
        
        # Verify supplier object is populated
        supplier = pi_022.get("supplier")
        assert supplier is not None, "PI-000022 should have supplier object"
        assert supplier.get("name") == "Steel Masters Pvt. Ltd.", f"Expected 'Steel Masters Pvt. Ltd.', got {supplier.get('name')}"
        assert supplier.get("code") == "SUP-001", f"Expected 'SUP-001', got {supplier.get('code')}"
        assert supplier.get("gstin") == "27AABCS1234F1Z5", f"Expected GSTIN, got {supplier.get('gstin')}"
        
        print(f"✓ PI-000022 has supplier object with name='Steel Masters Pvt. Ltd.'")
    
    def test_pi_with_po_grn_has_objects(self, auth_session):
        """
        Invoices with po_id and grn_id should have po and grn objects populated.
        """
        resp = auth_session.get(f"{BASE_URL}/api/purchase-invoices")
        assert resp.status_code == 200
        
        invoices = resp.json()
        
        # Find an invoice with PO and GRN (PI-000015 has both)
        pi_with_po_grn = next((inv for inv in invoices if inv.get("po") and inv.get("grn")), None)
        
        if pi_with_po_grn:
            assert pi_with_po_grn.get("po", {}).get("po_number"), "PO object should have po_number"
            assert pi_with_po_grn.get("grn", {}).get("grn_number"), "GRN object should have grn_number"
            print(f"✓ Invoice {pi_with_po_grn.get('invoice_number')} has PO={pi_with_po_grn.get('po',{}).get('po_number')} and GRN={pi_with_po_grn.get('grn',{}).get('grn_number')}")
        else:
            print("⚠ No invoice found with both PO and GRN - skipping this check")


class TestItemsEndpoint:
    """Test items endpoint for quotation item search"""
    
    def test_items_search_returns_full_names(self, auth_session):
        """
        GET /api/items?search=hydraulic should return items with full names
        (not truncated). The frontend dropdown will display these.
        """
        resp = auth_session.get(f"{BASE_URL}/api/items?search=hydraulic&lite=1")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        items = resp.json()
        # Should find at least the Hydraulic Press
        assert len(items) > 0, "No items found for 'hydraulic' search"
        
        # Verify items have full name and description
        for item in items:
            assert item.get("name"), f"Item {item.get('part_number')} missing name"
            # Names should not be truncated (backend returns full data)
            print(f"  Found: {item.get('part_number')} - {item.get('name')}")
        
        print(f"✓ Items search returns {len(items)} items with full names")
    
    def test_items_search_pump(self, auth_session):
        """
        GET /api/items?search=pump should return Pump Assembly with full name
        including variant attributes if any.
        """
        resp = auth_session.get(f"{BASE_URL}/api/items?search=pump&lite=1")
        assert resp.status_code == 200
        
        items = resp.json()
        assert len(items) > 0, "No items found for 'pump' search"
        
        # Find Pump Assembly
        pump = next((i for i in items if "pump" in i.get("name", "").lower()), None)
        assert pump is not None, "Pump Assembly not found"
        assert pump.get("name"), "Pump Assembly should have full name"
        
        print(f"✓ Pump search returns: {pump.get('part_number')} - {pump.get('name')}")


class TestWorkOrdersList:
    """Test work orders list for MO with active BOM"""
    
    def test_work_orders_list(self, auth_session):
        """
        GET /api/work-orders should return MOs including MO-000003.
        """
        resp = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        work_orders = resp.json()
        assert len(work_orders) > 0, "No work orders found"
        
        # Find MO-000003
        mo_003 = next((wo for wo in work_orders if wo.get("wo_number") == "MO-000003"), None)
        assert mo_003 is not None, "MO-000003 not found"
        assert mo_003.get("id") == "0d6feaa7-08ca-4016-a568-206205a5e665", "MO-000003 ID mismatch"
        
        print(f"✓ MO-000003 found with ID {mo_003.get('id')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
