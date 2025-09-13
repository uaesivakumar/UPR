// dashboard/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/sidebar";
import Topbar from "./components/Topbar";
import ProtectedRoute from "./components/ProtectedRoute";

import DashboardHome from "./pages/DashboardHome";
import CompaniesPage from "./pages/CompaniesPage";
import HRLeads from "./pages/HRLeads";
import EnrichmentPage from "./pages/EnrichmentPage";
import MessagesPage from "./pages/MessagesPage";
import Login from "./pages/Login";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div className="min-h-screen bg-gray-50">
                <Topbar />
                <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
                  <Sidebar />
                  <div className="space-y-6">
                    <Routes>
                      <Route index element={<DashboardHome />} />
                      <Route path="companies" element={<CompaniesPage />} />
                      <Route path="hr-leads" element={<HRLeads />} />
                      <Route path="enrichment" element={<EnrichmentPage />} />
                      <Route path="messages" element={<MessagesPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </div>
                </div>
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
