# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## Routing at BOM Level (Feb 2026)
- Routing Screen: Simple operation type names
- BOM Level: parent_routings + components[].routings
- Explosion: Returns routings + child_bom_id per component
- Display: flattenRows includes routings + child_bom_id
- SA/Part rows with own BOM show "Edit BOM" button to edit child BOM
- MO Creation: No routing_id required, operations from BOM

## Stock Rules
- DC: Per-item stock deduction
- SC Receipt: Only job_work_parts get stock
- GRN: No double-count
- WIP Stock: Child MO stock of active parents = reserved

## Backlog
- [ ] P1: GST Phase 2
- [ ] P2: Backend refactoring
- [ ] P3: GST Phase 3, Barcode/QR, Gantt, Windows wrapper
