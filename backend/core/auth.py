"""Authentication primitives — password hashing, JWT issuing, and the FastAPI
`get_current_user` dependency used by every protected route.

These pieces live together because they share the same JWT secret/algorithm
configuration and all flow through `get_current_user`.
"""
import os
from datetime import datetime, timezone, timedelta
from typing import List

import bcrypt
import jwt
import secrets
from bson import ObjectId
from fastapi import HTTPException, Request

from .db import db
from .permissions import (
    ALL_MODULES,
    allowed_actions_for,
    get_default_permissions,
)

# JWT config — JWT_SECRET defaults to a fresh random token if the env var is
# missing, which means every process restart invalidates old tokens (acceptable
# for dev; production should always set JWT_SECRET).
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))


# -------- Password utilities --------

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


# -------- JWT utilities --------

def get_jwt_secret() -> str:
    return JWT_SECRET


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


# -------- Current-user dependency --------

async def get_current_user(request: Request) -> dict:
    """Resolve the authenticated user from the access cookie or Bearer token.

    Overlays the user's role-group permissions and auto-elevates to `admin`
    when the user either belongs to an admin role-group or already holds every
    granular permission. The returned dict never contains `password_hash`.
    """
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        del user["_id"]
        user.pop("password_hash", None)
        # Ensure permissions exist
        if "permissions" not in user or not user["permissions"]:
            user["permissions"] = get_default_permissions(user.get("role", "inventory_manager"))
        # Overlay role_group permissions + admin-group flag (mirrors /auth/me logic)
        group_id = user.get("role_group_id")
        if group_id:
            try:
                group = await db.role_groups.find_one({"id": group_id}, {"_id": 0})
            except Exception:
                group = None
            if group:
                if group.get("permissions"):
                    user["permissions"] = group["permissions"]
                user["is_admin_group"] = bool(group.get("is_admin_group"))
        # Auto-elevate effective role to "admin" when the user either
        #   (a) belongs to an admin role_group, OR
        #   (b) has every action on every module in their effective permissions.
        # This unblocks all hardcoded `user["role"] not in [...]` route guards
        # for users who legitimately hold all granular permissions.
        if user.get("is_admin_group"):
            user["role"] = "admin"
        else:
            perms = user.get("permissions") or {}
            try:
                if perms and all(
                    set(allowed_actions_for(m)).issubset(set(perms.get(m, [])))
                    for m in ALL_MODULES
                ):
                    user["role"] = "admin"
            except Exception:
                pass
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# -------- Cookie helper --------

def get_cookie_settings():
    """Decide `secure`/`samesite` cookie flags based on environment.

    In production (Emergent-hosted or with explicit CORS_ORIGINS=*) we must use
    `secure=True; samesite=none` so the browser includes credentials on
    cross-site fetches. In dev we use the more lenient `lax` defaults.
    """
    frontend_url = os.environ.get("FRONTEND_URL", "")
    cors_origins = os.environ.get("CORS_ORIGINS", "")
    is_prod = (
        any(domain in frontend_url for domain in ["emergent.host", "emergentagent.com"]) or
        cors_origins == "*" or
        os.environ.get("ENVIRONMENT") == "production"
    )
    return {"secure": is_prod, "samesite": "none" if is_prod else "lax"}


# -------- Authorization helpers --------

def require_roles(allowed_roles: List[str]):
    async def role_checker(request: Request):
        user = await get_current_user(request)
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return role_checker


def _require_access(user: dict, allowed_roles: list, module: str = None, action: str = None):
    """Authorization helper.

    Grants access if EITHER:
      (a) `user["role"]` is in `allowed_roles` (legacy role-only path), OR
      (b) the user has `action` on `module` in their effective permissions dict.
    Raises HTTPException(403) otherwise. `module` & `action` are optional — if
    omitted this falls back to strict role-only behaviour.
    """
    if allowed_roles and user.get("role") in allowed_roles:
        return
    if module and action:
        perms = user.get("permissions") or {}
        module_perms = perms.get(module) or []
        if action in module_perms:
            return
    raise HTTPException(status_code=403, detail="Insufficient permissions")
