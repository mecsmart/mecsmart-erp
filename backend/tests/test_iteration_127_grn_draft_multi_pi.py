"""
Iteration 127 Tests: GRN Draft Mode + Multi-GRN Purchase Invoice

Tests for:
1. POST /api/grn with status='draft' - creates draft GRN, NO stock/PO updates
2. POST /api/grn (default/posted) - behaves as before (stock + PO updated)
3. PUT /api/grn/{id} - edits draft GRN, 400 if already posted
4. POST /api/grn/{id}/approve - promotes draft to posted, runs inventory/PO cascade
5. GET /api/grn - returns both draft and posted GRNs
6. GET /api/purchase-invoices/pending-grns - only posted GRNs, excludes drafts and already-invoiced
7. POST /api/purchase-invoices with grn_ids=[A,B] same supplier - creates invoice
8. POST /api/purchase-invoices with grn_ids from different suppliers - 400
9. POST /api/purchase-invoices with grn_ids referencing draft GRN - 400
10. REGRESSION: single-GRN flow (legacy grn_id) still works
11. REGRESSION: Manual PI (no GRN) still works
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    """Authenticated session for all tests."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Login
    resp = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return s


@pytest.fixture(scope="module")
def test_supplier(session):
    """Create a test supplier for GRN/PI tests."""
    supplier_data = {
        "code": f"TEST-SUP-{uuid.uuid4().hex[:6].upper()}",
        "name": f"Test Supplier GRN Draft {uuid.uuid4().hex[:6]}",
        "email": "test@supplier.com",
        "phone": "1234567890",
        "gstin": "27AABCU9603R1ZM",
        "state_code": "27",
        "pin_code": "400001",
        "city": "Mumbai",
        "state": "Maharashtra",
        "address": "Test Address"
    }
    resp = session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
    assert resp.status_code == 201, f"Failed to create supplier: {resp.text}"
    return resp.json()


@pytest.fixture(scope="module")
def test_supplier_2(session):
    """Create a second test supplier for multi-supplier validation."""
    supplier_data = {
        "code": f"TEST-SUP2-{uuid.uuid4().hex[:6].upper()}",
        "name": f"Test Supplier 2 {uuid.uuid4().hex[:6]}",
        "email": "test2@supplier.com",
        "phone": "9876543210",
        "gstin": "24AABCU9603R1ZN",
        "state_code": "24",
        "pin_code": "380001",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "address": "Test Address 2"
    }
    resp = session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
    assert resp.status_code == 201, f"Failed to create supplier 2: {resp.text}"
    return resp.json()


@pytest.fixture(scope="module")
def test_item(session):
    """Create a test item for GRN tests."""
    item_data = {
        "part_number": f"TEST-RM-{uuid.uuid4().hex[:6].upper()}",
        "name": f"Test Raw Material {uuid.uuid4().hex[:6]}",
        "category": "raw_material",
        "unit_of_measure": "pcs",
        "unit_cost": 100.0,
        "purchase_price": 100.0,
        "current_stock": 50,
        "hsn_code": "84818090",
        "gst_rate": 18.0
    }
    resp = session.post(f"{BASE_URL}/api/items", json=item_data)
    assert resp.status_code == 201, f"Failed to create item: {resp.text}"
    return resp.json()


@pytest.fixture(scope="module")
def test_item_2(session):
    """Create a second test item."""
    item_data = {
        "part_number": f"TEST-RM2-{uuid.uuid4().hex[:6].upper()}",
        "name": f"Test Raw Material 2 {uuid.uuid4().hex[:6]}",
        "category": "raw_material",
        "unit_of_measure": "pcs",
        "unit_cost": 200.0,
        "purchase_price": 200.0,
        "current_stock": 30,
        "hsn_code": "84818091",
        "gst_rate": 18.0
    }
    resp = session.post(f"{BASE_URL}/api/items", json=item_data)
    assert resp.status_code == 201, f"Failed to create item 2: {resp.text}"
    return resp.json()


@pytest.fixture(scope="module")
def test_po(session, test_supplier, test_item):
    """Create a test PO for GRN tests."""
    po_data = {
        "supplier_id": test_supplier["id"],
        "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
        "lines": [
            {
                "item_id": test_item["id"],
                "quantity": 100,
                "unit_price": 100.0,
                "uom": "pcs",
                "hsn_code": "84818090",
                "gst_rate": 18.0
            }
        ]
    }
    resp = session.post(f"{BASE_URL}/api/purchase-orders", json=po_data)
    assert resp.status_code == 201, f"Failed to create PO: {resp.text}"
    return resp.json()


@pytest.fixture(scope="module")
def test_po_2(session, test_supplier, test_item_2):
    """Create a second test PO for multi-GRN tests."""
    po_data = {
        "supplier_id": test_supplier["id"],
        "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
        "lines": [
            {
                "item_id": test_item_2["id"],
                "quantity": 50,
                "unit_price": 200.0,
                "uom": "pcs",
                "hsn_code": "84818091",
                "gst_rate": 18.0
            }
        ]
    }
    resp = session.post(f"{BASE_URL}/api/purchase-orders", json=po_data)
    assert resp.status_code == 201, f"Failed to create PO 2: {resp.text}"
    return resp.json()


@pytest.fixture(scope="module")
def test_po_different_supplier(session, test_supplier_2, test_item):
    """Create a PO with a different supplier for multi-supplier validation."""
    po_data = {
        "supplier_id": test_supplier_2["id"],
        "expected_date": (datetime.now() + timedelta(days=7)).isoformat(),
        "lines": [
            {
                "item_id": test_item["id"],
                "quantity": 25,
                "unit_price": 110.0,
                "uom": "pcs",
                "hsn_code": "84818090",
                "gst_rate": 18.0
            }
        ]
    }
    resp = session.post(f"{BASE_URL}/api/purchase-orders", json=po_data)
    assert resp.status_code == 201, f"Failed to create PO for different supplier: {resp.text}"
    return resp.json()


class TestGRNDraftMode:
    """Tests for GRN draft mode functionality."""

    def test_create_grn_draft_no_stock_update(self, session, test_po, test_item):
        """POST /api/grn with status='draft' creates draft GRN without updating stock or PO."""
        # Capture initial stock
        item_before = session.get(f"{BASE_URL}/api/items/{test_item['id']}").json()
        initial_stock = item_before.get("current_stock", 0)
        
        # Capture initial PO state
        po_before = session.get(f"{BASE_URL}/api/purchase-orders/{test_po['id']}").json()
        initial_po_status = po_before.get("status")
        initial_received = po_before.get("lines", [{}])[0].get("received_quantity", 0)
        
        # Create draft GRN
        grn_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"DRAFT-INV-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "draft",
            "lines": [
                {
                    "item_id": test_item["id"],
                    "received_quantity": 20,
                    "verified_price": 100.0
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn_data)
        assert resp.status_code == 201, f"Failed to create draft GRN: {resp.text}"
        grn = resp.json()
        
        # Verify GRN is draft
        assert grn.get("status") == "draft", f"Expected status='draft', got {grn.get('status')}"
        assert grn.get("grn_number"), "GRN number should be assigned"
        
        # Verify stock NOT updated
        item_after = session.get(f"{BASE_URL}/api/items/{test_item['id']}").json()
        assert item_after.get("current_stock") == initial_stock, \
            f"Stock should NOT change for draft GRN. Before: {initial_stock}, After: {item_after.get('current_stock')}"
        
        # Verify PO NOT updated
        po_after = session.get(f"{BASE_URL}/api/purchase-orders/{test_po['id']}").json()
        assert po_after.get("lines", [{}])[0].get("received_quantity", 0) == initial_received, \
            f"PO received_quantity should NOT change for draft GRN"
        
        print(f"✓ Draft GRN {grn['grn_number']} created. Stock unchanged: {initial_stock}")
        return grn

    def test_create_grn_posted_updates_stock(self, session, test_po, test_item):
        """POST /api/grn (default/posted) updates stock and PO as before."""
        # Capture initial stock
        item_before = session.get(f"{BASE_URL}/api/items/{test_item['id']}").json()
        initial_stock = item_before.get("current_stock", 0)
        
        # Create posted GRN (default behavior)
        grn_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"POSTED-INV-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "posted",  # explicit posted
            "lines": [
                {
                    "item_id": test_item["id"],
                    "received_quantity": 15,
                    "verified_price": 100.0
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn_data)
        assert resp.status_code == 201, f"Failed to create posted GRN: {resp.text}"
        grn = resp.json()
        
        # Verify GRN is posted
        assert grn.get("status") == "posted", f"Expected status='posted', got {grn.get('status')}"
        
        # Verify stock IS updated
        item_after = session.get(f"{BASE_URL}/api/items/{test_item['id']}").json()
        expected_stock = initial_stock + 15
        assert item_after.get("current_stock") == expected_stock, \
            f"Stock should increase by 15. Before: {initial_stock}, Expected: {expected_stock}, Got: {item_after.get('current_stock')}"
        
        # Verify PO status changed to partial
        po_after = session.get(f"{BASE_URL}/api/purchase-orders/{test_po['id']}").json()
        assert po_after.get("status") in ("partial", "received"), \
            f"PO status should be 'partial' or 'received', got {po_after.get('status')}"
        
        print(f"✓ Posted GRN {grn['grn_number']} created. Stock updated: {initial_stock} -> {expected_stock}")
        return grn

    def test_edit_draft_grn_success(self, session, test_po, test_item):
        """PUT /api/grn/{id} edits a draft GRN successfully."""
        # First create a draft GRN
        grn_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"EDIT-DRAFT-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "draft",
            "lines": [
                {
                    "item_id": test_item["id"],
                    "received_quantity": 10,
                    "verified_price": 95.0
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn_data)
        assert resp.status_code == 201
        draft_grn = resp.json()
        
        # Edit the draft
        update_data = {
            "supplier_invoice_no": "UPDATED-INV-123",
            "notes": "Updated notes",
            "lines": [
                {
                    "item_id": test_item["id"],
                    "received_quantity": 12,
                    "verified_price": 98.0
                }
            ]
        }
        resp = session.put(f"{BASE_URL}/api/grn/{draft_grn['id']}", json=update_data)
        assert resp.status_code == 200, f"Failed to edit draft GRN: {resp.text}"
        updated = resp.json()
        
        assert updated.get("supplier_invoice_no") == "UPDATED-INV-123"
        assert updated.get("notes") == "Updated notes"
        assert updated.get("lines", [{}])[0].get("received_quantity") == 12
        assert updated.get("lines", [{}])[0].get("verified_price") == 98.0
        
        print(f"✓ Draft GRN {draft_grn['grn_number']} edited successfully")
        return draft_grn

    def test_edit_posted_grn_fails(self, session, test_po, test_item):
        """PUT /api/grn/{id} returns 400 for posted GRN."""
        # Create a posted GRN
        grn_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"POSTED-EDIT-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "posted",
            "lines": [
                {
                    "item_id": test_item["id"],
                    "received_quantity": 5,
                    "verified_price": 100.0
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn_data)
        assert resp.status_code == 201
        posted_grn = resp.json()
        
        # Try to edit - should fail
        update_data = {
            "supplier_invoice_no": "SHOULD-FAIL",
            "lines": [
                {
                    "item_id": test_item["id"],
                    "received_quantity": 10,
                    "verified_price": 100.0
                }
            ]
        }
        resp = session.put(f"{BASE_URL}/api/grn/{posted_grn['id']}", json=update_data)
        assert resp.status_code == 400, f"Expected 400 for editing posted GRN, got {resp.status_code}"
        assert "draft" in resp.text.lower() or "approved" in resp.text.lower(), \
            f"Error should mention draft/approved: {resp.text}"
        
        print(f"✓ Edit of posted GRN correctly rejected with 400")

    def test_approve_draft_grn_updates_stock(self, session, test_po, test_item):
        """POST /api/grn/{id}/approve promotes draft to posted and updates stock/PO."""
        # Capture initial stock
        item_before = session.get(f"{BASE_URL}/api/items/{test_item['id']}").json()
        initial_stock = item_before.get("current_stock", 0)
        
        # Create a draft GRN
        grn_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"APPROVE-DRAFT-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "draft",
            "lines": [
                {
                    "item_id": test_item["id"],
                    "received_quantity": 8,
                    "verified_price": 100.0
                }
            ]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn_data)
        assert resp.status_code == 201
        draft_grn = resp.json()
        
        # Verify stock NOT updated yet
        item_mid = session.get(f"{BASE_URL}/api/items/{test_item['id']}").json()
        assert item_mid.get("current_stock") == initial_stock, "Stock should not change for draft"
        
        # Approve the draft
        resp = session.post(f"{BASE_URL}/api/grn/{draft_grn['id']}/approve")
        assert resp.status_code == 200, f"Failed to approve draft GRN: {resp.text}"
        approved = resp.json()
        
        # Verify status changed to posted
        assert approved.get("status") == "posted", f"Expected status='posted', got {approved.get('status')}"
        
        # Verify stock IS NOW updated
        item_after = session.get(f"{BASE_URL}/api/items/{test_item['id']}").json()
        expected_stock = initial_stock + 8
        assert item_after.get("current_stock") == expected_stock, \
            f"Stock should increase by 8 after approval. Before: {initial_stock}, Expected: {expected_stock}, Got: {item_after.get('current_stock')}"
        
        print(f"✓ Draft GRN {draft_grn['grn_number']} approved. Stock: {initial_stock} -> {expected_stock}")

    def test_get_grn_returns_both_draft_and_posted(self, session, test_po, test_item):
        """GET /api/grn returns both draft and posted GRNs."""
        # Create one draft and one posted
        draft_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"LIST-DRAFT-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "draft",
            "lines": [{"item_id": test_item["id"], "received_quantity": 3, "verified_price": 100.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=draft_data)
        assert resp.status_code == 201
        draft_grn = resp.json()
        
        posted_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"LIST-POSTED-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "posted",
            "lines": [{"item_id": test_item["id"], "received_quantity": 2, "verified_price": 100.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=posted_data)
        assert resp.status_code == 201
        posted_grn = resp.json()
        
        # Get all GRNs
        resp = session.get(f"{BASE_URL}/api/grn")
        assert resp.status_code == 200
        grns = resp.json()
        
        # Find our test GRNs
        draft_found = any(g.get("id") == draft_grn["id"] and g.get("status") == "draft" for g in grns)
        posted_found = any(g.get("id") == posted_grn["id"] and g.get("status") == "posted" for g in grns)
        
        assert draft_found, "Draft GRN should be in the list"
        assert posted_found, "Posted GRN should be in the list"
        
        print(f"✓ GET /api/grn returns both draft and posted GRNs")


class TestPendingGRNsForInvoice:
    """Tests for pending GRNs endpoint (excludes drafts)."""

    def test_pending_grns_excludes_drafts(self, session, test_po, test_item):
        """GET /api/purchase-invoices/pending-grns excludes draft GRNs."""
        # Create a draft GRN
        draft_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"PENDING-DRAFT-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "draft",
            "lines": [{"item_id": test_item["id"], "received_quantity": 5, "verified_price": 100.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=draft_data)
        assert resp.status_code == 201
        draft_grn = resp.json()
        
        # Get pending GRNs
        resp = session.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert resp.status_code == 200
        pending = resp.json()
        
        # Draft should NOT be in pending list
        draft_in_pending = any(g.get("id") == draft_grn["id"] for g in pending)
        assert not draft_in_pending, "Draft GRN should NOT appear in pending-grns list"
        
        print(f"✓ Pending GRNs correctly excludes draft GRN {draft_grn['grn_number']}")

    def test_pending_grns_includes_posted(self, session, test_po_2, test_item_2):
        """GET /api/purchase-invoices/pending-grns includes posted GRNs."""
        # Create a posted GRN
        posted_data = {
            "po_id": test_po_2["id"],
            "supplier_invoice_no": f"PENDING-POSTED-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "posted",
            "lines": [{"item_id": test_item_2["id"], "received_quantity": 10, "verified_price": 200.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=posted_data)
        assert resp.status_code == 201
        posted_grn = resp.json()
        
        # Get pending GRNs
        resp = session.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        assert resp.status_code == 200
        pending = resp.json()
        
        # Posted should be in pending list
        posted_in_pending = any(g.get("id") == posted_grn["id"] for g in pending)
        assert posted_in_pending, "Posted GRN should appear in pending-grns list"
        
        print(f"✓ Pending GRNs correctly includes posted GRN {posted_grn['grn_number']}")
        return posted_grn


class TestMultiGRNPurchaseInvoice:
    """Tests for multi-GRN purchase invoice functionality."""

    def test_multi_grn_same_supplier_success(self, session, test_supplier, test_po, test_po_2, test_item, test_item_2):
        """POST /api/purchase-invoices with grn_ids from same supplier succeeds."""
        # Create two posted GRNs from same supplier
        grn1_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"MULTI-GRN1-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "posted",
            "lines": [{"item_id": test_item["id"], "received_quantity": 5, "verified_price": 100.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn1_data)
        assert resp.status_code == 201
        grn1 = resp.json()
        
        grn2_data = {
            "po_id": test_po_2["id"],
            "supplier_invoice_no": f"MULTI-GRN2-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "posted",
            "lines": [{"item_id": test_item_2["id"], "received_quantity": 8, "verified_price": 200.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn2_data)
        assert resp.status_code == 201
        grn2 = resp.json()
        
        # Create invoice with both GRNs
        invoice_data = {
            "supplier_id": test_supplier["id"],
            "grn_ids": [grn1["id"], grn2["id"]],
            "invoice_no": f"MULTI-PI-{uuid.uuid4().hex[:6]}",
            "invoice_date": datetime.now().isoformat(),
            "lines": [
                {"item_id": test_item["id"], "quantity": 5, "unit_price": 100.0, "gst_rate": 18.0},
                {"item_id": test_item_2["id"], "quantity": 8, "unit_price": 200.0, "gst_rate": 18.0}
            ]
        }
        resp = session.post(f"{BASE_URL}/api/purchase-invoices", json=invoice_data)
        assert resp.status_code == 201, f"Failed to create multi-GRN invoice: {resp.text}"
        invoice = resp.json()
        
        # Verify grn_ids stored
        assert grn1["id"] in invoice.get("grn_ids", []), "grn1 should be in grn_ids"
        assert grn2["id"] in invoice.get("grn_ids", []), "grn2 should be in grn_ids"
        # Verify grn_id (back-compat) is first
        assert invoice.get("grn_id") == grn1["id"], "grn_id should be first GRN for back-compat"
        
        # Verify both GRNs now excluded from pending
        resp = session.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        pending = resp.json()
        grn1_pending = any(g.get("id") == grn1["id"] for g in pending)
        grn2_pending = any(g.get("id") == grn2["id"] for g in pending)
        assert not grn1_pending, "GRN1 should be excluded from pending after invoice"
        assert not grn2_pending, "GRN2 should be excluded from pending after invoice"
        
        print(f"✓ Multi-GRN invoice created with grn_ids: {invoice.get('grn_ids')}")

    def test_multi_grn_different_suppliers_fails(self, session, test_supplier, test_supplier_2, test_po, test_po_different_supplier, test_item):
        """POST /api/purchase-invoices with grn_ids from different suppliers returns 400."""
        # Create GRN from supplier 1
        grn1_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"DIFF-SUP1-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "posted",
            "lines": [{"item_id": test_item["id"], "received_quantity": 3, "verified_price": 100.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn1_data)
        assert resp.status_code == 201
        grn1 = resp.json()
        
        # Create GRN from supplier 2
        grn2_data = {
            "po_id": test_po_different_supplier["id"],
            "supplier_invoice_no": f"DIFF-SUP2-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "posted",
            "lines": [{"item_id": test_item["id"], "received_quantity": 4, "verified_price": 110.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn2_data)
        assert resp.status_code == 201
        grn2 = resp.json()
        
        # Try to create invoice with both - should fail
        invoice_data = {
            "supplier_id": test_supplier["id"],
            "grn_ids": [grn1["id"], grn2["id"]],
            "invoice_no": f"SHOULD-FAIL-{uuid.uuid4().hex[:6]}",
            "invoice_date": datetime.now().isoformat(),
            "lines": [
                {"item_id": test_item["id"], "quantity": 7, "unit_price": 100.0, "gst_rate": 18.0}
            ]
        }
        resp = session.post(f"{BASE_URL}/api/purchase-invoices", json=invoice_data)
        assert resp.status_code == 400, f"Expected 400 for different suppliers, got {resp.status_code}"
        assert "same supplier" in resp.text.lower(), f"Error should mention same supplier: {resp.text}"
        
        print(f"✓ Multi-GRN invoice with different suppliers correctly rejected")

    def test_invoice_with_draft_grn_fails(self, session, test_supplier, test_po, test_item):
        """POST /api/purchase-invoices with grn_ids referencing draft GRN returns 400."""
        # Create a draft GRN
        draft_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"DRAFT-FOR-PI-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "draft",
            "lines": [{"item_id": test_item["id"], "received_quantity": 6, "verified_price": 100.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=draft_data)
        assert resp.status_code == 201
        draft_grn = resp.json()
        
        # Try to create invoice with draft GRN - should fail
        invoice_data = {
            "supplier_id": test_supplier["id"],
            "grn_ids": [draft_grn["id"]],
            "invoice_no": f"DRAFT-PI-FAIL-{uuid.uuid4().hex[:6]}",
            "invoice_date": datetime.now().isoformat(),
            "lines": [
                {"item_id": test_item["id"], "quantity": 6, "unit_price": 100.0, "gst_rate": 18.0}
            ]
        }
        resp = session.post(f"{BASE_URL}/api/purchase-invoices", json=invoice_data)
        assert resp.status_code == 400, f"Expected 400 for draft GRN, got {resp.status_code}"
        assert "not posted" in resp.text.lower() or "approve" in resp.text.lower(), \
            f"Error should mention not posted/approve: {resp.text}"
        
        print(f"✓ Invoice with draft GRN correctly rejected")


class TestRegressionFlows:
    """Regression tests for existing flows."""

    def test_single_grn_legacy_flow(self, session, test_supplier, test_po, test_item):
        """REGRESSION: Single-GRN flow (legacy grn_id field) still works."""
        # Create a posted GRN
        grn_data = {
            "po_id": test_po["id"],
            "supplier_invoice_no": f"LEGACY-GRN-{uuid.uuid4().hex[:6]}",
            "supplier_invoice_date": datetime.now().isoformat(),
            "status": "posted",
            "lines": [{"item_id": test_item["id"], "received_quantity": 4, "verified_price": 100.0}]
        }
        resp = session.post(f"{BASE_URL}/api/grn", json=grn_data)
        assert resp.status_code == 201
        grn = resp.json()
        
        # Create invoice with legacy grn_id field
        invoice_data = {
            "supplier_id": test_supplier["id"],
            "grn_id": grn["id"],  # Legacy field
            "invoice_no": f"LEGACY-PI-{uuid.uuid4().hex[:6]}",
            "invoice_date": datetime.now().isoformat(),
            "lines": [
                {"item_id": test_item["id"], "quantity": 4, "unit_price": 100.0, "gst_rate": 18.0}
            ]
        }
        resp = session.post(f"{BASE_URL}/api/purchase-invoices", json=invoice_data)
        assert resp.status_code == 201, f"Legacy single-GRN flow failed: {resp.text}"
        invoice = resp.json()
        
        # Verify grn_id stored
        assert invoice.get("grn_id") == grn["id"]
        
        # Verify GRN excluded from pending
        resp = session.get(f"{BASE_URL}/api/purchase-invoices/pending-grns")
        pending = resp.json()
        grn_pending = any(g.get("id") == grn["id"] for g in pending)
        assert not grn_pending, "GRN should be excluded from pending after invoice"
        
        print(f"✓ Legacy single-GRN flow works correctly")

    def test_manual_pi_no_grn(self, session, test_supplier, test_item):
        """REGRESSION: Manual PI (no GRN) still works end-to-end."""
        invoice_data = {
            "supplier_id": test_supplier["id"],
            "is_manual": True,
            "invoice_no": f"MANUAL-PI-{uuid.uuid4().hex[:6]}",
            "invoice_date": datetime.now().isoformat(),
            "lines": [
                {"item_id": test_item["id"], "quantity": 10, "unit_price": 50.0, "gst_rate": 18.0, "description": "Service charge"}
            ]
        }
        resp = session.post(f"{BASE_URL}/api/purchase-invoices", json=invoice_data)
        assert resp.status_code == 201, f"Manual PI creation failed: {resp.text}"
        invoice = resp.json()
        
        assert invoice.get("is_manual") == True
        assert invoice.get("grn_id") == "" or invoice.get("grn_id") is None or not invoice.get("grn_id")
        assert len(invoice.get("lines", [])) == 1
        
        print(f"✓ Manual PI (no GRN) created successfully: {invoice.get('invoice_number')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
