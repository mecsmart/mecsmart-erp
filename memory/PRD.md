# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### Manufacturing Orders
- Collapsible FG->SA->PART tree view
- MO completion blocked if: any operation not completed, outsourced ops not received, partial qty
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework
- Outsource toggle in Job Card
- SC MOs hide Job Card and Complete buttons
- SC Order auto-created at MO start OR when marking in_progress MO as SC
- MO auto-completes when SC receipt is received

### Sub-Contract Type Selection
- With Material: RM consumed, sent to vendor via DC
- Without Material: No RM consumed, vendor sources own materials
- Radio toggle in Create MO dialog and SC button dialog

### Sales Orders (SO) -> Manufacturing Orders (MO)
- Balance quantity in Create MO dialog
- SO edit blocked when full qty covered by MOs

### Job Work / Subcontracting
- SC Order with edit, confirm, send DC, receive back
- MO Number column + Item names in JW orders table
- Receipt auto-completes linked MO

### Delivery Challan (DC) Print
- **Company header**: Name, tagline, address, phone, email, GSTIN
- **Vendor details**: Subcontractor name, address, GSTIN, phone
- **RM Cost**: Rate and Cost columns per item + Total RM Cost row
- **Terms & Conditions**: 6-point T&C box for job work materials
- Signature boxes: Prepared By, Dispatched By, Received By

### All Other Modules: Routings, Purchase Invoice, BOM, PO, GRN, Quality, Inventory, MRP, Settings, Customers, Suppliers, Stores, User Management

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
