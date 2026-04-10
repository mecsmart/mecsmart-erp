# Machinery Manufacturing ERP - Product Requirements Document

## Original Problem Statement
Build a Machinery manufacturing ERP system with Multi Level BOM, MRP and Quality process for windows platform.

## User Choices
- **BOM Features**: Advanced BOM with revision control, effectivity dates, and alternate components
- **MRP Features**: Advanced MRP with lead times, safety stock, and purchase order suggestions
- **Quality Features**: Basic inspection checklists and pass/fail tracking
- **Authentication**: JWT-based custom auth with roles (Admin, Production Manager, Quality Inspector, Inventory Manager)

## Architecture

### Backend
- **Framework**: FastAPI (Python)
- **Database**: MongoDB
- **Authentication**: JWT with httpOnly cookies
- **API Prefix**: All endpoints under `/api`

### Frontend
- **Framework**: React 19
- **UI Library**: Shadcn/UI with Tailwind CSS
- **Design System**: Swiss/High-Contrast (Industrial theme)
- **Fonts**: Chivo (headings), IBM Plex Sans (body), IBM Plex Mono (data)

## User Personas

### Admin
- Full system access
- User management
- All CRUD operations

### Production Manager
- Manage items, BOMs, production orders
- View MRP and inventory
- Cannot manage users

### Quality Inspector
- Create/manage inspection templates
- Record inspections
- View items and BOMs

### Inventory Manager
- Manage inventory transactions
- Update stock levels
- View items and BOMs

## Core Requirements (Static)

### Multi-Level BOM
- Parent-child item relationships
- Revision control (A, B, C...)
- Effectivity dates
- Alternate components support
- BOM explosion view (tree structure)

### MRP (Material Requirements Planning)
- Gross requirement calculation from production orders
- Net requirement = Gross - On Hand + Safety Stock
- Lead time tracking
- Purchase suggestions based on reorder points
- Purchase suggestions based on MRP demand

### Quality Process
- Inspection templates with checklist items
- Inspection records with pass/fail tracking
- Overall result: Pass, Fail, Conditional
- Inspector tracking

### Inventory Management
- Stock level tracking
- Transaction types: Receive, Issue, Adjust
- Safety stock alerts
- Reorder point alerts

## What's Been Implemented (January 2026)

### Backend (server.py)
- [x] JWT authentication with httpOnly cookies
- [x] Role-based access control (4 roles)
- [x] Admin seeding on startup
- [x] Items/Parts CRUD API
- [x] Multi-level BOM management API
- [x] BOM explosion endpoint
- [x] BOM revision creation
- [x] Production orders API
- [x] MRP demand calculation
- [x] MRP purchase suggestions
- [x] Quality inspection templates API
- [x] Quality inspection records API
- [x] Inventory transactions API
- [x] Dashboard statistics API
- [x] Sample data seeding (10 items, 2 BOMs, 2 templates)

### Frontend
- [x] Login page with industrial design
- [x] Dashboard with KPI cards
- [x] Sidebar navigation (responsive)
- [x] Items & Parts management
- [x] BOM management with tree view
- [x] BOM explosion dialog
- [x] MRP demand & suggestions tabs
- [x] Production orders management
- [x] Quality inspections & templates
- [x] Inventory stock & transactions
- [x] All forms use Shadcn dialogs

## Prioritized Backlog

### P0 (Critical) - All Complete
- ✅ Authentication
- ✅ Multi-level BOM
- ✅ MRP calculations
- ✅ Quality inspections
- ✅ Inventory management

### P1 (High Priority)
- [ ] User management page (admin only)
- [ ] Production order material allocation
- [ ] Print/export BOM explosion
- [ ] Purchase order generation from MRP suggestions

### P2 (Medium Priority)
- [ ] Workstation/routing management
- [ ] Production scheduling
- [ ] Quality SPC charts
- [ ] Non-conformance reports
- [ ] Supplier management

### P3 (Low Priority)
- [ ] Barcode scanning integration
- [ ] Email notifications
- [ ] Report templates
- [ ] Data import/export (CSV/Excel)
- [ ] Audit trail logging

## Next Tasks

1. Add user management page for admin to create/edit users
2. Implement purchase order generation from MRP suggestions
3. Add production order material allocation (show required vs available)
4. Add BOM export to PDF/Excel
5. Implement quality non-conformance reports
