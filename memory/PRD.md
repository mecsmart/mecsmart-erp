# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform, with GST India compliance and role-based access control.

## Architecture
- **Backend**: FastAPI + MongoDB, JWT httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme

## What's Been Implemented

### Manufacturing Orders — FULLY ENHANCED
- Sub-Contract option: Checkbox at creation OR Subcontract button on pending MOs in Actions column
- Sub-Contract → Auto DC + JW order when MO starts
- Routing Job Work flag per operation with supplier
- MO Tree View: Visual tree in Job Card (FG → SA → PART) with routing names and category badges
- Routing Edit with full CRUD, item filter includes component/parts category
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework

### Purchase Invoice — Discount + GRN-linked
- GRN-required flow with auto-populate, Discount per line item
- Status: Draft → Approved → Paid

### All Other Modules Complete
- Sales Orders, MRP, BOM, PO, GRN, Quality, Inventory, Settings, Customers, Suppliers, Job Work, Stores, User Management

## Prioritized Backlog
- [ ] GST Phase 2: Sales Invoicing, E-Way Bill
- [ ] Backend refactoring: server.py → routers/
- [ ] Barcode/QR, Gantt chart, Windows wrapper
