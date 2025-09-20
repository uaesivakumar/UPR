import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

/* Shell UI */
import Sidebar from "./components/sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

/* Pages */
import DashboardHome from "./pages/DashboardHome.jsx";
import CompaniesPage from "./pages/CompaniesPage.jsx";
import HRLeads from "./pages/HRLeads.jsx";
import EnrichmentPage from "./pages/EnrichmentPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";

function Shell({ children }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50">
      <div className="flex h-full">
        <aside className="w-[260px] shrink-0 border-r bg-white">
          <Sidebar />
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b bg-white">
            <Topbar />
          </header>
          <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
        </section>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected app */}
        <Route element={<ProtectedRoute />}>
          <Route
            path="/dashboard"
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
            path="/hr-leads"
            element={
              <Shell>
                <HRLeads />
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
            path="/messages"
            element={
              <Shell>
                <MessagesPage />
              </Shell>
            }
          />
          <Route
            path="/admin"
            element={
              <Shell>
                <Admin />
              </Shell>
            }
          />
        </Route>

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
