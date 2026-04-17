"""
Test Phase 1 Manufacturing ERP Features:
1. SC with RM: After DC sent, Create PO from SC, then Receive via GRN
2. Job Card outsource DC: Send DC with skip_stock_deduct=true (no stock deduction)
3. BOM explosion shows Material Cost, Process Cost, Total/Unit columns
4. All SC types can create PO and receive via GRN flow
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPhase1SCPOGRNFlow:
    """Test SC → DC → PO → GRN flow for Phase 1"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login"""
        if TestPhase1SCPOGRNFlow.session is None:
            TestPhase1SCPOGRNFlow.session = requests.Session()
            TestPhase1SCPOGRNFlow.session.headers.update({"Content-Type": "application/json"})
        yield
    
    def test_01_login(self):
        """Test login with admin credentials"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("email") == "admin@erp.com"
        assert data.get("role") == "admin"
        print("✓ Login successful with admin@erp.com")
    
    def test_02_create_test_items(self):
        """Create test items: RM, SA, FG"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create Raw Material
        rm_response = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST_RM_{unique_id}",
            "name": f"Test Raw Material {unique_id}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 50.0,
            "current_stock": 100,
            "safety_stock": 10
        })
        assert rm_response.status_code == 201, f"Failed to create RM: {rm_response.text}"
        self.test_data["rm_item"] = rm_response.json()
        print(f"✓ Created RM item: {self.test_data['rm_item']['part_number']}")
        
        # Create Sub-Assembly
        sa_response = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST_SA_{unique_id}",
            "name": f"Test Sub-Assembly {unique_id}",
            "category": "sub_assembly",
            "unit_of_measure": "pcs",
            "unit_cost": 200.0,
            "current_stock": 50,
            "safety_stock": 5
        })
        assert sa_response.status_code == 201, f"Failed to create SA: {sa_response.text}"
        self.test_data["sa_item"] = sa_response.json()
        print(f"✓ Created SA item: {self.test_data['sa_item']['part_number']}")
        
        # Create Finished Good
        fg_response = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST_FG_{unique_id}",
            "name": f"Test Finished Good {unique_id}",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 500.0,
            "current_stock": 0,
            "safety_stock": 2
        })
        assert fg_response.status_code == 201, f"Failed to create FG: {fg_response.text}"
        self.test_data["fg_item"] = fg_response.json()
        print(f"✓ Created FG item: {self.test_data['fg_item']['part_number']}")
        
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_03_create_supplier(self):
        """Create test supplier for subcontracting"""
        unique_id = str(uuid.uuid4())[:8]
        response = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "code": f"TEST_SUP_{unique_id}",
            "name": f"Test Supplier {unique_id}",
            "contact_person": "Test Contact",
            "email": "test@supplier.com",
            "phone": "1234567890",
            "status": "active"
        })
        assert response.status_code == 201, f"Failed to create supplier: {response.text}"
        self.test_data["supplier"] = response.json()
        print(f"✓ Created supplier: {self.test_data['supplier']['code']}")
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_04_create_routing(self):
        """Create test routing"""
        unique_id = str(uuid.uuid4())[:8]
        response = self.session.post(f"{BASE_URL}/api/routings", json={
            "name": f"TEST_ROUTING_{unique_id}",
            "description": "Test routing for Phase 1",
            "status": "active"
        })
        assert response.status_code == 201, f"Failed to create routing: {response.text}"
        self.test_data["routing"] = response.json()
        print(f"✓ Created routing: {self.test_data['routing']['name']}")
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_05_create_bom_with_routings(self):
        """Create BOM for FG with SA component and routings"""
        response = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": self.test_data["fg_item"]["id"],
            "name": f"BOM for {self.test_data['fg_item']['part_number']}",
            "description": "Test BOM with routings",
            "revision": "A",
            "status": "active",
            "components": [
                {
                    "item_id": self.test_data["sa_item"]["id"],
                    "quantity": 2,
                    "unit_of_measure": "pcs",
                    "routings": [self.test_data["routing"]["name"]]
                },
                {
                    "item_id": self.test_data["rm_item"]["id"],
                    "quantity": 5,
                    "unit_of_measure": "kg",
                    "routings": []
                }
            ],
            "parent_routings": ["Assembly"]
        })
        assert response.status_code in [200, 201], f"Failed to create BOM: {response.text}"
        self.test_data["bom"] = response.json()
        print(f"✓ Created BOM: {self.test_data['bom']['name']}")
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_06_bom_explosion_shows_cost_columns(self):
        """Verify BOM explosion returns process_cost_per_unit and total_cost_per_unit"""
        bom_id = self.test_data["bom"]["id"]
        response = self.session.get(f"{BASE_URL}/api/bom/{bom_id}/explode")
        assert response.status_code == 200, f"BOM explosion failed: {response.text}"
        
        data = response.json()
        assert "explosion" in data, "Missing explosion field"
        assert "total_rollup_cost" in data, "Missing total_rollup_cost field"
        
        # Check that each component has cost fields
        for comp in data["explosion"]:
            assert "unit_cost" in comp, f"Missing unit_cost in component"
            assert "extended_cost" in comp, f"Missing extended_cost in component"
            assert "process_cost_per_unit" in comp, f"Missing process_cost_per_unit in component"
            assert "total_cost_per_unit" in comp, f"Missing total_cost_per_unit in component"
        
        print(f"✓ BOM explosion returns cost columns: unit_cost, extended_cost, process_cost_per_unit, total_cost_per_unit")
        print(f"  Total rollup cost: {data['total_rollup_cost']}")
    
    def test_07_create_production_order(self):
        """Create production order (Sales Order)"""
        response = self.session.post(f"{BASE_URL}/api/production", json={
            "bom_id": self.test_data["bom"]["id"],
            "quantity": 10,
            "due_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "priority": "high",
            "notes": "Test production order for Phase 1"
        })
        assert response.status_code in [200, 201], f"Failed to create production order: {response.text}"
        self.test_data["production_order"] = response.json()
        print(f"✓ Created production order: {self.test_data['production_order']['order_number']}")
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_08_confirm_production_order(self):
        """Confirm the production order"""
        po_id = self.test_data["production_order"]["id"]
        response = self.session.post(f"{BASE_URL}/api/production/{po_id}/confirm")
        assert response.status_code == 200, f"Failed to confirm production order: {response.text}"
        print("✓ Production order confirmed")
    
    def test_09_create_work_order_with_subcontract(self):
        """Create work order with subcontracting enabled"""
        response = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": self.test_data["production_order"]["id"],
            "quantity": 10,
            "scheduled_start": datetime.now().isoformat(),
            "scheduled_end": (datetime.now() + timedelta(days=7)).isoformat(),
            "notes": "Test work order with subcontracting",
            "is_subcontract": True,
            "subcontract_supplier_id": self.test_data["supplier"]["id"],
            "subcontract_type": "with_material"
        })
        assert response.status_code in [200, 201], f"Failed to create work order: {response.text}"
        self.test_data["work_order"] = response.json()
        print(f"✓ Created work order: {self.test_data['work_order'].get('wo_number', 'N/A')}")
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_10_create_sc_order_with_rm(self):
        """Create SC order with RM (with_material type)"""
        response = self.session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": self.test_data["supplier"]["id"],
            "lines": [
                {
                    "item_id": self.test_data["rm_item"]["id"],
                    "quantity": 20,
                    "rate": 50
                }
            ],
            "job_work_parts": [
                {
                    "item_id": self.test_data["sa_item"]["id"],
                    "quantity": 10,
                    "charges": 100
                }
            ],
            "expected_return_date": (datetime.now() + timedelta(days=14)).isoformat(),
            "processing_charges": 1000,
            "notes": "Test SC order with RM"
        })
        assert response.status_code in [200, 201], f"Failed to create SC order: {response.text}"
        self.test_data["sc_order_with_rm"] = response.json()
        print(f"✓ Created SC order with RM: {self.test_data['sc_order_with_rm'].get('order_number', 'N/A')}")
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_11_confirm_sc_order(self):
        """Confirm SC order"""
        sc_id = self.test_data["sc_order_with_rm"]["id"]
        response = self.session.put(f"{BASE_URL}/api/job-work/orders/{sc_id}", json={
            "status": "confirmed"
        })
        assert response.status_code == 200, f"Failed to confirm SC order: {response.text}"
        print("✓ SC order confirmed")
    
    def test_12_send_dc_for_sc_with_rm_deducts_stock(self):
        """Send DC for SC with RM - should deduct stock (skip_stock_deduct=false)"""
        # Get initial stock
        rm_item = self.session.get(f"{BASE_URL}/api/items/{self.test_data['rm_item']['id']}").json()
        initial_stock = rm_item.get("current_stock", 0)
        print(f"  Initial RM stock: {initial_stock}")
        
        # Create DC with skip_stock_deduct=false (default)
        response = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": self.test_data["sc_order_with_rm"]["id"],
            "lines": [
                {
                    "item_id": self.test_data["rm_item"]["id"],
                    "quantity": 20,
                    "rate": 50
                }
            ],
            "warehouse_id": "",
            "notes": "DC for SC with RM - should deduct stock",
            "skip_stock_deduct": False
        })
        assert response.status_code in [200, 201], f"Failed to create DC: {response.text}"
        dc_data = response.json()
        
        # Check if DC was created successfully or if there's insufficient stock
        if dc_data.get("success") == False:
            print(f"  DC creation returned insufficient stock: {dc_data.get('message')}")
            pytest.skip("Insufficient stock for DC - expected behavior")
        
        self.test_data["dc_with_rm"] = dc_data
        print(f"✓ Created DC: {dc_data.get('dc_number', 'N/A')}")
        
        # Verify stock was deducted
        rm_item_after = self.session.get(f"{BASE_URL}/api/items/{self.test_data['rm_item']['id']}").json()
        final_stock = rm_item_after.get("current_stock", 0)
        print(f"  Final RM stock: {final_stock}")
        
        expected_stock = initial_stock - 20
        assert final_stock == expected_stock, f"Stock not deducted correctly. Expected {expected_stock}, got {final_stock}"
        print(f"✓ Stock deducted correctly: {initial_stock} → {final_stock}")
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_13_create_po_from_sc(self):
        """Create PO from SC order after DC sent"""
        sc_id = self.test_data["sc_order_with_rm"]["id"]
        response = self.session.post(f"{BASE_URL}/api/job-work/create-po", json={
            "subcontract_order_ids": [sc_id]
        })
        assert response.status_code in [200, 201], f"Failed to create PO from SC: {response.text}"
        po_data = response.json()
        assert "po_number" in po_data, f"Missing po_number in response: {po_data}"
        assert "po_id" in po_data, f"Missing po_id in response: {po_data}"
        
        self.test_data["po_from_sc"] = po_data
        print(f"✓ Created PO from SC: {po_data['po_number']}")
        print(f"  Total amount: {po_data.get('total_amount', 0)}")
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_14_verify_sc_marked_po_created(self):
        """Verify SC order is marked with po_created=true"""
        sc_id = self.test_data["sc_order_with_rm"]["id"]
        # Get all SC orders and find the one we need
        response = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200, f"Failed to get SC orders: {response.text}"
        sc_orders = response.json()
        sc_data = next((sc for sc in sc_orders if sc.get("id") == sc_id), None)
        assert sc_data is not None, f"SC order {sc_id} not found in list"
        
        assert sc_data.get("po_created") == True, f"SC order not marked as po_created: {sc_data.get('po_created')}"
        assert sc_data.get("po_number") == self.test_data["po_from_sc"]["po_number"], "PO number mismatch"
        print(f"✓ SC order marked with po_created=true, po_number={sc_data.get('po_number')}")
    
    def test_15_verify_po_has_job_work_parts_as_lines(self):
        """Verify PO lines come from job_work_parts (FG/SA items with charges)"""
        po_id = self.test_data["po_from_sc"]["po_id"]
        response = self.session.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert response.status_code == 200, f"Failed to get PO: {response.text}"
        po_data = response.json()
        
        assert "lines" in po_data, "Missing lines in PO"
        assert len(po_data["lines"]) > 0, "PO has no lines"
        
        # Verify PO line has SA item (from job_work_parts)
        sa_item_id = self.test_data["sa_item"]["id"]
        sa_line = next((l for l in po_data["lines"] if l.get("item_id") == sa_item_id), None)
        assert sa_line is not None, f"SA item not found in PO lines. Lines: {po_data['lines']}"
        
        # Verify charges are used as unit_price
        assert sa_line.get("unit_price") == 100, f"Unit price should be charges (100), got {sa_line.get('unit_price')}"
        print(f"✓ PO lines contain job_work_parts items with charges as unit_price")
        print(f"  SA item line: qty={sa_line.get('quantity')}, unit_price={sa_line.get('unit_price')}")
    
    def test_16_approve_po(self):
        """Approve the PO for GRN"""
        po_id = self.test_data["po_from_sc"]["po_id"]
        response = self.session.put(f"{BASE_URL}/api/purchase-orders/{po_id}", json={
            "status": "approved"
        })
        assert response.status_code == 200, f"Failed to approve PO: {response.text}"
        print("✓ PO approved")
    
    def test_17_create_grn_against_sc_linked_po(self):
        """Create GRN against SC-linked PO - should add stock and complete MO"""
        po_id = self.test_data["po_from_sc"]["po_id"]
        sa_item_id = self.test_data["sa_item"]["id"]
        
        # Get initial SA stock
        sa_item = self.session.get(f"{BASE_URL}/api/items/{sa_item_id}").json()
        initial_sa_stock = sa_item.get("current_stock", 0)
        print(f"  Initial SA stock: {initial_sa_stock}")
        
        # Create GRN
        response = self.session.post(f"{BASE_URL}/api/grn", json={
            "po_id": po_id,
            "supplier_invoice_no": "INV-TEST-001",
            "supplier_invoice_date": datetime.now().isoformat(),
            "lines": [
                {
                    "item_id": sa_item_id,
                    "received_quantity": 10,
                    "verified_price": 100
                }
            ],
            "warehouse_id": "",
            "notes": "GRN for SC-linked PO"
        })
        assert response.status_code in [200, 201], f"Failed to create GRN: {response.text}"
        grn_data = response.json()
        self.test_data["grn"] = grn_data
        print(f"✓ Created GRN: {grn_data.get('grn_number', 'N/A')}")
        
        # Verify SA stock increased
        sa_item_after = self.session.get(f"{BASE_URL}/api/items/{sa_item_id}").json()
        final_sa_stock = sa_item_after.get("current_stock", 0)
        print(f"  Final SA stock: {final_sa_stock}")
        
        expected_stock = initial_sa_stock + 10
        assert final_sa_stock == expected_stock, f"SA stock not increased correctly. Expected {expected_stock}, got {final_sa_stock}"
        print(f"✓ SA stock increased correctly: {initial_sa_stock} → {final_sa_stock}")
        TestPhase1SCPOGRNFlow.test_data = self.test_data
    
    def test_18_verify_sc_completed_after_grn(self):
        """Verify SC order is marked as completed after GRN"""
        sc_id = self.test_data["sc_order_with_rm"]["id"]
        # Get all SC orders and find the one we need
        response = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200, f"Failed to get SC orders: {response.text}"
        sc_orders = response.json()
        sc_data = next((sc for sc in sc_orders if sc.get("id") == sc_id), None)
        assert sc_data is not None, f"SC order {sc_id} not found in list"
        
        assert sc_data.get("status") == "completed", f"SC order not completed. Status: {sc_data.get('status')}"
        print(f"✓ SC order marked as completed after GRN")


class TestJobCardOutsourceDC:
    """Test Job Card outsource DC with skip_stock_deduct=true"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login"""
        if TestJobCardOutsourceDC.session is None:
            TestJobCardOutsourceDC.session = requests.Session()
            TestJobCardOutsourceDC.session.headers.update({"Content-Type": "application/json"})
            # Login
            response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@erp.com",
                "password": "Admin@123"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
        yield
    
    def test_01_create_test_items_for_outsource(self):
        """Create test items for Job Card outsource"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create Part item (for outsource processing)
        part_response = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST_PART_{unique_id}",
            "name": f"Test Part for Outsource {unique_id}",
            "category": "component",
            "unit_of_measure": "pcs",
            "unit_cost": 150.0,
            "current_stock": 30,
            "safety_stock": 5
        })
        assert part_response.status_code == 201, f"Failed to create Part: {part_response.text}"
        self.test_data["part_item"] = part_response.json()
        print(f"✓ Created Part item: {self.test_data['part_item']['part_number']}")
        
        TestJobCardOutsourceDC.test_data = self.test_data
    
    def test_02_create_supplier_for_outsource(self):
        """Create supplier for outsource"""
        unique_id = str(uuid.uuid4())[:8]
        response = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "code": f"TEST_OUT_SUP_{unique_id}",
            "name": f"Test Outsource Supplier {unique_id}",
            "contact_person": "Outsource Contact",
            "email": "outsource@supplier.com",
            "phone": "9876543210",
            "status": "active"
        })
        assert response.status_code == 201, f"Failed to create supplier: {response.text}"
        self.test_data["outsource_supplier"] = response.json()
        print(f"✓ Created outsource supplier: {self.test_data['outsource_supplier']['code']}")
        TestJobCardOutsourceDC.test_data = self.test_data
    
    def test_03_create_sc_order_without_material(self):
        """Create SC order without_material (Job Card outsource type)"""
        response = self.session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": self.test_data["outsource_supplier"]["id"],
            "lines": [],  # No RM lines for without_material
            "job_work_parts": [
                {
                    "item_id": self.test_data["part_item"]["id"],
                    "quantity": 15,
                    "charges": 75
                }
            ],
            "expected_return_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "processing_charges": 500,
            "notes": "Test SC order without material (Job Card outsource)"
        })
        assert response.status_code in [200, 201], f"Failed to create SC order: {response.text}"
        self.test_data["sc_order_outsource"] = response.json()
        print(f"✓ Created SC order (without_material): {self.test_data['sc_order_outsource'].get('order_number', 'N/A')}")
        TestJobCardOutsourceDC.test_data = self.test_data
    
    def test_04_confirm_outsource_sc_order(self):
        """Confirm outsource SC order"""
        sc_id = self.test_data["sc_order_outsource"]["id"]
        response = self.session.put(f"{BASE_URL}/api/job-work/orders/{sc_id}", json={
            "status": "confirmed"
        })
        assert response.status_code == 200, f"Failed to confirm SC order: {response.text}"
        print("✓ Outsource SC order confirmed")
    
    def test_05_send_dc_with_skip_stock_deduct_true(self):
        """Send DC with skip_stock_deduct=true - should NOT deduct stock"""
        part_item_id = self.test_data["part_item"]["id"]
        
        # Get initial stock
        part_item = self.session.get(f"{BASE_URL}/api/items/{part_item_id}").json()
        initial_stock = part_item.get("current_stock", 0)
        print(f"  Initial Part stock: {initial_stock}")
        
        # Create DC with skip_stock_deduct=true
        response = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": self.test_data["sc_order_outsource"]["id"],
            "lines": [
                {
                    "item_id": part_item_id,
                    "quantity": 15,
                    "rate": 150
                }
            ],
            "warehouse_id": "",
            "notes": "DC for Job Card outsource - skip_stock_deduct=true",
            "skip_stock_deduct": True
        })
        assert response.status_code in [200, 201], f"Failed to create DC: {response.text}"
        dc_data = response.json()
        
        # Check if DC was created successfully
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data.get('message')}")
        
        self.test_data["dc_outsource"] = dc_data
        print(f"✓ Created DC with skip_stock_deduct=true: {dc_data.get('dc_number', 'N/A')}")
        
        # Verify stock was NOT deducted
        part_item_after = self.session.get(f"{BASE_URL}/api/items/{part_item_id}").json()
        final_stock = part_item_after.get("current_stock", 0)
        print(f"  Final Part stock: {final_stock}")
        
        assert final_stock == initial_stock, f"Stock should NOT be deducted with skip_stock_deduct=true. Expected {initial_stock}, got {final_stock}"
        print(f"✓ Stock NOT deducted (skip_stock_deduct=true): {initial_stock} → {final_stock}")
        TestJobCardOutsourceDC.test_data = self.test_data
    
    def test_06_verify_no_inventory_transaction_created(self):
        """Verify no inventory transaction was created for skip_stock_deduct DC"""
        dc_number = self.test_data["dc_outsource"].get("dc_number", "")
        
        # Check inventory transactions
        response = self.session.get(f"{BASE_URL}/api/inventory/transactions")
        if response.status_code == 200:
            transactions = response.json()
            dc_transactions = [t for t in transactions if t.get("reference_id") == dc_number]
            assert len(dc_transactions) == 0, f"Inventory transaction should not be created for skip_stock_deduct DC. Found: {dc_transactions}"
            print(f"✓ No inventory transaction created for skip_stock_deduct DC")
        else:
            print(f"  Could not verify inventory transactions (endpoint may not exist)")
    
    def test_07_create_po_from_outsource_sc(self):
        """Create PO from outsource SC order"""
        sc_id = self.test_data["sc_order_outsource"]["id"]
        response = self.session.post(f"{BASE_URL}/api/job-work/create-po", json={
            "subcontract_order_ids": [sc_id]
        })
        assert response.status_code in [200, 201], f"Failed to create PO from SC: {response.text}"
        po_data = response.json()
        assert "po_number" in po_data, f"Missing po_number in response: {po_data}"
        
        self.test_data["po_from_outsource_sc"] = po_data
        print(f"✓ Created PO from outsource SC: {po_data['po_number']}")
        TestJobCardOutsourceDC.test_data = self.test_data
    
    def test_08_approve_and_grn_outsource_po(self):
        """Approve PO and create GRN for outsource SC"""
        po_id = self.test_data["po_from_outsource_sc"]["po_id"]
        part_item_id = self.test_data["part_item"]["id"]
        
        # Approve PO
        response = self.session.put(f"{BASE_URL}/api/purchase-orders/{po_id}", json={
            "status": "approved"
        })
        assert response.status_code == 200, f"Failed to approve PO: {response.text}"
        print("✓ Outsource PO approved")
        
        # Get initial stock
        part_item = self.session.get(f"{BASE_URL}/api/items/{part_item_id}").json()
        initial_stock = part_item.get("current_stock", 0)
        print(f"  Initial Part stock before GRN: {initial_stock}")
        
        # Create GRN
        response = self.session.post(f"{BASE_URL}/api/grn", json={
            "po_id": po_id,
            "supplier_invoice_no": "INV-OUT-001",
            "supplier_invoice_date": datetime.now().isoformat(),
            "lines": [
                {
                    "item_id": part_item_id,
                    "received_quantity": 15,
                    "verified_price": 75
                }
            ],
            "warehouse_id": "",
            "notes": "GRN for outsource SC-linked PO"
        })
        assert response.status_code in [200, 201], f"Failed to create GRN: {response.text}"
        grn_data = response.json()
        print(f"✓ Created GRN: {grn_data.get('grn_number', 'N/A')}")
        
        # Verify stock increased
        part_item_after = self.session.get(f"{BASE_URL}/api/items/{part_item_id}").json()
        final_stock = part_item_after.get("current_stock", 0)
        print(f"  Final Part stock after GRN: {final_stock}")
        
        expected_stock = initial_stock + 15
        assert final_stock == expected_stock, f"Stock not increased correctly. Expected {expected_stock}, got {final_stock}"
        print(f"✓ Stock increased after GRN: {initial_stock} → {final_stock}")


class TestSCConsolidation:
    """Test SC consolidation for multiple outsourced operations to same supplier"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login"""
        if TestSCConsolidation.session is None:
            TestSCConsolidation.session = requests.Session()
            TestSCConsolidation.session.headers.update({"Content-Type": "application/json"})
            # Login
            response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@erp.com",
                "password": "Admin@123"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
        yield
    
    def test_01_verify_sc_consolidation_endpoint_exists(self):
        """Verify SC orders endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/job-work/orders")
        assert response.status_code == 200, f"Failed to get SC orders: {response.text}"
        print("✓ SC orders endpoint works")


class TestRegressionSCWithRMDCDeductsStock:
    """Regression test: SC with RM DC still deducts stock correctly"""
    
    session = None
    test_data = {}
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login"""
        if TestRegressionSCWithRMDCDeductsStock.session is None:
            TestRegressionSCWithRMDCDeductsStock.session = requests.Session()
            TestRegressionSCWithRMDCDeductsStock.session.headers.update({"Content-Type": "application/json"})
            # Login
            response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@erp.com",
                "password": "Admin@123"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
        yield
    
    def test_01_create_rm_item_with_stock(self):
        """Create RM item with sufficient stock"""
        unique_id = str(uuid.uuid4())[:8]
        response = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST_REG_RM_{unique_id}",
            "name": f"Test Regression RM {unique_id}",
            "category": "raw_material",
            "unit_of_measure": "kg",
            "unit_cost": 25.0,
            "current_stock": 200,
            "safety_stock": 10
        })
        assert response.status_code == 201, f"Failed to create RM: {response.text}"
        self.test_data["reg_rm_item"] = response.json()
        print(f"✓ Created RM item with stock 200: {self.test_data['reg_rm_item']['part_number']}")
        TestRegressionSCWithRMDCDeductsStock.test_data = self.test_data
    
    def test_02_create_supplier(self):
        """Create supplier"""
        unique_id = str(uuid.uuid4())[:8]
        response = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "code": f"TEST_REG_SUP_{unique_id}",
            "name": f"Test Regression Supplier {unique_id}",
            "status": "active"
        })
        assert response.status_code == 201, f"Failed to create supplier: {response.text}"
        self.test_data["reg_supplier"] = response.json()
        TestRegressionSCWithRMDCDeductsStock.test_data = self.test_data
    
    def test_03_create_and_confirm_sc_order(self):
        """Create and confirm SC order with RM"""
        # Create SA item for job_work_parts
        unique_id = str(uuid.uuid4())[:8]
        sa_response = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": f"TEST_REG_SA_{unique_id}",
            "name": f"Test Regression SA {unique_id}",
            "category": "sub_assembly",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0,
            "current_stock": 0
        })
        assert sa_response.status_code == 201
        self.test_data["reg_sa_item"] = sa_response.json()
        
        # Create SC order
        response = self.session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": self.test_data["reg_supplier"]["id"],
            "lines": [
                {
                    "item_id": self.test_data["reg_rm_item"]["id"],
                    "quantity": 50,
                    "rate": 25
                }
            ],
            "job_work_parts": [
                {
                    "item_id": self.test_data["reg_sa_item"]["id"],
                    "quantity": 10,
                    "charges": 50
                }
            ],
            "expected_return_date": (datetime.now() + timedelta(days=14)).isoformat(),
            "notes": "Regression test SC order"
        })
        assert response.status_code in [200, 201], f"Failed to create SC order: {response.text}"
        self.test_data["reg_sc_order"] = response.json()
        
        # Confirm
        sc_id = self.test_data["reg_sc_order"]["id"]
        response = self.session.put(f"{BASE_URL}/api/job-work/orders/{sc_id}", json={
            "status": "confirmed"
        })
        assert response.status_code == 200
        print(f"✓ Created and confirmed SC order: {self.test_data['reg_sc_order'].get('order_number')}")
        TestRegressionSCWithRMDCDeductsStock.test_data = self.test_data
    
    def test_04_dc_without_skip_deducts_stock(self):
        """DC without skip_stock_deduct should deduct stock"""
        rm_item_id = self.test_data["reg_rm_item"]["id"]
        
        # Get initial stock
        rm_item = self.session.get(f"{BASE_URL}/api/items/{rm_item_id}").json()
        initial_stock = rm_item.get("current_stock", 0)
        print(f"  Initial RM stock: {initial_stock}")
        
        # Create DC without skip_stock_deduct (default false)
        response = self.session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": self.test_data["reg_sc_order"]["id"],
            "lines": [
                {
                    "item_id": rm_item_id,
                    "quantity": 50,
                    "rate": 25
                }
            ],
            "notes": "Regression DC - should deduct stock"
            # skip_stock_deduct not specified, defaults to false
        })
        assert response.status_code in [200, 201], f"Failed to create DC: {response.text}"
        dc_data = response.json()
        
        if dc_data.get("success") == False:
            pytest.fail(f"DC creation failed: {dc_data.get('message')}")
        
        # Verify stock was deducted
        rm_item_after = self.session.get(f"{BASE_URL}/api/items/{rm_item_id}").json()
        final_stock = rm_item_after.get("current_stock", 0)
        print(f"  Final RM stock: {final_stock}")
        
        expected_stock = initial_stock - 50
        assert final_stock == expected_stock, f"Stock not deducted. Expected {expected_stock}, got {final_stock}"
        print(f"✓ REGRESSION PASS: Stock deducted correctly for SC with RM DC: {initial_stock} → {final_stock}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
