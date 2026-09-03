"""
Iteration 59 Tests - BOM Costs Endpoint + Frontend Auto-populate
Tests:
1. GET /api/bom/costs/{item_id} - BOM parent item returns rm_cost, process_cost, process_names
2. GET /api/bom/costs/{item_id} - Component item returns its routings
3. GET /api/bom/costs/{item_id} - Non-BOM item returns zeros/empty
4. POST /api/job-work/orders - User-provided charges=999 preserved (not overwritten)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBOMCostsEndpoint:
    """Test the new GET /api/bom/costs/{item_id} endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
    def test_bom_costs_for_bom_parent_item(self):
        """Test BOM costs for an item that is a BOM parent"""
        # First, find a BOM with parent_routings
        boms_resp = self.session.get(f"{BASE_URL}/api/bom")
        assert boms_resp.status_code == 200
        boms = boms_resp.json()
        
        # Helper to get cost from routing (handles both string and dict formats)
        def get_routing_cost(r):
            if isinstance(r, dict):
                return r.get('cost', 0)
            return 0  # Legacy string format has no cost
        
        # Find a BOM with parent_routings that have costs
        bom_with_routings = None
        for bom in boms:
            parent_routings = bom.get('parent_routings', [])
            if parent_routings and any(get_routing_cost(r) > 0 for r in parent_routings):
                bom_with_routings = bom
                break
        
        if not bom_with_routings:
            pytest.skip("No BOM with parent_routings costs found")
        
        parent_item_id = bom_with_routings['parent_item_id']
        
        # Call the new endpoint
        costs_resp = self.session.get(f"{BASE_URL}/api/bom/costs/{parent_item_id}")
        assert costs_resp.status_code == 200, f"BOM costs endpoint failed: {costs_resp.text}"
        
        costs = costs_resp.json()
        print(f"BOM costs for parent item {parent_item_id}: {costs}")
        
        # Verify structure
        assert 'rm_cost' in costs, "Missing rm_cost in response"
        assert 'process_cost' in costs, "Missing process_cost in response"
        assert 'process_names' in costs, "Missing process_names in response"
        assert isinstance(costs['process_names'], list), "process_names should be a list"
        
        # For a BOM parent with routings, process_cost should be > 0
        assert costs['process_cost'] > 0, f"Expected process_cost > 0 for BOM with routings, got {costs['process_cost']}"
        
    def test_bom_costs_for_component_item(self):
        """Test BOM costs for an item that appears as a component in a BOM"""
        # Find a BOM with components that have routings
        boms_resp = self.session.get(f"{BASE_URL}/api/bom")
        assert boms_resp.status_code == 200
        boms = boms_resp.json()
        
        # Helper to get cost from routing (handles both string and dict formats)
        def get_routing_cost(r):
            if isinstance(r, dict):
                return r.get('cost', 0)
            return 0  # Legacy string format has no cost
        
        component_with_routings = None
        for bom in boms:
            for comp in bom.get('components', []):
                routings = comp.get('routings', [])
                if routings and any(get_routing_cost(r) > 0 for r in routings):
                    component_with_routings = comp
                    break
            if component_with_routings:
                break
        
        if not component_with_routings:
            pytest.skip("No component with routing costs found")
        
        comp_item_id = component_with_routings['item_id']
        
        # Call the new endpoint
        costs_resp = self.session.get(f"{BASE_URL}/api/bom/costs/{comp_item_id}")
        assert costs_resp.status_code == 200, f"BOM costs endpoint failed: {costs_resp.text}"
        
        costs = costs_resp.json()
        print(f"BOM costs for component item {comp_item_id}: {costs}")
        
        # Verify structure
        assert 'rm_cost' in costs
        assert 'process_cost' in costs
        assert 'process_names' in costs
        
        # For a component with routings, process_cost should be > 0
        assert costs['process_cost'] > 0, f"Expected process_cost > 0 for component with routings, got {costs['process_cost']}"
        
    def test_bom_costs_for_non_bom_item(self):
        """Test BOM costs for an item that is NOT in any BOM"""
        # Get all items
        items_resp = self.session.get(f"{BASE_URL}/api/items")
        assert items_resp.status_code == 200
        items = items_resp.json()
        
        # Get all BOMs to find items NOT in any BOM
        boms_resp = self.session.get(f"{BASE_URL}/api/bom")
        assert boms_resp.status_code == 200
        boms = boms_resp.json()
        
        # Collect all item IDs that are in BOMs (as parent or component)
        bom_item_ids = set()
        for bom in boms:
            bom_item_ids.add(bom.get('parent_item_id'))
            for comp in bom.get('components', []):
                bom_item_ids.add(comp.get('item_id'))
        
        # Find an item NOT in any BOM
        non_bom_item = None
        for item in items:
            if item['id'] not in bom_item_ids:
                non_bom_item = item
                break
        
        if not non_bom_item:
            pytest.skip("All items are in BOMs")
        
        # Call the new endpoint
        costs_resp = self.session.get(f"{BASE_URL}/api/bom/costs/{non_bom_item['id']}")
        assert costs_resp.status_code == 200, f"BOM costs endpoint failed: {costs_resp.text}"
        
        costs = costs_resp.json()
        print(f"BOM costs for non-BOM item {non_bom_item['id']}: {costs}")
        
        # For non-BOM item, should return zeros/empty
        assert costs['rm_cost'] == 0, f"Expected rm_cost=0 for non-BOM item, got {costs['rm_cost']}"
        assert costs['process_cost'] == 0, f"Expected process_cost=0 for non-BOM item, got {costs['process_cost']}"
        assert costs['process_names'] == [], f"Expected empty process_names for non-BOM item, got {costs['process_names']}"


class TestSCOrderChargesPreservation:
    """Test that user-provided charges are NOT overwritten by BOM costs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
    def test_user_charges_preserved_on_create(self):
        """Test that user-provided charges=999 is preserved, not overwritten by BOM cost"""
        # Get a supplier
        suppliers_resp = self.session.get(f"{BASE_URL}/api/suppliers")
        assert suppliers_resp.status_code == 200
        suppliers = suppliers_resp.json()
        if not suppliers:
            pytest.skip("No suppliers found")
        supplier_id = suppliers[0]['id']
        
        # Get an item that has BOM costs
        items_resp = self.session.get(f"{BASE_URL}/api/items")
        assert items_resp.status_code == 200
        items = items_resp.json()
        
        # Find an item with BOM costs
        test_item = None
        for item in items:
            costs_resp = self.session.get(f"{BASE_URL}/api/bom/costs/{item['id']}")
            if costs_resp.status_code == 200:
                costs = costs_resp.json()
                if costs['process_cost'] > 0:
                    test_item = item
                    break
        
        if not test_item:
            # Use any item
            test_item = items[0] if items else None
        
        if not test_item:
            pytest.skip("No items found")
        
        # Create SC order with explicit charges=999
        user_charges = 999
        sc_payload = {
            "supplier_id": supplier_id,
            "lines": [],
            "job_work_parts": [{
                "item_id": test_item['id'],
                "quantity": 10,
                "charges": user_charges
            }],
            "notes": "TEST_ITER59_USER_CHARGES"
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/job-work/orders", json=sc_payload)
        assert create_resp.status_code == 201, f"SC create failed: {create_resp.text}"
        
        sc_order = create_resp.json()
        print(f"Created SC order: {sc_order.get('order_number')}")
        
        # Verify charges is preserved
        jwp = sc_order.get('job_work_parts', [])
        assert len(jwp) > 0, "No job_work_parts in response"
        assert jwp[0]['charges'] == user_charges, f"Expected charges={user_charges}, got {jwp[0]['charges']}"
        
        print(f"SUCCESS: User charges {user_charges} preserved (not overwritten by BOM cost)")
        
        # Cleanup - delete the test order
        try:
            self.session.delete(f"{BASE_URL}/api/job-work/orders/{sc_order['id']}")
        except Exception:
            pass


class TestBOMCostsEndpointWithTestData:
    """Test BOM costs endpoint with specific test data mentioned in the request"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
    def test_bom_costs_endpoint_returns_200(self):
        """Test that the endpoint returns 200 for any item ID"""
        # Get any item
        items_resp = self.session.get(f"{BASE_URL}/api/items")
        assert items_resp.status_code == 200
        items = items_resp.json()
        
        if not items:
            pytest.skip("No items found")
        
        # Test with first item
        item_id = items[0]['id']
        costs_resp = self.session.get(f"{BASE_URL}/api/bom/costs/{item_id}")
        assert costs_resp.status_code == 200, f"BOM costs endpoint failed: {costs_resp.text}"
        
        costs = costs_resp.json()
        print(f"BOM costs response: {costs}")
        
        # Verify response structure
        assert 'rm_cost' in costs
        assert 'process_cost' in costs
        assert 'process_names' in costs
        
    def test_bom_costs_for_fake_item_id(self):
        """Test that endpoint returns zeros for non-existent item"""
        fake_id = "fake-item-id-12345"
        costs_resp = self.session.get(f"{BASE_URL}/api/bom/costs/{fake_id}")
        assert costs_resp.status_code == 200, f"BOM costs endpoint failed: {costs_resp.text}"
        
        costs = costs_resp.json()
        print(f"BOM costs for fake item: {costs}")
        
        # Should return zeros/empty for non-existent item
        assert costs['rm_cost'] == 0
        assert costs['process_cost'] == 0
        assert costs['process_names'] == []
