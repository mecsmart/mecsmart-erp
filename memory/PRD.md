# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## SC with RM Flow
- SC → Send DC (HSN in print) → Receive via GRN from **Stores/GRN page** (not JW page)
- JW page shows "Receive via GRN (JW-xxx)" info label
- GRN page has "Pending Job Work Orders for GRN" section
- Mandatory: Invoice No + Date, Editable price per line
- Part/SA rate = BOM rollup cost (material + process), not unit_cost

## SC without RM / Job Card Outsource
- SC → Create PO → "Receive via GRN (PO-xxx)" from GRN page

## BOM Rollup Cost
- calc_bom_rollup: sum(comp_qty × comp_unit_cost) + process_cost from completed WOs
- Used in: SC lines rate, job_work_parts bom_rollup_cost, BOM explosion

## Backlog
- [ ] Job Card outsource DC print format
- [ ] Purchase Invoice from GRN with process cost
- [ ] P1: GST Phase 2, P2: Backend refactoring
