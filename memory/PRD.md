# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### Manufacturing Orders
- Collapsible FG->SA->PART tree view
- MO completion blocked if: ops not completed, outsourced ops not received, partial qty
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework
- SC button on pending and in_progress MOs
- SC MOs hide Job Card and Complete buttons
- SC Order auto-created at MO start or when marking as SC
- MO auto-completes when SC receipt received
- **Child MOs: shortage qty only** (required - stock), skip if stock sufficient
- SC Type: With Material / Without Material

### Direct SC Order from SO (Skip MO)
- SC Order created directly, no MO
- SC Order lines = first-level BOM components
- Consolidation: Same supplier + same SO merged

### MRP
- **Sales Orders column: only shows SOs contributing to shortage** (not all SOs)
- Material Demand only shows items with net_requirement > 0
- Dropdown shows "Outstanding Sales Orders" only

### Job Work / Subcontracting
- SC Order with edit, confirm, send DC, receive back
- FG/SA/PART column + MO Number column + Item names
- **Without Material: "Create PO" button** instead of "Send DC" — creates Purchase Order
- **"No RM" badge** on without_material SC orders
- Receipt auto-completes linked MO

### DC Print: Company header, RM Cost columns, Terms & Conditions box
### Sales Orders: Search, balance qty, SO edit lock
### All Other: Routings, Purchase Invoice, BOM, PO, GRN, Quality, Inventory, Settings, Customers, Suppliers, Stores, User Management

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
