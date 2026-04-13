# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### Manufacturing Orders
- Collapsible FG->SA->PART tree view
- MO completion blocked if: ops not completed, outsourced ops not received, partial qty
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework
- Outsource toggle in Job Card
- SC MOs hide Job Card and Complete buttons
- SC Order auto-created at MO start OR when marking in_progress MO as SC
- MO auto-completes when SC receipt is received

### Sub-Contract Flow (SC marking before/after start)
- **SC button on pending MOs** — decide With/Without Material BEFORE starting
- **SC button on in_progress MOs** — mark after start (creates SC order immediately)
- **With Material**: RM consumed at start, DC auto-created, materials sent to vendor
- **Without Material**: No RM consumed at start, no DC, vendor sources own materials
- **Start SC button** — distinct label for SC-marked pending MOs
- **SC badges**: "SC" for with_material, "SC (No RM)" for without_material

### Direct SC Order from SO (Skip MO)
- When "Sub-Contract" checked in Create MO dialog: SC Order created directly, no MO
- SC Order lines = first-level BOM components
- Consolidation: Same supplier + same SO → merged into single SC order

### Sales Orders
- Search box: Filter by order number, product name, BOM name
- Balance quantity in Create MO dialog
- SO edit blocked when full qty covered by MOs

### Job Work / Subcontracting
- SC Order with edit, confirm, send DC, receive back
- MO Number column + Item names in JW orders table
- Receipt auto-completes linked MO

### Delivery Challan Print
- Company header with name, tagline, address, phone, email, GSTIN
- RM Cost columns + Terms & Conditions box

### All Other Modules: Routings, Purchase Invoice, BOM, PO, GRN, Quality, Inventory, MRP, Settings, Customers, Suppliers, Stores, User Management

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
