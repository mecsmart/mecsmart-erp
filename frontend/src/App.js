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
    if (typeof window === 'undefined') return;
    const isAnyDialogOpen = () => !!(
      document.querySelector('[role="dialog"][data-state="open"]') ||
      document.querySelector('[role="alertdialog"][data-state="open"]') ||
      document.querySelector('[data-radix-popper-content-wrapper] [data-state="open"]')
    );
    const cleanup = (force) => {
      try {
        const dialogOpen = isAnyDialogOpen();
        // When NO dialog is open, fully release the body lock.
        if (force || !dialogOpen) {
          let touched = false;
          if (document.body.style.pointerEvents === 'none') { document.body.style.pointerEvents = ''; touched = true; }
          if (document.body.style.overflow === 'hidden') { document.body.style.overflow = ''; touched = true; }
          if (document.body.hasAttribute('aria-hidden')) { document.body.removeAttribute('aria-hidden'); touched = true; }
          if (document.body.hasAttribute('data-scroll-locked')) { document.body.removeAttribute('data-scroll-locked'); touched = true; }
          if (document.documentElement.style.pointerEvents === 'none') { document.documentElement.style.pointerEvents = ''; touched = true; }
          if (touched && window.mecsmart?.refocusMain) {
            try { window.mecsmart.refocusMain(); } catch { /* noop */ }
          }
        } else {
          // A dialog IS open but inputs may still be unresponsive because
          // Radix left `pointer-events:none` on <html> or body even though
          // it should only block the BACKDROP. Clear those — the dialog
          // itself isolates pointer events via its own container.
          if (document.documentElement.style.pointerEvents === 'none') document.documentElement.style.pointerEvents = '';
          if (document.body.style.pointerEvents === 'none') document.body.style.pointerEvents = '';
        }
      } catch { /* noop */ }
    };
    // 1) Mutation observer — catches Radix's own teardown re-applies.
    let obs = null;
    if (typeof MutationObserver !== 'undefined') {
      obs = new MutationObserver(() => setTimeout(() => cleanup(false), 0));
      obs.observe(document.body, { attributes: true, attributeFilter: ['style', 'aria-hidden', 'data-scroll-locked'], childList: true, subtree: false });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    }
    // 2) Periodic interval — heals any cases the mutation observer missed
    //    (e.g. Radix mutates a CSSStyleDeclaration prop the observer can't
    //    see directly, or styles get re-applied between obs callbacks).
    const iv = setInterval(() => cleanup(false), 500);
    // 3) On window focus, force a refocus into the renderer.
    const onFocus = () => {
      try { window.mecsmart?.refocusMain?.(); } catch { /* noop */ }
      cleanup(false);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      if (obs) obs.disconnect();
      clearInterval(iv);
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
