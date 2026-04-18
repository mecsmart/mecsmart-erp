# Machinery Manufacturing ERP - PRD

## Architecture
- Backend: FastAPI + MongoDB (Motor), JWT httpOnly cookies, /api prefix
- Frontend: React 19 + Shadcn/UI + Tailwind CSS

## Job OS Flow (Final)
- Outsource ops → Consolidated SC (same supplier, dc_created=false). Charges are per-unit (NOT summed when same item appears twice).
- Send DC → "Job Work Order Cum Delivery Challan" print format (Job OS ONLY)
  - Columns: SL, Part No & Name, HSN, Qty, UOM, Charges/Unit, Total Charges, RM Cost/Unit, Total Amount
- NO PO for Job OS — Receive via GRN directly using JW number
- GRN page shows both SC with RM and Job OS pending orders
- Job Card: For outsourced ops, Stop/Complete buttons hidden; "Outsourced — Receive via GRN" badge shown instead.

## SC with RM Flow
- SC → Send DC (HSN in print) → Receive via GRN from Stores page
- DC print: "Delivery Challan" with 6-col Part Details + RM Issued sections (NOT 9-col Job OS format)

## Changelog
- 2026-02-18 (iter 50): Fixed Job OS regressions — consolidation no longer doubles per-unit charges; DC print format conditional (9-col for Job OS, 6-col for standard SC); Job Card hides Stop/Complete for outsourced ops.
- 2026-02-18 (iter 51): Job Card UX polish — outsourced op badge now shows `JW: JW-000XXX — Receive via GRN` (reads from `op.outsource_sc_order_number`, persisted by backend on outsource). Removed "Manufacturing Order Tree" section from Job Card dialog. Tested & verified.
- 2026-02-18 (iter 52): (a) Renamed "Processing Charges" → "Processing Charges / Unit" in Start Operation dialog. (b) Fixed DC print isJobOS check — was broken because Job OS DCs are created WITH lines; now uses `dc.order.subcontract_type === 'without_material' && job_work_parts.length > 0`. (c) Sales Order reference chip (`SO: SO-000XXX`) now displayed on parent MO summary row and in Job Card dialog header.
- 2026-02-18 (iter 53): Four features: (a) Job OS DC RM Cost/Unit now reflects BOM raw material cost ONLY (excluded process cost). (b) Added Purchase Price field on items; PO creation auto-updates item.purchase_price & unit_cost to the latest PO line rate. (c) Inventory page now shows Warehouse column (per-warehouse breakdown) and requires warehouse selection on stock-changing transactions. (d) New Settings → "Number Series" tab for configurable prefix + start # + padding for Vendor/Customer/PO/Sales Invoice; codes auto-generated for new vendors/customers. All verified (19/19 backend + FE).
- 2026-02-18 (iter 54): (Fix 1) MO→SC without_material flow: hid "Send DC" button; Create PO button shows as intended. (Fix 2) BOM routings now support per-operation cost: each routing entry is {name, cost}. Per-component process_cost_per_unit = sum of routing costs. Parent & Component routings both support cost inputs. Legacy list-of-strings routings remain backward compatible (normalized to cost=0). BOM explode prioritizes BOM routing costs over SC/WO-derived costs.
- 2026-02-18 (iter 55): Five items: (1) BOM rollup now correctly includes FG (parent) process cost — explode response returns fg_process_cost_per_unit, components_cost, and total_rollup_cost. Sub-assembly BOMs also include their own FG process in rolled-up unit_cost. (2) BOM Print enriched with Process Cost column, routing names+costs per row, and summary block (Components Cost + FG Process Cost + Total). (3) BOM Excel export/import uses "Name:Cost" format for routings; backwards compat with plain "Name". (4) Job Card operations table shows new Duration column (elapsed time from runs[] or actual_start/_end; "N min (running)" for in-progress). (5) DC Print has new "Process" column after Part No. & Name; backend stores process_name on Job OS sc_part for consolidation (item_id + process_name match).

## BOM
- Extended Cost = Total/Unit × Qty (material + process)
- Process cost from SC charges (priority) + WO operations (fallback)

## Backlog
- [ ] Purchase Invoice from GRN with process cost
- [ ] P1: GST Phase 2, P2: Backend refactoring
