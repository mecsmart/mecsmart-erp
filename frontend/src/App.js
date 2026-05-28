import "@/index.css";
import { useEffect } from "react";
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
import PreviewPdfDialog from "./components/PreviewPdfDialog";
import PromptDialog from "./components/PromptDialog";

function App() {
  // Global watchdog — observe document.body for the `pointer-events: none`
  // style + stray `aria-hidden` attributes Radix Dialog sometimes leaves
  // behind when state updates fire during the dialog close animation. The
  // user-visible symptom on Windows desktop is "I can't type / click
  // anything until I reopen the app". We clear them on the next tick and
  // ask the Electron main window to refocus the renderer.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
    const cleanup = () => {
      try {
        if (document.body.style.pointerEvents === 'none' &&
            !document.querySelector('[role="dialog"][data-state="open"]') &&
            !document.querySelector('[data-state="open"][role="alertdialog"]')) {
          document.body.style.pointerEvents = '';
        }
        if (document.body.style.overflow === 'hidden' &&
            !document.querySelector('[role="dialog"][data-state="open"]') &&
            !document.querySelector('[data-state="open"][role="alertdialog"]')) {
          document.body.style.overflow = '';
        }
        if (document.body.hasAttribute('aria-hidden') &&
            !document.querySelector('[role="dialog"][data-state="open"]')) {
          document.body.removeAttribute('aria-hidden');
        }
      } catch { /* noop */ }
    };
    const obs = new MutationObserver(() => {
      // Debounce: run cleanup on next tick so Radix's own teardown finishes first.
      setTimeout(cleanup, 0);
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ['style', 'aria-hidden'], childList: true, subtree: false });
    // Also ping Electron to refocus the renderer whenever the window
    // regains focus — defensive against alt-tab focus loss.
    const onFocus = () => {
      try { window.mecsmart?.refocusMain?.(); } catch { /* noop */ }
    };
    window.addEventListener('focus', onFocus);
    return () => {
      obs.disconnect();
      window.removeEventListener('focus', onFocus);
    };
  }, []);
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
      {/* Global PDF preview modal — listens for `mecsmart:preview` events
          dispatched from anywhere in the app and renders the printable
          HTML in an in-page iframe with Print + Download actions. Works
          inside Electron without any popup-blocker workaround. */}
      <PreviewPdfDialog />
      <PromptDialog />
    </AuthProvider>
  );
}

export default App;
