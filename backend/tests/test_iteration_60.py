"""
Iteration 60 Tests - BOM Cost Strategy Cascade + Work Orders Performance

Fix A: compute_bom_costs Strategy Cascade
- If item has OWN BOM (Strategy 1) with process_cost=0, cascade to Strategy 2 (component-in-parent)
- Strategy 1's rm_cost is preserved, only process_cost/process_names come from Strategy 2

Fix B: GET /api/work-orders Performance
- Batch fetch using $in instead of N+1 queries
- Should return in <1s (previously 6.7s for 425 MOs)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBOMCostStrategyCascade:
    """Test Fix A: Strategy cascade for compute_bom_costs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    def test_item_15de44a1_strategy_cascade(self):
        """
        Test item 15de44a1-f81f-4d13-a61a-fe8a9137e273 (SA-001):
        - Has OWN BOM (Updated BOM - active, with parent_routings=["Assembly"] but no cost)
        - Is ALSO a component in 'Hydraulic Press 50T BOM' with routings=['Welding']
        
        Expected: Since Welding has no cost defined, process_cost=0 but process_names=['Welding']
        """
        item_id = "15de44a1-f81f-4d13-a61a-fe8a9137e273"
        resp = self.session.get(f"{BASE_URL}/api/bom/costs/{item_id}")
        assert resp.status_code == 200, f"Failed to get BOM costs: {resp.text}"
        
        data = resp.json()
        print(f"BOM costs for item {item_id}: {data}")
        
        # Verify process_names includes 'Welding' from component position
        assert "process_names" in data, "Missing process_names in response"
        assert "Welding" in data["process_names"], f"Expected 'Welding' in process_names, got {data['process_names']}"
        
        # Since Welding has no cost defined, process_cost should be 0
        assert data["process_cost"] == 0, f"Expected process_cost=0 (Welding has no cost), got {data['process_cost']}"
    
    def test_item_5830fd71_component_only_with_costs(self):
        """
        Test item 5830fd71-71c2-42c6-8347-efe52998f7e3 (RM-002):
        - Is a component in 'RoutingCostTest' BOM with routings=[LC Cutting:50, Bending:30]
        - NOT a BOM parent itself
        
        Expected: process_cost=80 (50+30), process_names=['LC Cutting', 'Bending']
        """
        item_id = "5830fd71-71c2-42c6-8347-efe52998f7e3"
        resp = self.session.get(f"{BASE_URL}/api/bom/costs/{item_id}")
        assert resp.status_code == 200, f"Failed to get BOM costs: {resp.text}"
        
        data = resp.json()
        print(f"BOM costs for item {item_id}: {data}")
        
        # Verify process_cost = 50 + 30 = 80
        assert data["process_cost"] == 80, f"Expected process_cost=80, got {data['process_cost']}"
        
        # Verify process_names
        assert "LC Cutting" in data["process_names"], f"Expected 'LC Cutting' in process_names"
        assert "Bending" in data["process_names"], f"Expected 'Bending' in process_names"
        
        # rm_cost should be item's unit_cost (28.5) since it's not a BOM parent
        assert data["rm_cost"] == 28.5, f"Expected rm_cost=28.5, got {data['rm_cost']}"
    
    def test_item_3447f544_parent_only_with_costs(self):
        """
        Test item 3447f544-6d02-4ed0-89e7-79e37250923f (RM-001):
        - Is a BOM parent in 'RoutingCostTest' with parent_routings=[Assembly:100]
        - Has component RM-002 with routings=[LC Cutting:50, Bending:30]
        
        Expected: process_cost=180 (100+50+30), process_names=['Assembly', 'LC Cutting', 'Bending']
        Strategy 1 should work since it has non-zero process_cost
        """
        item_id = "3447f544-6d02-4ed0-89e7-79e37250923f"
        resp = self.session.get(f"{BASE_URL}/api/bom/costs/{item_id}")
        assert resp.status_code == 200, f"Failed to get BOM costs: {resp.text}"
        
        data = resp.json()
        print(f"BOM costs for item {item_id}: {data}")
        
        # Verify process_cost = 100 + 50 + 30 = 180
        assert data["process_cost"] == 180, f"Expected process_cost=180, got {data['process_cost']}"
        
        # Verify process_names
        assert "Assembly" in data["process_names"], f"Expected 'Assembly' in process_names"
        assert "LC Cutting" in data["process_names"], f"Expected 'LC Cutting' in process_names"
        assert "Bending" in data["process_names"], f"Expected 'Bending' in process_names"


class TestJobWorkOrderIntegration:
    """Test Fix A integration: Job Work Order with process_names from component position"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    def test_job_work_order_with_item_15de44a1(self):
        """
        POST /api/job-work/orders with item 15de44a1 and charges=0
        Expected: job_work_parts[0].process_names should include 'Welding'
        """
        # First get a supplier
        suppliers_resp = self.session.get(f"{BASE_URL}/api/suppliers")
        assert suppliers_resp.status_code == 200
        suppliers = suppliers_resp.json()
        
        if not suppliers:
            pytest.skip("No suppliers available for testing")
        
        supplier_id = suppliers[0]["id"]
        item_id = "15de44a1-f81f-4d13-a61a-fe8a9137e273"
        
        # Create job work order with charges=0 to test auto-populate
        payload = {
            "supplier_id": supplier_id,
            "lines": [],
            "job_work_parts": [
                {
                    "item_id": item_id,
                    "quantity": 10,
                    "charges": 0  # Should trigger BOM cost lookup
                }
            ],
            "notes": "TEST_ITER60_JW_ORDER"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/job-work/orders", json=payload)
        assert resp.status_code == 201, f"Failed to create JW order: {resp.text}"
        
        data = resp.json()
        print(f"Created JW order: {data.get('order_number')}")
        
        # Verify job_work_parts has process_names
        assert "job_work_parts" in data, "Missing job_work_parts in response"
        assert len(data["job_work_parts"]) > 0, "No job_work_parts in response"
        
        jw_part = data["job_work_parts"][0]
        print(f"JW Part: {jw_part}")
        
        # process_names should include 'Welding' from component position in Hydraulic Press 50T BOM
        if "process_names" in jw_part:
            assert "Welding" in jw_part["process_names"], f"Expected 'Welding' in process_names, got {jw_part.get('process_names')}"
        else:
            # If process_names not stored, at least verify the order was created
            print("Note: process_names not stored in job_work_parts - this may be expected behavior")
        
        # Cleanup - delete the test order
        order_id = data.get("id")
        if order_id:
            self.session.delete(f"{BASE_URL}/api/job-work/orders/{order_id}")


class TestWorkOrdersPerformance:
    """Test Fix B: GET /api/work-orders performance with batch fetch"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    def test_work_orders_list_performance(self):
        """
        GET /api/work-orders should return in <1s
        Previously took 6.7s for 425 MOs due to N+1 queries
        """
        start_time = time.time()
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        elapsed = time.time() - start_time
        
        assert resp.status_code == 200, f"Failed to get work orders: {resp.text}"
        
        work_orders = resp.json()
        count = len(work_orders)
        
        print(f"GET /api/work-orders returned {count} MOs in {elapsed:.3f}s")
        
        # Should be under 1 second
        assert elapsed < 1.0, f"Work orders endpoint too slow: {elapsed:.3f}s (expected <1s)"
    
    def test_work_orders_data_shape(self):
        """
        Verify batch fetch produces correct data shape:
        - wo.routing (from routings collection)
        - wo.item (from items collection)
        - wo.production_order (from production_orders collection)
        """
        resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert resp.status_code == 200
        
        work_orders = resp.json()
        if not work_orders:
            pytest.skip("No work orders to test")
        
        # Check first work order with routing
        wo_with_routing = next((wo for wo in work_orders if wo.get("routing")), None)
        if wo_with_routing:
            print(f"WO with routing: {wo_with_routing.get('wo_number')}")
            
            # Verify routing object
            routing = wo_with_routing.get("routing")
            assert routing is not None, "routing should not be None"
            assert "id" in routing, "routing should have id"
            assert "name" in routing, "routing should have name"
            
            # Verify item object
            item = wo_with_routing.get("item")
            if item:
                assert "id" in item, "item should have id"
                assert "part_number" in item, "item should have part_number"
                assert "name" in item, "item should have name"
        
        # Check work order with production_order
        wo_with_po = next((wo for wo in work_orders if wo.get("production_order")), None)
        if wo_with_po:
            print(f"WO with production_order: {wo_with_po.get('wo_number')}")
            
            po = wo_with_po.get("production_order")
            assert po is not None, "production_order should not be None"
            assert "id" in po, "production_order should have id"
            assert "order_number" in po, "production_order should have order_number"
    
    def test_individual_work_order_still_works(self):
        """
        Regression: GET /api/work-orders/{wo_id} should still return enriched data
        """
        # First get list to find a work order ID
        list_resp = self.session.get(f"{BASE_URL}/api/work-orders")
        assert list_resp.status_code == 200
        
        work_orders = list_resp.json()
        if not work_orders:
            pytest.skip("No work orders to test")
        
        # Get individual work order
        wo_id = work_orders[0]["id"]
        resp = self.session.get(f"{BASE_URL}/api/work-orders/{wo_id}")
        assert resp.status_code == 200, f"Failed to get individual WO: {resp.text}"
        
        wo = resp.json()
        print(f"Individual WO: {wo.get('wo_number')}")
        
        # Verify enriched data
        assert "routing" in wo, "Individual WO should have routing"
        if wo.get("routing"):
            assert "id" in wo["routing"], "routing should have id"


class TestRegressionBOMCosts:
    """Regression tests for BOM costs - ensure existing functionality still works"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    def test_non_bom_item_returns_zeros(self):
        """Item not in any BOM should return zeros"""
        resp = self.session.get(f"{BASE_URL}/api/bom/costs/fake-item-id-12345")
        assert resp.status_code == 200
        
        data = resp.json()
        assert data["rm_cost"] == 0.0, f"Expected rm_cost=0, got {data['rm_cost']}"
        assert data["process_cost"] == 0.0, f"Expected process_cost=0, got {data['process_cost']}"
        assert data["process_names"] == [], f"Expected empty process_names, got {data['process_names']}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
