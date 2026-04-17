# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Job Card Process (Feb 2026)
- **Inhouse**: Process cost per unit field on start/complete. Rolls up to BOM explosion costing (material + process = total)
- **Work Centre**: Dropdown to select WC per operation at runtime
- **Outsource Consolidation**: Multiple outsourced operations to same supplier → single SC order + DC. Lines merged, charges summed.

## BOM Export/Import
- Export with Parent Routings + Component Routings columns
- Per-BOM export via download icon
- Import parses routing columns, backward compatible

## Routing at BOM Level
- Routing Screen: Simple operation type names
- BOM: parent_routings + components[].routings
- SA/Part rows show "Edit BOM" button for child BOM editing
- MO: Operations from BOM, no routing_id needed

## Backlog
- [ ] P1: GST Phase 2
- [ ] P2: Backend refactoring
- [ ] P3: GST Phase 3, Barcode/QR, Gantt, Windows wrapper
