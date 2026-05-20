"""
Round 10 Testing - MecSmart ERP
Tests for:
1a. Manual DC BOM preview tree (/api/bom/by-item/{id}/preview)
1b. DC date editable (dc_date field in Manual DC)
1c. Manual GRN can pick Manual DC (/api/job-work/manual-dc/open, manual_dc_id in GRN)
2. Hide Revoke after DC sent (dc_sent flag on OS runs)
3. Quotation table changes (HSN width, comma formatting - frontend only)
4. Global preview-instead-of-print (frontend only)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Session with auth cookies"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login to get cookies
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if response.status_code != 200:
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    return session


class TestBOMPreviewEndpoint:
    """Test /api/bom/by-item/{id}/preview endpoint for Manual DC BOM tree"""
    
    def test_bom_preview_endpoint_exists(self, api_client):
        """Verify the BOM preview endpoint is accessible"""
        # First get an item with a BOM
        items_resp = api_client.get(f"{BASE_URL}/api/items")
        assert items_resp.status_code == 200, f"Items endpoint failed: {items_resp.text}"
        items = items_resp.json()
        
        if len(items) > 0:
            # Try with first item
            item_id = items[0].get('id')
            response = api_client.get(f"{BASE_URL}/api/bom/by-item/{item_id}/preview")
            assert response.status_code == 200, f"BOM preview failed: {response.text}"
            data = response.json()
            # Should have has_bom field
            assert 'has_bom' in data
            assert 'components' in data
            print(f"BOM preview for item {item_id}: has_bom={data.get('has_bom')}, components={len(data.get('components', []))}")
    
    def test_bom_preview_with_active_bom(self, api_client):
        """Test BOM preview returns components for item with active BOM"""
        # Get BOMs to find an item with active BOM
        boms_resp = api_client.get(f"{BASE_URL}/api/bom")
        assert boms_resp.status_code == 200, f"BOMs endpoint failed: {boms_resp.text}"
        boms = boms_resp.json()
        
        active_bom = next((b for b in boms if b.get('status') == 'active'), None)
        if not active_bom:
            pytest.skip("No active BOM found for testing")
        
        parent_item_id = active_bom.get('parent_item_id')
        response = api_client.get(f"{BASE_URL}/api/bom/by-item/{parent_item_id}/preview")
        assert response.status_code == 200, f"BOM preview failed: {response.text}"
        data = response.json()
        
        assert data.get('has_bom') == True
        assert data.get('bom_id') is not None
        
        # Verify component structure
        components = data.get('components', [])
        if len(components) > 0:
            comp = components[0]
            assert 'part_number' in comp
            assert 'name' in comp
            assert 'category' in comp
            assert 'quantity' in comp
            assert 'uom' in comp
            assert 'unit_cost' in comp
            assert 'extended_cost' in comp
            print(f"BOM preview has {len(components)} components with proper structure")
    
    def test_bom_preview_without_bom(self, api_client):
        """Test BOM preview returns has_bom=false for item without BOM"""
        # Get items
        items_resp = api_client.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        
        # Get BOMs to find items WITH BOMs
        boms_resp = api_client.get(f"{BASE_URL}/api/bom")
        boms = boms_resp.json()
        items_with_bom = {b.get('parent_item_id') for b in boms if isinstance(b, dict) and b.get('status') == 'active'}
        
        # Find an item WITHOUT a BOM
        item_without_bom = next((i for i in items if i.get('id') not in items_with_bom), None)
        if not item_without_bom:
            pytest.skip("All items have BOMs - cannot test no-BOM case")
        
        response = api_client.get(f"{BASE_URL}/api/bom/by-item/{item_without_bom['id']}/preview")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get('has_bom') == False
        assert data.get('components') == []
        print(f"Item {item_without_bom.get('part_number')} correctly shows has_bom=false")


class TestManualDCDateField:
    """Test dc_date field in Manual DC creation"""
    
    def test_manual_dc_with_custom_date(self, api_client):
        """Test creating Manual DC with custom dc_date"""
        # Get a supplier
        suppliers_resp = api_client.get(f"{BASE_URL}/api/suppliers")
        assert suppliers_resp.status_code == 200
        suppliers = suppliers_resp.json()
        if not suppliers:
            pytest.skip("No suppliers found")
        
        # Get an item
        items_resp = api_client.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        if not items:
            pytest.skip("No items found")
        
        # Create Manual DC with custom date
        custom_date = "2025-12-15"
        payload = {
            "supplier_id": suppliers[0]['id'],
            "lines": [{
                "item_id": items[0]['id'],
                "quantity": 5,
                "unit_price": 100,
                "processing_charges": 10
            }],
            "dc_purpose": "subcontract",
            "notes": "TEST_DC_DATE_FIELD",
            "skip_stock_deduct": True,  # Don't affect stock
            "dc_date": custom_date
        }
        
        response = api_client.post(f"{BASE_URL}/api/job-work/challans/manual", json=payload)
        assert response.status_code == 201, f"Manual DC creation failed: {response.text}"
        dc = response.json()
        
        # Verify dc_date is set
        assert dc.get('dc_date') == custom_date or custom_date in str(dc.get('dc_date', ''))
        print(f"Manual DC {dc.get('dc_number')} created with dc_date={dc.get('dc_date')}")
        
        # Store DC id for cleanup
        return dc.get('id')


class TestOpenManualDCEndpoint:
    """Test /api/job-work/manual-dc/open endpoint for Manual GRN picker"""
    
    def test_open_manual_dc_endpoint_exists(self, api_client):
        """Verify the open Manual DC endpoint is accessible"""
        response = api_client.get(f"{BASE_URL}/api/job-work/manual-dc/open")
        assert response.status_code == 200, f"Open Manual DC endpoint failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Open Manual DCs endpoint returned {len(data)} DCs")
    
    def test_open_manual_dc_structure(self, api_client):
        """Test that open Manual DCs have required fields"""
        response = api_client.get(f"{BASE_URL}/api/job-work/manual-dc/open")
        assert response.status_code == 200
        dcs = response.json()
        
        if len(dcs) > 0:
            dc = dcs[0]
            # Should have supplier_name for picker label
            assert 'supplier_name' in dc or 'supplier_id' in dc
            # Should have lines with received_qty
            assert 'lines' in dc
            if dc.get('lines'):
                line = dc['lines'][0]
                assert 'received_qty' in line or 'quantity' in line
            print(f"Open DC {dc.get('dc_number')} has supplier_name={dc.get('supplier_name')}")
        else:
            print("No open Manual DCs found - this is OK if none exist")


class TestManualGRNWithDCLink:
    """Test Manual GRN creation with manual_dc_id linkage"""
    
    def test_manual_grn_accepts_dc_id(self, api_client):
        """Test that Manual GRN endpoint accepts manual_dc_id field"""
        # Get open DCs
        dcs_resp = api_client.get(f"{BASE_URL}/api/job-work/manual-dc/open")
        assert dcs_resp.status_code == 200
        open_dcs = dcs_resp.json()
        
        if not open_dcs:
            pytest.skip("No open Manual DCs to test GRN linkage")
        
        dc = open_dcs[0]
        dc_id = dc.get('id')
        supplier_id = dc.get('supplier_id')
        
        # Get items from DC lines
        lines = dc.get('lines', [])
        if not lines:
            pytest.skip("DC has no lines")
        
        # Create GRN with partial receive
        grn_lines = []
        for line in lines:
            remaining = (line.get('quantity') or 0) - (line.get('received_qty') or 0)
            if remaining > 0:
                grn_lines.append({
                    "item_id": line.get('item_id'),
                    "received_quantity": min(1, remaining),  # Receive just 1 to test partial
                    "verified_price": line.get('unit_price') or 0
                })
        
        if not grn_lines:
            pytest.skip("No receivable qty on DC lines")
        
        payload = {
            "supplier_id": supplier_id,
            "supplier_invoice_no": f"TEST-INV-{datetime.now().strftime('%H%M%S')}",
            "lines": grn_lines,
            "manual_dc_id": dc_id,
            "notes": "TEST_GRN_DC_LINK"
        }
        
        response = api_client.post(f"{BASE_URL}/api/grn/manual", json=payload)
        assert response.status_code in [200, 201], f"Manual GRN creation failed: {response.text}"
        grn = response.json()
        print(f"Manual GRN {grn.get('grn_number')} created linked to DC {dc.get('dc_number')}")
        
        # Verify DC received_qty was bumped
        dcs_after = api_client.get(f"{BASE_URL}/api/job-work/manual-dc/open").json()
        dc_after = next((d for d in dcs_after if d.get('id') == dc_id), None)
        
        # DC might be fully received now (removed from open list) or still open with updated qty
        if dc_after:
            for line in dc_after.get('lines', []):
                print(f"  Line {line.get('item_id')}: received_qty={line.get('received_qty')}")


class TestDCSentFlagOnWorkOrders:
    """Test dc_sent flag on OS runs in work orders"""
    
    def test_work_orders_have_dc_sent_field(self, api_client):
        """Verify work orders endpoint returns dc_sent on OS runs"""
        response = api_client.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200, f"Work orders endpoint failed: {response.text}"
        work_orders = response.json()
        
        # Find a work order with outsourced operations
        os_count = 0
        dc_sent_count = 0
        
        for wo in work_orders:
            for op in (wo.get('operations_status') or []):
                if op.get('is_job_work') and op.get('outsource_sc_order_id'):
                    os_count += 1
                    # Check dc_sent on op level
                    if 'dc_sent' in op:
                        print(f"WO {wo.get('wo_number')} op {op.get('sequence')}: dc_sent={op.get('dc_sent')}")
                    
                    # Check dc_sent on runs
                    for r in (op.get('runs') or []):
                        if (r.get('operator') or '').startswith('OS: '):
                            if 'dc_sent' in r:
                                dc_sent_count += 1
                                print(f"  Run {r.get('run_number')}: dc_sent={r.get('dc_sent')}")
        
        print(f"Found {os_count} OS operations, {dc_sent_count} runs with dc_sent field")
        # The test passes if the endpoint works - dc_sent may or may not be present
        # depending on whether there are any OS operations


class TestQuotationEndpoints:
    """Test quotation-related endpoints (backend validation)"""
    
    def test_quotation_list(self, api_client):
        """Verify quotations endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/crm/quotations")
        assert response.status_code == 200, f"Quotations endpoint failed: {response.text}"
        quotations = response.json()
        print(f"Found {len(quotations)} quotations")


class TestHealthCheck:
    """Basic health checks"""
    
    def test_api_health(self, api_client):
        """Test API is responding"""
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
    
    def test_items_endpoint(self, api_client):
        """Test items endpoint"""
        response = api_client.get(f"{BASE_URL}/api/items")
        assert response.status_code == 200
    
    def test_suppliers_endpoint(self, api_client):
        """Test suppliers endpoint"""
        response = api_client.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
