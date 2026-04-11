# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform, with GST India compliance.

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme

## What's Been Implemented - ALL COMPLETE

### Core Modules
- JWT Auth (4 roles: Admin, Production Manager, Quality Inspector, Inventory Manager)
- Dashboard, Items/Parts (with HSN code, GST rate), Multi-level BOM with rollup costing
- MRP (recursive demand calc, raw materials only + purchase suggestions)
- Production Orders, Quality inspections & templates, Inventory transactions
- Suppliers (with GSTIN, state), Purchase Orders with GST tax calculation
- Warehouses, Stock transfers
- Manufacturing (Work Centers, Routings, Work Orders with auto-create child WOs)
- Child WO dependency enforcement, Material auto-consumption on WO start

### GST India Compliance (Phase 1) - COMPLETE
- Company Settings page (GSTIN, state, PAN, address)
- HSN code and GST rate on all Items
- GSTIN and state on all Suppliers
- Customer master with GSTIN and state
- GST tax calculation on Purchase Orders:
  - Intra-state (same state): CGST + SGST (split 50/50)
  - Inter-state (different state): IGST (full amount)
- Tax breakup display on PO table (Subtotal, GST, Total)
- All 37 Indian states supported
- GST slabs: 0%, 5%, 12%, 18%, 28%

## Bug Fixes Applied
- Fixed WO not auto-creating sub-assembly WOs
- Fixed MRP not considering child items (now recursive)
- Fixed BOM creation not allowing Component category as parent
- MRP filtered to show only raw materials
- Insufficient materials dialog shows item name + code
- Parent WO blocked when child WOs not completed
- Added BOM rollup costing

## Prioritized Backlog

### P1 (High Priority)
- [ ] GST Phase 2: Sales Orders/Invoicing with GST, E-Way Bill data
- [ ] User management page (admin only)
- [ ] Work Order operation tracking (mark each op complete)

### P2 (Medium Priority)
- [ ] GST Phase 3: GSTR-1/3B reports, ITC tracking
- [ ] Debit/Credit Notes
- [ ] Production scheduling (Gantt view)

### P3 (Low Priority)
- [ ] Barcode/QR scanning, Email notifications, PDF reports
- [ ] Data import/export, Audit trail, Windows desktop wrapper

## Refactoring Needed
- Backend server.py (2600+ lines) → split into routers/ directory
