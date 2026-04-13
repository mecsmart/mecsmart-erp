# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Implemented Features

### MRP (Material Requirements Planning)
- **Stock available = hidden**: Items with on_hand >= gross_requirement excluded from MRP
- **PO Status tracking**: "PO Sent" (green), "Partial PO" (yellow), "Pending" (red) badges
- **Auto-remove after receipt**: GRN replenishes stock → item disappears from MRP
- Sales Orders column: only shows SOs contributing to shortage
- Dropdown: "Outstanding Sales Orders" only
- Purchase Suggestions with create PO flow

### Manufacturing Orders
- Collapsible FG->SA->PART tree view, Job Card, SC marking on pending/in_progress MOs
- MO completion validation, auto-complete on SC receipt
- Child MOs: shortage qty only, skip if stock sufficient
- SC Type: With Material / Without Material

### Direct SC Order from SO, Consolidation
### Job Work: FG/SA/PART column, "Create PO" for without_material, "No RM" badge
### DC Print: Company header, RM Cost, Terms & Conditions
### Sales Orders: Search, balance qty, SO edit lock
### All Other: Routings, Purchase Invoice, BOM, PO, GRN, Quality, Inventory, Settings, Customers, Suppliers, Stores, User Management

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
