import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/sidebar.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import DashboardHome from "./pages/DashboardHome.jsx";
import CompaniesPage from "./pages/CompaniesPage.jsx";
import HRLeads from "./pages/HRLeads.jsx";
import EnrichmentPage from "./pages/EnrichmentPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import Admin from "./pages/Admin.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div className="flex min-h-screen bg-gray-50">
          <Sidebar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardHome />} />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/hr-leads" element={<HRLeads />} />
              <Route path="/enrichment" element={<EnrichmentPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
