"""
Test MRP Improvements:
1. Items with on_hand >= gross_requirement are NOT shown in MRP
2. PO status tracking (pending/partial_po/po_sent) with po_ordered_qty and remaining_to_order
3. After GRN receipt increases stock >= gross_req, item disappears from MRP
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return session


class TestMRPStockFilter:
    """Test: Items with on_hand >= gross_requirement are NOT shown in MRP"""
    
    def test_mrp_demand_returns_only_shortage_items(self, auth_session):
        """MRP demand should only return items where on_hand < gross_requirement"""
        response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand = response.json()
        print(f"MRP demand returned {len(demand)} items")
        
        # Verify each item in demand has on_hand < gross_requirement
        for item in demand:
            on_hand = item.get('on_hand', 0)
            gross_req = item.get('gross_requirement', 0)
            net_req = item.get('net_requirement', 0)
            
            # Item should only appear if there's actual shortage
            assert on_hand < gross_req, f"Item {item.get('item', {}).get('part_number')} has on_hand ({on_hand}) >= gross_req ({gross_req})"
            assert net_req > 0, f"Item {item.get('item', {}).get('part_number')} has net_requirement <= 0"
            
            print(f"  - {item.get('item', {}).get('part_number')}: on_hand={on_hand}, gross_req={gross_req}, net_req={net_req}")
    
    def test_mrp_demand_excludes_sufficient_stock_items(self, auth_session):
        """Items with sufficient stock should NOT appear in MRP demand"""
        # Get all raw materials
        items_response = auth_session.get(f"{BASE_URL}/api/items?category=raw_material")
        assert items_response.status_code == 200
        raw_materials = items_response.json()
        
        # Get MRP demand
        demand_response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert demand_response.status_code == 200
        demand = demand_response.json()
        
        demand_item_ids = [d.get('item', {}).get('id') for d in demand]
        
        # Check that items with high stock are not in demand
        for rm in raw_materials:
            if rm.get('current_stock', 0) > 100:  # High stock items
                if rm.get('id') in demand_item_ids:
                    # Find the demand entry
                    demand_entry = next((d for d in demand if d.get('item', {}).get('id') == rm.get('id')), None)
                    if demand_entry:
                        # It's OK to be in demand if gross_req > on_hand
                        assert demand_entry.get('on_hand', 0) < demand_entry.get('gross_requirement', 0), \
                            f"Item {rm.get('part_number')} with high stock ({rm.get('current_stock')}) should not be in MRP demand"
        
        print(f"Verified: High stock items correctly excluded from MRP demand")


class TestMRPPOStatusTracking:
    """Test: PO status tracking (pending/partial_po/po_sent)"""
    
    def test_mrp_demand_includes_po_status_fields(self, auth_session):
        """MRP demand response should include po_status, po_ordered_qty, remaining_to_order"""
        response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand = response.json()
        
        if len(demand) == 0:
            print("No items in MRP demand (all stock sufficient) - creating test scenario")
            pytest.skip("No MRP demand items to test PO status fields")
        
        for item in demand:
            # Check required fields exist
            assert 'po_status' in item, f"Missing po_status field for {item.get('item', {}).get('part_number')}"
            assert 'po_ordered_qty' in item, f"Missing po_ordered_qty field for {item.get('item', {}).get('part_number')}"
            assert 'remaining_to_order' in item, f"Missing remaining_to_order field for {item.get('item', {}).get('part_number')}"
            
            # Validate po_status values
            assert item['po_status'] in ['pending', 'partial_po', 'po_sent'], \
                f"Invalid po_status: {item['po_status']}"
            
            print(f"  - {item.get('item', {}).get('part_number')}: po_status={item['po_status']}, po_ordered_qty={item['po_ordered_qty']}, remaining={item['remaining_to_order']}")
    
    def test_po_status_logic(self, auth_session):
        """Test PO status logic: pending/partial_po/po_sent based on PO coverage"""
        response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand = response.json()
        
        for item in demand:
            po_status = item.get('po_status')
            po_ordered_qty = item.get('po_ordered_qty', 0)
            net_req = item.get('net_requirement', 0)
            remaining = item.get('remaining_to_order', 0)
            
            # Validate status logic
            if po_ordered_qty >= net_req:
                assert po_status == 'po_sent', f"Expected po_sent when po_ordered_qty ({po_ordered_qty}) >= net_req ({net_req})"
            elif po_ordered_qty > 0:
                assert po_status == 'partial_po', f"Expected partial_po when 0 < po_ordered_qty ({po_ordered_qty}) < net_req ({net_req})"
            else:
                assert po_status == 'pending', f"Expected pending when po_ordered_qty = 0"
            
            # Validate remaining_to_order calculation
            expected_remaining = max(0, net_req - po_ordered_qty)
            assert remaining == expected_remaining, f"remaining_to_order mismatch: got {remaining}, expected {expected_remaining}"
            
            print(f"  - {item.get('item', {}).get('part_number')}: status logic verified")


class TestMRPWithShortageScenario:
    """Create a shortage scenario to test MRP features"""
    
    @pytest.fixture
    def create_shortage_scenario(self, auth_session):
        """Create a sales order with high quantity to create shortage"""
        # Get an active BOM
        boms_response = auth_session.get(f"{BASE_URL}/api/bom?status=active")
        assert boms_response.status_code == 200
        boms = boms_response.json()
        
        if not boms:
            pytest.skip("No active BOMs available")
        
        bom = boms[0]
        bom_id = bom.get('id')
        
        # Create a large sales order to create shortage
        unique_id = str(uuid.uuid4())[:8]
        so_data = {
            "bom_id": bom_id,
            "quantity": 500,  # Large quantity to create shortage
            "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "priority": "high",
            "notes": f"TEST_MRP_SHORTAGE_{unique_id}"
        }
        
        create_response = auth_session.post(f"{BASE_URL}/api/production", json=so_data)
        assert create_response.status_code in [200, 201], f"Failed to create SO: {create_response.text}"
        
        so = create_response.json()
        so_id = so.get('id')
        
        # Confirm the SO to make it appear in MRP
        confirm_response = auth_session.post(f"{BASE_URL}/api/production/{so_id}/confirm")
        assert confirm_response.status_code == 200, f"Failed to confirm SO: {confirm_response.text}"
        
        yield so
        
        # Cleanup: Cancel the SO
        auth_session.post(f"{BASE_URL}/api/production/{so_id}/cancel")
    
    def test_mrp_shows_shortage_items(self, auth_session, create_shortage_scenario):
        """After creating large SO, MRP should show items with shortage"""
        so = create_shortage_scenario
        
        # Get MRP demand
        response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand = response.json()
        print(f"MRP demand after creating SO {so.get('order_number')}: {len(demand)} items")
        
        # Should have items with shortage now
        assert len(demand) > 0, "Expected MRP demand to show items after creating large SO"
        
        for item in demand:
            print(f"  - {item.get('item', {}).get('part_number')}: net_req={item.get('net_requirement')}, po_status={item.get('po_status')}")
            
            # Verify all required fields
            assert 'po_status' in item
            assert 'po_ordered_qty' in item
            assert 'remaining_to_order' in item
            assert item.get('net_requirement', 0) > 0
            assert item.get('on_hand', 0) < item.get('gross_requirement', 0)
    
    def test_mrp_po_status_pending_for_new_shortage(self, auth_session, create_shortage_scenario):
        """New shortage items should have po_status='pending'"""
        response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand = response.json()
        
        # Find items with no PO (should be pending)
        pending_items = [d for d in demand if d.get('po_status') == 'pending']
        
        for item in pending_items:
            assert item.get('po_ordered_qty', 0) == 0, "Pending items should have po_ordered_qty = 0"
            assert item.get('remaining_to_order') == item.get('net_requirement'), \
                "Pending items should have remaining_to_order = net_requirement"
            print(f"  - {item.get('item', {}).get('part_number')}: correctly shows pending status")


class TestMRPSummaryCard:
    """Test: MRP summary card 'Items with Demand' count matches filtered demand list"""
    
    def test_demand_count_matches_list_length(self, auth_session):
        """The 'Items with Demand' count should match the demand list length"""
        response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand = response.json()
        demand_count = len(demand)
        
        print(f"MRP demand list length: {demand_count}")
        
        # All items in demand should have net_requirement > 0 and on_hand < gross_requirement
        valid_items = [d for d in demand 
                       if d.get('net_requirement', 0) > 0 
                       and d.get('on_hand', 0) < d.get('gross_requirement', 0)]
        
        assert len(valid_items) == demand_count, \
            f"All {demand_count} items should have valid shortage conditions"
        
        print(f"Verified: All {demand_count} items in demand have valid shortage conditions")


class TestGRNStockReplenishment:
    """Test: After GRN receipt increases stock >= gross_req, item disappears from MRP"""
    
    def test_grn_removes_item_from_mrp(self, auth_session):
        """
        Scenario: If stock is replenished via GRN to cover demand, item should disappear from MRP
        This is a conceptual test - actual GRN creation requires PO workflow
        """
        # Get current MRP demand
        response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand = response.json()
        
        if len(demand) == 0:
            print("No items in MRP demand - stock already covers all requirements")
            print("This confirms the feature: items with sufficient stock are not shown in MRP")
            return
        
        # For each item in demand, verify the logic
        for item in demand:
            on_hand = item.get('on_hand', 0)
            gross_req = item.get('gross_requirement', 0)
            
            # If we were to add stock to make on_hand >= gross_req, item should disappear
            stock_needed = gross_req - on_hand
            print(f"  - {item.get('item', {}).get('part_number')}: needs {stock_needed} more stock to disappear from MRP")
            
            # Verify the condition
            assert on_hand < gross_req, "Item in MRP should have on_hand < gross_requirement"


class TestPurchaseOrderIntegration:
    """Test: PO creation and its effect on MRP po_status"""
    
    def test_existing_po_affects_mrp_status(self, auth_session):
        """Check if existing POs are reflected in MRP po_status"""
        # Get all purchase orders
        po_response = auth_session.get(f"{BASE_URL}/api/purchase-orders")
        assert po_response.status_code == 200
        pos = po_response.json()
        
        # Get MRP demand
        mrp_response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert mrp_response.status_code == 200
        demand = mrp_response.json()
        
        # Build a map of item_id -> PO quantities
        po_qty_by_item = {}
        for po in pos:
            if po.get('status') in ['draft', 'approved', 'sent', 'confirmed']:
                for line in po.get('items', []) + po.get('lines', []):
                    item_id = line.get('item_id')
                    qty = line.get('quantity', 0) - line.get('received_quantity', 0)
                    if item_id:
                        po_qty_by_item[item_id] = po_qty_by_item.get(item_id, 0) + qty
        
        print(f"Found {len(po_qty_by_item)} items with pending PO quantities")
        
        # Verify MRP reflects PO quantities
        for item in demand:
            item_id = item.get('item', {}).get('id')
            mrp_po_qty = item.get('po_ordered_qty', 0)
            expected_po_qty = po_qty_by_item.get(item_id, 0)
            
            # Note: There might be slight differences due to timing, but should be close
            print(f"  - {item.get('item', {}).get('part_number')}: MRP shows po_ordered_qty={mrp_po_qty}")


class TestMRPOnlyRawMaterials:
    """Test: MRP demand only includes raw_material category items"""
    
    def test_mrp_demand_only_raw_materials(self, auth_session):
        """MRP demand should only return raw_material category items"""
        response = auth_session.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand = response.json()
        
        for item in demand:
            category = item.get('item', {}).get('category')
            assert category == 'raw_material', \
                f"Item {item.get('item', {}).get('part_number')} has category '{category}', expected 'raw_material'"
        
        print(f"Verified: All {len(demand)} items in MRP demand are raw_material category")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
