"""
Iteration 160 - Backend compatibility against newer pydantic/pymongo/motor/bcrypt
Instance under test: http://127.0.0.1:8002 (Windows requirements-windows.txt resolved versions).
"""
import os
import random
import string
import pytest
import requests

BASE_URL = os.environ.get("TEST_BASE_URL", "http://127.0.0.1:8002")
ORIGIN = "http://localhost:8002"
ADMIN = {"email": "admin@erp.com", "password": "Admin@123"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Origin": ORIGIN, "Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("email") == ADMIN["email"]
    # Cookies are Secure=True → requests drops them over http. Replay manually.
    cookies = r.cookies  # cookie jar; iterate even if Secure
    jar_cookies = []
    # requests populates .cookies regardless of Secure. Replay as Cookie header.
    cookie_pairs = []
    for c in r.cookies:
        cookie_pairs.append(f"{c.name}={c.value}")
    if cookie_pairs:
        s.headers["Cookie"] = "; ".join(cookie_pairs)
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    return s


def _rand(n=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


# ---------- auth ----------
class TestAuth:
    def test_login_sets_cookie_or_token(self, session):
        # fixture already logged in; session must be usable
        r = session.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me.get("email") == ADMIN["email"]
        assert "password" not in me and "password_hash" not in me

    def test_invalid_login(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@erp.com", "password": "WRONG"},
            headers={"Origin": ORIGIN},
            timeout=10,
        )
        assert r.status_code in (400, 401), r.text


# ---------- read endpoints (compat smoke) ----------
READ_ENDPOINTS = [
    "/api/items?lite=1",
    "/api/items",
    "/api/crm/quotations",
    "/api/purchase-orders",
    "/api/production",
    "/api/work-orders",
    "/api/bom",
    "/api/customers",
    "/api/suppliers",
    "/api/dashboard/stats",
]


@pytest.mark.parametrize("path", READ_ENDPOINTS)
def test_read_endpoint_200_and_jsonable(session, path):
    r = session.get(f"{BASE_URL}{path}", timeout=30)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:300]}"
    # must be JSON-serialisable (no raw ObjectId/datetime leaking as non-json)
    body = r.json()
    assert isinstance(body, (list, dict))
    # ObjectId leakage check: ensure no '_id' as ObjectId repr
    import json
    serialised = json.dumps(body, default=str)
    assert 'ObjectId(' not in serialised, f"{path} leaked ObjectId"


# ---------- items CRUD round-trip ----------
class TestItemsCRUD:
    created_id = None

    def test_create_item(self, session):
        pn = f"TEST-PY315-{_rand()}"
        payload = {
            "part_number": pn,
            "name": f"Py315 compat {pn}",
            "category": "component",
            "unit_of_measure": "pcs",
        }
        r = session.post(f"{BASE_URL}/api/items", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body["part_number"] == pn
        assert body.get("id")
        TestItemsCRUD.created_id = body["id"]
        TestItemsCRUD.created_pn = pn

    def test_update_item(self, session):
        assert TestItemsCRUD.created_id
        new_name = "Py315 compat UPDATED"
        r = session.put(
            f"{BASE_URL}/api/items/{TestItemsCRUD.created_id}",
            json={"name": new_name},
            timeout=15,
        )
        assert r.status_code in (200, 204), r.text
        # Verify via GET
        g = session.get(f"{BASE_URL}/api/items/{TestItemsCRUD.created_id}", timeout=10)
        assert g.status_code == 200, g.text
        assert g.json().get("name") == new_name

    def test_delete_item(self, session):
        assert TestItemsCRUD.created_id
        r = session.delete(
            f"{BASE_URL}/api/items/{TestItemsCRUD.created_id}", timeout=15
        )
        assert r.status_code in (200, 204), r.text
        # Verify gone
        g = session.get(f"{BASE_URL}/api/items/{TestItemsCRUD.created_id}", timeout=10)
        assert g.status_code in (404, 400), g.text


def test_pydantic_validation_returns_422(session):
    # POST with no fields -> required part_number/name missing
    r = session.post(f"{BASE_URL}/api/items", json={}, timeout=10)
    assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:300]}"
    body = r.json()
    assert "detail" in body


# ---------- bcrypt verify (change admin password + revert via PUT /api/users/{id}) ----------
def test_bcrypt_change_password_and_revert(session):
    """
    Verifies bcrypt>=5 hashing/verify works end-to-end on the Windows-pinned stack.
    Uses PUT /api/users/{id} to change admin's own password, re-login, then revert.
    """
    me = session.get(f"{BASE_URL}/api/auth/me", timeout=10).json()
    admin_id = me["id"]
    orig = ADMIN["password"]
    newp = "Admin@123X"

    r = session.put(
        f"{BASE_URL}/api/users/{admin_id}", json={"password": newp}, timeout=15
    )
    assert r.status_code in (200, 204), f"change password failed: {r.status_code} {r.text}"

    # Re-login with new password — exercises bcrypt verify path.
    r2 = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN["email"], "password": newp},
        headers={"Origin": ORIGIN},
        timeout=10,
    )
    assert r2.status_code == 200, f"login with new pwd failed: {r2.text}"

    # Revert.
    r3 = session.put(
        f"{BASE_URL}/api/users/{admin_id}", json={"password": orig}, timeout=15
    )
    assert r3.status_code in (200, 204), f"revert password failed: {r3.text}"

    # Confirm original works again.
    r4 = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=ADMIN,
        headers={"Origin": ORIGIN},
        timeout=10,
    )
    assert r4.status_code == 200, f"login with original pwd failed: {r4.text}"
