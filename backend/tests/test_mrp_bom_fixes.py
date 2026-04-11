"""
Test MRP Demand Calculation and BOM Creation Fixes
- MRP demand calculation should include ALL BOM levels (recursive)
- BOM creation should allow component category items as parent
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMRPDemandCalculation:
    """Tests for MRP demand calculation with recursive BOM explosion"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        """Setup for each test"""
        self.client = api_client
        self.token = auth_token
    
    def test_mrp_demand_returns_all_bom_levels(self, api_client, auth_token):
        """MRP demand should include items from ALL BOM levels, not just top-level"""
        response = api_client.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand_items = response.json()
        part_numbers = [d['item']['part_number'] for d in demand_items]
        
        # FG-001 BOM has 5 direct components: RM-001, SA-001, CP-002, CP-003, SA-002
        # SA-001 BOM has 3 components: RM-002, RM-003, CP-001
        # Total unique items should be 8 (SA-001 is both a component and has its own BOM)
        
        # Verify top-level components are present
        assert 'RM-001' in part_numbers, "RM-001 (top-level) should be in demand"
        assert 'SA-001' in part_numbers, "SA-001 (top-level) should be in demand"
        assert 'CP-002' in part_numbers, "CP-002 (top-level) should be in demand"
        assert 'CP-003' in part_numbers, "CP-003 (top-level) should be in demand"
        assert 'SA-002' in part_numbers, "SA-002 (top-level) should be in demand"
        
        # Verify child items from SA-001 BOM are also present (recursive explosion)
        assert 'RM-002' in part_numbers, "RM-002 (child of SA-001) should be in demand - recursive fix"
        assert 'RM-003' in part_numbers, "RM-003 (child of SA-001) should be in demand - recursive fix"
        assert 'CP-001' in part_numbers, "CP-001 (child of SA-001) should be in demand - recursive fix"
        
        print(f"MRP demand includes {len(demand_items)} items from all BOM levels")
        print(f"Part numbers: {part_numbers}")
    
    def test_mrp_demand_calculates_correct_quantities(self, api_client, auth_token):
        """Verify demand quantities are calculated correctly with recursive explosion"""
        response = api_client.get(f"{BASE_URL}/api/mrp/demand")
        assert response.status_code == 200
        
        demand_items = response.json()
        demand_by_part = {d['item']['part_number']: d for d in demand_items}
        
        # Production order is for 2 units of FG-001
        # SA-001 needs 2 per FG-001, so 4 total
        # SA-001's children need: RM-002 (2 per SA-001 = 8), RM-003 (1 per SA-001 = 4), CP-001 (1 per SA-001 = 4)
        
        if 'SA-001' in demand_by_part:
            sa001_demand = demand_by_part['SA-001']
            assert sa001_demand['gross_requirement'] == 4, f"SA-001 should need 4 (2 per FG-001 * 2 orders), got {sa001_demand['gross_requirement']}"
        
        if 'RM-002' in demand_by_part:
            rm002_demand = demand_by_part['RM-002']
            # 2 per SA-001 * 4 SA-001 needed = 8
            assert rm002_demand['gross_requirement'] == 8, f"RM-002 should need 8 (2 per SA-001 * 4), got {rm002_demand['gross_requirement']}"
        
        if 'RM-003' in demand_by_part:
            rm003_demand = demand_by_part['RM-003']
            # 1 per SA-001 * 4 SA-001 needed = 4
            assert rm003_demand['gross_requirement'] == 4, f"RM-003 should need 4 (1 per SA-001 * 4), got {rm003_demand['gross_requirement']}"
        
        if 'CP-001' in demand_by_part:
            cp001_demand = demand_by_part['CP-001']
            # 1 per SA-001 * 4 SA-001 needed = 4
            assert cp001_demand['gross_requirement'] == 4, f"CP-001 should need 4 (1 per SA-001 * 4), got {cp001_demand['gross_requirement']}"
        
        print("MRP demand quantities calculated correctly with recursive explosion")
    
    def test_mrp_suggestions_include_recursive_demand(self, api_client, auth_token):
        """MRP suggestions should include items from recursive demand calculation"""
        response = api_client.get(f"{BASE_URL}/api/mrp/suggestions")
        assert response.status_code == 200
        
        suggestions = response.json()
        assert isinstance(suggestions, list)
        
        # Suggestions should include items that need reordering based on recursive demand
        suggestion_parts = [s['item']['part_number'] for s in suggestions]
        print(f"MRP suggestions include: {suggestion_parts}")
        
        # At minimum, items below reorder point should be suggested
        assert len(suggestions) > 0, "Should have at least some purchase suggestions"


class TestBOMCreationWithComponent:
    """Tests for BOM creation allowing component category as parent"""
    
    def test_bom_parent_item_dropdown_includes_components(self, api_client, auth_token):
        """Verify items API returns component category items that can be BOM parents"""
        response = api_client.get(f"{BASE_URL}/api/items")
        assert response.status_code == 200
        
        items = response.json()
        component_items = [i for i in items if i['category'] == 'component']
        
        # Should have CP-001, CP-002, CP-003
        component_parts = [i['part_number'] for i in component_items]
        assert 'CP-001' in component_parts, "CP-001 should be available as component"
        assert 'CP-002' in component_parts, "CP-002 should be available as component"
        assert 'CP-003' in component_parts, "CP-003 should be available as component"
        
        print(f"Component items available for BOM parent: {component_parts}")
    
    def test_create_bom_with_component_parent(self, api_client, auth_token):
        """Should be able to create BOM with a component category item as parent"""
        # Get a component item ID (CP-002)
        items_response = api_client.get(f"{BASE_URL}/api/items")
        items = items_response.json()
        cp002 = next((i for i in items if i['part_number'] == 'CP-002'), None)
        assert cp002 is not None, "CP-002 should exist"
        
        # Create BOM with component as parent
        bom_data = {
            "parent_item_id": cp002['id'],
            "name": "TEST Control Valve BOM",
            "description": "Test BOM with component as parent",
            "revision": "A",
            "status": "draft",
            "components": []
        }
        
        response = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert response.status_code in [200, 201], f"Should create BOM with component parent, got {response.status_code}: {response.text}"
        
        created_bom = response.json()
        assert created_bom['parent_item_id'] == cp002['id']
        assert created_bom['name'] == "TEST Control Valve BOM"
        
        # Cleanup - delete the test BOM
        delete_response = api_client.delete(f"{BASE_URL}/api/bom/{created_bom['id']}")
        assert delete_response.status_code in [200, 204], "Should delete test BOM"
        
        print(f"Successfully created BOM with component (CP-002) as parent")
    
    def test_create_bom_with_component_parent_and_components(self, api_client, auth_token):
        """Create BOM with component parent and add child components"""
        items_response = api_client.get(f"{BASE_URL}/api/items")
        items = items_response.json()
        
        cp003 = next((i for i in items if i['part_number'] == 'CP-003'), None)
        rm001 = next((i for i in items if i['part_number'] == 'RM-001'), None)
        
        assert cp003 is not None, "CP-003 should exist"
        assert rm001 is not None, "RM-001 should exist"
        
        bom_data = {
            "parent_item_id": cp003['id'],
            "name": "TEST Electric Motor BOM",
            "description": "Test BOM with component parent and children",
            "revision": "A",
            "status": "draft",
            "components": [
                {
                    "item_id": rm001['id'],
                    "quantity": 2,
                    "unit_of_measure": "sheet",
                    "is_alternate": False
                }
            ]
        }
        
        response = api_client.post(f"{BASE_URL}/api/bom", json=bom_data)
        assert response.status_code in [200, 201], f"Should create BOM, got {response.status_code}: {response.text}"
        
        created_bom = response.json()
        assert len(created_bom['components']) == 1
        assert created_bom['components'][0]['item_id'] == rm001['id']
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/bom/{created_bom['id']}")
        
        print("Successfully created BOM with component parent and child components")


class TestBOMExplosion:
    """Tests for BOM explosion functionality"""
    
    def test_bom_explosion_shows_multi_level(self, api_client, auth_token):
        """BOM explosion should show all levels of the BOM hierarchy"""
        # Get FG-001 BOM
        boms_response = api_client.get(f"{BASE_URL}/api/bom")
        boms = boms_response.json()
        fg001_bom = next((b for b in boms if b.get('parent_item', {}).get('part_number') == 'FG-001'), None)
        
        assert fg001_bom is not None, "FG-001 BOM should exist"
        
        # Get explosion
        explosion_response = api_client.get(f"{BASE_URL}/api/bom/{fg001_bom['id']}/explode")
        assert explosion_response.status_code == 200
        
        explosion = explosion_response.json()
        assert 'explosion' in explosion
        
        # Find SA-001 in explosion and verify it has children
        sa001_item = None
        for item in explosion['explosion']:
            if item['item']['part_number'] == 'SA-001':
                sa001_item = item
                break
        
        assert sa001_item is not None, "SA-001 should be in explosion"
        assert len(sa001_item['children']) > 0, "SA-001 should have children in explosion"
        
        # Verify children are RM-002, RM-003, CP-001
        child_parts = [c['item']['part_number'] for c in sa001_item['children']]
        assert 'RM-002' in child_parts, "RM-002 should be child of SA-001"
        assert 'RM-003' in child_parts, "RM-003 should be child of SA-001"
        assert 'CP-001' in child_parts, "CP-001 should be child of SA-001"
        
        print(f"BOM explosion shows multi-level structure. SA-001 children: {child_parts}")
    
    def test_bom_explosion_levels(self, api_client, auth_token):
        """Verify BOM explosion shows correct level numbers"""
        boms_response = api_client.get(f"{BASE_URL}/api/bom")
        boms = boms_response.json()
        fg001_bom = next((b for b in boms if b.get('parent_item', {}).get('part_number') == 'FG-001'), None)
        
        if fg001_bom:
            explosion_response = api_client.get(f"{BASE_URL}/api/bom/{fg001_bom['id']}/explode")
            explosion = explosion_response.json()
            
            # All top-level items should be level 1
            for item in explosion['explosion']:
                assert item['level'] == 1, f"Top-level items should be level 1"
                
                # Children should be level 2
                for child in item.get('children', []):
                    assert child['level'] == 2, f"Child items should be level 2"
            
            print("BOM explosion levels are correct")


class TestExistingBOMsNotAffected:
    """Verify existing BOMs are not affected by the fixes"""
    
    def test_existing_boms_still_work(self, api_client, auth_token):
        """Existing BOMs should still be retrievable and functional"""
        response = api_client.get(f"{BASE_URL}/api/bom")
        assert response.status_code == 200
        
        boms = response.json()
        assert len(boms) >= 2, "Should have at least 2 existing BOMs"
        
        # Verify FG-001 BOM exists and has components
        fg001_bom = next((b for b in boms if b.get('parent_item', {}).get('part_number') == 'FG-001'), None)
        assert fg001_bom is not None, "FG-001 BOM should exist"
        assert len(fg001_bom['components']) == 5, f"FG-001 BOM should have 5 components, got {len(fg001_bom['components'])}"
        
        # Verify SA-001 BOM exists and has components
        sa001_bom = next((b for b in boms if b.get('parent_item', {}).get('part_number') == 'SA-001'), None)
        assert sa001_bom is not None, "SA-001 BOM should exist"
        assert len(sa001_bom['components']) == 3, f"SA-001 BOM should have 3 components, got {len(sa001_bom['components'])}"
        
        print("Existing BOMs are intact and functional")
    
    def test_existing_bom_details(self, api_client, auth_token):
        """Verify existing BOM details endpoint works"""
        boms_response = api_client.get(f"{BASE_URL}/api/bom")
        boms = boms_response.json()
        
        for bom in boms[:2]:  # Test first 2 BOMs
            detail_response = api_client.get(f"{BASE_URL}/api/bom/{bom['id']}")
            assert detail_response.status_code == 200
            
            detail = detail_response.json()
            assert detail['id'] == bom['id']
            assert 'parent_item' in detail
            assert 'components' in detail
        
        print("Existing BOM details endpoint works correctly")


# Fixtures
@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="session")
def auth_token(api_client):
    """Get authentication token and set cookies"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "Admin@123"
    })
    if response.status_code == 200:
        # Cookies are automatically stored in session
        return response.json()
    pytest.fail(f"Authentication failed: {response.status_code} - {response.text}")
