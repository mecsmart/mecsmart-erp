# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform.

## User Choices
- **BOM Features**: Advanced BOM with revision control, effectivity dates, and alternate components
- **MRP Features**: Advanced MRP with lead times, safety stock, and purchase order suggestions
- **Quality Features**: Basic inspection checklists and pass/fail tracking
- **Authentication**: JWT-based custom auth with roles (Admin, Production Manager, Quality Inspector, Inventory Manager)
- **Procurement**: Basic - Purchase Orders, Supplier Management, PO from MRP suggestions
- **Stores**: Basic - Warehouse/Location management, Stock by location, Inter-location transfers
- **Manufacturing**: Basic - Work Centers, Routing (operations sequence), Work Order tracking with status

## Architecture
- **Backend**: FastAPI + MongoDB, JWT with httpOnly cookies, all endpoints under `/api`
- **Frontend**: React 19 + Shadcn/UI + Tailwind CSS, Industrial design theme

## What's Been Implemented (Feb 2026) - ALL COMPLETE
- JWT Auth (4 roles), Dashboard, Items/Parts, Multi-level BOM, BOM explosion
- MRP (recursive demand calc + purchase suggestions), Production Orders
- Quality inspections & templates, Inventory transactions
- Suppliers, Purchase Orders with receive, Warehouses, Stock transfers
- Manufacturing (Work Centers, Routings, Work Orders with auto-create child WOs)

## Bug Fixes Applied
- **Apr 2026**: Fixed Work Order not auto-creating sub-assembly WOs (stock check was blocking)
- **Apr 2026**: Fixed MRP not considering child items (only top-level BOM was exploded, now recursive)
- **Apr 2026**: Fixed BOM creation not allowing Component category as parent item

## Prioritized Backlog

### P1 (High Priority)
- [ ] User management page (admin only)
- [ ] PO creation from MRP suggestions (auto-populate)
- [ ] Print/export BOM explosion
- [ ] Work Order operation tracking (mark each operation complete)

### P2 (Medium Priority)
- [ ] Supplier item catalog, Production scheduling (Gantt view)
- [ ] Quality SPC charts, Non-conformance reports

### P3 (Low Priority)
- [ ] Barcode/QR scanning, Email notifications, PDF reports
- [ ] Data import/export (CSV/Excel), Audit trail, Windows desktop wrapper

## Refactoring Needed
- Backend server.py (2100+ lines) → split into routers/ directory
