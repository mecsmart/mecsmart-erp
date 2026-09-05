"""Backend tests for CRM Quotation clone endpoint (iteration 158)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to reading frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


@pytest.fixture(scope="module")
def h():
    """Return a requests.Session with auth cookie set."""
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "admin@erp.com", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def a_quotation(h):
    """Get some existing quotation to clone."""
    r = h.get(f"{BASE_URL}/api/crm/quotations")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) > 0, "Need at least one quotation to test clone"
    return items[0]


def test_clone_unauth():
    r = requests.post(f"{BASE_URL}/api/crm/quotations/nonexistent/clone")
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


def test_clone_unknown_id(h):
    r = h.post(f"{BASE_URL}/api/crm/quotations/does-not-exist-xyz/clone")
    assert r.status_code == 404


def test_clone_creates_draft(h, a_quotation):
    orig = a_quotation
    orig_id = orig["id"]
    orig_no = orig["quotation_no"]
    orig_status = orig.get("status")
    r = h.post(f"{BASE_URL}/api/crm/quotations/{orig_id}/clone")
    assert r.status_code == 201, r.text
    clone = r.json()
    # Fresh number, no -R suffix
    assert clone["quotation_no"] != orig_no
    assert "-R" not in clone["quotation_no"], f"clone number should not carry -R suffix, got {clone['quotation_no']}"
    assert clone["status"] == "draft"
    assert clone.get("cloned_from_no") == orig_no
    assert clone.get("cloned_from_id") == orig_id
    # Should not have revision/root links
    for k in ("revision", "root_quotation_no", "converted_so_no", "proforma_no", "superseded_by_no"):
        assert not clone.get(k), f"clone should not carry {k}, got {clone.get(k)}"
    # Lines equal (length) to original (use list entry which may already contain lines)
    assert len(clone.get("lines") or []) == len(orig.get("lines") or [])

    # Original untouched
    r2 = h.get(f"{BASE_URL}/api/crm/quotations")
    orig_after = next((q for q in r2.json() if q["id"] == orig_id), None)
    assert orig_after is not None
    assert orig_after.get("quotation_no") == orig_no
    assert orig_after.get("status") == orig_status


def test_clone_of_any_status_becomes_draft(h):
    """Try to find a converted or superseded quotation and clone it -> draft."""
    r = h.get(f"{BASE_URL}/api/crm/quotations")
    quots = r.json()
    target = next((q for q in quots if q.get("status") in ("converted", "superseded")), None)
    if not target:
        pytest.skip("No converted/superseded quotation available")
    r = h.post(f"{BASE_URL}/api/crm/quotations/{target['id']}/clone")
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "draft"
