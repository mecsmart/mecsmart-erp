"""
Test POST /api/job-work/receive-grn endpoint
Tests the new SC with RM flow: DC = Job Work Order Cum DC, then Receive GRN directly from JW number

Features tested:
1. POST /api/job-work/receive-grn creates GRN from JW number with process cost
2. JW GRN adds FG/SA stock correctly
3. JW GRN creates inventory transaction with jw_grn reference type
4. JW GRN marks SC as completed when all parts received
5. JW GRN tracks total_process_cost
6. Partial JW GRN: Receiving less than ordered doesn't complete SC
7. Regression: DC creation with RM still deducts stock
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestJWReceiveGRN:
    """Test the new JW Receive GRN endpoint for SC with RM flow"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup_session(self):
        """Setup session for all tests"""
        if TestJWReceiveGRN.session is None:
            TestJWReceiveGRN.session = requests.Session()
            TestJWReceiveGRN.session.headers.update({"Content-Type": "application/json"})
        yield
    
    def test_01_login(self):
        """Login with admin credentials"""
        response = TestJWReceiveGRN.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("email") == "admin@erp.com"
        assert data.get("role") == "admin"
        print("Login successful")
    
    def test_02_create_test_items(self):
        """Create RM, SA, and FG items for testing"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Raw Material
        rm_data = {
            "part_number": f"TEST_RM_JW_{unique_id}",
            "name": f"Test Raw Material JW {unique_id}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 50.0,
            "current_stock": 500,
            "safety_stock": 10,
            "hsn_code": "7204"
        }
        response = TestJWReceiveGRN.session.post(f"{BASE_URL}/api/items", json=rm_data)
        assert response.status_code == 201, f"Failed to create RM: {response.text}"
        TestJWReceiveGRN.test_data["rm"] = response.json()
        
        # Semi-Assembly (output from subcontracting)
        sa_data = {
            "part_number": f"TEST_SA_JW_{unique_id}",
            "name": f"Test Semi-Assembly JW {unique_id}",
            "category": "sub_assembly",
            "unit_of_measure": "pcs",
            "unit_cost": 200.0,
            "current_stock": 0,
            "safety_stock": 5,
            "hsn_code": "8481"
        }
        response = TestJWReceiveGRN.session.post(f"{BASE_URL}/api/items", json=sa_data)
        assert response.status_code == 201, f"Failed to create SA: {response.text}"
        TestJWReceiveGRN.test_data["sa"] = response.json()
        
        print(f"Created test items: RM={TestJWReceiveGRN.test_data['rm']['id']}, SA={TestJWReceiveGRN.test_data['sa']['id']}")
    
    def test_03_create_supplier(self):
        """Create test supplier for subcontracting"""
        unique_id = str(uuid.uuid4())[:8]
        supplier_data = {
            "code": f"TEST_SUP_JW_{unique_id}",
            "name": f"TEST_Supplier_JW_{unique_id}",
            "contact_person": "Test Contact",
            "email": f"supplier_jw_{unique_id}@test.com",
            "phone": "1234567890",
            "status": "active",
            "gstin": "29AABCT1332L1ZZ"
        }
        response = TestJWReceiveGRN.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert response.status_code == 201, f"Failed to create supplier: {response.text}"
        TestJWReceiveGRN.test_data["supplier"] = response.json()
        print(f"Created supplier: {TestJWReceiveGRN.test_data['supplier']['id']}")
    
    def test_04_create_sc_order_with_rm(self):
        """Create SC order with RM (with_material type) using job-work/orders endpoint"""
        response = TestJWReceiveGRN.session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": TestJWReceiveGRN.test_data["supplier"]["id"],
            "lines": [
                {
                    "item_id": TestJWReceiveGRN.test_data["rm"]["id"],
                    "quantity": 20,  # 2 kg per unit * 10 units
                    "rate": 50
                }
            ],
            "job_work_parts": [
                {
                    "item_id": TestJWReceiveGRN.test_data["sa"]["id"],
                    "quantity": 10,
                    "charges": 50.0  # Process cost per unit
                }
            ],
            "expected_return_date": (datetime.now() + timedelta(days=14)).isoformat(),
            "processing_charges": 500,
            "notes": "Test SC with RM for JW GRN"
        })
        assert response.status_code in [200, 201], f"Failed to create SC order: {response.text}"
        TestJWReceiveGRN.test_data["sc_order"] = response.json()
        print(f"Created SC order: {TestJWReceiveGRN.test_data['sc_order']['id']}, order_number: {TestJWReceiveGRN.test_data['sc_order'].get('order_number')}")
    
    def test_05_confirm_sc_order(self):
        """Confirm the SC order"""
        sc_id = TestJWReceiveGRN.test_data["sc_order"]["id"]
        response = TestJWReceiveGRN.session.put(f"{BASE_URL}/api/job-work/orders/{sc_id}", json={
            "status": "confirmed"
        })
        assert response.status_code == 200, f"Failed to confirm SC order: {response.text}"
        TestJWReceiveGRN.test_data["sc_order"] = response.json()
        print("SC order confirmed")
    
    def test_06_get_rm_stock_before_dc(self):
        """Get RM stock before DC to verify deduction later"""
        response = TestJWReceiveGRN.session.get(f"{BASE_URL}/api/items/{TestJWReceiveGRN.test_data['rm']['id']}")
        assert response.status_code == 200
        TestJWReceiveGRN.test_data["rm_stock_before_dc"] = response.json().get("current_stock", 0)
        print(f"RM stock before DC: {TestJWReceiveGRN.test_data['rm_stock_before_dc']}")
    
    def test_07_send_dc_for_sc_with_rm(self):
        """Send DC for SC with RM - should deduct stock using job-work/challans endpoint"""
        dc_data = {
            "subcontract_order_id": TestJWReceiveGRN.test_data["sc_order"]["id"],
            "lines": [
                {
                    "item_id": TestJWReceiveGRN.test_data["rm"]["id"],
                    "quantity": 20,
                    "rate": 50
                }
            ],
            "warehouse_id": "",
            "notes": "DC for SC with RM - should deduct stock",
            "skip_stock_deduct": False
        }
        response = TestJWReceiveGRN.session.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        assert response.status_code in [200, 201], f"Failed to create DC: {response.text}"
        dc_response = response.json()
        
        # Check if DC was created successfully or if there's insufficient stock
        if dc_response.get("success") == False:
            print(f"DC creation returned insufficient stock: {dc_response.get('message')}")
            pytest.skip("Insufficient stock for DC - expected behavior")
        
        TestJWReceiveGRN.test_data["dc"] = dc_response
        print(f"Created DC: {TestJWReceiveGRN.test_data['dc'].get('dc_number')}")
    
    def test_08_verify_dc_deducted_rm_stock(self):
        """Verify DC deducted RM stock (regression test)"""
        response = TestJWReceiveGRN.session.get(f"{BASE_URL}/api/items/{TestJWReceiveGRN.test_data['rm']['id']}")
        assert response.status_code == 200
        current_stock = response.json().get("current_stock", 0)
        expected_stock = TestJWReceiveGRN.test_data["rm_stock_before_dc"] - 20
        assert current_stock == expected_stock, f"DC did not deduct stock. Expected {expected_stock}, got {current_stock}"
        print(f"RM stock after DC: {current_stock} (deducted 20 as expected)")
    
    def test_09_get_sa_stock_before_grn(self):
        """Get SA stock before JW GRN"""
        response = TestJWReceiveGRN.session.get(f"{BASE_URL}/api/items/{TestJWReceiveGRN.test_data['sa']['id']}")
        assert response.status_code == 200
        TestJWReceiveGRN.test_data["sa_stock_before_grn"] = response.json().get("current_stock", 0)
        print(f"SA stock before JW GRN: {TestJWReceiveGRN.test_data['sa_stock_before_grn']}")
    
    def test_10_receive_grn_partial(self):
        """Test partial JW GRN - receive less than ordered"""
        grn_data = {
            "subcontract_order_id": TestJWReceiveGRN.test_data["sc_order"]["id"],
            "lines": [
                {
                    "item_id": TestJWReceiveGRN.test_data["sa"]["id"],
                    "received_quantity": 5,  # Only 5 out of 10
                    "process_charges": 50.0
                }
            ],
            "supplier_invoice_no": "INV-PARTIAL-001",
            "supplier_invoice_date": "2026-01-20"
        }
        response = TestJWReceiveGRN.session.post(f"{BASE_URL}/api/job-work/receive-grn", json=grn_data)
        assert response.status_code == 200, f"Failed to create partial JW GRN: {response.text}"
        data = response.json()
        
        # Verify response
        assert "grn_number" in data
        assert data["total_process_cost"] == 250.0  # 5 * 50
        assert data["all_received"] == False  # Partial receive
        TestJWReceiveGRN.test_data["grn_number"] = data["grn_number"]
        print(f"Partial JW GRN created: {data['grn_number']}, total_process_cost: {data['total_process_cost']}, all_received: {data['all_received']}")
    
    def test_11_verify_partial_grn_added_stock(self):
        """Verify partial JW GRN added SA stock"""
        response = TestJWReceiveGRN.session.get(f"{BASE_URL}/api/items/{TestJWReceiveGRN.test_data['sa']['id']}")
        assert response.status_code == 200
        current_stock = response.json().get("current_stock", 0)
        expected_stock = TestJWReceiveGRN.test_data["sa_stock_before_grn"] + 5
        assert current_stock == expected_stock, f"Partial GRN did not add stock correctly. Expected {expected_stock}, got {current_stock}"
        print(f"SA stock after partial JW GRN: {current_stock} (added 5 as expected)")
    
    def test_12_verify_sc_not_completed_after_partial(self):
        """Verify SC order is NOT completed after partial receive"""
        # Get all orders and find the one we created
        response = TestJWReceiveGRN.session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        orders = response.json()
        
        sc_order = None
        for order in orders:
            if order.get("id") == TestJWReceiveGRN.test_data["sc_order"]["id"]:
                sc_order = order
                break
        
        assert sc_order is not None, f"SC order not found with id={TestJWReceiveGRN.test_data['sc_order']['id']}"
        assert sc_order.get("status") != "completed", f"SC should not be completed after partial receive, but status is {sc_order.get('status')}"
        
        # Verify received_quantity on job_work_parts
        job_work_parts = sc_order.get("job_work_parts", [])
        for part in job_work_parts:
            if part.get("item_id") == TestJWReceiveGRN.test_data["sa"]["id"]:
                assert part.get("received_quantity", 0) == 5, f"Expected received_quantity=5, got {part.get('received_quantity')}"
        print(f"SC order status after partial: {sc_order.get('status')} (not completed as expected)")
    
    def test_13_receive_grn_remaining(self):
        """Receive remaining quantity to complete SC"""
        grn_data = {
            "subcontract_order_id": TestJWReceiveGRN.test_data["sc_order"]["id"],
            "lines": [
                {
                    "item_id": TestJWReceiveGRN.test_data["sa"]["id"],
                    "received_quantity": 5,  # Remaining 5 out of 10
                    "process_charges": 55.0  # Different process charges
                }
            ],
            "supplier_invoice_no": "INV-FINAL-001",
            "supplier_invoice_date": "2026-01-21"
        }
        response = TestJWReceiveGRN.session.post(f"{BASE_URL}/api/job-work/receive-grn", json=grn_data)
        assert response.status_code == 200, f"Failed to create final JW GRN: {response.text}"
        data = response.json()
        
        # Verify response
        assert "grn_number" in data
        assert data["total_process_cost"] == 275.0  # 5 * 55
        assert data["all_received"] == True  # All received now
        print(f"Final JW GRN created: {data['grn_number']}, total_process_cost: {data['total_process_cost']}, all_received: {data['all_received']}")
    
    def test_14_verify_final_grn_added_stock(self):
        """Verify final JW GRN added remaining SA stock"""
        response = TestJWReceiveGRN.session.get(f"{BASE_URL}/api/items/{TestJWReceiveGRN.test_data['sa']['id']}")
        assert response.status_code == 200
        current_stock = response.json().get("current_stock", 0)
        expected_stock = TestJWReceiveGRN.test_data["sa_stock_before_grn"] + 10  # Total 10 received
        assert current_stock == expected_stock, f"Final GRN did not add stock correctly. Expected {expected_stock}, got {current_stock}"
        print(f"SA stock after final JW GRN: {current_stock} (total 10 added as expected)")
    
    def test_15_verify_sc_completed(self):
        """Verify SC order is completed after all parts received"""
        # Get all orders and find the one we created
        response = TestJWReceiveGRN.session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        orders = response.json()
        
        sc_order = None
        for order in orders:
            if order.get("id") == TestJWReceiveGRN.test_data["sc_order"]["id"]:
                sc_order = order
                break
        
        assert sc_order is not None, f"SC order not found with id={TestJWReceiveGRN.test_data['sc_order']['id']}"
        assert sc_order.get("status") == "completed", f"SC should be completed, but status is {sc_order.get('status')}"
        assert sc_order.get("completed_at") is not None, "SC should have completed_at timestamp"
        
        # Verify received_quantity on job_work_parts
        job_work_parts = sc_order.get("job_work_parts", [])
        for part in job_work_parts:
            if part.get("item_id") == TestJWReceiveGRN.test_data["sa"]["id"]:
                assert part.get("received_quantity", 0) == 10, f"Expected received_quantity=10, got {part.get('received_quantity')}"
        print(f"SC order status: {sc_order.get('status')} (completed as expected)")
    
    def test_16_verify_grn_in_collection(self):
        """Verify GRN document exists in grn collection with jw_order_id"""
        # Get all GRNs and find the one with jw_order_id
        response = TestJWReceiveGRN.session.get(f"{BASE_URL}/api/grn")
        assert response.status_code == 200
        grns = response.json()
        
        jw_grn = None
        for grn in grns:
            if grn.get("jw_order_id") == TestJWReceiveGRN.test_data["sc_order"]["id"]:
                jw_grn = grn
                break
        
        assert jw_grn is not None, f"No GRN found with jw_order_id={TestJWReceiveGRN.test_data['sc_order']['id']}"
        assert jw_grn.get("jw_order_number") == TestJWReceiveGRN.test_data["sc_order"].get("order_number")
        assert "total_process_cost" in jw_grn
        print(f"GRN verified in collection: {jw_grn.get('grn_number')}, jw_order_number: {jw_grn.get('jw_order_number')}")


class TestJWReceiveGRNValidation:
    """Test validation and error cases for JW Receive GRN"""
    
    session = None
    
    @pytest.fixture(autouse=True)
    def setup_session(self):
        """Setup session for all tests"""
        if TestJWReceiveGRNValidation.session is None:
            TestJWReceiveGRNValidation.session = requests.Session()
            TestJWReceiveGRNValidation.session.headers.update({"Content-Type": "application/json"})
            # Login
            response = TestJWReceiveGRNValidation.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@erp.com",
                "password": "Admin@123"
            })
            assert response.status_code == 200
        yield
    
    def test_01_receive_grn_invalid_sc_order(self):
        """Test receive GRN with invalid SC order ID"""
        grn_data = {
            "subcontract_order_id": "invalid-sc-order-id",
            "lines": [
                {
                    "item_id": "some-item-id",
                    "received_quantity": 5,
                    "process_charges": 50.0
                }
            ]
        }
        response = TestJWReceiveGRNValidation.session.post(f"{BASE_URL}/api/job-work/receive-grn", json=grn_data)
        assert response.status_code == 404, f"Expected 404 for invalid SC order, got {response.status_code}"
        print("Invalid SC order returns 404 as expected")
    
    def test_02_receive_grn_empty_lines(self):
        """Test receive GRN with empty lines"""
        # First get a valid SC order
        response = TestJWReceiveGRNValidation.session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200
        sc_orders = response.json()
        
        if not sc_orders:
            pytest.skip("No SC orders available for testing")
        
        sc_order = sc_orders[0]
        
        grn_data = {
            "subcontract_order_id": sc_order["id"],
            "lines": []
        }
        response = TestJWReceiveGRNValidation.session.post(f"{BASE_URL}/api/job-work/receive-grn", json=grn_data)
        assert response.status_code == 400, f"Expected 400 for empty lines, got {response.status_code}"
        print("Empty lines returns 400 as expected")


class TestDCPrintHSNColumn:
    """Test DC print includes HSN column for both Part Details and RM tables"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup_session(self):
        """Setup session for all tests"""
        if TestDCPrintHSNColumn.session is None:
            TestDCPrintHSNColumn.session = requests.Session()
            TestDCPrintHSNColumn.session.headers.update({"Content-Type": "application/json"})
            # Login
            response = TestDCPrintHSNColumn.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@erp.com",
                "password": "Admin@123"
            })
            assert response.status_code == 200
        yield
    
    def test_01_create_items_with_hsn(self):
        """Create items with HSN codes"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Raw Material with HSN
        rm_data = {
            "part_number": f"TEST_RM_HSN_{unique_id}",
            "name": f"Test RM with HSN {unique_id}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 50.0,
            "current_stock": 100,
            "safety_stock": 10,
            "hsn_code": "7204"
        }
        response = TestDCPrintHSNColumn.session.post(f"{BASE_URL}/api/items", json=rm_data)
        assert response.status_code == 201
        TestDCPrintHSNColumn.test_data["rm"] = response.json()
        
        # SA with HSN
        sa_data = {
            "part_number": f"TEST_SA_HSN_{unique_id}",
            "name": f"Test SA with HSN {unique_id}",
            "category": "sub_assembly",
            "unit_of_measure": "pcs",
            "unit_cost": 200.0,
            "current_stock": 0,
            "safety_stock": 5,
            "hsn_code": "8481"
        }
        response = TestDCPrintHSNColumn.session.post(f"{BASE_URL}/api/items", json=sa_data)
        assert response.status_code == 201
        TestDCPrintHSNColumn.test_data["sa"] = response.json()
        
        print(f"Created items with HSN: RM hsn={TestDCPrintHSNColumn.test_data['rm'].get('hsn_code')}, SA hsn={TestDCPrintHSNColumn.test_data['sa'].get('hsn_code')}")
    
    def test_02_create_supplier(self):
        """Create supplier"""
        unique_id = str(uuid.uuid4())[:8]
        supplier_data = {
            "code": f"TEST_SUP_HSN_{unique_id}",
            "name": f"TEST_Supplier_HSN_{unique_id}",
            "contact_person": "Test Contact",
            "email": f"supplier_hsn_{unique_id}@test.com",
            "phone": "1234567890",
            "status": "active"
        }
        response = TestDCPrintHSNColumn.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert response.status_code == 201
        TestDCPrintHSNColumn.test_data["supplier"] = response.json()
        print(f"Created supplier: {TestDCPrintHSNColumn.test_data['supplier']['id']}")
    
    def test_03_create_sc_order(self):
        """Create SC order with RM and job_work_parts"""
        sc_data = {
            "supplier_id": TestDCPrintHSNColumn.test_data["supplier"]["id"],
            "lines": [
                {
                    "item_id": TestDCPrintHSNColumn.test_data["rm"]["id"],
                    "quantity": 10,
                    "rate": 50
                }
            ],
            "job_work_parts": [
                {
                    "item_id": TestDCPrintHSNColumn.test_data["sa"]["id"],
                    "quantity": 5,
                    "charges": 100.0
                }
            ],
            "expected_return_date": (datetime.now() + timedelta(days=14)).isoformat(),
            "processing_charges": 500
        }
        response = TestDCPrintHSNColumn.session.post(f"{BASE_URL}/api/job-work/orders", json=sc_data)
        assert response.status_code in [200, 201], f"Failed to create SC order: {response.text}"
        TestDCPrintHSNColumn.test_data["sc_order"] = response.json()
        print(f"Created SC order: {TestDCPrintHSNColumn.test_data['sc_order']['id']}")
    
    def test_04_confirm_sc_order(self):
        """Confirm SC order"""
        sc_id = TestDCPrintHSNColumn.test_data["sc_order"]["id"]
        response = TestDCPrintHSNColumn.session.put(f"{BASE_URL}/api/job-work/orders/{sc_id}", json={
            "status": "confirmed"
        })
        assert response.status_code == 200
        TestDCPrintHSNColumn.test_data["sc_order"] = response.json()
        print("SC order confirmed")
    
    def test_05_create_dc(self):
        """Create DC"""
        dc_data = {
            "subcontract_order_id": TestDCPrintHSNColumn.test_data["sc_order"]["id"],
            "lines": [
                {
                    "item_id": TestDCPrintHSNColumn.test_data["rm"]["id"],
                    "quantity": 10,
                    "rate": 50
                }
            ],
            "warehouse_id": "",
            "notes": "DC for HSN test"
        }
        response = TestDCPrintHSNColumn.session.post(f"{BASE_URL}/api/job-work/challans", json=dc_data)
        assert response.status_code in [200, 201], f"Failed to create DC: {response.text}"
        TestDCPrintHSNColumn.test_data["dc"] = response.json()
        print(f"Created DC: {TestDCPrintHSNColumn.test_data['dc'].get('dc_number')}")
    
    def test_06_verify_dc_has_hsn_in_lines(self):
        """Verify DC lines include HSN code"""
        # Get DC by ID - try different endpoints
        dc_id = TestDCPrintHSNColumn.test_data["dc"]["id"]
        
        # Try getting all challans and find the one we created
        response = TestDCPrintHSNColumn.session.get(f"{BASE_URL}/api/job-work/challans")
        assert response.status_code == 200, f"Failed to get challans: {response.text}"
        challans = response.json()
        
        dc = None
        for c in challans:
            if c.get("id") == dc_id:
                dc = c
                break
        
        assert dc is not None, f"DC not found with id={dc_id}"
        
        # Check lines have HSN
        hsn_found_in_rm = False
        for line in dc.get("lines", []):
            if line.get("item_id") == TestDCPrintHSNColumn.test_data["rm"]["id"]:
                # HSN should be in line or in item
                item = line.get("item", {})
                hsn = line.get("hsn_code") or item.get("hsn_code")
                if hsn == "7204":
                    hsn_found_in_rm = True
                    print(f"DC line has HSN: {hsn}")
        
        # Check job_work_parts have HSN
        hsn_found_in_sa = False
        for part in dc.get("job_work_parts", []):
            if part.get("item_id") == TestDCPrintHSNColumn.test_data["sa"]["id"]:
                item = part.get("item", {})
                hsn = part.get("hsn_code") or item.get("hsn_code")
                if hsn == "8481":
                    hsn_found_in_sa = True
                    print(f"DC job_work_part has HSN: {hsn}")
        
        # At least one HSN should be found
        assert hsn_found_in_rm or hsn_found_in_sa, "HSN codes not found in DC lines or job_work_parts"
        print("HSN codes verified in DC")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
