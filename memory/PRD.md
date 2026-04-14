# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles (admin, production_manager, etc.)

## Key Features Implemented
- Multi-Level BOM with revision control, effectivity dates, alternate components
- BOM Explosion Tree View on main page — FG-only top-level, color-coded rows (FG/SG/RM/CP), expand/collapse
- MRP with demand calculation, PO suggestions, stock filtering, shortage-only SO list
- Quality inspection checklists, pass/fail tracking
- Manufacturing Orders with Job Cards, Routing, Work Centers — consumes ALL BOM components (RM + SA + Parts)
- Subcontracting: With/Without Material, Bulk SC from multiple MOs, DC creation/print
- SC Orders auto-prefill job_work_parts with parent item (qty + editable charges)
- DC Print: Job Work Part Details table (SL.NO/Part/QTY/Charges/Total) + Raw Materials Issued
- DC Items column shows only RM lines (parent item removed)
- Sales Orders: Draft/Confirm/Cancel workflow, search, balance qty
- Purchase Orders: Create, Cancel, Recreate, status badges
- GRN module, Inventory/Stock management, Warehouse/Location management
- Customers, Suppliers, Items management
- Company Settings, User Management
- Excel Import/Export for BOMs and Items

## Completed (Latest Session - Apr 2026)
- Fix 1: MO for FG now consumes ALL BOM components (RM + SA + Parts), not just RM
- Fix 2: SC Order auto-prefills parent item in job_work_parts with qty and editable charges
- Fix 3: DC Challans ITEMS column no longer shows parent item (only RM lines)
- Fix 4: DC Print shows proper Job Work Part Details table with parent item info
- Fix 5: BOM page shows only FG BOMs as top-level groups (SA/CP only as children in tree)
- All 5 fixes verified with testing agent (iteration 24, 100% pass)

## Backlog
- [ ] P1: GST Phase 2 - GST-compliant invoice generation + tax breakup reports
- [ ] P2: Backend refactoring - server.py (5500+ lines) -> /routers/, /models/
- [ ] P3: GST Phase 3 - GSTR-1/3B report formats + ITC tracking
- [ ] P4: Barcode/QR code scanning for inventory transactions
- [ ] P5: Gantt chart visualization for work order scheduling
- [ ] P6: Windows desktop wrapper (Electron/Tauri)
