# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## BOM Costing
- Extended Cost = Total/Unit × Qty (material + process, not material only)
- Process cost from: 1) SC job_work_parts.charges 2) WO operations.process_cost_per_unit
- SC creation pre-populates charges from previous SC for same item

## GRN
- Confirmation popup before receipt (shows total qty, total cost, inventory impact)
- Mandatory Invoice No + Date, Editable Cost/Unit, Total Cost column
- Works for PO-based and JW-based GRN

## Backlog
- [ ] Job Card outsource DC print format
- [ ] Purchase Invoice from GRN
- [ ] P1: GST Phase 2, P2: Backend refactoring
