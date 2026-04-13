# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### Manufacturing Orders
- Collapsible FG->SA->PART tree view
- MO completion blocked if: ops not completed, outsourced ops not received, partial qty
- Job Card: Start/Stop/Complete with operator, qty, Accept/Reject/Rework
- SC button on pending and in_progress MOs (decide SC before or after start)
- SC MOs hide Job Card and Complete buttons
- SC Order auto-created at MO start or when marking as SC
- MO auto-completes when SC receipt received
- **Skip child MOs for items with sufficient stock** (stock >= required qty)
- SC Type: With Material / Without Material radio toggle

### Direct SC Order from SO (Skip MO)
- When SC checked in Create MO: SC Order created directly, no MO
- SC Order lines = first-level BOM components
- Consolidation: Same supplier + same SO merged into single SC order
- **FG/SA/PART name stored** on SC orders (fg_item_name field)

### Job Work / Subcontracting
- SC Order with edit, confirm, send DC, receive back
- **FG/SA/PART column** in JW orders table for traceability
- MO Number column + Item names in JW table
- Receipt auto-completes linked MO

### MRP
- Material Demand only shows items with **net_requirement > 0** (covered items filtered out)
- Dropdown shows **"Outstanding Sales Orders"** only (confirmed/planned/released/in_progress)
- Purchase Suggestions based on MRP demand

### Sales Orders
- Search box: Filter by order number, product name, BOM name
- Balance quantity in Create MO dialog
- SO edit blocked when full qty covered by MOs

### DC Print: Company header, RM Cost columns, Terms & Conditions box

### All Other Modules: Routings, Purchase Invoice, BOM, PO, GRN, Quality, Inventory, Settings, Customers, Suppliers, Stores, User Management

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
