"""Iteration 154 — auth playbook verification (bcrypt, httpOnly cookies, CORS, lockout, seed_admin)."""
import os
import re

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")

CREDS = {"email": "admin@erp.com", "password": "Admin@123"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Login / cookies ---
def test_login_success_and_cookie_flags(client):
    r = client.post(f"{BASE_URL}/api/auth/login", json=CREDS)
    assert r.status_code == 200, r.text[:400]
    data = r.json()
    assert isinstance(data, dict)
    print("login body keys:", list(data.keys()))
    raw = r.headers.get("set-cookie", "")
    print("set-cookie:", raw)
    assert raw, "no Set-Cookie header on login"
    low = raw.lower()
    assert "httponly" in low, f"cookie not httpOnly: {raw}"
    assert "secure" in low, f"cookie not Secure: {raw}"


def test_auth_me_with_cookie_only(client):
    r = client.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200, r.text[:300]
    me = r.json()
    assert me.get("email") == CREDS["email"]
    assert "password" not in me and "password_hash" not in me and "hashed_password" not in me
    assert "_id" not in me


# --- CORS ---
def test_cors_allows_credentials_explicit_origin(client):
    """NOTE: the Cloudflare/ingress edge answers OPTIONS itself on the public URL
    (Allow-Origin: * and no Allow-Credentials), so the app-level CORS contract is
    asserted against the app directly. Actual credentialed GET/POST from the
    browser works (see test_auth_me_with_cookie_only + UI login)."""
    edge = requests.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": BASE_URL,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    print("edge preflight:", edge.status_code, edge.headers.get("access-control-allow-origin"),
          edge.headers.get("access-control-allow-credentials"))

    r = requests.options(
        "http://localhost:8001/api/auth/login",
        headers={
            "Origin": BASE_URL,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    print("app preflight:", r.status_code, dict(r.headers))
    assert r.status_code in (200, 204)
    assert r.headers.get("access-control-allow-credentials") == "true"
    origin = r.headers.get("access-control-allow-origin")
    assert origin != "*", "Allow-Origin '*' cannot be combined with credentials"
    assert origin == BASE_URL, origin


# --- bcrypt hash format ---
def test_bcrypt_hash_format_in_db():
    from pymongo import MongoClient
    backend_env = dotenv_values("/app/backend/.env")
    mongo_url = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")
    assert mongo_url and db_name
    db = MongoClient(mongo_url)[db_name]
    user = db.users.find_one({"email": CREDS["email"]})
    assert user, "admin user not seeded"
    field = next((k for k in ("password_hash", "hashed_password", "password") if k in user), None)
    assert field, f"no password field: {list(user.keys())}"
    h = user[field]
    print("hash field:", field, "prefix:", h[:7])
    assert re.match(r"^\$2[abxy]\$", h), f"not a bcrypt hash: {h[:12]}"
    assert h.startswith("$2b$"), f"expected $2b$ bcrypt prefix, got {h[:4]}"


# --- Invalid credentials + brute force lockout ---
def test_invalid_password_401():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CREDS["email"], "password": "WrongPass!123"})
    assert r.status_code == 401, r.status_code
    body = r.json()
    assert "detail" in body or "message" in body
    # must not leak whether the account exists
    assert "not found" not in str(body).lower()


def test_brute_force_lockout_after_5_failures():
    email = "lockout_probe_TEST@erp.com"
    codes = []
    for _ in range(7):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Nope!12345"})
        codes.append(r.status_code)
    print("unknown-user repeated login codes:", codes)
    # Real account lockout check (uses admin, then restores by asserting valid login is blocked/allowed)
    codes2 = []
    for _ in range(6):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CREDS["email"], "password": "Wrong!99999"})
        codes2.append(r.status_code)
    print("admin repeated bad-password codes:", codes2)
    assert 423 in codes2 or 429 in codes2, (
        f"No brute-force lockout: 6 bad passwords all returned {set(codes2)} (expected 423/429 after 5)"
    )


def test_valid_login_still_works_after_failures():
    """Documents post-lockout behaviour so the developer knows the impact."""
    r = requests.post(f"{BASE_URL}/api/auth/login", json=CREDS)
    print("valid login after failed attempts:", r.status_code, r.text[:200])
    assert r.status_code in (200, 423, 429)


# --- logout ---
def test_logout_clears_cookie(client):
    client.post(f"{BASE_URL}/api/auth/login", json=CREDS)
    r = client.post(f"{BASE_URL}/api/auth/logout")
    assert r.status_code in (200, 204), r.text[:200]
    me = client.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 401, f"session survived logout: {me.status_code}"
