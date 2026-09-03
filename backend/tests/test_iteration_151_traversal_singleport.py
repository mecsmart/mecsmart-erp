"""Iteration 151 — retest of the single-port PRODUCTION mode after the path-traversal fix.

Covers:
  * SPA catch-all path traversal (encoded, double-encoded, backslash, absolute) must never leak files
  * Missing static assets WITH an extension -> 404 JSON; extension-less routes -> index.html 200
  * Existing bundle referenced by index.html still 200
  * Auth on the single-port origin (same-origin cookies)
"""
import re
import json
from pathlib import Path

import pytest
import requests

LOCAL_URL = "http://localhost:8001"
BUILD = Path("/app/frontend/build")
CREDS = {"email": "admin@erp.com", "password": "Admin@123"}

# Secrets that must never appear in any response body
SECRET_MARKERS = ["JWT_SECRET", "MONGO_URL", "ADMIN_PASSWORD", "root:x:0:0"]

TRAVERSAL_PATHS = [
    "/..%2f..%2fbackend/.env",
    "/..%2f..%2f..%2fetc/passwd",
    "/static/../../backend/.env",
    "/%252e%252e%252f%252e%252e%252fbackend/.env",
    "/%2e%2e/%2e%2e/backend/.env",
    "/..%5c..%5cbackend/.env",
    "/....//....//backend/.env",
    "//etc/passwd",
    "/static/..%2f..%2f..%2fbackend/.env",
    "/..%2F..%2Fbackend%2F.env",
    "/..%c0%af..%c0%afbackend/.env",
    "/%2e%2e%2f%2e%2e%2fbackend%2f.env",
]


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    return s


# ─── Module: SPA catch-all path traversal (security) ───
class TestPathTraversal:
    @pytest.mark.parametrize("path", TRAVERSAL_PATHS)
    def test_no_file_leak(self, path):
        # requests normalises paths; use a raw socket-level request instead so the
        # encoded/dot segments reach uvicorn exactly as written.
        import http.client

        conn = http.client.HTTPConnection("localhost", 8001, timeout=15)
        conn.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
        conn.putheader("Host", "localhost:8001")
        conn.endheaders()
        resp = conn.getresponse()
        body = resp.read().decode("utf-8", "replace")
        ctype = resp.getheader("content-type", "")
        conn.close()

        for marker in SECRET_MARKERS:
            assert marker not in body, f"{path} leaked '{marker}' (status {resp.status})"
        assert resp.status in (200, 400, 404), f"{path} -> unexpected {resp.status}"
        if resp.status == 200:
            # only acceptable 200 is the SPA index.html fallback
            assert "text/html" in ctype, f"{path} -> 200 {ctype} (not the SPA fallback)"
            assert '<div id="root">' in body, f"{path} -> 200 html but not index.html"


# ─── Module: missing asset handling ───
class TestMissingAssets:
    @pytest.mark.parametrize("path", ["/favicon.ico", "/manifest.json", "/static/js/nope.js",
                                      "/robots.txt", "/nope.png"])
    def test_missing_asset_with_extension_returns_404(self, client, path):
        r = client.get(f"{LOCAL_URL}{path}")
        assert r.status_code == 404, f"{path} -> {r.status_code} {r.headers.get('content-type')}"
        assert "application/json" in r.headers.get("content-type", "")
        assert "detail" in r.json()

    @pytest.mark.parametrize("path", ["/", "/dashboard", "/items", "/login", "/bom/nested/deep"])
    def test_spa_routes_serve_index_html(self, client, path):
        r = client.get(f"{LOCAL_URL}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code}"
        assert "text/html" in r.headers.get("content-type", "")
        assert '<div id="root">' in r.text

    def test_existing_bundle_still_served(self, client):
        index = client.get(f"{LOCAL_URL}/").text
        m = re.search(r'src="(/static/js/[^"]+\.js)"', index)
        assert m, "main bundle reference not found in index.html"
        r = client.get(f"{LOCAL_URL}{m.group(1)}")
        assert r.status_code == 200
        assert "javascript" in r.headers.get("content-type", "")
        assert len(r.content) > 10000

    def test_asset_manifest_real_file_served(self, client):
        r = client.get(f"{LOCAL_URL}/asset-manifest.json")
        assert r.status_code == 200
        json.loads(r.text)

    def test_unknown_api_route_json_404(self, client):
        r = client.get(f"{LOCAL_URL}/api/does-not-exist")
        assert r.status_code == 404
        assert "application/json" in r.headers.get("content-type", "")


# ─── Module: auth on the single-port origin ───
class TestAuthSinglePort:
    def test_login_and_me(self):
        s = requests.Session()
        r = s.post(f"{LOCAL_URL}/api/auth/login", json=CREDS)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["email"] == CREDS["email"]
        assert data["role"] == "admin"
        raw = "; ".join(r.raw.headers.get_all("Set-Cookie")) if hasattr(r.raw.headers, "get_all") else r.headers.get("Set-Cookie", "")
        assert "HttpOnly" in raw
        assert "access_token" in s.cookies and "refresh_token" in s.cookies

        # Secure cookies are not replayed by requests over http:// — send explicitly
        hdr = {"Cookie": f"access_token={s.cookies['access_token']}"}
        me = requests.get(f"{LOCAL_URL}/api/auth/me", headers=hdr)
        assert me.status_code == 200, me.text[:200]
        assert me.json()["email"] == CREDS["email"]
        stats = requests.get(f"{LOCAL_URL}/api/dashboard/stats", headers=hdr)
        assert stats.status_code == 200
        assert isinstance(stats.json(), dict)

    def test_bad_password_401(self, client):
        r = requests.post(f"{LOCAL_URL}/api/auth/login",
                          json={"email": CREDS["email"], "password": "wrong-pass-x"})
        assert r.status_code == 401

    def test_protected_without_cookie_401(self):
        r = requests.get(f"{LOCAL_URL}/api/auth/me")
        assert r.status_code == 401
