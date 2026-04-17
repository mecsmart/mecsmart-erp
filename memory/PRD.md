# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Phase 1 Complete (Feb 2026)
### SC with RM Flow
- SC → Send DC (deducts RM stock) → Create PO → Receive via GRN (adds FG stock, completes SC+MO)
### SC without RM Flow
- SC → Create PO → Receive via GRN
### Job Card Outsource Flow
- Outsource operation → Consolidated SC (Part/SA only, no RM) → Send DC (skip_stock_deduct) → Create PO → GRN
### Inhouse Process
- Select WC → Operator → Process Cost/Unit → Complete → Auto-complete MO if last op

## BOM
- Routings at BOM level, Process Cost + Material Cost + Total/Unit in explosion
- Export/Import with routings, Child BOM edit

## Stock Rules
- DC: Per-item deduction (skipped for Job Card outsource)
- SC Receipt via GRN (not direct receipt)
- WIP Stock tracking

## Backlog
- [ ] P1: GST Phase 2
- [ ] P2: Backend refactoring
- [ ] P3: DC print format for Job Card outsource (HSN, Charges/Unit, RM Cost/Unit, Total)
