# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## SC with RM Flow
- SC → Send DC (HSN in print) → **Receive GRN via JW** (mandatory invoice no/date, editable price)
- GRN adds FG/SA stock, tracks process cost, completes SC+MO
- job_work_parts includes bom_rollup_cost (material + process costs)

## SC without RM / Job Card Outsource Flow
- SC → Create PO → "Receive via GRN (PO-xxx)" from GRN page (stores person)
- BOM rollup cost on job_work_parts for accurate Part/SA pricing

## GRN Rules
- Supplier Invoice No: MANDATORY (both JW GRN and PO GRN)
- Invoice Date: MANDATORY
- Price/Rate: EDITABLE per line (can override SC charges at receive time)

## Job Card
- Inhouse: Process cost/unit, Work Centre dropdown
- Outsource: Consolidated SC, confirmation dialog, BOM rollup cost

## Backlog
- [ ] Job Card outsource DC print format
- [ ] Purchase Invoice from GRN with process cost
- [ ] P1: GST Phase 2, P2: Backend refactoring
