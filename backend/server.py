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
suppliers_router = APIRouter(prefix="/suppliers")
purchase_orders_router = APIRouter(prefix="/purchase-orders")
warehouses_router = APIRouter(prefix="/warehouses")
work_centers_router = APIRouter(prefix="/work-centers")
routings_router = APIRouter(prefix="/routings")
work_orders_router = APIRouter(prefix="/work-orders")
settings_router = APIRouter(prefix="/settings")
customers_router = APIRouter(prefix="/customers")

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
    hsn_code: Optional[str] = ""
    gst_rate: Optional[float] = 18.0

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
    hsn_code: Optional[str] = None
    gst_rate: Optional[float] = None

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
    from_warehouse_id: Optional[str] = None
    to_warehouse_id: Optional[str] = None

# ================== PROCUREMENT MODELS ==================

class SupplierCreate(BaseModel):
    code: str
    name: str
    contact_person: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    gstin: Optional[str] = ""
    state_code: Optional[str] = ""
    payment_terms: Optional[str] = "Net 30"
    lead_time_days: int = 7
    rating: Optional[int] = 3  # 1-5 stars
    status: str = "active"  # active, inactive

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    state_code: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    rating: Optional[int] = None
    status: Optional[str] = None

class PurchaseOrderLineCreate(BaseModel):
    item_id: str
    quantity: int
    unit_price: float
    hsn_code: Optional[str] = ""
    gst_rate: Optional[float] = 18.0
    notes: Optional[str] = ""

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    expected_date: datetime
    lines: List[PurchaseOrderLineCreate]
    notes: Optional[str] = ""

class PurchaseOrderUpdate(BaseModel):
    expected_date: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None

# ================== STORES/WAREHOUSE MODELS ==================

class WarehouseCreate(BaseModel):
    code: str
    name: str
    location: Optional[str] = ""
    is_default: bool = False
    status: str = "active"

class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[str] = None

class StockTransferCreate(BaseModel):
    item_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    quantity: int
    notes: Optional[str] = ""

# ================== MANUFACTURING PROCESS MODELS ==================

class WorkCenterCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = ""
    hourly_rate: float = 0.0
    capacity_per_hour: float = 1.0
    status: str = "active"

class WorkCenterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    hourly_rate: Optional[float] = None
    capacity_per_hour: Optional[float] = None
    status: Optional[str] = None

class RoutingOperationCreate(BaseModel):
    sequence: int
    work_center_id: str
    operation_name: str
    description: Optional[str] = ""
    setup_time_minutes: int = 0
    run_time_minutes: int = 0

class RoutingCreate(BaseModel):
    item_id: str
    name: str
    description: Optional[str] = ""
    revision: str = "A"
    status: str = "active"
    operations: List[RoutingOperationCreate] = []

class RoutingUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    revision: Optional[str] = None
    status: Optional[str] = None
    operations: Optional[List[RoutingOperationCreate]] = None

class WorkOrderCreate(BaseModel):
    production_order_id: str
    routing_id: str
    quantity: int
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    notes: Optional[str] = ""

class WorkOrderUpdate(BaseModel):
    status: Optional[str] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    quantity_completed: Optional[int] = None
    notes: Optional[str] = None

class WorkOrderOperationUpdate(BaseModel):
    status: str  # pending, in_progress, completed
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    quantity_completed: Optional[int] = None
    notes: Optional[str] = None

# ================== GST / INDIA COMPLIANCE MODELS ==================

INDIAN_STATES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
    "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
    "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
    "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka",
    "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
    "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana",
    "37": "Andhra Pradesh"
}

GST_SLABS = [0, 5, 12, 18, 28]

class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    gstin: Optional[str] = None
    state_code: Optional[str] = None
    address: Optional[str] = None
    pan: Optional[str] = None
    cin: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class CustomerCreate(BaseModel):
    code: str
    name: str
    gstin: Optional[str] = ""
    state_code: Optional[str] = ""
    contact_person: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    payment_terms: Optional[str] = "Net 30"
    status: str = "active"

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    gstin: Optional[str] = None
    state_code: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None
    status: Optional[str] = None

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

@items_router.post("", status_code=201)
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
    """Get full multi-level BOM explosion with rollup costing"""
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
                "children": [],
                "unit_cost": 0,
                "extended_cost": 0
            }
            
            # Check for child BOM
            child_bom = await db.boms.find_one({"parent_item_id": comp.get("item_id"), "status": "active"}, {"_id": 0})
            if child_bom:
                comp_data["children"] = await explode_level(child_bom.get("id"), level + 1, max_levels)
                # Rollup cost from children
                comp_data["unit_cost"] = sum(c.get("extended_cost", 0) for c in comp_data["children"])
            else:
                # Leaf node - use item unit_cost
                comp_data["unit_cost"] = item.get("unit_cost", 0) if item else 0
            
            comp_data["extended_cost"] = comp_data["unit_cost"] * comp.get("quantity", 0)
            result.append(comp_data)
        return result
    
    bom = await db.boms.find_one({"id": bom_id}, {"_id": 0})
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    parent_item = await db.items.find_one({"id": bom.get("parent_item_id")}, {"_id": 0})
    explosion = await explode_level(bom_id, 1, levels)
    
    # Calculate total rollup cost
    total_cost = sum(c.get("extended_cost", 0) for c in explosion)
    
    return {
        "bom": bom,
        "parent_item": parent_item,
        "explosion": explosion,
        "total_rollup_cost": round(total_cost, 2)
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
    """Calculate material requirements based on production orders - recursively explodes all BOM levels"""
    await get_current_user(request)
    
    query = {"status": {"$in": ["planned", "released", "in_progress"]}}
    if production_order_id:
        query["id"] = production_order_id
    
    orders = await db.production_orders.find(query, {"_id": 0}).to_list(1000)
    
    demand = {}
    
    async def explode_bom_demand(bom_id: str, parent_qty: int, order_info: dict, visited: set = None):
        """Recursively explode BOM and accumulate demand for all child items"""
        if visited is None:
            visited = set()
        if bom_id in visited:
            return  # Prevent circular references
        visited.add(bom_id)
        
        bom = await db.boms.find_one({"id": bom_id}, {"_id": 0})
        if not bom:
            return
        
        for comp in bom.get("components", []):
            if comp.get("is_alternate"):
                continue
            item_id = comp.get("item_id")
            qty_needed = comp.get("quantity", 0) * parent_qty
            
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
                "order_id": order_info.get("id"),
                "order_number": order_info.get("order_number"),
                "quantity_needed": qty_needed,
                "due_date": order_info.get("due_date")
            })
            
            # Recursively explode child BOMs
            child_bom = await db.boms.find_one({"parent_item_id": item_id, "status": "active"}, {"_id": 0})
            if child_bom:
                await explode_bom_demand(child_bom.get("id"), qty_needed, order_info, visited)
    
    for order in orders:
        bom_id = order.get("bom_id")
        if not bom_id:
            continue
        await explode_bom_demand(bom_id, order.get("quantity", 0), order)
    
    # Calculate net requirements
    for item_id, data in demand.items():
        available = data["on_hand"] - data["safety_stock"]
        data["net_requirement"] = max(0, data["gross_requirement"] - available)
    
    # Filter to only raw materials (sub-assemblies/components are handled by manufacturing)
    raw_material_demand = [d for d in demand.values() if d.get("item", {}).get("category") == "raw_material"]
    
    return raw_material_demand

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

# ================== SUPPLIER ROUTES ==================

@suppliers_router.get("")
async def get_suppliers(request: Request, status: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    suppliers = await db.suppliers.find(query, {"_id": 0}).to_list(1000)
    return suppliers

@suppliers_router.get("/{supplier_id}")
async def get_supplier(supplier_id: str, request: Request):
    await get_current_user(request)
    supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier

@suppliers_router.post("", status_code=201)
async def create_supplier(supplier_data: SupplierCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    existing = await db.suppliers.find_one({"code": supplier_data.code})
    if existing:
        raise HTTPException(status_code=400, detail="Supplier code already exists")
    
    supplier_doc = {
        "id": str(uuid.uuid4()),
        **supplier_data.model_dump(),
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.suppliers.insert_one(supplier_doc)
    supplier_doc.pop("_id", None)
    return supplier_doc

@suppliers_router.put("/{supplier_id}")
async def update_supplier(supplier_id: str, supplier_data: SupplierUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {k: v for k, v in supplier_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.suppliers.update_one({"id": supplier_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    return supplier

@suppliers_router.delete("/{supplier_id}")
async def delete_supplier(supplier_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    result = await db.suppliers.delete_one({"id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Supplier deleted"}

# ================== PURCHASE ORDER ROUTES ==================

@purchase_orders_router.get("")
async def get_purchase_orders(request: Request, status: Optional[str] = None, supplier_id: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    
    orders = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    for order in orders:
        supplier = await db.suppliers.find_one({"id": order.get("supplier_id")}, {"_id": 0})
        order["supplier"] = supplier
        # Enrich lines with item details
        for line in order.get("lines", []):
            item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
            line["item"] = item
    return orders

@purchase_orders_router.get("/{po_id}")
async def get_purchase_order(po_id: str, request: Request):
    await get_current_user(request)
    order = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    supplier = await db.suppliers.find_one({"id": order.get("supplier_id")}, {"_id": 0})
    order["supplier"] = supplier
    for line in order.get("lines", []):
        item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
        line["item"] = item
    return order

@purchase_orders_router.post("", status_code=201)
async def create_purchase_order(po_data: PurchaseOrderCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    supplier = await db.suppliers.find_one({"id": po_data.supplier_id})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # Generate PO number
    count = await db.purchase_orders.count_documents({})
    po_number = f"PO-{str(count + 1).zfill(6)}"
    
    # Get company settings for GST calculation
    company_settings = await db.company_settings.find_one({"type": "company"}, {"_id": 0})
    company_state = company_settings.get("state_code", "") if company_settings else ""
    supplier_state = supplier.get("state_code", "")
    is_inter_state = company_state and supplier_state and company_state != supplier_state
    
    # Calculate totals with GST
    lines_with_tax = []
    subtotal = 0
    total_cgst = 0
    total_sgst = 0
    total_igst = 0
    
    for line in po_data.lines:
        line_data = line.model_dump()
        line_amount = line.quantity * line.unit_price
        gst_rate = line.gst_rate or 0
        tax_amount = round(line_amount * gst_rate / 100, 2)
        
        # Fetch item to auto-fill HSN if not provided
        if not line_data.get("hsn_code"):
            item_doc = await db.items.find_one({"id": line.item_id}, {"_id": 0})
            if item_doc:
                line_data["hsn_code"] = item_doc.get("hsn_code", "")
        
        if is_inter_state:
            line_data["igst_amount"] = tax_amount
            line_data["cgst_amount"] = 0
            line_data["sgst_amount"] = 0
            total_igst += tax_amount
        else:
            half_tax = round(tax_amount / 2, 2)
            line_data["cgst_amount"] = half_tax
            line_data["sgst_amount"] = half_tax
            line_data["igst_amount"] = 0
            total_cgst += half_tax
            total_sgst += half_tax
        
        line_data["line_amount"] = line_amount
        line_data["tax_amount"] = tax_amount
        subtotal += line_amount
        lines_with_tax.append(line_data)
    
    total_tax = total_cgst + total_sgst + total_igst
    total_amount = subtotal + total_tax
    
    po_doc = {
        "id": str(uuid.uuid4()),
        "po_number": po_number,
        "supplier_id": po_data.supplier_id,
        "expected_date": po_data.expected_date,
        "lines": lines_with_tax,
        "subtotal": round(subtotal, 2),
        "total_cgst": round(total_cgst, 2),
        "total_sgst": round(total_sgst, 2),
        "total_igst": round(total_igst, 2),
        "total_tax": round(total_tax, 2),
        "total_amount": round(total_amount, 2),
        "is_inter_state": is_inter_state,
        "status": "draft",
        "notes": po_data.notes,
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.purchase_orders.insert_one(po_doc)
    po_doc.pop("_id", None)
    return po_doc

@purchase_orders_router.post("/from-mrp", status_code=201)
async def create_po_from_mrp(supplier_id: str, item_ids: List[str], request: Request):
    """Create PO from MRP suggestions"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    supplier = await db.suppliers.find_one({"id": supplier_id})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    lines = []
    for item_id in item_ids:
        item = await db.items.find_one({"id": item_id}, {"_id": 0})
        if item:
            suggested_qty = max(item.get("safety_stock", 0) * 2 - item.get("current_stock", 0), 1)
            lines.append({
                "item_id": item_id,
                "quantity": suggested_qty,
                "unit_price": item.get("unit_cost", 0),
                "hsn_code": item.get("hsn_code", ""),
                "gst_rate": item.get("gst_rate", 18),
                "notes": ""
            })
    
    if not lines:
        raise HTTPException(status_code=400, detail="No valid items to order")
    
    # GST calculation
    company_settings = await db.company_settings.find_one({"type": "company"}, {"_id": 0})
    company_state = company_settings.get("state_code", "") if company_settings else ""
    supplier_state = supplier.get("state_code", "")
    is_inter_state = company_state and supplier_state and company_state != supplier_state
    
    subtotal = 0
    total_cgst = 0
    total_sgst = 0
    total_igst = 0
    
    for line in lines:
        line_amount = line["quantity"] * line["unit_price"]
        gst_rate = line.get("gst_rate", 0)
        tax_amount = round(line_amount * gst_rate / 100, 2)
        line["line_amount"] = line_amount
        line["tax_amount"] = tax_amount
        if is_inter_state:
            line["igst_amount"] = tax_amount
            line["cgst_amount"] = 0
            line["sgst_amount"] = 0
            total_igst += tax_amount
        else:
            half_tax = round(tax_amount / 2, 2)
            line["cgst_amount"] = half_tax
            line["sgst_amount"] = half_tax
            line["igst_amount"] = 0
            total_cgst += half_tax
            total_sgst += half_tax
        subtotal += line_amount
    
    total_tax = total_cgst + total_sgst + total_igst
    total_amount = subtotal + total_tax
    
    count = await db.purchase_orders.count_documents({})
    po_number = f"PO-{str(count + 1).zfill(6)}"
    
    po_doc = {
        "id": str(uuid.uuid4()),
        "po_number": po_number,
        "supplier_id": supplier_id,
        "expected_date": datetime.now(timezone.utc) + timedelta(days=supplier.get("lead_time_days", 7)),
        "lines": lines,
        "subtotal": round(subtotal, 2),
        "total_cgst": round(total_cgst, 2),
        "total_sgst": round(total_sgst, 2),
        "total_igst": round(total_igst, 2),
        "total_tax": round(total_tax, 2),
        "total_amount": round(total_amount, 2),
        "is_inter_state": is_inter_state,
        "status": "draft",
        "notes": "Created from MRP suggestions",
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.purchase_orders.insert_one(po_doc)
    po_doc.pop("_id", None)
    return po_doc

@purchase_orders_router.put("/{po_id}")
async def update_purchase_order(po_id: str, po_data: PurchaseOrderUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {k: v for k, v in po_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.purchase_orders.update_one({"id": po_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    return po

@purchase_orders_router.post("/{po_id}/receive")
async def receive_purchase_order(po_id: str, request: Request):
    """Receive PO and update inventory"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    if po.get("status") == "received":
        raise HTTPException(status_code=400, detail="PO already received")
    
    # Create inventory transactions for each line
    for line in po.get("lines", []):
        item = await db.items.find_one({"id": line.get("item_id")})
        if item:
            current_stock = item.get("current_stock", 0)
            new_stock = current_stock + line.get("quantity", 0)
            
            tx_doc = {
                "id": str(uuid.uuid4()),
                "item_id": line.get("item_id"),
                "transaction_type": "receive",
                "quantity": line.get("quantity", 0),
                "reference_type": "purchase_order",
                "reference_id": po_id,
                "previous_stock": current_stock,
                "new_stock": new_stock,
                "notes": f"Received from PO {po.get('po_number')}",
                "created_at": datetime.now(timezone.utc),
                "created_by": user["id"]
            }
            await db.inventory_transactions.insert_one(tx_doc)
            await db.items.update_one({"id": line.get("item_id")}, {"$set": {"current_stock": new_stock}})
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"status": "received", "received_at": datetime.now(timezone.utc), "received_by": user["id"]}}
    )
    
    return {"message": "Purchase order received successfully"}

# ================== WAREHOUSE ROUTES ==================

@warehouses_router.get("")
async def get_warehouses(request: Request, status: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    warehouses = await db.warehouses.find(query, {"_id": 0}).to_list(100)
    return warehouses

@warehouses_router.get("/{warehouse_id}")
async def get_warehouse(warehouse_id: str, request: Request):
    await get_current_user(request)
    warehouse = await db.warehouses.find_one({"id": warehouse_id}, {"_id": 0})
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return warehouse

@warehouses_router.get("/{warehouse_id}/stock")
async def get_warehouse_stock(warehouse_id: str, request: Request):
    """Get stock levels for a specific warehouse"""
    await get_current_user(request)
    
    warehouse = await db.warehouses.find_one({"id": warehouse_id}, {"_id": 0})
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    
    stock = await db.warehouse_stock.find({"warehouse_id": warehouse_id}, {"_id": 0}).to_list(1000)
    
    for s in stock:
        item = await db.items.find_one({"id": s.get("item_id")}, {"_id": 0})
        s["item"] = item
    
    return {"warehouse": warehouse, "stock": stock}

@warehouses_router.post("", status_code=201)
async def create_warehouse(warehouse_data: WarehouseCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    existing = await db.warehouses.find_one({"code": warehouse_data.code})
    if existing:
        raise HTTPException(status_code=400, detail="Warehouse code already exists")
    
    # If this is default, unset other defaults
    if warehouse_data.is_default:
        await db.warehouses.update_many({}, {"$set": {"is_default": False}})
    
    warehouse_doc = {
        "id": str(uuid.uuid4()),
        **warehouse_data.model_dump(),
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.warehouses.insert_one(warehouse_doc)
    warehouse_doc.pop("_id", None)
    return warehouse_doc

@warehouses_router.put("/{warehouse_id}")
async def update_warehouse(warehouse_id: str, warehouse_data: WarehouseUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {k: v for k, v in warehouse_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    # If setting as default, unset other defaults
    if update_data.get("is_default"):
        await db.warehouses.update_many({"id": {"$ne": warehouse_id}}, {"$set": {"is_default": False}})
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.warehouses.update_one({"id": warehouse_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    
    warehouse = await db.warehouses.find_one({"id": warehouse_id}, {"_id": 0})
    return warehouse

@warehouses_router.post("/transfer", status_code=201)
async def create_stock_transfer(transfer_data: StockTransferCreate, request: Request):
    """Transfer stock between warehouses"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Verify warehouses exist
    from_wh = await db.warehouses.find_one({"id": transfer_data.from_warehouse_id})
    to_wh = await db.warehouses.find_one({"id": transfer_data.to_warehouse_id})
    if not from_wh or not to_wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    
    # Check stock in source warehouse
    from_stock = await db.warehouse_stock.find_one({
        "warehouse_id": transfer_data.from_warehouse_id,
        "item_id": transfer_data.item_id
    })
    
    if not from_stock or from_stock.get("quantity", 0) < transfer_data.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock in source warehouse")
    
    # Update source warehouse stock
    new_from_qty = from_stock.get("quantity", 0) - transfer_data.quantity
    await db.warehouse_stock.update_one(
        {"warehouse_id": transfer_data.from_warehouse_id, "item_id": transfer_data.item_id},
        {"$set": {"quantity": new_from_qty, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Update destination warehouse stock
    to_stock = await db.warehouse_stock.find_one({
        "warehouse_id": transfer_data.to_warehouse_id,
        "item_id": transfer_data.item_id
    })
    
    if to_stock:
        new_to_qty = to_stock.get("quantity", 0) + transfer_data.quantity
        await db.warehouse_stock.update_one(
            {"warehouse_id": transfer_data.to_warehouse_id, "item_id": transfer_data.item_id},
            {"$set": {"quantity": new_to_qty, "updated_at": datetime.now(timezone.utc)}}
        )
    else:
        await db.warehouse_stock.insert_one({
            "id": str(uuid.uuid4()),
            "warehouse_id": transfer_data.to_warehouse_id,
            "item_id": transfer_data.item_id,
            "quantity": transfer_data.quantity,
            "created_at": datetime.now(timezone.utc)
        })
    
    # Create transfer record
    transfer_doc = {
        "id": str(uuid.uuid4()),
        **transfer_data.model_dump(),
        "status": "completed",
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.stock_transfers.insert_one(transfer_doc)
    transfer_doc.pop("_id", None)
    return transfer_doc

@warehouses_router.get("/transfers/history")
async def get_transfer_history(request: Request, limit: int = 50):
    await get_current_user(request)
    transfers = await db.stock_transfers.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    for t in transfers:
        t["from_warehouse"] = await db.warehouses.find_one({"id": t.get("from_warehouse_id")}, {"_id": 0})
        t["to_warehouse"] = await db.warehouses.find_one({"id": t.get("to_warehouse_id")}, {"_id": 0})
        t["item"] = await db.items.find_one({"id": t.get("item_id")}, {"_id": 0})
    
    return transfers

# ================== WORK CENTER ROUTES ==================

@work_centers_router.get("")
async def get_work_centers(request: Request, status: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    work_centers = await db.work_centers.find(query, {"_id": 0}).to_list(100)
    return work_centers

@work_centers_router.get("/{wc_id}")
async def get_work_center(wc_id: str, request: Request):
    await get_current_user(request)
    wc = await db.work_centers.find_one({"id": wc_id}, {"_id": 0})
    if not wc:
        raise HTTPException(status_code=404, detail="Work center not found")
    return wc

@work_centers_router.post("", status_code=201)
async def create_work_center(wc_data: WorkCenterCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    existing = await db.work_centers.find_one({"code": wc_data.code})
    if existing:
        raise HTTPException(status_code=400, detail="Work center code already exists")
    
    wc_doc = {
        "id": str(uuid.uuid4()),
        **wc_data.model_dump(),
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.work_centers.insert_one(wc_doc)
    wc_doc.pop("_id", None)
    return wc_doc

@work_centers_router.put("/{wc_id}")
async def update_work_center(wc_id: str, wc_data: WorkCenterUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {k: v for k, v in wc_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.work_centers.update_one({"id": wc_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Work center not found")
    
    wc = await db.work_centers.find_one({"id": wc_id}, {"_id": 0})
    return wc

# ================== ROUTING ROUTES ==================

@routings_router.get("")
async def get_routings(request: Request, status: Optional[str] = None, item_id: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    if item_id:
        query["item_id"] = item_id
    
    routings = await db.routings.find(query, {"_id": 0}).to_list(1000)
    
    for routing in routings:
        item = await db.items.find_one({"id": routing.get("item_id")}, {"_id": 0})
        routing["item"] = item
        # Enrich operations with work center details
        for op in routing.get("operations", []):
            wc = await db.work_centers.find_one({"id": op.get("work_center_id")}, {"_id": 0})
            op["work_center"] = wc
    
    return routings

@routings_router.get("/{routing_id}")
async def get_routing(routing_id: str, request: Request):
    await get_current_user(request)
    routing = await db.routings.find_one({"id": routing_id}, {"_id": 0})
    if not routing:
        raise HTTPException(status_code=404, detail="Routing not found")
    
    item = await db.items.find_one({"id": routing.get("item_id")}, {"_id": 0})
    routing["item"] = item
    for op in routing.get("operations", []):
        wc = await db.work_centers.find_one({"id": op.get("work_center_id")}, {"_id": 0})
        op["work_center"] = wc
    
    return routing

@routings_router.post("", status_code=201)
async def create_routing(routing_data: RoutingCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    item = await db.items.find_one({"id": routing_data.item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    routing_doc = {
        "id": str(uuid.uuid4()),
        "item_id": routing_data.item_id,
        "name": routing_data.name,
        "description": routing_data.description,
        "revision": routing_data.revision,
        "status": routing_data.status,
        "operations": [op.model_dump() for op in routing_data.operations],
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.routings.insert_one(routing_doc)
    routing_doc.pop("_id", None)
    return routing_doc

@routings_router.put("/{routing_id}")
async def update_routing(routing_id: str, routing_data: RoutingUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {}
    for k, v in routing_data.model_dump().items():
        if v is not None:
            if k == "operations":
                update_data[k] = [op.model_dump() if hasattr(op, 'model_dump') else op for op in v]
            else:
                update_data[k] = v
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.routings.update_one({"id": routing_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Routing not found")
    
    routing = await db.routings.find_one({"id": routing_id}, {"_id": 0})
    return routing

# ================== WORK ORDER ROUTES ==================

@work_orders_router.get("")
async def get_work_orders(request: Request, status: Optional[str] = None, production_order_id: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    if production_order_id:
        query["production_order_id"] = production_order_id
    
    work_orders = await db.work_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    for wo in work_orders:
        routing = await db.routings.find_one({"id": wo.get("routing_id")}, {"_id": 0})
        wo["routing"] = routing
        # Get item either from wo.item_id or from routing
        item_id = wo.get("item_id") or (routing.get("item_id") if routing else None)
        if item_id:
            item = await db.items.find_one({"id": item_id}, {"_id": 0})
            wo["item"] = item
        prod_order = await db.production_orders.find_one({"id": wo.get("production_order_id")}, {"_id": 0})
        wo["production_order"] = prod_order
    
    return work_orders

@work_orders_router.get("/{wo_id}")
async def get_work_order(wo_id: str, request: Request):
    await get_current_user(request)
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    routing = await db.routings.find_one({"id": wo.get("routing_id")}, {"_id": 0})
    wo["routing"] = routing
    if routing:
        item = await db.items.find_one({"id": routing.get("item_id")}, {"_id": 0})
        wo["item"] = item
        # Enrich operations
        for op in routing.get("operations", []):
            wc = await db.work_centers.find_one({"id": op.get("work_center_id")}, {"_id": 0})
            op["work_center"] = wc
    
    return wo

@work_orders_router.post("", status_code=201)
async def create_work_order(wo_data: WorkOrderCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    prod_order = await db.production_orders.find_one({"id": wo_data.production_order_id})
    if not prod_order:
        raise HTTPException(status_code=404, detail="Production order not found")
    
    routing = await db.routings.find_one({"id": wo_data.routing_id})
    if not routing:
        raise HTTPException(status_code=404, detail="Routing not found")
    
    # Get the item for this routing
    item = await db.items.find_one({"id": routing.get("item_id")})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found for routing")
    
    created_work_orders = []
    
    # Helper function to create work order for an item
    async def create_wo_for_item(item_id: str, qty: int, parent_wo_id: str = None, is_main: bool = False):
        # Find routing for this item
        item_routing = await db.routings.find_one({"item_id": item_id, "status": "active"})
        if not item_routing:
            return None  # No routing, skip
        
        item_doc = await db.items.find_one({"id": item_id})
        if not item_doc:
            return None
        
        # Main WO always gets created with full requested quantity (user explicitly chose to manufacture)
        # Child WOs also always get created for full BOM quantity (needed for this production run)
        qty_to_manufacture = qty
        
        # Generate WO number
        count = await db.work_orders.count_documents({})
        wo_number = f"WO-{str(count + 1).zfill(6)}"
        
        # Create operation statuses
        operations_status = []
        for op in item_routing.get("operations", []):
            operations_status.append({
                "sequence": op.get("sequence"),
                "operation_name": op.get("operation_name"),
                "work_center_id": op.get("work_center_id"),
                "status": "pending",
                "quantity_completed": 0
            })
        
        wo_doc = {
            "id": str(uuid.uuid4()),
            "wo_number": wo_number,
            "production_order_id": wo_data.production_order_id,
            "routing_id": item_routing.get("id"),
            "item_id": item_id,
            "quantity": qty_to_manufacture,
            "quantity_completed": 0,
            "scheduled_start": wo_data.scheduled_start,
            "scheduled_end": wo_data.scheduled_end,
            "status": "pending",
            "operations_status": operations_status,
            "parent_wo_id": parent_wo_id,
            "notes": wo_data.notes if is_main else f"Auto-created for {item_doc.get('category', 'child item')}",
            "materials_consumed": False,
            "created_at": datetime.now(timezone.utc),
            "created_by": user["id"]
        }
        await db.work_orders.insert_one(wo_doc)
        wo_doc.pop("_id", None)
        
        logger.info(f"Created WO {wo_number} for {item_doc.get('part_number')} (qty={qty_to_manufacture}, parent={parent_wo_id})")
        return wo_doc
    
    # Helper function to recursively create work orders for child items
    async def create_child_work_orders(parent_item_id: str, parent_qty: int, parent_wo_id: str):
        # Find BOM for this item
        bom = await db.boms.find_one({"parent_item_id": parent_item_id, "status": "active"})
        if not bom:
            return
        
        for component in bom.get("components", []):
            if component.get("is_alternate"):
                continue  # Skip alternate components
            
            child_item_id = component.get("item_id")
            child_qty = int(component.get("quantity", 1) * parent_qty)
            
            child_item = await db.items.find_one({"id": child_item_id})
            if not child_item:
                continue
            
            # Create work orders for any item that has a routing (can be manufactured)
            # This includes sub_assemblies, components, and finished_goods
            child_routing = await db.routings.find_one({"item_id": child_item_id, "status": "active"})
            if child_routing:
                child_wo = await create_wo_for_item(child_item_id, child_qty, parent_wo_id)
                if child_wo:
                    created_work_orders.append(child_wo)
                    # Recursively create work orders for this child's children
                    await create_child_work_orders(child_item_id, child_qty, child_wo["id"])
    
    # Always create main work order (user explicitly requested manufacturing)
    main_wo = await create_wo_for_item(routing.get("item_id"), wo_data.quantity, None, is_main=True)
    if main_wo:
        created_work_orders.insert(0, main_wo)
        # Create work orders for child items
        await create_child_work_orders(routing.get("item_id"), wo_data.quantity, main_wo["id"])
    
    return {"message": f"Created {len(created_work_orders)} work order(s)", "work_orders": created_work_orders}

@work_orders_router.post("/{wo_id}/start")
async def start_work_order(wo_id: str, request: Request):
    """Start a work order - consumes required materials from inventory"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    wo = await db.work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    if wo.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Work order is not in pending status")
    
    if wo.get("materials_consumed"):
        raise HTTPException(status_code=400, detail="Materials already consumed for this work order")
    
    # Check if child work orders are all completed before allowing parent to start
    child_wos = await db.work_orders.find({"parent_wo_id": wo_id}, {"_id": 0}).to_list(1000)
    incomplete_children = []
    for child in child_wos:
        if child.get("status") != "completed":
            child_item = await db.items.find_one({"id": child.get("item_id")}, {"_id": 0})
            incomplete_children.append({
                "wo_number": child.get("wo_number"),
                "item": child_item.get("part_number", "Unknown") if child_item else "Unknown",
                "name": child_item.get("name", "") if child_item else "",
                "status": child.get("status")
            })
    
    if incomplete_children:
        child_list = "\n".join([f"- {c['wo_number']}: {c['item']} ({c['name']}) - {c['status']}" for c in incomplete_children])
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot start work order: Child work orders must be completed first.\n\nIncomplete child WOs:\n{child_list}"
        )
    
    # Get the routing and item
    routing = await db.routings.find_one({"id": wo.get("routing_id")})
    if not routing:
        raise HTTPException(status_code=404, detail="Routing not found")
    
    item_id = routing.get("item_id")
    
    # Find BOM for this item to get required materials
    bom = await db.boms.find_one({"parent_item_id": item_id, "status": "active"})
    
    consumed_materials = []
    insufficient_materials = []
    
    if bom:
        wo_qty = wo.get("quantity", 1)
        
        for component in bom.get("components", []):
            if component.get("is_alternate"):
                continue
            
            comp_item_id = component.get("item_id")
            comp_item = await db.items.find_one({"id": comp_item_id})
            if not comp_item:
                continue
            
            # Only consume raw materials and components (not sub-assemblies that have their own WO)
            if comp_item.get("category") in ["raw_material", "component"]:
                required_qty = int(component.get("quantity", 1) * wo_qty)
                current_stock = comp_item.get("current_stock", 0)
                
                if current_stock < required_qty:
                    insufficient_materials.append({
                        "item": comp_item.get("part_number"),
                        "name": comp_item.get("name"),
                        "required": required_qty,
                        "available": current_stock
                    })
                else:
                    # Consume the material
                    new_stock = current_stock - required_qty
                    
                    # Create inventory transaction
                    tx_doc = {
                        "id": str(uuid.uuid4()),
                        "item_id": comp_item_id,
                        "transaction_type": "issue",
                        "quantity": required_qty,
                        "reference_type": "work_order",
                        "reference_id": wo_id,
                        "previous_stock": current_stock,
                        "new_stock": new_stock,
                        "notes": f"Consumed for WO {wo.get('wo_number')}",
                        "created_at": datetime.now(timezone.utc),
                        "created_by": user["id"]
                    }
                    await db.inventory_transactions.insert_one(tx_doc)
                    
                    # Update item stock
                    await db.items.update_one(
                        {"id": comp_item_id},
                        {"$set": {"current_stock": new_stock}}
                    )
                    
                    consumed_materials.append({
                        "item": comp_item.get("part_number"),
                        "name": comp_item.get("name"),
                        "quantity": required_qty
                    })
    
    if insufficient_materials:
        return {
            "success": False,
            "message": "Insufficient materials to start work order",
            "insufficient_materials": insufficient_materials
        }
    
    # Update work order status to in_progress
    operations = wo.get("operations_status", [])
    if operations:
        operations[0]["status"] = "in_progress"
        operations[0]["actual_start"] = datetime.now(timezone.utc)
    
    await db.work_orders.update_one(
        {"id": wo_id},
        {"$set": {
            "status": "in_progress",
            "actual_start": datetime.now(timezone.utc),
            "materials_consumed": True,
            "operations_status": operations,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "success": True,
        "message": "Work order started, materials consumed",
        "consumed_materials": consumed_materials,
        "wo_number": wo.get("wo_number")
    }

@work_orders_router.put("/{wo_id}")
async def update_work_order(wo_id: str, wo_data: WorkOrderUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    wo = await db.work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    update_data = {k: v for k, v in wo_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    # If trying to change status to in_progress, redirect to start endpoint
    if update_data.get("status") == "in_progress" and wo.get("status") == "pending":
        raise HTTPException(
            status_code=400, 
            detail="Use POST /api/work-orders/{wo_id}/start to start a work order (this will consume materials)"
        )
    
    # If completing the work order, update finished goods stock
    if update_data.get("status") == "completed" and wo.get("status") == "in_progress":
        routing = await db.routings.find_one({"id": wo.get("routing_id")})
        if routing:
            item_id = routing.get("item_id")
            item = await db.items.find_one({"id": item_id})
            if item:
                current_stock = item.get("current_stock", 0)
                produced_qty = wo.get("quantity", 0)
                new_stock = current_stock + produced_qty
                
                # Create inventory transaction for produced items
                tx_doc = {
                    "id": str(uuid.uuid4()),
                    "item_id": item_id,
                    "transaction_type": "receive",
                    "quantity": produced_qty,
                    "reference_type": "work_order",
                    "reference_id": wo_id,
                    "previous_stock": current_stock,
                    "new_stock": new_stock,
                    "notes": f"Produced from WO {wo.get('wo_number')}",
                    "created_at": datetime.now(timezone.utc),
                    "created_by": user["id"]
                }
                await db.inventory_transactions.insert_one(tx_doc)
                
                # Update item stock
                await db.items.update_one(
                    {"id": item_id},
                    {"$set": {"current_stock": new_stock}}
                )
        
        update_data["actual_end"] = datetime.now(timezone.utc)
        update_data["quantity_completed"] = wo.get("quantity", 0)
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.work_orders.update_one({"id": wo_id}, {"$set": update_data})
    
    updated_wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    return updated_wo

@work_orders_router.put("/{wo_id}/operations/{sequence}")
async def update_work_order_operation(wo_id: str, sequence: int, op_data: WorkOrderOperationUpdate, request: Request):
    """Update a specific operation status within a work order"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    wo = await db.work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    operations = wo.get("operations_status", [])
    for op in operations:
        if op.get("sequence") == sequence:
            op["status"] = op_data.status
            if op_data.actual_start:
                op["actual_start"] = op_data.actual_start
            if op_data.actual_end:
                op["actual_end"] = op_data.actual_end
            if op_data.quantity_completed is not None:
                op["quantity_completed"] = op_data.quantity_completed
            if op_data.notes:
                op["notes"] = op_data.notes
            break
    
    # Check if all operations are completed
    all_completed = all(op.get("status") == "completed" for op in operations)
    any_in_progress = any(op.get("status") == "in_progress" for op in operations)
    
    wo_status = wo.get("status")
    if all_completed:
        wo_status = "completed"
    elif any_in_progress:
        wo_status = "in_progress"
    
    await db.work_orders.update_one(
        {"id": wo_id},
        {"$set": {
            "operations_status": operations,
            "status": wo_status,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return await db.work_orders.find_one({"id": wo_id}, {"_id": 0})

# ================== COMPANY SETTINGS / GST ROUTES ==================

@settings_router.get("/company")
async def get_company_settings(request: Request):
    await get_current_user(request)
    settings = await db.company_settings.find_one({"type": "company"}, {"_id": 0})
    if not settings:
        settings = {
            "type": "company",
            "company_name": "My Manufacturing Company",
            "gstin": "",
            "state_code": "",
            "address": "",
            "pan": "",
            "cin": "",
            "phone": "",
            "email": ""
        }
    return settings

@settings_router.put("/company")
async def update_company_settings(data: CompanySettingsUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update company settings")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["type"] = "company"
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.company_settings.update_one(
        {"type": "company"},
        {"$set": update_data},
        upsert=True
    )
    return await db.company_settings.find_one({"type": "company"}, {"_id": 0})

@settings_router.get("/states")
async def get_indian_states(request: Request):
    await get_current_user(request)
    return [{"code": k, "name": v} for k, v in INDIAN_STATES.items()]

@settings_router.get("/gst-slabs")
async def get_gst_slabs(request: Request):
    await get_current_user(request)
    return GST_SLABS

# ================== CUSTOMER ROUTES ==================

@customers_router.get("")
async def get_customers(request: Request, status: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    customers = await db.customers.find(query, {"_id": 0}).to_list(1000)
    return customers

@customers_router.get("/{customer_id}")
async def get_customer(customer_id: str, request: Request):
    await get_current_user(request)
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

@customers_router.post("", status_code=201)
async def create_customer(data: CustomerCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    existing = await db.customers.find_one({"code": data.code})
    if existing:
        raise HTTPException(status_code=400, detail="Customer code already exists")
    
    customer_doc = {
        "id": str(uuid.uuid4()),
        **data.model_dump(),
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.customers.insert_one(customer_doc)
    customer_doc.pop("_id", None)
    return customer_doc

@customers_router.put("/{customer_id}")
async def update_customer(customer_id: str, data: CustomerUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return await db.customers.find_one({"id": customer_id}, {"_id": 0})

@customers_router.delete("/{customer_id}")
async def delete_customer(customer_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"message": "Customer deleted"}

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
        {"id": str(uuid.uuid4()), "part_number": "RM-001", "name": "Steel Sheet 4mm", "description": "Cold rolled steel sheet", "category": "raw_material", "unit_of_measure": "sheet", "unit_cost": 45.00, "lead_time_days": 7, "safety_stock": 50, "current_stock": 120, "reorder_point": 60, "hsn_code": "7208", "gst_rate": 18},
        {"id": str(uuid.uuid4()), "part_number": "RM-002", "name": "Aluminum Bar 25mm", "description": "6061-T6 aluminum bar", "category": "raw_material", "unit_of_measure": "meter", "unit_cost": 28.50, "lead_time_days": 5, "safety_stock": 100, "current_stock": 85, "reorder_point": 80, "hsn_code": "7604", "gst_rate": 18},
        {"id": str(uuid.uuid4()), "part_number": "RM-003", "name": "O-Ring Kit", "description": "NBR O-rings assorted", "category": "raw_material", "unit_of_measure": "kit", "unit_cost": 12.00, "lead_time_days": 3, "safety_stock": 200, "current_stock": 350, "reorder_point": 150, "hsn_code": "4016", "gst_rate": 18},
        {"id": str(uuid.uuid4()), "part_number": "CP-001", "name": "Hydraulic Cylinder", "description": "50mm bore hydraulic cylinder", "category": "component", "unit_of_measure": "pcs", "unit_cost": 280.00, "lead_time_days": 14, "safety_stock": 10, "current_stock": 25, "reorder_point": 15, "hsn_code": "8412", "gst_rate": 18},
        {"id": str(uuid.uuid4()), "part_number": "CP-002", "name": "Control Valve", "description": "Directional control valve 4/3", "category": "component", "unit_of_measure": "pcs", "unit_cost": 165.00, "lead_time_days": 10, "safety_stock": 15, "current_stock": 30, "reorder_point": 20, "hsn_code": "8481", "gst_rate": 18},
        {"id": str(uuid.uuid4()), "part_number": "CP-003", "name": "Electric Motor 5HP", "description": "Three-phase induction motor", "category": "component", "unit_of_measure": "pcs", "unit_cost": 520.00, "lead_time_days": 21, "safety_stock": 5, "current_stock": 8, "reorder_point": 6, "hsn_code": "8501", "gst_rate": 18},
        {"id": str(uuid.uuid4()), "part_number": "SA-001", "name": "Pump Assembly", "description": "Hydraulic pump sub-assembly", "category": "sub_assembly", "unit_of_measure": "pcs", "unit_cost": 850.00, "lead_time_days": 5, "safety_stock": 8, "current_stock": 12, "reorder_point": 10, "hsn_code": "8413", "gst_rate": 18},
        {"id": str(uuid.uuid4()), "part_number": "SA-002", "name": "Control Panel", "description": "PLC control panel assembly", "category": "sub_assembly", "unit_of_measure": "pcs", "unit_cost": 1200.00, "lead_time_days": 7, "safety_stock": 3, "current_stock": 5, "reorder_point": 4, "hsn_code": "8537", "gst_rate": 18},
        {"id": str(uuid.uuid4()), "part_number": "FG-001", "name": "Hydraulic Press 50T", "description": "50-ton hydraulic press machine", "category": "finished_good", "unit_of_measure": "pcs", "unit_cost": 15000.00, "lead_time_days": 30, "safety_stock": 1, "current_stock": 2, "reorder_point": 1, "hsn_code": "8462", "gst_rate": 18},
        {"id": str(uuid.uuid4()), "part_number": "FG-002", "name": "CNC Milling Center", "description": "3-axis CNC milling machine", "category": "finished_good", "unit_of_measure": "pcs", "unit_cost": 45000.00, "lead_time_days": 45, "safety_stock": 1, "current_stock": 1, "reorder_point": 1, "hsn_code": "8459", "gst_rate": 18},
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
    
    # Seed suppliers
    suppliers = [
        {"id": str(uuid.uuid4()), "code": "SUP-001", "name": "Steel Masters Pvt. Ltd.", "contact_person": "Rajesh Kumar", "email": "rajesh@steelmasters.in", "phone": "+91-9876543210", "address": "123 Industrial Area, Pune", "gstin": "27AABCS1234F1Z5", "state_code": "27", "payment_terms": "Net 30", "lead_time_days": 7, "rating": 5, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "SUP-002", "name": "Precision Components Ltd.", "contact_person": "Suresh Patel", "email": "suresh@precisioncomp.in", "phone": "+91-9876543211", "address": "456 GIDC, Ahmedabad", "gstin": "24AABCP5678G1Z3", "state_code": "24", "payment_terms": "Net 45", "lead_time_days": 14, "rating": 4, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "SUP-003", "name": "ElectroPower Systems", "contact_person": "Amit Sharma", "email": "amit@electropower.in", "phone": "+91-9876543212", "address": "789 Electronic City, Bangalore", "gstin": "29AABCE9012H1Z1", "state_code": "29", "payment_terms": "Net 30", "lead_time_days": 21, "rating": 4, "status": "active", "created_at": datetime.now(timezone.utc)},
    ]
    await db.suppliers.insert_many(suppliers)
    logger.info("Sample suppliers seeded")
    
    # Seed company settings
    if await db.company_settings.count_documents({"type": "company"}) == 0:
        await db.company_settings.insert_one({
            "type": "company",
            "company_name": "MachineWorks Manufacturing Pvt. Ltd.",
            "gstin": "27AABCM1234A1Z5",
            "state_code": "27",
            "address": "Plot No. 45, MIDC, Pune - 411019, Maharashtra, India",
            "pan": "AABCM1234A",
            "cin": "",
            "phone": "+91-20-12345678",
            "email": "info@machineworks.in",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info("Company settings seeded")
    
    # Seed sample customers
    if await db.customers.count_documents({}) == 0:
        customers = [
            {"id": str(uuid.uuid4()), "code": "CUST-001", "name": "Tata Motors Ltd.", "gstin": "27AAACT1234D1Z5", "state_code": "27", "contact_person": "Vikram Singh", "email": "vikram@tatamotors.in", "phone": "+91-9988776655", "address": "Pimpri, Pune, Maharashtra", "payment_terms": "Net 30", "status": "active", "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "code": "CUST-002", "name": "Bharat Heavy Electricals", "gstin": "09AABCB5678E1Z3", "state_code": "09", "contact_person": "Priya Verma", "email": "priya@bhel.in", "phone": "+91-9988776656", "address": "Sector 17, Noida, UP", "payment_terms": "Net 45", "status": "active", "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "code": "CUST-003", "name": "Larsen & Toubro", "gstin": "27AABCL9012F1Z1", "state_code": "27", "contact_person": "Anish Mehta", "email": "anish@lnt.in", "phone": "+91-9988776657", "address": "Powai, Mumbai, Maharashtra", "payment_terms": "Net 30", "status": "active", "created_at": datetime.now(timezone.utc)},
        ]
        await db.customers.insert_many(customers)
        logger.info("Sample customers seeded")
    
    # Seed warehouses
    warehouses = [
        {"id": str(uuid.uuid4()), "code": "WH-MAIN", "name": "Main Warehouse", "location": "Building A, Floor 1", "is_default": True, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "WH-RAW", "name": "Raw Materials Store", "location": "Building B, Floor 1", "is_default": False, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "WH-FG", "name": "Finished Goods Store", "location": "Building C, Floor 1", "is_default": False, "status": "active", "created_at": datetime.now(timezone.utc)},
    ]
    await db.warehouses.insert_many(warehouses)
    logger.info("Sample warehouses seeded")
    
    # Seed warehouse stock (distribute items across warehouses)
    main_wh = warehouses[0]
    raw_wh = warehouses[1]
    fg_wh = warehouses[2]
    
    warehouse_stock = []
    for item in items:
        if item["category"] == "raw_material":
            warehouse_stock.append({"id": str(uuid.uuid4()), "warehouse_id": raw_wh["id"], "item_id": item["id"], "quantity": item["current_stock"], "created_at": datetime.now(timezone.utc)})
        elif item["category"] == "finished_good":
            warehouse_stock.append({"id": str(uuid.uuid4()), "warehouse_id": fg_wh["id"], "item_id": item["id"], "quantity": item["current_stock"], "created_at": datetime.now(timezone.utc)})
        else:
            warehouse_stock.append({"id": str(uuid.uuid4()), "warehouse_id": main_wh["id"], "item_id": item["id"], "quantity": item["current_stock"], "created_at": datetime.now(timezone.utc)})
    await db.warehouse_stock.insert_many(warehouse_stock)
    logger.info("Sample warehouse stock seeded")
    
    # Seed work centers
    work_centers = [
        {"id": str(uuid.uuid4()), "code": "WC-CUT", "name": "Cutting Station", "description": "Laser and plasma cutting machines", "hourly_rate": 75.00, "capacity_per_hour": 10, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "WC-WELD", "name": "Welding Bay", "description": "MIG/TIG welding stations", "hourly_rate": 85.00, "capacity_per_hour": 5, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "WC-MACH", "name": "Machining Center", "description": "CNC milling and turning", "hourly_rate": 120.00, "capacity_per_hour": 3, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "WC-ASSY", "name": "Assembly Line", "description": "Final assembly workstations", "hourly_rate": 65.00, "capacity_per_hour": 8, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "WC-TEST", "name": "Testing Station", "description": "Quality testing and inspection", "hourly_rate": 70.00, "capacity_per_hour": 6, "status": "active", "created_at": datetime.now(timezone.utc)},
    ]
    await db.work_centers.insert_many(work_centers)
    logger.info("Sample work centers seeded")
    
    # Seed routings
    routings = [
        {
            "id": str(uuid.uuid4()),
            "item_id": pump_assembly["id"],
            "name": "Pump Assembly Routing",
            "description": "Manufacturing routing for pump sub-assembly",
            "revision": "A",
            "status": "active",
            "operations": [
                {"sequence": 10, "work_center_id": work_centers[0]["id"], "operation_name": "Cut Aluminum Bar", "description": "Cut to required lengths", "setup_time_minutes": 15, "run_time_minutes": 10},
                {"sequence": 20, "work_center_id": work_centers[2]["id"], "operation_name": "Machine Components", "description": "CNC machining of pump body", "setup_time_minutes": 30, "run_time_minutes": 45},
                {"sequence": 30, "work_center_id": work_centers[3]["id"], "operation_name": "Assemble Pump", "description": "Assemble all components", "setup_time_minutes": 10, "run_time_minutes": 30},
                {"sequence": 40, "work_center_id": work_centers[4]["id"], "operation_name": "Test Pump", "description": "Pressure and leak testing", "setup_time_minutes": 5, "run_time_minutes": 15},
            ],
            "created_at": datetime.now(timezone.utc)
        },
        {
            "id": str(uuid.uuid4()),
            "item_id": hydraulic_press["id"],
            "name": "Hydraulic Press 50T Routing",
            "description": "Manufacturing routing for hydraulic press",
            "revision": "B",
            "status": "active",
            "operations": [
                {"sequence": 10, "work_center_id": work_centers[0]["id"], "operation_name": "Cut Steel Sheets", "description": "Cut frame components", "setup_time_minutes": 20, "run_time_minutes": 60},
                {"sequence": 20, "work_center_id": work_centers[1]["id"], "operation_name": "Weld Frame", "description": "Weld main frame structure", "setup_time_minutes": 45, "run_time_minutes": 120},
                {"sequence": 30, "work_center_id": work_centers[2]["id"], "operation_name": "Machine Mounting Points", "description": "CNC machine mounting surfaces", "setup_time_minutes": 30, "run_time_minutes": 60},
                {"sequence": 40, "work_center_id": work_centers[3]["id"], "operation_name": "Final Assembly", "description": "Install hydraulics and controls", "setup_time_minutes": 30, "run_time_minutes": 180},
                {"sequence": 50, "work_center_id": work_centers[4]["id"], "operation_name": "Final Testing", "description": "Full functional and safety test", "setup_time_minutes": 15, "run_time_minutes": 90},
            ],
            "created_at": datetime.now(timezone.utc)
        }
    ]
    await db.routings.insert_many(routings)
    logger.info("Sample routings seeded")

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
    await db.suppliers.create_index("code", unique=True)
    await db.purchase_orders.create_index("status")
    await db.warehouses.create_index("code", unique=True)
    await db.work_centers.create_index("code", unique=True)
    await db.routings.create_index("item_id")
    await db.work_orders.create_index("status")
    await db.customers.create_index("code", unique=True)
    await db.company_settings.create_index("type", unique=True)
    
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
api_router.include_router(suppliers_router)
api_router.include_router(purchase_orders_router)
api_router.include_router(warehouses_router)
api_router.include_router(work_centers_router)
api_router.include_router(routings_router)
api_router.include_router(work_orders_router)
api_router.include_router(settings_router)
api_router.include_router(customers_router)

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "machinery-erp"}

app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
