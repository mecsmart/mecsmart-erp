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

## What's Been Implemented

### Sales Orders (SO)
- Draft & Confirmation workflow, Cascading cancellation (SO → MO → reverse stock)
- Status: Draft → Confirmed → Released → In Progress → Completed (or Cancelled)

### Manufacturing Orders (MO) — FULLY ENHANCED
- MO qty auto-fills from selected SO quantity
- Job Card with explicit Start/Stop/Complete per operation
- Start dialog: Operator Name + editable Quantity to Produce
- Stop/Complete dialog: Qty Produced + Accept/Reject/Rework quality decision + reject/rework counts + notes
- Partial production: tracked via `runs` array — multiple operators per operation for remaining qty
- Progress bar, Status filter, Print MO (with logo, tagline, currency, child MO details)
- MO print includes: Operations with operator/qty/accept-reject, Materials, Child Sub-Assembly MOs table

### MRP
- Material Demand with SO filter, Purchase Suggestions with correct qty logic
- MRP→PO creation with suggested quantities

### Settings
- Logo, Tagline, Currency (INR/USD), Structured addresses (Line1, Line2, City, State, Pin)

### All Other Modules Complete
- Items/Parts, Multi-level BOM, Purchase Orders (ERPNext-style print), GRN, Quality, Inventory, Suppliers, Customers, Warehouses, User Management

## Prioritized Backlog

### P0 (Next)
- [ ] Job Work / Subcontracting module

### P1
- [ ] GST Phase 2: Sales Invoicing, E-Way Bill

### P2
- [ ] Backend refactoring: server.py → routers/
- [ ] Barcode/QR scanning, Gantt scheduling, Windows wrapper
