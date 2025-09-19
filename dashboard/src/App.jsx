import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import DashboardHome from "./pages/DashboardHome.jsx";
import CompaniesPage from "./pages/CompaniesPage.jsx";
import EnrichmentPage from "./pages/EnrichmentPage.jsx";
import LeadsPage from "./pages/LeadsPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import Login from "./pages/Login.jsx";
import Sidebar from "./components/sidebar.jsx";

function Shell({ children }) {
  return (
    <div className="min-h-screen flex bg-white">
      <Sidebar /* company comes from Enrichment or Companies when selected */ />
      <main className="flex-1">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Shell>
                <DashboardHome />
              </Shell>
            }
          />
          <Route
            path="/companies"
            element={
              <Shell>
                <CompaniesPage />
              </Shell>
            }
          />
          <Route
            path="/enrichment"
            element={
              <Shell>
                <EnrichmentPage />
              </Shell>
            }
          />
          <Route
            path="/hr-leads"
            element={
              <Shell>
                <LeadsPage />
              </Shell>
            }
          />
          <Route
            path="/messages"
            element={
              <Shell>
                <MessagesPage />
              </Shell>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
