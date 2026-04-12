# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform, with GST India compliance and role-based access control.

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme
- **Global Context**: CompanySettingsContext provides currency formatting across all pages

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
- Structured address fields: Address Line 1, Address Line 2, City, State, Pin Code
- Logo upload (base64, max 500KB), Tagline, Primary/Secondary currency (INR/USD)

### MRP - FULLY ENHANCED
- Material Demand tab with **Production Order filter** dropdown (filter by specific PO)
- Column renamed to "Production Orders" showing deduplicated production order numbers
- Purchase Suggestions with select-all, editable qty, create PO from selections
- MRP→PO creation properly passes suggested quantities (fixed qty=1 bug)

### Manufacturing - FULLY ENHANCED
- Work Orders with progress bar and status filter
- Work Order creation dropdown shows only **planned** production orders (not completed/in-progress)
- Work Order print, Job Card print, material consumption blocking

### Purchase Orders - FULLY ENHANCED
- ERPNext-style Print: 4 templates with logo + tagline + currency symbol
- Revision tracking, Additional charges, GST calculation

### GRN (Goods Receipt Note), Quality, Inventory, User Management — all complete

## Prioritized Backlog

### P0 (Next - User Requested)
- [ ] Job Work / Subcontracting module

### P1 (Medium Priority)
- [ ] GST Phase 2: Sales Orders/Invoicing, E-Way Bill
- [ ] GST Phase 3: GSTR-1/3B reports, ITC tracking

### P2 (Low Priority)
- [ ] Backend refactoring: server.py (3800+ lines) → split into routers/
- [ ] Barcode/QR scanning, Gantt scheduling
- [ ] Windows desktop wrapper (Electron/Tauri)
- [ ] Advanced reporting & analytics dashboard
