# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB, JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Key Features Implemented
- Multi-Level BOM, MRP, Quality, Manufacturing Orders, Subcontracting
- SC Type: With/Without Material, Direct SC from SO, Consolidation
- MRP: PO Status badges, shortage-only SOs, auto-remove after GRN
- DC Print with company header, FG/SA/Part name, RM Cost, T&C
- SC Receipt: Accept/Reject/Rework handling, auto-complete MO
- Sales Orders: Search, balance qty, edit lock
- All modules: BOM, PO, GRN, Quality, Inventory, Settings, etc.

## Backlog
- [ ] GST Phase 2: Sales Invoicing
- [ ] Backend refactoring: server.py -> routers/
- [ ] GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
