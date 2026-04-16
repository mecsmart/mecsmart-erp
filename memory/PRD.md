# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## MRP Logic (Updated Apr 2026)
- Shows ONLY Raw Materials (RM)
- Formula: Net = SO Gross Req - max(Current Stock - Reserved for MOs - Safety Stock, 0)
- Reserve flow: Pending MO -> Reserve button -> BOM exploded recursively -> reserved_materials stored on MO
- MRP reads reserved_materials from all reserved MOs to compute reserved_for_mo per RM item
- "Reserved (MO)" column in MRP demand table shows reserved qty
- Suggestions also filtered to RM only

## MO Process Rules (Feb 2026)
- Rule 1: SC button on parent MO is hidden if any child MO is started inhouse (in_progress) or actively outsourced
- Rule 2: When SA outsourced with_material, SC lines contain only leaf-level RM (recursively resolving through child SA BOMs, deduplicating by item_id)

## Key Features
- Multi-Level BOM, MRP (smart RM with MO reservation), Quality
- MO Reserve/Unreserve material functionality
- SC Consolidation per supplier, DC draft flow, PO from SC
- Sales Orders, Purchase Orders/Invoices, GRN, Inventory, Stores
- Search on all major pages, Collapsible sidebar groups
- Manufacturing process rules: SC visibility control, recursive RM resolution for SA outsourcing

## Backlog
- [ ] P1: GST Phase 2 - invoice generation + tax breakup reports
- [ ] P2: Backend refactoring - server.py -> /routers/
- [ ] P3: GST Phase 3 - GSTR-1/3B + ITC tracking
- [ ] P4: Barcode/QR scanning for inventory
- [ ] P5: Gantt chart for work order scheduling
- [ ] Future: Windows desktop wrapper (Electron/Tauri)
