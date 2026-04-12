# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### Manufacturing Orders
- Collapsible FG->SA->PART tree view (same as Routings tab)
- MO completion blocked if: any operation not completed, outsourced operations not received, partial qty produced
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework
- Start Operation: **Outsource toggle** — switches between Operator mode and Outsource mode (Supplier + Charges + auto-create SC Order + DC)
- After MO start, all operations remain "pending" — user must start each via Job Card with operator/supplier selection
- Outsourced operation cannot be completed until SC order materials are received
- Receipt auto-updates linked WO operation status
- **SC MOs hide Job Card and Complete buttons** (work is external)
- **SC Order auto-created** both when: (a) MO starts with is_subcontract=true, (b) MO marked as SC after already started
- SC Order creation uses consumed_materials, falls back to WO item for PARTs with no BOM

### Sales Orders (SO) -> Manufacturing Orders (MO)
- Create MO dialog shows **balance quantity** (SO qty - existing MO qty) not full qty
- SO dropdown shows balance info; SOs fully covered by MOs are disabled
- **SO edit blocked** when full quantity is covered by MOs (backend + frontend)
- MO QTY column on SO page shows X/Y format with "Fully covered" indicator

### Job Work / Subcontracting
- SC Order with edit (lines + charges), confirm, send DC, receive back
- DC with item names and RM price column, print
- Auto-create from MO outsource flow with consumed_materials
- Receipt updates linked WO operation outsource_status and marks op completed
- **MO Number column** in JW orders table for traceability
- **Item names** displayed alongside part numbers in JW orders

### Routings, Purchase Invoice, BOM, PO, GRN, Quality, Inventory, MRP, Settings, Customers, Suppliers, Stores, User Management — All implemented

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
