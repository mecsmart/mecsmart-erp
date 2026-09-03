"""Iteration 156 — Quotation list bulk-enrichment perf + Item Group searchable select support.

Covers:
  * GET /api/crm/quotations (bulk enrichment output parity, filters, latency)
  * GET /api/items?lite=1 (lite payload used by lazy CRM item load)
  * GET /api/item-groups (source list for the searchable Item Group select)
  * POST/GET/DELETE /api/items with group_id persistence
"""
import os
import re
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")


@pytest.fixture(scope="session")
def test_credentials():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    c = p.read_text(encoding="utf-8")
    e = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?email(?:\*\*)?\s*:\s*`?([^`\s]+)', c)
    pw = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?password(?:\*\*)?\s*:\s*`?([^`\s]+)', c)
    if not e or not pw:
        pytest.skip("No creds in test_credentials.md")
    return {"email": e.group(1), "password": pw.group(1)}


@pytest.fixture(scope="session")
def client(test_credentials):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=test_credentials, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"Login failed {r.status_code}: {r.text[:300]}")
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    # httpOnly cookie check (auth playbook)
    assert any(c.lower() in ("access_token", "session_token", "token", "refresh_token")
               for c in s.cookies.keys()) or tok, "No auth cookie nor token returned"
    return s


# ---------- auth playbook basics ----------
class TestAuthBasics:
    def test_login_sets_httponly_cookie(self, test_credentials):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=test_credentials, timeout=60)
        assert r.status_code == 200
        raw = r.headers.get("set-cookie", "")
        assert raw, "No Set-Cookie header on login"
        assert "httponly" in raw.lower(), f"Cookie not HttpOnly: {raw[:200]}"

    def test_me_endpoint(self, client):
        r = client.get(f"{BASE_URL}/api/auth/me", timeout=60)
        assert r.status_code == 200
        assert r.json().get("email")


# ---------- CRM quotations ----------
class TestQuotationsList:
    def test_list_200_and_latency(self, client):
        t0 = time.time()
        r = client.get(f"{BASE_URL}/api/crm/quotations", timeout=120)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, list)
        print(f"quotations: {len(data)} docs in {elapsed:.2f}s")
        assert elapsed < 15, f"quotation list too slow: {elapsed:.2f}s"

    def test_enrichment_fields(self, client):
        docs = client.get(f"{BASE_URL}/api/crm/quotations", timeout=120).json()
        if not docs:
            pytest.skip("no quotations seeded")
        for d in docs[:40]:
            assert "_id" not in d
            assert isinstance(d.get("is_locked"), bool), f"is_locked missing/not bool on {d.get('quotation_no')}"
            assert "created_by_user" in d
            for k in ("cgst", "sgst", "igst"):
                assert k in d, f"{k} missing on {d.get('quotation_no')}"
            assert "hsn_summary" in d
            if d.get("customer_id"):
                assert "customer" in d, f"customer key missing for {d.get('quotation_no')}"
                if d["customer"] is None:
                    # customer master deleted — same None as the per-doc enrichment;
                    # UI must fall back to the stored customer_name snapshot.
                    assert d.get("customer_name"), f"orphan customer_id and no customer_name on {d.get('quotation_no')}"
                else:
                    assert d["customer"].get("name")
            if d.get("lead_id"):
                assert "lead" in d, f"lead key missing for {d.get('quotation_no')}"
                if d["lead"]:
                    assert "lead_no" in d["lead"]
            for ln in (d.get("lines") or []):
                if ln.get("item_id") and ln.get("item"):
                    it = ln["item"]
                    for k in ("part_number", "name"):
                        assert k in it, f"item.{k} missing"
                    # hsn_code/gst_rate only present when the item master has them
                    # (projection omits absent fields) — same behaviour as the
                    # per-doc enrichment, so absence is data, not a regression.

    def test_bulk_matches_single_doc_payload(self, client):
        docs = client.get(f"{BASE_URL}/api/crm/quotations", timeout=120).json()
        if not docs:
            pytest.skip("no quotations")
        qid = docs[0]["id"]
        r = client.get(f"{BASE_URL}/api/crm/quotations/{qid}", timeout=60)
        if r.status_code in (404, 405):
            pytest.skip("no single-quotation GET endpoint")
        assert r.status_code == 200, r.text[:300]
        single = r.json()
        bulk = docs[0]
        for k in ("id", "quotation_no", "customer_id", "lead_id", "is_locked",
                  "cgst", "sgst", "igst", "grand_total", "total_amount",
                  "created_by_user", "customer", "lead", "hsn_summary"):
            if k in single or k in bulk:
                assert single.get(k) == bulk.get(k), f"mismatch on '{k}': single={single.get(k)!r} bulk={bulk.get(k)!r}"
        sl, bl = single.get("lines") or [], bulk.get("lines") or []
        assert len(sl) == len(bl)
        for a, b in zip(sl, bl):
            assert a.get("item") == b.get("item"), "line.item mismatch between single and bulk enrichment"

    def test_filter_status_draft(self, client):
        r = client.get(f"{BASE_URL}/api/crm/quotations?status=draft", timeout=120)
        assert r.status_code == 200
        for d in r.json():
            assert d.get("status") == "draft"

    def test_filter_lead_id(self, client):
        docs = client.get(f"{BASE_URL}/api/crm/quotations", timeout=120).json()
        lead_docs = [d for d in docs if d.get("lead_id")]
        if not lead_docs:
            pytest.skip("no quotation with lead_id")
        lid = lead_docs[0]["lead_id"]
        r = client.get(f"{BASE_URL}/api/crm/quotations?lead_id={lid}", timeout=120)
        assert r.status_code == 200
        got = r.json()
        assert len(got) >= 1
        for d in got:
            assert d["lead_id"] == lid

    def test_unauthenticated_rejected(self):
        r = requests.get(f"{BASE_URL}/api/crm/quotations", timeout=60)
        assert r.status_code in (401, 403), r.status_code


# ---------- items lite ----------
class TestItemsLite:
    def test_lite_smaller_and_has_needed_fields(self, client):
        t0 = time.time()
        lite = client.get(f"{BASE_URL}/api/items?lite=1", timeout=120)
        t_lite = time.time() - t0
        assert lite.status_code == 200, lite.text[:300]
        ldata = lite.json()
        litems = ldata if isinstance(ldata, list) else ldata.get("items", [])
        assert litems, "lite items list empty"
        size_lite = len(lite.content)

        t0 = time.time()
        full = client.get(f"{BASE_URL}/api/items", timeout=180)
        t_full = time.time() - t0
        assert full.status_code == 200
        size_full = len(full.content)
        print(f"lite={size_lite}B/{t_lite:.2f}s full={size_full}B/{t_full:.2f}s count={len(litems)}")
        assert size_lite < size_full, "lite payload is not smaller than full"

        for it in litems[:20]:
            assert "_id" not in it
            for k in ("id", "part_number", "name"):
                assert k in it, f"lite item missing {k}"
        # hsn_code/gst_rate must be projected when present on the master
        with_hsn = [i for i in litems if i.get("hsn_code")]
        assert with_hsn, "no lite item carries hsn_code — quotation dialog autofill would break"


# ---------- item groups + item group_id persistence ----------
class TestItemGroups:
    created_items = []

    def test_list_item_groups(self, client):
        r = client.get(f"{BASE_URL}/api/item-groups", timeout=60)
        assert r.status_code == 200, r.text[:300]
        groups = r.json()
        assert isinstance(groups, list)
        if groups:
            g = groups[0]
            assert "_id" not in g
            assert g.get("id") and g.get("name")

    def test_create_item_with_group_persists(self, client):
        groups = client.get(f"{BASE_URL}/api/item-groups", timeout=60).json()
        if not groups:
            pytest.skip("no item groups defined")
        grp = next((g for g in groups if g.get("default_hsn_code")), groups[0])
        payload = {
            "part_number": f"TEST_IG_{int(time.time())}",
            "name": "TEST_ Item Group Persistence",
            "category": grp.get("parent_category") or "raw_material",
            "unit_of_measure": "PCS",
            "group_id": grp["id"],
        }
        r = client.post(f"{BASE_URL}/api/items", json=payload, timeout=60)
        assert r.status_code in (200, 201), r.text[:400]
        created = r.json()
        iid = created.get("id")
        assert iid
        TestItemGroups.created_items.append(iid)
        assert created.get("group_id") == grp["id"]

        g = client.get(f"{BASE_URL}/api/items/{iid}", timeout=60)
        assert g.status_code == 200
        fetched = g.json()
        assert fetched.get("group_id") == grp["id"], "group_id not persisted"
        if grp.get("default_hsn_code"):
            assert fetched.get("hsn_code") == grp["default_hsn_code"], \
                f"HSN not inherited from group: {fetched.get('hsn_code')} vs {grp['default_hsn_code']}"

    def test_clear_group_on_update(self, client):
        if not TestItemGroups.created_items:
            pytest.skip("nothing created")
        iid = TestItemGroups.created_items[0]
        r = client.put(f"{BASE_URL}/api/items/{iid}", json={"group_id": ""}, timeout=60)
        assert r.status_code in (200, 204), r.text[:300]
        fetched = client.get(f"{BASE_URL}/api/items/{iid}", timeout=60).json()
        assert not fetched.get("group_id"), f"group_id not cleared: {fetched.get('group_id')!r}"

    @pytest.fixture(scope="class", autouse=True)
    def cleanup(self, client):
        yield
        for iid in TestItemGroups.created_items:
            client.delete(f"{BASE_URL}/api/items/{iid}", timeout=60)


# ---------- regression ----------
class TestRegression:
    @pytest.mark.parametrize("path", [
        "/api/crm/leads", "/api/crm/tickets", "/api/customers",
        "/api/bom", "/api/item-groups", "/api/items?lite=1",
    ])
    def test_endpoints_ok(self, client, path):
        r = client.get(f"{BASE_URL}{path}", timeout=120)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
