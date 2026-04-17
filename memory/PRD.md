# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## BOM Export/Import (Feb 2026)
- Export: Includes Parent Routings + Component Routings columns
- Export per BOM: Download icon on each BOM header exports just that BOM
- Import: Parses routings from new columns, backward compatible with old format
- Format: Parent PN, Name, Rev, Status, Parent Routings, Comp PN, Name, Qty, Comp Routings, Is Alt, Effectivity

## Routing at BOM Level
- Routing Screen: Simple operation type names
- BOM: parent_routings + components[].routings
- SA rows show "Edit BOM" button to edit child BOM
- MO: Operations from BOM, no routing_id needed

## Job Card
- Work Centre: Dropdown to select WC per operation before/during start
- Selected WC saved to operation on start
- Already-assigned WC shown as text

## Backlog
- [ ] P1: GST Phase 2
- [ ] P2: Backend refactoring
- [ ] P3: GST Phase 3, Barcode/QR, Gantt, Windows wrapper
