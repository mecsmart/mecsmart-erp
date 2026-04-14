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
6. Stores
7. Quality
8. Job Work
9. Settings
10. User Management (admin only)

## Key Features Implemented
- Multi-Level BOM with revision control, effectivity dates, alternate components
- BOM Explosion Tree View — FG-only top-level, color-coded rows, search bar, print button, 75% header opacity
- MRP with demand calculation, PO suggestions, stock filtering
- Manufacturing Orders — consumes ALL BOM components (RM + SA + Parts)
- Subcontracting: With/Without Material, Bulk SC, DC creation/print
- SC Orders auto-prefill job_work_parts with parent item (qty + editable charges)
- DC Print: Editable T&C dialog, Job Work Part Details table, Raw Materials table
- Sales Orders: Draft/Confirm/Cancel workflow
- Purchase Orders: Create, Cancel, Recreate
- GRN, Inventory/Stock, Warehouse/Location management
- Customers, Suppliers, Items management
- Company Settings, User Management, Quality inspection

## Completed (Latest - Apr 2026)
- Sidebar restructured: Dashboard > Customers > Sales Orders > Inventory > Production > Stores > Quality > Job Work > Settings
- Production collapsible group: Items & Parts, BOM, Manufacturing Orders
- BOM: Search bar, print button, header opacity 75%
- DC: T&C edit dialog before printing

## Backlog
- [ ] P1: GST Phase 2 - GST-compliant invoice generation + tax breakup reports
- [ ] P2: Backend refactoring - server.py (5500+ lines) -> /routers/, /models/
- [ ] P3: GST Phase 3 - GSTR-1/3B report formats + ITC tracking
- [ ] P4: Barcode/QR code scanning for inventory transactions
- [ ] P5: Gantt chart visualization for work order scheduling
- [ ] P6: Windows desktop wrapper (Electron/Tauri)
