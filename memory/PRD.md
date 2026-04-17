# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## Routing Redesign (Feb 2026)
- **Routing Screen**: Simple operation type names (LC Cutting, Welding, Assembly, Bending, etc.)
- **BOM Level**: Each BOM has:
  - `parent_routings`: Operations for the FG/SA item itself (e.g., ["Assembly"])
  - `components[].routings`: Operations per component (e.g., PT-1: ["LC Cutting", "Bending"])
  - RM items: no routing (empty array, shown as dash)
- **MO Creation**: Operations pulled from BOM:
  - Main MO: from bom.parent_routings
  - Child MOs: from parent_bom.components[].routings
- **Job Card**: Work centre selected at runtime per operation

## Stock Accounting Rules
- DC Creation: Per-item current_stock deduction
- with_material SC Receipt: Only job_work_parts items get stock
- without_material via GRN: No double-count on MO completion
- WIP Stock: Completed child MOs of active parents = reserved

## MO Process Rules
- "SC Done" label for in_progress SC MOs
- No Sub-Contract in Create MO dialog
- SC dialog auto-creates SC order
- Smart RM Resolution for SA outsourcing

## Backlog
- [ ] P1: GST Phase 2 - invoice generation + tax breakup
- [ ] P2: Backend refactoring - server.py -> /routers/
- [ ] P3: GST Phase 3, Barcode/QR, Gantt chart, Windows wrapper
