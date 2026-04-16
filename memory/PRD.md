# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## MO Process Rules (Feb 2026)
- SC button hidden when MO started inhouse. Complete only for MOs with no routing ops.
- SC dialog: Choose type → Choose supplier → Confirm → Auto-creates SC order → Shows JW order details in dialog
- Smart RM Resolution: Completed child parts → sent as-is; uncompleted → resolved to RM. Lines preserved during SC edit.
- SC Type Lock: "without_material" disabled when child items already processed.
- Auto-Complete: Last job card op completion auto-completes MO and adds stock.
- DC Shortage: Shows ALL insufficient items with part number, name, required, available, shortage.

## SC Receipt Stock Rules
- Receipt adds FG/SA stock ONCE at receipt line processing level
- MO completion during receipt does NOT add FG stock again (prevents double-counting)
- RM stock is deducted on DC send, never added back (consumed by vendor)

## Key Features
- Multi-Level BOM, MRP (smart RM with MO reservation), Quality
- MO Reserve/Unreserve, SC Consolidation, DC draft flow, PO from SC
- Sales Orders, Purchase Orders/Invoices, GRN, Inventory, Stores
- Search on all major pages, Collapsible sidebar groups

## Backlog
- [ ] P1: GST Phase 2 - invoice generation + tax breakup reports
- [ ] P2: Backend refactoring - server.py -> /routers/
- [ ] P3: GST Phase 3 - GSTR-1/3B + ITC tracking
- [ ] P4: Barcode/QR scanning for inventory
- [ ] P5: Gantt chart for work order scheduling
- [ ] Future: Windows desktop wrapper (Electron/Tauri)
