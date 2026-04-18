# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Job OS Flow (Final)
- Outsource ops → Consolidated SC (same supplier, dc_created=false). Charges are per-unit (NOT summed when same item appears twice).
- Send DC → "Job Work Order Cum Delivery Challan" print format (Job OS ONLY)
  - Columns: SL, Part No & Name, HSN, Qty, UOM, Charges/Unit, Total Charges, RM Cost/Unit, Total Amount
- NO PO for Job OS — Receive via GRN directly using JW number
- GRN page shows both SC with RM and Job OS pending orders
- Job Card: For outsourced ops, Stop/Complete buttons hidden; "Outsourced — Receive via GRN" badge shown instead.

## SC with RM Flow
- SC → Send DC (HSN in print) → Receive via GRN from Stores page
- DC print: "Delivery Challan" with 6-col Part Details + RM Issued sections (NOT 9-col Job OS format)

## Changelog
- 2026-02-18: Fixed Job OS regressions — (a) consolidation no longer doubles per-unit charges, (b) DC print format now conditional (9-col for Job OS, 6-col for standard SC with RM), (c) Job Card hides Stop/Complete for outsourced ops. Tested & verified in iteration 50.

## BOM
- Extended Cost = Total/Unit × Qty (material + process)
- Process cost from SC charges (priority) + WO operations (fallback)

## Backlog
- [ ] Purchase Invoice from GRN with process cost
- [ ] P1: GST Phase 2, P2: Backend refactoring
