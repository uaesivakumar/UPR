// dashboard/src/App.jsx
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import Sidebar from "./components/sidebar";
import Topbar from "./components/Topbar";
import ProtectedRoute from "./components/ProtectedRoute";

// Pages
import DashboardHome from "./pages/DashboardHome.jsx";
import CompaniesPage from "./pages/CompaniesPage.jsx";
import HRLeads from "./pages/HRLeads.jsx";
import EnrichmentPage from "./pages/EnrichmentPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import Login from "./pages/Login.jsx";

import "./App.css";

/**
 * Common shell used by all protected routes
 */
function Layout() {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar />
        <main className="p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardHome />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="hr-leads" element={<HRLeads />} />
          <Route path="enrichment" element={<EnrichmentPage />} />
          <Route path="messages" element={<MessagesPage />} />

          {/* Legacy/aliases */}
          <Route path="leads" element={<Navigate to="/companies" replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
