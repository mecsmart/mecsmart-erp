# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles

## Routing at BOM Level (Feb 2026)
- **Routing Screen**: Simple operation type names (LC Cutting, Welding, Assembly, etc.)
- **BOM Level**: 
  - `parent_routings`: Operations for the FG/SA item itself
  - `components[].routings`: Operations per component (SA, Parts)
  - RM items: no routing (dash)
  - Explosion endpoint includes routings per component
- **MO Creation**: 
  - No routing_id required (removed from dialog)
  - Operations auto-pulled from BOM
- **Job Card**: Work centre selected at runtime per operation

## Stock Rules
- DC: Per-item stock deduction
- SC Receipt: Only job_work_parts get stock
- GRN: No double-count on MO completion
- WIP Stock: Child MO stock of active parents = reserved

## MO Process
- "SC Done" for in_progress SC MOs
- No Sub-Contract in Create MO dialog
- SC auto-creates on confirm

## Backlog
- [ ] P1: GST Phase 2
- [ ] P2: Backend refactoring
- [ ] P3: GST Phase 3, Barcode/QR, Gantt, Windows wrapper
