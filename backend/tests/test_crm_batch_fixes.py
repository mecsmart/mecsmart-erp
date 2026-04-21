"""
CRM Batch Fixes Test Suite - Iteration 68
Tests for:
1. Part delete referential integrity (blocked if referenced in BOMs/POs/GRNs/SC/DC/WO/Inventory/PI/Quotations/Tickets)
2. Quotation discount_pct on lines with correct totals computation
3. Quotation status=accepted auto-converts to SO and sets status=converted, lead to won
4. Quotation is_locked flag (true when converted & SO active, false when SO cancelled)
5. Quotation edit/delete blocked when locked, allowed when SO cancelled
6. Lead import with auto-customer creation
7. Customer/Contact import with duplicate skip
8. Lead delete and Ticket delete working
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Get auth token for subsequent tests"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        # Login
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        return session
    
    def test_login(self, auth_session):
        """Verify login works"""
        resp = auth_session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "admin@erp.com"
        print("✓ Login successful")


class TestPartDeleteReferentialIntegrity:
    """Test that parts cannot be deleted if referenced in transactions"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        return session
    
    def test_delete_unreferenced_item_succeeds(self, auth_session):
        """Create an item with no references and delete it successfully"""
        # Create a test item
        item_data = {
            "part_number": f"TEST-DELETE-{int(time.time())}",
            "name": "Test Item For Deletion",
            "category": "raw_material",
            "unit_of_measure": "pcs",
            "unit_cost": 10.0
        }
        resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201, f"Failed to create item: {resp.text}"
        item_id = resp.json()["id"]
        
        # Delete should succeed
        resp = auth_session.delete(f"{BASE_URL}/api/items/{item_id}")
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        assert "deleted" in resp.json().get("message", "").lower()
        print("✓ Unreferenced item deleted successfully")
    
    def test_delete_item_referenced_in_quotation_blocked(self, auth_session):
        """Item referenced in a quotation cannot be deleted"""
        # Create a test item
        item_data = {
            "part_number": f"TEST-QUO-REF-{int(time.time())}",
            "name": "Test Item Referenced in Quotation",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "unit_cost": 100.0,
            "sale_price": 150.0
        }
        resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item_id = resp.json()["id"]
        
        # Create a quotation referencing this item
        quo_data = {
            "customer_name": "Test Customer for Ref Check",
            "lines": [{
                "item_id": item_id,
                "description": "Test line",
                "quantity": 5,
                "rate": 100.0,
                "gst_rate": 18.0
            }]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quo_data)
        assert resp.status_code == 201, f"Failed to create quotation: {resp.text}"
        quo_id = resp.json()["id"]
        
        # Try to delete item - should fail
        resp = auth_session.delete(f"{BASE_URL}/api/items/{item_id}")
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        assert "Quotation" in resp.json().get("detail", "")
        print("✓ Item referenced in quotation cannot be deleted (400)")
        
        # Cleanup: delete quotation first, then item
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{quo_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{item_id}")
    
    def test_delete_item_referenced_in_ticket_blocked(self, auth_session):
        """Item referenced in a support ticket cannot be deleted"""
        # Create a test item
        item_data = {
            "part_number": f"TEST-TKT-REF-{int(time.time())}",
            "name": "Test Item Referenced in Ticket",
            "category": "finished_good",
            "unit_of_measure": "pcs"
        }
        resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item_id = resp.json()["id"]
        
        # Need a customer for ticket
        cust_resp = auth_session.get(f"{BASE_URL}/api/customers")
        customers = cust_resp.json()
        if not customers:
            cust_data = {"name": "Test Customer for Ticket", "code": f"TCKT-{int(time.time())}"}
            cust_resp = auth_session.post(f"{BASE_URL}/api/customers", json=cust_data)
            customer_id = cust_resp.json()["id"]
        else:
            customer_id = customers[0]["id"]
        
        # Create a ticket referencing this item
        ticket_data = {
            "subject": "Test Ticket with Product",
            "customer_id": customer_id,
            "product_ids": [item_id],
            "priority": "medium"
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tickets", json=ticket_data)
        assert resp.status_code == 201, f"Failed to create ticket: {resp.text}"
        ticket_id = resp.json()["id"]
        
        # Try to delete item - should fail
        resp = auth_session.delete(f"{BASE_URL}/api/items/{item_id}")
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        assert "Ticket" in resp.json().get("detail", "")
        print("✓ Item referenced in ticket cannot be deleted (400)")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tickets/{ticket_id}")
        auth_session.delete(f"{BASE_URL}/api/items/{item_id}")


class TestQuotationDiscountAndTotals:
    """Test quotation line discount_pct and totals computation"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        return session
    
    def test_quotation_discount_calculation(self, auth_session):
        """Test: 10 qty × 1000 rate with 10% discount → subtotal 9000, gst 1620, total 10620"""
        quo_data = {
            "customer_name": "Discount Test Customer",
            "lines": [{
                "description": "Test Product with Discount",
                "quantity": 10,
                "rate": 1000.0,
                "discount_pct": 10.0,  # 10% discount
                "gst_rate": 18.0
            }]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quo_data)
        assert resp.status_code == 201, f"Failed: {resp.text}"
        data = resp.json()
        
        # Verify calculations:
        # gross = 10 × 1000 = 10000
        # discount = 10000 × 10% = 1000
        # subtotal (net) = 10000 - 1000 = 9000
        # gst = 9000 × 18% = 1620
        # grand_total = 9000 + 1620 = 10620
        assert data["subtotal"] == 9000.0, f"Expected subtotal 9000, got {data['subtotal']}"
        assert data["total_discount"] == 1000.0, f"Expected discount 1000, got {data['total_discount']}"
        assert data["total_gst"] == 1620.0, f"Expected gst 1620, got {data['total_gst']}"
        assert data["grand_total"] == 10620.0, f"Expected total 10620, got {data['grand_total']}"
        
        # Verify line amount (net after discount)
        assert data["lines"][0]["amount"] == 9000.0, f"Expected line amount 9000, got {data['lines'][0]['amount']}"
        
        print("✓ Quotation discount calculation correct: subtotal=9000, discount=1000, gst=1620, total=10620")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{data['id']}")
    
    def test_quotation_multiple_lines_with_discount(self, auth_session):
        """Test multiple lines with different discounts"""
        quo_data = {
            "customer_name": "Multi-line Discount Test",
            "lines": [
                {"description": "Line 1", "quantity": 5, "rate": 200.0, "discount_pct": 10.0, "gst_rate": 18.0},
                {"description": "Line 2", "quantity": 3, "rate": 500.0, "discount_pct": 5.0, "gst_rate": 18.0},
            ]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quo_data)
        assert resp.status_code == 201
        data = resp.json()
        
        # Line 1: 5×200=1000, disc=100, net=900
        # Line 2: 3×500=1500, disc=75, net=1425
        # subtotal = 900 + 1425 = 2325
        # total_discount = 100 + 75 = 175
        # gst = 2325 × 18% = 418.5
        # grand_total = 2325 + 418.5 = 2743.5
        assert data["subtotal"] == 2325.0, f"Expected 2325, got {data['subtotal']}"
        assert data["total_discount"] == 175.0, f"Expected 175, got {data['total_discount']}"
        assert data["total_gst"] == 418.5, f"Expected 418.5, got {data['total_gst']}"
        assert data["grand_total"] == 2743.5, f"Expected 2743.5, got {data['grand_total']}"
        
        print("✓ Multi-line quotation discount calculation correct")
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{data['id']}")


class TestQuotationAcceptAutoConvert:
    """Test quotation status=accepted auto-converts to SO"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        return session
    
    @pytest.fixture(scope="class")
    def item_with_bom(self, auth_session):
        """Create an item with a BOM for conversion testing"""
        # Create item
        item_data = {
            "part_number": f"TEST-CONV-{int(time.time())}",
            "name": "Test Item for Conversion",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "sale_price": 500.0
        }
        resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item = resp.json()
        
        # Create BOM for this item
        bom_data = {
            "parent_item_id": item["id"],
            "name": f"BOM for {item['part_number']}",
            "revision": "A",
            "status": "active",
            "components": []
        }
        resp = auth_session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert resp.status_code in [200, 201], f"BOM create failed: {resp.text}"
        bom = resp.json()
        
        yield {"item": item, "bom": bom}
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        auth_session.delete(f"{BASE_URL}/api/items/{item['id']}")
    
    def test_accept_quotation_auto_converts_to_so(self, auth_session, item_with_bom):
        """Setting status=accepted auto-generates SO and sets status=converted"""
        item = item_with_bom["item"]
        
        # Create a draft quotation
        quo_data = {
            "customer_name": "Auto Convert Test Customer",
            "lines": [{
                "item_id": item["id"],
                "description": item["name"],
                "quantity": 2,
                "rate": 500.0,
                "gst_rate": 18.0
            }]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quo_data)
        assert resp.status_code == 201
        quo = resp.json()
        assert quo["status"] == "draft"
        quo_id = quo["id"]
        
        # Update status to accepted
        resp = auth_session.put(f"{BASE_URL}/api/crm/quotations/{quo_id}", json={"status": "accepted"})
        assert resp.status_code == 200, f"Accept failed: {resp.text}"
        updated = resp.json()
        
        # Verify auto-conversion
        assert updated["status"] == "converted", f"Expected status=converted, got {updated['status']}"
        assert updated.get("converted_so_id"), "Expected converted_so_id to be set"
        assert updated.get("converted_so_no"), "Expected converted_so_no to be set"
        assert updated["converted_so_no"].startswith("SO-"), f"Expected SO number, got {updated['converted_so_no']}"
        
        print(f"✓ Quotation accepted → auto-converted to {updated['converted_so_no']}")
        
        # Verify SO was created
        so_id = updated["converted_so_id"]
        resp = auth_session.get(f"{BASE_URL}/api/production/{so_id}")
        assert resp.status_code == 200
        so = resp.json()
        assert so["order_number"] == updated["converted_so_no"]
        
        # Cleanup: cancel SO first, then delete quotation
        auth_session.post(f"{BASE_URL}/api/production/{so_id}/cancel")
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{quo_id}")


class TestQuotationLockingBehavior:
    """Test quotation is_locked flag and edit/delete restrictions"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        return session
    
    @pytest.fixture(scope="class")
    def item_with_bom(self, auth_session):
        """Create an item with a BOM"""
        item_data = {
            "part_number": f"TEST-LOCK-{int(time.time())}",
            "name": "Test Item for Lock Testing",
            "category": "finished_good",
            "unit_of_measure": "pcs",
            "sale_price": 300.0
        }
        resp = auth_session.post(f"{BASE_URL}/api/items", json=item_data)
        assert resp.status_code == 201
        item = resp.json()
        
        bom_data = {
            "parent_item_id": item["id"],
            "name": f"BOM for {item['part_number']}",
            "revision": "A",
            "status": "active",
            "components": []
        }
        resp = auth_session.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert resp.status_code in [200, 201], f"BOM create failed: {resp.text}"
        bom = resp.json()
        
        yield {"item": item, "bom": bom}
        
        auth_session.delete(f"{BASE_URL}/api/bom/{bom['id']}")
        auth_session.delete(f"{BASE_URL}/api/items/{item['id']}")
    
    def test_draft_quotation_not_locked(self, auth_session):
        """Draft quotation should have is_locked=false"""
        quo_data = {
            "customer_name": "Lock Test Customer",
            "lines": [{"description": "Test", "quantity": 1, "rate": 100.0, "gst_rate": 18.0}]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quo_data)
        assert resp.status_code == 201
        quo = resp.json()
        
        assert quo.get("is_locked") == False, f"Expected is_locked=False for draft, got {quo.get('is_locked')}"
        print("✓ Draft quotation is_locked=False")
        
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{quo['id']}")
    
    def test_converted_quotation_locked_when_so_active(self, auth_session, item_with_bom):
        """Converted quotation with active SO should be locked"""
        item = item_with_bom["item"]
        
        # Create and convert quotation
        quo_data = {
            "customer_name": "Lock Active SO Test",
            "lines": [{"item_id": item["id"], "description": item["name"], "quantity": 1, "rate": 300.0, "gst_rate": 18.0}]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quo_data)
        assert resp.status_code == 201
        quo_id = resp.json()["id"]
        
        # Accept to convert
        resp = auth_session.put(f"{BASE_URL}/api/crm/quotations/{quo_id}", json={"status": "accepted"})
        assert resp.status_code == 200
        quo = resp.json()
        
        assert quo["status"] == "converted"
        assert quo.get("is_locked") == True, f"Expected is_locked=True, got {quo.get('is_locked')}"
        print("✓ Converted quotation with active SO is_locked=True")
        
        # Try to edit - should fail
        resp = auth_session.put(f"{BASE_URL}/api/crm/quotations/{quo_id}", json={"notes": "Test edit"})
        assert resp.status_code == 400, f"Expected 400 for edit, got {resp.status_code}"
        assert "active linked Sales Order" in resp.json().get("detail", "")
        print("✓ Edit blocked on locked quotation (400)")
        
        # Try to delete - should fail
        resp = auth_session.delete(f"{BASE_URL}/api/crm/quotations/{quo_id}")
        assert resp.status_code == 400, f"Expected 400 for delete, got {resp.status_code}"
        assert "active linked Sales Order" in resp.json().get("detail", "")
        print("✓ Delete blocked on locked quotation (400)")
        
        # Cleanup: cancel SO
        so_id = quo["converted_so_id"]
        auth_session.post(f"{BASE_URL}/api/production/{so_id}/cancel")
        auth_session.delete(f"{BASE_URL}/api/crm/quotations/{quo_id}")
    
    def test_quotation_unlocked_when_so_cancelled(self, auth_session, item_with_bom):
        """Quotation becomes unlocked when linked SO is cancelled"""
        item = item_with_bom["item"]
        
        # Create and convert quotation
        quo_data = {
            "customer_name": "Unlock After Cancel Test",
            "lines": [{"item_id": item["id"], "description": item["name"], "quantity": 1, "rate": 300.0, "gst_rate": 18.0}]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quo_data)
        assert resp.status_code == 201
        quo_id = resp.json()["id"]
        
        # Accept to convert
        resp = auth_session.put(f"{BASE_URL}/api/crm/quotations/{quo_id}", json={"status": "accepted"})
        assert resp.status_code == 200
        quo = resp.json()
        so_id = quo["converted_so_id"]
        
        # Cancel the SO
        resp = auth_session.post(f"{BASE_URL}/api/production/{so_id}/cancel")
        assert resp.status_code == 200, f"Cancel SO failed: {resp.text}"
        
        # Fetch quotation again - should be unlocked
        resp = auth_session.get(f"{BASE_URL}/api/crm/quotations")
        quotations = resp.json()
        quo = next((q for q in quotations if q["id"] == quo_id), None)
        assert quo is not None
        
        assert quo.get("is_locked") == False, f"Expected is_locked=False after SO cancel, got {quo.get('is_locked')}"
        print("✓ Quotation is_locked=False after SO cancelled")
        
        # Now delete should succeed
        resp = auth_session.delete(f"{BASE_URL}/api/crm/quotations/{quo_id}")
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        print("✓ Delete succeeds after SO cancelled")


class TestLeadAndCustomerImport:
    """Test lead and customer CSV import endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        return session
    
    def test_import_leads_with_auto_customer_creation(self, auth_session):
        """Import leads with customer_name creates minimal customer if not exists"""
        ts = int(time.time())
        rows = [
            {"name": f"Lead Import Test 1 {ts}", "customer_name": f"New Customer From Import {ts}", "email": "test1@example.com"},
            {"name": f"Lead Import Test 2 {ts}", "customer_name": f"New Customer From Import {ts}", "email": "test2@example.com"},  # Same customer
        ]
        resp = auth_session.post(f"{BASE_URL}/api/crm/leads/import", json={"rows": rows})
        assert resp.status_code == 200, f"Import failed: {resp.text}"
        data = resp.json()
        
        assert data["created"] == 2, f"Expected 2 created, got {data['created']}"
        assert len(data.get("skipped", [])) == 0, f"Unexpected skips: {data.get('skipped')}"
        print(f"✓ Lead import: {data['created']} created, {len(data.get('skipped', []))} skipped")
        
        # Verify customer was created
        resp = auth_session.get(f"{BASE_URL}/api/customers")
        customers = resp.json()
        new_cust = next((c for c in customers if c["name"] == f"New Customer From Import {ts}"), None)
        assert new_cust is not None, "Auto-created customer not found"
        print("✓ Customer auto-created during lead import")
    
    def test_import_leads_missing_name_skipped(self, auth_session):
        """Leads without name are skipped"""
        rows = [
            {"customer_name": "Some Customer"},  # Missing name
        ]
        resp = auth_session.post(f"{BASE_URL}/api/crm/leads/import", json={"rows": rows})
        assert resp.status_code == 200
        data = resp.json()
        
        assert data["created"] == 0
        assert len(data["skipped"]) == 1
        assert "missing lead name" in data["skipped"][0]["reason"]
        print("✓ Lead import skips rows without name")
    
    def test_import_customers_with_duplicate_skip(self, auth_session):
        """Customer import skips duplicates by code"""
        ts = int(time.time())
        code = f"CUST-IMP-{ts}"
        
        # First import
        rows = [{"name": f"Import Customer {ts}", "code": code, "email": "import@test.com"}]
        resp = auth_session.post(f"{BASE_URL}/api/customers/import", json={"rows": rows})
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1
        
        # Second import with same code - should skip
        rows = [{"name": f"Import Customer Duplicate {ts}", "code": code, "email": "dup@test.com"}]
        resp = auth_session.post(f"{BASE_URL}/api/customers/import", json={"rows": rows})
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 0
        assert len(data["skipped"]) == 1
        assert "exists" in data["skipped"][0]["reason"]
        print("✓ Customer import skips duplicates by code")


class TestLeadAndTicketDelete:
    """Test lead and ticket delete functionality"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        return session
    
    def test_delete_lead(self, auth_session):
        """Lead delete works"""
        # Need a customer first
        cust_resp = auth_session.get(f"{BASE_URL}/api/customers")
        customers = cust_resp.json()
        if not customers:
            cust_data = {"name": "Test Customer for Lead Delete", "code": f"TCLD-{int(time.time())}"}
            cust_resp = auth_session.post(f"{BASE_URL}/api/customers", json=cust_data)
            customer_id = cust_resp.json()["id"]
        else:
            customer_id = customers[0]["id"]
        
        # Create lead
        lead_data = {
            "name": f"Test Lead for Delete {int(time.time())}",
            "customer_id": customer_id
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/leads", json=lead_data)
        assert resp.status_code == 201
        lead_id = resp.json()["id"]
        
        # Delete
        resp = auth_session.delete(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        assert "deleted" in resp.json().get("message", "").lower()
        print("✓ Lead delete works")
    
    def test_delete_ticket(self, auth_session):
        """Ticket delete works"""
        # Need a customer first
        cust_resp = auth_session.get(f"{BASE_URL}/api/customers")
        customers = cust_resp.json()
        if not customers:
            cust_data = {"name": "Test Customer for Ticket Delete", "code": f"TCTD-{int(time.time())}"}
            cust_resp = auth_session.post(f"{BASE_URL}/api/customers", json=cust_data)
            customer_id = cust_resp.json()["id"]
        else:
            customer_id = customers[0]["id"]
        
        # Create ticket
        ticket_data = {
            "subject": f"Test Ticket for Delete {int(time.time())}",
            "customer_id": customer_id,
            "priority": "low"
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/tickets", json=ticket_data)
        assert resp.status_code == 201, f"Create ticket failed: {resp.text}"
        ticket_id = resp.json()["id"]
        
        # Delete
        resp = auth_session.delete(f"{BASE_URL}/api/crm/tickets/{ticket_id}")
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        assert "deleted" in resp.json().get("message", "").lower()
        print("✓ Ticket delete works")


class TestQuotationDraftDelete:
    """Test draft quotation delete"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert resp.status_code == 200
        return session
    
    def test_delete_draft_quotation(self, auth_session):
        """Draft quotation can be deleted"""
        quo_data = {
            "customer_name": "Draft Delete Test",
            "lines": [{"description": "Test", "quantity": 1, "rate": 100.0, "gst_rate": 18.0}]
        }
        resp = auth_session.post(f"{BASE_URL}/api/crm/quotations", json=quo_data)
        assert resp.status_code == 201
        quo_id = resp.json()["id"]
        
        # Delete
        resp = auth_session.delete(f"{BASE_URL}/api/crm/quotations/{quo_id}")
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        assert "deleted" in resp.json().get("message", "").lower()
        print("✓ Draft quotation delete works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
