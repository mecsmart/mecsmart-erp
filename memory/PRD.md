# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## BOM Process Cost (Updated)
- Process cost sources (priority order):
  1. SC order job_work_parts.charges (outsource process cost from latest SC)
  2. Completed WO operations.process_cost_per_unit (inhouse process cost)
- Always shows last updated cost
- Explosion: Material Cost + Process Cost/Unit + Total/Unit + Extended Cost

## GRN
- Header: Cost/Unit (editable), Total Cost column (auto-calculated)
- Grand Total row at bottom
- Mandatory: Invoice No + Date
- Works for both PO-based and JW-based GRN

## Backlog
- [ ] Job Card outsource DC print format
- [ ] Purchase Invoice from GRN with process cost
- [ ] P1: GST Phase 2, P2: Backend refactoring
