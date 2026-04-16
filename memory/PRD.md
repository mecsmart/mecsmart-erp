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

## MO Process Rules (Feb 2026)
- Rule 1: SC button on parent MO is hidden if any child MO is started inhouse (in_progress) or actively outsourced
- Rule 2 (Smart RM Resolution): When SA/FG outsourced with_material:
  - Walks UP parent chain to find root FG MO, collects ALL MOs in the work order tree
  - Completed child part MOs → part itself appears in SC lines (already manufactured, sent as-is)
  - Uncompleted child parts (component or sub_assembly) → recursively resolved to leaf-level RM via BOM
  - RM deduplicated by item_id with quantities summed
  - Existing SC orders recalculated when create-sc called again (if no DC sent yet)
  - Applied to both create-sc and bulk-subcontract endpoints

## Key Features
- Multi-Level BOM, MRP (smart RM with MO reservation), Quality
- MO Reserve/Unreserve material functionality
- SC Consolidation per supplier, DC draft flow, PO from SC
- Sales Orders, Purchase Orders/Invoices, GRN, Inventory, Stores
- Search on all major pages, Collapsible sidebar groups

## Backlog
- [ ] P1: GST Phase 2 - invoice generation + tax breakup reports
- [ ] P2: Backend refactoring - server.py -> /routers/
- [ ] P3: GST Phase 3 - GSTR-1/3B + ITC tracking
- [ ] P4: Barcode/QR scanning for inventory
- [ ] P5: Gantt chart for work order scheduling
- [ ] Future: Windows desktop wrapper (Electron/Tauri)
