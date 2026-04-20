"""
Test CRM Restructure Features - Iteration 67
Tests:
1. Pipeline config endpoints (marketing/support) - GET, PUT, reset
2. Lead creation requires customer_id (no free-text customer_name)
3. Ticket creation with product_ids (multi-select items)
4. Activities endpoint with type filter
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Get authenticated session with cookies"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    # Cookies are automatically stored in session
    return session

@pytest.fixture(scope="module")
def test_customer(auth_session):
    """Create a test customer for lead/ticket tests"""
    unique_id = str(uuid.uuid4())[:8]
    payload = {
        "name": f"TEST_CRM_Customer_{unique_id}",
        "code": f"TEST-CUST-{unique_id}",
        "address": "123 Test Street, Test City",
        "email": f"test_{unique_id}@example.com",
        "phone": "1234567890"
    }
    response = auth_session.post(f"{BASE_URL}/api/customers", json=payload)
    assert response.status_code == 201, f"Failed to create customer: {response.text}"
    customer = response.json()
    yield customer
    # Cleanup
    auth_session.delete(f"{BASE_URL}/api/customers/{customer['id']}")

@pytest.fixture(scope="module")
def test_items(auth_session):
    """Create test items for ticket product_ids tests"""
    items = []
    for i in range(2):
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "part_number": f"TEST-ITEM-{unique_id}",
            "name": f"Test Item {unique_id}",
            "uom": "Nos",
            "item_type": "finished_good",
            "category": "Test Category"
        }
        response = auth_session.post(f"{BASE_URL}/api/items", json=payload)
        if response.status_code == 201:
            items.append(response.json())
    yield items
    # Cleanup
    for item in items:
        auth_session.delete(f"{BASE_URL}/api/items/{item['id']}")


class TestPipelineConfigMarketing:
    """Test marketing pipeline configuration endpoints"""
    
    def test_get_marketing_pipeline_config_defaults(self, auth_session):
        """GET /api/crm/pipeline-config/marketing returns default stages"""
        response = auth_session.get(f"{BASE_URL}/api/crm/pipeline-config/marketing")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["pipeline_type"] == "marketing"
        assert "stages" in data
        stages = data["stages"]
        # Default marketing stages: enquiry, quotation, negotiation, won, lost
        stage_keys = [s["key"] for s in stages]
        assert "enquiry" in stage_keys, "Missing 'enquiry' stage"
        assert "quotation" in stage_keys, "Missing 'quotation' stage"
        assert "negotiation" in stage_keys, "Missing 'negotiation' stage"
        assert "won" in stage_keys, "Missing 'won' stage"
        assert "lost" in stage_keys, "Missing 'lost' stage"
        print(f"Marketing pipeline has {len(stages)} stages: {stage_keys}")
    
    def test_update_marketing_pipeline_config(self, auth_session):
        """PUT /api/crm/pipeline-config/marketing with custom stages"""
        custom_stages = [
            {"key": "new_lead", "label": "New Lead", "color": "bg-[#E1EFFE] text-[#1E429F]", "order": 1},
            {"key": "qualified", "label": "Qualified", "color": "bg-[#FEF3C7] text-[#92400E]", "order": 2},
            {"key": "proposal", "label": "Proposal", "color": "bg-[#FCE7F3] text-[#9D174D]", "order": 3},
            {"key": "closed_won", "label": "Closed Won", "color": "bg-[#DEF7EC] text-[#03543F]", "order": 4},
        ]
        response = auth_session.put(
            f"{BASE_URL}/api/crm/pipeline-config/marketing",
            json={"stages": custom_stages}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert len(data["stages"]) == 4
        
        # Verify GET returns the same custom stages
        get_response = auth_session.get(f"{BASE_URL}/api/crm/pipeline-config/marketing")
        assert get_response.status_code == 200
        get_data = get_response.json()
        stage_keys = [s["key"] for s in get_data["stages"]]
        assert "new_lead" in stage_keys
        assert "qualified" in stage_keys
        print("Custom marketing stages saved and verified")
    
    def test_reset_marketing_pipeline_config(self, auth_session):
        """POST /api/crm/pipeline-config/marketing/reset restores defaults"""
        response = auth_session.post(f"{BASE_URL}/api/crm/pipeline-config/marketing/reset")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        stage_keys = [s["key"] for s in data["stages"]]
        # Should be back to defaults
        assert "enquiry" in stage_keys, "Reset should restore 'enquiry'"
        assert "quotation" in stage_keys, "Reset should restore 'quotation'"
        print("Marketing pipeline reset to defaults")


class TestPipelineConfigSupport:
    """Test support pipeline configuration endpoints"""
    
    def test_get_support_pipeline_config_defaults(self, auth_session):
        """GET /api/crm/pipeline-config/support returns default stages"""
        response = auth_session.get(f"{BASE_URL}/api/crm/pipeline-config/support")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["pipeline_type"] == "support"
        stages = data["stages"]
        stage_keys = [s["key"] for s in stages]
        # Default support stages: complaint, open, in_progress, pending, closed
        assert "complaint" in stage_keys, "Missing 'complaint' stage"
        assert "open" in stage_keys, "Missing 'open' stage"
        assert "in_progress" in stage_keys, "Missing 'in_progress' stage"
        assert "pending" in stage_keys, "Missing 'pending' stage"
        assert "closed" in stage_keys, "Missing 'closed' stage"
        print(f"Support pipeline has {len(stages)} stages: {stage_keys}")
    
    def test_update_support_pipeline_config(self, auth_session):
        """PUT /api/crm/pipeline-config/support with custom stages"""
        custom_stages = [
            {"key": "new_ticket", "label": "New Ticket", "color": "bg-[#E1EFFE] text-[#1E429F]", "order": 1},
            {"key": "investigating", "label": "Investigating", "color": "bg-[#FEF3C7] text-[#92400E]", "order": 2},
            {"key": "resolved", "label": "Resolved", "color": "bg-[#DEF7EC] text-[#03543F]", "order": 3},
        ]
        response = auth_session.put(
            f"{BASE_URL}/api/crm/pipeline-config/support",
            json={"stages": custom_stages}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify GET returns custom stages
        get_response = auth_session.get(f"{BASE_URL}/api/crm/pipeline-config/support")
        assert get_response.status_code == 200
        stage_keys = [s["key"] for s in get_response.json()["stages"]]
        assert "new_ticket" in stage_keys
        print("Custom support stages saved and verified")
    
    def test_reset_support_pipeline_config(self, auth_session):
        """POST /api/crm/pipeline-config/support/reset restores defaults"""
        response = auth_session.post(f"{BASE_URL}/api/crm/pipeline-config/support/reset")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        stage_keys = [s["key"] for s in data["stages"]]
        assert "complaint" in stage_keys, "Reset should restore 'complaint'"
        assert "open" in stage_keys, "Reset should restore 'open'"
        print("Support pipeline reset to defaults")


class TestLeadCreationRequiresCustomerId:
    """Test that lead creation now requires customer_id"""
    
    def test_create_lead_without_customer_id_fails(self, auth_session):
        """POST /api/crm/leads without customer_id should fail validation"""
        payload = {
            "name": "Test Lead Without Customer",
            "source": "website",
            "estimated_value": 10000
        }
        response = auth_session.post(f"{BASE_URL}/api/crm/leads", json=payload)
        # Should fail with 422 (validation error) since customer_id is required
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("Lead creation without customer_id correctly rejected with 422")
    
    def test_create_lead_with_invalid_customer_id_fails(self, auth_session):
        """POST /api/crm/leads with non-existent customer_id should fail"""
        payload = {
            "name": "Test Lead Invalid Customer",
            "customer_id": "non-existent-customer-id-12345",
            "source": "website"
        }
        response = auth_session.post(f"{BASE_URL}/api/crm/leads", json=payload)
        # Should fail with 404 (customer not found)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Lead creation with invalid customer_id correctly rejected with 404")
    
    def test_create_lead_with_valid_customer_id_succeeds(self, auth_session, test_customer):
        """POST /api/crm/leads with valid customer_id succeeds"""
        payload = {
            "name": "Test Lead With Valid Customer",
            "customer_id": test_customer["id"],
            "source": "website",
            "estimated_value": 50000,
            "stage": "enquiry"
        }
        response = auth_session.post(f"{BASE_URL}/api/crm/leads", json=payload)
        assert response.status_code == 201, f"Failed: {response.text}"
        lead = response.json()
        assert lead["customer_id"] == test_customer["id"]
        # customer_name should be auto-populated from customer record
        assert lead["customer_name"] == test_customer["name"], "customer_name should be auto-populated"
        print(f"Lead created with customer_id, customer_name auto-populated: {lead['customer_name']}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/leads/{lead['id']}")


class TestTicketWithProductIds:
    """Test ticket creation with product_ids (multi-select items)"""
    
    def test_create_ticket_with_product_ids(self, auth_session, test_customer, test_items):
        """POST /api/crm/tickets with product_ids saves and hydrates products"""
        if len(test_items) < 2:
            pytest.skip("Need at least 2 test items")
        
        product_ids = [item["id"] for item in test_items]
        payload = {
            "subject": "Test Ticket with Products",
            "customer_id": test_customer["id"],
            "description": "Testing multi-product selection",
            "priority": "high",
            "product_ids": product_ids,
            "stage": "complaint"
        }
        response = auth_session.post(f"{BASE_URL}/api/crm/tickets", json=payload)
        assert response.status_code == 201, f"Failed: {response.text}"
        ticket = response.json()
        
        # Verify product_ids saved
        assert "product_ids" in ticket
        assert set(ticket["product_ids"]) == set(product_ids)
        
        # Verify products array is hydrated
        assert "products" in ticket, "Ticket should have hydrated 'products' array"
        assert len(ticket["products"]) == len(product_ids)
        for prod in ticket["products"]:
            assert "id" in prod
            assert "part_number" in prod
            assert "name" in prod
            # uom may be None if not set on item, but field should be present in projection
        print(f"Ticket created with {len(ticket['products'])} products hydrated")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tickets/{ticket['id']}")
    
    def test_get_ticket_hydrates_products(self, auth_session, test_customer, test_items):
        """GET /api/crm/tickets hydrates products array"""
        if len(test_items) < 1:
            pytest.skip("Need at least 1 test item")
        
        product_ids = [test_items[0]["id"]]
        payload = {
            "subject": "Test Ticket for GET hydration",
            "customer_id": test_customer["id"],
            "product_ids": product_ids
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/tickets", json=payload)
        assert create_response.status_code == 201
        ticket_id = create_response.json()["id"]
        
        # GET all tickets and find ours
        get_response = auth_session.get(f"{BASE_URL}/api/crm/tickets")
        assert get_response.status_code == 200
        tickets = get_response.json()
        our_ticket = next((t for t in tickets if t["id"] == ticket_id), None)
        assert our_ticket is not None
        assert "products" in our_ticket
        assert len(our_ticket["products"]) == 1
        assert our_ticket["products"][0]["id"] == test_items[0]["id"]
        print("GET /api/crm/tickets correctly hydrates products array")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/tickets/{ticket_id}")


class TestActivitiesEndpoint:
    """Test /api/crm/activities endpoint with type filter"""
    
    def test_get_all_activities(self, auth_session):
        """GET /api/crm/activities returns activities from leads and tickets"""
        response = auth_session.get(f"{BASE_URL}/api/crm/activities")
        assert response.status_code == 200, f"Failed: {response.text}"
        activities = response.json()
        assert isinstance(activities, list)
        # Check structure if there are activities
        if len(activities) > 0:
            a = activities[0]
            assert "source_type" in a, "Activity should have source_type"
            assert "entity_no" in a, "Activity should have entity_no"
            assert "entity_title" in a, "Activity should have entity_title"
            assert "customer_name" in a, "Activity should have customer_name"
            assert "note" in a, "Activity should have note"
            assert "author_name" in a, "Activity should have author_name"
            assert "created_at" in a, "Activity should have created_at"
        print(f"GET /api/crm/activities returned {len(activities)} activities")
    
    def test_get_support_activities_only(self, auth_session):
        """GET /api/crm/activities?type=support returns only ticket activities"""
        response = auth_session.get(f"{BASE_URL}/api/crm/activities?type=support")
        assert response.status_code == 200, f"Failed: {response.text}"
        activities = response.json()
        # All activities should be from tickets
        for a in activities:
            assert a["source_type"] == "ticket", f"Expected ticket, got {a['source_type']}"
        print(f"GET /api/crm/activities?type=support returned {len(activities)} ticket activities")
    
    def test_get_marketing_activities_only(self, auth_session):
        """GET /api/crm/activities?type=marketing returns only lead activities"""
        response = auth_session.get(f"{BASE_URL}/api/crm/activities?type=marketing")
        assert response.status_code == 200, f"Failed: {response.text}"
        activities = response.json()
        # All activities should be from leads
        for a in activities:
            assert a["source_type"] == "lead", f"Expected lead, got {a['source_type']}"
        print(f"GET /api/crm/activities?type=marketing returned {len(activities)} lead activities")


class TestPipelineConfigValidation:
    """Test pipeline config validation rules"""
    
    def test_invalid_pipeline_type_rejected(self, auth_session):
        """GET /api/crm/pipeline-config/invalid returns 400"""
        response = auth_session.get(f"{BASE_URL}/api/crm/pipeline-config/invalid")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Invalid pipeline type correctly rejected")
    
    def test_empty_stages_rejected(self, auth_session):
        """PUT with empty stages array should fail"""
        response = auth_session.put(
            f"{BASE_URL}/api/crm/pipeline-config/marketing",
            json={"stages": []}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Empty stages array correctly rejected")
        
        # Reset to defaults
        auth_session.post(f"{BASE_URL}/api/crm/pipeline-config/marketing/reset")
    
    def test_duplicate_stage_keys_rejected(self, auth_session):
        """PUT with duplicate stage keys should fail"""
        duplicate_stages = [
            {"key": "stage1", "label": "Stage 1", "order": 1},
            {"key": "stage1", "label": "Stage 1 Duplicate", "order": 2},
        ]
        response = auth_session.put(
            f"{BASE_URL}/api/crm/pipeline-config/marketing",
            json={"stages": duplicate_stages}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Duplicate stage keys correctly rejected")
        
        # Reset to defaults
        auth_session.post(f"{BASE_URL}/api/crm/pipeline-config/marketing/reset")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
