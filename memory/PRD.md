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
- Draft & Confirmation workflow, Cascading cancellation (SO → MO → reverse stock)
- Status flow: Draft → Confirmed → Released → In Progress → Completed (or Cancelled)
- Only confirmed/planned SOs appear in MRP demand and MO creation dropdown

### MRP — FULLY ENHANCED
- Material Demand with SO filter, Purchase Suggestions with correct qty logic
- When item has both low-stock and MRP demand, uses the higher quantity
- Table headers properly right-aligned for numeric columns
- MRP→PO creation passes suggested quantities correctly

### Manufacturing Orders (MO), Purchase Orders, GRN, Settings, Quality, Inventory — all complete

## Prioritized Backlog

### P0 (Next)
- [ ] Job Work / Subcontracting module

### P1
- [ ] GST Phase 2: Sales Invoicing, E-Way Bill

### P2
- [ ] Backend refactoring: server.py → routers/
- [ ] Barcode/QR scanning, Gantt scheduling, Windows wrapper
