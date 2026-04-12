# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### Manufacturing Orders
- Collapsible FG->SA->PART tree view (same as Routings tab)
- Subcontract button only on started (in_progress) MOs
- MO completion blocked if: any operation not completed, outsourced operations not received, partial qty produced
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework
- Start Operation: **Outsource toggle** — switches between Operator mode and Outsource mode (Supplier + Charges + auto-create SC Order + DC)
- After MO start, all operations remain "pending" — user must start each via Job Card with operator/supplier selection
- Outsourced operation cannot be completed until SC order materials are received
- Receipt auto-updates linked WO operation status
- **SC MOs hide Job Card and Complete buttons** (work is external)
- **SC Order always created on MO start** — even for PART items with no BOM (uses WO item as fallback)

### Sales Orders (SO) -> Manufacturing Orders (MO)
- Create MO dialog shows **balance quantity** (SO qty - existing MO qty) not full qty
- SO dropdown shows balance info; SOs fully covered by MOs are disabled
- **SO edit blocked** when full quantity is covered by MOs (backend + frontend)
- MO QTY column on SO page shows X/Y format with "Fully covered" indicator

### Routings
- Collapsible MO-grouped tree view (FG->SA->PART)
- Job Work flag per operation with supplier
- Edit routing with full CRUD

### Job Work / Subcontracting
- SC Order with edit (lines + charges), confirm, send DC, receive back
- DC with item names and RM price column, print
- Auto-create from MO outsource flow with consumed_materials
- Receipt updates linked WO operation outsource_status and marks op completed

### Purchase Invoice
- GRN-linked, discount column, Draft->Approved->Paid

### All Other Modules: SO, MRP, BOM, PO, GRN, Quality, Inventory, Settings, Customers, Suppliers, Stores, User Management

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
