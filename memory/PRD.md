# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## MO Process Rules (Feb 2026)
- Rule 1: SC button hidden if any child MO started inhouse or outsourced. Children with outsourced_by_parent=true skipped.
- Rule 2 (Smart RM Resolution): Completed child parts -> sent as-is; uncompleted parts -> resolved to leaf-level RM via BOM. Lines preserved during SC edit.
- SC Type Lock: If any child/descendant completed/in_progress, only "with_material" allowed.
- Inhouse Processing: MO started inhouse hides SC button and manual Complete button. Complete only shows for MOs with no routing ops.
- Auto-Complete: When last job card operation completes, MO auto-completes and adds finished item to stock.
- SC Auto-Create: SC dialog auto-creates SC order on confirm (bypasses Start SC button step).
- DC Shortage: Shows ALL insufficient items with part number, name, required qty, available, shortage.

## Key Features
- Multi-Level BOM, MRP (smart RM with MO reservation), Quality
- MO Reserve/Unreserve material functionality
- SC Consolidation per supplier, DC draft flow, PO from SC
- Sales Orders, Purchase Orders/Invoices, GRN, Inventory, Stores
- Search on all major pages, Collapsible sidebar groups

## Backlog
- [ ] P1: GST Phase 2 - invoice generation + tax breakup reports
- [ ] P2: Backend refactoring - server.py -> /routers/
- [ ] P3: GST Phase 3 - GSTR-1/3B + ITC tracking
- [ ] P4: Barcode/QR scanning for inventory
- [ ] P5: Gantt chart for work order scheduling
- [ ] Future: Windows desktop wrapper (Electron/Tauri)
