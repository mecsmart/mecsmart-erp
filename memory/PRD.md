# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## MRP Logic (Updated Apr 2026)
- Shows ONLY Raw Materials
- Calculates RM demand by netting off SA/Part available stock:
  - For each SO, explode FG BOM
  - For SA/Parts: Available Stock - Reserved (running MOs) = Net Available
  - If SA/Part stock covers need → no RM demand from that path
  - If shortage → explode shortage qty through SA/Part BOM to find RM needs
- Suggestions also filtered to RM only

## Key Features
- Multi-Level BOM, MRP (smart RM netting), Quality, Manufacturing Orders
- SC Consolidation per supplier, DC draft flow, PO from SC with proper pricing
- Sales Orders, Purchase Orders/Invoices, GRN, Inventory, Stores
- Search on all major pages, Collapsible sidebar groups

## Backlog
- [ ] P1: GST Phase 2 - invoice generation
- [ ] P2: Backend refactoring - server.py -> /routers/
- [ ] P3: GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
