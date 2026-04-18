# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Job OS Flow (Final)
- Outsource ops → Consolidated SC (same supplier, dc_created=false)
- Send DC → "Job Work Order Cum Delivery Challan" print format
  - Columns: SL, Part No & Name, HSN, Qty, UOM, Charges/Unit, Total Charges, RM Cost/Unit, Total Amount
- NO PO for Job OS — Receive via GRN directly using JW number
- GRN page shows both SC with RM and Job OS pending orders

## SC with RM Flow
- SC → Send DC (HSN in print) → Receive via GRN from Stores page
- DC print: "Delivery Challan" with Part Details + RM sections

## BOM
- Extended Cost = Total/Unit × Qty (material + process)
- Process cost from SC charges (priority) + WO operations (fallback)

## Backlog
- [ ] Purchase Invoice from GRN with process cost
- [ ] P1: GST Phase 2, P2: Backend refactoring
