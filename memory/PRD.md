# MecSmart ERP — PRD

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for Windows platform (branded as **MecSmart ERP**).

## Core Requirements
- Advanced BOM with revision control, alternate components, hierarchical explosion, and **multi-level tree export (including routings & routing costs)**.
- Advanced MRP with lead times, safety stock, and PO suggestions.
- Quality inspection checklists.
- JWT-based custom auth with roles + **granular permission groups (admin auto-elevation when user has all perms or is in admin-group)**.
- Procurement, Stores, Subcontracting/Job Work flows.
- CRM Module (Quotations, Proforma Invoices, Tax Invoices, Packing Lists).
- GST-compliant tax invoices (CGST/SGST/IGST logic based on Place of Supply).
- Direct Excel import/export (server-side, `openpyxl`).

## Tech Stack
- **Backend:** FastAPI (monolithic `server.py` — P4 refactor pending), MongoDB (Motor)
- **Frontend:** React + React Router + TailwindCSS + shadcn/ui
- **Auth:** JWT custom (cookie-based), 10 min idle timeout
- **Excel:** `openpyxl` (server-side only)

## Changelog (recent)
- **2026-02-25** — **MRP & SO→MO P0 batch (5 fixes):**
  1. **SO→MO "Created 0 work order(s)" fix:** `create_wo_for_item` now falls back to `BOM.parent_routings` when no separate `db.routings` doc exists, for both main and child MOs. `routing_id` is honored when explicitly passed; otherwise we resolve operations from BOM. Verified end-to-end (4 WOs from SO-000237 incl. children).
  2. **MRP "Create PO" from Material Demand tab:** added checkbox column (with select-all), banner with "Create Purchase Order" button — items with `net_requirement > 0` and `po_status != po_sent` are eligible.
  3. **MRP decimals:** new `fmtQty()` helper rounds qty/cost displays to 2 decimals and strips trailing zeros, applied across Demand & Suggestions tabs.
  4. **MRP→PO dialog redesign:** widened to `max-w-5xl`, ported `po-lines-compact` CSS from manual PO page (hidden number-input spinners, exact column %s), editable HSN/Qty/UOM/Rate/GST per line, per-row remove button, totals footer.
  5. **MRP→PO supplier search:** replaced static `<Select>` with `SearchableSelect` (typeahead by name/code/GSTIN), matching the manual PO supplier picker.
- **2026-02-23** — **BOM export rewrite:** now produces full multi-level tree (depth-first) with `Level`, per-row parent & component routing counts, routing cost totals, and a second "Routings Summary" sheet aggregating every routing by name × scope with total cost contribution.
- **2026-02-23** — **Centralized permission fix:** `get_current_user` now overlays role-group permissions and auto-elevates `role="admin"` whenever a user either (a) belongs to an admin-flagged role-group or (b) holds every CRUD action on every module in `ALL_MODULES`. This unblocks all 55 hardcoded `user["role"] not in […]` guards without touching each site.
- **2026-02-23** — Supplier code auto-generation now works from UI: `required` removed, placeholder says "Leave blank to auto-generate". Backend already picks from `supplier_code` number-series.
- **2026-02-23** — Purchase Orders / Suppliers / Purchase Invoices `canEdit` switched from hardcoded role list to `hasPermission(module, 'create'|'edit')`. Custom roles now see Create buttons.
- Added dedicated `/inventory/configuration` page (Item Groups + PO default T&C moved from Settings).
- Manual PI: Supplier + line Item switched to search-as-you-type (`SearchableSelect` / `SearchableItemSelect`). Fixed dropdown clipping (`overflow-visible`).
- Manual GRN endpoint `POST /api/grn/manual` + universal inline searchable selects across SO, GRN, Quotation, TI, Support Ticket.
- Item Groups (cascading HSN/GST to items).
- GST-compliant Tax Invoices (CGST/SGST/IGST + HSN summary + UPI QR).
- Number Series compact FY format (e.g. INV262700001).
- Session idle timeout 10 min + auto-sliding.
- Rebranded globally to **MecSmart ERP**.

## Roadmap / Backlog
- **P2** GSP e-Invoice integration (IRN + signed QR from GST portal).
- **P3** Dispatch Manager panel.
- **P4** Refactor `/app/backend/server.py` (>10k lines) into routers (`auth.py`, `inventory.py`, …).
- **P5** GST Compliance Phase 3 — GSTR-1/3B report formats + ITC tracking.
- **P6** Barcode/QR scanning for inventory transactions.
- **Future** Windows desktop wrapper (Electron/Tauri).

## Key Files
- `/app/backend/server.py` — all APIs (refactor pending). `get_current_user` (line ~885) handles permission elevation centrally. `bom_router.get("/export/excel")` (line ~6076) recursive BOM tree exporter.
- `/app/frontend/src/pages/InventoryConfigurationPage.js` — dedicated Config page.
- `/app/frontend/src/components/{SearchableSelect,SearchableItemSelect}.jsx` — universal typeahead.
- `/app/frontend/src/components/Layout.js` — sidebar nav.

## Test Credentials
See `/app/memory/test_credentials.md`.
