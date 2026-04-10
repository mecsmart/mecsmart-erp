# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform.

## User Choices
- **BOM Features**: Advanced BOM with revision control, effectivity dates, and alternate components
- **MRP Features**: Advanced MRP with lead times, safety stock, and purchase order suggestions
- **Quality Features**: Basic inspection checklists and pass/fail tracking
- **Authentication**: JWT-based custom auth with roles (Admin, Production Manager, Quality Inspector, Inventory Manager)
- **Procurement**: Basic - Purchase Orders, Supplier Management, PO from MRP suggestions
- **Stores**: Basic - Warehouse/Location management, Stock by location, Inter-location transfers
- **Manufacturing**: Basic - Work Centers, Routing (operations sequence), Work Order tracking with status

## Architecture

### Backend
- **Framework**: FastAPI (Python)
- **Database**: MongoDB
- **Authentication**: JWT with httpOnly cookies
- **API Prefix**: All endpoints under `/api`

### Frontend
- **Framework**: React 19
- **UI Library**: Shadcn/UI with Tailwind CSS
- **Design System**: Swiss/High-Contrast (Industrial theme)
- **Fonts**: Chivo (headings), IBM Plex Sans (body), IBM Plex Mono (data)

## User Personas

### Admin
- Full system access
- User management
- All CRUD operations

### Production Manager
- Manage items, BOMs, production orders, work orders
- Manage suppliers, purchase orders
- View MRP and inventory

### Quality Inspector
- Create/manage inspection templates
- Record inspections
- View items and BOMs

### Inventory Manager
- Manage inventory transactions
- Manage warehouses and stock transfers
- Update stock levels, receive POs
- View items and BOMs

## Core Requirements (Static)

### Multi-Level BOM
- Parent-child item relationships
- Revision control (A, B, C...)
- Effectivity dates
- Alternate components support
- BOM explosion view (tree structure)

### MRP (Material Requirements Planning)
- Gross requirement calculation from production orders
- Net requirement = Gross - On Hand + Safety Stock
- Lead time tracking
- Purchase suggestions based on reorder points
- Purchase suggestions based on MRP demand

### Quality Process
- Inspection templates with checklist items
- Inspection records with pass/fail tracking
- Overall result: Pass, Fail, Conditional
- Inspector tracking

### Inventory Management
- Stock level tracking
- Transaction types: Receive, Issue, Adjust
- Safety stock alerts
- Reorder point alerts

### Procurement (NEW)
- Supplier management with ratings
- Purchase Orders (Draft → Sent → Received)
- PO line items with pricing
- Receive PO and auto-update inventory

### Stores/Warehouse (NEW)
- Multiple warehouse locations
- Stock by location tracking
- Inter-location stock transfers
- Transfer history

### Manufacturing Process (NEW)
- Work Centers with hourly rates and capacity
- Routings (operations sequence per item)
- Work Orders linked to Production Orders
- Work Order status tracking (Pending → In Progress → Completed)

## What's Been Implemented (January 2026)

### Backend (server.py)
- [x] JWT authentication with httpOnly cookies
- [x] Role-based access control (4 roles)
- [x] Admin seeding on startup
- [x] Items/Parts CRUD API
- [x] Multi-level BOM management API
- [x] BOM explosion endpoint
- [x] BOM revision creation
- [x] Production orders API
- [x] MRP demand calculation
- [x] MRP purchase suggestions
- [x] Quality inspection templates API
- [x] Quality inspection records API
- [x] Inventory transactions API
- [x] Dashboard statistics API
- [x] Suppliers CRUD API
- [x] Purchase Orders API with receive functionality
- [x] Warehouses CRUD API
- [x] Stock by warehouse API
- [x] Stock transfers API
- [x] Work Centers CRUD API
- [x] Routings with operations API
- [x] Work Orders API with status management
- [x] Sample data seeding (all modules)

### Frontend
- [x] Login page with industrial design
- [x] Dashboard with KPI cards
- [x] Sidebar navigation (responsive, 11 menu items)
- [x] Items & Parts management
- [x] BOM management with tree view
- [x] BOM explosion dialog
- [x] MRP demand & suggestions tabs
- [x] Production orders management
- [x] Quality inspections & templates
- [x] Inventory stock & transactions
- [x] Suppliers page with card layout
- [x] Purchase Orders page with line items
- [x] Warehouses page with stock view
- [x] Stock transfer dialog
- [x] Manufacturing page (Work Centers, Routings, Work Orders)
- [x] All forms use Shadcn dialogs

### Sample Data Seeded
- 10 items (raw materials, components, sub-assemblies, finished goods)
- 2 BOMs with multi-level structure
- 2 inspection templates
- 3 suppliers (Steel Masters, Precision Components, ElectroPower)
- 3 warehouses (Main, Raw Materials Store, Finished Goods Store)
- Stock distributed by item category
- 5 work centers (Cutting, Welding, Machining, Assembly, Testing)
- 2 routings (Pump Assembly - 4 ops, Hydraulic Press - 5 ops)

## Prioritized Backlog

### P0 (Critical) - All Complete
- ✅ Authentication
- ✅ Multi-level BOM
- ✅ MRP calculations
- ✅ Quality inspections
- ✅ Inventory management
- ✅ Procurement (Suppliers, POs)
- ✅ Stores (Warehouses, Transfers)
- ✅ Manufacturing (Work Centers, Routings, Work Orders)

### P1 (High Priority)
- [ ] User management page (admin only)
- [ ] PO creation from MRP suggestions (auto-populate)
- [ ] Print/export BOM explosion
- [ ] Work Order operation tracking (mark each operation complete)

### P2 (Medium Priority)
- [ ] Supplier item catalog (which supplier sells which items)
- [ ] Production scheduling (Gantt view)
- [ ] Quality SPC charts
- [ ] Non-conformance reports

### P3 (Low Priority)
- [ ] Barcode scanning integration
- [ ] Email notifications
- [ ] Report templates (PDF export)
- [ ] Data import/export (CSV/Excel)
- [ ] Audit trail logging

## Next Tasks

1. Add user management page for admin to create/edit users
2. Implement auto-populate PO from MRP suggestions
3. Add work order operation-level tracking
4. Add BOM/routing export to PDF
5. Implement quality non-conformance reports
