# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles (admin, production_manager, etc.)

## Sidebar Structure
1. Dashboard
2. Customers
3. Sales Orders
4. Inventory (collapsible) → Stock, Suppliers, MRP, Purchase Orders, Purchase Invoices
5. Production (collapsible) → Items & Parts, BOM, Manufacturing Orders
6. Stores (collapsible) → Stock, Transfer History, GRN
7. Quality
8. Job Work
9. Settings / User Management

## Key Features
- Multi-Level BOM: FG-only top-level, color-coded rows, search, print
- MRP: demand for ALL item categories (RM + SA + Parts), PO suggestions
- MO: consumes ALL BOM components, SC consolidation per supplier
- SC Orders: auto-prefill job_work_parts, consolidate same-supplier MOs into 1 JW
- DC Flow: auto-DCs created as draft → user sends from JW page → stock deducted on send
- PO from SC: uses lines key with proper pricing from job_work_parts charges
- DC Print: editable T&C, parent item details
- Sales Orders, Purchase Orders/Invoices, GRN, Inventory/Stock, Quality
- Search on all major pages

## Completed (Latest - Apr 2026)
- MRP calculates demand for ALL categories (RM, SA, Components) not just RM
- SC orders consolidate per supplier (same vendor → 1 JW order)
- DC auto-created as draft (all paths), user sends manually with stock deduction
- PO from SC without-material uses job_work_parts for items and charges
- Send draft DC endpoint: POST /api/job-work/challans/{dc_id}/send
- All auto-DC creation paths updated to draft status

## Backlog
- [ ] P1: GST Phase 2 - invoice generation + tax breakup
- [ ] P2: Backend refactoring - server.py -> /routers/, /models/
- [ ] P3: GST Phase 3 - GSTR-1/3B + ITC tracking
- [ ] P4: Barcode/QR scanning
- [ ] P5: Gantt chart for scheduling
- [ ] P6: Windows desktop wrapper
