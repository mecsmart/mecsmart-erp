# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform, with GST India compliance and role-based access control.

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme
- **Global Context**: CompanySettingsContext provides currency formatting across all pages

## Naming Convention
- **Sales Order (SO)**: prefix SO-XXXXXX — workflow: Draft → Confirmed → Released → In Progress → Completed
- **Manufacturing Order (MO)**: prefix MO-XXXXXX
- Internal DB collections: `production_orders`, `work_orders`

## What's Been Implemented - ALL COMPLETE

### Sales Orders (SO) — FULLY ENHANCED
- Draft & Confirmation workflow: new orders start as "draft", require explicit confirmation
- Cancellation with full cascade: SO → Cancel all linked MOs → Reverse consumed materials → Reverse finished goods
- Status flow: Draft → Confirmed → Released → In Progress → Completed (or Cancelled at any point)
- Only confirmed SOs appear in MRP demand and are available for MO creation
- Confirm button, Edit button (draft/confirmed only), Cancel button with cascade detail alert

### Manufacturing Orders (MO) — FULLY ENHANCED
- Progress bar, Status filter, Print MO / Job Card
- Only confirmed SOs shown in MO creation dropdown
- Auto-create child MOs, material consumption, stock additions

### Core Modules
- JWT Auth (4 roles), Dashboard, Items/Parts, Multi-level BOM with rollup costing
- MRP with SO filter, purchase suggestions, MRP→PO creation
- Quality, Inventory, Suppliers, Customers (structured addresses), Warehouses
- Company Settings (logo, tagline, currency INR/USD, structured addresses)
- Purchase Orders with ERPNext-style Print (4 templates), GRN

## Prioritized Backlog

### P0 (Next - User Requested)
- [ ] Job Work / Subcontracting module

### P1 (Medium Priority)
- [ ] GST Phase 2: Sales Invoicing, E-Way Bill
- [ ] GST Phase 3: GSTR-1/3B reports, ITC tracking

### P2 (Low Priority)
- [ ] Backend refactoring: server.py → split into routers/
- [ ] Barcode/QR scanning, Gantt scheduling
- [ ] Windows desktop wrapper, Advanced reporting
