"""Iteration 150 — Windows single-port PRODUCTION mode + auth playbook checks.

PROD mode: FastAPI on :8001 serves /app/frontend/build (SPA) plus /api.
Preview (dev) regression is covered against REACT_APP_BACKEND_URL.
"""
import os
import re
import json
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
_preview = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not _preview:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
PREVIEW_URL = _preview.rstrip("/")
LOCAL_URL = "http://localhost:8001"
BUILD = Path("/app/frontend/build")

CREDS = {"email": "admin@erp.com", "password": "Admin@123"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ─── Module: SPA static serving (single-port production mode) ───
class TestSpaServing:
    @pytest.mark.parametrize("path", ["/", "/login", "/dashboard", "/items", "/bom/nested/deep"])
    def test_spa_routes_return_index_html(self, client, path):
        r = client.get(f"{LOCAL_URL}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code}"
        assert "text/html" in r.headers.get("content-type", "")
        assert "<div id=\"root\">" in r.text or "root" in r.text

    def test_main_bundle_served(self, client):
        index = client.get(f"{LOCAL_URL}/").text
        m = re.search(r'src="(/static/js/[^"]+\.js)"', index)
        assert m, "main bundle reference not found in index.html"
        r = client.get(f"{LOCAL_URL}{m.group(1)}")
        assert r.status_code == 200
        assert "javascript" in r.headers.get("content-type", "")
        assert len(r.content) > 10000

    def test_unknown_api_route_returns_json_404(self, client):
        r = client.get(f"{LOCAL_URL}/api/does-not-exist")
        assert r.status_code == 404
        assert "application/json" in r.headers.get("content-type", "")
        assert "detail" in r.json()

    def test_manifest_json(self, client):
        """Post-fix expectation: a missing asset WITH an extension must 404 JSON, not SPA HTML."""
        r = client.get(f"{LOCAL_URL}/manifest.json")
        if (BUILD / "manifest.json").is_file():
            assert r.status_code == 200
            json.loads(r.text)
        else:
            assert r.status_code == 404, f"/manifest.json -> {r.status_code}"
            assert "application/json" in r.headers.get("content-type", "")

    def test_build_dir_present(self):
        assert (BUILD / "index.html").is_file()


# ─── Module: auth on the single-port origin ───
class TestAuthSameOrigin:
    def test_login_sets_httponly_cookies(self, client):
        s = requests.Session()
        r = s.post(f"{LOCAL_URL}/api/auth/login", json=CREDS)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == CREDS["email"]
        assert data["role"] == "admin"
        raw = "; ".join(r.headers.get_all("Set-Cookie")) if hasattr(r.headers, "get_all") else r.headers.get("Set-Cookie", "")
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies
        assert "HttpOnly" in raw

        # NOTE: python-requests refuses to replay `Secure` cookies over http://,
        # so replay them explicitly via the Cookie header (browsers DO accept them
        # on http://localhost because localhost is a trustworthy origin).
        jar = {"Cookie": f"access_token={s.cookies['access_token']}"}
        me = requests.get(f"{LOCAL_URL}/api/auth/me", headers=jar)
        assert me.status_code == 200, me.text[:200]
        assert me.json()["email"] == CREDS["email"]

        stats = requests.get(f"{LOCAL_URL}/api/dashboard/stats", headers=jar)
        assert stats.status_code == 200
        assert isinstance(stats.json(), dict)

    def test_bad_password_401(self, client):
        r = client.post(f"{LOCAL_URL}/api/auth/login", json={"email": CREDS["email"], "password": "wrong-pass-x"})
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_protected_route_without_cookie_401(self, client):
        r = requests.get(f"{LOCAL_URL}/api/auth/me")
        assert r.status_code == 401

    def test_bcrypt_hash_format(self):
        from pymongo import MongoClient
        env = dotenv_values("/app/backend/.env")
        c = MongoClient(env["MONGO_URL"])
        u = c[env["DB_NAME"]].users.find_one({"email": CREDS["email"]})
        assert u is not None
        assert u["password_hash"].startswith("$2b$"), u["password_hash"][:10]

    def test_brute_force_lockout(self):
        """Playbook: account should lock (423/429) after 5 consecutive failures."""
        s = requests.Session()
        codes = []
        for _ in range(6):
            r = s.post(f"{LOCAL_URL}/api/auth/login",
                       json={"email": "bruteforce_probe@erp.com", "password": "bad"})
            codes.append(r.status_code)
        assert any(c in (423, 429) for c in codes), f"no lockout after 6 failures, codes={codes}"

    def test_login_after_probe_still_works(self, client):
        r = client.post(f"{LOCAL_URL}/api/auth/login", json=CREDS)
        assert r.status_code == 200


# ─── Module: preview (dev) regression after craco env-order change ───
class TestPreviewRegression:
    def test_preview_login_and_dashboard(self):
        s = requests.Session()
        r = s.post(f"{PREVIEW_URL}/api/auth/login", json=CREDS)
        assert r.status_code == 200, r.text[:300]
        me = s.get(f"{PREVIEW_URL}/api/auth/me")
        assert me.status_code == 200
        stats = s.get(f"{PREVIEW_URL}/api/dashboard/stats")
        assert stats.status_code == 200
        body = stats.json()
        assert "total_items" in body or len(body) > 0

    def test_preview_frontend_html(self):
        r = requests.get(f"{PREVIEW_URL}/login")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")

    def test_items_and_boms_lists(self):
        s = requests.Session()
        assert s.post(f"{PREVIEW_URL}/api/auth/login", json=CREDS).status_code == 200
        for ep in ["/api/items?limit=5", "/api/bom?limit=5"]:
            r = s.get(f"{PREVIEW_URL}{ep}")
            assert r.status_code == 200, f"{ep} -> {r.status_code} {r.text[:200]}"
            payload = r.json()
            rows = payload if isinstance(payload, list) else payload.get("items", payload.get("data", []))
            assert isinstance(rows, list)
            for row in rows:
                assert "_id" not in row, f"MongoDB _id leaked in {ep}"
