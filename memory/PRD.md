# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## MRP Logic (Updated Apr 2026)
- Shows ONLY Raw Materials (RM)
- Formula: Net = SO Gross Req - max(Current Stock - Reserved for MOs - Safety Stock, 0)
- Reserve flow: Pending MO → Reserve button → BOM exploded recursively → reserved_materials stored on MO
- MRP reads reserved_materials from all reserved MOs to compute reserved_for_mo per RM item
- "Reserved (MO)" column in MRP demand table shows reserved qty
- Suggestions also filtered to RM only

## Key Features
- Multi-Level BOM, MRP (smart RM with MO reservation), Quality
- MO Reserve/Unreserve material functionality
- SC Consolidation per supplier, DC draft flow, PO from SC
- Sales Orders, Purchase Orders/Invoices, GRN, Inventory, Stores
- Search on all major pages, Collapsible sidebar groups

## Backlog
- [ ] P1: GST Phase 2 - invoice generation
- [ ] P2: Backend refactoring - server.py -> /routers/
- [ ] P3: GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
