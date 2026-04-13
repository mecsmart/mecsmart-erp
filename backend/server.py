from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Body
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import io
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
grn_router = APIRouter(prefix="/grn")
purchase_invoices_router = APIRouter(prefix="/purchase-invoices")
jobwork_router = APIRouter(prefix="/job-work")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ================== MODELS ==================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "inventory_manager"
    permissions: Optional[dict] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[dict] = None
    status: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: datetime

# Module permission definitions
ALL_MODULES = [
    "dashboard", "items", "bom", "mrp", "production", "manufacturing",
    "quality", "inventory", "suppliers", "customers", "purchase_orders", "stores", "settings"
]
ALL_ACTIONS = ["view", "create", "edit", "delete"]

# Default permissions by role
DEFAULT_PERMISSIONS = {
    "admin": {m: ALL_ACTIONS.copy() for m in ALL_MODULES},
    "production_manager": {
        "dashboard": ["view"], "items": ["view", "create", "edit"], "bom": ["view", "create", "edit"],
        "mrp": ["view"], "production": ["view", "create", "edit", "delete"],
        "manufacturing": ["view", "create", "edit", "delete"], "quality": ["view"],
        "inventory": ["view"], "suppliers": ["view", "create", "edit"],
        "customers": ["view", "create", "edit"], "purchase_orders": ["view", "create", "edit"],
        "stores": ["view"], "settings": ["view"]
    },
    "quality_inspector": {
        "dashboard": ["view"], "items": ["view"], "bom": ["view"],
        "mrp": [], "production": ["view"],
        "manufacturing": ["view"], "quality": ["view", "create", "edit"],
        "inventory": ["view"], "suppliers": [],
        "customers": [], "purchase_orders": [],
        "stores": ["view"], "settings": ["view"]
    },
    "inventory_manager": {
        "dashboard": ["view"], "items": ["view", "create", "edit"], "bom": ["view"],
        "mrp": ["view"], "production": ["view"],
        "manufacturing": ["view"], "quality": ["view"],
        "inventory": ["view", "create", "edit", "delete"], "suppliers": ["view"],
        "customers": ["view"], "purchase_orders": ["view", "create", "edit"],
        "stores": ["view", "create", "edit", "delete"], "settings": ["view"]
    }
}

def get_default_permissions(role: str) -> dict:
    return DEFAULT_PERMISSIONS.get(role, DEFAULT_PERMISSIONS["inventory_manager"])

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
    address_line2: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    pin_code: Optional[str] = ""
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
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    gstin: Optional[str] = None
    state_code: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    rating: Optional[int] = None
    status: Optional[str] = None

class MRPCreatePORequest(BaseModel):
    supplier_id: str
    items: list  # [{"item_id": "...", "quantity": 100, "unit_price": 45}]

class PurchaseOrderLineCreate(BaseModel):
    item_id: str
    description: Optional[str] = ""
    quantity: float
    unit_price: float
    uom: Optional[str] = "pcs"
    hsn_code: Optional[str] = ""
    gst_rate: Optional[float] = 18.0
    discount_type: Optional[str] = "percentage"  # percentage or amount
    discount_value: Optional[float] = 0.0
    notes: Optional[str] = ""

class POAdditionalCharge(BaseModel):
    charge_type_id: Optional[str] = ""
    name: str
    hsn_code: Optional[str] = ""
    gst_rate: Optional[float] = 18.0
    amount: float = 0.0

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    expected_date: datetime
    delivery_warehouse_id: Optional[str] = ""
    quotation_ref: Optional[str] = ""
    quotation_date: Optional[datetime] = None
    lines: List[PurchaseOrderLineCreate]
    additional_charges: Optional[List[POAdditionalCharge]] = []
    notes: Optional[str] = ""

class PurchaseOrderUpdate(BaseModel):
    supplier_id: Optional[str] = None
    expected_date: Optional[datetime] = None
    delivery_warehouse_id: Optional[str] = None
    quotation_ref: Optional[str] = None
    quotation_date: Optional[datetime] = None
    lines: Optional[List[PurchaseOrderLineCreate]] = None
    additional_charges: Optional[List[POAdditionalCharge]] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class GRNLineVerify(BaseModel):
    item_id: str
    received_quantity: float
    verified_price: float

class GRNCreate(BaseModel):
    po_id: str
    supplier_invoice_no: str = ""
    supplier_invoice_date: Optional[datetime] = None
    lines: List[GRNLineVerify]
    warehouse_id: Optional[str] = ""
    notes: Optional[str] = ""

class POChargeTypeCreate(BaseModel):
    name: str
    hsn_code: Optional[str] = ""
    gst_rate: Optional[float] = 18.0

class POChargeTypeUpdate(BaseModel):
    name: Optional[str] = None
    hsn_code: Optional[str] = None
    gst_rate: Optional[float] = None

# ===== Purchase Invoice Models =====
class PurchaseInvoiceLineItem(BaseModel):
    item_id: str
    quantity: float
    unit_price: float
    discount: Optional[float] = 0
    hsn_code: Optional[str] = ""
    gst_rate: Optional[float] = 18.0

class PurchaseInvoiceCreate(BaseModel):
    supplier_id: str
    po_id: Optional[str] = ""
    grn_id: Optional[str] = ""
    invoice_no: str
    invoice_date: datetime
    due_date: Optional[datetime] = None
    lines: List[PurchaseInvoiceLineItem]
    notes: Optional[str] = ""

class PurchaseInvoiceUpdate(BaseModel):
    invoice_no: Optional[str] = None
    invoice_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[List[PurchaseInvoiceLineItem]] = None

# ===== Job Work / Subcontracting Models =====
class JobWorkLineItem(BaseModel):
    item_id: str
    quantity: float
    rate: Optional[float] = 0

class SubcontractOrderCreate(BaseModel):
    supplier_id: str
    lines: List[JobWorkLineItem]
    expected_return_date: Optional[datetime] = None
    processing_charges: Optional[float] = 0
    notes: Optional[str] = ""

class SubcontractOrderUpdate(BaseModel):
    expected_return_date: Optional[datetime] = None
    processing_charges: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[List[JobWorkLineItem]] = None

class DCCreate(BaseModel):
    subcontract_order_id: str
    lines: List[JobWorkLineItem]
    warehouse_id: Optional[str] = ""
    notes: Optional[str] = ""

class SubcontractReceiptLineItem(BaseModel):
    item_id: str
    received_quantity: float
    quality_result: Optional[str] = "accept"
    reject_qty: Optional[float] = 0
    rework_qty: Optional[float] = 0

class SubcontractReceiptCreate(BaseModel):
    subcontract_order_id: str
    dc_id: Optional[str] = ""
    lines: List[SubcontractReceiptLineItem]
    warehouse_id: Optional[str] = ""
    notes: Optional[str] = ""

# ================== STORES/WAREHOUSE MODELS ==================

class WarehouseCreate(BaseModel):
    code: str
    name: str
    location: Optional[str] = ""
    address: Optional[str] = ""
    is_default: bool = False
    status: str = "active"

class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    address: Optional[str] = None
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
    is_job_work: Optional[bool] = False
    job_work_supplier_id: Optional[str] = ""

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
    is_subcontract: Optional[bool] = False
    subcontract_supplier_id: Optional[str] = ""
    subcontract_type: Optional[str] = "with_material"  # with_material | without_material

class WorkOrderUpdate(BaseModel):
    status: Optional[str] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    quantity_completed: Optional[int] = None
    notes: Optional[str] = None
    is_subcontract: Optional[bool] = None
    subcontract_supplier_id: Optional[str] = None
    subcontract_type: Optional[str] = None  # with_material | without_material

class WorkOrderOperationUpdate(BaseModel):
    status: str  # pending, in_progress, completed, stopped
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    quantity_completed: Optional[int] = None
    operator: Optional[str] = None
    quality_result: Optional[str] = None  # accept, reject, rework
    reject_qty: Optional[int] = None
    rework_qty: Optional[int] = None
    notes: Optional[str] = None
    is_outsource: Optional[bool] = None
    outsource_supplier_id: Optional[str] = None
    outsource_charges: Optional[float] = None

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
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    pan: Optional[str] = None
    cin: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_data: Optional[str] = None
    tagline: Optional[str] = None
    primary_currency: Optional[str] = None
    secondary_currency: Optional[str] = None

class CustomerCreate(BaseModel):
    code: str
    name: str
    gstin: Optional[str] = ""
    state_code: Optional[str] = ""
    contact_person: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    address_line2: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    pin_code: Optional[str] = ""
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
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
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
        # Ensure permissions exist
        if "permissions" not in user or not user["permissions"]:
            user["permissions"] = get_default_permissions(user.get("role", "inventory_manager"))
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Cookie settings helper for production/development
def get_cookie_settings():
    frontend_url = os.environ.get("FRONTEND_URL", "")
    cors_origins = os.environ.get("CORS_ORIGINS", "")
    is_prod = any(domain in frontend_url for domain in ["emergent.host", "emergentagent.com"]) or cors_origins == "*" or os.environ.get("ENVIRONMENT") == "production"
    return {"secure": is_prod, "samesite": "none" if is_prod else "lax"}


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
        "permissions": user_data.permissions or get_default_permissions(user_data.role),
        "status": "active",
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=get_cookie_settings()["secure"], samesite=get_cookie_settings()["samesite"], max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=get_cookie_settings()["secure"], samesite=get_cookie_settings()["samesite"], max_age=604800, path="/")
    
    return {"id": user_id, "email": email, "name": user_data.name, "role": user_data.role}

@auth_router.post("/login")
async def login(user_data: UserLogin, response: Response, request: Request):
    try:
        email = user_data.email.lower()
        client_ip = request.client.host if request.client else "unknown"
        identifier = f"{client_ip}:{email}"
        
        # Check brute force
        attempt = await db.login_attempts.find_one({"identifier": identifier})
        if attempt and attempt.get("count", 0) >= 5:
            lockout_until = attempt.get("lockout_until")
            if lockout_until:
                # Handle both naive and aware datetimes
                now = datetime.now(timezone.utc)
                if lockout_until.tzinfo is None:
                    lockout_until = lockout_until.replace(tzinfo=timezone.utc)
                if now < lockout_until:
                    raise HTTPException(status_code=429, detail="Account locked. Try again later.")
            else:
                await db.login_attempts.delete_one({"identifier": identifier})
        
        user = await db.users.find_one({"email": email})
        if not user:
            await db.login_attempts.update_one(
                {"identifier": identifier},
                {"$inc": {"count": 1}, "$set": {"lockout_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
                upsert=True
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        pw_hash = user.get("password_hash", "")
        if not pw_hash or not verify_password(user_data.password, pw_hash):
            await db.login_attempts.update_one(
                {"identifier": identifier},
                {"$inc": {"count": 1}, "$set": {"lockout_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
                upsert=True
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Clear failed attempts on success
        await db.login_attempts.delete_one({"identifier": identifier})
        
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, email)
        refresh_token = create_refresh_token(user_id)
        
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=get_cookie_settings()["secure"], samesite=get_cookie_settings()["samesite"], max_age=900, path="/")
        response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=get_cookie_settings()["secure"], samesite=get_cookie_settings()["samesite"], max_age=604800, path="/")
        
        return {"id": user_id, "email": user["email"], "name": user["name"], "role": user["role"], "permissions": user.get("permissions") or get_default_permissions(user["role"])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Logged out successfully"}

@auth_router.get("/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    # Ensure permissions exist (for older users without permissions)
    if "permissions" not in user or not user["permissions"]:
        user["permissions"] = get_default_permissions(user.get("role", "inventory_manager"))
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
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=get_cookie_settings()["secure"], samesite=get_cookie_settings()["samesite"], max_age=900, path="/")
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
        # Calculate total MO quantity already created for this SO
        mos = await db.work_orders.find(
            {"production_order_id": order["id"], "parent_wo_id": None, "status": {"$ne": "cancelled"}},
            {"quantity": 1, "_id": 0}
        ).to_list(1000)
        order["mo_qty_created"] = sum(mo.get("quantity", 0) for mo in mos)
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
    order_number = f"SO-{str(count + 1).zfill(6)}"
    
    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "bom_id": order_data.bom_id,
        "quantity": order_data.quantity,
        "due_date": order_data.due_date,
        "priority": order_data.priority,
        "status": "draft",  # draft, confirmed, released, in_progress, completed, cancelled
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
    
    order = await db.production_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    
    # Block edit if full quantity is already covered by MOs
    mos = await db.work_orders.find(
        {"production_order_id": order_id, "parent_wo_id": None, "status": {"$ne": "cancelled"}},
        {"quantity": 1, "_id": 0}
    ).to_list(1000)
    mo_qty_total = sum(mo.get("quantity", 0) for mo in mos)
    if mo_qty_total >= order.get("quantity", 0):
        raise HTTPException(status_code=400, detail=f"Cannot edit: Manufacturing Orders already created for full quantity ({mo_qty_total}/{order['quantity']}). Cancel existing MOs first.")
    
    update_data = {k: v for k, v in order_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.production_orders.update_one({"id": order_id}, {"$set": update_data})
    
    updated = await db.production_orders.find_one({"id": order_id}, {"_id": 0})
    return updated

@production_router.post("/{order_id}/confirm")
async def confirm_production_order(order_id: str, request: Request):
    """Confirm a draft sales order - makes it available for MRP and manufacturing"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    order = await db.production_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")
    
    if order.get("status") != "draft":
        raise HTTPException(status_code=400, detail=f"Only draft orders can be confirmed. Current status: {order.get('status')}")
    
    await db.production_orders.update_one(
        {"id": order_id},
        {"$set": {"status": "confirmed", "confirmed_at": datetime.now(timezone.utc), "confirmed_by": user["id"], "updated_at": datetime.now(timezone.utc)}}
    )
    
    return await db.production_orders.find_one({"id": order_id}, {"_id": 0})

@production_router.post("/{order_id}/cancel")
async def cancel_production_order(order_id: str, request: Request):
    """Cancel a sales order with full cascade: SO → MOs → reverse stock → cancel job cards"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    order = await db.production_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")
    
    if order.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Order is already cancelled")
    if order.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Cannot cancel a completed order")
    
    cancelled_mos = []
    reversed_materials = []
    reversed_finished_goods = []
    
    # Find all manufacturing orders linked to this sales order
    mos = await db.work_orders.find({"production_order_id": order_id}).to_list(1000)
    
    for mo in mos:
        mo_id = mo["id"]
        mo_status = mo.get("status", "pending")
        mo_number = mo.get("wo_number", "")
        
        # 1. Reverse consumed materials (if MO was started and materials were consumed)
        if mo.get("materials_consumed") and mo.get("consumed_materials"):
            for mat in mo["consumed_materials"]:
                comp_item = await db.items.find_one({"id": mat["item_id"]})
                if comp_item:
                    current_stock = comp_item.get("current_stock", 0)
                    restore_qty = mat["quantity"]
                    new_stock = current_stock + restore_qty
                    
                    # Create reversal transaction
                    tx_doc = {
                        "id": str(uuid.uuid4()),
                        "item_id": mat["item_id"],
                        "transaction_type": "receive",
                        "quantity": restore_qty,
                        "reference_type": "cancellation",
                        "reference_id": mo_id,
                        "previous_stock": current_stock,
                        "new_stock": new_stock,
                        "notes": f"Reversal: SO {order.get('order_number')} cancelled - MO {mo_number}",
                        "created_at": datetime.now(timezone.utc),
                        "created_by": user["id"]
                    }
                    await db.inventory_transactions.insert_one(tx_doc)
                    await db.items.update_one({"id": mat["item_id"]}, {"$set": {"current_stock": new_stock}})
                    
                    reversed_materials.append({
                        "item": mat.get("item", ""),
                        "name": mat.get("name", ""),
                        "quantity": restore_qty,
                        "mo_number": mo_number
                    })
        
        # 2. Reverse finished goods (if MO was completed and stock was added)
        if mo_status == "completed":
            routing = await db.routings.find_one({"id": mo.get("routing_id")})
            if routing:
                fg_item_id = routing.get("item_id")
                fg_item = await db.items.find_one({"id": fg_item_id})
                if fg_item:
                    current_stock = fg_item.get("current_stock", 0)
                    produced_qty = mo.get("quantity", 0)
                    new_stock = max(0, current_stock - produced_qty)
                    
                    tx_doc = {
                        "id": str(uuid.uuid4()),
                        "item_id": fg_item_id,
                        "transaction_type": "issue",
                        "quantity": produced_qty,
                        "reference_type": "cancellation",
                        "reference_id": mo_id,
                        "previous_stock": current_stock,
                        "new_stock": new_stock,
                        "notes": f"Reversal: SO {order.get('order_number')} cancelled - MO {mo_number} finished goods reversed",
                        "created_at": datetime.now(timezone.utc),
                        "created_by": user["id"]
                    }
                    await db.inventory_transactions.insert_one(tx_doc)
                    await db.items.update_one({"id": fg_item_id}, {"$set": {"current_stock": new_stock}})
                    
                    reversed_finished_goods.append({
                        "item": fg_item.get("part_number", ""),
                        "name": fg_item.get("name", ""),
                        "quantity": produced_qty,
                        "mo_number": mo_number
                    })
        
        # 3. Cancel the manufacturing order
        await db.work_orders.update_one(
            {"id": mo_id},
            {"$set": {
                "status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc),
                "cancelled_reason": f"Parent SO {order.get('order_number')} cancelled",
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        cancelled_mos.append(mo_number)
    
    # Cancel the sales order itself
    await db.production_orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc),
            "cancelled_by": user["id"],
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "message": f"Sales Order {order.get('order_number')} cancelled successfully",
        "cancelled_mos": cancelled_mos,
        "reversed_materials": reversed_materials,
        "reversed_finished_goods": reversed_finished_goods
    }

# ================== MRP ROUTES ==================

@mrp_router.get("/demand")
async def calculate_demand(request: Request, production_order_id: Optional[str] = None):
    """Calculate material requirements based on production orders - recursively explodes all BOM levels"""
    await get_current_user(request)
    
    query = {"status": {"$in": ["confirmed", "planned", "released", "in_progress"]}}
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
    
    # Calculate net requirements and filter SO numbers to only show shortage-contributing SOs
    for item_id, data in demand.items():
        available = data["on_hand"] - data["safety_stock"]
        data["net_requirement"] = max(0, data["gross_requirement"] - available)
        
        # Only keep SOs that contribute to the shortage
        if data["net_requirement"] > 0:
            shortage_orders = []
            running_available = max(available, 0)
            for order_entry in data["orders"]:
                qty_needed = order_entry.get("quantity_needed", 0)
                if running_available >= qty_needed:
                    running_available -= qty_needed
                else:
                    shortage_orders.append(order_entry)
                    running_available = 0
            data["orders"] = shortage_orders
    
    # Filter: only raw materials with net_requirement > 0 AND on_hand < gross_requirement
    raw_material_demand = []
    for d in demand.values():
        item = d.get("item", {})
        if item.get("category") != "raw_material":
            continue
        if d.get("net_requirement", 0) <= 0:
            continue
        # If stock fully covers gross requirement, skip
        if d.get("on_hand", 0) >= d.get("gross_requirement", 0):
            continue
        
        # Check if PO already raised for this item (pending/approved POs)
        item_id = item.get("id")
        po_qty = 0
        if item_id:
            pos = await db.purchase_orders.find(
                {"status": {"$in": ["draft", "approved", "sent", "confirmed"]},
                 "reference_sc_order_id": {"$exists": False},
                 "$or": [{"lines.item_id": item_id}, {"items.item_id": item_id}]},
                {"_id": 0, "lines": 1, "items": 1, "po_number": 1}
            ).to_list(100)
            for po in pos:
                counted = False
                # Check lines first (preferred format)
                for pi in po.get("lines", []):
                    if pi.get("item_id") == item_id:
                        po_qty += max(0, (pi.get("quantity", 0) or 0) - (pi.get("received_quantity", 0) or 0))
                        counted = True
                # Only check items if not found in lines (avoid double-counting)
                if not counted:
                    for pi in po.get("items", []):
                        if pi.get("item_id") == item_id:
                            po_qty += max(0, (pi.get("quantity", 0) or 0) - (pi.get("received_quantity", 0) or 0))
        
        d["po_ordered_qty"] = int(po_qty)
        d["po_status"] = "po_sent" if po_qty >= d["net_requirement"] else ("partial_po" if po_qty > 0 else "pending")
        d["remaining_to_order"] = max(0, d["net_requirement"] - po_qty)
        
        # If PO fully covers the net requirement AND stock + PO covers demand, skip from MRP
        if po_qty >= d["net_requirement"]:
            d["po_status"] = "po_sent"
        
        raw_material_demand.append(d)
    
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
            if not item:
                continue
            mrp_qty = d.get("net_requirement", 0)
            # Check if already in suggestions (from reorder point)
            existing = next((s for s in suggestions if s.get("item", {}).get("id") == item.get("id")), None)
            if existing:
                # Use the higher of reorder-based qty and MRP demand qty
                if mrp_qty > existing.get("suggested_quantity", 0):
                    existing["suggested_quantity"] = mrp_qty
                    existing["net_requirement"] = mrp_qty
                    existing["reason"] = "mrp_requirement"
                    existing["estimated_cost"] = mrp_qty * item.get("unit_cost", 0)
            else:
                suggestions.append({
                    "item": item,
                    "reason": "mrp_requirement",
                    "current_stock": item.get("current_stock", 0),
                    "net_requirement": mrp_qty,
                    "suggested_quantity": mrp_qty,
                    "lead_time_days": item.get("lead_time_days", 0),
                    "estimated_cost": mrp_qty * item.get("unit_cost", 0)
                })
    
    # Add PO status to each suggestion
    for s in suggestions:
        s_item_id = s.get("item", {}).get("id")
        s_po_qty = 0
        if s_item_id:
            s_pos = await db.purchase_orders.find(
                {"status": {"$in": ["draft", "approved", "sent", "confirmed"]},
                 "reference_sc_order_id": {"$exists": False},
                 "$or": [{"lines.item_id": s_item_id}, {"items.item_id": s_item_id}]},
                {"_id": 0, "lines": 1, "items": 1}
            ).to_list(100)
            for po in s_pos:
                counted = False
                for pi in po.get("lines", []):
                    if pi.get("item_id") == s_item_id:
                        s_po_qty += max(0, (pi.get("quantity", 0) or 0) - (pi.get("received_quantity", 0) or 0))
                        counted = True
                if not counted:
                    for pi in po.get("items", []):
                        if pi.get("item_id") == s_item_id:
                            s_po_qty += max(0, (pi.get("quantity", 0) or 0) - (pi.get("received_quantity", 0) or 0))
        s["po_ordered_qty"] = int(s_po_qty)
        suggested = s.get("suggested_quantity", 0)
        s["po_status"] = "po_sent" if s_po_qty >= suggested else ("partial_po" if s_po_qty > 0 else "pending")
    
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
    
    users_list = []
    async for u in db.users.find({}, {"password_hash": 0}):
        u["id"] = str(u["_id"])
        del u["_id"]
        if "permissions" not in u or not u["permissions"]:
            u["permissions"] = get_default_permissions(u.get("role", "inventory_manager"))
        users_list.append(u)
    return users_list

@users_router.post("", status_code=201)
async def create_user(user_data: UserCreate, request: Request):
    admin = await get_current_user(request)
    if admin["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create users")
    
    email = user_data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_doc = {
        "email": email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": user_data.role,
        "permissions": user_data.permissions or get_default_permissions(user_data.role),
        "status": "active",
        "created_at": datetime.now(timezone.utc),
        "created_by": admin["id"]
    }
    result = await db.users.insert_one(user_doc)
    user_doc["id"] = str(result.inserted_id)
    user_doc.pop("_id", None)
    user_doc.pop("password_hash", None)
    return user_doc

@users_router.put("/{user_id}")
async def update_user(user_id: str, data: UserUpdate, request: Request):
    admin = await get_current_user(request)
    if admin["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update users")
    
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.role is not None:
        update_data["role"] = data.role
    if data.permissions is not None:
        update_data["permissions"] = data.permissions
    if data.status is not None:
        update_data["status"] = data.status
    if data.password is not None and data.password.strip():
        update_data["password_hash"] = hash_password(data.password)
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # Try matching by ObjectId
    try:
        result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    except:
        result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Return updated user
    try:
        updated = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    except:
        updated = await db.users.find_one({"id": user_id}, {"password_hash": 0})
    
    if updated:
        updated["id"] = str(updated["_id"])
        del updated["_id"]
        return updated
    return {"message": "User updated"}

@users_router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request):
    admin = await get_current_user(request)
    if admin["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete users")
    
    # Prevent self-deletion
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    try:
        result = await db.users.delete_one({"_id": ObjectId(user_id)})
    except:
        result = await db.users.delete_one({"id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

@users_router.get("/modules")
async def get_modules(request: Request):
    """Get list of all modules and actions for permission UI"""
    await get_current_user(request)
    return {
        "modules": ALL_MODULES,
        "actions": ALL_ACTIONS,
        "default_permissions": DEFAULT_PERMISSIONS
    }

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
    pending_orders = await db.production_orders.count_documents({"status": {"$in": ["draft", "confirmed", "planned", "released"]}})
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

@purchase_orders_router.get("/{po_id}/print-data")
async def get_po_print_data(po_id: str, request: Request):
    """Get PO data with company settings for printing"""
    await get_current_user(request)
    order = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    supplier = await db.suppliers.find_one({"id": order.get("supplier_id")}, {"_id": 0})
    order["supplier"] = supplier
    for line in order.get("lines", []):
        item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
        line["item"] = item
    company = await db.company_settings.find_one({"type": "company"}, {"_id": 0})
    order["company"] = company
    # Get delivery warehouse details
    if order.get("delivery_warehouse_id"):
        wh = await db.warehouses.find_one({"id": order["delivery_warehouse_id"]}, {"_id": 0})
        order["delivery_warehouse"] = wh
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
    
    # Calculate line totals with discount and GST
    lines_with_tax = []
    subtotal = 0
    total_cgst = 0
    total_sgst = 0
    total_igst = 0
    
    for line in po_data.lines:
        line_data = line.model_dump()
        gross_amount = line.quantity * line.unit_price
        
        # Calculate discount
        discount_amount = 0
        if line.discount_value and line.discount_value > 0:
            if line.discount_type == "percentage":
                discount_amount = round(gross_amount * line.discount_value / 100, 2)
            else:
                discount_amount = round(line.discount_value, 2)
        line_data["discount_amount"] = discount_amount
        line_amount = gross_amount - discount_amount
        
        # Auto-fill UOM/HSN from item if not provided
        item_doc = await db.items.find_one({"id": line.item_id}, {"_id": 0})
        if item_doc:
            if not line_data.get("hsn_code"):
                line_data["hsn_code"] = item_doc.get("hsn_code", "")
            if not line_data.get("uom") or line_data["uom"] == "pcs":
                line_data["uom"] = item_doc.get("unit_of_measure", "pcs")
            if not line_data.get("description"):
                line_data["description"] = item_doc.get("description", "")
        
        gst_rate = line.gst_rate or 0
        tax_amount = round(line_amount * gst_rate / 100, 2)
        
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
        
        line_data["gross_amount"] = round(gross_amount, 2)
        line_data["line_amount"] = round(line_amount, 2)
        line_data["tax_amount"] = tax_amount
        subtotal += line_amount
        lines_with_tax.append(line_data)
    
    # Process additional charges with GST
    charges_with_tax = []
    charges_subtotal = 0
    for charge in (po_data.additional_charges or []):
        c_data = charge.model_dump()
        c_amount = charge.amount
        c_gst_rate = charge.gst_rate or 0
        c_tax = round(c_amount * c_gst_rate / 100, 2)
        
        if is_inter_state:
            c_data["igst_amount"] = c_tax
            c_data["cgst_amount"] = 0
            c_data["sgst_amount"] = 0
            total_igst += c_tax
        else:
            c_half = round(c_tax / 2, 2)
            c_data["cgst_amount"] = c_half
            c_data["sgst_amount"] = c_half
            c_data["igst_amount"] = 0
            total_cgst += c_half
            total_sgst += c_half
        
        c_data["tax_amount"] = c_tax
        charges_subtotal += c_amount
        charges_with_tax.append(c_data)
    
    total_tax = total_cgst + total_sgst + total_igst
    total_amount = subtotal + charges_subtotal + total_tax
    
    # Get delivery address from warehouse
    delivery_address = ""
    if po_data.delivery_warehouse_id:
        wh = await db.warehouses.find_one({"id": po_data.delivery_warehouse_id}, {"_id": 0})
        if wh:
            delivery_address = wh.get("address", "") or wh.get("location", "")
    
    po_doc = {
        "id": str(uuid.uuid4()),
        "po_number": po_number,
        "revision": 0,
        "revision_history": [],
        "supplier_id": po_data.supplier_id,
        "expected_date": po_data.expected_date,
        "delivery_warehouse_id": po_data.delivery_warehouse_id or "",
        "delivery_address": delivery_address,
        "quotation_ref": po_data.quotation_ref or "",
        "quotation_date": po_data.quotation_date,
        "lines": lines_with_tax,
        "additional_charges": charges_with_tax,
        "subtotal": round(subtotal, 2),
        "charges_subtotal": round(charges_subtotal, 2),
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
async def create_po_from_mrp(data: MRPCreatePORequest, request: Request):
    """Create PO from MRP suggestions — blocks if items already covered by existing POs"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    supplier = await db.suppliers.find_one({"id": data.supplier_id})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    lines = []
    skipped_items = []
    for entry in data.items:
        item_id = entry.get("item_id") if isinstance(entry, dict) else entry
        item = await db.items.find_one({"id": item_id}, {"_id": 0})
        if not item:
            continue
        
        if isinstance(entry, dict):
            qty = entry.get("quantity") or entry.get("suggested_quantity") or max(item.get("safety_stock", 0) * 2 - item.get("current_stock", 0), 1)
            price = entry.get("unit_price") or item.get("unit_cost", 0)
        else:
            qty = max(item.get("safety_stock", 0) * 2 - item.get("current_stock", 0), 1)
            price = item.get("unit_cost", 0)
        
        # Check if existing non-cancelled POs already cover this item
        existing_po_qty = 0
        existing_pos = await db.purchase_orders.find(
            {"status": {"$nin": ["cancelled", "received"]},
             "reference_sc_order_id": {"$exists": False},
             "$or": [{"lines.item_id": item_id}, {"items.item_id": item_id}]},
            {"_id": 0, "lines": 1, "items": 1}
        ).to_list(100)
        for epo in existing_pos:
            found_in_lines = False
            for pi in epo.get("lines", []):
                if pi.get("item_id") == item_id:
                    existing_po_qty += max(0, (pi.get("quantity", 0) or 0) - (pi.get("received_quantity", 0) or 0))
                    found_in_lines = True
            if not found_in_lines:
                for pi in epo.get("items", []):
                    if pi.get("item_id") == item_id:
                        existing_po_qty += max(0, (pi.get("quantity", 0) or 0) - (pi.get("received_quantity", 0) or 0))
        
        if existing_po_qty >= int(qty):
            skipped_items.append(f"{item.get('part_number')} (PO already covers {int(existing_po_qty)} >= {int(qty)})")
            continue
        
        # Use the full user-requested qty (user already sees suggested amount and confirmed it)
        final_qty = max(int(qty), 1)
        
        lines.append({
            "item_id": item_id,
            "quantity": final_qty,
            "unit_price": price,
            "hsn_code": item.get("hsn_code", ""),
            "gst_rate": item.get("gst_rate", 18),
            "uom": item.get("unit_of_measure", "pcs"),
            "notes": ""
        })
    
    if not lines:
        skip_msg = "\n".join(skipped_items) if skipped_items else "No valid items."
        raise HTTPException(status_code=400, detail=f"All items already have POs covering the required quantity.\n{skip_msg}")
    
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
        "revision": 0,
        "revision_history": [],
        "supplier_id": data.supplier_id,
        "expected_date": datetime.now(timezone.utc) + timedelta(days=supplier.get("lead_time_days", 7)),
        "delivery_warehouse_id": "",
        "delivery_address": "",
        "quotation_ref": "",
        "quotation_date": None,
        "lines": lines,
        "additional_charges": [],
        "subtotal": round(subtotal, 2),
        "charges_subtotal": 0,
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
    
    existing_po = await db.purchase_orders.find_one({"id": po_id})
    if not existing_po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    if existing_po.get("status") in ["received", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot edit a received or cancelled PO")
    
    is_draft = existing_po.get("status") == "draft"
    
    # If PO is already submitted (sent/partial), create a revision
    if not is_draft and po_data.lines is not None:
        # Save current state to revision history
        snapshot = {
            "revision": existing_po.get("revision", 0),
            "lines": existing_po.get("lines", []),
            "additional_charges": existing_po.get("additional_charges", []),
            "subtotal": existing_po.get("subtotal", 0),
            "total_amount": existing_po.get("total_amount", 0),
            "revised_at": datetime.now(timezone.utc),
            "revised_by": user["id"]
        }
        await db.purchase_orders.update_one(
            {"id": po_id},
            {"$push": {"revision_history": snapshot},
             "$inc": {"revision": 1}}
        )
    
    # Build update data - recalculate if lines or charges changed
    if po_data.lines is not None:
        supplier_id = po_data.supplier_id or existing_po.get("supplier_id")
        supplier = await db.suppliers.find_one({"id": supplier_id})
        company_settings = await db.company_settings.find_one({"type": "company"}, {"_id": 0})
        company_state = company_settings.get("state_code", "") if company_settings else ""
        supplier_state = supplier.get("state_code", "") if supplier else ""
        is_inter_state = company_state and supplier_state and company_state != supplier_state
        
        lines_with_tax = []
        subtotal = 0
        total_cgst = 0
        total_sgst = 0
        total_igst = 0
        
        for line in po_data.lines:
            line_data = line.model_dump()
            gross_amount = line.quantity * line.unit_price
            discount_amount = 0
            if line.discount_value and line.discount_value > 0:
                if line.discount_type == "percentage":
                    discount_amount = round(gross_amount * line.discount_value / 100, 2)
                else:
                    discount_amount = round(line.discount_value, 2)
            line_data["discount_amount"] = discount_amount
            line_amount = gross_amount - discount_amount
            
            item_doc = await db.items.find_one({"id": line.item_id}, {"_id": 0})
            if item_doc:
                if not line_data.get("hsn_code"):
                    line_data["hsn_code"] = item_doc.get("hsn_code", "")
                if not line_data.get("uom") or line_data["uom"] == "pcs":
                    line_data["uom"] = item_doc.get("unit_of_measure", "pcs")
                if not line_data.get("description"):
                    line_data["description"] = item_doc.get("description", "")
            
            gst_rate = line.gst_rate or 0
            tax_amount = round(line_amount * gst_rate / 100, 2)
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
            
            line_data["gross_amount"] = round(gross_amount, 2)
            line_data["line_amount"] = round(line_amount, 2)
            line_data["tax_amount"] = tax_amount
            subtotal += line_amount
            lines_with_tax.append(line_data)
        
        charges_with_tax = []
        charges_subtotal = 0
        for charge in (po_data.additional_charges or existing_po.get("additional_charges", [])):
            c_data = charge.model_dump() if hasattr(charge, 'model_dump') else dict(charge)
            c_amount = c_data.get("amount", 0)
            c_gst_rate = c_data.get("gst_rate", 0)
            c_tax = round(c_amount * c_gst_rate / 100, 2)
            if is_inter_state:
                c_data["igst_amount"] = c_tax
                c_data["cgst_amount"] = 0
                c_data["sgst_amount"] = 0
                total_igst += c_tax
            else:
                c_half = round(c_tax / 2, 2)
                c_data["cgst_amount"] = c_half
                c_data["sgst_amount"] = c_half
                c_data["igst_amount"] = 0
                total_cgst += c_half
                total_sgst += c_half
            c_data["tax_amount"] = c_tax
            charges_subtotal += c_amount
            charges_with_tax.append(c_data)
        
        total_tax = total_cgst + total_sgst + total_igst
        total_amount = subtotal + charges_subtotal + total_tax
        
        update_data = {
            "lines": lines_with_tax,
            "additional_charges": charges_with_tax,
            "subtotal": round(subtotal, 2),
            "charges_subtotal": round(charges_subtotal, 2),
            "total_cgst": round(total_cgst, 2),
            "total_sgst": round(total_sgst, 2),
            "total_igst": round(total_igst, 2),
            "total_tax": round(total_tax, 2),
            "total_amount": round(total_amount, 2),
            "is_inter_state": is_inter_state,
        }
        if po_data.supplier_id:
            update_data["supplier_id"] = po_data.supplier_id
    else:
        update_data = {}
    
    # Set simple fields
    if po_data.expected_date is not None:
        update_data["expected_date"] = po_data.expected_date
    if po_data.status is not None:
        update_data["status"] = po_data.status
    if po_data.notes is not None:
        update_data["notes"] = po_data.notes
    if po_data.delivery_warehouse_id is not None:
        update_data["delivery_warehouse_id"] = po_data.delivery_warehouse_id
        wh = await db.warehouses.find_one({"id": po_data.delivery_warehouse_id}, {"_id": 0})
        update_data["delivery_address"] = (wh.get("address", "") or wh.get("location", "")) if wh else ""
    if po_data.quotation_ref is not None:
        update_data["quotation_ref"] = po_data.quotation_ref
    if po_data.quotation_date is not None:
        update_data["quotation_date"] = po_data.quotation_date
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.purchase_orders.update_one({"id": po_id}, {"$set": update_data})
    
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    return po


@purchase_orders_router.post("/{po_id}/cancel")
async def cancel_purchase_order(po_id: str, request: Request):
    """Cancel a PO. Only draft/approved/sent POs can be cancelled."""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    if po.get("status") in ["received", "cancelled"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel a {po['status']} PO")
    
    await db.purchase_orders.update_one(
        {"id": po_id},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc), "cancelled_by": user["id"]}}
    )
    
    return {"message": f"Purchase Order {po.get('po_number')} cancelled successfully"}


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
        raise HTTPException(status_code=400, detail="GRN already completed for this PO")
    
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
    
    return {"message": "GRN completed successfully"}

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

# ================== GRN (GOODS RECEIPT NOTE) ROUTES ==================

@grn_router.get("")
async def get_grn_list(request: Request):
    """Get all GRN records"""
    await get_current_user(request)
    grns = await db.grn.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for grn in grns:
        po = await db.purchase_orders.find_one({"id": grn.get("po_id")}, {"_id": 0})
        grn["po"] = po
        supplier = await db.suppliers.find_one({"id": po.get("supplier_id")}, {"_id": 0}) if po else None
        grn["supplier"] = supplier
        for line in grn.get("lines", []):
            item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
            line["item"] = item
    return grns

@grn_router.get("/pending-pos")
async def get_pending_grn_pos(request: Request):
    """Get POs that are sent/partial and ready for GRN"""
    await get_current_user(request)
    pos = await db.purchase_orders.find(
        {"status": {"$in": ["sent", "partial"]}}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    for po in pos:
        supplier = await db.suppliers.find_one({"id": po.get("supplier_id")}, {"_id": 0})
        po["supplier"] = supplier
        for line in po.get("lines", []):
            item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
            line["item"] = item
    return pos

@grn_router.post("", status_code=201)
async def create_grn(grn_data: GRNCreate, request: Request):
    """Create GRN - verify material, price, update inventory"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    po = await db.purchase_orders.find_one({"id": grn_data.po_id})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.get("status") == "received":
        raise HTTPException(status_code=400, detail="GRN already completed for this PO")
    
    # Generate GRN number
    count = await db.grn.count_documents({})
    grn_number = f"GRN-{str(count + 1).zfill(6)}"
    
    # Process each line - update inventory with verified quantities
    grn_lines = []
    for grn_line in grn_data.lines:
        item = await db.items.find_one({"id": grn_line.item_id})
        if not item:
            continue
        
        current_stock = item.get("current_stock", 0)
        new_stock = current_stock + grn_line.received_quantity
        
        # Find matching PO line for reference
        po_line = next((l for l in po.get("lines", []) if l.get("item_id") == grn_line.item_id), {})
        
        grn_lines.append({
            "item_id": grn_line.item_id,
            "po_quantity": po_line.get("quantity", 0),
            "received_quantity": grn_line.received_quantity,
            "po_price": po_line.get("unit_price", 0),
            "verified_price": grn_line.verified_price,
            "uom": po_line.get("uom", "pcs"),
            "hsn_code": po_line.get("hsn_code", ""),
        })
        
        # Create inventory transaction
        tx_doc = {
            "id": str(uuid.uuid4()),
            "item_id": grn_line.item_id,
            "transaction_type": "receive",
            "quantity": grn_line.received_quantity,
            "reference_type": "grn",
            "reference_id": grn_number,
            "previous_stock": current_stock,
            "new_stock": new_stock,
            "notes": f"GRN {grn_number} from PO {po.get('po_number')}",
            "created_at": datetime.now(timezone.utc),
            "created_by": user["id"]
        }
        await db.inventory_transactions.insert_one(tx_doc)
        await db.items.update_one({"id": grn_line.item_id}, {"$set": {"current_stock": new_stock}})
    
    grn_doc = {
        "id": str(uuid.uuid4()),
        "grn_number": grn_number,
        "po_id": grn_data.po_id,
        "po_number": po.get("po_number", ""),
        "supplier_id": po.get("supplier_id", ""),
        "supplier_invoice_no": grn_data.supplier_invoice_no,
        "supplier_invoice_date": grn_data.supplier_invoice_date,
        "warehouse_id": grn_data.warehouse_id or po.get("delivery_warehouse_id", ""),
        "lines": grn_lines,
        "notes": grn_data.notes,
        "status": "completed",
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.grn.insert_one(grn_doc)
    grn_doc.pop("_id", None)
    
    # Update PO status to received
    await db.purchase_orders.update_one(
        {"id": grn_data.po_id},
        {"$set": {
            "status": "received",
            "received_at": datetime.now(timezone.utc),
            "received_by": user["id"],
            "grn_number": grn_number
        }}
    )
    
    return grn_doc

@grn_router.get("/{grn_id}/print-data")
async def get_grn_print_data(grn_id: str, request: Request):
    """Get GRN data for printing"""
    await get_current_user(request)
    grn = await db.grn.find_one({"id": grn_id}, {"_id": 0})
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    po = await db.purchase_orders.find_one({"id": grn.get("po_id")}, {"_id": 0})
    grn["po"] = po
    supplier = await db.suppliers.find_one({"id": grn.get("supplier_id")}, {"_id": 0})
    grn["supplier"] = supplier
    for line in grn.get("lines", []):
        item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
        line["item"] = item
    company = await db.company_settings.find_one({"type": "company"}, {"_id": 0})
    grn["company"] = company
    if grn.get("warehouse_id"):
        wh = await db.warehouses.find_one({"id": grn["warehouse_id"]}, {"_id": 0})
        grn["warehouse"] = wh
    return grn

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
        wo_number = f"MO-{str(count + 1).zfill(6)}"
        
        # Create operation statuses
        operations_status = []
        for op in item_routing.get("operations", []):
            operations_status.append({
                "sequence": op.get("sequence"),
                "operation_name": op.get("operation_name"),
                "work_center_id": op.get("work_center_id"),
                "work_center_name": "",
                "is_job_work": op.get("is_job_work", False),
                "job_work_supplier_id": op.get("job_work_supplier_id", ""),
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
            "is_subcontract": wo_data.is_subcontract if is_main else False,
            "subcontract_supplier_id": wo_data.subcontract_supplier_id if is_main else "",
            "subcontract_type": wo_data.subcontract_type if is_main else "with_material",
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
            
            # Skip if stock is sufficient for the required quantity
            current_stock = child_item.get("current_stock", 0)
            if current_stock >= child_qty:
                logger.info(f"Skipping child MO for {child_item.get('part_number')} — stock {current_stock} >= required {child_qty}")
                continue
            
            # Create MO only for shortage qty (required - stock on hand)
            shortage_qty = child_qty - int(current_stock)
            
            # Create work orders for any item that has a routing (can be manufactured)
            child_routing = await db.routings.find_one({"item_id": child_item_id, "status": "active"})
            if child_routing:
                child_wo = await create_wo_for_item(child_item_id, shortage_qty, parent_wo_id)
                if child_wo:
                    created_work_orders.append(child_wo)
                    # Recursively create work orders for this child's children
                    await create_child_work_orders(child_item_id, child_qty, child_wo["id"])
    
    # If subcontract is selected, create SC Order directly (no MO)
    if wo_data.is_subcontract and wo_data.subcontract_supplier_id:
        item_id = routing.get("item_id")
        bom = await db.boms.find_one({"parent_item_id": item_id, "status": "active"})
        
        # Build SC lines from first-level BOM components
        sc_lines = []
        if bom:
            for comp in bom.get("components", []):
                if comp.get("is_alternate"):
                    continue
                comp_item = await db.items.find_one({"id": comp["item_id"]}, {"_id": 0})
                if comp_item:
                    qty_needed = int(comp["quantity"] * wo_data.quantity)
                    sc_lines.append({
                        "item_id": comp["item_id"],
                        "quantity": qty_needed,
                        "sent_quantity": qty_needed if wo_data.subcontract_type == "with_material" else 0,
                        "received_quantity": 0,
                        "rate": comp_item.get("unit_cost", 0)
                    })
        
        # Fallback: if no BOM, use the item itself
        if not sc_lines:
            sc_lines.append({
                "item_id": item_id,
                "quantity": wo_data.quantity,
                "sent_quantity": wo_data.quantity if wo_data.subcontract_type == "with_material" else 0,
                "received_quantity": 0,
                "rate": item.get("unit_cost", 0)
            })
        
        # Check if an existing SC order exists for same supplier + same SO (consolidation)
        existing_sc = await db.subcontract_orders.find_one({
            "supplier_id": wo_data.subcontract_supplier_id,
            "production_order_id": wo_data.production_order_id,
            "status": {"$in": ["draft", "confirmed", "in_progress"]}
        })
        
        if existing_sc:
            # Consolidate: merge lines into existing SC order
            existing_lines = existing_sc.get("lines", [])
            for new_line in sc_lines:
                found = False
                for el in existing_lines:
                    if el["item_id"] == new_line["item_id"]:
                        el["quantity"] += new_line["quantity"]
                        el["sent_quantity"] += new_line["sent_quantity"]
                        found = True
                        break
                if not found:
                    existing_lines.append(new_line)
            
            await db.subcontract_orders.update_one(
                {"id": existing_sc["id"]},
                {"$set": {"lines": existing_lines, "updated_at": datetime.now(timezone.utc),
                          "notes": existing_sc.get("notes", "") + f"\nConsolidated: Added {item.get('part_number')} x{wo_data.quantity}"}}
            )
            updated_sc = await db.subcontract_orders.find_one({"id": existing_sc["id"]}, {"_id": 0})
            return {"message": f"Consolidated into existing SC Order {existing_sc['order_number']}", "sc_order": updated_sc, "work_orders": [], "is_sc_direct": True}
        else:
            # Create new SC order
            sc_count = await db.subcontract_orders.count_documents({})
            sc_doc = {
                "id": str(uuid.uuid4()),
                "order_number": f"JW-{str(sc_count + 1).zfill(6)}",
                "supplier_id": wo_data.subcontract_supplier_id,
                "production_order_id": wo_data.production_order_id,
                "subcontract_type": wo_data.subcontract_type or "with_material",
                "fg_item_id": item_id,
                "fg_item_name": f"{item.get('part_number', '')} - {item.get('name', '')}",
                "fg_quantity": wo_data.quantity,
                "lines": sc_lines,
                "processing_charges": 0,
                "status": "draft",
                "notes": f"Direct SC from SO {prod_order.get('order_number', '')} — {item.get('part_number')} x{wo_data.quantity}",
                "created_at": datetime.now(timezone.utc),
                "created_by": user["id"]
            }
            await db.subcontract_orders.insert_one(sc_doc)
            sc_doc.pop("_id", None)
            
            # Create DC if with_material
            auto_dc = None
            if wo_data.subcontract_type == "with_material" and sc_lines:
                dc_lines = [{"item_id": l["item_id"], "quantity": l["quantity"], "rate": l["rate"]} for l in sc_lines]
                dc_count = await db.delivery_challans.count_documents({})
                dc_doc = {
                    "id": str(uuid.uuid4()),
                    "dc_number": f"DC-{str(dc_count + 1).zfill(6)}",
                    "subcontract_order_id": sc_doc["id"],
                    "lines": dc_lines,
                    "status": "sent",
                    "notes": f"Auto-DC for direct SC {sc_doc['order_number']}",
                    "created_at": datetime.now(timezone.utc),
                    "created_by": user["id"]
                }
                await db.delivery_challans.insert_one(dc_doc)
                dc_doc.pop("_id", None)
                auto_dc = dc_doc
            
            return {"message": f"Created SC Order {sc_doc['order_number']}" + (" + DC" if auto_dc else ""), "sc_order": sc_doc, "work_orders": [], "is_sc_direct": True}
    
    # Normal MO creation flow (no subcontract)
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
    
    # Get the routing and item
    routing = await db.routings.find_one({"id": wo.get("routing_id")})
    if not routing:
        raise HTTPException(status_code=404, detail="Routing not found")
    
    item_id = routing.get("item_id")
    
    # Find BOM for this item to get required materials
    bom = await db.boms.find_one({"parent_item_id": item_id, "status": "active"})
    
    consumed_materials = []
    insufficient_materials = []
    
    # Skip material consumption only for "without_material" subcontract
    # For "with_material" SC: consume RM from stock (RM is sent to vendor via DC)
    sc_type = wo.get("subcontract_type", "with_material")
    skip_material_consumption = wo.get("is_subcontract") and sc_type == "without_material"
    
    if bom and not skip_material_consumption:
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
                        "item_id": comp_item_id,
                        "item": comp_item.get("part_number"),
                        "name": comp_item.get("name"),
                        "quantity": required_qty,
                        "uom": comp_item.get("unit_of_measure", "pcs"),
                        "unit_cost": comp_item.get("unit_cost", 0)
                    })
    
    if insufficient_materials:
        return {
            "success": False,
            "message": "Insufficient materials to start work order",
            "insufficient_materials": insufficient_materials
        }
    
    # Update work order status to in_progress
    # Do NOT auto-start the first operation — let user pick operator/supplier via Job Card
    await db.work_orders.update_one(
        {"id": wo_id},
        {"$set": {
            "status": "in_progress",
            "actual_start": datetime.now(timezone.utc),
            "materials_consumed": True,
            "consumed_materials": consumed_materials,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Auto-create SC Order + DC for sub-contract MO
    auto_dc = None
    if wo.get("is_subcontract") and wo.get("subcontract_supplier_id"):
        # For "without_material": SC order line = the finished item itself (no RM sent)
        # For "with_material": SC order lines = consumed materials (RM sent to vendor)
        if sc_type == "without_material":
            wo_item = await db.items.find_one({"id": item_id}, {"_id": 0})
            sc_material_lines = [{"item_id": item_id, "quantity": wo.get("quantity", 1), "unit_cost": wo_item.get("unit_cost", 0)}] if wo_item else []
        else:
            sc_material_lines = consumed_materials
            if not sc_material_lines:
                wo_item = await db.items.find_one({"id": item_id}, {"_id": 0})
                if wo_item:
                    sc_material_lines = [{"item_id": item_id, "quantity": wo.get("quantity", 1), "unit_cost": wo_item.get("unit_cost", 0)}]
        
        # Find or create a subcontract order
        sc_order = await db.subcontract_orders.find_one({"reference_wo_id": wo_id})
        sc_order_id = ""
        if not sc_order:
            sc_count = await db.subcontract_orders.count_documents({})
            # For without_material: sent_quantity=0 (nothing sent to vendor), they source themselves
            sc_sent_qty = lambda m: m["quantity"] if sc_type == "with_material" else 0
            wo_item_for_name = await db.items.find_one({"id": item_id}, {"_id": 0})
            sc_order_doc = {
                "id": str(uuid.uuid4()),
                "order_number": f"JW-{str(sc_count + 1).zfill(6)}",
                "supplier_id": wo["subcontract_supplier_id"],
                "reference_wo_id": wo_id,
                "subcontract_type": sc_type,
                "fg_item_id": item_id,
                "fg_item_name": f"{wo_item_for_name.get('part_number', '')} - {wo_item_for_name.get('name', '')}" if wo_item_for_name else "",
                "fg_quantity": wo.get("quantity", 0),
                "lines": [{"item_id": m["item_id"], "quantity": m["quantity"], "sent_quantity": sc_sent_qty(m), "received_quantity": 0, "rate": m.get("unit_cost", 0)} for m in sc_material_lines],
                "status": "in_progress",
                "notes": f"Auto-created from sub-contract MO {wo.get('wo_number')} ({sc_type.replace('_', ' ')})",
                "created_at": datetime.now(timezone.utc),
                "created_by": user["id"]
            }
            await db.subcontract_orders.insert_one(sc_order_doc)
            sc_order_doc.pop("_id", None)
            sc_order_id = sc_order_doc["id"]
        else:
            sc_order_id = sc_order["id"]
        
        # Only create DC for "with_material" type (materials are physically sent)
        if sc_type == "with_material" and sc_material_lines:
            dc_lines = [{"item_id": m["item_id"], "quantity": m["quantity"], "rate": m.get("unit_cost", 0)} for m in sc_material_lines]
            dc_count = await db.delivery_challans.count_documents({})
            dc_number = f"DC-{str(dc_count + 1).zfill(6)}"
            dc_doc = {
                "id": str(uuid.uuid4()),
                "dc_number": dc_number,
                "subcontract_order_id": sc_order_id,
                "reference_wo_id": wo_id,
                "lines": dc_lines,
                "status": "sent",
                "notes": f"Auto-DC for sub-contract MO {wo.get('wo_number')}",
                "created_at": datetime.now(timezone.utc),
                "created_by": user["id"]
            }
            await db.delivery_challans.insert_one(dc_doc)
            dc_doc.pop("_id", None)
            auto_dc = dc_doc
    
    sc_type_label = f" ({sc_type.replace('_', ' ')})" if wo.get("is_subcontract") else ""
    return {
        "success": True,
        "message": ("Work order started" + (", materials consumed" if consumed_materials else ", no materials consumed (without material SC)") + (" + DC created for sub-contract" if auto_dc else "") + sc_type_label),
        "consumed_materials": consumed_materials,
        "wo_number": wo.get("wo_number"),
        "auto_dc": auto_dc
    }


@work_orders_router.get("/{wo_id}/tree")
async def get_work_order_tree(wo_id: str, request: Request):
    """Get the MO tree: Finished Good → Semi-Finished → Parts"""
    await get_current_user(request)
    
    async def build_tree(wid):
        wo = await db.work_orders.find_one({"id": wid}, {"_id": 0})
        if not wo:
            return None
        item = await db.items.find_one({"id": wo.get("item_id")}, {"_id": 0})
        wo["item"] = item
        children = await db.work_orders.find({"parent_wo_id": wid}, {"_id": 0}).to_list(100)
        wo["children"] = []
        for child in children:
            child_tree = await build_tree(child["id"])
            if child_tree:
                wo["children"].append(child_tree)
        return wo
    
    # Find root MO (may be this one or its parent)
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    root_id = wo_id
    if wo.get("parent_wo_id"):
        # Walk up to root
        current = wo
        while current.get("parent_wo_id"):
            parent = await db.work_orders.find_one({"id": current["parent_wo_id"]}, {"_id": 0})
            if not parent:
                break
            current = parent
            root_id = current["id"]
    
    return await build_tree(root_id)

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
        operations = wo.get("operations_status", [])
        mo_qty = wo.get("quantity", 0)
        
        # Block completion if ANY operation is not completed
        for op in operations:
            if op.get("status") != "completed":
                raise HTTPException(status_code=400, detail=f"Cannot complete: Operation '{op.get('operation_name')}' (Seq {op.get('sequence')}) is not completed yet. Complete all operations via Job Card first.")
        
        # Block completion if subcontracted and materials not received
        if wo.get("is_subcontract"):
            sc_order = await db.subcontract_orders.find_one({"reference_wo_id": wo_id})
            if sc_order and sc_order.get("status") != "completed":
                raise HTTPException(status_code=400, detail="Cannot complete: Subcontracted materials have not been fully received. Please receive materials from subcontractor first.")
        
        # Block completion if any operation is outsourced and SC order not received
        for op in operations:
            if op.get("is_job_work") and op.get("outsource_status") == "sent":
                raise HTTPException(status_code=400, detail=f"Cannot complete: Outsourced operation '{op.get('operation_name')}' materials not received back. Receive from vendor first.")
        
        # Block completion if last operation produced less than MO quantity
        if operations:
            last_op = operations[-1]
            last_op_qty = last_op.get("quantity_completed", 0)
            if last_op_qty < mo_qty:
                raise HTTPException(status_code=400, detail=f"Cannot complete: Last operation produced {last_op_qty}/{mo_qty} units. Full quantity must be produced before completing the MO.")
        
        routing = await db.routings.find_one({"id": wo.get("routing_id")})
        if routing:
            item_id = routing.get("item_id")
            item = await db.items.find_one({"id": item_id})
            if item:
                current_stock = item.get("current_stock", 0)
                # Use actual produced qty from last operation
                last_op = operations[-1] if operations else {}
                produced_qty = last_op.get("quantity_accepted", last_op.get("quantity_completed", mo_qty))
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
    
    # If marking an already-started MO as subcontract, create SC Order + DC now
    if update_data.get("is_subcontract") and wo.get("status") == "in_progress":
        updated_wo_fresh = await db.work_orders.find_one({"id": wo_id})
        sc_supplier = updated_wo_fresh.get("subcontract_supplier_id") or update_data.get("subcontract_supplier_id")
        sc_type = updated_wo_fresh.get("subcontract_type", "with_material")
        if sc_supplier:
            existing_sc = await db.subcontract_orders.find_one({"reference_wo_id": wo_id})
            if not existing_sc:
                # Build lines based on subcontract type
                if sc_type == "without_material":
                    routing = await db.routings.find_one({"id": updated_wo_fresh.get("routing_id")})
                    wo_item_id = routing.get("item_id") if routing else updated_wo_fresh.get("item_id")
                    wo_item = await db.items.find_one({"id": wo_item_id}, {"_id": 0})
                    sc_lines_data = [{"item_id": wo_item_id, "quantity": updated_wo_fresh.get("quantity", 1), "unit_cost": wo_item.get("unit_cost", 0)}] if wo_item else []
                else:
                    consumed = updated_wo_fresh.get("consumed_materials", [])
                    sc_lines_data = consumed
                    if not sc_lines_data:
                        routing = await db.routings.find_one({"id": updated_wo_fresh.get("routing_id")})
                        wo_item_id = routing.get("item_id") if routing else updated_wo_fresh.get("item_id")
                        wo_item = await db.items.find_one({"id": wo_item_id}, {"_id": 0})
                        if wo_item:
                            sc_lines_data = [{"item_id": wo_item_id, "quantity": updated_wo_fresh.get("quantity", 1), "unit_cost": wo_item.get("unit_cost", 0)}]
                
                if sc_lines_data:
                    sc_count = await db.subcontract_orders.count_documents({})
                    sc_sent_qty = lambda m: m["quantity"] if sc_type == "with_material" else 0
                    # Get FG item name
                    upd_routing = await db.routings.find_one({"id": updated_wo_fresh.get("routing_id")})
                    upd_fg_item_id = upd_routing.get("item_id") if upd_routing else updated_wo_fresh.get("item_id")
                    upd_fg_item = await db.items.find_one({"id": upd_fg_item_id}, {"_id": 0})
                    sc_doc = {
                        "id": str(uuid.uuid4()),
                        "order_number": f"JW-{str(sc_count + 1).zfill(6)}",
                        "supplier_id": sc_supplier,
                        "reference_wo_id": wo_id,
                        "subcontract_type": sc_type,
                        "fg_item_id": upd_fg_item_id,
                        "fg_item_name": f"{upd_fg_item.get('part_number', '')} - {upd_fg_item.get('name', '')}" if upd_fg_item else "",
                        "fg_quantity": updated_wo_fresh.get("quantity", 0),
                        "lines": [{"item_id": m["item_id"], "quantity": m["quantity"], "sent_quantity": sc_sent_qty(m), "received_quantity": 0, "rate": m.get("unit_cost", 0)} for m in sc_lines_data],
                        "status": "in_progress",
                        "notes": f"Auto-created from sub-contract MO {updated_wo_fresh.get('wo_number')} ({sc_type.replace('_', ' ')})",
                        "created_at": datetime.now(timezone.utc),
                        "created_by": user["id"]
                    }
                    await db.subcontract_orders.insert_one(sc_doc)
                    sc_doc.pop("_id", None)
                    
                    # Only create DC for "with_material" type
                    if sc_type == "with_material":
                        dc_lines = [{"item_id": m["item_id"], "quantity": m["quantity"], "rate": m.get("unit_cost", 0)} for m in sc_lines_data]
                        if dc_lines:
                            dc_count = await db.delivery_challans.count_documents({})
                            dc_doc = {
                                "id": str(uuid.uuid4()),
                                "dc_number": f"DC-{str(dc_count + 1).zfill(6)}",
                                "subcontract_order_id": sc_doc["id"],
                                "reference_wo_id": wo_id,
                                "lines": dc_lines,
                                "status": "sent",
                                "notes": f"Auto-DC for sub-contract MO {updated_wo_fresh.get('wo_number')}",
                                "created_at": datetime.now(timezone.utc),
                                "created_by": user["id"]
                            }
                            await db.delivery_challans.insert_one(dc_doc)
    
    updated_wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    return updated_wo

@work_orders_router.put("/{wo_id}/operations/{sequence}")
async def update_work_order_operation(wo_id: str, sequence: int, op_data: WorkOrderOperationUpdate, request: Request):
    """Update a specific operation status within a work order (Job Card)"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    wo = await db.work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    if wo.get("status") == "pending":
        raise HTTPException(status_code=400, detail="Cannot update operations: Manufacturing order has not been started. Please start the MO first.")
    if wo.get("status") not in ["in_progress"]:
        raise HTTPException(status_code=400, detail=f"Cannot update operations on {wo.get('status')} manufacturing order")
    
    operations = wo.get("operations_status", [])
    target_op = None
    target_idx = None
    
    for idx, op in enumerate(operations):
        if op.get("sequence") == sequence:
            target_op = op
            target_idx = idx
            break
    
    if target_op is None:
        raise HTTPException(status_code=404, detail="Operation not found")
    
    mo_qty = wo.get("quantity", 0)
    
    # START operation
    if op_data.status == "in_progress":
        for prev_op in operations[:target_idx]:
            if prev_op.get("status") not in ["completed", "stopped"]:
                raise HTTPException(status_code=400, detail=f"Previous operation '{prev_op.get('operation_name')}' must be completed first")
        
        is_outsource = op_data.is_outsource or False
        
        if is_outsource:
            if not op_data.outsource_supplier_id:
                raise HTTPException(status_code=400, detail="Supplier is required for outsourced operations")
            
            supplier = await db.suppliers.find_one({"id": op_data.outsource_supplier_id}, {"_id": 0})
            supplier_name = supplier.get("name", "Outsourced") if supplier else "Outsourced"
            
            # Create SC Order for this operation
            sc_count = await db.subcontract_orders.count_documents({})
            sc_order_number = f"JW-{str(sc_count + 1).zfill(6)}"
            
            # Get materials for this MO — prefer consumed_materials, fallback to BOM, then WO item itself
            consumed = wo.get("consumed_materials", [])
            sc_lines = []
            dc_lines = []
            if consumed:
                for m in consumed:
                    qty_needed = m.get("quantity", 0)
                    sc_lines.append({"item_id": m["item_id"], "quantity": qty_needed, "sent_quantity": qty_needed, "received_quantity": 0, "rate": m.get("unit_cost", 0)})
                    dc_lines.append({"item_id": m["item_id"], "quantity": qty_needed, "rate": m.get("unit_cost", 0)})
            else:
                bom = await db.boms.find_one({"parent_item_id": wo.get("item_id"), "status": "active"})
                if bom:
                    for comp in bom.get("components", []):
                        comp_item = await db.items.find_one({"id": comp["item_id"]}, {"_id": 0})
                        if comp_item:
                            qty_needed = comp["quantity"] * mo_qty
                            sc_lines.append({"item_id": comp["item_id"], "quantity": qty_needed, "sent_quantity": qty_needed, "received_quantity": 0, "rate": comp_item.get("unit_cost", 0)})
                            dc_lines.append({"item_id": comp["item_id"], "quantity": qty_needed, "rate": comp_item.get("unit_cost", 0)})
                # Fallback: add the WO item itself
                if not sc_lines:
                    wo_item = await db.items.find_one({"id": wo.get("item_id")}, {"_id": 0})
                    if wo_item:
                        sc_lines.append({"item_id": wo.get("item_id"), "quantity": mo_qty, "sent_quantity": mo_qty, "received_quantity": 0, "rate": wo_item.get("unit_cost", 0)})
                        dc_lines.append({"item_id": wo.get("item_id"), "quantity": mo_qty, "rate": wo_item.get("unit_cost", 0)})
            
            sc_order_doc = {
                "id": str(uuid.uuid4()),
                "order_number": sc_order_number,
                "supplier_id": op_data.outsource_supplier_id,
                "reference_wo_id": wo_id,
                "reference_operation_seq": sequence,
                "lines": sc_lines,
                "processing_charges": op_data.outsource_charges or 0,
                "status": "in_progress",
                "notes": f"Auto-created for outsourced operation: {target_op.get('operation_name')} on MO {wo.get('wo_number')}",
                "created_at": datetime.now(timezone.utc),
                "created_by": user["id"]
            }
            await db.subcontract_orders.insert_one(sc_order_doc)
            
            # Create DC
            if dc_lines:
                dc_count = await db.delivery_challans.count_documents({})
                dc_number = f"DC-{str(dc_count + 1).zfill(6)}"
                dc_doc = {
                    "id": str(uuid.uuid4()),
                    "dc_number": dc_number,
                    "subcontract_order_id": sc_order_doc["id"],
                    "reference_wo_id": wo_id,
                    "lines": dc_lines,
                    "status": "sent",
                    "notes": f"Auto-DC for outsourced operation: {target_op.get('operation_name')}",
                    "created_at": datetime.now(timezone.utc),
                    "created_by": user["id"]
                }
                await db.delivery_challans.insert_one(dc_doc)
            
            target_op["is_job_work"] = True
            target_op["job_work_supplier_id"] = op_data.outsource_supplier_id
            target_op["outsource_status"] = "sent"
            target_op["outsource_supplier_name"] = supplier_name
            target_op["outsource_charges"] = op_data.outsource_charges or 0
            target_op["outsource_sc_order_id"] = sc_order_doc["id"]
            target_op["operator"] = f"OS: {supplier_name}"
            target_op["actual_start"] = target_op.get("actual_start") or datetime.now(timezone.utc)
            target_op["status"] = "in_progress"
            
            runs = target_op.get("runs", [])
            runs.append({
                "run_number": len(runs) + 1,
                "operator": f"OS: {supplier_name}",
                "quantity_planned": mo_qty,
                "quantity_completed": 0,
                "started_at": datetime.now(timezone.utc),
                "ended_at": None,
                "quality_result": None,
                "reject_qty": 0,
                "rework_qty": 0,
                "notes": f"Outsourced to {supplier_name}"
            })
            target_op["runs"] = runs
        else:
            if not op_data.operator or not op_data.operator.strip():
                raise HTTPException(status_code=400, detail="Operator name is required to start an operation")
            
            # Initialize or append to runs list
            runs = target_op.get("runs", [])
            planned_qty = min(op_data.quantity_completed or mo_qty, mo_qty)
            run_entry = {
                "run_number": len(runs) + 1,
                "operator": op_data.operator.strip(),
                "quantity_planned": planned_qty,
                "quantity_completed": 0,
                "started_at": datetime.now(timezone.utc),
                "ended_at": None,
                "quality_result": None,
                "reject_qty": 0,
                "rework_qty": 0,
                "notes": op_data.notes or ""
            }
            runs.append(run_entry)
            target_op["runs"] = runs
            target_op["actual_start"] = target_op.get("actual_start") or datetime.now(timezone.utc)
            target_op["operator"] = op_data.operator.strip()
            target_op["status"] = "in_progress"
    
    # STOP operation (pause current run)
    elif op_data.status == "stopped":
        runs = target_op.get("runs", [])
        produced_qty = min(op_data.quantity_completed or 0, mo_qty)
        if runs and runs[-1].get("ended_at") is None:
            runs[-1]["ended_at"] = datetime.now(timezone.utc)
            runs[-1]["quantity_completed"] = produced_qty
            runs[-1]["quality_result"] = op_data.quality_result or "accept"
            runs[-1]["reject_qty"] = min(op_data.reject_qty or 0, produced_qty)
            runs[-1]["rework_qty"] = min(op_data.rework_qty or 0, produced_qty)
            runs[-1]["notes"] = op_data.notes or runs[-1].get("notes", "")
        
        # Calculate totals from all runs
        total_accepted = sum(r.get("quantity_completed", 0) - r.get("reject_qty", 0) - r.get("rework_qty", 0) for r in runs)
        total_completed = sum(r.get("quantity_completed", 0) for r in runs)
        target_op["quantity_completed"] = total_completed
        target_op["quantity_accepted"] = total_accepted
        target_op["quantity_rejected"] = sum(r.get("reject_qty", 0) for r in runs)
        target_op["quantity_rework"] = sum(r.get("rework_qty", 0) for r in runs)
        target_op["runs"] = runs
        target_op["status"] = "stopped"
    
    # COMPLETE operation
    elif op_data.status == "completed":
        # Block outsourced operation completion if SC order not received
        if target_op.get("is_job_work"):
            sc_order_id = target_op.get("outsource_sc_order_id")
            if sc_order_id:
                sc_order = await db.subcontract_orders.find_one({"id": sc_order_id})
                if sc_order and sc_order.get("status") != "completed":
                    raise HTTPException(status_code=400, detail=f"Cannot complete outsourced operation: Materials not received back from subcontractor. Receive items via Job Work page first.")
            elif target_op.get("outsource_status") == "sent":
                raise HTTPException(status_code=400, detail=f"Cannot complete outsourced operation: Materials not received back. Receive items via Job Work page first.")
        
        runs = target_op.get("runs", [])
        produced_qty = min(op_data.quantity_completed or mo_qty, mo_qty)
        # Close any open run
        if runs and runs[-1].get("ended_at") is None:
            runs[-1]["ended_at"] = datetime.now(timezone.utc)
            runs[-1]["quantity_completed"] = produced_qty
            runs[-1]["quality_result"] = op_data.quality_result or "accept"
            runs[-1]["reject_qty"] = min(op_data.reject_qty or 0, produced_qty)
            runs[-1]["rework_qty"] = min(op_data.rework_qty or 0, produced_qty)
        
        total_completed = sum(r.get("quantity_completed", 0) for r in runs)
        total_accepted = sum(r.get("quantity_completed", 0) - r.get("reject_qty", 0) - r.get("rework_qty", 0) for r in runs)
        
        target_op["actual_end"] = datetime.now(timezone.utc)
        target_op["quantity_completed"] = total_completed
        target_op["quantity_accepted"] = total_accepted
        target_op["quantity_rejected"] = sum(r.get("reject_qty", 0) for r in runs)
        target_op["quantity_rework"] = sum(r.get("rework_qty", 0) for r in runs)
        target_op["runs"] = runs
        target_op["status"] = "completed"
        
        # Calculate actual time
        if target_op.get("actual_start"):
            actual_start = target_op["actual_start"]
            if isinstance(actual_start, str):
                actual_start = datetime.fromisoformat(actual_start.replace('Z', '+00:00'))
            actual_end = target_op["actual_end"]
            if actual_start.tzinfo is None:
                actual_start = actual_start.replace(tzinfo=timezone.utc)
            if actual_end.tzinfo is None:
                actual_end = actual_end.replace(tzinfo=timezone.utc)
            delta = (actual_end - actual_start).total_seconds() / 60
            target_op["actual_time_min"] = round(delta, 1)
    
    if op_data.notes:
        target_op["notes"] = op_data.notes
    
    # Auto-determine WO status
    all_completed = all(op.get("status") == "completed" for op in operations)
    any_in_progress = any(op.get("status") in ["in_progress", "completed", "stopped"] for op in operations)
    
    wo_status = wo.get("status")
    if all_completed:
        # Check subcontract receipt before auto-completing
        can_complete = True
        if wo.get("is_subcontract"):
            sc_order = await db.subcontract_orders.find_one({"reference_wo_id": wo_id})
            if sc_order and sc_order.get("status") != "completed":
                can_complete = False
        # Check any outsourced operation has pending receipt
        for op in operations:
            if op.get("is_job_work") and op.get("outsource_status") == "sent":
                can_complete = False
        
        if can_complete:
            wo_status = "completed"
    elif any_in_progress:
        wo_status = "in_progress"
    
    update_fields = {
        "operations_status": operations,
        "status": wo_status,
        "updated_at": datetime.now(timezone.utc)
    }
    
    # If all operations completed, update stock
    if all_completed and wo_status == "completed":
        # Calculate final accepted qty from last operation
        last_op = operations[-1] if operations else {}
        final_accepted = last_op.get("quantity_accepted", mo_qty)
        
        item = await db.items.find_one({"id": wo.get("item_id")})
        if item:
            await db.items.update_one(
                {"id": item["id"]},
                {"$inc": {"current_stock": final_accepted}}
            )
        update_fields["actual_end"] = datetime.now(timezone.utc)
        update_fields["quantity_completed"] = final_accepted
    
    await db.work_orders.update_one({"id": wo_id}, {"$set": update_fields})
    
    return await db.work_orders.find_one({"id": wo_id}, {"_id": 0})

@work_orders_router.get("/{wo_id}/print-data")
async def get_work_order_print_data(wo_id: str, request: Request):
    """Get full work order data for printing (WO sheet + Job Card)"""
    await get_current_user(request)
    
    wo = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    # Get item details
    item = await db.items.find_one({"id": wo.get("item_id")}, {"_id": 0})
    wo["item"] = item
    
    # Get routing details
    routing = await db.routings.find_one({"id": wo.get("routing_id")}, {"_id": 0})
    wo["routing"] = routing
    
    # Get work center names for operations
    for op in wo.get("operations_status", []):
        wc = await db.work_centers.find_one({"id": op.get("work_center_id")}, {"_id": 0})
        op["work_center_name"] = wc.get("name", "") if wc else ""
    
    # Get consumed materials (stored on WO doc or from inventory transactions)
    consumed = wo.get("consumed_materials", [])
    if not consumed and wo.get("materials_consumed"):
        # Fallback: fetch from inventory transactions
        txns = await db.inventory_transactions.find(
            {"reference_id": wo_id, "transaction_type": "issue"}, {"_id": 0}
        ).to_list(100)
        for tx in txns:
            tx_item = await db.items.find_one({"id": tx.get("item_id")}, {"_id": 0})
            consumed.append({
                "item_id": tx.get("item_id"),
                "item": tx_item.get("part_number", "") if tx_item else "",
                "name": tx_item.get("name", "") if tx_item else "",
                "quantity": tx.get("quantity", 0),
                "uom": tx_item.get("unit_of_measure", "pcs") if tx_item else "pcs",
                "unit_cost": tx_item.get("unit_cost", 0) if tx_item else 0
            })
    wo["consumed_materials"] = consumed
    
    # Get child manufacturing orders
    child_mos = await db.work_orders.find({"parent_wo_id": wo_id}, {"_id": 0}).to_list(100)
    for child in child_mos:
        child_item = await db.items.find_one({"id": child.get("item_id")}, {"_id": 0})
        child["item"] = child_item
    wo["child_mos"] = child_mos
    
    # Get company settings for header
    company = await db.company_settings.find_one({"type": "company"}, {"_id": 0})
    wo["company"] = company
    
    return wo

# ================== EXPORT / IMPORT ROUTES ==================

@items_router.get("/export/excel")
async def export_items_excel(request: Request):
    """Export all items to Excel"""
    await get_current_user(request)
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    
    items = await db.items.find({}, {"_id": 0}).to_list(10000)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Items Master"
    
    headers = ["Part Number", "Name", "Description", "Category", "UOM", "Unit Cost", "Lead Time (Days)", "Safety Stock", "Current Stock", "Reorder Point", "HSN Code", "GST Rate (%)"]
    header_fill = PatternFill(start_color="1D3557", end_color="1D3557", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border
    
    for row, item in enumerate(items, 2):
        data = [
            item.get("part_number", ""), item.get("name", ""), item.get("description", ""),
            item.get("category", ""), item.get("unit_of_measure", ""), item.get("unit_cost", 0),
            item.get("lead_time_days", 0), item.get("safety_stock", 0), item.get("current_stock", 0),
            item.get("reorder_point", 0), item.get("hsn_code", ""), item.get("gst_rate", 18)
        ]
        for col, value in enumerate(data, 1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = thin_border
    
    for col in range(1, len(headers) + 1):
        ws.column_dimensions[chr(64 + col) if col <= 26 else 'A'].width = 18
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=items_master.xlsx"}
    )

@items_router.post("/import/excel")
async def import_items_excel(request: Request, file: UploadFile = File(...)):
    """Import items from Excel file"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    from openpyxl import load_workbook
    
    content = await file.read()
    wb = load_workbook(io.BytesIO(content))
    ws = wb.active
    
    headers = [cell.value for cell in ws[1]]
    results = {"created": 0, "updated": 0, "errors": []}
    
    # Map header names to field names
    field_map = {
        "Part Number": "part_number", "Name": "name", "Description": "description",
        "Category": "category", "UOM": "unit_of_measure", "Unit Cost": "unit_cost",
        "Lead Time (Days)": "lead_time_days", "Safety Stock": "safety_stock",
        "Current Stock": "current_stock", "Reorder Point": "reorder_point",
        "HSN Code": "hsn_code", "GST Rate (%)": "gst_rate"
    }
    
    col_indices = {}
    for idx, header in enumerate(headers):
        if header in field_map:
            col_indices[field_map[header]] = idx
    
    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        try:
            if not row or not row[0]:
                continue
            
            item_data = {}
            for field, col_idx in col_indices.items():
                if col_idx < len(row) and row[col_idx] is not None:
                    val = row[col_idx]
                    if field in ["unit_cost", "gst_rate"]:
                        val = float(val) if val else 0
                    elif field in ["lead_time_days", "safety_stock", "current_stock", "reorder_point"]:
                        val = int(val) if val else 0
                    else:
                        val = str(val).strip()
                    item_data[field] = val
            
            if not item_data.get("part_number"):
                results["errors"].append(f"Row {row_num}: Missing part number")
                continue
            
            # Validate category
            valid_cats = ["raw_material", "component", "sub_assembly", "finished_good"]
            if item_data.get("category") and item_data["category"] not in valid_cats:
                results["errors"].append(f"Row {row_num}: Invalid category '{item_data['category']}'")
                continue
            
            existing = await db.items.find_one({"part_number": item_data["part_number"]})
            if existing:
                await db.items.update_one({"part_number": item_data["part_number"]}, {"$set": item_data})
                results["updated"] += 1
            else:
                item_data["id"] = str(uuid.uuid4())
                item_data.setdefault("unit_of_measure", "pcs")
                item_data.setdefault("category", "raw_material")
                item_data.setdefault("gst_rate", 18)
                item_data["created_at"] = datetime.now(timezone.utc)
                await db.items.insert_one(item_data)
                results["created"] += 1
        except Exception as e:
            results["errors"].append(f"Row {row_num}: {str(e)}")
    
    return results

@bom_router.get("/export/excel")
async def export_boms_excel(request: Request):
    """Export all BOMs to Excel"""
    await get_current_user(request)
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    
    boms = await db.boms.find({}, {"_id": 0}).to_list(10000)
    items_map = {}
    async for item in db.items.find({}, {"_id": 0}):
        items_map[item["id"]] = item
    
    wb = Workbook()
    ws = wb.active
    ws.title = "BOM Data"
    
    headers = ["Parent Part Number", "Parent Name", "Revision", "Status", "Component Part Number", "Component Name", "Quantity", "Is Alternate", "Effectivity Start", "Effectivity End"]
    header_fill = PatternFill(start_color="1D3557", end_color="1D3557", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border
    
    row_num = 2
    for bom in boms:
        parent = items_map.get(bom.get("parent_item_id"), {})
        for comp in bom.get("components", []):
            comp_item = items_map.get(comp.get("item_id"), {})
            data = [
                parent.get("part_number", ""), parent.get("name", ""),
                bom.get("revision", ""), bom.get("status", ""),
                comp_item.get("part_number", ""), comp_item.get("name", ""),
                comp.get("quantity", 0), "Yes" if comp.get("is_alternate") else "No",
                str(bom.get("effectivity_start", "")) if bom.get("effectivity_start") else "",
                str(bom.get("effectivity_end", "")) if bom.get("effectivity_end") else ""
            ]
            for col, value in enumerate(data, 1):
                cell = ws.cell(row=row_num, column=col, value=value)
                cell.border = thin_border
            row_num += 1
    
    for col in range(1, len(headers) + 1):
        ws.column_dimensions[chr(64 + col) if col <= 26 else 'A'].width = 20
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=bom_data.xlsx"}
    )

@bom_router.post("/import/excel")
async def import_bom_excel(request: Request, file: UploadFile = File(...)):
    """Import BOMs from Excel - groups by parent part number"""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    from openpyxl import load_workbook
    
    content = await file.read()
    wb = load_workbook(io.BytesIO(content))
    ws = wb.active
    
    results = {"created": 0, "updated": 0, "errors": []}
    
    # Build items lookup
    items_by_pn = {}
    async for item in db.items.find({}, {"_id": 0}):
        items_by_pn[item.get("part_number", "")] = item
    
    # Group rows by parent part number
    bom_groups = {}
    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if not row or not row[0]:
            continue
        parent_pn = str(row[0]).strip()
        if parent_pn not in bom_groups:
            bom_groups[parent_pn] = {"revision": str(row[2]).strip() if row[2] else "A", "status": str(row[3]).strip() if row[3] else "active", "components": []}
        
        comp_pn = str(row[4]).strip() if row[4] else None
        if not comp_pn:
            results["errors"].append(f"Row {row_num}: Missing component part number")
            continue
        
        parent_item = items_by_pn.get(parent_pn)
        comp_item = items_by_pn.get(comp_pn)
        
        if not parent_item:
            results["errors"].append(f"Row {row_num}: Parent '{parent_pn}' not found in items")
            continue
        if not comp_item:
            results["errors"].append(f"Row {row_num}: Component '{comp_pn}' not found in items")
            continue
        
        bom_groups[parent_pn]["parent_item_id"] = parent_item["id"]
        bom_groups[parent_pn]["components"].append({
            "item_id": comp_item["id"],
            "quantity": float(row[6]) if row[6] else 1,
            "is_alternate": str(row[7]).strip().lower() in ["yes", "true", "1"] if row[7] else False
        })
    
    # Create or update BOMs
    for parent_pn, bom_data in bom_groups.items():
        if not bom_data.get("parent_item_id"):
            continue
        
        existing = await db.boms.find_one({"parent_item_id": bom_data["parent_item_id"], "revision": bom_data["revision"]})
        if existing:
            await db.boms.update_one(
                {"id": existing["id"]},
                {"$set": {"components": bom_data["components"], "status": bom_data["status"], "updated_at": datetime.now(timezone.utc)}}
            )
            results["updated"] += 1
        else:
            bom_doc = {
                "id": str(uuid.uuid4()),
                "parent_item_id": bom_data["parent_item_id"],
                "name": f"BOM - {parent_pn}",
                "revision": bom_data["revision"],
                "status": bom_data["status"],
                "components": bom_data["components"],
                "effectivity_start": None,
                "effectivity_end": None,
                "created_at": datetime.now(timezone.utc),
                "created_by": user["id"]
            }
            await db.boms.insert_one(bom_doc)
            results["created"] += 1
    
    return results

@routings_router.get("/export/excel")
async def export_routings_excel(request: Request):
    """Export all routings to Excel"""
    await get_current_user(request)
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    
    routings = await db.routings.find({}, {"_id": 0}).to_list(10000)
    items_map = {}
    async for item in db.items.find({}, {"_id": 0}):
        items_map[item["id"]] = item
    
    wc_map = {}
    async for wc in db.work_centers.find({}, {"_id": 0}):
        wc_map[wc["id"]] = wc
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Routings"
    
    headers = ["Item Part Number", "Item Name", "Routing Name", "Status", "Seq", "Operation", "Work Center", "Setup Time (min)", "Cycle Time (min)", "Description"]
    header_fill = PatternFill(start_color="1D3557", end_color="1D3557", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border
    
    row_num = 2
    for routing in routings:
        item = items_map.get(routing.get("item_id"), {})
        for op in routing.get("operations", []):
            wc = wc_map.get(op.get("work_center_id"), {})
            data = [
                item.get("part_number", ""), item.get("name", ""),
                routing.get("name", ""), routing.get("status", ""),
                op.get("sequence", ""), op.get("operation_name", ""),
                wc.get("name", ""), op.get("setup_time", 0), op.get("cycle_time", 0),
                op.get("description", "")
            ]
            for col, value in enumerate(data, 1):
                cell = ws.cell(row=row_num, column=col, value=value)
                cell.border = thin_border
            row_num += 1
    
    for col in range(1, len(headers) + 1):
        ws.column_dimensions[chr(64 + col) if col <= 26 else 'A'].width = 18
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=routings.xlsx"}
    )

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
            "address_line2": "",
            "city": "",
            "state": "",
            "pin_code": "",
            "pan": "",
            "cin": "",
            "phone": "",
            "email": "",
            "logo_data": "",
            "tagline": "",
            "primary_currency": "INR",
            "secondary_currency": "USD"
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

@settings_router.post("/migrate-addresses")
async def migrate_addresses(request: Request):
    """One-time migration: split existing single-line address fields into structured fields"""
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run migrations")

    migrated = {"suppliers": 0, "customers": 0, "company": 0}

    def split_address(addr_str):
        """Best-effort split of comma-separated address into structured fields"""
        if not addr_str:
            return {}
        parts = [p.strip() for p in addr_str.replace("\n", ",").split(",") if p.strip()]
        result = {}
        # Try to detect pin code (6-digit number at end)
        pin = ""
        for i, p in enumerate(parts):
            import re as _re
            pin_match = _re.search(r'\b(\d{6})\b', p)
            if pin_match:
                pin = pin_match.group(1)
                parts[i] = _re.sub(r'\s*-?\s*\d{6}\b', '', p).strip()
                break
        parts = [p for p in parts if p]
        if pin:
            result["pin_code"] = pin
        if len(parts) >= 4:
            result["address"] = parts[0]
            result["address_line2"] = parts[1]
            result["city"] = parts[2]
            result["state"] = parts[3]
        elif len(parts) == 3:
            result["address"] = parts[0]
            result["city"] = parts[1]
            result["state"] = parts[2]
        elif len(parts) == 2:
            result["address"] = parts[0]
            result["city"] = parts[1]
        elif len(parts) == 1:
            result["address"] = parts[0]
        return result

    # Migrate suppliers
    async for sup in db.suppliers.find({"city": {"$exists": False}, "address": {"$exists": True, "$ne": ""}}):
        fields = split_address(sup.get("address", ""))
        if fields:
            await db.suppliers.update_one({"_id": sup["_id"]}, {"$set": fields})
            migrated["suppliers"] += 1

    # Migrate customers
    async for cust in db.customers.find({"city": {"$exists": False}, "address": {"$exists": True, "$ne": ""}}):
        fields = split_address(cust.get("address", ""))
        if fields:
            await db.customers.update_one({"_id": cust["_id"]}, {"$set": fields})
            migrated["customers"] += 1

    # Migrate company settings
    company = await db.company_settings.find_one({"type": "company"})
    if company and not company.get("city"):
        fields = split_address(company.get("address", ""))
        if fields:
            await db.company_settings.update_one({"_id": company["_id"]}, {"$set": fields})
            migrated["company"] = 1

    return {"message": "Address migration complete", "migrated": migrated}

# ================== PO CHARGE TYPES SETTINGS ==================

@settings_router.get("/po-charges")
async def get_po_charge_types(request: Request):
    await get_current_user(request)
    charges = await db.po_charge_types.find({"is_active": True}, {"_id": 0}).to_list(100)
    return charges

@settings_router.post("/po-charges", status_code=201)
async def create_po_charge_type(data: POChargeTypeCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage charge types")
    doc = {
        "id": str(uuid.uuid4()),
        **data.model_dump(),
        "is_active": True,
        "created_at": datetime.now(timezone.utc)
    }
    await db.po_charge_types.insert_one(doc)
    doc.pop("_id", None)
    return doc

@settings_router.put("/po-charges/{charge_id}")
async def update_po_charge_type(charge_id: str, data: POChargeTypeUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage charge types")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.po_charge_types.update_one({"id": charge_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Charge type not found")
    return await db.po_charge_types.find_one({"id": charge_id}, {"_id": 0})

@settings_router.delete("/po-charges/{charge_id}")
async def delete_po_charge_type(charge_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage charge types")
    await db.po_charge_types.update_one({"id": charge_id}, {"$set": {"is_active": False}})
    return {"message": "Charge type deleted"}

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
            "permissions": get_default_permissions("admin"),
            "status": "active",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info(f"Admin password updated")
    
    # Ensure admin has permissions
    admin_user = await db.users.find_one({"email": admin_email})
    if admin_user and not admin_user.get("permissions"):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"permissions": get_default_permissions("admin"), "status": "active"}}
        )
        logger.info("Admin permissions updated")

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
        {"id": str(uuid.uuid4()), "code": "SUP-001", "name": "Steel Masters Pvt. Ltd.", "contact_person": "Rajesh Kumar", "email": "rajesh@steelmasters.in", "phone": "+91-9876543210", "address": "123 Industrial Area", "address_line2": "Hadapsar", "city": "Pune", "state": "Maharashtra", "pin_code": "411013", "gstin": "27AABCS1234F1Z5", "state_code": "27", "payment_terms": "Net 30", "lead_time_days": 7, "rating": 5, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "SUP-002", "name": "Precision Components Ltd.", "contact_person": "Suresh Patel", "email": "suresh@precisioncomp.in", "phone": "+91-9876543211", "address": "456 GIDC Estate", "address_line2": "Phase II", "city": "Ahmedabad", "state": "Gujarat", "pin_code": "382445", "gstin": "24AABCP5678G1Z3", "state_code": "24", "payment_terms": "Net 45", "lead_time_days": 14, "rating": 4, "status": "active", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "code": "SUP-003", "name": "ElectroPower Systems", "contact_person": "Amit Sharma", "email": "amit@electropower.in", "phone": "+91-9876543212", "address": "789 Electronic City", "address_line2": "Phase I", "city": "Bangalore", "state": "Karnataka", "pin_code": "560100", "gstin": "29AABCE9012H1Z1", "state_code": "29", "payment_terms": "Net 30", "lead_time_days": 21, "rating": 4, "status": "active", "created_at": datetime.now(timezone.utc)},
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
            "address": "Plot No. 45, MIDC",
            "address_line2": "Bhosari Industrial Estate",
            "city": "Pune",
            "state": "Maharashtra",
            "pin_code": "411019",
            "pan": "AABCM1234A",
            "cin": "",
            "phone": "+91-20-12345678",
            "email": "info@machineworks.in",
            "logo_data": "",
            "tagline": "Precision Engineering Solutions",
            "primary_currency": "INR",
            "secondary_currency": "USD",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info("Company settings seeded")
    
    # Seed sample customers
    if await db.customers.count_documents({}) == 0:
        customers = [
            {"id": str(uuid.uuid4()), "code": "CUST-001", "name": "Tata Motors Ltd.", "gstin": "27AAACT1234D1Z5", "state_code": "27", "contact_person": "Vikram Singh", "email": "vikram@tatamotors.in", "phone": "+91-9988776655", "address": "Pimpri Plant", "address_line2": "Mumbai-Pune Road", "city": "Pune", "state": "Maharashtra", "pin_code": "411018", "payment_terms": "Net 30", "status": "active", "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "code": "CUST-002", "name": "Bharat Heavy Electricals", "gstin": "09AABCB5678E1Z3", "state_code": "09", "contact_person": "Priya Verma", "email": "priya@bhel.in", "phone": "+91-9988776656", "address": "Sector 17", "address_line2": "Industrial Area", "city": "Noida", "state": "Uttar Pradesh", "pin_code": "201301", "payment_terms": "Net 45", "status": "active", "created_at": datetime.now(timezone.utc)},
            {"id": str(uuid.uuid4()), "code": "CUST-003", "name": "Larsen & Toubro", "gstin": "27AABCL9012F1Z1", "state_code": "27", "contact_person": "Anish Mehta", "email": "anish@lnt.in", "phone": "+91-9988776657", "address": "L&T Business Park", "address_line2": "Saki Vihar Road, Powai", "city": "Mumbai", "state": "Maharashtra", "pin_code": "400072", "payment_terms": "Net 30", "status": "active", "created_at": datetime.now(timezone.utc)},
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
    
    # Write credentials file (dev environment only, non-fatal on Windows/other OS)
    try:
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
    except (OSError, PermissionError):
        pass

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# ================== PURCHASE INVOICE ROUTES ==================

@purchase_invoices_router.get("")
async def get_purchase_invoices(request: Request, status: str = None):
    user = await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    invoices = await db.purchase_invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for inv in invoices:
        supplier = await db.suppliers.find_one({"id": inv.get("supplier_id")}, {"_id": 0})
        inv["supplier"] = supplier
        if inv.get("po_id"):
            po = await db.purchase_orders.find_one({"id": inv["po_id"]}, {"_id": 0})
            inv["po"] = po
        if inv.get("grn_id"):
            grn = await db.grn.find_one({"id": inv["grn_id"]}, {"_id": 0})
            inv["grn"] = grn
        for line in inv.get("lines", []):
            item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
            line["item"] = item
    return invoices

@purchase_invoices_router.get("/pending-grns")
async def get_grns_pending_invoice(request: Request):
    """Get GRNs that don't have a purchase invoice yet"""
    user = await get_current_user(request)
    # Get all GRN IDs that already have invoices
    invoiced_grn_ids = set()
    async for inv in db.purchase_invoices.find({"grn_id": {"$exists": True, "$ne": ""}}, {"grn_id": 1}):
        invoiced_grn_ids.add(inv.get("grn_id"))
    
    # Get all completed GRNs
    grns = await db.grn.find({"status": "completed"}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    pending = []
    for grn in grns:
        if grn.get("id") in invoiced_grn_ids:
            continue
        supplier = await db.suppliers.find_one({"id": grn.get("supplier_id")}, {"_id": 0})
        grn["supplier"] = supplier
        po = await db.purchase_orders.find_one({"id": grn.get("po_id")}, {"_id": 0})
        grn["po"] = po
        for line in grn.get("lines", []):
            item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
            line["item"] = item
        pending.append(grn)
    
    return pending

@purchase_invoices_router.post("", status_code=201)
async def create_purchase_invoice(data: PurchaseInvoiceCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    count = await db.purchase_invoices.count_documents({})
    inv_number = f"PI-{str(count + 1).zfill(6)}"
    
    supplier = await db.suppliers.find_one({"id": data.supplier_id})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    company = await db.company_settings.find_one({"type": "company"}, {"_id": 0})
    is_inter_state = supplier.get("state_code", "") != (company or {}).get("state_code", "")
    
    lines = []
    subtotal = 0
    total_cgst = 0
    total_sgst = 0
    total_igst = 0
    
    for line in data.lines:
        item = await db.items.find_one({"id": line.item_id}, {"_id": 0})
        if not item:
            continue
        line_total = line.quantity * line.unit_price
        discount_amount = line.discount or 0
        line_after_discount = line_total - discount_amount
        gst_rate = line.gst_rate if line.gst_rate is not None else item.get("gst_rate", 18)
        gst_amount = line_after_discount * gst_rate / 100
        
        if is_inter_state:
            total_igst += gst_amount
        else:
            total_cgst += gst_amount / 2
            total_sgst += gst_amount / 2
        
        subtotal += line_after_discount
        lines.append({
            "item_id": line.item_id,
            "quantity": line.quantity,
            "unit_price": line.unit_price,
            "discount": discount_amount,
            "hsn_code": line.hsn_code or item.get("hsn_code", ""),
            "gst_rate": gst_rate,
            "line_total": line_after_discount,
            "gst_amount": gst_amount
        })
    
    total_tax = total_cgst + total_sgst + total_igst
    total_amount = subtotal + total_tax
    
    invoice_doc = {
        "id": str(uuid.uuid4()),
        "invoice_number": inv_number,
        "supplier_id": data.supplier_id,
        "po_id": data.po_id or "",
        "grn_id": data.grn_id or "",
        "invoice_no": data.invoice_no,
        "invoice_date": data.invoice_date,
        "due_date": data.due_date,
        "lines": lines,
        "subtotal": round(subtotal, 2),
        "total_cgst": round(total_cgst, 2),
        "total_sgst": round(total_sgst, 2),
        "total_igst": round(total_igst, 2),
        "total_tax": round(total_tax, 2),
        "total_amount": round(total_amount, 2),
        "is_inter_state": is_inter_state,
        "status": "draft",
        "notes": data.notes or "",
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    
    await db.purchase_invoices.insert_one(invoice_doc)
    del invoice_doc["_id"]
    return invoice_doc

@purchase_invoices_router.put("/{invoice_id}")
async def update_purchase_invoice(invoice_id: str, data: PurchaseInvoiceUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    invoice = await db.purchase_invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.purchase_invoices.update_one({"id": invoice_id}, {"$set": update_data})
    
    return await db.purchase_invoices.find_one({"id": invoice_id}, {"_id": 0})

@purchase_invoices_router.post("/{invoice_id}/approve")
async def approve_purchase_invoice(invoice_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can approve invoices")
    invoice = await db.purchase_invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft invoices can be approved")
    await db.purchase_invoices.update_one({"id": invoice_id}, {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc), "approved_by": user["id"]}})
    return await db.purchase_invoices.find_one({"id": invoice_id}, {"_id": 0})

@purchase_invoices_router.post("/{invoice_id}/mark-paid")
async def mark_invoice_paid(invoice_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Only admin can mark invoices as paid")
    invoice = await db.purchase_invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Only approved invoices can be marked as paid")
    await db.purchase_invoices.update_one({"id": invoice_id}, {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc), "paid_by": user["id"]}})
    return await db.purchase_invoices.find_one({"id": invoice_id}, {"_id": 0})

# ================== JOB WORK / SUBCONTRACTING ROUTES ==================

@jobwork_router.get("/orders")
async def get_subcontract_orders(request: Request, status: str = None):
    user = await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    orders = await db.subcontract_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for order in orders:
        supplier = await db.suppliers.find_one({"id": order.get("supplier_id")}, {"_id": 0})
        order["supplier"] = supplier
        # Include linked MO number
        if order.get("reference_wo_id"):
            ref_wo = await db.work_orders.find_one({"id": order["reference_wo_id"]}, {"_id": 0, "wo_number": 1})
            order["mo_number"] = ref_wo.get("wo_number") if ref_wo else None
        for line in order.get("lines", []):
            item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
            line["item"] = item
    return orders

@jobwork_router.post("/orders", status_code=201)
async def create_subcontract_order(data: SubcontractOrderCreate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    supplier = await db.suppliers.find_one({"id": data.supplier_id})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    count = await db.subcontract_orders.count_documents({})
    order_number = f"JW-{str(count + 1).zfill(6)}"
    
    lines = []
    for line in data.lines:
        item = await db.items.find_one({"id": line.item_id}, {"_id": 0})
        if not item:
            continue
        lines.append({
            "item_id": line.item_id,
            "quantity": line.quantity,
            "sent_quantity": 0,
            "received_quantity": 0,
            "rate": line.rate or 0
        })
    
    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "supplier_id": data.supplier_id,
        "lines": lines,
        "expected_return_date": data.expected_return_date,
        "processing_charges": data.processing_charges or 0,
        "status": "draft",
        "notes": data.notes or "",
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    
    await db.subcontract_orders.insert_one(order_doc)
    del order_doc["_id"]
    return order_doc

@jobwork_router.put("/orders/{order_id}")
async def update_subcontract_order(order_id: str, data: SubcontractOrderUpdate, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    order = await db.subcontract_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    update_data = {}
    if data.expected_return_date is not None:
        update_data["expected_return_date"] = data.expected_return_date
    if data.processing_charges is not None:
        update_data["processing_charges"] = data.processing_charges
    if data.notes is not None:
        update_data["notes"] = data.notes
    if data.status is not None:
        update_data["status"] = data.status
    if data.lines is not None:
        update_data["lines"] = [{"item_id": l.item_id, "quantity": l.quantity, "sent_quantity": 0, "received_quantity": 0, "rate": l.rate or 0} for l in data.lines]
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.subcontract_orders.update_one({"id": order_id}, {"$set": update_data})
    
    return await db.subcontract_orders.find_one({"id": order_id}, {"_id": 0})

@jobwork_router.post("/orders/{order_id}/confirm")
async def confirm_subcontract_order(order_id: str, request: Request):
    user = await get_current_user(request)
    order = await db.subcontract_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft orders can be confirmed")
    await db.subcontract_orders.update_one({"id": order_id}, {"$set": {"status": "confirmed", "confirmed_at": datetime.now(timezone.utc)}})
    return await db.subcontract_orders.find_one({"id": order_id}, {"_id": 0})


@jobwork_router.post("/create-po")
async def create_po_from_sc(request: Request, data: dict = Body(...)):
    """Create a Purchase Order from a 'without material' SC order"""
    user = await get_current_user(request)
    
    sc_order_id = data.get("subcontract_order_id")
    sc_order = await db.subcontract_orders.find_one({"id": sc_order_id})
    if not sc_order:
        raise HTTPException(status_code=404, detail="Subcontract order not found")
    
    # Check if PO already exists for this SC order
    existing_po = await db.purchase_orders.find_one({"reference_sc_order_id": sc_order_id})
    if existing_po:
        raise HTTPException(status_code=400, detail=f"Purchase Order {existing_po.get('po_number')} already exists for this SC order")
    
    supplier = await db.suppliers.find_one({"id": sc_order.get("supplier_id")}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # Build PO items from SC order lines
    po_items = []
    total_amount = 0
    for line in sc_order.get("lines", []):
        item = await db.items.find_one({"id": line["item_id"]}, {"_id": 0})
        if item:
            unit_cost = item.get("unit_cost", line.get("rate", 0))
            line_total = line["quantity"] * unit_cost
            total_amount += line_total
            po_items.append({
                "item_id": line["item_id"],
                "quantity": line["quantity"],
                "unit_price": unit_cost,
                "total_price": line_total,
                "received_quantity": 0
            })
    
    # Create PO
    po_count = await db.purchase_orders.count_documents({})
    po_number = f"PO-{str(po_count + 1).zfill(6)}"
    po_doc = {
        "id": str(uuid.uuid4()),
        "po_number": po_number,
        "supplier_id": sc_order.get("supplier_id"),
        "reference_sc_order_id": sc_order_id,
        "items": po_items,
        "total_amount": total_amount,
        "status": "approved",
        "notes": f"Auto-created from SC Order {sc_order.get('order_number')} (without material)",
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    await db.purchase_orders.insert_one(po_doc)
    po_doc.pop("_id", None)
    
    return {"po_number": po_number, "po_id": po_doc["id"], "total_amount": total_amount}


@jobwork_router.get("/challans")
async def get_delivery_challans(request: Request):
    user = await get_current_user(request)
    challans = await db.delivery_challans.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for dc in challans:
        order = await db.subcontract_orders.find_one({"id": dc.get("subcontract_order_id")}, {"_id": 0})
        dc["order"] = order
        dc["fg_item_name"] = order.get("fg_item_name", "") if order else ""
        supplier = await db.suppliers.find_one({"id": order.get("supplier_id") if order else ""}, {"_id": 0})
        dc["supplier"] = supplier
        for line in dc.get("lines", []):
            item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
            line["item"] = item
    return challans

@jobwork_router.post("/challans", status_code=201)
async def create_delivery_challan(data: DCCreate, request: Request):
    """Create DC - Send materials to subcontractor. Deducts stock."""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    order = await db.subcontract_orders.find_one({"id": data.subcontract_order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Subcontract order not found")
    if order.get("status") not in ["confirmed", "in_progress"]:
        raise HTTPException(status_code=400, detail="Order must be confirmed before sending materials")
    
    count = await db.delivery_challans.count_documents({})
    dc_number = f"DC-{str(count + 1).zfill(6)}"
    
    dc_lines = []
    for line in data.lines:
        item = await db.items.find_one({"id": line.item_id})
        if not item:
            continue
        current_stock = item.get("current_stock", 0)
        if current_stock < line.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {item.get('part_number')}: need {line.quantity}, have {current_stock}")
        
        # Deduct stock
        new_stock = current_stock - line.quantity
        await db.items.update_one({"id": line.item_id}, {"$set": {"current_stock": new_stock}})
        
        # Create inventory transaction
        tx = {
            "id": str(uuid.uuid4()),
            "item_id": line.item_id,
            "transaction_type": "issue",
            "quantity": line.quantity,
            "reference_type": "job_work_dc",
            "reference_id": dc_number,
            "previous_stock": current_stock,
            "new_stock": new_stock,
            "notes": f"Sent to subcontractor - {order.get('order_number')}",
            "created_at": datetime.now(timezone.utc),
            "created_by": user["id"]
        }
        await db.inventory_transactions.insert_one(tx)
        
        dc_lines.append({
            "item_id": line.item_id,
            "quantity": line.quantity,
            "rate": line.rate or 0
        })
        
        # Update sent quantity in order
        for ol in order.get("lines", []):
            if ol["item_id"] == line.item_id:
                ol["sent_quantity"] = ol.get("sent_quantity", 0) + line.quantity
    
    await db.subcontract_orders.update_one({"id": data.subcontract_order_id}, {"$set": {"lines": order["lines"], "status": "in_progress"}})
    
    dc_doc = {
        "id": str(uuid.uuid4()),
        "dc_number": dc_number,
        "subcontract_order_id": data.subcontract_order_id,
        "lines": dc_lines,
        "warehouse_id": data.warehouse_id or "",
        "status": "sent",
        "notes": data.notes or "",
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    
    await db.delivery_challans.insert_one(dc_doc)
    del dc_doc["_id"]
    return dc_doc

@jobwork_router.get("/receipts")
async def get_subcontract_receipts(request: Request):
    user = await get_current_user(request)
    receipts = await db.subcontract_receipts.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for rec in receipts:
        order = await db.subcontract_orders.find_one({"id": rec.get("subcontract_order_id")}, {"_id": 0})
        rec["order"] = order
        supplier = await db.suppliers.find_one({"id": order.get("supplier_id") if order else ""}, {"_id": 0})
        rec["supplier"] = supplier
        for line in rec.get("lines", []):
            item = await db.items.find_one({"id": line.get("item_id")}, {"_id": 0})
            line["item"] = item
    return receipts

@jobwork_router.post("/receipts", status_code=201)
async def create_subcontract_receipt(data: SubcontractReceiptCreate, request: Request):
    """Receive materials back from subcontractor. Adds stock."""
    user = await get_current_user(request)
    if user["role"] not in ["admin", "production_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    order = await db.subcontract_orders.find_one({"id": data.subcontract_order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Subcontract order not found")
    
    count = await db.subcontract_receipts.count_documents({})
    receipt_number = f"SR-{str(count + 1).zfill(6)}"
    
    rec_lines = []
    total_rework_qty = 0
    total_reject_qty = 0
    for line in data.lines:
        item = await db.items.find_one({"id": line.item_id})
        if not item:
            continue
        
        rework_qty = getattr(line, 'rework_qty', 0) or 0
        reject_qty = line.reject_qty or 0
        accepted_qty = max(0, line.received_quantity - reject_qty - rework_qty)
        total_rework_qty += rework_qty
        total_reject_qty += reject_qty
        
        # Add only accepted stock
        if accepted_qty > 0:
            current_stock = item.get("current_stock", 0)
            new_stock = current_stock + accepted_qty
            await db.items.update_one({"id": line.item_id}, {"$set": {"current_stock": new_stock}})
            
            tx = {
                "id": str(uuid.uuid4()),
                "item_id": line.item_id,
                "transaction_type": "receive",
                "quantity": accepted_qty,
                "reference_type": "job_work_receipt",
                "reference_id": receipt_number,
                "previous_stock": current_stock,
                "new_stock": new_stock,
                "notes": f"Received from subcontractor - {order.get('order_number')}" + (f" (Rework: {rework_qty}, Reject: {reject_qty})" if rework_qty or reject_qty else ""),
                "created_at": datetime.now(timezone.utc),
                "created_by": user["id"]
            }
            await db.inventory_transactions.insert_one(tx)
        
        rec_lines.append({
            "item_id": line.item_id,
            "received_quantity": line.received_quantity,
            "accepted_quantity": accepted_qty,
            "rework_qty": rework_qty,
            "quality_result": line.quality_result or "accept",
            "reject_qty": reject_qty
        })
        
        # Update received quantity in order (only accepted qty counts toward completion)
        for ol in order.get("lines", []):
            if ol["item_id"] == line.item_id:
                ol["received_quantity"] = ol.get("received_quantity", 0) + accepted_qty
    
    # Check if all materials received — use 'quantity' for without_material, 'sent_quantity' for with_material
    sc_type = order.get("subcontract_type", "with_material")
    if sc_type == "without_material":
        all_received = all(ol.get("received_quantity", 0) >= ol.get("quantity", 0) for ol in order.get("lines", []))
    else:
        all_received = all(ol.get("received_quantity", 0) >= ol.get("sent_quantity", 0) for ol in order.get("lines", []))
    
    # If there are rework items, don't mark as completed — wait for rework
    has_rework = total_rework_qty > 0
    new_status = "completed" if all_received and not has_rework else "in_progress"
    
    await db.subcontract_orders.update_one({"id": data.subcontract_order_id}, {"$set": {"lines": order["lines"], "status": new_status}})
    
    # If SC order completed and linked to a WO operation, update that operation
    if new_status == "completed" and order.get("reference_wo_id"):
        ref_wo_id = order["reference_wo_id"]
        ref_seq = order.get("reference_operation_seq")
        ref_wo = await db.work_orders.find_one({"id": ref_wo_id})
        if ref_wo:
            ops = ref_wo.get("operations_status", [])
            updated_ops = False
            
            if ref_seq:
                # Operation-level outsource: update the specific operation
                for op in ops:
                    if op.get("sequence") == ref_seq:
                        op["outsource_status"] = "received"
                        op["status"] = "completed"
                        op["actual_end"] = datetime.now(timezone.utc)
                        total_recv = sum(ol.get("received_quantity", 0) for ol in order.get("lines", []))
                        op["quantity_completed"] = ref_wo.get("quantity", total_recv)
                        op["quantity_accepted"] = ref_wo.get("quantity", total_recv)
                        updated_ops = True
                        break
            else:
                # Check for operation-level match by SC order ID
                for op in ops:
                    if op.get("is_job_work") and op.get("outsource_sc_order_id") == data.subcontract_order_id:
                        op["outsource_status"] = "received"
                        op["status"] = "completed"
                        op["actual_end"] = datetime.now(timezone.utc)
                        op["quantity_completed"] = ref_wo.get("quantity", 0)
                        op["quantity_accepted"] = ref_wo.get("quantity", 0)
                        updated_ops = True
                        break
            
            # For MO-level subcontract: mark ALL operations completed and auto-complete the MO
            if ref_wo.get("is_subcontract"):
                for op in ops:
                    if op.get("status") != "completed":
                        op["status"] = "completed"
                        op["actual_end"] = datetime.now(timezone.utc)
                        op["quantity_completed"] = ref_wo.get("quantity", 0)
                        op["quantity_accepted"] = ref_wo.get("quantity", 0)
                updated_ops = True
                
                # Auto-complete the MO and add finished goods to stock
                mo_qty = ref_wo.get("quantity", 0)
                routing = await db.routings.find_one({"id": ref_wo.get("routing_id")})
                fg_item_id = routing.get("item_id") if routing else ref_wo.get("item_id")
                fg_item = await db.items.find_one({"id": fg_item_id})
                if fg_item:
                    current_stock = fg_item.get("current_stock", 0)
                    new_fg_stock = current_stock + mo_qty
                    await db.items.update_one({"id": fg_item_id}, {"$set": {"current_stock": new_fg_stock}})
                    
                    # Inventory transaction for produced items
                    fg_tx = {
                        "id": str(uuid.uuid4()),
                        "item_id": fg_item_id,
                        "transaction_type": "receive",
                        "quantity": mo_qty,
                        "reference_type": "work_order",
                        "reference_id": ref_wo_id,
                        "previous_stock": current_stock,
                        "new_stock": new_fg_stock,
                        "notes": f"Produced via sub-contract MO {ref_wo.get('wo_number')} (auto-completed on receipt)",
                        "created_at": datetime.now(timezone.utc),
                        "created_by": user["id"]
                    }
                    await db.inventory_transactions.insert_one(fg_tx)
                
                await db.work_orders.update_one(
                    {"id": ref_wo_id},
                    {"$set": {
                        "operations_status": ops,
                        "status": "completed",
                        "quantity_completed": mo_qty,
                        "actual_end": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc)
                    }}
                )
            elif updated_ops:
                await db.work_orders.update_one({"id": ref_wo_id}, {"$set": {"operations_status": ops, "updated_at": datetime.now(timezone.utc)}})
    
    rec_doc = {
        "id": str(uuid.uuid4()),
        "receipt_number": receipt_number,
        "subcontract_order_id": data.subcontract_order_id,
        "dc_id": data.dc_id or "",
        "lines": rec_lines,
        "warehouse_id": data.warehouse_id or "",
        "status": "received",
        "notes": data.notes or "",
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"]
    }
    
    await db.subcontract_receipts.insert_one(rec_doc)
    del rec_doc["_id"]
    return rec_doc


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
api_router.include_router(grn_router)
api_router.include_router(purchase_invoices_router)
api_router.include_router(jobwork_router)

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "machinery-erp"}

app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(',') if os.environ.get('CORS_ORIGINS') != '*' else ['*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
