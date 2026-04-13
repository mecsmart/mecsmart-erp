# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS
- Auth: Custom JWT with roles (admin, production_manager, etc.)

## Key Features Implemented
- Multi-Level BOM with revision control, effectivity dates, alternate components
- BOM Explosion Tree View on main page with color-coded rows (FG/SG/RM/CP), expand/collapse
- MRP with demand calculation, PO suggestions, stock filtering, shortage-only SO list
- Quality inspection checklists, pass/fail tracking
- Manufacturing Orders with Job Cards, Routing, Work Centers
- Subcontracting: With/Without Material, Bulk SC from multiple MOs, DC creation/print
- DC Print: Job Work Parts (per-part charges) + Raw Materials Issued sections
- Sales Orders: Draft/Confirm/Cancel workflow, search, balance qty
- Purchase Orders: Create, Cancel, Recreate, status badges
- GRN module, Inventory/Stock management, Warehouse/Location management
- Customers, Suppliers, Items management
- Company Settings, User Management
- Excel Import/Export for BOMs and Items

## Completed (Latest Session - Apr 2026)
- Verified BOM Explosion Tree View on main page (21/21 tests passed)
- Verified Bulk SC job_work_parts pricing with per-part charges
- Fixed minor controlled/uncontrolled Select warning on BOM page

## Backlog
- [ ] P1: GST Phase 2 - GST-compliant invoice generation + tax breakup reports
- [ ] P2: Backend refactoring - server.py (5500+ lines) -> /routers/, /models/
- [ ] P3: GST Phase 3 - GSTR-1/3B report formats + ITC tracking
- [ ] P4: Barcode/QR code scanning for inventory transactions
- [ ] P5: Gantt chart visualization for work order scheduling
- [ ] P6: Windows desktop wrapper (Electron/Tauri)
