# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## SC with RM Flow (Revised Feb 2026)
- SC → Send DC (Job Work Order Cum DC) → **Receive GRN via JW number** (no PO)
- DC print: HSN column added to both Part Details and RM tables
- GRN: POST /api/job-work/receive-grn with process_charges per line
- GRN adds FG/SA stock, tracks total_process_cost
- Partial receive supported, SC completed when all parts received
- MOs auto-completed on full receive

## SC without RM / Job Card Outsource Flow
- SC → Create PO → GRN via PO flow

## Job Card
- Inhouse: Process cost/unit, Work Centre dropdown
- Outsource: Consolidated SC, Send DC (skip_stock_deduct), confirmation dialog

## BOM
- Routings at BOM level, Process Cost + Material Cost in explosion
- Export/Import with routings, Child BOM edit

## Backlog
- [ ] Job Card outsource DC print format (HSN, Charges/Unit, RM Cost/Unit)
- [ ] Purchase Invoice from GRN with process cost
- [ ] P1: GST Phase 2
- [ ] P2: Backend refactoring
