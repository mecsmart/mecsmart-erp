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
- **2026-05-14 (newest)** — **MO page: Family focus on SG only + per-FG search/status filter (DONE & VERIFIED ✅):**
  1. Removed Family focus button from FG header. Family focus button now appears **only on SG (sub_assembly) rows** that have children — clicking sets the global familyFilterWoId and limits the view to that SG's family.
  2. When an SG family focus is active and the focused SG belongs to a given FG, that FG header renders an inline **"Focused: MO-XXXXXX [×]"** clear chip (data-testid `clear-family-focus-{fgId}`). Click → resets the focus instantly without scrolling to the SG row.
  3. Each FG header now has on the right side (after the X MO(s) count): a **search input** (`panel-search-{fgId}`) and a **status dropdown** (`panel-status-{fgId}`). Both scope ONLY to the SG/Part WOs under that FG; the root FG row stays visible.
  4. Original toolbar Search + Create MO + "All Statuses" + "X of Y orders" — all kept in their original location.
  5. Bug fix: imported `X as XIcon` from lucide-react and used the alias in the clear chip (X is not defined runtime error fixed).

- **2026-05-14** — **JW top-margin + duplicate Receive-via-GRN fix + GRN partial-receipt hardening (DONE & VERIFIED ✅):** Two unrelated UX fixes.
  1. **JW page tightening**: Reduced top section spacing (h1 → text-xl, removed "Send materials to subcontractors..." subtitle, `space-y-6` → `space-y-3`, KPI cards `p-4 gap-4` → `p-3 gap-3`). The page now starts with the order table much closer to the breadcrumb.
  2. **JW Receive-via-GRN duplicate**: Job Card OS rows have both `reference_operation_seqs` AND `job_work_parts`, so two render conditions both matched, producing a doubled badge. Merged the two render blocks into one broader condition — single badge per row.
  3. **MO page — Focus family inline → per-FG filter row**: Removed the global "Focus family" button that appeared on every parent WO row inside the renderMORow tree (it set a GLOBAL filter that hid other FGs entirely, which was confusing). In its place, added a per-FG filter row that renders DIRECTLY under each FG group header with:
     - **Search input** (`panel-search-{fgId}`) — case-insensitive match on item part_number, name, wo_number; depth>0 rows only.
     - **Status dropdown** (`panel-status-{fgId}`) — All / Pending / In Progress / Outsourced / Completed / Cancelled.
     - **Clear** button (appears only when a filter is active).
     - Filters are scoped per-FG; sibling FG groups are untouched. Existing SG-only / Parts-only category pills on the FG header continue to work and stack with the new filters.
  - **Verification** (iteration 115): 13/13 frontend Playwright tests pass.

- **2026-05-14** — **JW: exhaustive routing cost search + PUT permission expansion (DONE & VERIFIED ✅):** Two follow-up fixes for user's persistent issues.
  1. **`find_routing_cost` rewritten to scan all candidate BOMs**: Previous version checked only ONE BOM (first match by parent_item_id, then first by components.item_id). Production data could have the routing op defined on a parent FG BOM's component-line entry while the part's own BOM has different ops — those weren't found. Now iterates over EVERY active BOM (and then inactive as fallback) for both placements, returning the first non-zero match. Also added a small "Refresh cost" button next to each Outsourced op badge in the Edit SC dialog so users can force-recompute on demand.
  2. **PUT /api/job-work/orders/{id} permission expanded**: Backend required `job_work.edit` permission; frontend `canEdit` ALSO included users with `job_work.create`. Mismatch caused non-admin/non-production-manager users to see an Edit button, type their changes, hit Save → silent 403. Now PUT accepts admin/production_manager/inventory_manager roles OR users with `edit` or `create` permission on the `job_work` module.
  - **Verification** (iteration 114): 26/26 tests pass (9 new + 7 iteration 113 + 10 iteration 108 regression). Permission test confirms users with only `job_work.create` can now successfully update SC `job_work_parts`. 403 still returned for users with no relevant permission.

- **2026-05-14** — **JW Edit SC dialog: un-gate self-heal so completed SCs also display specific per-op cost (DONE & VERIFIED ✅):** Iteration 111's self-heal of `charges` on `GET /api/job-work/orders` was wrapped in an `is_live` (draft/in_progress) gate. User reported that Send DC dialog (`/dc-lines`, no gate) showed correct per-op cost (37.61) but Edit SC dialog (`/orders` list) still showed combined (90.61) for the same item — because that SC's status was already past `in_progress` (consolidated 6-MO SC). Fix: moved the specific-op override out of the `is_live` block. It now ALWAYS runs whenever `process_name` is set on a job_work_part, regardless of SC status. Display-only correction; DB row is untouched. Combined-cost auto-refresh (Full MO-SC) still respects `is_live` to preserve audit snapshots. **Verification** (iteration 113): 25/25 tests pass (7 new completed-SC tests + 8 iteration-111 regression + 10 iteration-108 regression). Synthetic completed-status SC with polluted charges=90.61 correctly heals to 37.61.

- **2026-05-14** — **JW dialogs: stacked Manual-DC-style layout + wider window (DONE & VERIFIED ✅):**
  1. **Edit Subcontract Order dialog**: Widened to `max-w-5xl` (1024px). Removed the separate "Description / Remarks" column. Description input now lives **inline inside the Part cell**, stacked vertically: SearchableItemSelect → editable description input → "Outsourced op: <name>" bronze badge. Qty / Process Cost/Unit / Total columns remain to the right.
  2. **Send Materials (DC) dialog**: Same Manual-DC stacked layout — `max-w-5xl` window, Part cell shows `Part# — Name` on top, an **editable** description input below (so users can adjust description right before sending), and "Op: <op_name>" badge beneath. Charges/Unit / Total Charges / RM Cost/Unit / Total Amount cells unchanged.
  3. **DC print/PDF**: Verified already includes both routing op name and description below the part name in each row (`partCell` builder in `printDC`). Also updated to prefer the DC line's own `process_name` over SC fallback so new descriptions/ops persisted on the DC itself render correctly.
  - **Verification** (iteration 112): 5/5 frontend Playwright tests pass — dialog widths confirmed 1024px, stacked layout verified for both dialogs, description persistence regression covered.

- **2026-05-14** — **JW SC list — self-heal polluted charges on GET (DONE & VERIFIED ✅):** User showed a screenshot where the SC Edit dialog still displayed COMBINED process cost on parts tagged with a specific outsourced op (`Powder Coating`). Iterations 109/110 stopped further pollution but didn't actively heal SCs whose stored `charges` was already wrong from older code. Applied the same self-heal pattern previously used on `/dc-lines` to `GET /api/job-work/orders`:
   - For every `job_work_parts` line on a live (draft/in_progress) SC where `process_name` is set, the response's `charges` is now overridden with `find_routing_cost(item_id, process_name)`. The override only fires when the lookup returns a non-zero value (so manually-keyed costs aren't wiped when the op isn't found in any BOM).
   - Falls back to existing combined-cost auto-refresh for Full MO-SC lines (no `process_name`).
   - **Verification** (iteration 111): 8 new tests + 10 regression tests = 18/18 pass. Synthetic data mirroring the user's case (4 components, each with `parent_routings`=[{generic_op, cost}, {Powder Coating, X}], stored charges polluted with combined sum) was healed correctly to each part's specific Powder Coating cost.
   - User must redeploy to push to production after testing in preview.

- **2026-05-14** — **JW DC: style match + per-op cost override on unsent DCs (DONE & VERIFIED ✅):**
  1. **Fix 1 — Send Materials (DC) dialog styled like Manual DC**: The Job Card OS DC dialog's Part column now stacks three lines vertically per row (mirroring Manual DC's item-cell layout):
     - Line 1: `<part_number>` (bold mono) — `<item_name>`
     - Line 2: `Op: <process_name>` (small bronze)
     - Line 3: `<item_description>` (small italic gray)
     All existing columns (HSN, Qty, UOM, Charges/Unit, Total Charges, RM Cost/Unit, Total Amount) preserved. data-testid `dc-desc-{idx}`.
  2. **Fix 2 — Unsent-DC per-op cost override**: User reported that even after iteration 109's fix, opening a Send DC dialog or listing draft DCs sometimes still showed the COMBINED process cost (legacy data pollution). Added two override paths:
     - `GET /api/job-work/orders/{sc_id}/dc-lines` — when the SC's job_work_part has a `process_name`, `charges_per_unit` is recomputed via `find_routing_cost(item_id, process_name)`, overriding any stale stored value. Falls back to stored value if op not found in any BOM. Also now returns `item_description` and `process_name` to the frontend.
     - `GET /api/job-work/challans` — for DCs with `status='draft'` whose parent SC is a Job Card OS, each line's stored `processing_charges` is overridden with the specific routing cost (self-heal of legacy DCs). Sent/completed DCs are NOT touched (audit preservation).
     - `JobWorkLineItem` model and `POST /api/job-work/challans` persist new optional fields `item_description` and `process_name` on each DC line.
  - **Verification** (iteration 110): 7/7 backend tests + 3/3 frontend UI tests pass. Tested with planted polluted data (stored charges=2500, expected 500 via 'LC Cutting'): both /dc-lines and /challans self-healed to 500. Regression tests confirm Full MO-SC (no reference_operation_seqs) still uses stored/combined charges as before.

- **2026-05-14** — **JW Process OS — specific routing cost + Item Description + Bottom Add-Part (DONE & VERIFIED ✅):** Three user-reported issues on the Job Work / Subcontract Order edit flow.
  1. **Specific outsource routing cost in DC**: For Job Card OS SCs (those with `reference_operation_seqs` — auto-created when starting a specific outsourced operation), the SC stores a per-op `charges` (the cost of that ONE routing op only). Two existing backend bugs were wiping this and replacing it with the **combined** BOM process cost:
     - `PUT /api/job-work/orders/{id}` (line ~10524): when the frontend re-saved an SC without explicit charges, the enricher overwrote `charges` with `compute_bom_costs.process_cost` (sum of all routings). Rewrote the enricher with a `_find_existing` helper that matches incoming entries to the original `job_work_parts` by (item_id, process_name) → preserves `process_name`, `wo_id`, `item_description`, and falls back to specific-routing cost via `find_routing_cost` when process_name is set.
     - `GET /api/job-work/orders` (line ~10414): auto-refresh logic was unconditionally re-setting `part["charges"] = fg_process_cost` on every list call. Added `has_specific_op = bool(part.get("process_name"))` guard so the overwrite is skipped when the line is tied to a specific routing.
     - Added new endpoint **`GET /api/bom/routing-cost?item_id=X&process_name=Y`** (placed BEFORE the `/{bom_id}` wildcard so it resolves correctly). Used by the frontend when re-selecting an item on a Job Card OS row to fetch the specific op's cost (not the combined).
     - `JobWorkPartItem` model now carries optional `process_name` and `item_description`.
     - The DC Print template now shows the routing op badge and description below the Part No.
  2. **Item Description / Remarks editable per JW Part**: New "Description / Remarks" column in the Edit Subcontract Order dialog with a text input per row (data-testid `jw-part-{idx}-description`). Persisted on the SC's `job_work_parts[].item_description` and surfaced on the printed DC underneath the part name.
  3. **Bottom Add Part button**: Added a secondary "Add Part" button below the parts table (data-testid `jw-add-part-bottom`) so users don't scroll up to the header when adding parts to a long list. Top button kept as `jw-add-part-top`.
  - **Verification**: testing_agent_v3_fork iteration 109 — 10/10 backend tests + 1 regression test pass (specific-op preservation through PUT, GET list, multi-op consolidation; Full MO-SC combined-cost auto-refresh still works). Frontend dialog smoke-tested via Playwright: Description column, top & bottom Add Part, description inputs all render. Live DB SC `0a2d427f-…` survived a `charges:0` PUT — `process_name='Operation_2', charges=100` preserved.

- **2026-05-13** — **Component BOM export refined to Component→RM only (DONE & VERIFIED ✅):** User requested the `/api/bom/export/parts-only/excel` endpoint output ONLY component → RM rows (skip FG, skip SG, skip any non-component intermediate level). Rewrote the export so that:
  1. Walks the BOM tree from the root and collects every item whose `category == "component"` AND that has its own active BOM (deduped by item_id).
  2. For each such component, emits ONE row per Raw-Material child (skips component / SG / FG children — those are surfaced via their own BOMs elsewhere in the walk).
  3. Routing operations of each component's `parent_routings` become dynamic columns (one per distinct operation name across all emitted components). Cell value = per-unit cost; empty if that op doesn't apply to that component.
  4. New `Total Routing Cost` column at the far right; routing values + total are emitted only on the FIRST RM-row of each component to avoid visual duplication.
  5. Headers: `Component Part Number | Component Name | Revision | RM Part Number | RM Name | Quantity | UOM | Is Alternate | Effectivity Date | <one column per routing op> | Total Routing Cost`.
  - Verified on FG-1 (Elevator Assembly) which has FG → SG (component) → 2 sub-components → 1 RM each. Export correctly produced 2 rows: `Part_1 → RM-1` and `Part_2 → RM-2`, each with `LC Cutting` cost (500 / 1200) and `Total Routing Cost` matching. FG/SG rows fully skipped; "Welding" op on the skipped SG correctly NOT emitted as a column.

- **2026-05-13** — **Constant table width on resize + Full exploded BOM export (DONE & VERIFIED ✅):**
  1. **Items & Stock page column resize now keeps total width constant**: Previously when the user dragged a column edge wider, the `useResizableColumns` hook grew the `<table>`'s width by the same delta — pushing the page past the viewport. Now the drag handler steals width from the IMMEDIATE NEXT column (clamped to a 40px minimum). If the next column can't shrink further, the drag simply stops instead of expanding the table. Also added `max-width` lock to the table element on mount so siblings can't push it wider even via DOM manipulation.
     - Verified via Playwright: dragging the Name column +100px on the Items page → table width stayed at **1814px** (delta = 0px); next column visibly shrunk to compensate.
     - Same hook is used by `InventoryPage.js` (line 53) so the Stock page automatically inherits this behavior.
  2. **Parts-Only export → Full Exploded BOM**: Renamed conceptually from "leaf-only aggregation" to a true exploded-BOM dump. Every component appears at every level it's used (no aggregation), columns now include `Level | Path (Parent → Child) | Part Number | Name | Category | HSN | UOM | Qty / Parent | Cumulative Qty | Unit Cost | Total Cost | Current Stock | Group | Has BOM`. Intermediate SG rows are bold and color-coded by category; child rows are indented with 4-space padding per depth. SG rows lacking an active BOM are highlighted yellow with `⚠ no BOM` tag. Leaf totals roll up at the bottom; intermediate rows DON'T add to the rollup to avoid double-counting.
     - Verified: FG-001 export now shows 8 rows including the nested `Level 2: FG-001 → SA-001 → RM-001 (60/parent, 240 cumulative)` — the SA-001 sub-tree is fully exploded inline.

- **2026-05-13** — **Revert Items page + Improve Parts-Only export visibility (DONE & VERIFIED ✅):**
  1. **Items & Parts page reverted to original layout**: Removed the `table-layout: fixed`, `min-width: 1100px`, and aggressive cell-overflow rules that changed the look-and-feel. Restored the original auto-layout with just a minimal `width: 100%; max-width: 100%` rule on the table so it stays bounded to its scroll wrapper without altering any cell widths, wrapping behavior, or visual density. Verified: page matches the original screenshot exactly (variants display, column widths, etc.).
  2. **Parts-Only export now recurses through ANY active BOM** (not just SG/FG categories) — so a component that has its own BOM is exploded into its sub-parts. Also added a visible warning for sub-assemblies that surfaced as leaves because they had no active BOM: those rows get a `⚠ no BOM` tag in the Category column, a yellow highlight, and a footnote at the bottom of the sheet (`⚠ N sub-assembly row(s) shown above have NO active BOM — author a BOM for those items to drill them into their parts`). Verified via curl: FG-001 → SA-001 (with active BOM) correctly recurses to aggregate 250 RM-001 sheets across multi-level use, while SA-002 (no active BOM) gets the warning callout.

- **2026-05-13** — **BOM Parts-Only Export + Items width lock + Inventory pagination (DONE & VERIFIED ✅):**
  1. **BOM Parts-Only Export**: New backend `GET /api/bom/export/parts-only/excel?bom_id={id}` walks the entire BOM tree and aggregates leaf parts (RM + components) into a single flat list with quantity summed across multi-level use. Output Excel has columns `# | Part Number | Name | Category | HSN | UOM | Qty Required | Unit Cost | Total Cost | Current Stock | Group`. Frontend added a small `PARTS` button next to the existing per-BOM full-export icon — preserves the original export, just adds this new shortcut for procurement / stores who want "1-FG = these parts" without the multi-level structure. Verified via curl: Hydraulic Press 50T → 4 unique parts aggregated (250 sheets RM-001, total ₹52,380).
  2. **Items & Parts table width lock**: Table was using `table-layout: auto` which let a wide cell push the entire table past the viewport with no way to "take back" width. Added `table-layout: fixed`, `min-width: 1100px`, and CSS rules clipping cell overflow with `text-overflow: ellipsis` for headers/mono cells and `word-break: break-word` for natural text. Table stays bounded within the scroll wrapper.
  3. **Inventory page slow load**: Page was rendering all 1,206 rows synchronously on first paint (30+ second freeze) — but `/api/inventory` itself returned in ~250 ms. Mirrored the Items page strategy: `PAGE_SIZE = 100`, slice `filteredSortedInventory.slice(0, visibleCount)`, and a "Load more" footer button. Also reset `visibleCount` whenever any filter / search / sort changes. **Verified**: first row visible **16 ms** after navigation idle (was multi-second blank), footer shows "Showing 100 of 1206 items" with working Load more.

- **2026-05-13** — **BOM cost-mismatch + refresh button + Items group column (DONE & VERIFIED ✅):**
  1. **Cost mismatch between collapsed & expanded BOM panels (regression)**: My new `/rollup-costs` endpoint had TWO bugs vs `/explode`:
     - **Double-count**: I was using `child["total"]` (components + FG-process) for `unit_cost` AND adding `child["fg_process_cost"]` again as `process_cost_per_unit` → child FG-process counted twice. Now uses `child["components_cost"]` for unit_cost — matching the `/explode` recursive accounting exactly.
     - **Missing SC/WO fallback**: `/explode` falls back to SC-order job-work-part `charges` and completed-WO `process_cost_per_unit` when a component has no routings. `/rollup-costs` skipped this, causing items with externally-derived process costs to show lower totals on collapsed panels. Added 2 batch-loads (SC + WO indexed by item_id) to mirror the fallback in O(N) total queries.
     - Verified: 15-BOM diff test now reports **0 mismatches** (was 1/6 before fix).
  2. **BOM refresh button did nothing**: The header refresh icon called `fetchBomExplosion()` which updated the **modal-only state** (`bomExplosion` used by the View dialog), not the inline panel state (`allExplosions[bomId]`). Rewrote the click handler to (a) re-fetch `/api/bom/{id}/explode` and store into `allExplosions`, and (b) re-fetch `/api/bom/rollup-costs` so other un-expanded panels also reflect upstream item-cost changes. Verified: refresh now fires both endpoints.
  3. **Items & Parts Group column too narrow**: Bumped `<th>Group</th>` to `minWidth: 180px` (was unbounded → defaulted to ~80px when most cells were `-`). Verified width = **223px** after fix.

- **2026-05-13** — **BOM panel expand fix + DC dialog Quotation-style table (DONE & VERIFIED ✅):**
  1. **BOM panel not expanding (regression)**: My recent `/rollup-costs` batched-preload change seeded `allExplosions[bomId]` with a SKELETON `{ explosion: [], ...costs }` so panel headers could paint cost tags immediately. Unfortunately `ensureExplosion()` then short-circuited on `if (allExplosions[bomId])` and returned the skeleton — so expanded panels showed no components. Fixed by treating cache entries as complete only when `explosion` is a non-empty array, and merging fresh `/explode` data into the existing rollup-cost fields on first expand.
  2. **DC line-items table congested**: The Manual DC dialog used a `grid-cols-12` Tailwind layout where Qty was crammed into 1 col-span. Replaced with the exact same `<table className="line-items-grid">` pattern used by Quotation editor: `# | Item Name & Description | UOM | Qty | Unit Price (₹) | Charges/Unit (₹) | Notes | ×`. Column widths match quotation (Qty=80px, UOM=70px, Unit Price=110px, Charges=110px, Description=300px min). Inputs use `.grid-input.mono.num` for right-aligned monospace numerics. Dialog widened to `max-w-5xl` to accommodate the new layout.
  - Verified via Playwright: BOM expand on the first two FG panels rendered full component tables; DC dialog opens with the quotation-style table, lazy item search still works (50 options on "RM" search), item-pick auto-populates UOM + Unit Price.

- **2026-05-13** — **PO line description UX + edit-preservation fix (DONE & VERIFIED ✅):**
  - **Symptom**: Users reported they couldn't add additional description on PO line items even with edit/create rights.
  - **Root causes (two)**:
    1. The description textarea had `rows={1}` and ~28px min-height — visually appeared as a thin strip under the item chip, making users think it was read-only or part of the item-select badge. Hard to see/edit the existing text or know it was a separate field.
    2. `updateLine` unconditionally reset `description = item.description` whenever the item_id field was assigned, even if the user re-clicked the SAME item (effectively wiping their typed description).
  - **Fixes**:
    1. Textarea bumped to `rows={2}` (~44px) with `resize: vertical`. Placeholder reworded to "Additional description (printed on PO) — click to edit or append…" and added `title` tooltip so users clearly see it's editable.
    2. `updateLine` now only auto-fills the description when (a) the item ACTUALLY changed (`value !== previousItemId`), AND (b) the line's existing description is empty. Re-selecting the same item or switching items when the user has already typed a custom description now preserves their edits.
  - Verified: Playwright test typed " + APPENDED EXTRA INFO" into PO000071 line 0, saved, dialog closed; reopening showed the appended text still there. Curl test also confirmed backend persistence (`PUT /api/purchase-orders/{id}` returns the user-entered description).

- **2026-05-13** — **JW & DC user rights fix (DONE & VERIFIED ✅):**
  - **Root cause**: The sidebar in `Layout.js` was checking the `manufacturing` permission for all JW menu items (Subcontract Orders / Delivery Challans / Receipts), but the Role Groups admin page (`UserManagementPage.js`) saves permissions under the `job_work` key. So any user whose role-group had `job_work` ticked with `view/create/edit/delete` would never see the JW menu — the sidebar was reading the wrong key.
  - **Fix**: Changed `module: 'manufacturing'` → `module: 'job_work'` for all 3 JW sidebar items so the sidebar's `canView('job_work')` check matches what the role-group permission grid actually stores.
  - Verified via curl + Playwright: created a test inventory_manager user assigned to a role-group with only `job_work` ticked. Before fix → JW menu hidden. After fix → JW menu group + all 3 sub-items render correctly in the sidebar.
  - **Note**: This is a frontend-only fix. The `Edit JW`, `Send DC`, `Create DC` button-level guards already correctly checked `hasPermission('job_work', ...)` in `JobWorkPage.js`, so backend permissions and inline UI guards were never broken — only the navigation entry was hidden by the module key mismatch.

- **2026-05-13** — **Manual DC: UOM, Unit Price, Edit, lazy item search (DONE & VERIFIED ✅):**
  1. **Items list hidden by default** — dropdown only appears after the user types ≥1 character (empty search shows nothing). Placeholder updated to "Start typing part number or name…".
  2. **UOM column** rendered next to the item field (read-only, populated from `item.unit_of_measure`).
  3. **Unit Price column** added (auto-fills from `item.unit_cost` when an item is selected; user can override). Line total `= ₹{qty × price}` shown inline below the price input.
  4. **Add Line button moved to the bottom** of the lines list (dashed border, anchored below the last line). New lines always insert at the end.
  5. **DC Edit option** — `Edit` button on every `is_manual` + `draft` DC row opens the same dialog in edit mode. Backend `PUT /api/job-work/challans/manual/{dc_id}` rebuilds the DC and diff-adjusts stock: items with increased qty get net deduction, decreased/removed items get refunded. New inventory_transactions row tagged `reference_type=manual_dc_edit` for audit.
  6. **DC PDF prints UOM column** in the Raw Material Issued table and reads `unit_price` first (falls back to `item.unit_cost`).
  - Verified via curl: created DC000005 with `unit_price=99.5` then edited to `qty=2, unit_price=150`; stock diff'd by -1 → response confirmed. UI Playwright: empty search shows 0 options, typing "CP" shows 50, picking CP-001 auto-populates UOM=`pcs` + price=`280`, Add Line inserts Line 2 at the bottom, draft manual DCs render the Edit button.

- **2026-05-13** — **Family filter + per-panel filter composition (DONE & VERIFIED ✅):**
  - When a family filter is active, the focused WO now becomes its OWN top-level panel root (it no longer walks up to the FG ancestor for rendering). This makes the per-panel `[All] [SG only] [Parts only]` pills on the focused panel filter ONLY within that family's subtree.
  - Example workflow: user clicks **Focus family** on an SG → that SG and its descendants become the panel; clicking **Parts only** on the panel shows just the Parts under that SG, hiding any other intermediate WOs. Combine the two filters to drill into exactly the level + category you want to process.
  - Verified via Playwright: focusing on MO-000658 + SG-only filter rendered the correct 3-row panel scoped to that family; clearing the family chip restored the full list.

- **2026-05-13** — **Per-FG panel filter (DONE & VERIFIED ✅):**
  - Removed the global Category pill toolbar from the top of the MO page.
  - Each main FG panel now carries its OWN inline filter pills `[All] [SG only] [Parts only]` directly inside the panel summary. Pills only render when the FG actually has SG/Part descendants worth filtering (e.g., FGs with no children show no pills).
  - When `SG only` is active on a panel, the panel's tree collapses to FG + only SG descendants. When `Parts only` is active, the panel shows FG + only Part descendants (any intervening SG layers are skipped — Parts surface directly under the FG row at the same depth). Other FG panels are untouched.
  - State (`panelFilters` keyed by FG MO id) persists across `fetchData()` refreshes — completing a child WO doesn't reset the filter on its panel.
  - Verified via Playwright: 73 SG-only pills + 15 Parts-only pills + 154 All pills rendered (242 total per-panel filter elements). Global pills count = 0. Clicking Parts-only collapsed an FG tree from 3 rows to just FG + Part rows.

- **2026-05-13** — **MO Category filter (REPLACED by per-FG panel filter above):**
  - Replaced the family-filter UX (which still exists as a secondary tool) with a primary **Category pill filter**: `[All | Parts | SG | FG]` next to the Status filter.
  - Phased processing workflow now possible: click **Parts** to see ONLY Part MOs (23 of 663) — process Phase 1. Click **SG** to see ONLY Sub-Assemblies (122 of 663) — Phase 2. Click **FG** for Phase 3 (401 of 663). Click **All** to return to the full tree.
  - When a category filter is active, rendering switches from "walk every WO up to its FG root and render the whole tree" to a **flat-mode** where each filtered WO becomes its own top-level row and child rendering is suppressed. This avoids the bug where filtering to Parts still showed full FG trees (with SGs and FG rows mixed in).
  - Filter persists across `fetchData()` refreshes — completing a Part WO does NOT reset the filter; the user keeps working through the Parts phase.

- **2026-05-13** — **MO page family filter (DONE & VERIFIED ✅):**
  - Added a per-row **"Focus family"** button on every MO that has children. Clicking it filters the MO list to just that parent + every descendant WO (recursive BFS via `parent_wo_id`).
  - Filter is rendered as a chip next to the existing status filter: `[🔽 Family: MO-000661 [×]]`.
  - State (`familyFilterWoId`) is pure client React state — it survives `fetchData()` refreshes triggered by op-completes / SC creation / cancel / etc. The user can complete sub-WOs one by one without losing their focus context. Only the explicit Clear button resets it.
  - Verified: clicking Focus on MO-000661 (3 children) filtered 663 → 3 rows correctly; clear button restored full list.

- **2026-05-13** — **BOM perf fix (N+1 → 1 batched call) + JW single-section rendering (DONE & VERIFIED ✅):**
  1. **Fix 1 (BOM page took 30+ seconds to load)**: Root cause was an N+1 pattern — after fetching `/api/bom`, the frontend fired `/api/bom/{id}/explode` for EVERY active BOM (sliding window of 8 in parallel) just to render the inline `Total` / `FG Process` cost tags on each panel header. With 317 active BOMs this was ~317 HTTP round-trips, each running a recursive explosion with many per-component awaits.
     - **Backend**: New endpoint `GET /api/bom/rollup-costs?status=active` pre-loads all BOMs + items into memory and runs the recursive rollup in-process with O(N) DB calls total. Returns `{bom_id: {fg_process_cost_per_unit, components_cost, total_rollup_cost}}` for ALL BOMs in a single response. Also optimized `GET /api/bom` to batch-load parent items in 1 `$in` query (was N individual `find_one`s).
     - **Frontend**: Replaced the per-BOM `/explode` worker pool in `fetchBoms` with a single `/rollup-costs` call. Full `/explode` (with the per-component tree) is still fetched lazily when the user expands a panel.
     - **Result**: `/api/bom` returns in **260 ms**, `/rollup-costs` in **123 ms**, total page network-idle **2.7 s** (was 30+ s). First Total tag visible **47 ms** after network-idle.
  2. **Fix 2 (JW page — show only the relevant section per sidebar tab)**: Previously the page rendered 3 stacked `<details>` accordions (Subcontract Orders / Delivery Challans / Receipts) with chevron toggles; the URL `?tab=` param only controlled which was open by default. Now each section is conditionally rendered based on `activeTab` — clicking "Subcontract Orders" in the sidebar shows ONLY that section's card (no accordion summaries, no other sections). Same for DC and Receipts. The internal "Create DC" `<span role="button">` was also tightened to a proper `<button>`.

- **2026-05-12** — **JW/DC row expand UX revision (DONE & VERIFIED ✅):**
  1. **Removed hover-to-expand** — replaced with an explicit per-row chevron toggle button (`>` / `v`) placed inside the Order # (JW) and DC # (DC) cells. Per-row expand state stored in a shared `Set` (`expandedRows`); user clicks the chevron to expand/collapse that row only. No accidental expansion on mouseover.
  2. **DC font size now matches JW** — DC's `FG/SA/Part` column renders part_no+name in `font-semibold text-[#1D3557] text-[11px] leading-tight` with a `text-[10px] leading-tight text-[#6B7280]` qty line (was inline `text-sm font-medium`). DC's `Items` column renders code on its own line (`mono text-[11px] font-medium`) and name+qty on the next (`text-[11px] text-[#4B5563]`), matching the JW RM column's compact 2-line layout exactly.
  - Added test IDs: `jw-row-toggle-{id}`, `dc-row-toggle-{id}`.

- **2026-05-12** — **3 UX fixes — DC column widths + collapsible JW/DC rows (initial hover-expand version, superseded) + JW edit validation (DONE & VERIFIED ✅):**
  1. **Fix 1 (DC column widths match JW)**: Subcontract `Delivery Challans` table — FG/SA/Part column minWidth bumped to 220px, Items (RM) column to 240px so DC table columns visually match the JW orders table.
  2. **Fix 2 (Collapsible JW & DC rows with hover-to-expand)**: Multi-line cells (MO #, FG/SA/Part, RM in JW; FG/SA/Part, Items in DC) are now wrapped in a `max-h-[36px]` overflow-hidden div that expands to `max-h-[600px]` on row hover via `group-hover` and a 300ms `transition-[max-height]` ease-out. Rows are now uniformly compact in the default view and expand smoothly on hover to reveal full content. Action buttons remain fully visible (not collapsed) so users can always click Edit/Send DC/Confirm.
  3. **Fix 3 ("Select supplier" error fires even when supplier is selected)**: The validation `!supplier_id || lines.length === 0` falsely triggered "Select supplier and add items" for valid SC-process orders that have `job_work_parts` but no RM `lines`. Split into two distinct checks: (a) `!supplier_id` → "Please select a supplier (Party)…", (b) no items in `lines` OR `job_work_parts` → "Please add at least one Job Work Part or Raw Material line." Also strip empty default lines/parts from the payload so ghost rows aren't persisted to the backend.
  - Verified: Playwright test captured **zero alerts** when editing a parts-only draft order; dialog closed cleanly on Update.

- **2026-05-12** — **JW Edit dialog perf fix (DONE & VERIFIED ✅):**
  1. **Fix 1 (JW SC-process: Edit & Send DC buttons missing)**: Root cause — admin's permissions object does NOT include the `job_work` module, so `hasPermission('job_work', 'edit')` returned `false`, hiding Edit/Confirm/Send DC for the admin user. JobWorkPage already computed `isAdmin` but never used it. Added admin bypass: `canCreate = isAdmin || hasPermission('job_work','create')`, `canEdit = isAdmin || hasPermission('job_work','edit') || canCreate`. After fix: 121 Edit, 19 Confirm, 76 Send DC buttons render across 183 orders.
  2. **Fix 2 (Collapsible main sidebar with hover-to-expand)**: Layout sidebar is now 64px (icons only) by default; expands to 256px on `onMouseEnter` and collapses on `onMouseLeave`. The expanded state overlays content (main stays at `lg:ml-16`). Added pin/unpin toggle (`PanelLeftClose`/`PanelLeftOpen`) in the sidebar header — when pinned open, sidebar stays 256px and main content shifts to `lg:ml-64`. State persisted in localStorage (`mecsmart_sidebar_collapsed`). All nested group panels and labels gracefully hide in collapsed mode; native `title` attribute provides hover tooltips on icons. New test IDs: `sidebar-root`, `sidebar-collapse-toggle`.
  3. **Fix 3 (Widen RM column in JW table)**: Subcontract Orders RM column minWidth bumped from 140px → 240px so multi-line RM details (part_number, name, qty, rate) render without cramping.

- **2026-05-12** — **3 fixes — BOM nested variants + JW actions + JW row UX (DONE & VERIFIED ✅):**
  1. **Fix 1 (Nested BOM dialog variant refresh)**: When the user drilled INTO a nested sub-BOM (FG → SG), the variant breakdown stayed pinned to the OUTER BOM's data, so unrelated variant leaves from sibling sub-trees kept appearing. Added shared `loadVariantsForItem(parentItemId)` helper and invoked it on every nested drill-down AND parent-pop transition. Now each level shows ONLY the variants in its own BOM subtree.
  2. **Fix 2 (MO→SC without_material: Send DC button missing)**: Send DC button was gated on `lines.length === 0`, but the MO→SC creation always writes a single dummy line. Updated the condition to `subcontract_type === 'without_material' && !reference_operation_seqs && job_work_parts.length > 0 && !dc_created`. Both Edit and Send DC now appear correctly for MO-derived JW orders.
  3. **Fix 3 (JW table row density)**: Widened the FG/SA/Part column (160px → 220px) and the Actions column (100px → 180px). Reduced part-number/name font to 11px and qty/charges line to 10px with `leading-tight` so multi-part rows fit in one frame without wrap-overflow.
  - 48/48 regression tests still pass.


  Variants now propagate to child WOs based on each child's OWN BOM tree, not blanket inheritance from the parent MO.
  - **Backend**: New helper `_filter_variant_selection_for_item(item_id, variant_selection)` returns only the subset of axes that appear in the item's `_get_effective_variants` (own for CP/RM, inherited via BOM walk for FG/SG). `create_wo_for_item` uses this filter when setting `variant_selection` on each auto-created child WO.
  - **Behavior matches user's 3 examples**:
    - Ex1: FG with variant-bearing components → main WO + matching child WOs carry the variant_selection.
    - Ex2: SG whose BOM tree has zero variant-bearing components → variant_selection=None (runs plain).
    - Ex3: SG whose BOM has one variant-bearing leaf → variant_selection contains only that axis (other parent axes dropped).
  - **Tests**: `/app/backend/tests/test_iteration_107_contextual_variant_propagation.py` — 4 new tests + 44 regression = **48/48 passing**.


  Prior fixes (in-place patching, rAF restore, 150ms timeout) didn't fully solve scroll-to-top because of a deeper cause: `setLoading(true)` swapped the entire table for a tiny spinner, shrinking page height to ~100px, which forced the browser to clamp `window.scrollY` to 0. By the time the table re-rendered tall enough, the saved scrollY was a moving target.
  - **Fix**: `fetchData({ preserveScroll: true })` (the default for op-completion refreshes) now **skips** `setLoading(true)` entirely — existing table stays on screen while the silent refetch runs. No page-height collapse, no scroll clamp.
  - Initial mount explicitly passes `preserveScroll: false` so the loading spinner still shows on first paint.
  - Manually verified: scrolled page to scrollY=1500 → triggered ambient API refresh → scrollY stays exactly at 1500.
  - All 44 regression tests still pass.


  1. **Fix 1 (Scroll preservation, robust)**: `handleOperationSave` and `handleOperationUpdate` now patch the affected WO in place (`setWorkOrders(prev => prev.map(…))`) instead of triggering a full `fetchData()`. This eliminates the heavy re-render that was causing the scroll-to-top issue at child WO level. Full refetch only happens on operation completion (to refresh parent aggregate status), and even then `fetchData` now restores `scrollY` twice (rAF + 150ms timeout) for robust restoration.
  2. **Fix 2 (Cancel requires delete permission)**: Cancel button on MO list is now gated on `canDelete` (was `canEdit`). Backend `PUT /api/work-orders/{id}` with `status='cancelled'` now requires `manufacturing:delete` permission. Edit-only users can no longer cancel MOs from the UI or via direct API call.
  - All 44 regression tests still pass.


  1. **Fix 1 (Scroll position preserved on op-update)**: `fetchData()` now snapshots `window.scrollY` before re-fetching and restores it in a `requestAnimationFrame` after state flush. Operators no longer get bounced to the top of the WO list after completing a job-card operation.
  2. **Fix 2 (MTS item picker shows results only after search)**: Removed the default `eligible.slice(0, 50)` pre-fill. Empty-state prompt "Type a part number or name to search…" shown until user types. Avoids dumping 600+ items on every dialog open.
  3. **Fix 3 (MO creation dialog scrollable)**: Added `max-h-[90vh] overflow-y-auto` to the MO Create dialog. Long forms (especially when variant configurator + multi-component lists appear) now scroll inside the dialog instead of pushing fields off-screen.
  - All 44 regression tests still pass.


  1. **Fix 1 (Cascade cancel)**: PUT /api/work-orders/{id} with status='cancelled' now BFS-walks the entire `parent_wo_id` tree and cancels every uncompleted descendant WO. Completed WOs stay completed (real produced output preserved). Each cancelled descendant's `child_reservations` are released (reserved_stock decremented). The main WO's `cascade_cancelled_children` field lists every child id that was cancelled, for auditability.
  2. **Fix 2 (Preview permission)**: `/api/work-orders/{id}/start?preview=true` now requires only `manufacturing:view` instead of `manufacturing:create`. The actual start (which consumes stock) still requires `manufacturing:edit`. Production operators with view/edit-only access can now see the material consumption preview before requesting an admin to confirm.
  - **Tests**: `/app/backend/tests/test_iteration_106_mo_cancel_cascade_preview_permission.py` — 9 new tests + 35 regression = **44/44 passing**.


  1. **Fix 1 (BOM dialog chips on SG/SA components)**: Hidden chips on SG/SA component rows — those carry stale legacy own variant_attributes. Chips now render only on CP/RM leaves; the "Product Variants" header block already surfaces leaf variants via inheritance.
  2. **Fix 2 (Child WO variant inheritance)**: `create_wo_for_item` was setting `variant_selection=None` for non-main (child) WOs. Now child WOs inherit the parent MO's `variant_selection`, so variant-aware consumption (`_resolve_variant_child_item`) correctly fires at SG → leaf level too.
  3. **Fix 3 (Tax Invoice variant picker)**: Added a variant dropdown beneath the item picker on Tax Invoice lines. When user picks a PARENT item, a dropdown lists every active variant child with `"<suffix> — stock: N <UoM>"`, and a green stock badge appears once selected. The line's item_id swaps to the chosen variant child.
  4. **Fix 4 (Tax Invoice stock decrement)**: `POST /api/crm/tax-invoices` and proforma→tax-invoice conversion now decrement `items.current_stock` for every issued line item. Skipped for draft/cancelled invoices.
  - **Tests**: `/app/backend/tests/test_iteration_105_wo_variant_tax_invoice_stock.py` — 6 new tests + 29 regression = **35/35 passing**.


  1. **BOM → Items navigation speed**: Parallelised 3 sequential on-mount API calls (`/api/item-groups`, `/api/settings/uoms`, `/api/settings/gst-slabs`) into `Promise.allSettled`. Memoised the `variantsByParent` rollup (was recomputed on every render). Result: navigation now ~2.2s (was ~5-10s previously).
  2. **Category column removed** from Items list; **Stock column widened** (`minWidth: 220px`) to fit variant breakdown lines comfortably.
  3. **Auto-generate variants on Update**: when saving a CP/RM item with variant attributes defined, the system now automatically calls `/generate-variants` after the PUT/POST and closes the dialog. Users no longer have to click Update → Generate separately.
  - 29/29 regression tests still pass.


  Root cause of duplicated "Grit Size 16/24/30" entries on production BOM dialog: SG/SA components had stale OWN variant_attributes from legacy data AND their BOMs contained a deeper RM (`CRW0I0000091`) with the correct values. The recursion was showing both layers (4 stale + 1 correct).
  - `_compute_inherited_variants` and `_compute_inherited_variants_breakdown` now treat SG/FG components as **pass-throughs**: ALWAYS prefer recursion into their BOM. Use their own variants only when there are no variant-bearing descendants (legacy fallback).
  - End-to-end verified: an FG with 2 SGs (each with stale own `Grit Size: 16/24/30`) whose BOMs both contain a leaf RM (`Grit Size: 16GT/24GT/30GT`) now returns a single `variant_sources` entry — only the RM leaf. No more duplicates.
  - All 29 regression tests still pass.


  Root cause of "BOM showing old variant name & only 1 axis" on production: FG/SG items had stale legacy `variant_attributes` in DB (e.g. `Grit Size: 16,24,30` without 4-char short codes). The previous "own → inherited" precedence kept returning the stale own and never walked the BOM.
  - `_get_effective_variants(item)` for FG/SG **always prefers inherited** variants from BOM components. Falls back to legacy own only when the FG/SG has no BOM at all (so half-set-up items still show something).
  - `/effective-variants` `source` field now correctly reports `inherited` even when stale own is present.
  - Auto-retire on PUT items is now restricted to **CP/RM categories only** — clearing FG/SG own-variants (which is a cleanup that should be encouraged) no longer accidentally retires BOM-driven variant children.
  - Verified manually: FG-001 with stale own=[Grit Size] returns inherited=[Motor Power, Voltage] from SA-001. All 29 regression tests still pass.


  Addresses production data scenario where parent items had `variant_attributes` cleared but variant children remained as `is_active=true` orphans, polluting the stock rollup column.
  - **Backend**: `PUT /api/items/{id}` now detects when `variant_attributes` is being set to empty `[]`. When the parent has existing variant children (`is_variant=true, parent_item_id=this`), all of them are auto-retired (`is_active=false`). Children stay in DB (stock history preserved) but disappear from rollups.
  - **Frontend**: ItemsPage stock rollup now filters out `is_active=false` variant children. A parent that had its variants cleared no longer shows stale variant lines under its STOCK column.
  - **Production note**: User must redeploy preview → production for both fixes plus all earlier session work (per-component breakdown, variant-child walkup, etc.) to take effect.
  - All 29 regression tests still passing.


  Investigation of user's production BOM (`CRW0I8000001` Rice Whitener) revealed two issues with how inherited variants were displayed in the BOM dialog:
  1. **Per-component breakdown**: When two variant-bearing components share an axis name OR contribute different axes, the merged union didn't make it clear WHICH component contributed WHICH variants. Added `variant_sources: [{component_id, component_part_number, component_name, variant_attributes}]` to the `/effective-variants` response. BOM dialog now renders **per-component** (e.g. `SA-001 — Pump Assembly: Motor Power [1HP][2HP], Voltage [220V][440V]`) when variants are inherited.
  2. **Variant-CHILD reference walkup**: If a BOM line points at a variant child (e.g. `CRW0E8000091-30GT`) instead of the parent component, the helper now walks `is_variant=true → parent_item_id` and uses the parent's `variant_attributes`. Previously the variant axes silently disappeared because variant children carry `variant_attributes=None`.
  3. **FG/SG recursive walk**: `_compute_inherited_variants` now recurses through both `sub_assembly` and `finished_good` BOM components (was only SG before), so deeply nested variant components surface correctly.
  4. **Tests**: `/app/backend/tests/test_iteration_104_variant_sources_breakdown.py` — 5 new tests + 24 regression from iter-99/102/103 = **29/29 passing**.


  1. **Fix 1 (MRP from MOs not SOs)**: `GET /api/mrp/demand` now sources demand from open Manufacturing Orders (status pending/in_progress, materials_reserved≠true, parent_wo_id=null) instead of from Sales Orders. SOs without a created MO generate no MRP demand. MTS MOs without an SO are also captured. Variant-aware: uses `_resolve_variant_child_item` so demand goes against the variant child SKU when the MO has a `variant_selection`.
  2. **Fix 2 (SO Quotation dropdown)**: Quotation picker on SO creation no longer dumps the full list when the dropdown opens. Empty state prompts "Type a quotation # or customer name to search…" — results render only once user types.
  3. **Fix 3 (MTS WO item picker)**: Restricted to items that have an ACTIVE BOM. Avoids creating WOs against items that have no operations/components defined. Driven by a new `itemsWithBom` Set loaded alongside items on mount (single `/api/bom?status=active` fetch).
  - **Tests**: `/app/backend/tests/test_iteration_103_mrp_mo_driven.py` — 5 new tests (SO-without-MO=zero, MO-creates-demand, reserved-shortfall, MTS-without-SO, variant-aware MRP). Plus iter-99 (15) + iter-102 (4) regression = **24/24 passing**.


  1. **Fix 1 (BOM dialog read-only variant axes)**: Already done in prior iteration — BOM dialog shows "Product Variants (inherited from BOM components — read-only)" with axes derived from `/api/items/{id}/effective-variants`. Confirmed matches user's screenshot intent.
  2. **Fix 2 (Variant-aware component consumption)**: When MO has `variant_selection` and a BOM component carries its own `variant_attributes`, WO `/start` now consumes from the matching variant CHILD SKU (e.g. `CRW0E8000091-30GT`) instead of the parent. New backend helper `_resolve_variant_child_item` matches MO's selection against component axes; falls back to parent gracefully if the variant child doesn't exist yet. RM-only components unaffected.
  3. **Fix 3 (MO/SO variant label)**: MO list and SO list views now show a `Variant: 30GT-1.0MM` line beneath the parent SKU/name when `variant_selection` is present. Concatenates picked variant values with `-` (matching the variant SKU suffix convention). Replaced legacy purple SKU chip on SO lines.
  4. **Fix 4 (FG stock rollup on Items page)**: Variant children (`is_variant=true`) are no longer separate rows in the main Items table. Instead the parent FG row shows TOTAL stock (parent + sum of variants) with an inline breakdown listing each variant's suffix → stock (e.g. `16GT: 3 nos`, `30GT-08MM: 3 nos`). One-row-per-SKU experience, no separate scrolling.

  **Tests:** `/app/backend/tests/test_iteration_102_variant_consumption.py` — 4 new tests (variant-aware consumption, fallback, FG credit regression, legacy no-selection). Iter-99 regression still 15/15. Total 19/19.


  1. **BOM dialog component rows**: Removed obsolete `applies_to` filter button ("All variants" / single-value chip). Replaced with read-only navy chips showing the COMPONENT item's own variant values (e.g. SA-001 row shows `1HP 2HP 220V 440V`). Data-testid `component-variant-chips-{index}`. (Fixes 1 & 2)
  2. **Items dialog Generate Variant Items**: Both Generate buttons (CP/RM own and FG/SG inherited) now call a new `persistParentForGenerate()` helper that PUTs the full form payload (description/name/category/etc) before running variant preview/generate. Children now inherit the latest edits, not the cached parent record. (Fix 3)
  3. **BOM → Items navigation speed**: Added `AbortController` scoped to BOMPage lifecycle. Background `/api/bom/{id}/explode` flood (up to 8 concurrent) is now aborted on unmount or `statusFilter` change. Items page's `/api/items?lite=1` no longer queues behind a hundred stale BOM explosion calls. Reduced MAX_PARALLEL from 20→8 for friendlier network usage. (Fix 4)


  Architectural pivot per user requirement. **Variants are now defined ONLY on Component / Raw Material items.** FG/SG items **inherit** their variant axes from variant-bearing BOM components (recursively walking SG sub-BOMs, union of attributes with first-seen short_code winning).

  **Backend (server.py):**
  - `_compute_inherited_variants(item_id)` — walks the active BOM, aggregates variant_attributes from variant-bearing components, recursing into SG sub-BOMs.
  - `_get_effective_variants(item)` — returns own (CP/RM) or inherited (FG/SG with no own attrs) or legacy own (FG/SG with legacy attrs).
  - **New endpoint** `GET /api/items/{id}/effective-variants` → `{source: "own"|"inherited"|"none", variant_attributes}`.
  - `preview-variants` and `generate-variants` now use `_get_effective_variants` so FG/SG with inherited variants can generate child SKUs (e.g. `FG-1-16GT`).
  - MO creation (`POST /api/work-orders`) validates `variant_selection` against effective variants (fixed bug where inherited attrs were rejected).
  - **MO completion path now credits FG stock to the variant child SKU**: if the WO has a `variant_selection`, the system finds (or auto-creates) the corresponding variant child item and increments `current_stock` there instead of the parent. Sets `fg_credited_item_id` and `fg_credited_sku` on the WO doc for auditability.
  - **Fixed pre-existing bug**: `POST /api/work-orders/{wo_id}/start` was returning 404 "Routing not found" for MOs whose routing lives inside `BOM.parent_routings` (routing_id=None). Now resolves the BOM by item_id when the WO has embedded `operations_status`.

  **Frontend:**
  - `ItemsPage.js` — variant editor visible only for `component` / `raw_material`. For `finished_good` / `sub_assembly`, a read-only "**Inherited from BOM components**" block lists the union axes plus a **Generate FG Variant SKUs** button.
  - `BOMPage.js` — read-only variant chips now sourced from `/effective-variants` (so the BOM dialog also shows inherited variants).
  - `ProductionPage.js` (SO) and `ManufacturingPage.js` (MO MTS) — variant selectors now driven by a per-item `effectiveVariantsByItem` cache, lazily fetched from `/effective-variants`.

  **Tests:** `/app/backend/tests/test_iteration_99_variant_inheritance.py` — 15/15 passing (TestEffectiveVariantsEndpoint, TestPreviewVariantsWithInheritance, TestGenerateVariantsWithInheritance, TestRecursiveInheritance, TestMergeDeduplicateVariants, TestWOCompletionVariantCredit, TestLegacyOwnVariantsRegression, TestBOMCRUDRegression, TestSOCRUDRegression, TestItemCRUDRegression).


  Earlier the variant generator lived inside the BOM dialog, which conflated *item-master responsibilities* with *BOM responsibilities*. Moved to where it belongs:
  - **ItemsPage.js**: Item Create/Edit dialog now shows a yellow **"Product Variants (optional)"** block whenever category is `finished_good` or `sub_assembly`. Inline editor with `[attribute name, value chip + 4-char short_code]` rows. A **"Generate Variant Items"** button appears once the item is saved (an item-id is required for the backend call) and the user has entered at least one attribute + value.
  - **BOMPage.js**: Variant block is now **read-only** ("Product Variants (read-only — manage on the Item)") so users see which variants this BOM serves, but cannot accidentally clobber the master from a BOM save. BOM Save no longer issues a `PUT /api/items/{id}` for variant_attributes — separation of concerns is clean.
  - End-to-end verified: Create FG → choose Finished Good → add `Color: Red(RED), Blue Sky(BLUE)` → Save → re-open → click **Generate Variant Items** → child SKUs `FG-XXX-RED`, `FG-XXX-BLUE` are created. Tested on `FG-VAR-TEST-*` items (cleaned up after).
  - No SO/MO/Inventory changes needed — they already consume `parent_item.variant_attributes` and render the value/short_code-tolerant chips fixed earlier today.


  Auto-generates child variant SKUs from a parent FG/SG item's `variant_attributes` so that every combination becomes an independent inventory item (stock, value, invoicing) while sharing one master BOM.

  **Backend (server.py ~L1310-1436):**
  - `POST /api/items/{item_id}/preview-variants` — dry-run; returns every combination + which already exist as children + existing/new counts.
  - `POST /api/items/{item_id}/generate-variants` — creates missing children (inherits category/uom/unit_cost from parent), reactivates retired ones, retires children whose combo no longer exists (when an attribute value is removed). Payload `selected_skus` optional; empty → generate all.
  - Variant child records carry `is_variant=true`, `parent_item_id`, `variant_short_codes` (`{Motor Power: '1HP', Voltage: '220V'}`), `variant_values` and a SKU like `SA-001-1HP-220V`.
  - `variant_attributes` schema upgraded from `[str]` values to `[{value, short_code}]` (short_code = up to 4 chars, [A-Z0-9], auto-derived from value).
  - Helpers: `_normalize_variant_attributes`, `_all_variant_combinations`, `_build_variant_sku_from_short_codes`.

  **Frontend:**
  - `BOMPage.js` — variant chip now has an inline short_code input (max 4 chars) next to each value. New **"Generate Variant Items"** button below the attribute block triggers preview → window.confirm → generate. Toast confirms count.
  - `InventoryPage.js`, `ManufacturingPage.js`, `ProductionPage.js` — variant value rendering normalised to handle both legacy string values and new `{value, short_code}` objects (no more `[object Object]` chips).

  **Tests:** 23/23 backend tests pass (preview, generate-create, idempotent, retire on removal, reactivate, inheritance, BOM/SO/MO regression). See `/app/backend/tests/test_iteration_98_variant_generation.py`.


- **2026-05-11 (final)** — **Phase 2: Attribute-Driven BOM Variants (P1):**
  Single master BOM serves every configuration via `applies_to` filters on each component.

  **Backend:**
  - `Item.variant_attributes`: `[{name: str, values: [str, …]}]` — optional, set on FG/SG items.
  - `BOMComponent.applies_to`: `Dict[str,str]` — when set, component is included only if SO/MO `variant_selection` matches every key/value (AND-logic). Missing/empty = common to all variants.
  - `_filter_components_by_variant(components, variant_selection)` helper at module scope. Applied inside `create_child_work_orders` so child MO explosion and stock auto-reservation honour the variant filter.
  - `ProductionOrderLine.variant_selection` (Dict[str,str]) — saved on each SO line.
  - `WorkOrderCreate.variant_selection` + persisted on the main MO doc. MTO inherits from the SO line if payload omits it. Validation rejects unknown attribute names or invalid values with a clear error.
  - `Item` model accepts `variant_attributes` on PUT — used by the BOM dialog to persist attrs on the parent item.

  **Frontend:**
  - **BOM dialog**: new yellow "Product Variant Attributes" block appears below Description once a parent item is picked. Inline editor for `[name, comma-separated values]` rows. Auto-saved to the parent item on BOM Save.
  - **BOM dialog component row**: new "All variants" / "N filters" toggle button (yellow when filter is active). Opens a modal with one dropdown per attribute — "Any (no filter)" + each defined value. Stored in `component.applies_to`.
  - **Sales Order line**: after picking a BOM, if the parent item has variant_attributes, a yellow "Variant Configuration" block shows dropdowns for each attribute. Selected combination saved on the SO line. Validation reminder shown if any attribute is unchosen.
  - **Manufacturing Order MTS**: same Variant Configuration block when the picked item has variant_attributes. Stored in `workOrderForm.variant_selection` and sent in the MO payload.
  - **Manufacturing Order MTO**: variant_selection automatically inherits from the linked SO line on the backend (no UI changes needed — user already chose it on the SO).

  **Backward compat:** Non-variant BOMs/items keep working unchanged. `applies_to` is optional; missing = "common to all". Existing MOs created before this change have `variant_selection: None` which the filter treats as empty (only common-to-all components included — matches old behaviour).

  **Tested end-to-end (curl):**
  - Set variant_attributes on SA-001 (Motor Power + Voltage) ✅
  - Add `applies_to={'Motor Power': '2HP'}` on one component ✅
  - MTS MO with variant=1HP → filter excludes the 2HP-only component ✅
  - MTS MO with variant=2HP → component included ✅
  - Validation: `Motor Power='99HP'` → rejected with "not a valid value (allowed: ['1HP','2HP','5HP'])" ✅

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
