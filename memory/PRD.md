# MecSmart ERP — PRD

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for Windows platform (branded as **MecSmart ERP**).

## Core Requirements
- Advanced BOM with revision control, alternate components, and hierarchical explosion.
- Advanced MRP with lead times, safety stock, and PO suggestions.
- Quality inspection checklists.
- JWT-based custom auth with roles (10 min idle timeout).
- Procurement, Stores, Subcontracting/Job Work flows.
- CRM Module (Quotations, Proforma Invoices, Tax Invoices, Packing Lists).
- GST-compliant tax invoices (CGST/SGST/IGST logic based on Place of Supply).
- Direct Excel import/export (server-side, `openpyxl`).

## Tech Stack
- **Backend:** FastAPI (monolithic `server.py` — P4 refactor pending), MongoDB (Motor)
- **Frontend:** React + React Router + TailwindCSS + shadcn/ui
- **Auth:** JWT custom (cookie-based), 10min idle timeout
- **Excel:** `openpyxl` (server-side only; `xlsx` npm removed for security)

## Changelog (recent)
- **2026-02-23** — Added dedicated **Inventory Configuration** page at `/inventory/configuration`.
  - Hosts **Item Groups** (moved from Inventory tab) + **Default PO Terms & Conditions** (moved from Settings → PO Section).
  - Sidebar "Configuration" link (Inventory group, positioned last) now routes to this page.
  - Configuration is intended as the catch-all for any future inventory-module settings.
- Session idle timeout 10 min + auto-sliding.
- Manual GRN endpoint `POST /api/grn/manual` + frontend dialog.
- Universal search-as-you-type `SearchableItemSelect` / `SearchableSelect` across PO, SO, GRN, Quotation, TI, Support Ticket.
- Item Groups (collection + cascading HSN/GST to items).
- GST-compliant Tax Invoices (CGST/SGST/IGST + HSN summary + UPI QR).
- Number Series compact FY format (e.g. INV262700001).
- Rebranded globally to **MecSmart ERP**.

## Roadmap / Backlog
- **P2** GSP e-Invoice integration (IRN + signed QR from GST portal).
- **P3** Dispatch Manager panel.
- **P4** Refactor `/app/backend/server.py` (>10k lines) into routers (`auth.py`, `inventory.py`, …).
- **P5** GST Compliance Phase 3 — GSTR-1/3B report formats + ITC tracking.
- **P6** Barcode/QR scanning for inventory transactions.
- **Future** Windows desktop wrapper (Electron/Tauri).

## Key Files
- `/app/frontend/src/pages/InventoryConfigurationPage.js` — new dedicated Config page.
- `/app/frontend/src/components/Layout.js` — sidebar nav.
- `/app/frontend/src/pages/InventoryPage.js` — Stock + Transactions tabs only.
- `/app/frontend/src/pages/SettingsPage.js` — PO Charges tab (T&C removed).
- `/app/backend/server.py` — all APIs (refactor pending).

## Test Credentials
See `/app/memory/test_credentials.md`.
