"""
CRM Module Tests - Iteration 66
Tests for:
- Leads (Marketing): CRUD, stage transitions, convert-to-customer, activity
- Tickets (Support): CRUD, stage transitions, SLA computation
- Quotations: CRUD, totals computation, convert-to-SO, BOM validation
"""
import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Authenticated requests session using cookies"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login to get cookies
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    
    # Cookies are automatically stored in session
    return session

@pytest.fixture(scope="module")
def test_customer(api_client):
    """Create a test customer for ticket tests"""
    response = api_client.post(f"{BASE_URL}/api/customers", json={
        "name": "TEST_CRM_Customer",
        "customer_code": f"TEST-CRM-{int(time.time())}",
        "contact_person": "Test Contact",
        "email": "test@crmcustomer.com",
        "phone": "9876543210"
    })
    if response.status_code == 201:
        return response.json()
    # If customer exists, try to find it
    list_resp = api_client.get(f"{BASE_URL}/api/customers")
    if list_resp.status_code == 200:
        customers = list_resp.json()
        if isinstance(customers, list):
            for c in customers:
                if isinstance(c, dict) and "TEST_CRM" in c.get("name", ""):
                    return c
    pytest.skip("Could not create or find test customer")

@pytest.fixture(scope="module")
def test_item_with_bom(api_client):
    """Find an existing item with an active BOM for quotation convert-to-SO tests"""
    # Get all BOMs
    bom_resp = api_client.get(f"{BASE_URL}/api/bom")
    if bom_resp.status_code != 200:
        pytest.skip("Could not fetch BOMs")
    
    boms = bom_resp.json()
    if not isinstance(boms, list) or len(boms) == 0:
        pytest.skip("No BOMs found in system")
    
    # Find an active BOM
    active_bom = None
    for b in boms:
        if isinstance(b, dict) and b.get("status") == "active" and b.get("parent_item_id"):
            active_bom = b
            break
    
    if not active_bom:
        # Try any BOM
        for b in boms:
            if isinstance(b, dict) and b.get("parent_item_id"):
                active_bom = b
                break
    
    if not active_bom:
        pytest.skip("No BOM with parent_item_id found")
    
    # Get the item
    items_resp = api_client.get(f"{BASE_URL}/api/items")
    if items_resp.status_code != 200:
        pytest.skip("Could not fetch items")
    
    items = items_resp.json()
    if not isinstance(items, list):
        pytest.skip("Items response is not a list")
    
    item = None
    for it in items:
        if isinstance(it, dict) and it.get("id") == active_bom.get("parent_item_id"):
            item = it
            break
    
    if not item:
        pytest.skip(f"Could not find item with id {active_bom.get('parent_item_id')}")
    
    return {"item": item, "bom": active_bom}


# ============================================================================
# LEADS (Marketing) TESTS
# ============================================================================
class TestLeadsCRUD:
    """Lead CRUD operations and stage transitions"""
    
    def test_create_lead_default_stage_enquiry(self, api_client):
        """POST /api/crm/leads - default stage should be 'enquiry'"""
        response = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_Default_Stage",
            "customer_name": "Test Company ABC"
        })
        assert response.status_code == 201, f"Failed: {response.text}"
        lead = response.json()
        assert lead["stage"] == "enquiry", f"Expected stage 'enquiry', got '{lead['stage']}'"
        assert "lead_no" in lead
        assert lead["name"] == "TEST_Lead_Default_Stage"
        print(f"✓ Created lead {lead['lead_no']} with default stage 'enquiry'")
        return lead
    
    def test_list_leads(self, api_client):
        """GET /api/crm/leads - list all leads"""
        response = api_client.get(f"{BASE_URL}/api/crm/leads")
        assert response.status_code == 200
        leads = response.json()
        assert isinstance(leads, list)
        print(f"✓ Listed {len(leads)} leads")
    
    def test_lead_stage_transition_enquiry_to_quotation(self, api_client):
        """PUT /api/crm/leads/{id} - stage transition enquiry → quotation"""
        # Create a lead first
        create_resp = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_Stage_Transition",
            "customer_name": "Stage Test Company"
        })
        assert create_resp.status_code == 201
        lead = create_resp.json()
        lead_id = lead["id"]
        
        # Update stage to quotation
        update_resp = api_client.put(f"{BASE_URL}/api/crm/leads/{lead_id}", json={
            "stage": "quotation"
        })
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["stage"] == "quotation"
        
        # Verify activity was logged
        assert len(updated.get("activities", [])) >= 2  # creation + stage change
        print(f"✓ Lead stage transitioned: enquiry → quotation")
    
    def test_lead_stage_transition_to_negotiation(self, api_client):
        """PUT /api/crm/leads/{id} - stage transition quotation → negotiation"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_Negotiation",
            "customer_name": "Negotiation Test Co",
            "stage": "quotation"
        })
        assert create_resp.status_code == 201
        lead = create_resp.json()
        
        update_resp = api_client.put(f"{BASE_URL}/api/crm/leads/{lead['id']}", json={
            "stage": "negotiation"
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["stage"] == "negotiation"
        print(f"✓ Lead stage transitioned: quotation → negotiation")
    
    def test_lead_stage_transition_to_won(self, api_client):
        """PUT /api/crm/leads/{id} - stage transition negotiation → won"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_Won",
            "customer_name": "Won Test Co",
            "stage": "negotiation"
        })
        assert create_resp.status_code == 201
        lead = create_resp.json()
        
        update_resp = api_client.put(f"{BASE_URL}/api/crm/leads/{lead['id']}", json={
            "stage": "won"
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["stage"] == "won"
        print(f"✓ Lead stage transitioned: negotiation → won")
    
    def test_lead_stage_transition_to_lost(self, api_client):
        """PUT /api/crm/leads/{id} - stage transition to lost with reason"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_Lost",
            "customer_name": "Lost Test Co",
            "stage": "negotiation"
        })
        assert create_resp.status_code == 201
        lead = create_resp.json()
        
        update_resp = api_client.put(f"{BASE_URL}/api/crm/leads/{lead['id']}", json={
            "stage": "lost",
            "lost_reason": "Price too high"
        })
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["stage"] == "lost"
        print(f"✓ Lead stage transitioned: negotiation → lost")
    
    def test_add_lead_activity(self, api_client):
        """POST /api/crm/leads/{id}/activity - add activity note"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_Activity",
            "customer_name": "Activity Test Co"
        })
        assert create_resp.status_code == 201
        lead = create_resp.json()
        
        activity_resp = api_client.post(f"{BASE_URL}/api/crm/leads/{lead['id']}/activity", json={
            "note": "Called customer, discussed requirements"
        })
        assert activity_resp.status_code == 200
        updated = activity_resp.json()
        activities = updated.get("activities", [])
        assert any("Called customer" in a.get("note", "") for a in activities)
        print(f"✓ Activity added to lead")
    
    def test_convert_lead_to_customer(self, api_client):
        """POST /api/crm/leads/{id}/convert-to-customer - create customer from lead"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_Convert",
            "customer_name": "Convert Test Co",
            "contact_person": "John Doe",
            "email": "john@converttest.com",
            "phone": "1234567890",
            "stage": "won"
        })
        assert create_resp.status_code == 201
        lead = create_resp.json()
        
        convert_resp = api_client.post(f"{BASE_URL}/api/crm/leads/{lead['id']}/convert-to-customer", json={
            "gstin": "29ABCDE1234F1Z5",
            "address": "123 Test Street"
        })
        assert convert_resp.status_code == 200, f"Convert failed: {convert_resp.text}"
        result = convert_resp.json()
        assert "customer" in result
        assert result["customer"]["name"] == "Convert Test Co"
        assert result["lead"]["customer_id"] == result["customer"]["id"]
        print(f"✓ Lead converted to customer: {result['customer'].get('code', result['customer'].get('customer_code'))}")
    
    def test_delete_lead(self, api_client):
        """DELETE /api/crm/leads/{id} - delete a lead"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_Delete",
            "customer_name": "Delete Test Co"
        })
        assert create_resp.status_code == 201
        lead = create_resp.json()
        
        delete_resp = api_client.delete(f"{BASE_URL}/api/crm/leads/{lead['id']}")
        assert delete_resp.status_code == 200
        
        # Verify deletion
        get_resp = api_client.get(f"{BASE_URL}/api/crm/leads")
        leads = get_resp.json()
        assert not any(l["id"] == lead["id"] for l in leads)
        print(f"✓ Lead deleted successfully")


# ============================================================================
# TICKETS (Support) TESTS
# ============================================================================
class TestTicketsCRUD:
    """Ticket CRUD operations, stage transitions, and SLA computation"""
    
    def test_create_ticket_default_stage_complaint(self, api_client, test_customer):
        """POST /api/crm/tickets - default stage should be 'complaint'"""
        response = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_Default_Stage",
            "customer_id": test_customer["id"],
            "description": "Test ticket description"
        })
        assert response.status_code == 201, f"Failed: {response.text}"
        ticket = response.json()
        assert ticket["stage"] == "complaint", f"Expected stage 'complaint', got '{ticket['stage']}'"
        assert "ticket_no" in ticket
        print(f"✓ Created ticket {ticket['ticket_no']} with default stage 'complaint'")
        return ticket
    
    def test_list_tickets(self, api_client):
        """GET /api/crm/tickets - list all tickets"""
        response = api_client.get(f"{BASE_URL}/api/crm/tickets")
        assert response.status_code == 200
        tickets = response.json()
        assert isinstance(tickets, list)
        print(f"✓ Listed {len(tickets)} tickets")
    
    def test_ticket_stage_transition_complaint_to_open(self, api_client, test_customer):
        """PUT /api/crm/tickets/{id} - stage transition complaint → open"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_Open",
            "customer_id": test_customer["id"]
        })
        assert create_resp.status_code == 201
        ticket = create_resp.json()
        
        update_resp = api_client.put(f"{BASE_URL}/api/crm/tickets/{ticket['id']}", json={
            "stage": "open"
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["stage"] == "open"
        print(f"✓ Ticket stage transitioned: complaint → open")
    
    def test_ticket_stage_transition_to_in_progress(self, api_client, test_customer):
        """PUT /api/crm/tickets/{id} - stage transition open → in_progress"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_InProgress",
            "customer_id": test_customer["id"],
            "stage": "open"
        })
        assert create_resp.status_code == 201
        ticket = create_resp.json()
        
        update_resp = api_client.put(f"{BASE_URL}/api/crm/tickets/{ticket['id']}", json={
            "stage": "in_progress"
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["stage"] == "in_progress"
        print(f"✓ Ticket stage transitioned: open → in_progress")
    
    def test_ticket_stage_transition_to_pending(self, api_client, test_customer):
        """PUT /api/crm/tickets/{id} - stage transition in_progress → pending"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_Pending",
            "customer_id": test_customer["id"],
            "stage": "in_progress"
        })
        assert create_resp.status_code == 201
        ticket = create_resp.json()
        
        update_resp = api_client.put(f"{BASE_URL}/api/crm/tickets/{ticket['id']}", json={
            "stage": "pending"
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["stage"] == "pending"
        print(f"✓ Ticket stage transitioned: in_progress → pending")
    
    def test_ticket_stage_transition_to_closed(self, api_client, test_customer):
        """PUT /api/crm/tickets/{id} - stage transition in_progress → closed"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_Closed",
            "customer_id": test_customer["id"],
            "stage": "in_progress"
        })
        assert create_resp.status_code == 201
        ticket = create_resp.json()
        
        update_resp = api_client.put(f"{BASE_URL}/api/crm/tickets/{ticket['id']}", json={
            "stage": "closed",
            "resolution": "Issue resolved by replacing part"
        })
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["stage"] == "closed"
        print(f"✓ Ticket stage transitioned: in_progress → closed")
    
    def test_ticket_sla_computation_urgent(self, api_client, test_customer):
        """Verify SLA computation for urgent priority (2 hours)"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_SLA_Urgent",
            "customer_id": test_customer["id"],
            "priority": "urgent"
        })
        assert create_resp.status_code == 201
        ticket = create_resp.json()
        
        assert "sla_due" in ticket
        assert ticket["sla_due"] is not None
        # SLA for urgent should be 2 hours from creation
        created_at = datetime.fromisoformat(ticket["created_at"].replace("Z", "+00:00"))
        sla_due = datetime.fromisoformat(ticket["sla_due"].replace("Z", "+00:00"))
        diff_hours = (sla_due - created_at).total_seconds() / 3600
        assert 1.9 <= diff_hours <= 2.1, f"Expected ~2 hours SLA, got {diff_hours}"
        print(f"✓ Urgent ticket SLA computed correctly: {diff_hours:.1f} hours")
    
    def test_ticket_sla_computation_high(self, api_client, test_customer):
        """Verify SLA computation for high priority (8 hours)"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_SLA_High",
            "customer_id": test_customer["id"],
            "priority": "high"
        })
        assert create_resp.status_code == 201
        ticket = create_resp.json()
        
        created_at = datetime.fromisoformat(ticket["created_at"].replace("Z", "+00:00"))
        sla_due = datetime.fromisoformat(ticket["sla_due"].replace("Z", "+00:00"))
        diff_hours = (sla_due - created_at).total_seconds() / 3600
        assert 7.9 <= diff_hours <= 8.1, f"Expected ~8 hours SLA, got {diff_hours}"
        print(f"✓ High priority ticket SLA computed correctly: {diff_hours:.1f} hours")
    
    def test_ticket_sla_computation_medium(self, api_client, test_customer):
        """Verify SLA computation for medium priority (24 hours)"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_SLA_Medium",
            "customer_id": test_customer["id"],
            "priority": "medium"
        })
        assert create_resp.status_code == 201
        ticket = create_resp.json()
        
        created_at = datetime.fromisoformat(ticket["created_at"].replace("Z", "+00:00"))
        sla_due = datetime.fromisoformat(ticket["sla_due"].replace("Z", "+00:00"))
        diff_hours = (sla_due - created_at).total_seconds() / 3600
        assert 23.9 <= diff_hours <= 24.1, f"Expected ~24 hours SLA, got {diff_hours}"
        print(f"✓ Medium priority ticket SLA computed correctly: {diff_hours:.1f} hours")
    
    def test_ticket_sla_computation_low(self, api_client, test_customer):
        """Verify SLA computation for low priority (72 hours)"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_SLA_Low",
            "customer_id": test_customer["id"],
            "priority": "low"
        })
        assert create_resp.status_code == 201
        ticket = create_resp.json()
        
        created_at = datetime.fromisoformat(ticket["created_at"].replace("Z", "+00:00"))
        sla_due = datetime.fromisoformat(ticket["sla_due"].replace("Z", "+00:00"))
        diff_hours = (sla_due - created_at).total_seconds() / 3600
        assert 71.9 <= diff_hours <= 72.1, f"Expected ~72 hours SLA, got {diff_hours}"
        print(f"✓ Low priority ticket SLA computed correctly: {diff_hours:.1f} hours")
    
    def test_delete_ticket(self, api_client, test_customer):
        """DELETE /api/crm/tickets/{id} - delete a ticket"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/tickets", json={
            "subject": "TEST_Ticket_Delete",
            "customer_id": test_customer["id"]
        })
        assert create_resp.status_code == 201
        ticket = create_resp.json()
        
        delete_resp = api_client.delete(f"{BASE_URL}/api/crm/tickets/{ticket['id']}")
        assert delete_resp.status_code == 200
        print(f"✓ Ticket deleted successfully")


# ============================================================================
# QUOTATIONS TESTS
# ============================================================================
class TestQuotationsCRUD:
    """Quotation CRUD operations, totals computation, and convert-to-SO"""
    
    def test_create_quotation_with_lines(self, api_client):
        """POST /api/crm/quotations - create with lines, verify totals"""
        response = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_name": "TEST_Quotation_Customer",
            "contact_person": "Test Contact",
            "email": "test@quotation.com",
            "lines": [
                {"description": "Item A", "quantity": 10, "rate": 100, "gst_rate": 18},
                {"description": "Item B", "quantity": 5, "rate": 200, "gst_rate": 18}
            ]
        })
        assert response.status_code == 201, f"Failed: {response.text}"
        quotation = response.json()
        
        # Verify totals
        # Line A: 10 * 100 = 1000
        # Line B: 5 * 200 = 1000
        # Subtotal: 2000
        # GST: 2000 * 18% = 360
        # Grand Total: 2360
        assert quotation["subtotal"] == 2000, f"Expected subtotal 2000, got {quotation['subtotal']}"
        assert quotation["total_gst"] == 360, f"Expected GST 360, got {quotation['total_gst']}"
        assert quotation["grand_total"] == 2360, f"Expected grand total 2360, got {quotation['grand_total']}"
        assert quotation["status"] == "draft"
        print(f"✓ Created quotation {quotation['quotation_no']} with correct totals")
        return quotation
    
    def test_list_quotations(self, api_client):
        """GET /api/crm/quotations - list all quotations"""
        response = api_client.get(f"{BASE_URL}/api/crm/quotations")
        assert response.status_code == 200
        quotations = response.json()
        assert isinstance(quotations, list)
        print(f"✓ Listed {len(quotations)} quotations")
    
    def test_update_quotation_recomputes_totals(self, api_client):
        """PUT /api/crm/quotations/{id} - update lines, verify totals recomputed"""
        # Create quotation
        create_resp = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_name": "TEST_Quotation_Update",
            "lines": [{"description": "Item X", "quantity": 1, "rate": 100, "gst_rate": 18}]
        })
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        
        # Update with new lines
        update_resp = api_client.put(f"{BASE_URL}/api/crm/quotations/{quotation['id']}", json={
            "lines": [
                {"description": "Item X", "quantity": 2, "rate": 500, "gst_rate": 18},
                {"description": "Item Y", "quantity": 3, "rate": 300, "gst_rate": 12}
            ]
        })
        assert update_resp.status_code == 200
        updated = update_resp.json()
        
        # Line X: 2 * 500 = 1000
        # Line Y: 3 * 300 = 900
        # Subtotal: 1900
        # GST: 1000 * 18% + 900 * 12% = 180 + 108 = 288
        # Grand Total: 2188
        assert updated["subtotal"] == 1900
        assert updated["total_gst"] == 288
        assert updated["grand_total"] == 2188
        print(f"✓ Quotation updated with recomputed totals")
    
    def test_quotation_status_change(self, api_client):
        """PUT /api/crm/quotations/{id} - change status"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_name": "TEST_Quotation_Status",
            "lines": [{"description": "Item", "quantity": 1, "rate": 100, "gst_rate": 18}]
        })
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        
        # Change to sent
        update_resp = api_client.put(f"{BASE_URL}/api/crm/quotations/{quotation['id']}", json={
            "status": "sent"
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["status"] == "sent"
        
        # Change to accepted
        update_resp = api_client.put(f"{BASE_URL}/api/crm/quotations/{quotation['id']}", json={
            "status": "accepted"
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["status"] == "accepted"
        print(f"✓ Quotation status changed: draft → sent → accepted")
    
    def test_create_quotation_with_lead_auto_updates_lead_stage(self, api_client):
        """Creating quotation with lead_id should auto-move lead to 'quotation' stage"""
        # Create a lead in enquiry stage
        lead_resp = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_For_Quotation",
            "customer_name": "Lead Quotation Test Co",
            "stage": "enquiry"
        })
        assert lead_resp.status_code == 201
        lead = lead_resp.json()
        assert lead["stage"] == "enquiry"
        
        # Create quotation linked to this lead
        quo_resp = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "lead_id": lead["id"],
            "customer_name": lead["customer_name"],
            "lines": [{"description": "Test Item", "quantity": 1, "rate": 1000, "gst_rate": 18}]
        })
        assert quo_resp.status_code == 201
        quotation = quo_resp.json()
        
        # Verify lead stage was updated to 'quotation'
        lead_check = api_client.get(f"{BASE_URL}/api/crm/leads")
        leads = lead_check.json()
        updated_lead = next((l for l in leads if l["id"] == lead["id"]), None)
        assert updated_lead is not None
        assert updated_lead["stage"] == "quotation", f"Expected lead stage 'quotation', got '{updated_lead['stage']}'"
        
        # Verify activity was added
        assert any("Quotation" in a.get("note", "") for a in updated_lead.get("activities", []))
        print(f"✓ Creating quotation auto-updated lead stage to 'quotation' and added activity")
    
    def test_delete_quotation(self, api_client):
        """DELETE /api/crm/quotations/{id} - delete a quotation"""
        create_resp = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_name": "TEST_Quotation_Delete",
            "lines": [{"description": "Item", "quantity": 1, "rate": 100, "gst_rate": 18}]
        })
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        
        delete_resp = api_client.delete(f"{BASE_URL}/api/crm/quotations/{quotation['id']}")
        assert delete_resp.status_code == 200
        print(f"✓ Quotation deleted successfully")
    
    def test_convert_quotation_to_so_requires_bom(self, api_client):
        """POST /api/crm/quotations/{id}/convert-to-so - should fail without BOM"""
        # Create quotation with free-text line (no item_id)
        create_resp = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_name": "TEST_Quotation_NoBOM",
            "lines": [{"description": "Free text item", "quantity": 1, "rate": 100, "gst_rate": 18}]
        })
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        
        # Try to convert - should fail
        convert_resp = api_client.post(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/convert-to-so", json={})
        assert convert_resp.status_code == 400
        assert "item" in convert_resp.json().get("detail", "").lower() or "bom" in convert_resp.json().get("detail", "").lower()
        print(f"✓ Convert-to-SO correctly rejected quotation without item/BOM")
    
    def test_convert_quotation_to_so_success(self, api_client, test_item_with_bom):
        """POST /api/crm/quotations/{id}/convert-to-so - successful conversion"""
        item = test_item_with_bom["item"]
        
        # Create quotation with item that has BOM
        create_resp = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_name": "TEST_Quotation_ConvertSO",
            "lines": [{
                "item_id": item["id"],
                "description": item["name"],
                "quantity": 5,
                "rate": item.get("sale_price", 1000),
                "gst_rate": 18
            }]
        })
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        
        # Convert to SO
        convert_resp = api_client.post(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/convert-to-so", json={
            "order_type": "auto"
        })
        assert convert_resp.status_code == 200, f"Convert failed: {convert_resp.text}"
        result = convert_resp.json()
        
        assert "sales_order" in result
        assert "quotation" in result
        assert result["quotation"]["status"] == "converted"
        assert result["quotation"]["converted_so_id"] == result["sales_order"]["id"]
        assert result["quotation"]["converted_so_no"] == result["sales_order"]["order_number"]
        print(f"✓ Quotation converted to SO: {result['sales_order']['order_number']}")
    
    def test_converted_quotation_cannot_be_edited(self, api_client, test_item_with_bom):
        """Converted quotation should not be editable"""
        item = test_item_with_bom["item"]
        
        # Create and convert quotation
        create_resp = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_name": "TEST_Quotation_Locked",
            "lines": [{
                "item_id": item["id"],
                "description": item["name"],
                "quantity": 2,
                "rate": 500,
                "gst_rate": 18
            }]
        })
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        
        convert_resp = api_client.post(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/convert-to-so", json={})
        assert convert_resp.status_code == 200
        
        # Try to edit - should fail
        edit_resp = api_client.put(f"{BASE_URL}/api/crm/quotations/{quotation['id']}", json={
            "customer_name": "Changed Name"
        })
        assert edit_resp.status_code == 400
        assert "converted" in edit_resp.json().get("detail", "").lower()
        print(f"✓ Converted quotation correctly blocked from editing")
    
    def test_converted_quotation_cannot_be_deleted(self, api_client, test_item_with_bom):
        """Converted quotation should not be deletable"""
        item = test_item_with_bom["item"]
        
        # Create and convert quotation
        create_resp = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "customer_name": "TEST_Quotation_NoDelete",
            "lines": [{
                "item_id": item["id"],
                "description": item["name"],
                "quantity": 1,
                "rate": 100,
                "gst_rate": 18
            }]
        })
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        
        convert_resp = api_client.post(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/convert-to-so", json={})
        assert convert_resp.status_code == 200
        
        # Try to delete - should fail
        delete_resp = api_client.delete(f"{BASE_URL}/api/crm/quotations/{quotation['id']}")
        assert delete_resp.status_code == 400
        assert "converted" in delete_resp.json().get("detail", "").lower()
        print(f"✓ Converted quotation correctly blocked from deletion")
    
    def test_convert_quotation_updates_linked_lead_to_won(self, api_client, test_item_with_bom):
        """Converting quotation should move linked lead to 'won' stage"""
        item = test_item_with_bom["item"]
        
        # Create a lead
        lead_resp = api_client.post(f"{BASE_URL}/api/crm/leads", json={
            "name": "TEST_Lead_ConvertWon",
            "customer_name": "Convert Won Test Co",
            "stage": "negotiation"
        })
        assert lead_resp.status_code == 201
        lead = lead_resp.json()
        
        # Create quotation linked to lead
        quo_resp = api_client.post(f"{BASE_URL}/api/crm/quotations", json={
            "lead_id": lead["id"],
            "customer_name": lead["customer_name"],
            "lines": [{
                "item_id": item["id"],
                "description": item["name"],
                "quantity": 3,
                "rate": 1000,
                "gst_rate": 18
            }]
        })
        assert quo_resp.status_code == 201
        quotation = quo_resp.json()
        
        # Convert to SO
        convert_resp = api_client.post(f"{BASE_URL}/api/crm/quotations/{quotation['id']}/convert-to-so", json={})
        assert convert_resp.status_code == 200
        
        # Verify lead is now 'won'
        leads_resp = api_client.get(f"{BASE_URL}/api/crm/leads")
        leads = leads_resp.json()
        updated_lead = next((l for l in leads if l["id"] == lead["id"]), None)
        assert updated_lead is not None
        assert updated_lead["stage"] == "won", f"Expected lead stage 'won', got '{updated_lead['stage']}'"
        print(f"✓ Converting quotation to SO auto-updated linked lead to 'won'")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
