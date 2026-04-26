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
- **2026-02-25** — **Inline master-field editing on Inventory page (P0 batch):**
  1. **Master fields gated by `items.edit`:** Inventory inline edit dialog now also exposes Name, Group, HSN, GST%, and price fields when the user has `items.edit` / `items.create`. Without those perms, only stock fields show. Backend whitelist enforces the same tiers — master keys are silently dropped if the user lacks `items.*`.
  2. **Category-aware price fields:** Raw Material → Purchase Price + Sale Price (purchase_price auto-syncs `unit_cost` to keep BOM rollups consistent). FG / SA / Component → Sale Price only, with a note that unit cost rolls up from BOM.
  3. **Removed legacy "Unit Cost"** input from the inline dialog. Title relabeled "Edit Item — {part_number}" and Save button to "Save Changes".
  4. **Group HSN/GST inheritance:** selecting an Item Group with defaults locks HSN/GST inputs and shows a "(from group)" badge — mirrors the full Items page.
- **2026-02-25** — **Stock search bandwidth + MRP decimals + inline stock edit (P0 batch):**
  1. **Search bandwidth & coverage:** `/api/inventory` limit raised from 1000 → 50000. Inventory and Stores Stock client-side search now filter across `part_number`, `name`, `description`, `hsn_code`, `category`, group `name` and `code` (was only part_number/name).
  2. **MRP→PO decimal display:** `fmtQty` no longer strips trailing zeros — always emits 2 decimals (e.g. 5 → "5.00", 5.2 → "5.20", 5.234 → "5.23"). Applies to all qty/cost columns in Demand & Suggestions tabs.
  3. **Inline Stock Edit dialog (no more screen-switching):** Inventory Edit pencil now opens an in-page dialog with whitelisted fields only (`current_stock`, `safety_stock`, `reorder_point`, `lead_time_days`, `unit_cost`). New backend `PUT /api/inventory/items/{id}/stock-fields` enforces a strict whitelist, accepts `items.*` OR `inventory.*` perms, and emits a `transaction_type=adjust` / `reference_type=stock_edit` audit log when `current_stock` changes. A small italic link still routes to `/items?action=edit&id=…` for users needing full master edit.
- **2026-02-25** — **BOM panel collapse + Inventory perms + Group filter (P0 batch):**
  1. **BOM page panel collapse:** all 222 top-level BOM panels (FG, SA, CP, RM) now render COLLAPSED by default (chevron-right). Click the header to expand the explosion table and 'Other revisions' block. Action buttons (Refresh / Print / Export / View / Edit / Revise / Delete) all use `e.stopPropagation()` to avoid toggling the panel.
  2. **Inventory page item-master perm fix:** `canCreateItem` / `canEditItem` now use live `hasPermission()` from `AuthContext` and accept `items.*` OR `inventory.*` permissions. Granting "Inventory Edit" to a custom role now unlocks the Edit pencil + Create Item button. Same change applied to `ItemsPage.canEdit`/`canDelete` so the deep-link auto-opens the dialog regardless of which permission family was granted.
  3. **Group + Category filter on Stock pages:** `InventoryPage` (Stock tab) and `WarehousesPage` (Stock tab) now expose Group filter dropdowns sourced from `/api/item-groups`, alongside the existing Category filter. Field name is `item.group_id` (verified live). Clear button resets all filters.
- **2026-02-25** — **MO tree dedup + Inventory item shortcuts (P0 batch):**
  1. **Manufacturing page MO duplicate fix:** previously, child MOs could appear BOTH nested under their parent SA AND as standalone top-level MOs (often due to status-filter making the parent invisible while children remained, or any malformed `parent_wo_id`). New rendering walks every filtered WO up through `parent_wo_id` to its true root, dedupes by id (`rootIdSet`), and renders each root once. Inside `renderMORow` a `renderedIds` Set guarantees a child is never drawn twice in the same tree. Verified: 222 unique top-level MOs, 51 children all nested with `└→`, even under status filter.
  2. **Inventory ↔ Items deep-link:** `InventoryPage` Stock tab now has a "Create Item" button (top-right) and per-row "Edit" pencil. Both navigate to `/items?action=new` or `/items?action=edit&id=...`. New `useEffect` in `ItemsPage` reads the query string and auto-opens the matching create/edit dialog (then strips the query). Permission gating: `Create Item` shown for `admin` or `items.create`; `Edit` pencil for `items.edit` (or `create`/`admin`).
- **2026-02-25** — **Partial GRN + PO Short-Close + MRP description (P0 batch):**
  1. **Partial GRN flow:** `POST /api/grn` no longer flips every PO to `received`. Each call cumulatively updates the matching PO line's `received_quantity`; PO status becomes `partial` until every line is fully received, then flips to `received`. Lines with `received_quantity = 0` are skipped (kept for next GRN). The PO stays in `/api/grn/pending-pos` until fully received.
  2. **Short-Close PO:** new `POST /api/purchase-orders/{po_id}/short-close` (with optional `reason`) marks the PO as `short_closed`. Used when a supplier denies further supply. Released qty no longer counts in MRP existing-PO calc, so MRP suggestions reappear for the shortage.
  3. **MRP demand counts partial POs:** existing-PO calc in `/api/mrp/demand` now includes `partial` (so pending qty on a partial PO IS treated as "already ordered"). `/api/purchase-orders/from-mrp` existing-PO calc excludes `short_closed` so the freed qty becomes orderable again.
  4. **MRP→PO description auto-fill:** backend `from-mrp` populates `lines[].description` from `item.description` (fallback to `item.name`). Frontend MRP dialog renders an italic dashed-border description input per line, pre-filled and editable.
  5. **Frontend GRN dialog redesign:** new columns "Ordered / Already Recd / Pending / Recd Now". Lines fully received are filtered out. "Pending POs for GRN" list shows a `Partial` badge.
  6. **Frontend PO page:** Lock-icon "Short Close" button on `draft|approved|sent|partial` POs opens a confirmation dialog with reason textarea. Status filter has new "Short Closed" option; status badge shows "Short Closed".
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
