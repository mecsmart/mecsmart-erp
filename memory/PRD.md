# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform, with GST India compliance and role-based access control.

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme

## What's Been Implemented - ALL COMPLETE

### Core Modules
- JWT Auth (4 roles) + Module-wise permissions (13 modules x 4 actions)
- Dashboard, Items/Parts (HSN code, GST rate), Multi-level BOM with rollup costing
- MRP (recursive demand, raw materials only + purchase suggestions)
- Production Orders, Quality inspections & templates, Inventory transactions
- Suppliers (GSTIN, state), Purchase Orders with GST tax calculation
- Warehouses, Stock transfers, Customers (GSTIN, state)
- Manufacturing (Work Centers, Routings, Work Orders with auto-create child WOs)
- Company Settings (GSTIN, state, PAN)

### User Management & Access Control - COMPLETE
- Admin-only User Management page (CRUD users)
- Module-wise access permissions (View/Create/Edit/Delete per module)
- 4 default role presets (Admin, Production Manager, Quality Inspector, Inventory Manager)
- Custom permission overrides per user
- Sidebar navigation dynamically filters based on user permissions
- "Reset to Role Defaults" button in permissions dialog

### GST India Compliance (Phase 1) - COMPLETE
- Company Settings, HSN/GST on Items, GSTIN on Suppliers/Customers
- CGST+SGST (intra-state) / IGST (inter-state) on Purchase Orders

## Prioritized Backlog

### P1 (Current - User Requested)
- [ ] Auto-populate PO from MRP suggestions
- [ ] Work Order operation-level tracking (Job Card)
- [ ] BOM/routing export to Excel/PDF
- [ ] Item Import from Excel
- [ ] BOM Import from Excel
- [ ] Job Work / Subcontracting

### P2 (Medium Priority)
- [ ] GST Phase 2: Sales Orders/Invoicing, E-Way Bill
- [ ] GST Phase 3: GSTR-1/3B reports, ITC tracking
- [ ] Production scheduling (Gantt view)

### P3 (Low Priority)
- [ ] Barcode/QR scanning, Email notifications
- [ ] Data import/export (CSV), Audit trail, Windows desktop wrapper

## Refactoring Needed
- Backend server.py (2800+ lines) → split into routers/ directory
