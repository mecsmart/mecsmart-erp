"""
Iteration 52 Backend Tests
Tests for:
1. GET /api/work-orders returns wo.production_order populated with order_number
2. Job Work DC print format for Job OS (subcontract_type === 'without_material' && job_work_parts.length > 0)
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return session


class TestWorkOrdersProductionOrderPopulation:
    """Test that GET /api/work-orders returns production_order with order_number"""
    
    def test_work_orders_endpoint_returns_production_order(self, auth_session):
        """Verify work orders endpoint returns production_order field"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200, f"Failed to get work orders: {response.text}"
        
        work_orders = response.json()
        assert isinstance(work_orders, list), "Response should be a list"
        
        if len(work_orders) > 0:
            # Check first work order has production_order field
            wo = work_orders[0]
            assert "production_order" in wo, "Work order should have production_order field"
            
            # If production_order exists, it should have order_number
            if wo["production_order"]:
                assert "order_number" in wo["production_order"], "production_order should have order_number"
                print(f"Work order {wo.get('wo_number')} has production_order: {wo['production_order'].get('order_number')}")
    
    def test_work_orders_production_order_has_order_number_format(self, auth_session):
        """Verify production_order.order_number follows SO-XXXXXX format"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        
        # Find work orders with production_order
        for wo in work_orders[:10]:  # Check first 10
            if wo.get("production_order") and wo["production_order"].get("order_number"):
                order_number = wo["production_order"]["order_number"]
                assert order_number.startswith("SO-"), f"Order number should start with 'SO-': {order_number}"
                print(f"  WO {wo.get('wo_number')} -> SO: {order_number}")


class TestJobWorkDCPrintFormat:
    """Test Job Work DC print format logic"""
    
    def test_job_work_orders_endpoint(self, auth_session):
        """Verify job work orders endpoint works"""
        response = auth_session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200, f"Failed to get job work orders: {response.text}"
        
        orders = response.json()
        assert isinstance(orders, list), "Response should be a list"
        print(f"Found {len(orders)} job work orders")
    
    def test_job_work_challans_endpoint(self, auth_session):
        """Verify job work challans endpoint works"""
        response = auth_session.get(f"{BASE_URL}/api/job-work/challans")
        assert response.status_code == 200, f"Failed to get challans: {response.text}"
        
        challans = response.json()
        assert isinstance(challans, list), "Response should be a list"
        print(f"Found {len(challans)} delivery challans")
    
    def test_job_os_dc_has_order_with_subcontract_type(self, auth_session):
        """Verify DC has order with subcontract_type field for Job OS detection"""
        response = auth_session.get(f"{BASE_URL}/api/job-work/challans")
        assert response.status_code == 200
        
        challans = response.json()
        
        job_os_count = 0
        standard_sc_count = 0
        
        for dc in challans:
            order = dc.get("order", {})
            subcontract_type = order.get("subcontract_type")
            job_work_parts = order.get("job_work_parts", [])
            
            # Check if this is a Job OS DC
            is_job_os = subcontract_type == "without_material" and len(job_work_parts) > 0
            
            if is_job_os:
                job_os_count += 1
                print(f"  Job OS DC: {dc.get('dc_number')} - Order: {order.get('order_number')}")
            elif subcontract_type == "with_material":
                standard_sc_count += 1
        
        print(f"Job OS DCs: {job_os_count}, Standard SC DCs: {standard_sc_count}")
    
    def test_dc_order_has_job_work_parts(self, auth_session):
        """Verify DC order has job_work_parts for Job OS"""
        response = auth_session.get(f"{BASE_URL}/api/job-work/challans")
        assert response.status_code == 200
        
        challans = response.json()
        
        for dc in challans[:5]:  # Check first 5
            order = dc.get("order", {})
            if order.get("subcontract_type") == "without_material":
                job_work_parts = order.get("job_work_parts", [])
                print(f"  DC {dc.get('dc_number')}: subcontract_type=without_material, job_work_parts={len(job_work_parts)}")
                
                # If job_work_parts exist, verify structure
                for part in job_work_parts[:2]:
                    assert "item_id" in part, "job_work_part should have item_id"
                    assert "quantity" in part, "job_work_part should have quantity"
                    print(f"    Part: item_id={part.get('item_id')}, qty={part.get('quantity')}, charges={part.get('charges')}")


class TestSORefOnWorkOrders:
    """Test SO reference display on work orders"""
    
    def test_work_order_has_production_order_id(self, auth_session):
        """Verify work orders have production_order_id"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        
        for wo in work_orders[:10]:
            if wo.get("production_order_id"):
                assert wo.get("production_order"), f"WO {wo.get('wo_number')} has production_order_id but no production_order populated"
                print(f"  WO {wo.get('wo_number')} -> production_order_id: {wo.get('production_order_id')}")
    
    def test_production_order_fields(self, auth_session):
        """Verify production_order has required fields"""
        response = auth_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        
        work_orders = response.json()
        
        for wo in work_orders[:5]:
            po = wo.get("production_order")
            if po:
                # Check required fields
                assert "id" in po, "production_order should have id"
                assert "order_number" in po, "production_order should have order_number"
                print(f"  WO {wo.get('wo_number')} production_order: id={po.get('id')}, order_number={po.get('order_number')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
