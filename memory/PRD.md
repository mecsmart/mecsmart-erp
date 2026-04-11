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
- Suppliers (GSTIN, state), Customers (GSTIN, state)
- Warehouses (with delivery address), Stock transfers
- Manufacturing (Work Centers, Routings, Work Orders with auto-create child WOs)
- Company Settings (GSTIN, state, PAN)

### Purchase Orders - FULLY ENHANCED
- Create/Edit PO with revision tracking (draft = free edit, submitted = revision history)
- Order lines: Item, HSN, Qty, UOM, Rate, Discount (% or Amount), GST%
- Vendor Quotation Ref No. & Date
- Delivery Warehouse selector with address auto-fill
- Additional charges (Transportation, Handling) with HSN & GST% from Settings
- PO print: Standard + Detailed (GST breakup) formats
- PO status workflow: Draft → Sent → GRN Done

### GRN (Goods Receipt Note) - Under Stores
- Separate GRN tab in Stores page
- Pending POs listing for GRN processing
- Material verification: editable received qty + verified price per line
- Supplier Invoice / Doc reference number + date
- Receiving warehouse selection
- Qty/Price mismatch status indicators
- GRN print: Standard + Detailed (PO vs Received comparison) formats
- Auto-updates inventory on GRN confirmation

### Manufacturing - Enhanced
- Work Order print with material consumption details (Part No, Material, Qty, UOM, Cost)
- Job Card print with operator names, start/end times, signature columns
- Job card operations blocked when materials not consumed (stock insufficient)
- Consumed materials display: item code + description + qty + UOM

### User Management & Access Control
- Admin-only CRUD, Module-wise permissions, Dynamic sidebar filtering

### GST India Compliance (Phase 1)
- Company Settings, HSN/GST on Items, GSTIN on Suppliers/Customers
- CGST+SGST (intra) / IGST (inter-state) on POs

### Phase 2 Features
- Auto-populate PO from MRP, Excel Export/Import, Job Cards

### Settings > PO Additional Charges
- CRUD charge types (name, HSN, GST%) used in PO creation

## Prioritized Backlog

### P0 (Next - User Requested)
- [ ] Job Work / Subcontracting module

### P1 (Medium Priority)
- [ ] GST Phase 2: Sales Orders/Invoicing, E-Way Bill
- [ ] GST Phase 3: GSTR-1/3B reports, ITC tracking

### P2 (Low Priority)
- [ ] Barcode/QR scanning, Gantt scheduling
- [ ] Windows desktop wrapper (Electron/Tauri)
- [ ] Advanced reporting & analytics dashboard

## Refactoring Needed
- Backend server.py (3700+ lines) → split into routers/ directory
