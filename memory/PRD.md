# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform, with GST India compliance and role-based access control.

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme
- **Global Context**: CompanySettingsContext provides currency formatting across all pages

## Naming Convention
- **Sales Order (SO)**: prefix SO-XXXXXX — Draft → Confirmed → Released → In Progress → Completed
- **Manufacturing Order (MO)**: prefix MO-XXXXXX
- **Purchase Invoice (PI)**: prefix PI-XXXXXX — Draft → Approved → Paid
- **Job Work (JW)**: prefix JW-XXXXXX — Draft → Confirmed → In Progress → Completed
- **Delivery Challan (DC)**: prefix DC-XXXXXX
- **Subcontract Receipt (SR)**: prefix SR-XXXXXX

## Sidebar Structure
- Dashboard, BOM, Sales Orders, Manufacturing Orders, Quality, Customers, Job Work, Stores
- **Inventory** (collapsible group): Stock, Items & Parts, Suppliers, MRP, Purchase Orders, Purchase Invoices
- Settings, User Management

## What's Been Implemented

### Purchase Invoice Entry — NEW
- Create invoice with GST calculation (CGST/SGST intra-state, IGST inter-state)
- Load from PO to auto-fill supplier + line items
- Status flow: Draft → Approved → Paid (admin-only transitions)
- Status filter, KPI cards, line item editing

### Job Work / Subcontracting — NEW
- Subcontract Orders: Create → Confirm → Track sent/received qty
- Delivery Challan (DC): Send materials to subcontractor, stock deducted, inventory transaction logged
- Subcontract Receipt (SR): Receive back with Accept/Reject/Rework QC, stock added for accepted qty
- Order auto-completes when all sent materials are received
- 3-tab layout (Orders, Challans, Receipts)

### Sales Orders, Manufacturing Orders, MRP, Settings, PO, GRN, Quality, Inventory — all complete

## Prioritized Backlog

### P1
- [ ] GST Phase 2: Sales Invoicing, E-Way Bill

### P2
- [ ] Backend refactoring: server.py → routers/
- [ ] Barcode/QR scanning, Gantt scheduling, Windows wrapper
- [ ] Advanced reporting & analytics dashboard
