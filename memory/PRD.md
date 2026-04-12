# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### Manufacturing Orders
- Collapsible FG->SA->PART tree view
- MO completion blocked if: any operation not completed, outsourced ops not received, partial qty
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework
- Outsource toggle in Job Card: switches between Operator and Outsource mode
- After MO start, all operations remain "pending" — user starts each via Job Card
- SC MOs hide Job Card and Complete buttons (work is external)
- **SC Order auto-created** at MO start OR when marking in_progress MO as SC
- **MO auto-completes** when SC receipt is received (ops completed, FG stock added)

### Sub-Contract Type Selection
- **With Material**: RM consumed from your stock, sent to vendor via DC. Vendor processes and returns FG
- **Without Material**: No RM consumed. Vendor sources own materials. Only finished item received back
- Radio toggle available in both Create MO dialog and SC button dialog on MO rows
- SC Order stores `subcontract_type` field; DC only created for "with_material"

### Sales Orders (SO) -> Manufacturing Orders (MO)
- Create MO dialog shows balance quantity (SO qty - existing MO qty)
- SO edit blocked when full quantity covered by MOs
- MO QTY column on SO page shows X/Y with "Fully covered" indicator

### Job Work / Subcontracting
- SC Order with edit, confirm, send DC, receive back
- MO Number column + Item names in JW orders table
- Auto-create from MO outsource flow
- Receipt auto-completes linked MO and updates operation status

### Routings, Purchase Invoice, BOM, PO, GRN, Quality, Inventory, MRP, Settings, Customers, Suppliers, Stores, User Management — All implemented

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
