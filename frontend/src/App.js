import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CompanySettingsProvider } from "./context/CompanySettingsContext";
import { ProtectedRoute, PublicRoute } from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ItemsPage from "./pages/ItemsPage";
import BOMPage from "./pages/BOMPage";
import MRPPage from "./pages/MRPPage";
import ProductionPage from "./pages/ProductionPage";
import QualityPage from "./pages/QualityPage";
import InventoryPage from "./pages/InventoryPage";
import InventoryConfigurationPage from "./pages/InventoryConfigurationPage";
import SuppliersPage from "./pages/SuppliersPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import PurchaseInvoicePage from "./pages/PurchaseInvoicePage";
import WarehousesPage from "./pages/WarehousesPage";
import ManufacturingPage from "./pages/ManufacturingPage";
import SettingsPage from "./pages/SettingsPage";
import CustomersPage from "./pages/CustomersPage";
import UserManagementPage from "./pages/UserManagementPage";
import CRMPage from "./pages/CRMPage";
import PublicPrintPage from "./pages/PublicPrintPage";
import JobWorkPage from "./pages/JobWorkPage";
import { Toaster } from "./components/ui/sonner";

function App() {
  return (
    <AuthProvider>
      <CompanySettingsProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          } />

          {/* Public share links (no auth) — used by WhatsApp "text + link" button */}
          <Route path="/public/:doctype/:id" element={<PublicPrintPage />} />

          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="items" element={<ItemsPage />} />
            <Route path="bom" element={<BOMPage />} />
            <Route path="mrp" element={<MRPPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="quality" element={<QualityPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="inventory/configuration" element={<InventoryConfigurationPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
            <Route path="purchase-invoices" element={<PurchaseInvoicePage />} />
            <Route path="warehouses" element={<WarehousesPage />} />
            <Route path="manufacturing" element={<ManufacturingPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="users" element={<UserManagementPage />} />
            <Route path="job-work" element={<JobWorkPage />} />
            <Route path="crm" element={<CRMPage />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </CompanySettingsProvider>
      <Toaster />
    </AuthProvider>
  );
}

export default App;
