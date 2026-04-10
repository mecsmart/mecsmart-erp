from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import bcrypt
import jwt
import secrets

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))

# Create the main app
app = FastAPI(title="Machinery Manufacturing ERP")

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth")
items_router = APIRouter(prefix="/items")
bom_router = APIRouter(prefix="/bom")
mrp_router = APIRouter(prefix="/mrp")
quality_router = APIRouter(prefix="/quality")
inventory_router = APIRouter(prefix="/inventory")
production_router = APIRouter(prefix="/production")
users_router = APIRouter(prefix="/users")
dashboard_router = APIRouter(prefix="/dashboard")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ================== MODELS ==================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "inventory_manager"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: datetime

class ItemCreate(BaseModel):
    part_number: str
    name: str
    description: Optional[str] = ""
    category: str  # raw_material, component, sub_assembly, finished_good
    unit_of_measure: str = "pcs"
    unit_cost: float = 0.0
    lead_time_days: int = 0
    safety_stock: int = 0
    current_stock: int = 0
    reorder_point: int = 0

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit_of_measure: Optional[str] = None
    unit_cost: Optional[float] = None
    lead_time_days: Optional[int] = None
    safety_stock: Optional[int] = None
    current_stock: Optional[int] = None
    reorder_point: Optional[int] = None

class BOMComponentCreate(BaseModel):
    item_id: str
    quantity: float
    unit_of_measure: str = "pcs"
    is_alternate: bool = False
    alternate_for: Optional[str] = None
    position: Optional[int] = None

class BOMCreate(BaseModel):
    parent_item_id: str
    name: str
    description: Optional[str] = ""
    revision: str = "A"
    effectivity_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    status: str = "draft"  # draft, active, obsolete
    components: List[BOMComponentCreate] = []

class BOMUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    revision: Optional[str] = None
    effectivity_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    status: Optional[str] = None
    components: Optional[List[BOMComponentCreate]] = None

class ProductionOrderCreate(BaseModel):
    bom_id: str
    quantity: int
    due_date: datetime
    priority: str = "medium"  # low, medium, high, urgent
    notes: Optional[str] = ""

class ProductionOrderUpdate(BaseModel):
    quantity: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class InspectionTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    category: str  # incoming, in_process, final
    checklist_items: List[Dict[str, Any]]

class InspectionRecordCreate(BaseModel):
    template_id: str
    item_id: str
    production_order_id: Optional[str] = None
    lot_number: Optional[str] = None
    quantity_inspected: int
    results: List[Dict[str, Any]]
    overall_result: str  # pass, fail, conditional

class InventoryTransactionCreate(BaseModel):
    item_id: str
    transaction_type: str  # receive, issue, adjust, transfer
    quantity: int
    reference_type: Optional[str] = None  # production_order, purchase_order, adjustment
    reference_id: Optional[str] = None
    notes: Optional[str] = ""

# ================== PASSWORD UTILS ==================

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# ================== JWT UTILS ==================

def get_jwt_secret() -> str:
    return JWT_SECRET

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
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
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_roles(allowed_roles: List[str]):
    async def role_checker(request: Request):
        user = await get_current_user(request)
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return role_checker

# ================== AUTH ROUTES ==================

@auth_router.post("/register")
async def register(user_data: UserCreate, response: Response):
    email = user_data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_doc = {
        "email": email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": user_data.role,
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {"id": user_id, "email": email, "name": user_data.name, "role": user_data.role}

@auth_router.post("/login")
async def login(user_data: UserLogin, response: Response, request: Request):
    email = user_data.email.lower()
    client_ip = request.client.host if request.client else "unknown"
    identifier = f"{client_ip}:{email}"
    
    # Check brute force
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        lockout_until = attempt.get("lockout_until")
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Account locked. Try again later.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})
    
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(user_data.password, user["password_hash"]):
        # Increment failed attempts
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {
                "$inc": {"count": 1},
                "$set": {"lockout_until": datetime.now(timezone.utc) + timedelta(minutes=15)}
            },
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Clear failed attempts on success
    await db.login_attempts.delete_one({"identifier": identifier})
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {"id": user_id, "email": user["email"], "name": user["name"], "role": user["role"]}

@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Logged out successfully"}

@auth_router.get("/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

@auth_router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload["sub"]
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        access_token = create_access_token(user_id, user["email"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ================== ITEMS ROUTES ==================

@items_router.get("")
async def get_items(request: Request, category: Optional[str] = None, search: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if category:
        query["category"] = category
    if search:
        query["$or"] = [
            {"part_number": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}}
        ]
    items = await db.items.find(query, {"_id": 0}).to_list(1000)
    return items

@items_router.get("/{item_id}")
async def get_item(item_id: str, request: Request):
    await get_current_user(request)
    item = await db.items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@items_router.post("")
async def create_item(item_data: ItemCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    existing = await db.items.find_one({"part_number": item_data.part_number})
    if existing:
        raise HTTPException(status_code=400, detail="Part number already exists")
    
    item_doc = {
        "id": str(uuid.uuid4()),
        **item_data.model_dump(),
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.items.insert_one(item_doc)
    item_doc.pop("_id", None)
    return item_doc

@items_router.put("/{item_id}")
async def update_item(item_id: str, item_data: ItemUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {k: v for k, v in item_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.items.update_one({"id": item_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
    item = await db.items.find_one({"id": item_id}, {"_id": 0})
    return item

@items_router.delete("/{item_id}")
async def delete_item(item_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    result = await db.items.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}

# ================== BOM ROUTES ==================

@bom_router.get("")
async def get_boms(request: Request, status: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    boms = await db.boms.find(query, {"_id": 0}).to_list(1000)
    
    # Enrich with parent item info
    for bom in boms:
        item = await db.items.find_one({"id": bom.get("parent_item_id")}, {"_id": 0})
        bom["parent_item"] = item
    return boms

@bom_router.get("/{bom_id}")
async def get_bom(bom_id: str, request: Request):
    await get_current_user(request)
    bom = await db.boms.find_one({"id": bom_id}, {"_id": 0})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    # Enrich with item details
    item = await db.items.find_one({"id": bom.get("parent_item_id")}, {"_id": 0})
    bom["parent_item"] = item
    
    # Enrich components with item details
    for comp in bom.get("components", []):
        comp_item = await db.items.find_one({"id": comp.get("item_id")}, {"_id": 0})
        comp["item"] = comp_item
        
        # Check if component has its own BOM (for multi-level)
        child_bom = await db.boms.find_one({"parent_item_id": comp.get("item_id"), "status": "active"}, {"_id": 0})
        comp["has_bom"] = child_bom is not None
        if child_bom:
            comp["child_bom_id"] = child_bom.get("id")
    
    return bom

@bom_router.get("/{bom_id}/explode")
async def explode_bom(bom_id: str, request: Request, levels: int = 10):
    """Get full multi-level BOM explosion"""
    await get_current_user(request)
    
    async def explode_level(bom_id: str, level: int, max_levels: int):
        if level > max_levels:
            return []
        
        bom = await db.boms.find_one({"id": bom_id}, {"_id": 0})
        if not bom:
            return []
        
        result = []
        for comp in bom.get("components", []):
            item = await db.items.find_one({"id": comp.get("item_id")}, {"_id": 0})
            comp_data = {
                "level": level,
                "item": item,
                "quantity": comp.get("quantity"),
                "is_alternate": comp.get("is_alternate", False),
                "children": []
            }
            
            # Check for child BOM
            child_bom = await db.boms.find_one({"parent_item_id": comp.get("item_id"), "status": "active"}, {"_id": 0})
            if child_bom:
                comp_data["children"] = await explode_level(child_bom.get("id"), level + 1, max_levels)
            
            result.append(comp_data)
        return result
    
    bom = await db.boms.find_one({"id": bom_id}, {"_id": 0})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    parent_item = await db.items.find_one({"id": bom.get("parent_item_id")}, {"_id": 0})
    explosion = await explode_level(bom_id, 1, levels)
    
    return {
        "bom": bom,
        "parent_item": parent_item,
        "explosion": explosion
    }

@bom_router.post("")
async def create_bom(bom_data: BOMCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Verify parent item exists
    parent_item = await db.items.find_one({"id": bom_data.parent_item_id})
    if not parent_item:
        raise HTTPException(status_code=404, detail="Parent item not found")
    
    bom_doc = {
        "id": str(uuid.uuid4()),
        "parent_item_id": bom_data.parent_item_id,
        "name": bom_data.name,
        "description": bom_data.description,
        "revision": bom_data.revision,
        "effectivity_date": bom_data.effectivity_date or datetime.now(timezone.utc),
        "expiry_date": bom_data.expiry_date,
        "status": bom_data.status,
        "components": [c.model_dump() for c in bom_data.components],
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.boms.insert_one(bom_doc)
    bom_doc.pop("_id", None)
    return bom_doc

@bom_router.put("/{bom_id}")
async def update_bom(bom_id: str, bom_data: BOMUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {}
    for k, v in bom_data.model_dump().items():
        if v is not None:
            if k == "components":
                update_data[k] = [c.model_dump() if hasattr(c, 'model_dump') else c for c in v]
            else:
                update_data[k] = v
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.boms.update_one({"id": bom_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    bom = await db.boms.find_one({"id": bom_id}, {"_id": 0})
    return bom

@bom_router.post("/{bom_id}/revise")
async def create_bom_revision(bom_id: str, new_revision: str, request: Request):
    """Create a new revision of an existing BOM"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    bom = await db.boms.find_one({"id": bom_id}, {"_id": 0})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    # Mark old BOM as obsolete
    await db.boms.update_one({"id": bom_id}, {"$set": {"status": "obsolete"}})
    
    # Create new revision
    new_bom = {
        "id": str(uuid.uuid4()),
        "parent_item_id": bom["parent_item_id"],
        "name": bom["name"],
        "description": bom.get("description", ""),
        "revision": new_revision,
        "previous_revision_id": bom_id,
        "effectivity_date": datetime.now(timezone.utc),
        "expiry_date": None,
        "status": "active",
        "components": bom.get("components", []),
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.boms.insert_one(new_bom)
    new_bom.pop("_id", None)
    return new_bom

@bom_router.delete("/{bom_id}")
async def delete_bom(bom_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    result = await db.boms.delete_one({"id": bom_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="BOM not found")
    return {"message": "BOM deleted"}

# ================== PRODUCTION ORDER ROUTES ==================

@production_router.get("")
async def get_production_orders(request: Request, status: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    orders = await db.production_orders.find(query, {"_id": 0}).to_list(1000)
    
    for order in orders:
        bom = await db.boms.find_one({"id": order.get("bom_id")}, {"_id": 0})
        if bom:
            order["bom"] = bom
            item = await db.items.find_one({"id": bom.get("parent_item_id")}, {"_id": 0})
            order["item"] = item
    return orders

@production_router.get("/{order_id}")
async def get_production_order(order_id: str, request: Request):
    await get_current_user(request)
    order = await db.production_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    
    bom = await db.boms.find_one({"id": order.get("bom_id")}, {"_id": 0})
    if bom:
        order["bom"] = bom
        item = await db.items.find_one({"id": bom.get("parent_item_id")}, {"_id": 0})
        order["item"] = item
    return order

@production_router.post("")
async def create_production_order(order_data: ProductionOrderCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    bom = await db.boms.find_one({"id": order_data.bom_id})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    # Generate order number
    count = await db.production_orders.count_documents({})
    order_number = f"PO-{str(count + 1).zfill(6)}"
    
    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "bom_id": order_data.bom_id,
        "quantity": order_data.quantity,
        "due_date": order_data.due_date,
        "priority": order_data.priority,
        "status": "planned",  # planned, released, in_progress, completed, cancelled
        "notes": order_data.notes,
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.production_orders.insert_one(order_doc)
    order_doc.pop("_id", None)
    return order_doc

@production_router.put("/{order_id}")
async def update_production_order(order_id: str, order_data: ProductionOrderUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {k: v for k, v in order_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.production_orders.update_one({"id": order_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Production order not found")
    
    order = await db.production_orders.find_one({"id": order_id}, {"_id": 0})
    return order

# ================== MRP ROUTES ==================

@mrp_router.get("/demand")
async def calculate_demand(request: Request, production_order_id: Optional[str] = None):
    """Calculate material requirements based on production orders"""
    await get_current_user(request)
    
    query = {"status": {"$in": ["planned", "released", "in_progress"]}}
    if production_order_id:
        query["id"] = production_order_id
    
    orders = await db.production_orders.find(query, {"_id": 0}).to_list(1000)
    
    demand = {}
    for order in orders:
        bom = await db.boms.find_one({"id": order.get("bom_id")}, {"_id": 0})
        if not bom:
            continue
        
        # Explode BOM and calculate requirements
        for comp in bom.get("components", []):
            if comp.get("is_alternate"):
                continue
            item_id = comp.get("item_id")
            qty_needed = comp.get("quantity", 0) * order.get("quantity", 0)
            
            if item_id not in demand:
                item = await db.items.find_one({"id": item_id}, {"_id": 0})
                demand[item_id] = {
                    "item": item,
                    "gross_requirement": 0,
                    "on_hand": item.get("current_stock", 0) if item else 0,
                    "safety_stock": item.get("safety_stock", 0) if item else 0,
                    "net_requirement": 0,
                    "orders": []
                }
            
            demand[item_id]["gross_requirement"] += qty_needed
            demand[item_id]["orders"].append({
                "order_id": order.get("id"),
                "order_number": order.get("order_number"),
                "quantity_needed": qty_needed,
                "due_date": order.get("due_date")
            })
    
    # Calculate net requirements
    for item_id, data in demand.items():
        available = data["on_hand"] - data["safety_stock"]
        data["net_requirement"] = max(0, data["gross_requirement"] - available)
    
    return list(demand.values())

@mrp_router.get("/suggestions")
async def get_purchase_suggestions(request: Request):
    """Get purchase order suggestions based on reorder points and MRP"""
    await get_current_user(request)
    
    suggestions = []
    
    # Check items below reorder point
    items = await db.items.find({"$expr": {"$lte": ["$current_stock", "$reorder_point"]}}, {"_id": 0}).to_list(1000)
    
    for item in items:
        if item.get("current_stock", 0) <= item.get("reorder_point", 0):
            suggested_qty = item.get("safety_stock", 0) * 2 - item.get("current_stock", 0)
            suggestions.append({
                "item": item,
                "reason": "below_reorder_point",
                "current_stock": item.get("current_stock", 0),
                "reorder_point": item.get("reorder_point", 0),
                "safety_stock": item.get("safety_stock", 0),
                "suggested_quantity": max(suggested_qty, 1),
                "lead_time_days": item.get("lead_time_days", 0),
                "estimated_cost": max(suggested_qty, 1) * item.get("unit_cost", 0)
            })
    
    # Check MRP demand
    demand = await calculate_demand(request)
    for d in demand:
        if d.get("net_requirement", 0) > 0:
            item = d.get("item")
            # Check if not already in suggestions
            if item and not any(s.get("item", {}).get("id") == item.get("id") for s in suggestions):
                suggestions.append({
                    "item": item,
                    "reason": "mrp_requirement",
                    "current_stock": item.get("current_stock", 0),
                    "net_requirement": d.get("net_requirement", 0),
                    "suggested_quantity": d.get("net_requirement", 0),
                    "lead_time_days": item.get("lead_time_days", 0),
                    "estimated_cost": d.get("net_requirement", 0) * item.get("unit_cost", 0)
                })
    
    return suggestions

# ================== QUALITY ROUTES ==================

@quality_router.get("/templates")
async def get_inspection_templates(request: Request, category: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if category:
        query["category"] = category
    templates = await db.inspection_templates.find(query, {"_id": 0}).to_list(1000)
    return templates

@quality_router.get("/templates/{template_id}")
async def get_inspection_template(template_id: str, request: Request):
    await get_current_user(request)
    template = await db.inspection_templates.find_one({"id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@quality_router.post("/templates")
async def create_inspection_template(template_data: InspectionTemplateCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "quality_inspector"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    template_doc = {
        "id": str(uuid.uuid4()),
        **template_data.model_dump(),
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.inspection_templates.insert_one(template_doc)
    template_doc.pop("_id", None)
    return template_doc

@quality_router.get("/inspections")
async def get_inspections(request: Request, result: Optional[str] = None, item_id: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if result:
        query["overall_result"] = result
    if item_id:
        query["item_id"] = item_id
    inspections = await db.inspections.find(query, {"_id": 0}).to_list(1000)
    
    for insp in inspections:
        item = await db.items.find_one({"id": insp.get("item_id")}, {"_id": 0})
        insp["item"] = item
        template = await db.inspection_templates.find_one({"id": insp.get("template_id")}, {"_id": 0})
        insp["template"] = template
    return inspections

@quality_router.post("/inspections")
async def create_inspection(inspection_data: InspectionRecordCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "quality_inspector"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Generate inspection number
    count = await db.inspections.count_documents({})
    inspection_number = f"INS-{str(count + 1).zfill(6)}"
    
    inspection_doc = {
        "id": str(uuid.uuid4()),
        "inspection_number": inspection_number,
        **inspection_data.model_dump(),
        "inspected_by": user["id"],
        "inspected_by_name": user.get("name"),
        "inspection_date": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc)
    }
    await db.inspections.insert_one(inspection_doc)
    inspection_doc.pop("_id", None)
    return inspection_doc

@quality_router.get("/metrics")
async def get_quality_metrics(request: Request, days: int = 30):
    """Get quality metrics for dashboard"""
    await get_current_user(request)
    
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    total = await db.inspections.count_documents({"inspection_date": {"$gte": start_date}})
    passed = await db.inspections.count_documents({"inspection_date": {"$gte": start_date}, "overall_result": "pass"})
    failed = await db.inspections.count_documents({"inspection_date": {"$gte": start_date}, "overall_result": "fail"})
    conditional = await db.inspections.count_documents({"inspection_date": {"$gte": start_date}, "overall_result": "conditional"})
    
    pass_rate = (passed / total * 100) if total > 0 else 0
    
    return {
        "total_inspections": total,
        "passed": passed,
        "failed": failed,
        "conditional": conditional,
        "pass_rate": round(pass_rate, 2),
        "period_days": days
    }

# ================== INVENTORY ROUTES ==================

@inventory_router.get("")
async def get_inventory(request: Request, category: Optional[str] = None, low_stock: bool = False):
    await get_current_user(request)
    query = {}
    if category:
        query["category"] = category
    if low_stock:
        query["$expr"] = {"$lte": ["$current_stock", "$reorder_point"]}
    
    items = await db.items.find(query, {"_id": 0}).to_list(1000)
    return items

@inventory_router.get("/transactions")
async def get_inventory_transactions(request: Request, item_id: Optional[str] = None, limit: int = 100):
    await get_current_user(request)
    query = {}
    if item_id:
        query["item_id"] = item_id
    
    transactions = await db.inventory_transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    for tx in transactions:
        item = await db.items.find_one({"id": tx.get("item_id")}, {"_id": 0})
        tx["item"] = item
    return transactions

@inventory_router.post("/transactions")
async def create_inventory_transaction(tx_data: InventoryTransactionCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "inventory_manager", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    item = await db.items.find_one({"id": tx_data.item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Calculate new stock
    current_stock = item.get("current_stock", 0)
    if tx_data.transaction_type == "receive":
        new_stock = current_stock + tx_data.quantity
    elif tx_data.transaction_type == "issue":
        new_stock = current_stock - tx_data.quantity
        if new_stock < 0:
            raise HTTPException(status_code=400, detail="Insufficient stock")
    elif tx_data.transaction_type == "adjust":
        new_stock = tx_data.quantity  # Direct adjustment
    else:
        new_stock = current_stock
    
    # Create transaction record
    tx_doc = {
        "id": str(uuid.uuid4()),
        **tx_data.model_dump(),
        "previous_stock": current_stock,
        "new_stock": new_stock,
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.inventory_transactions.insert_one(tx_doc)
    
    # Update item stock
    await db.items.update_one({"id": tx_data.item_id}, {"$set": {"current_stock": new_stock}})
    
    tx_doc.pop("_id", None)
    return tx_doc

# ================== USERS ROUTES (Admin only) ==================

@users_router.get("")
async def get_users(request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for u in users:
        u["id"] = str(u.get("id", ""))
    return users

@users_router.put("/{user_id}")
async def update_user(user_id: str, request: Request, role: Optional[str] = None, name: Optional[str] = None):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {}
    if role:
        update_data["role"] = role
    if name:
        update_data["name"] = name
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    # Find user by custom id field
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if result.matched_count == 0:
        # Try with ObjectId
        try:
            result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
        except:
            pass
    
    return {"message": "User updated"}

# ================== DASHBOARD ROUTES ==================

@dashboard_router.get("/stats")
async def get_dashboard_stats(request: Request):
    await get_current_user(request)
    
    # Item counts by category
    items_count = await db.items.count_documents({})
    raw_materials = await db.items.count_documents({"category": "raw_material"})
    components = await db.items.count_documents({"category": "component"})
    finished_goods = await db.items.count_documents({"category": "finished_good"})
    
    # Low stock items
    low_stock = await db.items.count_documents({"$expr": {"$lte": ["$current_stock", "$reorder_point"]}})
    
    # BOM counts
    active_boms = await db.boms.count_documents({"status": "active"})
    
    # Production orders
    pending_orders = await db.production_orders.count_documents({"status": {"$in": ["planned", "released"]}})
    in_progress = await db.production_orders.count_documents({"status": "in_progress"})
    
    # Quality metrics
    quality_metrics = await get_quality_metrics(request, days=30)
    
    return {
        "inventory": {
            "total_items": items_count,
            "raw_materials": raw_materials,
            "components": components,
            "finished_goods": finished_goods,
            "low_stock_alerts": low_stock
        },
        "bom": {
            "active_boms": active_boms
        },
        "production": {
            "pending_orders": pending_orders,
            "in_progress": in_progress
        },
        "quality": quality_metrics
    }

# ================== SEED DATA ==================

async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@erp.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hashed,
            "name": "System Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info(f"Admin password updated")

async def seed_sample_data():
    """Seed sample data for demonstration"""
    
    # Check if data already exists
    if await db.items.count_documents({}) > 0:
        return
    
    # Sample items
    items = [
        {"id": str(uuid.uuid4()), "part_number": "RM-001", "name": "Steel Sheet 4mm", "description": "Cold rolled steel sheet", "category": "raw_material", "unit_of_measure": "sheet", "unit_cost": 45.00, "lead_time_days": 7, "safety_stock": 50, "current_stock": 120, "reorder_point": 60},
        {"id": str(uuid.uuid4()), "part_number": "RM-002", "name": "Aluminum Bar 25mm", "description": "6061-T6 aluminum bar", "category": "raw_material", "unit_of_measure": "meter", "unit_cost": 28.50, "lead_time_days": 5, "safety_stock": 100, "current_stock": 85, "reorder_point": 80},
        {"id": str(uuid.uuid4()), "part_number": "RM-003", "name": "O-Ring Kit", "description": "NBR O-rings assorted", "category": "raw_material", "unit_of_measure": "kit", "unit_cost": 12.00, "lead_time_days": 3, "safety_stock": 200, "current_stock": 350, "reorder_point": 150},
        {"id": str(uuid.uuid4()), "part_number": "CP-001", "name": "Hydraulic Cylinder", "description": "50mm bore hydraulic cylinder", "category": "component", "unit_of_measure": "pcs", "unit_cost": 280.00, "lead_time_days": 14, "safety_stock": 10, "current_stock": 25, "reorder_point": 15},
        {"id": str(uuid.uuid4()), "part_number": "CP-002", "name": "Control Valve", "description": "Directional control valve 4/3", "category": "component", "unit_of_measure": "pcs", "unit_cost": 165.00, "lead_time_days": 10, "safety_stock": 15, "current_stock": 30, "reorder_point": 20},
        {"id": str(uuid.uuid4()), "part_number": "CP-003", "name": "Electric Motor 5HP", "description": "Three-phase induction motor", "category": "component", "unit_of_measure": "pcs", "unit_cost": 520.00, "lead_time_days": 21, "safety_stock": 5, "current_stock": 8, "reorder_point": 6},
        {"id": str(uuid.uuid4()), "part_number": "SA-001", "name": "Pump Assembly", "description": "Hydraulic pump sub-assembly", "category": "sub_assembly", "unit_of_measure": "pcs", "unit_cost": 850.00, "lead_time_days": 5, "safety_stock": 8, "current_stock": 12, "reorder_point": 10},
        {"id": str(uuid.uuid4()), "part_number": "SA-002", "name": "Control Panel", "description": "PLC control panel assembly", "category": "sub_assembly", "unit_of_measure": "pcs", "unit_cost": 1200.00, "lead_time_days": 7, "safety_stock": 3, "current_stock": 5, "reorder_point": 4},
        {"id": str(uuid.uuid4()), "part_number": "FG-001", "name": "Hydraulic Press 50T", "description": "50-ton hydraulic press machine", "category": "finished_good", "unit_of_measure": "pcs", "unit_cost": 15000.00, "lead_time_days": 30, "safety_stock": 1, "current_stock": 2, "reorder_point": 1},
        {"id": str(uuid.uuid4()), "part_number": "FG-002", "name": "CNC Milling Center", "description": "3-axis CNC milling machine", "category": "finished_good", "unit_of_measure": "pcs", "unit_cost": 45000.00, "lead_time_days": 45, "safety_stock": 1, "current_stock": 1, "reorder_point": 1},
    ]
    
    for item in items:
        item["created_at"] = datetime.now(timezone.utc)
    
    await db.items.insert_many(items)
    logger.info("Sample items seeded")
    
    # Create sample BOMs
    pump_assembly = next(i for i in items if i["part_number"] == "SA-001")
    hydraulic_press = next(i for i in items if i["part_number"] == "FG-001")
    
    boms = [
        {
            "id": str(uuid.uuid4()),
            "parent_item_id": pump_assembly["id"],
            "name": "Pump Assembly BOM",
            "description": "BOM for hydraulic pump sub-assembly",
            "revision": "A",
            "effectivity_date": datetime.now(timezone.utc),
            "status": "active",
            "components": [
                {"item_id": next(i["id"] for i in items if i["part_number"] == "RM-002"), "quantity": 2, "unit_of_measure": "meter"},
                {"item_id": next(i["id"] for i in items if i["part_number"] == "RM-003"), "quantity": 1, "unit_of_measure": "kit"},
                {"item_id": next(i["id"] for i in items if i["part_number"] == "CP-001"), "quantity": 1, "unit_of_measure": "pcs"},
            ],
            "created_at": datetime.now(timezone.utc)
        },
        {
            "id": str(uuid.uuid4()),
            "parent_item_id": hydraulic_press["id"],
            "name": "Hydraulic Press 50T BOM",
            "description": "Complete BOM for 50-ton hydraulic press",
            "revision": "B",
            "effectivity_date": datetime.now(timezone.utc),
            "status": "active",
            "components": [
                {"item_id": next(i["id"] for i in items if i["part_number"] == "RM-001"), "quantity": 10, "unit_of_measure": "sheet"},
                {"item_id": pump_assembly["id"], "quantity": 2, "unit_of_measure": "pcs"},
                {"item_id": next(i["id"] for i in items if i["part_number"] == "CP-002"), "quantity": 4, "unit_of_measure": "pcs"},
                {"item_id": next(i["id"] for i in items if i["part_number"] == "CP-003"), "quantity": 1, "unit_of_measure": "pcs"},
                {"item_id": next(i["id"] for i in items if i["part_number"] == "SA-002"), "quantity": 1, "unit_of_measure": "pcs"},
            ],
            "created_at": datetime.now(timezone.utc)
        }
    ]
    
    await db.boms.insert_many(boms)
    logger.info("Sample BOMs seeded")
    
    # Create inspection templates
    templates = [
        {
            "id": str(uuid.uuid4()),
            "name": "Incoming Material Inspection",
            "description": "Standard inspection for incoming raw materials",
            "category": "incoming",
            "checklist_items": [
                {"id": "1", "name": "Visual Inspection", "description": "Check for visible defects", "required": True},
                {"id": "2", "name": "Dimension Check", "description": "Verify dimensions match spec", "required": True},
                {"id": "3", "name": "Material Certificate", "description": "Verify material certification", "required": True},
                {"id": "4", "name": "Packaging Condition", "description": "Check packaging integrity", "required": False}
            ],
            "created_at": datetime.now(timezone.utc)
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Final Assembly Inspection",
            "description": "QC checklist for finished assemblies",
            "category": "final",
            "checklist_items": [
                {"id": "1", "name": "Functional Test", "description": "Verify all functions work correctly", "required": True},
                {"id": "2", "name": "Pressure Test", "description": "Hydraulic pressure test at 150%", "required": True},
                {"id": "3", "name": "Electrical Safety", "description": "Ground continuity and insulation test", "required": True},
                {"id": "4", "name": "Visual Finish", "description": "Paint and surface finish quality", "required": True},
                {"id": "5", "name": "Documentation", "description": "All documentation complete", "required": True}
            ],
            "created_at": datetime.now(timezone.utc)
        }
    ]
    
    await db.inspection_templates.insert_many(templates)
    logger.info("Sample inspection templates seeded")

# ================== APP SETUP ==================

@app.on_event("startup")
async def startup():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.items.create_index("part_number", unique=True)
    await db.items.create_index("category")
    await db.boms.create_index("parent_item_id")
    await db.boms.create_index("status")
    await db.production_orders.create_index("status")
    await db.login_attempts.create_index("identifier")
    
    # Seed data
    await seed_admin()
    await seed_sample_data()
    
    # Write credentials file
    Path("/app/memory").mkdir(exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write("## Admin Account\n")
        f.write(f"- Email: {os.environ.get('ADMIN_EMAIL', 'admin@erp.com')}\n")
        f.write(f"- Password: {os.environ.get('ADMIN_PASSWORD', 'Admin@123')}\n")
        f.write("- Role: admin\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/login\n")
        f.write("- POST /api/auth/register\n")
        f.write("- POST /api/auth/logout\n")
        f.write("- GET /api/auth/me\n")
        f.write("- POST /api/auth/refresh\n")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Include routers
api_router.include_router(auth_router)
api_router.include_router(items_router)
api_router.include_router(bom_router)
api_router.include_router(mrp_router)
api_router.include_router(quality_router)
api_router.include_router(inventory_router)
api_router.include_router(production_router)
api_router.include_router(users_router)
api_router.include_router(dashboard_router)

app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}
