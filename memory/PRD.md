# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### Manufacturing Orders
- Collapsible FG→SA→PART tree view (same as Routings tab)
- Subcontract button only on started (in_progress) MOs
- MO completion blocked if: subcontracted qty not received, or outsourced operations pending
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework
- Start Operation: **Outsource toggle** — switches between Operator mode and Outsource mode (Supplier + Charges + auto-create SC Order + DC)

### Routings
- Collapsible MO-grouped tree view (FG→SA→PART)
- Job Work flag per operation with supplier
- Edit routing with full CRUD

### Job Work / Subcontracting
- SC Order with edit (lines + charges), confirm, send DC, receive back
- DC with item names and RM price column, print
- Auto-create from MO outsource flow

### Purchase Invoice
- GRN-linked, discount column, Draft→Approved→Paid

### All Other Modules: SO, MRP, BOM, PO, GRN, Quality, Inventory, Settings, Customers, Suppliers, Stores, User Management

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py → routers/
- [ ] Barcode/QR, Gantt chart, Windows wrapper
