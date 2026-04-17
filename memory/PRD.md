# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## GRN Flow
- SC with RM: Receive from GRN page → "Pending Job Work Orders for GRN" section
- SC without RM: Receive via PO-based GRN from GRN page
- GRN dialog works for both PO and JW orders (shared form, conditional labels)
- Mandatory: Invoice No + Date (both PO and JW GRN)
- Editable price per line

## BOM
- Routings at BOM level, Material Cost + Process Cost/Unit + Total/Unit in explosion
- Export/Import with routings, Child BOM edit
- Part/SA rate = BOM rollup cost (material + process)

## Backlog
- [ ] Job Card outsource DC print format
- [ ] Purchase Invoice from GRN with process cost
- [ ] P1: GST Phase 2, P2: Backend refactoring
