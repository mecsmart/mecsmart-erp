# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles (admin, production_manager, etc.)

## Sidebar Structure (Updated Apr 2026)
1. Dashboard
2. Customers
3. Sales Orders
4. Inventory (collapsible) → Stock, Suppliers, MRP, Purchase Orders, Purchase Invoices
5. Production (collapsible) → Items & Parts, BOM, Manufacturing Orders
6. Stores (collapsible) → Stock, Transfer History, GRN
7. Quality
8. Job Work
9. Settings
10. User Management (admin only)

## Key Features Implemented
- Multi-Level BOM: FG-only top-level view, color-coded rows, search, print, 75% header opacity
- MRP: demand analysis, PO suggestions, stock filtering + search
- MO: consumes ALL BOM components (RM + SA + Parts) + search
- SC Orders: auto-prefill job_work_parts, editable charges
- DC Print: editable T&C dialog, Job Work Part Details table
- Sales Orders, Purchase Orders (+ search), Purchase Invoices (+ search)
- GRN, Inventory/Stock (+ search), Warehouses, Transfers
- Stores: collapsible sidebar with Stock tab (inventory view + search)
- Suppliers management + search
- Routings + search
- Customers, Company Settings, User Management, Quality

## Completed (Latest - Apr 2026)
- Search added to: Inventory Stock, Suppliers, MRP, Purchase Orders, Purchase Invoices, Manufacturing Orders, Routings
- Stores converted to collapsible sidebar: Stock, Transfer History, GRN
- Stock tab under Stores shows same inventory data with search

## Backlog
- [ ] P1: GST Phase 2 - GST-compliant invoice generation + tax breakup reports
- [ ] P2: Backend refactoring - server.py (5500+ lines) -> /routers/, /models/
- [ ] P3: GST Phase 3 - GSTR-1/3B report formats + ITC tracking
- [ ] P4: Barcode/QR code scanning for inventory transactions
- [ ] P5: Gantt chart visualization for work order scheduling
- [ ] P6: Windows desktop wrapper (Electron/Tauri)
