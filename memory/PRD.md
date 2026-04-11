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
- Full system access, User management, All CRUD operations

### Production Manager
- Manage items, BOMs, production orders, work orders
- Manage suppliers, purchase orders, View MRP and inventory

### Quality Inspector
- Create/manage inspection templates, Record inspections, View items and BOMs

### Inventory Manager
- Manage inventory transactions, warehouses, stock transfers, receive POs

## Core Requirements (Static)

### Multi-Level BOM
- Parent-child item relationships, Revision control, Effectivity dates
- Alternate components support, BOM explosion view (tree structure)

### MRP (Material Requirements Planning)
- Gross/net requirement calculation, Lead time tracking
- Purchase suggestions based on reorder points and MRP demand

### Quality Process
- Inspection templates with checklist items, Pass/fail tracking

### Inventory Management
- Stock level tracking, Transaction types: Receive/Issue/Adjust, Safety stock alerts

### Procurement
- Supplier management, Purchase Orders (Draft/Sent/Received), Receive PO auto-updates inventory

### Stores/Warehouse
- Multiple warehouses, Stock by location, Inter-location transfers

### Manufacturing Process
- Work Centers, Routings (operations sequence per item)
- Work Orders linked to Production Orders with status tracking
- **Auto-create child work orders**: Always creates WOs for sub-assemblies/components with active routings
- **Material consumption on start**: Raw materials consumed from inventory when WO starts
- **Inventory update on completion**: Finished goods added to inventory when WO completes

## What's Been Implemented (Feb 2026)

### Backend (server.py) - ALL COMPLETE
- JWT authentication with httpOnly cookies + role-based access
- Items/Parts, Multi-level BOM, BOM explosion, Production Orders
- MRP demand calc + purchase suggestions
- Quality inspection templates + records
- Inventory transactions, Suppliers, Purchase Orders with receive
- Warehouses, Stock by warehouse, Stock transfers
- Work Centers, Routings, Work Orders with auto-create child WOs
- Sample data seeding (all modules)

### Frontend - ALL COMPLETE
- Login, Dashboard, Items, BOM (tree view + explosion), MRP, Production Orders
- Quality, Inventory, Suppliers, Purchase Orders, Warehouses, Stock transfers
- Manufacturing (Work Centers, Routings, Work Orders with parent-child hierarchy)

## Bug Fixes Applied
- **Apr 2026**: Fixed Work Order creation not auto-creating sub-assembly WOs. Root cause: stock check was preventing WO creation when stock was sufficient. Fix: removed stock check — main WO always creates (user explicitly requested manufacturing), child WOs always create for items with active routings.

## Prioritized Backlog

### P0 (Critical) - All Complete
- All core modules implemented and tested

### P1 (High Priority)
- [ ] User management page (admin only)
- [ ] PO creation from MRP suggestions (auto-populate)
- [ ] Print/export BOM explosion
- [ ] Work Order operation tracking (mark each operation complete)

### P2 (Medium Priority)
- [ ] Supplier item catalog, Production scheduling (Gantt view)
- [ ] Quality SPC charts, Non-conformance reports

### P3 (Low Priority)
- [ ] Barcode/QR scanning, Email notifications
- [ ] Report templates (PDF export), Data import/export (CSV/Excel)
- [ ] Audit trail logging, Windows desktop wrapper (Electron/Tauri)

## Refactoring Needed
- Backend server.py (2100+ lines) → split into routers/ directory
