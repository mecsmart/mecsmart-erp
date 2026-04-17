# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Job Card Process (Feb 2026)
- **Inhouse**: Process cost/unit field → saved on operation → rolls up to BOM explosion
- **BOM Explosion**: Shows Material Cost, Process Cost, Total/Unit, Extended Cost columns
- **Work Centre**: Dropdown selector per operation at runtime
- **Outsource**: Confirmation dialog before outsourcing. SC shows only Part/SA (no RM). Same-supplier consolidation into single SC.
- **SC Type**: Operation outsource creates without_material SC with job_work_parts only, lines=[]

## BOM
- Routings at BOM level (parent_routings + components[].routings)
- Export/Import with routing columns
- Child BOM edit via "Edit BOM" button on SA rows

## Stock Rules
- DC: Per-item deduction, SC Receipt: job_work_parts only, WIP tracking

## Backlog
- [ ] P1: GST Phase 2
- [ ] P2: Backend refactoring
- [ ] P3: GST Phase 3, Barcode/QR, Gantt, Windows wrapper
