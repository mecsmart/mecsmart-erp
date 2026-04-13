# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### MRP
- Stock available = hidden from Material Demand
- **PO Status in Purchase Suggestions**: "PO Sent (qty)" green, "Partial (x/y)" yellow, "Pending" red
- Auto-remove after GRN receipt
- Sales Orders column: only shortage-contributing SOs
- Outstanding SOs only in dropdown

### Manufacturing Orders
- Job Card, SC marking on pending/in_progress MOs, tree view
- MO completion validation, auto-complete on SC receipt
- Child MOs: shortage qty only, skip if stock sufficient
- SC Type: With Material / Without Material
- Improved SC start error message with tip

### Job Work / Subcontracting
- FG/SA/PART column in SC orders and **Delivery Challans table**
- FG/SA/Part name in DC dialog title
- Create PO for without_material, No RM badge
- Receipt auto-completes linked MO

### DC Print: Company header, RM Cost, FG name, Terms & Conditions
### Sales Orders: Search, balance qty, SO edit lock
### All Other Modules: BOM, PO, GRN, Quality, Inventory, Settings, etc.

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
