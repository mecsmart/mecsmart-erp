"""
Round 21 Backend Tests: Additional Charges Feature
Tests for:
- BACKEND-1: Additional Charges Master CRUD
- BACKEND-2: Quotation with additional_charges
- BACKEND-3: Quotation update preserves & recomputes additional_charges
- BACKEND-4: Convert quotation→proforma carries additional_charges forward
- BACKEND-5: Convert proforma→tax_invoice carries additional_charges forward
- BACKEND-6: Tax Invoice direct create + update with additional_charges
- BACKEND-7: Export currency (USD) zeros out charges GST
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAdditionalChargesRound21:
    """Round 21: Additional Charges Feature Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "Admin@123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.user = login_resp.json()
        # Store created IDs for cleanup
        self.created_charge_ids = []
        self.created_quotation_ids = []
        self.created_proforma_ids = []
        self.created_tax_invoice_ids = []
        self.created_customer_ids = []
        yield
        # Cleanup
        for cid in self.created_charge_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/crm/additional-charges/{cid}")
            except:
                pass
        for qid in self.created_quotation_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/crm/quotations/{qid}")
            except:
                pass
    
    # =========================================================================
    # BACKEND-1: Additional Charges Master CRUD
    # =========================================================================
    def test_backend1_create_additional_charge(self):
        """BACKEND-1: POST creates a charge with {name, hsn_code, gst_rate}"""
        payload = {
            "name": f"TEST_Packing_{uuid.uuid4().hex[:6]}",
            "hsn_code": "998540",
            "gst_rate": 18.0
        }
        resp = self.session.post(f"{BASE_URL}/api/crm/additional-charges", json=payload)
        assert resp.status_code == 201, f"Create failed: {resp.text}"
        data = resp.json()
        self.created_charge_ids.append(data["id"])
        
        # Verify response structure
        assert "id" in data
        assert data["name"] == payload["name"]
        assert data["hsn_code"] == payload["hsn_code"]
        assert data["gst_rate"] == payload["gst_rate"]
        print(f"✓ BACKEND-1: Created additional charge: {data['name']}")
    
    def test_backend1_list_additional_charges(self):
        """BACKEND-1: GET lists all charges"""
        # First create a charge
        payload = {
            "name": f"TEST_Insurance_{uuid.uuid4().hex[:6]}",
            "hsn_code": "997159",
            "gst_rate": 18.0
        }
        create_resp = self.session.post(f"{BASE_URL}/api/crm/additional-charges", json=payload)
        assert create_resp.status_code == 201
        created = create_resp.json()
        self.created_charge_ids.append(created["id"])
        
        # List charges
        list_resp = self.session.get(f"{BASE_URL}/api/crm/additional-charges")
        assert list_resp.status_code == 200
        charges = list_resp.json()
        assert isinstance(charges, list)
        
        # Verify our charge is in the list
        found = any(c["id"] == created["id"] for c in charges)
        assert found, "Created charge not found in list"
        print(f"✓ BACKEND-1: Listed {len(charges)} additional charges")
    
    def test_backend1_update_additional_charge(self):
        """BACKEND-1: PUT updates a charge"""
        # Create
        payload = {
            "name": f"TEST_Loading_{uuid.uuid4().hex[:6]}",
            "hsn_code": "996511",
            "gst_rate": 12.0
        }
        create_resp = self.session.post(f"{BASE_URL}/api/crm/additional-charges", json=payload)
        assert create_resp.status_code == 201
        created = create_resp.json()
        self.created_charge_ids.append(created["id"])
        
        # Update
        update_payload = {
            "name": f"TEST_Loading_Updated_{uuid.uuid4().hex[:6]}",
            "gst_rate": 18.0
        }
        update_resp = self.session.put(f"{BASE_URL}/api/crm/additional-charges/{created['id']}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        
        assert updated["name"] == update_payload["name"]
        assert updated["gst_rate"] == update_payload["gst_rate"]
        assert updated["hsn_code"] == payload["hsn_code"]  # Unchanged
        print(f"✓ BACKEND-1: Updated additional charge")
    
    def test_backend1_delete_additional_charge(self):
        """BACKEND-1: DELETE removes a charge"""
        # Create
        payload = {
            "name": f"TEST_ToDelete_{uuid.uuid4().hex[:6]}",
            "hsn_code": "998540",
            "gst_rate": 18.0
        }
        create_resp = self.session.post(f"{BASE_URL}/api/crm/additional-charges", json=payload)
        assert create_resp.status_code == 201
        created = create_resp.json()
        
        # Delete
        delete_resp = self.session.delete(f"{BASE_URL}/api/crm/additional-charges/{created['id']}")
        assert delete_resp.status_code == 200
        
        # Verify deleted
        list_resp = self.session.get(f"{BASE_URL}/api/crm/additional-charges")
        charges = list_resp.json()
        found = any(c["id"] == created["id"] for c in charges)
        assert not found, "Charge should be deleted"
        print(f"✓ BACKEND-1: Deleted additional charge")
    
    # =========================================================================
    # BACKEND-2: Quotation with additional_charges
    # =========================================================================
    def test_backend2_quotation_with_additional_charges(self):
        """BACKEND-2: POST quotation with additional_charges, verify totals"""
        # First create a customer with unique GSTIN
        unique_id = uuid.uuid4().hex[:8].upper()
        customer_payload = {
            "name": f"TEST_Customer_{unique_id}",
            "gstin": f"27AABCT{unique_id}1Z5",  # Unique GSTIN
            "state_code": "27"
        }
        cust_resp = self.session.post(f"{BASE_URL}/api/customers", json=customer_payload)
        assert cust_resp.status_code == 201, f"Customer create failed: {cust_resp.text}"
        customer = cust_resp.json()
        self.created_customer_ids.append(customer["id"])
        
        # Create quotation with additional charges
        quotation_payload = {
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "quotation_date": "2026-01-15T00:00:00Z",
            "currency": "INR",
            "lines": [
                {
                    "item_id": "",
                    "description": "Test Item 1",
                    "hsn_code": "84314900",
                    "quantity": 10,
                    "uom": "Nos",
                    "rate": 1000,
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {
                    "name": "Packing",
                    "hsn_code": "998540",
                    "gst_rate": 18,
                    "amount": 500
                }
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_payload)
        assert resp.status_code == 201, f"Quotation create failed: {resp.text}"
        quotation = resp.json()
        self.created_quotation_ids.append(quotation["id"])
        
        # Verify totals
        # Line total: 10 * 1000 = 10000
        # Line GST: 10000 * 18% = 1800
        # Additional charge: 500
        # Additional charge GST: 500 * 18% = 90
        # Total GST: 1800 + 90 = 1890
        # Grand total: 10000 + 500 + 1890 = 12390
        
        assert "additional_charges_total" in quotation, "Missing additional_charges_total"
        assert quotation["additional_charges_total"] == 500, f"Expected additional_charges_total=500, got {quotation['additional_charges_total']}"
        
        assert "additional_charges_gst" in quotation, "Missing additional_charges_gst"
        assert quotation["additional_charges_gst"] == 90, f"Expected additional_charges_gst=90, got {quotation['additional_charges_gst']}"
        
        # Total GST should include the +90 from additional charges
        expected_total_gst = 1800 + 90  # 1890
        assert quotation["total_gst"] == expected_total_gst, f"Expected total_gst={expected_total_gst}, got {quotation['total_gst']}"
        
        # Grand total = net_subtotal + additional_charges_total + total_gst
        expected_grand_total = 10000 + 500 + 1890  # 12390
        assert quotation["grand_total"] == expected_grand_total, f"Expected grand_total={expected_grand_total}, got {quotation['grand_total']}"
        
        print(f"✓ BACKEND-2: Quotation with additional charges - totals verified")
        print(f"  - additional_charges_total: {quotation['additional_charges_total']}")
        print(f"  - additional_charges_gst: {quotation['additional_charges_gst']}")
        print(f"  - total_gst: {quotation['total_gst']}")
        print(f"  - grand_total: {quotation['grand_total']}")
    
    # =========================================================================
    # BACKEND-3: Quotation update preserves & recomputes additional_charges
    # =========================================================================
    def test_backend3_quotation_update_recomputes_charges(self):
        """BACKEND-3: PUT quotation with new additional_charges, verify totals recompute"""
        # Create customer with unique GSTIN
        unique_id = uuid.uuid4().hex[:8].upper()
        customer_payload = {
            "name": f"TEST_Customer_{unique_id}",
            "gstin": f"27AABCU{unique_id}1Z5",
            "state_code": "27"
        }
        cust_resp = self.session.post(f"{BASE_URL}/api/customers", json=customer_payload)
        assert cust_resp.status_code == 201
        customer = cust_resp.json()
        self.created_customer_ids.append(customer["id"])
        
        # Create quotation with initial charges
        quotation_payload = {
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "quotation_date": "2026-01-15T00:00:00Z",
            "currency": "INR",
            "lines": [
                {
                    "description": "Test Item",
                    "hsn_code": "84314900",
                    "quantity": 10,
                    "uom": "Nos",
                    "rate": 1000,
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {"name": "Packing", "hsn_code": "998540", "gst_rate": 18, "amount": 500}
            ]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_payload)
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        self.created_quotation_ids.append(quotation["id"])
        
        # Update with new charges
        update_payload = {
            "additional_charges": [
                {"name": "Packing", "hsn_code": "998540", "gst_rate": 18, "amount": 1000},
                {"name": "Insurance", "hsn_code": "997159", "gst_rate": 18, "amount": 200}
            ]
        }
        
        update_resp = self.session.put(f"{BASE_URL}/api/crm/quotations/{quotation['id']}", json=update_payload)
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        updated = update_resp.json()
        
        # Verify recomputed totals
        # Line total: 10000
        # Line GST: 1800
        # Additional charges: 1000 + 200 = 1200
        # Additional charges GST: 1200 * 18% = 216
        # Total GST: 1800 + 216 = 2016
        # Grand total: 10000 + 1200 + 2016 = 13216
        
        assert updated["additional_charges_total"] == 1200, f"Expected 1200, got {updated['additional_charges_total']}"
        assert updated["additional_charges_gst"] == 216, f"Expected 216, got {updated['additional_charges_gst']}"
        assert updated["total_gst"] == 2016, f"Expected 2016, got {updated['total_gst']}"
        assert updated["grand_total"] == 13216, f"Expected 13216, got {updated['grand_total']}"
        
        print(f"✓ BACKEND-3: Quotation update recomputes additional charges correctly")
    
    # =========================================================================
    # BACKEND-4: Convert quotation→proforma carries additional_charges forward
    # =========================================================================
    def test_backend4_convert_quotation_to_proforma(self):
        """BACKEND-4: Convert quotation to proforma, verify additional_charges carried forward"""
        # Create customer with unique GSTIN
        unique_id = uuid.uuid4().hex[:8].upper()
        customer_payload = {
            "name": f"TEST_Customer_{unique_id}",
            "gstin": f"27AABCZ{unique_id}1Z5",
            "state_code": "27"
        }
        cust_resp = self.session.post(f"{BASE_URL}/api/customers", json=customer_payload)
        assert cust_resp.status_code == 201
        customer = cust_resp.json()
        self.created_customer_ids.append(customer["id"])
        
        # Create quotation with charges
        quotation_payload = {
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "quotation_date": "2026-01-15T00:00:00Z",
            "currency": "INR",
            "lines": [
                {
                    "description": "Test Item",
                    "hsn_code": "84314900",
                    "quantity": 5,
                    "uom": "Nos",
                    "rate": 2000,
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {"name": "Packing", "hsn_code": "998540", "gst_rate": 18, "amount": 300}
            ]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_payload)
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        self.created_quotation_ids.append(quotation["id"])
        
        # Convert to proforma
        convert_resp = self.session.post(
            f"{BASE_URL}/api/crm/quotations/{quotation['id']}/convert-to-proforma",
            json={"advance_percentage": 30}
        )
        assert convert_resp.status_code in [200, 201], f"Convert failed: {convert_resp.text}"
        proforma = convert_resp.json()
        self.created_proforma_ids.append(proforma["id"])
        
        # Verify additional charges carried forward
        assert "additional_charges" in proforma
        assert len(proforma["additional_charges"]) == 1
        assert proforma["additional_charges"][0]["name"] == "Packing"
        assert proforma["additional_charges"][0]["amount"] == 300
        
        # Verify totals match
        # Line: 5 * 2000 = 10000, GST = 1800
        # Charges: 300, GST = 54
        # Total GST: 1854
        # Grand total: 10000 + 300 + 1854 = 12154
        assert proforma["additional_charges_total"] == 300
        assert proforma["additional_charges_gst"] == 54
        assert proforma["total_gst"] == 1854
        assert proforma["grand_total"] == 12154
        
        print(f"✓ BACKEND-4: Quotation→Proforma conversion carries additional_charges forward")
    
    # =========================================================================
    # BACKEND-5: Convert proforma→tax_invoice carries additional_charges forward
    # =========================================================================
    def test_backend5_convert_proforma_to_tax_invoice(self):
        """BACKEND-5: Convert proforma to tax invoice, verify additional_charges carried forward"""
        # Create customer with unique GSTIN
        unique_id = uuid.uuid4().hex[:8].upper()
        customer_payload = {
            "name": f"TEST_Customer_{unique_id}",
            "gstin": f"27AABCW{unique_id}1Z5",
            "state_code": "27"
        }
        cust_resp = self.session.post(f"{BASE_URL}/api/customers", json=customer_payload)
        assert cust_resp.status_code == 201
        customer = cust_resp.json()
        self.created_customer_ids.append(customer["id"])
        
        # Create quotation with charges
        quotation_payload = {
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "quotation_date": "2026-01-15T00:00:00Z",
            "currency": "INR",
            "lines": [
                {
                    "description": "Test Item",
                    "hsn_code": "84314900",
                    "quantity": 2,
                    "uom": "Nos",
                    "rate": 5000,
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {"name": "Freight", "hsn_code": "996511", "gst_rate": 18, "amount": 400}
            ]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_payload)
        assert create_resp.status_code == 201
        quotation = create_resp.json()
        self.created_quotation_ids.append(quotation["id"])
        
        # Convert to proforma
        convert_pf_resp = self.session.post(
            f"{BASE_URL}/api/crm/quotations/{quotation['id']}/convert-to-proforma",
            json={"advance_percentage": 50}
        )
        assert convert_pf_resp.status_code in [200, 201], f"Convert to proforma failed: {convert_pf_resp.text}"
        proforma = convert_pf_resp.json()
        self.created_proforma_ids.append(proforma["id"])
        
        # Convert proforma to tax invoice
        convert_ti_resp = self.session.post(
            f"{BASE_URL}/api/crm/proformas/{proforma['id']}/convert-to-tax-invoice"
        )
        assert convert_ti_resp.status_code == 200 or convert_ti_resp.status_code == 201, f"Convert to TI failed: {convert_ti_resp.text}"
        tax_invoice = convert_ti_resp.json()
        self.created_tax_invoice_ids.append(tax_invoice["id"])
        
        # Verify additional charges carried forward
        assert "additional_charges" in tax_invoice
        assert len(tax_invoice["additional_charges"]) == 1
        assert tax_invoice["additional_charges"][0]["name"] == "Freight"
        assert tax_invoice["additional_charges"][0]["amount"] == 400
        
        # Verify totals
        # Line: 2 * 5000 = 10000, GST = 1800
        # Charges: 400, GST = 72
        # Total GST: 1872
        # Grand total: 10000 + 400 + 1872 = 12272
        assert tax_invoice["additional_charges_total"] == 400
        assert tax_invoice["additional_charges_gst"] == 72
        assert tax_invoice["total_gst"] == 1872
        assert tax_invoice["grand_total"] == 12272
        
        print(f"✓ BACKEND-5: Proforma→Tax Invoice conversion carries additional_charges forward")
    
    # =========================================================================
    # BACKEND-6: Tax Invoice direct create + update with additional_charges
    # =========================================================================
    def test_backend6_tax_invoice_direct_create_with_charges(self):
        """BACKEND-6: POST tax invoice with additional_charges, verify GST math"""
        # Create customer with unique GSTIN
        unique_id = uuid.uuid4().hex[:8].upper()
        customer_payload = {
            "name": f"TEST_Customer_{unique_id}",
            "gstin": f"27AABCX{unique_id}1Z5",
            "state_code": "27"
        }
        cust_resp = self.session.post(f"{BASE_URL}/api/customers", json=customer_payload)
        assert cust_resp.status_code == 201
        customer = cust_resp.json()
        self.created_customer_ids.append(customer["id"])
        
        # Create tax invoice directly
        ti_payload = {
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "invoice_date": "2026-01-15T00:00:00Z",
            "currency": "INR",
            "lines": [
                {
                    "description": "Direct TI Item",
                    "hsn_code": "84314900",
                    "quantity": 3,
                    "uom": "Nos",
                    "rate": 3000,
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {"name": "Loading", "hsn_code": "996511", "gst_rate": 12, "amount": 250}
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_payload)
        assert resp.status_code == 201, f"TI create failed: {resp.text}"
        ti = resp.json()
        self.created_tax_invoice_ids.append(ti["id"])
        
        # Verify totals
        # Line: 3 * 3000 = 9000, GST = 1620
        # Charges: 250, GST = 250 * 12% = 30
        # Total GST: 1620 + 30 = 1650
        # Grand total: 9000 + 250 + 1650 = 10900
        assert ti["additional_charges_total"] == 250
        assert ti["additional_charges_gst"] == 30
        assert ti["total_gst"] == 1650
        assert ti["grand_total"] == 10900
        
        print(f"✓ BACKEND-6: Tax Invoice direct create with additional_charges - GST math correct")
    
    def test_backend6_tax_invoice_update_with_charges(self):
        """BACKEND-6: PUT tax invoice updates additional_charges correctly"""
        # Create customer with unique GSTIN
        unique_id = uuid.uuid4().hex[:8].upper()
        customer_payload = {
            "name": f"TEST_Customer_{unique_id}",
            "gstin": f"27AABCY{unique_id}1Z5",
            "state_code": "27"
        }
        cust_resp = self.session.post(f"{BASE_URL}/api/customers", json=customer_payload)
        assert cust_resp.status_code == 201
        customer = cust_resp.json()
        self.created_customer_ids.append(customer["id"])
        
        # Create tax invoice
        ti_payload = {
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "invoice_date": "2026-01-15T00:00:00Z",
            "currency": "INR",
            "lines": [
                {
                    "description": "TI Item",
                    "hsn_code": "84314900",
                    "quantity": 4,
                    "uom": "Nos",
                    "rate": 2500,
                    "discount_pct": 0,
                    "gst_rate": 18
                }
            ],
            "additional_charges": [
                {"name": "Packing", "hsn_code": "998540", "gst_rate": 18, "amount": 100}
            ]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/crm/tax-invoices", json=ti_payload)
        assert create_resp.status_code == 201
        ti = create_resp.json()
        self.created_tax_invoice_ids.append(ti["id"])
        
        # Update with new charges
        update_payload = {
            "additional_charges": [
                {"name": "Packing", "hsn_code": "998540", "gst_rate": 18, "amount": 500},
                {"name": "Insurance", "hsn_code": "997159", "gst_rate": 18, "amount": 300}
            ]
        }
        
        update_resp = self.session.put(f"{BASE_URL}/api/crm/tax-invoices/{ti['id']}", json=update_payload)
        assert update_resp.status_code == 200, f"TI update failed: {update_resp.text}"
        updated = update_resp.json()
        
        # Verify recomputed totals
        # Line: 4 * 2500 = 10000, GST = 1800
        # Charges: 500 + 300 = 800, GST = 800 * 18% = 144
        # Total GST: 1800 + 144 = 1944
        # Grand total: 10000 + 800 + 1944 = 12744
        assert updated["additional_charges_total"] == 800
        assert updated["additional_charges_gst"] == 144
        assert updated["total_gst"] == 1944
        assert updated["grand_total"] == 12744
        
        print(f"✓ BACKEND-6: Tax Invoice update with additional_charges - GST math correct")
    
    # =========================================================================
    # BACKEND-7: Export currency (USD) zeros out charges GST
    # =========================================================================
    def test_backend7_export_currency_zeros_charges_gst(self):
        """BACKEND-7: POST quotation with currency:'USD' and additional_charges; verify GST=0"""
        # Create customer
        customer_payload = {
            "name": f"TEST_Export_Customer_{uuid.uuid4().hex[:6]}",
            "gstin": "",  # Export customer - no GSTIN
            "state_code": ""
        }
        cust_resp = self.session.post(f"{BASE_URL}/api/customers", json=customer_payload)
        assert cust_resp.status_code == 201
        customer = cust_resp.json()
        self.created_customer_ids.append(customer["id"])
        
        # Create quotation with USD currency
        quotation_payload = {
            "customer_id": customer["id"],
            "customer_name": customer["name"],
            "quotation_date": "2026-01-15T00:00:00Z",
            "currency": "USD",  # Export currency
            "lines": [
                {
                    "description": "Export Item",
                    "hsn_code": "84314900",
                    "quantity": 10,
                    "uom": "Nos",
                    "rate": 100,  # USD
                    "discount_pct": 0,
                    "gst_rate": 18  # Will be zeroed for export
                }
            ],
            "additional_charges": [
                {"name": "Packing", "hsn_code": "998540", "gst_rate": 18, "amount": 50}
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/crm/quotations", json=quotation_payload)
        assert resp.status_code == 201, f"Quotation create failed: {resp.text}"
        quotation = resp.json()
        self.created_quotation_ids.append(quotation["id"])
        
        # Verify GST is zero for export
        assert quotation["additional_charges_gst"] == 0, f"Expected additional_charges_gst=0 for export, got {quotation['additional_charges_gst']}"
        assert quotation["total_gst"] == 0, f"Expected total_gst=0 for export, got {quotation['total_gst']}"
        
        # Grand total = net_subtotal + charges (no GST)
        # Line: 10 * 100 = 1000
        # Charges: 50
        # Grand total: 1000 + 50 = 1050
        assert quotation["grand_total"] == 1050, f"Expected grand_total=1050, got {quotation['grand_total']}"
        
        print(f"✓ BACKEND-7: Export currency (USD) zeros out charges GST")
        print(f"  - additional_charges_gst: {quotation['additional_charges_gst']}")
        print(f"  - total_gst: {quotation['total_gst']}")
        print(f"  - grand_total: {quotation['grand_total']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
