# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform, with GST India compliance and role-based access control.

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme
- **Global Context**: CompanySettingsContext provides currency formatting (`formatCurrency`, `currencySymbol`) across all pages

## What's Been Implemented - ALL COMPLETE

### Core Modules
- JWT Auth (4 roles) + Module-wise permissions (13 modules x 4 actions)
- Dashboard, Items/Parts (HSN code, GST rate), Multi-level BOM with rollup costing
- MRP (recursive demand, raw materials only + purchase suggestions)
- Production Orders, Quality inspections & templates, Inventory transactions
- Suppliers (GSTIN, state, structured address), Customers (GSTIN, state, structured address)
- Warehouses (with delivery address), Stock transfers
- Manufacturing (Work Centers, Routings, Work Orders with auto-create child WOs)
- Company Settings (GSTIN, state, PAN, logo, tagline, currency)

### Settings - FULLY ENHANCED
- 3 tabs: Company & GST, Branding & Currency, PO Additional Charges
- Structured address fields: Address Line 1, Address Line 2, City, State, Pin Code (Company, Suppliers, Customers)
- Logo upload (base64, max 500KB) with preview, change, remove
- Tagline field (shown on printed documents)
- Primary/Secondary currency selector (INR / USD) with preview
- Address migration endpoint: POST /api/settings/migrate-addresses

### Manufacturing - FULLY ENHANCED
- Work Orders with progress bar (color-coded: green=100%, blue=50%+, amber=partial, grey=0%)
- Operations progress detail ("X/Y ops done")
- Status filter dropdown (All / Pending / In Progress / Completed / Cancelled) with count
- Work Order print with material consumption details
- Job Card print with operator names
- Job card operations blocked when materials not consumed

### Purchase Orders - FULLY ENHANCED
- Create/Edit PO with revision tracking
- ERPNext-style Print: 4 templates with logo + tagline + currency symbol

### GRN (Goods Receipt Note) - Under Stores
- Separate GRN tab, Material verification, GRN print with logo

### User Management & Access Control
- Admin-only CRUD, Module-wise permissions, Dynamic sidebar filtering

### GST India Compliance (Phase 1)
- Company Settings, HSN/GST on Items, GSTIN on Suppliers/Customers
- CGST+SGST (intra) / IGST (inter-state) on POs

### Excel Export/Import, Job Cards, Auto-populate PO from MRP

## Prioritized Backlog

### P0 (Next - User Requested)
- [ ] Job Work / Subcontracting module

### P1 (Medium Priority)
- [ ] GST Phase 2: Sales Orders/Invoicing, E-Way Bill
- [ ] GST Phase 3: GSTR-1/3B reports, ITC tracking

### P2 (Low Priority)
- [ ] Backend refactoring: server.py (3800+ lines) → split into routers/ directory
- [ ] Barcode/QR scanning, Gantt scheduling
- [ ] Windows desktop wrapper (Electron/Tauri)
- [ ] Advanced reporting & analytics dashboard
