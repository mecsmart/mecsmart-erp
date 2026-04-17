# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## Routing Redesign (Feb 2026)
- **Routing Screen**: Simple operation type definitions (name, description, status). E.g., "LC Cutting", "Welding", "Assembly"
- **BOM Level**: Operations defined per BOM with sequence, operation_name, setup/run times
- **MO Creation**: Operations pulled from BOM's operations array (not from routing)
- **Job Card**: Work centre selected at runtime when starting each operation

## Stock Accounting Rules
- DC Creation: Each item deducted from ITS OWN current_stock
- with_material SC Receipt: ONLY adds stock for job_work_parts items
- without_material SC via GRN: Stock added at GRN line level only
- WIP Stock: Completed child MOs of active parents = WIP (not available for new MOs)

## MO Process Rules
- SC button hidden when MO started inhouse
- "SC Done" label (muted gray) shown for in_progress SC MOs
- SC dialog auto-creates SC order, shows JW order details
- No Sub-Contract option in Create MO dialog (all SC at MO level)

## Key Features
- Multi-Level BOM, MRP, Quality, MO Reserve/Unreserve
- SC Consolidation, DC draft flow, PO from SC
- Sales Orders, Purchase Orders/Invoices, GRN, Inventory, Stores

## Backlog
- [ ] P1: GST Phase 2 - invoice generation + tax breakup
- [ ] P2: Backend refactoring - server.py -> /routers/
- [ ] P3: GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
