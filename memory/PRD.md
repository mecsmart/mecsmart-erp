# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform, with GST India compliance and role-based access control.

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme
- **Global Context**: CompanySettingsContext provides currency formatting across all pages

## Naming Convention
- **Sales Order (SO)**: Previously "Production Order" — prefix SO-XXXXXX
- **Manufacturing Order (MO)**: Previously "Work Order" — prefix MO-XXXXXX
- Internal DB collections unchanged: `production_orders`, `work_orders`

## What's Been Implemented - ALL COMPLETE

### Core Modules
- JWT Auth (4 roles) + Module-wise permissions (13 modules x 4 actions)
- Dashboard, Items/Parts (HSN code, GST rate), Multi-level BOM with rollup costing
- MRP with Sales Order filter, purchase suggestions, MRP→PO creation
- Sales Orders (SO), Quality inspections & templates, Inventory transactions
- Suppliers, Customers (structured addresses), Warehouses, Stock transfers
- Manufacturing Orders (MO) with Work Centers, Routings, auto-create child MOs
- Company Settings (logo, tagline, currency INR/USD, structured addresses)

### Manufacturing Orders - FULLY ENHANCED
- Progress bar per MO (color-coded: green/blue/amber/grey) with ops detail
- Status filter (All/Pending/In Progress/Completed/Cancelled)
- Print MO and Print Job Card

### Settings, Purchase Orders (PO), GRN, Quality, Inventory, User Management — all complete

## Prioritized Backlog

### P0 (Next - User Requested)
- [ ] Job Work / Subcontracting module

### P1 (Medium Priority)
- [ ] GST Phase 2: Sales Orders/Invoicing, E-Way Bill
- [ ] GST Phase 3: GSTR-1/3B reports, ITC tracking

### P2 (Low Priority)
- [ ] Backend refactoring: server.py → split into routers/
- [ ] Barcode/QR scanning, Gantt scheduling
- [ ] Windows desktop wrapper (Electron/Tauri)
- [ ] Advanced reporting & analytics dashboard
