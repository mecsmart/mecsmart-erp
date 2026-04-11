# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform.

## User Choices
- **BOM Features**: Advanced BOM with revision control, effectivity dates, alternate components, rollup costing
- **MRP Features**: Advanced MRP with lead times, safety stock, purchase suggestions (raw materials only)
- **Quality Features**: Basic inspection checklists and pass/fail tracking
- **Authentication**: JWT-based custom auth with roles
- **Procurement**: Purchase Orders, Supplier Management
- **Stores**: Warehouse/Location management, Stock by location, Transfers
- **Manufacturing**: Work Centers, Routing, Work Order tracking with child WO dependency enforcement

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme

## What's Been Implemented - ALL COMPLETE
- JWT Auth (4 roles), Dashboard, Items/Parts, Multi-level BOM with rollup costing
- MRP (recursive demand calc, raw materials only + purchase suggestions)
- Production Orders, Quality inspections & templates, Inventory transactions
- Suppliers, Purchase Orders with receive, Warehouses, Stock transfers
- Manufacturing (Work Centers, Routings, Work Orders with auto-create child WOs)
- Child WO dependency enforcement (parent can't start until children complete)
- Insufficient materials dialog with item name + code

## Bug Fixes Applied
- **Apr 2026**: Fixed WO not auto-creating sub-assembly WOs (stock check blocking)
- **Apr 2026**: Fixed MRP not considering child items (now recursive)
- **Apr 2026**: Fixed BOM creation not allowing Component category as parent
- **Apr 2026**: MRP filtered to show only raw materials
- **Apr 2026**: Insufficient materials dialog now shows item name + code
- **Apr 2026**: Parent WO blocked when child WOs not completed
- **Apr 2026**: Added BOM rollup costing (unit cost, extended cost, total cost)

## Prioritized Backlog

### P1 (High Priority)
- [ ] User management page (admin only)
- [ ] PO creation from MRP suggestions (auto-populate)
- [ ] Print/export BOM explosion
- [ ] Work Order operation tracking (mark each operation complete)

### P2 (Medium Priority)
- [ ] Supplier item catalog, Production scheduling (Gantt view)
- [ ] Quality SPC charts, Non-conformance reports

### P3 (Low Priority)
- [ ] Barcode/QR scanning, Email notifications, PDF reports
- [ ] Data import/export, Audit trail, Windows desktop wrapper

## Refactoring Needed
- Backend server.py (2300+ lines) → split into routers/ directory
