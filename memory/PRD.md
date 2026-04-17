# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Job OS Flow (Updated)
- Consolidation: Same supplier across ALL MOs → single SC order
- Send DC: skip_stock_deduct=true, updates job_work_parts.sent_quantity + dc_created
- DC print: "Job Outsource DC" title, Part Details only (no RM section)
- Receive: via GRN page (stores person)

## SC with RM Flow
- DC print: "Delivery Challan" with both Part Details + RM sections, HSN columns
- Receive: via GRN page, mandatory Invoice No + Date, editable Cost/Unit

## BOM
- Extended Cost = Total/Unit × Qty (material + process)
- Process cost from SC charges + WO operations
- SC pre-populates previous charges

## Backlog
- [ ] Purchase Invoice from GRN with process cost
- [ ] P1: GST Phase 2, P2: Backend refactoring
