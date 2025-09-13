// dashboard/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/sidebar";           // file is 'sidebar.jsx' (lowercase)
import Topbar from "./components/Topbar";             // file is 'Topbar.jsx' (capital T)
import ProtectedRoute from "./components/ProtectedRoute";

import DashboardHome from "./pages/DashboardHome";    // 'DashboardHome.jsx'
import CompaniesPage from "./pages/CompaniesPage";    // 'CompaniesPage.jsx'
import HRLeads from "./pages/HRLeads";                // 'HRLeads.jsx'
import EnrichmentPage from "./pages/EnrichmentPage";  // 'EnrichmentPage.jsx'
import MessagesPage from "./pages/MessagesPage";      // 'MessagesPage.jsx'
import Login from "./pages/Login";                    // 'Login.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Topbar />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
          <aside className="md:sticky md:top-6 md:h-[calc(100vh-6rem)]">
            <Sidebar />
          </aside>
          <main>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <Routes>
                      <Route index element={<DashboardHome />} />
                      <Route path="companies" element={<CompaniesPage />} />
                      <Route path="hr-leads" element={<HRLeads />} />
                      <Route path="enrichment" element={<EnrichmentPage />} />
                      <Route path="messages" element={<MessagesPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
