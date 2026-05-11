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
- **2026-05-11 (late)** — **Major SO/MO Workflow Restructure (P0):**
  1. **Sales Order simplified** — MTS/MTO removed from SO entirely. SO is now a pure customer-demand record. Step 1 = optional "From Quotation" picker; Step 2 = Order Lines. Customer details block appears readonly when quotation is linked.
  2. **SO line "Reserve / Release Stock" toggle** — new `POST /api/production/{id}/reserve-line` and `/release-line` endpoints. Reserves only the **parent FG/SG/CP item** on the line (NO BOM explosion, per user spec). Each SO line carries `is_reserved` + `reserved_qty` + `reserved_at`. Stock validated against `current_stock - reserved_stock` before booking. UI shows Lock/Unlock button per line with "RESERVED X" badge.
  3. **SO Preview + PDF download** — new `GET /api/production/{id}/print-data` endpoint hydrates customer + company + creator + line items + linked-quotation rates. New Eye + Download icon buttons on every SO row. PDF renders SALES ORDER template with company header, customer block (GSTIN, address), order details, line table (Qty, UOM, Rate, Amount), subtotal, signature block. Uses existing `downloadHtmlAsPdf` helper. Currency symbol pulled from linked quotation.
  4. **Manufacturing Order MTS/MTO selector** — Step 1 = Order Type (MTS/MTO radio cards). 
     - **MTS**: direct item picker (FG / SG / Component items with active BOM). No SO link. `production_order_id` = "".
     - **MTO**: SO picker → SO line picker (for multi-line SOs). Auto-fills qty (SO balance) + due date.
     - Backend: `WorkOrderCreate.production_order_id` is now Optional; new `order_type`, `item_id`, `source_so_line_id`, `due_date` fields.
  5. **Removed auto-reservation on MO create** — `create_child_work_orders` no longer increments `reserved_stock` on creation. The old in-stock auto-reserve / shortage auto-reserve blocks deleted.
  6. **New `POST /api/work-orders/{id}/release` endpoint** — user-driven "Release" button on pending main MOs. Explodes one BOM level on the MO's item and reserves all required child components (`$inc reserved_stock`). Records `child_reservations[]` on the WO. Status flips `pending` → `released`. UI shows "RELEASED" badge after reserve.
  7. **MO Cancel via PUT status=cancelled** now also releases `child_reservations` (previously only the SO-cascade-cancel path did this).
  8. **Material consumption on `/start`** continues to release per-component reservations (already implemented in a prior iteration).

- **2026-05-11** — **Phase 1 of MTS/MTO redesign + Quotation→SO prefill (P0 — 12/12 tests passed):**
  1. **New `MTS/MTO` semantics enforced.** SO line `order_type` default flipped from `auto` → `mts`. Legacy `auto` is accepted on POST `/api/production` but normalised to `mts` (validation message: `mts | mto`). The `/confirm` flow already implemented the new rules in a prior fork: **MTS** ignores FG stock (always produces full SO qty, child SG/parts reserved at MO create), **MTO** uses available FG stock first (reserves it), MO covers the shortfall with child reservations on top.
  2. **New `GET /api/crm/quotations/{qid}/balance` endpoint** — returns per-line balance qty = `original_qty - Σ(qty already issued via non-cancelled SOs)`, hydrated with active BOM, item details, and customer info. Powers the new "From Quotation" picker on the SO form.
  3. **Per-line `source_quotation_line_no`** persisted on `ProductionOrderLine`. Tracks which quotation line each SO line came from so the balance helper can deduct correctly even when one quotation feeds multiple SOs.
  4. **`source_quotation_id` + `source_quotation_no` on SO doc.** Stored when a user creates an SO via the new "From Quotation" dropdown (and by the existing CRM "Convert to SO" button). Surfaced as a small "from QUO-…" badge under the SO number in `/production` list view.
  5. **Partial → Full conversion tracking.** `_refresh_quotation_conversion_status` is called after each SO create — it appends the SO id to `converted_so_ids[]` (kept in addition to legacy singular `converted_so_id`). Quotation status auto-flips to `converted` only when every line balance reaches 0. Cancelling a sourced SO restores the balance because cancelled SOs are excluded from the consumed_qty sum (no re-write of quotation status, but the next read of `/balance` returns the freed qty).
  6. **`ProductionPage.js` UI:** New "From Quotation (optional)" yellow block above Order Lines on the Create dialog. Type-ahead search by quotation_no or customer name; clicking a quotation calls `/balance` and pre-fills:
     - Customer (display only — the picked quotation's customer is shown as the linked pill)
     - One SO line per balance-positive quotation line, with `bom_id` resolved from the active BOM, `quantity` = ceil(balance_qty), `due_date` = today (editable), `order_type` = `mts` (editable), `source_quotation_line_no` = quotation line_no
     - Skips lines with no active BOM and toasts the skipped part_numbers
     - "Clear link" pill button unlinks the quotation without wiping user-edited lines
  7. **Tests:** `/app/backend/tests/test_iteration_97_quotation_so_prefill.py` — 12/12 PASS covering: balance endpoint, SO create with source quotation, partial vs full conversion status flip, cancel-restores-balance, MTS/MTO confirm rules, child reserved_stock increment/release, legacy auto compat, validation, SO list shows source_quotation_no. Frontend Playwright pass for prefill + dropdown + clear-link + badge.

- **2026-05-07** — **Stores Packing List role-group permission + earlier BOM fixes verified:**
  1. **New permission module `stores_packing_list`** added to `/app/backend/core/permissions.py` (full CRUD actions). Exposed via `/api/users/modules` and selectable in the Role Group matrix under the **Stores** group (`UserManagementPage.js`). The Stores → Packing Lists sidebar link (`Layout.js`) and tab content (`WarehousesPage.js`) now gate on `stores_packing_list.view`; Generate/Edit/Status-change controls require `create` or `edit`; Delete requires `delete` (existing logic via `canEdit`). The CRM-Marketing Packing List entry continues to use `crm_marketing` (kept untouched).
  2. **BOM Print popup-blocker fallback** (previous session) — verified.
  3. **BOM Process / Rollup cost visibility** now uses `hasPermission('bom_process_cost'|'bom_rollup_cost', 'view')` (previous session) — verified.
- **2026-05-06 (very late)** — **Quotation Bulk + Global Discount + Items page scroll preservation:**
  1. **Bulk Line Discount.** New input next to "Add Line" in the Quotation form — typing a `%` value and pressing Enter (or blur) sets `discount_pct` on every existing line in one click and toasts the result. Saves time on "10% across the board" style quotes.
  2. **Global (footer) Discount.** Quotations now persist `global_discount_type` ("amount" | "percent") + `global_discount_value`. The discount is applied on the post-line-discount subtotal, BEFORE GST. CGST/SGST/IGST split is scaled proportionally so the printed GST split always sums back to the actual taxed amount. Print template shows new "Global Discount (X%)" + "Net Subtotal" rows when applicable. Backend clamps over-large discounts so grand_total can't go negative.
  3. **Items page in-place updates.** `handleSubmit` now does an optimistic patch to `setItems` (PUT) or prepend (POST) instead of a full `fetchItems()` refetch. Scroll position preserved end-to-end. Same fix applied to InventoryPage's Stock Edit save (`saveStockEdit` → `setInventory` patch).
  4. **Items page initial load uses `?lite=1`.** Combined with the BOM picker work, this trims ~30% off the catalogue payload and avoids re-downloading audit/created_by fields the table never displays.
- **2026-05-06 (late)** — **Quotation print crash + UOM integrity + group-wise item export + import perm gate + BOM speed:**
  1. **Quotation/Proforma/Tax-Invoice print crash fixed.** `printInvoiceDoc` referenced the React-scope `user` variable from a module-level helper → `ReferenceError: user is not defined`. Replaced with the `signer` / `currentUser` locals it already builds. All three doc types print again.
  2. **UOM master integrity.** Backend now rejects `DELETE /api/settings/uoms/{id}` if any item references the UOM (HTTP 400 with the count). Frontend surfaces the friendly message via sonner.
  3. **UOM mandatory at item creation.** Backend `POST /api/items` validates `unit_of_measure` is non-empty AND exists in `db.uoms`; frontend marks the field with a red `*` and toasts on empty submit.
  4. **Group-wise Item Excel export.** New `?group_id=` filter on `GET /api/items/export/excel` (also combinable with `?category=`); the Items page Export dropdown grew an **Export by item group** submenu listing every Item-Group entry. Filename includes the group code.
  5. **Item Import permission gate.** Frontend Import button is hidden unless the user has `items.create` permission (mirrors backend `_require_access` which already enforced it). Removes phantom buttons that 403'd on click.
  6. **BOM picker speed-up — `?lite=1`.** New slim projection on `GET /api/items` returning only picker-relevant fields (no audit fields, no extras). BOMPage now opens via `/api/items?lite=1`. Measured ~27 % payload shrink on a 558-SKU catalogue (more on bigger ones).
  7. **BOM Add-Component scroll fix.** `addComponent()` now uses a dual-strategy scroll: `rAF → dialogScrollRef.scrollTo({top: scrollHeight})` AND sentinel `scrollIntoView`. The previous one-shot under-shot ~1 row when layout hadn't settled. New row is fully visible regardless of list length.
- **2026-05-06** — **UOM decimal precision + BOM dialog UX:**
  1. **UOM master gained `decimal_places`** (0–6, default 2, clamped server-side). New shared frontend helper `formatQty(qty, uomCode, uomsList)` in `/app/frontend/src/utils/uomFormat.js` looks up the UOM's precision and renders quantities consistently. Applied to Inventory Stock table (current/safety/reorder + warehouse breakdown), Items table Stock column, and BOM rollup grids. Settings → UOM tab grew a "Decimals" column + numeric input (`uom-decimal-places-input`).
  2. **BOM Create/Edit dialog hardened.** Escape key, outside-click and Radix `interactOutside` events all `preventDefault()`, so accidental clicks no longer wipe unsaved component edits. Closing now only happens via Cancel / Save / X.
  3. **Add Component auto-scroll.** A `componentsEndRef` sentinel is rendered after the components list; `addComponent()` smooth-scrolls it into view via double-rAF so freshly-added rows are always visible regardless of list length.
  4. **SearchableItemSelect smarter flip.** Old rule needed full panel height above before flipping; new rule flips up whenever there's more space above than below (and clamps panel maxHeight to whichever side is bigger). No more dropdowns clipping below long Dialog forms.
  5. **BOM save speed-up.** Previous save flow awaited per-active-BOM `/explode` calls before resolving the toast — multi-second wait. New `reloadBomsBackground()` returns after the BOM list refresh and defers the explosion fetches via `setTimeout(0)` so the dialog dismisses instantly.
- **2026-05-05 (very late)** — **Secondary Currency + 3 new permission modules + role-group display:**
  1. **Secondary Currency on PO / Quotation / Proforma / Tax Invoice.** Each of the four document types gained a `currency` field (default `INR`; selectable from `INR / USD / EUR / GBP / AED`). When the currency is **not INR**, the doc is treated as **export/import**: per-line `gst_rate` is forced to 0, IGST/CGST/SGST = 0, HSN tax summary disappears from print, totals show only `Subtotal → Grand Total` with the right currency symbol, and the printed amount-in-words uses the matching currency word (`Dollars / Euros / Pounds / Dirhams`). Conversion flows preserve currency: Quotation → Proforma → Tax Invoice all carry the same currency forward. Tax-Invoice UPI QR is suppressed for non-INR. Frontend dropdowns: `data-testid="po-currency-select"`, `quotation-currency`. Backend helper: new `_zero_gst_split_for_export(lines)` mirrors `_compute_gst_split` shape but with zeros + HSN bucket carrying only `taxable`.
  2. **3 new permission pseudo-modules** (`view`-only): `inventory_sale_price`, `inventory_purchase_price`, `inventory_configuration`. The first two gate Sale/Purchase price input fields on Items page (form dialog) and Inventory Stock-Edit dialog. The third gates the **Inventory → Configuration** sidebar link (no longer leaks under generic `inventory.view`). Role Group matrix exposes them with friendly labels.
  3. **Role Group name now visible after login.** Sidebar bottom card shows the user's group name in cyan/blue beneath name+email; header badge swaps from `user.role` to `user.role_group.name` when set, so Sales/Support/Inventory groups are immediately recognizable.
  4. **CRM Support assignment for non-admins.** New `GET /api/users/assignable` endpoint returns a slim `[{id, name, email}]` list to ANY authenticated user (no admin gate). CRM Page now falls back to `/api/users/assignable` when `/api/users` returns 403, so a Support agent with `crm_support.edit` can delegate tickets to teammates without admin elevation. `canSupportEdit` / `canMarketingEdit` also accept `edit` (not just `create`).
  5. **Backend QR generation** for Tax Invoices skips UPI QR when currency != INR (export invoices don't need a UPI scan-to-pay).
- **2026-05-05 (late)** — **Permission gating + simplified Role-Group-only model:**
  1. **BOM / MO / SO / Subcontract / DC / PO action buttons now respect granular `view/create/edit/delete`** permissions instead of the legacy `['admin','production_manager']` role check. Users with `view`-only on a module no longer see Add/Edit/Delete buttons. Backend `_require_access` already enforced this — frontend was the leak.
  2. **Role removed from User dialog (option B).** User Create/Edit form now shows ONLY a Role Group selector. Permissions are sourced solely from the role group's `permissions` map. Per-user permission overrides are deprecated; backend force-empties `user.permissions` on update.
  3. **Auto-derived `role` field.** `POST /api/users` and `PUT /api/users/{id}` now derive `role` from the assigned group: `is_admin_group=true → role='admin'`, otherwise `role='inventory_manager'` (kept purely so legacy code paths that still read `user["role"]` keep working). Verified end-to-end: created `newadmin@test.com` with only `role_group_id` → `/auth/me` returned `role=admin, is_admin_group=True`.
- **2026-05-05** — **3 P0 fixes (MO start preview, scroll preserve, Support products):**
  1. **MO Start now has a confirm-first preview.** New `?preview=true` query on `POST /api/work-orders/{id}/start` computes the materials WITHOUT consuming or marking the MO started. Frontend calls preview first, shows the consumption list, and the user can **Cancel / close the dialog → no material consumed**. Only `Confirm Start` triggers the real consumption.
  2. **Scroll position preserved after MO start.** Replaced the heavy `fetchData()` reload after start with an in-place state patch via the new `patchWorkOrderInTree` helper — the WO row's status flips to `in_progress` without collapsing the tree or jumping the page back to the top.
  3. **Support ticket Products picker now shows products immediately.** `MultiItemPicker` previously hid the list until the agent typed something. It now defaults to showing the first 50 items so support agents can browse & select straight away. Search box still narrows by part_number / name / description.
- **2026-05-01** — **2 P0 fixes (BOM export type column + creator-signature prints):**
  1. **BOM Excel export** now has **Parent Type** (col D) and **Component Type** (col I) columns with the short badge values used by the UI: FG / SG / Part / RM. Importer tolerates both formats (accepts new columns, still reads legacy files without them). Verified: `FG-001 → PT=FG, CT=RM/SG`.
  2. **Print signatures belong to the document creator, not the current user.** Backend `_enrich_quotation`, `_enrich_proforma`, `_enrich_tax_invoice`, and `/po/{id}/print-data` now attach `created_by_user: {name, email, signature_url}`. Frontend `printInvoiceDoc` uses `doc.created_by_user ?? currentUser`; `POPrintDialog` embeds the creator's signature image in the "Prepared By" block. Verified via API: `QUO000024` → `created_by_user.name='System Admin', has_sig=True`.
- **2026-04-30 (very late)** — **3 P0 fixes (RM BOM guard + clearer component search + HSN on Quotation):**
  1. **RM items can no longer have a BOM.** Added a category check in BOTH `POST /api/bom` and the Excel `import_bom_excel` endpoint that rejects any row whose parent is a `raw_material`. The manual UI already blocked this; now imports + raw API calls do too. One stray BOM with an RM parent (left over from a prior import) was deleted.
  2. **BOM component picker placeholder updated** to "Type part no. or name…" so the field clearly invites typing. Search already matches part_number + name + description.
  3. **HSN column added to Quotation creation grid** (between Item Name and Qty). `QuotationLine` model gained `hsn_code: Optional[str]`. `onPickItem` auto-fills HSN from item master. Print template already reads `l.hsn_code` so PDFs reflect the new value automatically. tfoot colSpan bumped from 9 → 10.
- **2026-04-30 (late)** — **4 P0 fixes (BOM edit sort + nested edit return + GST autofill + branding):**
  1. **BOM edit dialog components now sorted SG → CP → RM, then numeric part_number.** New `sortBomComponentsForEdit` helper applied in `handleEdit` and when navigating to a child BOM. Empty rows (newly added) sink to bottom so they don't disrupt selection.
  2. **Nested child-BOM edit returns to parent (no more list flash).** New `bomEditStack` state. Clicking "Edit <child> BOM" inside a parent edit now pushes the parent context onto the stack and swaps the dialog content (no close/reopen). Save/Cancel pops the stack — the user lands back on the parent edit screen with their unsaved edits preserved. Cancel button label dynamically becomes "Back to Parent BOM" when nested. Breadcrumb shows the navigation path: "EDITING NESTED: FG-001 › SA-001".
  3. **Customer GSTIN auto-fill.** New `POST /api/customers/lookup-gstin` (alias of supplier endpoint, same Appyflow logic). CustomersPage GSTIN field now has a "Fetch" button that pre-fills name, state (from GSTIN first-2-digits), city, PIN, and address. Sandbox/free-tier notice surfaced in a warning banner.
  4. **"Made with Emergent" badge removed** from `index.html` per customer branding requirement.
- **2026-04-30** — **BOM explosion children now sorted SG → CP → RM, then numeric part_number (P0):**
  - `flattenRows` and `printBomExplosion` in `BOMPage.js` now re-sort siblings at every depth via a new `sortSiblings` helper: category priority `sub_assembly (SG)` → `component (CP)` → `raw_material (RM)`, then numeric-aware `localeCompare` on part_number (so `CGC0G0000129` comes before `CGC0G0000278`). Applies to on-screen table AND printed PDF. No backend data change — pure render-time ordering.
- **2026-04-29 (late)** — **BOM list now sorted numerically by part_number within each category (P0):**
  - Old sort was alphabetic `localeCompare` which produces "FG-1, FG-10, FG-11, FG-2" (wrong).
  - New sort uses `localeCompare(..., { numeric: true, sensitivity: 'base' })` so numeric segments compare as numbers. Category order still: FG → SG → CP → RM. Within each category, part numbers flow in natural/human order.
- **2026-04-29** — **3 P0 fixes (BOM dropdown, customer-side salesperson, unified CRM nav):**
  1. **BOM creation dropdown finally selectable:** Debugged to root cause — Radix Dialog's RemoveScroll layer sets `pointer-events: none` on `<body>` while the modal is open, which cascaded to our body-portal'd `SearchableItemSelect` panel and killed hit-testing on options (`elementFromPoint` returned the dialog content instead of the button). Fix: explicit `pointerEvents: 'auto'` on the portal panel + option selection via `onMouseDown` (instead of `onClick`) to fire before Radix's DismissableLayer cancels the event. Verified in real browser click.
  2. **Customer-side multi-salesperson assignment (Odoo-style):** new `Customer.assigned_user_ids: List[str]`. `GET /api/customers` for non-admins now returns ONLY customers where they created it OR their id is in `assigned_user_ids` — no legacy null-created_by fallback. Admin customer form gained an "Assigned Salespersons" multi-select with all users. Customer cards show assigned salesperson pills for admins. Old per-user "Assigned Customers" UI removed from `UserManagementPage` (flow inverted).
  3. **Unified sidebar:** removed top-level `Customers` nav entry. Under `CRM → Marketing`, the first child is now `Customers` (→ `/customers`), replacing the old `Contacts`. Bookmarked `/crm?tab=marketing&sub=contacts` URLs redirect to `/customers`. Testing agent 6/6 backend + 100% frontend pass.
- **2026-04-28 (late)** — **Quotation print now shows GST amount + CGST/SGST/IGST split (P0):**
  - Root cause: `POST/PUT /api/crm/quotations` persisted only `total_gst` (a flat number). The print template (`printInvoiceDoc` in `CRMPage.js`) reads `doc.is_inter_state`, `doc.cgst`, `doc.sgst`, `doc.igst` — so it displayed nothing for quotations.
  - Fix: `create_quotation` and `update_quotation` now call `_compute_gst_split(customer_id, lines)` (same helper used by Proforma/Tax Invoice) and persist `is_inter_state`, `cgst`, `sgst`, `igst`, `hsn_summary`. `_enrich_quotation` back-fills the split for legacy quotations at read time so historical prints show the right taxes without a migration.
  - Verified: intra-state customer (state=27) → CGST 810 + SGST 810; inter-state customer (state=09) → IGST 360.
- **2026-04-28** — **2 P0 UX fixes (search dropdown + drag-scroll):**
  1. **Item-search dropdown brought to front:** `SearchableItemSelect` now renders its dropdown panel through a `react-dom` portal anchored to `document.body` with `position: fixed`, computed from the input's bounding rect. Previously the dropdown was clipped by the line-items-grid wrapper's `overflow-x-auto` (and any Dialog scroll container), so it appeared "behind" or below the next row. The panel now sits above all rows with `z-index: 9999` and auto-flips above the input when there's not enough room below.
  2. **Drag-reorder auto-scroll:** `useDraggableRows` now auto-scrolls the closest scrollable ancestor (or the window) when the cursor approaches the top/bottom edge during a drag. Speed ramps from 0 → ~18px/frame as proximity to edge increases (80px detection band). The screen no longer "freezes" — users can now drag a row to a target far below the fold.
- **2026-04-28** — **5 P0 fixes (Customers, line-items grid UX):**
  1. **Customer create permission honored:** `CustomersPage` Add/Edit/Delete buttons now use `hasPermission('customers', 'create'/'edit'/'delete')` instead of hardcoded role list. Granting `customers.create` to a custom role-group now unlocks the button.
  2. **Per-user customer assignment + admin scope filter:** new `UserUpdate.assigned_customer_ids: List[str]`. `GET /api/customers` now returns (`created_by=user`) ∪ (`id IN assigned_customer_ids`) ∪ (legacy null `created_by`) for non-admins; admins get all by default and can pass `?mine=true` to see only what they created. `UserManagementPage` user dialog gained an "Assigned Customers" multi-select with search, select-all, and clear-all. `CustomersPage` admin-only "All Contacts / Own Contacts" scope filter (`data-testid='customer-scope-filter'`).
  3. **+ Add Line button at the bottom of every line-item grid** — Excel-style. Applied to Quotation, Tax Invoice, and PO grids via a new `<tfoot>` row inside `.line-items-grid` (testids: `po-add-line-footer-btn`, `quotation-add-line-footer`, `ti-add-line-footer`). Top button kept for accessibility.
  4. **SearchableItemSelect now searches description** in addition to part_number + name. Dropdown shows description as a second line under the item name. Placeholder updated.
  5. **Drag-and-drop row reordering** for line items in PO, Quotation, and Tax Invoice. New `useDraggableRows` hook (`/app/frontend/src/hooks/useDraggableRows.js`). Drag handle is the row-num cell (cursor: grab/grabbing); CSS adds visual `is-dragging` (40% opacity) and `is-drop-target` (2px top border) feedback.
- **2026-04-27** — **P4 Backend Refactor — Phase 1 (core/ modules extracted):**
  - server.py shrunk 11,704 → 11,517 lines by moving shared utilities into `/app/backend/core/`:
    - `core/db.py` — MongoDB client + `db` handle (15 lines)
    - `core/permissions.py` — `ALL_MODULES`, `DEFAULT_PERMISSIONS`, `get_default_permissions`, `allowed_actions_for` (78 lines)
    - `core/auth.py` — password hashing, JWT issuing, `get_current_user`, `_require_access`, `require_roles`, `get_cookie_settings` (178 lines)
  - server.py now imports these instead of defining inline. Zero route-signature changes; testing agent confirmed 18/18 backend tests pass + all UI flows work.
  - **Phase 2 (deferred):** extracting individual route domains (auth.py, items.py, inventory.py, …) into `/app/backend/routers/` — foundation now in place; safer to do per-domain in subsequent sessions.
- **2026-04-27** — **Excel-like compact line-item grid + Create Item modal scroll (P0):**
  - Replaced the verbose `po-lines-compact` inline-style table with the shared `.line-items-grid` CSS class on PO creation (`PurchaseOrdersPage.js`) and MRP→PO dialog (`MRPPage.js`). HSN, Qty, UOM, Discount, GST%, Total Amount columns now render in tight Excel-like rows; HSN no longer truncates.
  - `ItemsPage.js` Create/Edit Item modal: `DialogContent` now has `max-h-[90vh] overflow-y-auto` so users can scroll on small screens and reach the Create Item button.
  - MRP PO dialog also gained `max-h-[92vh] overflow-y-auto`.
- **2026-02-28** — **Resize handle visibility + comfortable table padding (UX):**
  1. **Visible resize grip:** `.col-resizer` now shows a subtle 1px vertical bar between columns (gray #D1D5DB by default, navy #1D3557 on hover/drag). Hit area widened from 6px → 10px so the handle is easier to grab without precise targeting.
  2. **Comfortable padding everywhere:** `.data-table th` and `td` bumped from `py-2 px-3` → `py-2.5 px-4`. Layout main padding `p-3 lg:p-4` → `p-4 lg:p-5`. TD row heights now ~45px (was ~36px) — much more breathing room for scanning long lists.
- **2026-02-28** — **Resize drag no longer triggers sort (P0):**
  - Root cause: the resize handle is a child of the `<th>`. After mouse-down on the handle and mouse-up, the browser fires a synthetic `click` event that bubbles to the `<th>`'s `onClick` (sort handler). `stopPropagation()` on `mousedown` doesn't stop the synthetic click.
  - Fix: `useResizableColumns` now (a) attaches a `click` listener on the handle that calls `stopPropagation + preventDefault`, and (b) installs a CAPTURE-phase `click` listener on the `<th>` that swallows clicks for ~0 ticks after a drag (tracked via `didResize` flag).
  - Verified live (Playwright): drag PN col +80px → items stay in original order (RM-001, RM-002, RM-003 unchanged); click on th body still sorts correctly (items reorder to alphabetical).
- **2026-02-28** — **Column resize without sibling squeezing (P0):**
  - Root cause: `table-layout: fixed` + Tailwind `w-full` on the `<table>` was constraining total width to the container, so widening one column squeezed the others to compensate.
  - Fix: `useResizableColumns` now sets the `<table>`'s explicit `width` and `minWidth` to the SUM of column widths, both on initial lock-in and during every drag-move. The parent's `overflow-x: auto` provides horizontal scroll if the total exceeds the viewport.
  - Verified live: dragging Part Number +100px → PN went 294→394, other 4 columns unchanged. After click-sort: all widths preserved (394, 453, 185, 110, 83 — zero delta).
- **2026-02-28** — **Group filter UX + post-import group refresh (P0):**
  1. **Auto-created groups visible immediately after Excel import:** `ItemsPage.handleImport` now calls a new `fetchItemGroups()` helper after import, alongside `fetchItems()`. Newly auto-created groups (matched by name on import) now display in the Group cell of imported rows without requiring a page refresh.
  2. **Group filter un-selection:** Inline X clear button next to the Group filter trigger (Items + Inventory pages, `data-testid='items-group-filter-clear'` / `'inventory-group-filter-clear'`). Also fixed a shadcn `Select` quirk where the trigger could show a stale label after the user picked "All Groups": switched binding from `value={state || undefined}` to `value={state || 'all'}` for both Group and Category filters so the trigger always reflects state.
- **2026-02-28** — **Stable column widths + Stores filter visibility (P0):**
  1. **Column reflow on sort fixed:** `useResizableColumns` now captures each column's natural width on mount, locks them inline, and switches the table to `table-layout: fixed`. Sorting (or filtering) no longer reflows column widths — verified delta=0px on Stores Stock Part Number through 2 sort cycles. User-driven resize via the drag handle still works.
  2. **Stores Stock category & group filters were invisible** because `.input-field` (`@apply w-full`) overrode Tailwind `w-40` / `w-44`. Switched to important modifiers (`!w-40`, `!w-44`). All 3 filters now sit on a single row with the correct widths (256/160/176 px).
- **2026-02-28** — **Sortable + resizable columns + Stores filter no-wrap (P0 batch):**
  1. **Sortable Part Number column with chevron:** Items, Inventory Stock, Stores Stock tables. Click the header to cycle ASC → DESC. Sort uses `localeCompare(numeric:true)` for natural ordering (RM-1 < RM-2 < RM-10).
  2. **Resizable columns:** new `useResizableColumns(tableRef, deps)` hook attaches a 6px drag handle on the right edge of every `<th>`. Mouse-down + drag widens or narrows. Visual indicator (.col-resizer turns navy semi-transparent on hover/active). All 3 tables wired up (9, 10, 8 columns respectively).
  3. **Stores Stock filter no-wrap:** Search (max-w 280px), Category (w-40), Group (w-44), Clear button — all `flex-shrink-0` and the parent uses `flex-nowrap min-w-0`. Verified all 3 inputs sit on the same row at 1920px (Y diff 0px in test).
- **2026-02-27** — **BOM Excel: routings as separate columns:**
  - **Export:** Replaced the single "Parent Routings (Name:Cost)" column with ONE column per master Routing (sourced from `db.routings` where status='active', sorted by name). The parent FG/SA's first row carries the cost in the matching routing column; subsequent rows leave them blank. "Routings Summary" sheet still aggregates totals.
  - **Import:** Each non-core column header is treated as a routing column. Values across rows of the same parent group are SUMMED (so cost can be placed on whichever row is convenient). Unknown headers auto-create new master routings (`status='active'`, description "Auto-created during BOM import on …"). Zero-cost entries are dropped from the resulting `parent_routings` array to avoid noise.
  - Verified end-to-end: 172 master routings → 172 columns. Test import with new "NewOp_TestImport" header successfully wrote `[{name: 'Welding', cost: 250.5}, {name: 'NewOp_TestImport', cost: 100.0}]` and auto-created the master routing.
- **2026-02-26** — **Header spacing + PO line text + Dashboard wiring (P0 batch):**
  1. **Tighter page chrome:** Layout main padding `p-4 lg:p-6` → `p-3 lg:p-4`. BOM page `space-y-6` → `space-y-3`, sticky header `py-3` → `py-2`, h1 `text-2xl` → `text-xl`, description `text-sm` → `text-xs`, filter card `p-4` → `px-3 py-2`. Same compact pattern for Dashboard. Result: ~30% less vertical chrome — much more BOM detail above the fold.
  2. **Stores Stock filters single-row layout:** Search (w-64), Category (w-44), Group (w-48), all h-9, no wrapping at 1920px viewport. Clear button now resets search too.
  3. **PO line items readability:** PO dialog widened from `max-w-5xl` → `max-w-7xl`. Line table text bumped from 12px → 14px (cells) / 13px (headers); cell padding 4-6px → 6-8px. Same applied to MRP→PO dialog. Description input bumped to 13px italic.
  4. **Dashboard quick actions fixed:** Replaced broken `<a href>` to non-existent routes (`/items/new` etc.) with `react-router navigate('/items?action=new')`. New deep-link handlers added on `BOMPage` (?action=new opens Create BOM) and `ProductionPage` (?action=new opens Create Sales Order). InventoryPage handles `?lowStock=1`. Quick Actions now permission-gated via `hasPermission(module, 'create')`.
  5. **Dashboard KPI cards clickable:** Total Items → /items, Active BOMs → /bom, Pending Orders → /production, Low Stock → /inventory?lowStock=1 (auto-toggles low-stock checkbox).
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
- **P1 (next)** Phase 2 — Attribute-driven BOM Variants. Add `variant_attributes` to FG items (e.g. Motor Power: 1HP/2HP, Voltage: 220V/440V). Add `applies_to` map on each BOM component so a single master BOM can serve every configuration. SO line picker chooses an attribute combination, which filters which components are required.
- **P2** GSP e-Invoice integration (IRN + signed QR from GST portal).
- **P3** Dispatch Manager panel.
- **P4 (Phase 1 ✅ done 2026-04-27)** Extracted `db`, permissions, and auth utilities into `/app/backend/core/`.
- **P4 (Phase 2 — pending)** Per-domain route extraction into `/app/backend/routers/` (`auth.py`, `items.py`, `bom.py`, `inventory.py`, `purchase_orders.py`, `crm.py`, `jobwork.py`, …).
- **P5** GST Compliance Phase 3 — GSTR-1/3B report formats + ITC tracking.
- **P6** Barcode/QR scanning for inventory transactions.
- **Future** Windows desktop wrapper (Electron/Tauri).

## Key Files
- `/app/backend/server.py` — main app, route definitions (Phase-2 router split pending). Imports shared building blocks from `core/`.
- `/app/backend/core/db.py` — Mongo client + `db`.
- `/app/backend/core/permissions.py` — `ALL_MODULES`, `DEFAULT_PERMISSIONS`, `get_default_permissions`, `allowed_actions_for`.
- `/app/backend/core/auth.py` — JWT + password hashing + `get_current_user` + `_require_access` + `require_roles` + `get_cookie_settings`.
- `/app/frontend/src/pages/InventoryConfigurationPage.js` — dedicated Config page.
- `/app/frontend/src/components/{SearchableSelect,SearchableItemSelect}.jsx` — universal typeahead.
- `/app/frontend/src/components/Layout.js` — sidebar nav.
- `/app/frontend/src/index.css` — `.line-items-grid` Excel-like compact transactional grid.

## Test Credentials
See `/app/memory/test_credentials.md`.
