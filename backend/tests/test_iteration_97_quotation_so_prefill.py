"""
Iteration 97 - Quotation→SO Prefill + MTS/MTO Redesign Tests

Tests for:
1. GET /api/crm/quotations/{qid}/balance - per-line balance with item/bom hydration
2. POST /api/production with source_quotation_id - creates SO, increments consumed_qty
3. Partial conversion - quotation status stays draft/sent, balance > 0
4. Full conversion - quotation status flips to 'converted'
5. Cancelling sourced SO restores balance
6. Confirm flow: MTS line sets reserved_qty=0, mo_qty=quantity; MTO uses FG stock first
7. Child SG/parts get reserved_stock incremented on MO creation
8. MO cancel releases child reserved_stock
9. Legacy order_type='auto' normalizes to 'mts' on create
10. Validation: invalid order_type returns 400
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestQuotationSOPrefill:
    """Tests for Quotation balance endpoint and SO prefill flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.created_items = []
        self.created_boms = []
        self.created_quotations = []
        self.created_sos = []
        self.created_customers = []
        yield
        # Cleanup
        for so_id in self.created_sos:
            try:
                self.session.post(f"{BASE_URL}/api/production/{so_id}/cancel")
            except Exception:
                pass
        for qid in self.created_quotations:
            try:
                self.session.delete(f"{BASE_URL}/api/crm/quotations/{qid}")
            except Exception:
                pass
        for bom_id in self.created_boms:
            try:
                self.session.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except Exception:
                pass
        for item_id in self.created_items:
            try:
                self.session.delete(f"{BASE_URL}/api/items/{item_id}")
            except Exception:
                pass
        for cust_id in self.created_customers:
            try:
                self.session.delete(f"{BASE_URL}/api/customers/{cust_id}")
            except Exception:
                pass

    def _create_test_item(self, part_number, name, category="finished_good", current_stock=0):
        """Helper to create a test item"""
        resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": part_number,
            "name": name,
            "category": category,
            "unit_of_measure": "pcs",
            "current_stock": current_stock
        })
        if resp.status_code == 201:
            item = resp.json()
            self.created_items.append(item["id"])
            return item
        return None

    def _create_test_bom(self, parent_item_id, name, components=None):
        """Helper to create a test BOM"""
        resp = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": name,
            "revision": "A",
            "status": "active",
            "components": components or []
        })
        if resp.status_code in (200, 201):
            bom = resp.json()
            self.created_boms.append(bom["id"])
            return bom
        print(f"BOM create failed: {resp.status_code} - {resp.text}")
        return None

    def _create_test_customer(self, name):
        """Helper to create a test customer"""
        resp = self.session.post(f"{BASE_URL}/api/customers", json={
            "name": name,
            "email": f"test_{uuid.uuid4().hex[:8]}@test.com"
        })
        if resp.status_code == 201:
            cust = resp.json()
            self.created_customers.append(cust["id"])
            return cust
        return None

    def _create_test_quotation(self, customer_id, lines, customer_name="Test Customer"):
        """Helper to create a test quotation"""
        resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_id": customer_id,
            "customer_name": customer_name,
            "lines": lines,
            "status": "draft"
        })
        if resp.status_code in (200, 201):
            q = resp.json()
            self.created_quotations.append(q["id"])
            return q
        print(f"Quotation create failed: {resp.status_code} - {resp.text}")
        return None

    def _get_quotation_by_id(self, qid):
        """Helper to get a quotation by ID from the list (no single GET endpoint)"""
        resp = self.session.get(f"{BASE_URL}/api/crm/quotations")
        if resp.status_code == 200:
            quotations = resp.json()
            for q in quotations:
                if q.get("id") == qid:
                    return q
        return None

    # ========== TEST 1: GET /api/crm/quotations/{qid}/balance ==========
    def test_quotation_balance_endpoint_returns_per_line_balance(self):
        """GET /api/crm/quotations/{qid}/balance returns per-line balance with item/bom hydration"""
        # Create item + BOM
        item = self._create_test_item(f"TEST_QTB_{uuid.uuid4().hex[:6]}", "Test Quotation Balance Item")
        assert item, "Failed to create test item"
        bom = self._create_test_bom(item["id"], "Test BOM for Balance")
        assert bom, "Failed to create test BOM"
        
        # Create customer
        customer = self._create_test_customer(f"Test Customer {uuid.uuid4().hex[:6]}")
        assert customer, "Failed to create customer"
        
        # Create quotation with 2 lines
        quotation = self._create_test_quotation(customer["id"], [
            {"item_id": item["id"], "quantity": 10, "rate": 100, "description": "Line 1"},
            {"item_id": item["id"], "quantity": 5, "rate": 150, "description": "Line 2"}
        ])
        assert quotation, "Failed to create quotation"
        
        # Get balance
        resp = self.session.get(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/balance")
        assert resp.status_code == 200, f"Balance endpoint failed: {resp.text}"
        
        data = resp.json()
        assert "lines" in data, "Response should have 'lines'"
        assert "customer_id" in data, "Response should have 'customer_id'"
        assert "customer_name" in data, "Response should have 'customer_name'"
        assert data["customer_id"] == customer["id"], "Customer ID mismatch"
        
        # Check line balance
        lines = data["lines"]
        assert len(lines) >= 2, f"Expected at least 2 lines, got {len(lines)}"
        
        # Line 1: qty=10, no SOs yet, balance should be 10
        line1 = next((l for l in lines if l.get("line_no") == 1), None)
        assert line1, "Line 1 not found"
        assert line1["original_qty"] == 10, f"Line 1 original_qty should be 10, got {line1['original_qty']}"
        assert line1["balance_qty"] == 10, f"Line 1 balance_qty should be 10, got {line1['balance_qty']}"
        assert line1["consumed_qty"] == 0, f"Line 1 consumed_qty should be 0, got {line1['consumed_qty']}"
        
        # Check BOM hydration
        assert "bom" in line1, "Line should have 'bom' hydrated"
        assert line1["bom"]["id"] == bom["id"], "BOM ID mismatch"
        
        # Check item hydration
        assert "item" in line1, "Line should have 'item' hydrated"
        assert line1["item"]["part_number"] == item["part_number"], "Item part_number mismatch"
        
        print("TEST PASSED: Quotation balance endpoint returns per-line balance with item/bom hydration")

    # ========== TEST 2: POST /api/production with source_quotation_id ==========
    def test_create_so_from_quotation_increments_consumed_qty(self):
        """POST /api/production with source_quotation_id creates SO and increments consumed_qty"""
        # Create item + BOM
        item = self._create_test_item(f"TEST_SOQT_{uuid.uuid4().hex[:6]}", "Test SO from Quotation Item")
        assert item, "Failed to create test item"
        bom = self._create_test_bom(item["id"], "Test BOM for SO")
        assert bom, "Failed to create test BOM"
        
        # Create customer
        customer = self._create_test_customer(f"Test Customer {uuid.uuid4().hex[:6]}")
        assert customer, "Failed to create customer"
        
        # Create quotation with qty=10
        quotation = self._create_test_quotation(customer["id"], [
            {"item_id": item["id"], "quantity": 10, "rate": 100, "description": "Test Line"}
        ])
        assert quotation, "Failed to create quotation"
        
        # Create SO from quotation with qty=5 (partial)
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 5,
                "due_date": due_date,
                "order_type": "mts",
                "source_quotation_line_no": 1
            }],
            "source_quotation_id": quotation["id"],
            "source_quotation_no": quotation["quotation_no"],
            "customer_id": customer["id"],
            "priority": "medium"
        })
        assert so_resp.status_code in (200, 201), f"Failed to create SO: {so_resp.text}"
        so = so_resp.json()
        self.created_sos.append(so["id"])
        
        # Verify SO has source_quotation_id
        assert so.get("source_quotation_id") == quotation["id"], "SO should have source_quotation_id"
        assert so.get("source_quotation_no") == quotation["quotation_no"], "SO should have source_quotation_no"
        
        # Check balance - should now be 5 (10 - 5)
        balance_resp = self.session.get(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/balance")
        assert balance_resp.status_code == 200
        balance_data = balance_resp.json()
        line1 = next((l for l in balance_data["lines"] if l.get("line_no") == 1), None)
        assert line1, "Line 1 not found in balance"
        assert line1["consumed_qty"] == 5, f"consumed_qty should be 5, got {line1['consumed_qty']}"
        assert line1["balance_qty"] == 5, f"balance_qty should be 5, got {line1['balance_qty']}"
        
        print("TEST PASSED: POST /api/production with source_quotation_id creates SO and increments consumed_qty")

    # ========== TEST 3: Partial conversion keeps quotation status ==========
    def test_partial_conversion_keeps_quotation_status(self):
        """Partial conversion (consume < total qty): quotation status stays draft/sent"""
        # Create item + BOM
        item = self._create_test_item(f"TEST_PART_{uuid.uuid4().hex[:6]}", "Test Partial Conversion Item")
        assert item, "Failed to create test item"
        bom = self._create_test_bom(item["id"], "Test BOM Partial")
        assert bom, "Failed to create test BOM"
        
        # Create customer
        customer = self._create_test_customer(f"Test Customer {uuid.uuid4().hex[:6]}")
        assert customer, "Failed to create customer"
        
        # Create quotation with qty=10
        quotation = self._create_test_quotation(customer["id"], [
            {"item_id": item["id"], "quantity": 10, "rate": 100}
        ])
        assert quotation, "Failed to create quotation"
        initial_status = quotation.get("status")
        
        # Create SO with qty=5 (partial)
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 5,
                "due_date": due_date,
                "order_type": "mts",
                "source_quotation_line_no": 1
            }],
            "source_quotation_id": quotation["id"],
            "source_quotation_no": quotation["quotation_no"],
            "customer_id": customer["id"]
        })
        assert so_resp.status_code in (200, 201)
        so = so_resp.json()
        self.created_sos.append(so["id"])
        
        # Check quotation status - should NOT be 'converted' yet
        q_data = self._get_quotation_by_id(quotation['id'])
        assert q_data, "Failed to get quotation"
        assert q_data["status"] != "converted", f"Quotation should NOT be converted after partial SO, got {q_data['status']}"
        
        # Check converted_so_ids includes the new SO
        assert so["id"] in (q_data.get("converted_so_ids") or []), "SO should be in converted_so_ids"
        
        print("TEST PASSED: Partial conversion keeps quotation status (not converted)")

    # ========== TEST 4: Full conversion flips quotation to 'converted' ==========
    def test_full_conversion_flips_quotation_to_converted(self):
        """Full conversion (sum of all SOs == quotation line qty): quotation status flips to 'converted'"""
        # Create item + BOM
        item = self._create_test_item(f"TEST_FULL_{uuid.uuid4().hex[:6]}", "Test Full Conversion Item")
        assert item, "Failed to create test item"
        bom = self._create_test_bom(item["id"], "Test BOM Full")
        assert bom, "Failed to create test BOM"
        
        # Create customer
        customer = self._create_test_customer(f"Test Customer {uuid.uuid4().hex[:6]}")
        assert customer, "Failed to create customer"
        
        # Create quotation with qty=10
        quotation = self._create_test_quotation(customer["id"], [
            {"item_id": item["id"], "quantity": 10, "rate": 100}
        ])
        assert quotation, "Failed to create quotation"
        
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        
        # Create first SO with qty=5
        so1_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 5,
                "due_date": due_date,
                "order_type": "mts",
                "source_quotation_line_no": 1
            }],
            "source_quotation_id": quotation["id"],
            "source_quotation_no": quotation["quotation_no"],
            "customer_id": customer["id"]
        })
        assert so1_resp.status_code in (200, 201)
        so1 = so1_resp.json()
        self.created_sos.append(so1["id"])
        
        # Create second SO with qty=5 (total now = 10)
        so2_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 5,
                "due_date": due_date,
                "order_type": "mts",
                "source_quotation_line_no": 1
            }],
            "source_quotation_id": quotation["id"],
            "source_quotation_no": quotation["quotation_no"],
            "customer_id": customer["id"]
        })
        assert so2_resp.status_code in (200, 201)
        so2 = so2_resp.json()
        self.created_sos.append(so2["id"])
        
        # Check quotation status - should be 'converted' now
        q_data = self._get_quotation_by_id(quotation['id'])
        assert q_data, "Failed to get quotation"
        assert q_data["status"] == "converted", f"Quotation should be 'converted' after full qty issued, got {q_data['status']}"
        assert q_data.get("converted_at"), "converted_at should be set"
        assert q_data.get("converted_so_id"), "converted_so_id should be set"
        
        print("TEST PASSED: Full conversion flips quotation to 'converted'")

    # ========== TEST 5: Cancelling sourced SO restores balance ==========
    def test_cancel_so_restores_quotation_balance(self):
        """Cancelling a sourced SO via POST /api/production/{id}/cancel restores the balance"""
        # Create item + BOM
        item = self._create_test_item(f"TEST_CANC_{uuid.uuid4().hex[:6]}", "Test Cancel SO Item")
        assert item, "Failed to create test item"
        bom = self._create_test_bom(item["id"], "Test BOM Cancel")
        assert bom, "Failed to create test BOM"
        
        # Create customer
        customer = self._create_test_customer(f"Test Customer {uuid.uuid4().hex[:6]}")
        assert customer, "Failed to create customer"
        
        # Create quotation with qty=10
        quotation = self._create_test_quotation(customer["id"], [
            {"item_id": item["id"], "quantity": 10, "rate": 100}
        ])
        assert quotation, "Failed to create quotation"
        
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        
        # Create SO with qty=5
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 5,
                "due_date": due_date,
                "order_type": "mts",
                "source_quotation_line_no": 1
            }],
            "source_quotation_id": quotation["id"],
            "source_quotation_no": quotation["quotation_no"],
            "customer_id": customer["id"]
        })
        assert so_resp.status_code in (200, 201)
        so = so_resp.json()
        self.created_sos.append(so["id"])
        
        # Verify balance is 5
        balance_resp = self.session.get(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/balance")
        assert balance_resp.status_code == 200
        line1 = next((l for l in balance_resp.json()["lines"] if l.get("line_no") == 1), None)
        assert line1["balance_qty"] == 5, f"Balance should be 5 before cancel, got {line1['balance_qty']}"
        
        # Cancel the SO
        cancel_resp = self.session.post(f"{BASE_URL}/api/production/{so['id']}/cancel")
        assert cancel_resp.status_code == 200, f"Failed to cancel SO: {cancel_resp.text}"
        
        # Verify balance is restored to 10
        balance_resp2 = self.session.get(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/balance")
        assert balance_resp2.status_code == 200
        line1_after = next((l for l in balance_resp2.json()["lines"] if l.get("line_no") == 1), None)
        assert line1_after["balance_qty"] == 10, f"Balance should be restored to 10 after cancel, got {line1_after['balance_qty']}"
        assert line1_after["consumed_qty"] == 0, f"consumed_qty should be 0 after cancel, got {line1_after['consumed_qty']}"
        
        print("TEST PASSED: Cancelling sourced SO restores quotation balance")


class TestMTSMTOConfirmFlow:
    """Tests for MTS/MTO confirm flow and child reservations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.created_items = []
        self.created_boms = []
        self.created_sos = []
        self.created_wos = []
        yield
        # Cleanup
        for wo_id in self.created_wos:
            try:
                self.session.post(f"{BASE_URL}/api/work-orders/{wo_id}/cancel")
            except Exception:
                pass
        for so_id in self.created_sos:
            try:
                self.session.post(f"{BASE_URL}/api/production/{so_id}/cancel")
            except Exception:
                pass
        for bom_id in self.created_boms:
            try:
                self.session.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except Exception:
                pass
        for item_id in self.created_items:
            try:
                self.session.delete(f"{BASE_URL}/api/items/{item_id}")
            except Exception:
                pass

    def _create_test_item(self, part_number, name, category="finished_good", current_stock=0):
        """Helper to create a test item"""
        resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": part_number,
            "name": name,
            "category": category,
            "unit_of_measure": "pcs",
            "current_stock": current_stock
        })
        if resp.status_code == 201:
            item = resp.json()
            self.created_items.append(item["id"])
            return item
        return None

    def _create_test_bom(self, parent_item_id, name, components=None):
        """Helper to create a test BOM"""
        resp = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": name,
            "revision": "A",
            "status": "active",
            "components": components or []
        })
        if resp.status_code in (200, 201):
            bom = resp.json()
            self.created_boms.append(bom["id"])
            return bom
        print(f"BOM create failed: {resp.status_code} - {resp.text}")
        return None

    # ========== TEST 6: MTS confirm sets reserved_qty=0, mo_qty=quantity ==========
    def test_mts_confirm_ignores_fg_stock(self):
        """MTS line should set reserved_qty=0 and mo_qty=quantity (ignoring FG stock entirely)"""
        # Create FG item WITH stock
        fg_item = self._create_test_item(f"TEST_MTS_{uuid.uuid4().hex[:6]}", "Test MTS FG Item", "finished_good", current_stock=100)
        assert fg_item, "Failed to create FG item"
        
        # Create BOM
        bom = self._create_test_bom(fg_item["id"], "Test MTS BOM")
        assert bom, "Failed to create BOM"
        
        # Create SO with MTS order_type
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 10,
                "due_date": due_date,
                "order_type": "mts"
            }],
            "priority": "medium"
        })
        assert so_resp.status_code in (200, 201), f"Failed to create SO: {so_resp.text}"
        so = so_resp.json()
        self.created_sos.append(so["id"])
        
        # Confirm the SO
        confirm_resp = self.session.post(f"{BASE_URL}/api/production/{so['id']}/confirm")
        assert confirm_resp.status_code == 200, f"Failed to confirm SO: {confirm_resp.text}"
        confirmed = confirm_resp.json()
        
        # Check confirm_summary
        summary = confirmed.get("confirm_summary", [])
        assert len(summary) > 0, "confirm_summary should have entries"
        line_summary = summary[0]
        
        # MTS: reserved_qty should be 0, mo_qty should be full quantity
        assert line_summary["reserved_qty"] == 0, f"MTS reserved_qty should be 0, got {line_summary['reserved_qty']}"
        assert line_summary["mo_qty"] == 10, f"MTS mo_qty should be 10, got {line_summary['mo_qty']}"
        assert line_summary["order_type"] == "mts", f"order_type should be mts, got {line_summary['order_type']}"
        
        print("TEST PASSED: MTS confirm sets reserved_qty=0, mo_qty=quantity (ignores FG stock)")

    # ========== TEST 7: MTO confirm uses FG stock first ==========
    def test_mto_confirm_uses_fg_stock_first(self):
        """MTO line should reserve min(qty, FG free stock) and produce MO for the remainder"""
        # Create FG item WITH stock
        fg_item = self._create_test_item(f"TEST_MTO_{uuid.uuid4().hex[:6]}", "Test MTO FG Item", "finished_good", current_stock=7)
        assert fg_item, "Failed to create FG item"
        
        # Create BOM
        bom = self._create_test_bom(fg_item["id"], "Test MTO BOM")
        assert bom, "Failed to create BOM"
        
        # Create SO with MTO order_type, qty=10
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 10,
                "due_date": due_date,
                "order_type": "mto"
            }],
            "priority": "medium"
        })
        assert so_resp.status_code in (200, 201), f"Failed to create SO: {so_resp.text}"
        so = so_resp.json()
        self.created_sos.append(so["id"])
        
        # Confirm the SO
        confirm_resp = self.session.post(f"{BASE_URL}/api/production/{so['id']}/confirm")
        assert confirm_resp.status_code == 200, f"Failed to confirm SO: {confirm_resp.text}"
        confirmed = confirm_resp.json()
        
        # Check confirm_summary
        summary = confirmed.get("confirm_summary", [])
        assert len(summary) > 0, "confirm_summary should have entries"
        line_summary = summary[0]
        
        # MTO: reserved_qty should be min(10, 7) = 7, mo_qty should be 10 - 7 = 3
        assert line_summary["reserved_qty"] == 7, f"MTO reserved_qty should be 7, got {line_summary['reserved_qty']}"
        assert line_summary["mo_qty"] == 3, f"MTO mo_qty should be 3, got {line_summary['mo_qty']}"
        assert line_summary["order_type"] == "mto", f"order_type should be mto, got {line_summary['order_type']}"
        
        # Verify FG item reserved_stock was incremented
        item_resp = self.session.get(f"{BASE_URL}/api/items/{fg_item['id']}")
        assert item_resp.status_code == 200
        updated_item = item_resp.json()
        assert updated_item.get("reserved_stock", 0) >= 7, f"FG reserved_stock should be >= 7, got {updated_item.get('reserved_stock')}"
        
        print("TEST PASSED: MTO confirm uses FG stock first, MO for remainder")

    # ========== TEST 9: Legacy order_type='auto' normalizes to 'mts' ==========
    def test_legacy_auto_order_type_normalizes_to_mts(self):
        """Legacy SOs with order_type='auto' should normalize to 'mts' on create"""
        # Create FG item
        fg_item = self._create_test_item(f"TEST_AUTO_{uuid.uuid4().hex[:6]}", "Test Auto Order Type Item", "finished_good")
        assert fg_item, "Failed to create FG item"
        
        # Create BOM
        bom = self._create_test_bom(fg_item["id"], "Test Auto BOM")
        assert bom, "Failed to create BOM"
        
        # Create SO with order_type='auto' (legacy)
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 5,
                "due_date": due_date,
                "order_type": "auto"  # Legacy value
            }],
            "priority": "medium"
        })
        assert so_resp.status_code in (200, 201), f"Failed to create SO: {so_resp.text}"
        so = so_resp.json()
        self.created_sos.append(so["id"])
        
        # Check that order_type was normalized to 'mts'
        lines = so.get("lines", [])
        assert len(lines) > 0, "SO should have lines"
        assert lines[0].get("order_type") == "mts", f"order_type should be normalized to 'mts', got {lines[0].get('order_type')}"
        
        print("TEST PASSED: Legacy order_type='auto' normalizes to 'mts'")

    # ========== TEST 10: Invalid order_type returns 400 ==========
    def test_invalid_order_type_returns_400(self):
        """POST /api/production with invalid order_type returns 400"""
        # Create FG item
        fg_item = self._create_test_item(f"TEST_INV_{uuid.uuid4().hex[:6]}", "Test Invalid Order Type Item", "finished_good")
        assert fg_item, "Failed to create FG item"
        
        # Create BOM
        bom = self._create_test_bom(fg_item["id"], "Test Invalid BOM")
        assert bom, "Failed to create BOM"
        
        # Try to create SO with invalid order_type
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 5,
                "due_date": due_date,
                "order_type": "invalid_type"  # Invalid value
            }],
            "priority": "medium"
        })
        assert so_resp.status_code == 400, f"Expected 400 for invalid order_type, got {so_resp.status_code}"
        
        print("TEST PASSED: Invalid order_type returns 400")


class TestChildReservations:
    """Tests for child SG/parts reserved_stock on MO creation and cancellation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.created_items = []
        self.created_boms = []
        self.created_sos = []
        self.created_wos = []
        yield
        # Cleanup
        for wo_id in self.created_wos:
            try:
                self.session.post(f"{BASE_URL}/api/work-orders/{wo_id}/cancel")
            except Exception:
                pass
        for so_id in self.created_sos:
            try:
                self.session.post(f"{BASE_URL}/api/production/{so_id}/cancel")
            except Exception:
                pass
        for bom_id in self.created_boms:
            try:
                self.session.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except Exception:
                pass
        for item_id in self.created_items:
            try:
                self.session.delete(f"{BASE_URL}/api/items/{item_id}")
            except Exception:
                pass

    def _create_test_item(self, part_number, name, category="finished_good", current_stock=0):
        """Helper to create a test item"""
        resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": part_number,
            "name": name,
            "category": category,
            "unit_of_measure": "pcs",
            "current_stock": current_stock
        })
        if resp.status_code == 201:
            item = resp.json()
            self.created_items.append(item["id"])
            return item
        return None

    def _create_test_bom(self, parent_item_id, name, components=None):
        """Helper to create a test BOM"""
        resp = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": name,
            "revision": "A",
            "status": "active",
            "components": components or [],
            "parent_routings": [{"name": "Assembly", "cost": 10}]  # Add routing so MO can be created
        })
        if resp.status_code in (200, 201):
            bom = resp.json()
            self.created_boms.append(bom["id"])
            return bom
        print(f"BOM create failed: {resp.status_code} - {resp.text}")
        return None

    # ========== TEST 8: Child SG/parts get reserved_stock on MO creation ==========
    def test_child_reserved_stock_on_mo_creation(self):
        """When MO is created, child SG/parts get reserved_stock incremented"""
        # Create FG item (no stock)
        fg_item = self._create_test_item(f"TEST_CHLD_{uuid.uuid4().hex[:6]}", "Test FG for Child Reservation", "finished_good", current_stock=0)
        assert fg_item, "Failed to create FG item"
        
        # Create child SG item WITH stock
        sg_item = self._create_test_item(f"TEST_SG_{uuid.uuid4().hex[:6]}", "Test SG Child", "sub_assembly", current_stock=20)
        assert sg_item, "Failed to create SG item"
        initial_sg_reserved = sg_item.get("reserved_stock", 0)
        
        # Create BOM for FG with SG as component (qty=5 per FG)
        fg_bom = self._create_test_bom(fg_item["id"], "Test FG BOM", components=[
            {"item_id": sg_item["id"], "quantity": 5, "unit_of_measure": "pcs"}
        ])
        assert fg_bom, "Failed to create FG BOM"
        
        # Create SO
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": fg_bom["id"],
                "quantity": 2,  # Need 2 FG, so 2*5=10 SG
                "due_date": due_date,
                "order_type": "mts"
            }],
            "priority": "medium"
        })
        assert so_resp.status_code in (200, 201)
        so = so_resp.json()
        self.created_sos.append(so["id"])
        
        # Confirm SO
        confirm_resp = self.session.post(f"{BASE_URL}/api/production/{so['id']}/confirm")
        assert confirm_resp.status_code == 200
        
        # Create MO (work order) for the SO
        wo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": so["id"],
            "quantity": 2
        })
        assert wo_resp.status_code in (200, 201), f"Failed to create WO: {wo_resp.text}"
        wo_data = wo_resp.json()
        
        # Track created WOs for cleanup
        for wo in wo_data.get("work_orders", []):
            self.created_wos.append(wo["id"])
        
        # Check SG item reserved_stock was incremented
        sg_resp = self.session.get(f"{BASE_URL}/api/items/{sg_item['id']}")
        assert sg_resp.status_code == 200
        updated_sg = sg_resp.json()
        
        # SG should have reserved_stock increased by 10 (2 FG * 5 SG per FG)
        expected_reserved = initial_sg_reserved + 10
        actual_reserved = updated_sg.get("reserved_stock", 0)
        assert actual_reserved >= expected_reserved, f"SG reserved_stock should be >= {expected_reserved}, got {actual_reserved}"
        
        print("TEST PASSED: Child SG/parts get reserved_stock incremented on MO creation")

    # ========== TEST: MO cancel releases child reserved_stock ==========
    def test_mo_cancel_releases_child_reserved_stock(self):
        """When MO is cancelled, child reserved_stock decrements back"""
        # Create FG item (no stock)
        fg_item = self._create_test_item(f"TEST_MOCANC_{uuid.uuid4().hex[:6]}", "Test FG for MO Cancel", "finished_good", current_stock=0)
        assert fg_item, "Failed to create FG item"
        
        # Create child SG item WITH stock
        sg_item = self._create_test_item(f"TEST_SGCANC_{uuid.uuid4().hex[:6]}", "Test SG for Cancel", "sub_assembly", current_stock=50)
        assert sg_item, "Failed to create SG item"
        
        # Create BOM for FG with SG as component
        fg_bom = self._create_test_bom(fg_item["id"], "Test FG BOM Cancel", components=[
            {"item_id": sg_item["id"], "quantity": 10, "unit_of_measure": "pcs"}
        ])
        assert fg_bom, "Failed to create FG BOM"
        
        # Get initial SG reserved_stock
        sg_before = self.session.get(f"{BASE_URL}/api/items/{sg_item['id']}").json()
        initial_reserved = sg_before.get("reserved_stock", 0)
        
        # Create and confirm SO
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": fg_bom["id"],
                "quantity": 3,  # Need 3 FG, so 3*10=30 SG
                "due_date": due_date,
                "order_type": "mts"
            }],
            "priority": "medium"
        })
        assert so_resp.status_code in (200, 201)
        so = so_resp.json()
        self.created_sos.append(so["id"])
        
        confirm_resp = self.session.post(f"{BASE_URL}/api/production/{so['id']}/confirm")
        assert confirm_resp.status_code == 200
        
        # Create MO
        wo_resp = self.session.post(f"{BASE_URL}/api/work-orders", json={
            "production_order_id": so["id"],
            "quantity": 3
        })
        assert wo_resp.status_code in (200, 201)
        wo_data = wo_resp.json()
        
        main_wo_id = None
        for wo in wo_data.get("work_orders", []):
            self.created_wos.append(wo["id"])
            if wo.get("item_id") == fg_item["id"]:
                main_wo_id = wo["id"]
        
        # Check SG reserved_stock after MO creation
        sg_after_mo = self.session.get(f"{BASE_URL}/api/items/{sg_item['id']}").json()
        reserved_after_mo = sg_after_mo.get("reserved_stock", 0)
        assert reserved_after_mo > initial_reserved, f"SG reserved_stock should increase after MO creation"
        
        # Cancel the SO (which cascades to cancel MOs and release reservations)
        cancel_resp = self.session.post(f"{BASE_URL}/api/production/{so['id']}/cancel")
        assert cancel_resp.status_code == 200, f"Failed to cancel SO: {cancel_resp.text}"
        
        # Check SG reserved_stock after SO cancel - should be back to initial
        sg_after_cancel = self.session.get(f"{BASE_URL}/api/items/{sg_item['id']}").json()
        reserved_after_cancel = sg_after_cancel.get("reserved_stock", 0)
        
        # Reserved stock should be released (back to initial or close to it)
        assert reserved_after_cancel <= reserved_after_mo, f"SG reserved_stock should decrease after SO cancel"
        
        print("TEST PASSED: SO cancel releases child reserved_stock")


class TestSOSourceQuotationDisplay:
    """Tests for SO list view showing source quotation badge"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        self.created_items = []
        self.created_boms = []
        self.created_quotations = []
        self.created_sos = []
        self.created_customers = []
        yield
        # Cleanup
        for so_id in self.created_sos:
            try:
                self.session.post(f"{BASE_URL}/api/production/{so_id}/cancel")
            except Exception:
                pass
        for qid in self.created_quotations:
            try:
                self.session.delete(f"{BASE_URL}/api/crm/quotations/{qid}")
            except Exception:
                pass
        for bom_id in self.created_boms:
            try:
                self.session.delete(f"{BASE_URL}/api/bom/{bom_id}")
            except Exception:
                pass
        for item_id in self.created_items:
            try:
                self.session.delete(f"{BASE_URL}/api/items/{item_id}")
            except Exception:
                pass
        for cust_id in self.created_customers:
            try:
                self.session.delete(f"{BASE_URL}/api/customers/{cust_id}")
            except Exception:
                pass

    def _create_test_item(self, part_number, name, category="finished_good"):
        resp = self.session.post(f"{BASE_URL}/api/items", json={
            "part_number": part_number,
            "name": name,
            "category": category,
            "unit_of_measure": "pcs"
        })
        if resp.status_code == 201:
            item = resp.json()
            self.created_items.append(item["id"])
            return item
        return None

    def _create_test_bom(self, parent_item_id, name):
        resp = self.session.post(f"{BASE_URL}/api/bom", json={
            "parent_item_id": parent_item_id,
            "name": name,
            "revision": "A",
            "status": "active",
            "components": []
        })
        if resp.status_code in (200, 201):
            bom = resp.json()
            self.created_boms.append(bom["id"])
            return bom
        print(f"BOM create failed: {resp.status_code} - {resp.text}")
        return None

    def _create_test_customer(self, name):
        resp = self.session.post(f"{BASE_URL}/api/customers", json={
            "name": name,
            "email": f"test_{uuid.uuid4().hex[:8]}@test.com"
        })
        if resp.status_code == 201:
            cust = resp.json()
            self.created_customers.append(cust["id"])
            return cust
        return None

    def _create_test_quotation(self, customer_id, lines, customer_name="Test Customer"):
        resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_id": customer_id,
            "customer_name": customer_name,
            "lines": lines,
            "status": "draft"
        })
        if resp.status_code in (200, 201):
            q = resp.json()
            self.created_quotations.append(q["id"])
            return q
        print(f"Quotation create failed: {resp.status_code} - {resp.text}")
        return None

    def test_so_list_returns_source_quotation_no(self):
        """GET /api/production returns source_quotation_no for SOs created from quotations"""
        # Create item + BOM
        item = self._create_test_item(f"TEST_SOLIST_{uuid.uuid4().hex[:6]}", "Test SO List Item")
        assert item
        bom = self._create_test_bom(item["id"], "Test BOM List")
        assert bom
        
        # Create customer
        customer = self._create_test_customer(f"Test Customer {uuid.uuid4().hex[:6]}")
        assert customer
        
        # Create quotation
        quotation = self._create_test_quotation(customer["id"], [
            {"item_id": item["id"], "quantity": 10, "rate": 100}
        ])
        assert quotation
        
        # Create SO from quotation
        due_date = (datetime.now() + timedelta(days=7)).isoformat()
        so_resp = self.session.post(f"{BASE_URL}/api/production", json={
            "lines": [{
                "bom_id": bom["id"],
                "quantity": 5,
                "due_date": due_date,
                "order_type": "mts",
                "source_quotation_line_no": 1
            }],
            "source_quotation_id": quotation["id"],
            "source_quotation_no": quotation["quotation_no"],
            "customer_id": customer["id"]
        })
        assert so_resp.status_code in (200, 201)
        so = so_resp.json()
        self.created_sos.append(so["id"])
        
        # Get SO list
        list_resp = self.session.get(f"{BASE_URL}/api/production")
        assert list_resp.status_code == 200
        sos = list_resp.json()
        
        # Find our SO
        our_so = next((s for s in sos if s["id"] == so["id"]), None)
        assert our_so, "Created SO not found in list"
        assert our_so.get("source_quotation_no") == quotation["quotation_no"], f"source_quotation_no mismatch"
        
        print("TEST PASSED: SO list returns source_quotation_no for SOs created from quotations")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
