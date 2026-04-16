# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## Stock Accounting Rules (CRITICAL - Feb 2026)
- DC Creation: Each item's stock deducted from ITS OWN current_stock (no cross-contamination)
- with_material SC Receipt: ONLY adds stock for job_work_parts items (FG/SA), NOT RM lines
- without_material SC via GRN: Stock added at GRN line level only, NOT again at MO completion
- MO completion during receipt/GRN does NOT add FG stock again (prevents double-counting)
- WIP Stock: Completed child MOs of active parent MOs = WIP (not available for new MOs)
  - free_stock = current_stock - wip_qty
  - Parent cancelled → WIP released → stock becomes free for new MOs

## MO Process Rules
- SC button hidden when MO started inhouse. Complete only for MOs with no routing ops.
- SC dialog: auto-creates SC order, shows JW order details in dialog
- Smart RM Resolution: Completed child parts → sent as-is; uncompleted → resolved to RM
- SC Type Lock: "without_material" disabled when child items already processed
- Auto-Complete: Last job card op completion auto-completes MO and adds stock

## Key Features
- Multi-Level BOM, MRP (smart RM with MO reservation), Quality
- MO Reserve/Unreserve, SC Consolidation, DC draft flow, PO from SC
- Sales Orders, Purchase Orders/Invoices, GRN, Inventory, Stores

## Backlog
- [ ] P1: GST Phase 2 - invoice generation + tax breakup reports
- [ ] P2: Backend refactoring - server.py -> /routers/
- [ ] P3: GST Phase 3 - GSTR-1/3B + ITC tracking
- [ ] P4: Barcode/QR scanning for inventory
- [ ] P5: Gantt chart for work order scheduling
- [ ] Future: Windows desktop wrapper (Electron/Tauri)
