"""
Test Purchase Invoice and Job Work / Subcontracting modules
Features tested:
1. Purchase Invoice: Create, Approve, Mark Paid status flow
2. Job Work: Subcontract Orders, Delivery Challans, Receipts
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication for tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        return s
    
    def test_login_success(self, session):
        """Verify admin login works"""
        resp = session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "admin@erp.com"
        assert data["role"] == "admin"
        print(f"✓ Logged in as admin: {data['name']}")


class TestPurchaseInvoice:
    """Purchase Invoice CRUD and status flow tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    @pytest.fixture(scope="class")
    def test_data(self, session):
        """Get supplier and item for testing"""
        # Get suppliers
        sup_resp = session.get(f"{BASE_URL}/api/suppliers")
        assert sup_resp.status_code == 200
        suppliers = sup_resp.json()
        
        # Get items
        items_resp = session.get(f"{BASE_URL}/api/items")
        assert items_resp.status_code == 200
        items = items_resp.json()
        
        assert len(suppliers) > 0, "No suppliers found - need seed data"
        assert len(items) > 0, "No items found - need seed data"
        
        return {
            "supplier_id": suppliers[0]["id"],
            "supplier_name": suppliers[0]["name"],
            "item_id": items[0]["id"],
            "item_name": items[0]["name"],
            "item_gst_rate": items[0].get("gst_rate", 18)
        }
    
    def test_create_purchase_invoice(self, session, test_data):
        """POST /api/purchase-invoices - Create invoice with lines and GST"""
        invoice_date = datetime.now().isoformat()
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        
        payload = {
            "supplier_id": test_data["supplier_id"],
            "invoice_no": "TEST-INV-001",
            "invoice_date": invoice_date,
            "due_date": due_date,
            "lines": [
                {
                    "item_id": test_data["item_id"],
                    "quantity": 10,
                    "unit_price": 100.0,
                    "gst_rate": 18.0
                }
            ],
            "notes": "Test invoice for PI module"
        }
        
        resp = session.post(f"{BASE_URL}/api/purchase-invoices", json=payload)
        assert resp.status_code == 201, f"Create invoice failed: {resp.text}"
        
        data = resp.json()
        assert "id" in data
        assert data["status"] == "draft"
        assert data["invoice_no"] == "TEST-INV-001"
        assert data["subtotal"] == 1000.0  # 10 * 100
        assert data["total_tax"] > 0  # GST calculated
        assert data["total_amount"] > data["subtotal"]  # Total includes GST
        
        # Store for later tests
        test_data["invoice_id"] = data["id"]
        test_data["invoice_number"] = data["invoice_number"]
        
        print(f"✓ Created invoice {data['invoice_number']} with status=draft")
        print(f"  Subtotal: {data['subtotal']}, Tax: {data['total_tax']}, Total: {data['total_amount']}")
        return data
    
    def test_get_purchase_invoices(self, session, test_data):
        """GET /api/purchase-invoices - List with supplier and item details"""
        resp = session.get(f"{BASE_URL}/api/purchase-invoices")
        assert resp.status_code == 200
        
        invoices = resp.json()
        assert len(invoices) > 0
        
        # Find our test invoice
        test_inv = next((i for i in invoices if i.get("invoice_no") == "TEST-INV-001"), None)
        assert test_inv is not None, "Test invoice not found in list"
        
        # Verify enriched data
        assert "supplier" in test_inv
        assert test_inv["supplier"] is not None
        assert "lines" in test_inv
        assert len(test_inv["lines"]) > 0
        
        print(f"✓ GET invoices returns {len(invoices)} invoices with supplier details")
    
    def test_approve_invoice_draft_to_approved(self, session, test_data):
        """POST /api/purchase-invoices/{id}/approve - Draft → Approved"""
        invoice_id = test_data.get("invoice_id")
        assert invoice_id, "No invoice_id from create test"
        
        resp = session.post(f"{BASE_URL}/api/purchase-invoices/{invoice_id}/approve")
        assert resp.status_code == 200, f"Approve failed: {resp.text}"
        
        data = resp.json()
        assert data["status"] == "approved"
        assert "approved_at" in data
        
        print(f"✓ Invoice {data['invoice_number']} approved (draft → approved)")
    
    def test_approve_already_approved_fails(self, session, test_data):
        """Cannot approve an already approved invoice"""
        invoice_id = test_data.get("invoice_id")
        
        resp = session.post(f"{BASE_URL}/api/purchase-invoices/{invoice_id}/approve")
        assert resp.status_code == 400
        assert "draft" in resp.json().get("detail", "").lower()
        
        print("✓ Cannot approve already approved invoice (returns 400)")
    
    def test_mark_paid_approved_to_paid(self, session, test_data):
        """POST /api/purchase-invoices/{id}/mark-paid - Approved → Paid"""
        invoice_id = test_data.get("invoice_id")
        
        resp = session.post(f"{BASE_URL}/api/purchase-invoices/{invoice_id}/mark-paid")
        assert resp.status_code == 200, f"Mark paid failed: {resp.text}"
        
        data = resp.json()
        assert data["status"] == "paid"
        assert "paid_at" in data
        
        print(f"✓ Invoice {data['invoice_number']} marked paid (approved → paid)")
    
    def test_mark_paid_draft_fails(self, session, test_data):
        """Cannot mark draft invoice as paid"""
        # Create a new draft invoice
        payload = {
            "supplier_id": test_data["supplier_id"],
            "invoice_no": "TEST-INV-002",
            "invoice_date": datetime.now().isoformat(),
            "lines": [{"item_id": test_data["item_id"], "quantity": 5, "unit_price": 50.0}]
        }
        create_resp = session.post(f"{BASE_URL}/api/purchase-invoices", json=payload)
        assert create_resp.status_code == 201
        new_id = create_resp.json()["id"]
        
        # Try to mark as paid directly
        resp = session.post(f"{BASE_URL}/api/purchase-invoices/{new_id}/mark-paid")
        assert resp.status_code == 400
        assert "approved" in resp.json().get("detail", "").lower()
        
        print("✓ Cannot mark draft invoice as paid (returns 400)")
    
    def test_filter_by_status(self, session):
        """GET /api/purchase-invoices?status=paid"""
        resp = session.get(f"{BASE_URL}/api/purchase-invoices?status=paid")
        assert resp.status_code == 200
        
        invoices = resp.json()
        for inv in invoices:
            assert inv["status"] == "paid"
        
        print(f"✓ Filter by status=paid returns {len(invoices)} invoices")


class TestJobWorkOrders:
    """Job Work / Subcontract Order tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    @pytest.fixture(scope="class")
    def test_data(self, session):
        """Get supplier and item with stock for testing"""
        sup_resp = session.get(f"{BASE_URL}/api/suppliers")
        suppliers = sup_resp.json()
        
        items_resp = session.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        
        # Find item with stock > 10 for DC testing
        item_with_stock = next((i for i in items if i.get("current_stock", 0) >= 10), None)
        if not item_with_stock:
            # Use first item and add stock
            item_with_stock = items[0]
            print(f"Warning: Using item {item_with_stock['part_number']} with stock {item_with_stock.get('current_stock', 0)}")
        
        return {
            "supplier_id": suppliers[0]["id"],
            "supplier_name": suppliers[0]["name"],
            "item_id": item_with_stock["id"],
            "item_part_number": item_with_stock["part_number"],
            "item_stock": item_with_stock.get("current_stock", 0)
        }
    
    def test_create_subcontract_order(self, session, test_data):
        """POST /api/job-work/orders - Create order with status=draft"""
        return_date = (datetime.now() + timedelta(days=14)).isoformat()
        
        payload = {
            "supplier_id": test_data["supplier_id"],
            "lines": [
                {
                    "item_id": test_data["item_id"],
                    "quantity": 5,
                    "rate": 10.0
                }
            ],
            "expected_return_date": return_date,
            "processing_charges": 500.0,
            "notes": "Test subcontract order"
        }
        
        resp = session.post(f"{BASE_URL}/api/job-work/orders", json=payload)
        assert resp.status_code == 201, f"Create order failed: {resp.text}"
        
        data = resp.json()
        assert "id" in data
        assert data["status"] == "draft"
        assert data["order_number"].startswith("JW-")
        assert len(data["lines"]) == 1
        assert data["lines"][0]["sent_quantity"] == 0
        assert data["lines"][0]["received_quantity"] == 0
        
        test_data["order_id"] = data["id"]
        test_data["order_number"] = data["order_number"]
        
        print(f"✓ Created subcontract order {data['order_number']} with status=draft")
        return data
    
    def test_get_subcontract_orders(self, session, test_data):
        """GET /api/job-work/orders - List with supplier and item details"""
        resp = session.get(f"{BASE_URL}/api/job-work/orders")
        assert resp.status_code == 200
        
        orders = resp.json()
        assert len(orders) > 0
        
        # Find our test order
        test_order = next((o for o in orders if o.get("order_number") == test_data.get("order_number")), None)
        assert test_order is not None
        
        # Verify enriched data
        assert "supplier" in test_order
        assert test_order["supplier"] is not None
        assert "lines" in test_order
        for line in test_order["lines"]:
            assert "item" in line
        
        print(f"✓ GET orders returns {len(orders)} orders with supplier/item details")
    
    def test_confirm_order_draft_to_confirmed(self, session, test_data):
        """POST /api/job-work/orders/{id}/confirm - Draft → Confirmed"""
        order_id = test_data.get("order_id")
        
        resp = session.post(f"{BASE_URL}/api/job-work/orders/{order_id}/confirm")
        assert resp.status_code == 200, f"Confirm failed: {resp.text}"
        
        data = resp.json()
        assert data["status"] == "confirmed"
        assert "confirmed_at" in data
        
        print(f"✓ Order {data['order_number']} confirmed (draft → confirmed)")
    
    def test_confirm_already_confirmed_fails(self, session, test_data):
        """Cannot confirm an already confirmed order"""
        order_id = test_data.get("order_id")
        
        resp = session.post(f"{BASE_URL}/api/job-work/orders/{order_id}/confirm")
        assert resp.status_code == 400
        
        print("✓ Cannot confirm already confirmed order (returns 400)")


class TestJobWorkChallans:
    """Delivery Challan tests - Send materials to subcontractor"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    @pytest.fixture(scope="class")
    def confirmed_order(self, session):
        """Create and confirm an order for DC testing"""
        # Get supplier and item
        sup_resp = session.get(f"{BASE_URL}/api/suppliers")
        suppliers = sup_resp.json()
        
        items_resp = session.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        
        # Find item with enough stock
        item_with_stock = next((i for i in items if i.get("current_stock", 0) >= 5), None)
        if not item_with_stock:
            pytest.skip("No item with sufficient stock for DC test")
        
        # Create order
        payload = {
            "supplier_id": suppliers[0]["id"],
            "lines": [{"item_id": item_with_stock["id"], "quantity": 3, "rate": 15.0}],
            "processing_charges": 100.0
        }
        create_resp = session.post(f"{BASE_URL}/api/job-work/orders", json=payload)
        assert create_resp.status_code == 201
        order = create_resp.json()
        
        # Confirm order
        confirm_resp = session.post(f"{BASE_URL}/api/job-work/orders/{order['id']}/confirm")
        assert confirm_resp.status_code == 200
        
        return {
            "order_id": order["id"],
            "order_number": order["order_number"],
            "item_id": item_with_stock["id"],
            "item_stock_before": item_with_stock["current_stock"]
        }
    
    def test_create_delivery_challan(self, session, confirmed_order):
        """POST /api/job-work/challans - Create DC, deduct stock"""
        payload = {
            "subcontract_order_id": confirmed_order["order_id"],
            "lines": [{"item_id": confirmed_order["item_id"], "quantity": 2, "rate": 15.0}],
            "notes": "Test DC"
        }
        
        resp = session.post(f"{BASE_URL}/api/job-work/challans", json=payload)
        assert resp.status_code == 201, f"Create DC failed: {resp.text}"
        
        data = resp.json()
        assert "id" in data
        assert data["dc_number"].startswith("DC-")
        assert data["status"] == "sent"
        assert len(data["lines"]) == 1
        
        confirmed_order["dc_id"] = data["id"]
        confirmed_order["dc_number"] = data["dc_number"]
        
        print(f"✓ Created DC {data['dc_number']} with status=sent")
        return data
    
    def test_dc_deducts_stock(self, session, confirmed_order):
        """Verify DC deducted stock from item"""
        items_resp = session.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        
        item = next((i for i in items if i["id"] == confirmed_order["item_id"]), None)
        assert item is not None
        
        # Stock should be reduced by 2 (DC quantity)
        expected_stock = confirmed_order["item_stock_before"] - 2
        assert item["current_stock"] == expected_stock, f"Stock not deducted: expected {expected_stock}, got {item['current_stock']}"
        
        print(f"✓ Stock deducted: {confirmed_order['item_stock_before']} → {item['current_stock']}")
    
    def test_dc_creates_inventory_transaction(self, session, confirmed_order):
        """Verify DC created inventory transaction"""
        resp = session.get(f"{BASE_URL}/api/inventory/transactions?item_id={confirmed_order['item_id']}")
        assert resp.status_code == 200
        
        transactions = resp.json()
        dc_tx = next((t for t in transactions if t.get("reference_type") == "job_work_dc"), None)
        assert dc_tx is not None, "No job_work_dc transaction found"
        assert dc_tx["transaction_type"] == "issue"
        
        print(f"✓ Inventory transaction created for DC (type=issue)")
    
    def test_dc_updates_order_sent_quantity(self, session, confirmed_order):
        """Verify DC updated sent_quantity in order"""
        resp = session.get(f"{BASE_URL}/api/job-work/orders")
        orders = resp.json()
        
        order = next((o for o in orders if o["id"] == confirmed_order["order_id"]), None)
        assert order is not None
        assert order["status"] == "in_progress"
        assert order["lines"][0]["sent_quantity"] == 2
        
        print(f"✓ Order status=in_progress, sent_quantity=2")
    
    def test_get_challans(self, session):
        """GET /api/job-work/challans - List with order and supplier details"""
        resp = session.get(f"{BASE_URL}/api/job-work/challans")
        assert resp.status_code == 200
        
        challans = resp.json()
        assert len(challans) > 0
        
        # Verify enriched data
        for dc in challans:
            assert "order" in dc
            assert "supplier" in dc
            assert "lines" in dc
        
        print(f"✓ GET challans returns {len(challans)} DCs with order/supplier details")
    
    def test_dc_insufficient_stock_fails(self, session, confirmed_order):
        """Cannot create DC with more quantity than available stock"""
        payload = {
            "subcontract_order_id": confirmed_order["order_id"],
            "lines": [{"item_id": confirmed_order["item_id"], "quantity": 99999}]
        }
        
        resp = session.post(f"{BASE_URL}/api/job-work/challans", json=payload)
        assert resp.status_code == 400
        assert "insufficient" in resp.json().get("detail", "").lower()
        
        print("✓ DC with insufficient stock returns 400")


class TestJobWorkReceipts:
    """Subcontract Receipt tests - Receive materials back"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200
        return s
    
    @pytest.fixture(scope="class")
    def order_with_dc(self, session):
        """Create order, confirm, and send DC for receipt testing"""
        # Get supplier and item
        sup_resp = session.get(f"{BASE_URL}/api/suppliers")
        suppliers = sup_resp.json()
        
        items_resp = session.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        
        item_with_stock = next((i for i in items if i.get("current_stock", 0) >= 10), None)
        if not item_with_stock:
            pytest.skip("No item with sufficient stock for receipt test")
        
        # Create and confirm order
        order_payload = {
            "supplier_id": suppliers[0]["id"],
            "lines": [{"item_id": item_with_stock["id"], "quantity": 5, "rate": 20.0}],
            "processing_charges": 200.0
        }
        order_resp = session.post(f"{BASE_URL}/api/job-work/orders", json=order_payload)
        order = order_resp.json()
        session.post(f"{BASE_URL}/api/job-work/orders/{order['id']}/confirm")
        
        # Create DC
        dc_payload = {
            "subcontract_order_id": order["id"],
            "lines": [{"item_id": item_with_stock["id"], "quantity": 5}]
        }
        dc_resp = session.post(f"{BASE_URL}/api/job-work/challans", json=dc_payload)
        dc = dc_resp.json()
        
        # Get updated stock
        items_resp = session.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        item = next((i for i in items if i["id"] == item_with_stock["id"]), None)
        
        return {
            "order_id": order["id"],
            "order_number": order["order_number"],
            "dc_id": dc["id"],
            "item_id": item_with_stock["id"],
            "item_stock_after_dc": item["current_stock"]
        }
    
    def test_create_receipt(self, session, order_with_dc):
        """POST /api/job-work/receipts - Receive materials back"""
        payload = {
            "subcontract_order_id": order_with_dc["order_id"],
            "dc_id": order_with_dc["dc_id"],
            "lines": [
                {
                    "item_id": order_with_dc["item_id"],
                    "received_quantity": 5,
                    "quality_result": "accept",
                    "reject_qty": 0
                }
            ],
            "notes": "Test receipt"
        }
        
        resp = session.post(f"{BASE_URL}/api/job-work/receipts", json=payload)
        assert resp.status_code == 201, f"Create receipt failed: {resp.text}"
        
        data = resp.json()
        assert "id" in data
        assert data["receipt_number"].startswith("SR-")
        assert data["status"] == "received"
        assert len(data["lines"]) == 1
        assert data["lines"][0]["accepted_quantity"] == 5
        
        order_with_dc["receipt_id"] = data["id"]
        order_with_dc["receipt_number"] = data["receipt_number"]
        
        print(f"✓ Created receipt {data['receipt_number']} with status=received")
        return data
    
    def test_receipt_adds_stock(self, session, order_with_dc):
        """Verify receipt added stock back to item"""
        items_resp = session.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        
        item = next((i for i in items if i["id"] == order_with_dc["item_id"]), None)
        assert item is not None
        
        # Stock should be increased by 5 (received quantity)
        expected_stock = order_with_dc["item_stock_after_dc"] + 5
        assert item["current_stock"] == expected_stock, f"Stock not added: expected {expected_stock}, got {item['current_stock']}"
        
        print(f"✓ Stock added: {order_with_dc['item_stock_after_dc']} → {item['current_stock']}")
    
    def test_receipt_with_rejection(self, session):
        """Receipt with partial rejection - only accepted qty added to stock"""
        # Create new order flow
        sup_resp = session.get(f"{BASE_URL}/api/suppliers")
        suppliers = sup_resp.json()
        
        items_resp = session.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        
        item = next((i for i in items if i.get("current_stock", 0) >= 10), None)
        if not item:
            pytest.skip("No item with sufficient stock")
        
        stock_before = item["current_stock"]
        
        # Create, confirm, DC
        order_resp = session.post(f"{BASE_URL}/api/job-work/orders", json={
            "supplier_id": suppliers[0]["id"],
            "lines": [{"item_id": item["id"], "quantity": 4}]
        })
        order = order_resp.json()
        session.post(f"{BASE_URL}/api/job-work/orders/{order['id']}/confirm")
        
        session.post(f"{BASE_URL}/api/job-work/challans", json={
            "subcontract_order_id": order["id"],
            "lines": [{"item_id": item["id"], "quantity": 4}]
        })
        
        # Receipt with 1 rejected
        receipt_resp = session.post(f"{BASE_URL}/api/job-work/receipts", json={
            "subcontract_order_id": order["id"],
            "lines": [{"item_id": item["id"], "received_quantity": 4, "quality_result": "accept", "reject_qty": 1}]
        })
        assert receipt_resp.status_code == 201
        receipt = receipt_resp.json()
        
        assert receipt["lines"][0]["accepted_quantity"] == 3  # 4 - 1 rejected
        
        # Verify stock: -4 (DC) + 3 (accepted) = -1 net
        items_resp = session.get(f"{BASE_URL}/api/items")
        items = items_resp.json()
        item_after = next((i for i in items if i["id"] == item["id"]), None)
        
        expected = stock_before - 4 + 3  # DC deducted 4, receipt added 3
        assert item_after["current_stock"] == expected
        
        print(f"✓ Receipt with rejection: received=4, rejected=1, accepted=3")
    
    def test_order_auto_completes(self, session, order_with_dc):
        """Order auto-completes when all materials received"""
        resp = session.get(f"{BASE_URL}/api/job-work/orders")
        orders = resp.json()
        
        order = next((o for o in orders if o["id"] == order_with_dc["order_id"]), None)
        assert order is not None
        assert order["status"] == "completed", f"Order should be completed, got {order['status']}"
        
        print(f"✓ Order {order['order_number']} auto-completed when all materials received")
    
    def test_get_receipts(self, session):
        """GET /api/job-work/receipts - List with order and supplier details"""
        resp = session.get(f"{BASE_URL}/api/job-work/receipts")
        assert resp.status_code == 200
        
        receipts = resp.json()
        assert len(receipts) > 0
        
        for rec in receipts:
            assert "order" in rec
            assert "supplier" in rec
            assert "lines" in rec
        
        print(f"✓ GET receipts returns {len(receipts)} receipts with order/supplier details")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
