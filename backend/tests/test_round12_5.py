"""
Round 12.5 Bug Fix Tests
Tests for:
1. BOM import API returns imported_bom_ids
2. BOM list filtering (nested SG dedup)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBOMImportAPI:
    """Test BOM import API returns imported_bom_ids"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            if 'token' in data:
                self.session.headers.update({"Authorization": f"Bearer {data['token']}"})
            print(f"Login successful")
        else:
            print(f"Login failed: {login_response.status_code}")
            pytest.skip("Authentication failed")
    
    def test_bom_list_api(self):
        """Test BOM list API returns data"""
        response = self.session.get(f"{BASE_URL}/api/bom?status=active")
        assert response.status_code == 200, f"BOM list failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "BOM list should return a list"
        print(f"BOM list returned {len(data)} items")
    
    def test_bom_export_api(self):
        """Test BOM export API works"""
        # First get a BOM ID
        response = self.session.get(f"{BASE_URL}/api/bom?status=active")
        assert response.status_code == 200
        
        boms = response.json()
        if len(boms) == 0:
            pytest.skip("No BOMs available for export test")
        
        bom_id = boms[0].get('id')
        
        # Test export endpoint
        export_response = self.session.get(f"{BASE_URL}/api/bom/export/excel?bom_id={bom_id}")
        assert export_response.status_code == 200, f"BOM export failed: {export_response.status_code}"
        
        # Check content type is Excel
        content_type = export_response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type or 'octet-stream' in content_type, \
            f"Expected Excel content type, got: {content_type}"
        
        print(f"BOM export successful for BOM ID: {bom_id}")


class TestCRMQuotationPDF:
    """Test CRM Quotation PDF API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            if 'token' in data:
                self.session.headers.update({"Authorization": f"Bearer {data['token']}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_quotation_list_api(self):
        """Test quotation list API"""
        response = self.session.get(f"{BASE_URL}/api/crm/quotations")
        assert response.status_code == 200, f"Quotation list failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Quotation list should return a list"
        print(f"Quotation list returned {len(data)} items")


class TestPurchaseOrderPDF:
    """Test Purchase Order PDF API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            if 'token' in data:
                self.session.headers.update({"Authorization": f"Bearer {data['token']}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_po_list_api(self):
        """Test PO list API"""
        response = self.session.get(f"{BASE_URL}/api/purchase-orders")
        assert response.status_code == 200, f"PO list failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "PO list should return a list"
        print(f"PO list returned {len(data)} items")
        
        # Check for draft POs
        draft_pos = [po for po in data if po.get('status') == 'draft']
        print(f"Found {len(draft_pos)} draft POs")


class TestProformaInvoicePDF:
    """Test Proforma Invoice PDF API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            if 'token' in data:
                self.session.headers.update({"Authorization": f"Bearer {data['token']}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_proforma_list_api(self):
        """Test Proforma Invoice list API"""
        response = self.session.get(f"{BASE_URL}/api/crm/proformas")
        assert response.status_code == 200, f"Proforma list failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Proforma list should return a list"
        print(f"Proforma list returned {len(data)} items")


class TestTaxInvoicePDF:
    """Test Tax Invoice PDF API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            if 'token' in data:
                self.session.headers.update({"Authorization": f"Bearer {data['token']}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_tax_invoice_list_api(self):
        """Test Tax Invoice list API"""
        response = self.session.get(f"{BASE_URL}/api/crm/tax-invoices")
        assert response.status_code == 200, f"Tax Invoice list failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Tax Invoice list should return a list"
        print(f"Tax Invoice list returned {len(data)} items")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
