# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform, with GST India compliance and role-based access control.

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme

## Sidebar Structure
- Dashboard, BOM, Sales Orders, Manufacturing Orders, Quality, Customers, Job Work, Stores
- **Inventory** (collapsible): Stock, Items & Parts, Suppliers, MRP, Purchase Orders, Purchase Invoices
- Settings, User Management

## What's Been Implemented

### Purchase Invoice — Discount + GRN-linked
- GRN-required flow: PO → GRN → Purchase Invoice (auto-populated)
- Discount column per line item
- Status: Draft → Approved → Paid
- GST calculation (CGST/SGST or IGST)

### Manufacturing Orders — Sub-Contract + Job Work + Tree
- **Sub-Contract option**: Checkbox + supplier selection. Auto-creates JW order + DC when MO starts
- **Routing Job Work**: Per-operation `is_job_work` flag with supplier. Marked as "JW" badge in routings table
- **MO Tree View**: Visual tree in Job Card dialog (Finished Good → Semi-Finished → Parts)
- **Routing Edit**: Full CRUD with edit button, add/remove/reorder operations
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework quality
- Progress bar, Status filter, Print MO with child items

### Job Work / Subcontracting
- Subcontract Orders → Confirm → Send DC (stock deducted) → Receive back (stock added, QC)

### All Other Modules Complete
- Sales Orders (Draft→Confirm→Cancel cascade), MRP, BOM, Quality, Inventory, PO, GRN, Settings, Customers, Suppliers, User Management

## Prioritized Backlog
- [ ] GST Phase 2: Sales Invoicing, E-Way Bill
- [ ] Backend refactoring: server.py → routers/
- [ ] Barcode/QR scanning, Gantt scheduling, Windows wrapper
