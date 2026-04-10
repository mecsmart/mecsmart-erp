#!/usr/bin/env python3
"""
Manufacturing ERP Backend API Testing
Tests all API endpoints for the Manufacturing ERP system
"""

import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

class ERPAPITester:
    def __init__(self, base_url: str = "https://industrial-bom-suite.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.admin_token = None
        self.test_data = {}
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            self.failed_tests.append({"name": name, "details": details})
            print(f"❌ {name} - {details}")

    def make_request(self, method: str, endpoint: str, data: Optional[Dict] = None, 
                    expected_status: int = 200, use_auth: bool = True) -> tuple[bool, Dict]:
        """Make HTTP request and validate response"""
        url = f"{self.base_url}{endpoint}"
        headers = {}
        
        if use_auth and self.admin_token:
            headers['Authorization'] = f'Bearer {self.admin_token}'
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers)
            else:
                return False, {"error": f"Unsupported method: {method}"}

            success = response.status_code == expected_status
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text}
            
            return success, response_data

        except Exception as e:
            return False, {"error": str(e)}

    def test_health_check(self):
        """Test health endpoint"""
        success, data = self.make_request('GET', '/api/health', use_auth=False)
        self.log_test("Health Check", success and data.get('status') == 'healthy', 
                     f"Response: {data}")

    def test_admin_login(self):
        """Test admin login"""
        login_data = {
            "email": "admin@erp.com",
            "password": "Admin@123"
        }
        
        success, data = self.make_request('POST', '/api/auth/login', login_data, use_auth=False)
        
        if success and 'id' in data:
            # Extract token from cookies if available
            self.admin_token = "dummy_token"  # Will use cookies instead
            self.test_data['admin_user'] = data
            self.log_test("Admin Login", True)
        else:
            self.log_test("Admin Login", False, f"Response: {data}")

    def test_get_current_user(self):
        """Test getting current user info"""
        success, data = self.make_request('GET', '/api/auth/me')
        
        if success and data.get('role') == 'admin':
            self.log_test("Get Current User", True)
        else:
            self.log_test("Get Current User", False, f"Response: {data}")

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        success, data = self.make_request('GET', '/api/dashboard/stats')
        
        expected_keys = ['inventory', 'bom', 'production', 'quality']
        has_all_keys = all(key in data for key in expected_keys)
        
        self.log_test("Dashboard Stats", success and has_all_keys, 
                     f"Missing keys: {[k for k in expected_keys if k not in data]}")

    def test_items_crud(self):
        """Test Items CRUD operations"""
        # Get all items
        success, items = self.make_request('GET', '/api/items')
        self.log_test("Get Items", success and isinstance(items, list))
        
        if success and items:
            self.test_data['sample_item'] = items[0]
        
        # Create new item
        new_item = {
            "part_number": f"TEST-{datetime.now().strftime('%H%M%S')}",
            "name": "Test Item",
            "description": "Test item for API testing",
            "category": "raw_material",
            "unit_of_measure": "pcs",
            "unit_cost": 10.50,
            "lead_time_days": 5,
            "safety_stock": 20,
            "current_stock": 100,
            "reorder_point": 30
        }
        
        success, created_item = self.make_request('POST', '/api/items', new_item, 201)
        if success:
            self.test_data['created_item'] = created_item
            self.log_test("Create Item", True)
            
            # Test get single item
            item_id = created_item.get('id')
            if item_id:
                success, item = self.make_request('GET', f'/api/items/{item_id}')
                self.log_test("Get Single Item", success and item.get('id') == item_id)
                
                # Test update item
                update_data = {"name": "Updated Test Item", "unit_cost": 15.75}
                success, updated = self.make_request('PUT', f'/api/items/{item_id}', update_data)
                self.log_test("Update Item", success and updated.get('name') == "Updated Test Item")
        else:
            self.log_test("Create Item", False, f"Response: {created_item}")

    def test_bom_operations(self):
        """Test BOM operations"""
        # Get all BOMs
        success, boms = self.make_request('GET', '/api/bom')
        self.log_test("Get BOMs", success and isinstance(boms, list))
        
        if success and boms:
            # Test BOM explosion
            bom_id = boms[0].get('id')
            if bom_id:
                success, explosion = self.make_request('GET', f'/api/bom/{bom_id}/explode')
                has_explosion_data = 'explosion' in explosion and 'parent_item' in explosion
                self.log_test("BOM Explosion", success and has_explosion_data)
                
                # Test get single BOM
                success, bom = self.make_request('GET', f'/api/bom/{bom_id}')
                self.log_test("Get Single BOM", success and bom.get('id') == bom_id)

    def test_mrp_calculations(self):
        """Test MRP calculations"""
        # Test demand calculation
        success, demand = self.make_request('GET', '/api/mrp/demand')
        self.log_test("MRP Demand Calculation", success and isinstance(demand, list))
        
        # Test purchase suggestions
        success, suggestions = self.make_request('GET', '/api/mrp/suggestions')
        self.log_test("MRP Purchase Suggestions", success and isinstance(suggestions, list))

    def test_quality_operations(self):
        """Test Quality management"""
        # Get inspection templates
        success, templates = self.make_request('GET', '/api/quality/templates')
        self.log_test("Get Inspection Templates", success and isinstance(templates, list))
        
        # Get inspections
        success, inspections = self.make_request('GET', '/api/quality/inspections')
        self.log_test("Get Inspections", success and isinstance(inspections, list))
        
        # Get quality metrics
        success, metrics = self.make_request('GET', '/api/quality/metrics')
        expected_keys = ['total_inspections', 'passed', 'failed', 'pass_rate']
        has_metrics = all(key in metrics for key in expected_keys)
        self.log_test("Quality Metrics", success and has_metrics)

    def test_inventory_operations(self):
        """Test Inventory management"""
        # Get inventory
        success, inventory = self.make_request('GET', '/api/inventory')
        self.log_test("Get Inventory", success and isinstance(inventory, list))
        
        # Get inventory transactions
        success, transactions = self.make_request('GET', '/api/inventory/transactions')
        self.log_test("Get Inventory Transactions", success and isinstance(transactions, list))

    def test_production_orders(self):
        """Test Production Orders"""
        # Get production orders
        success, orders = self.make_request('GET', '/api/production')
        self.log_test("Get Production Orders", success and isinstance(orders, list))

    def test_user_management(self):
        """Test User management (admin only)"""
        success, users = self.make_request('GET', '/api/users')
        self.log_test("Get Users (Admin)", success and isinstance(users, list))

    def test_logout(self):
        """Test logout"""
        success, data = self.make_request('POST', '/api/auth/logout')
        self.log_test("Logout", success and data.get('message') == 'Logged out successfully')

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Manufacturing ERP API Tests")
        print(f"📍 Base URL: {self.base_url}")
        print("=" * 60)
        
        # Core tests
        self.test_health_check()
        self.test_admin_login()
        
        if self.admin_token or self.tests_passed > 0:  # Continue if login worked
            self.test_get_current_user()
            self.test_dashboard_stats()
            
            # Module tests
            self.test_items_crud()
            self.test_bom_operations()
            self.test_mrp_calculations()
            self.test_quality_operations()
            self.test_inventory_operations()
            self.test_production_orders()
            self.test_user_management()
            
            # Cleanup
            self.test_logout()
        
        # Print summary
        print("=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for test in self.failed_tests:
                print(f"  • {test['name']}: {test['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test runner"""
    tester = ERPAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())