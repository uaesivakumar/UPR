// dashboard/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

import DashboardHome from "./pages/DashboardHome.jsx";
import CompaniesPage from "./pages/CompaniesPage.jsx";
import HRLeads from "./pages/HRLeads.jsx";
import EnrichmentPage from "./pages/EnrichmentPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import Login from "./pages/Login.jsx";

function Shell({ children }) {
  return (
    <div className="flex h-screen">
      <aside className="w-72 shrink-0 border-r bg-white">
        <Sidebar />
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        <Topbar />
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Shell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardHome />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="hr-leads" element={<HRLeads />} />
          <Route path="enrichment" element={<EnrichmentPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="*" element={<div className="p-6">Not found.</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
