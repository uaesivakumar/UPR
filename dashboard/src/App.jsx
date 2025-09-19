// dashboard/src/App.jsx
import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

// Layout
import Admin from "./pages/Admin.jsx";

// Pages
import Login from "./pages/Login.jsx";
import DashboardHome from "./pages/DashboardHome.jsx";
import CompaniesPage from "./pages/CompaniesPage.jsx";
import HRLeads from "./pages/HRLeads.jsx";
import EnrichmentPage from "./pages/EnrichmentPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";

/* ------------------------------ Auth Guard ------------------------------ */
// Look for a token (match common keys used in utils/auth)
function hasToken() {
  return Boolean(
    localStorage.getItem("upr_token") || localStorage.getItem("upr_jwt")
  );
}

function RequireAuth({ children }) {
  const location = useLocation();
  if (!hasToken()) {
    // bounce to login, keep where we came from
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

/* ------------------------------- The App ------------------------------- */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected (uses Admin layout with <Outlet />) */}
        <Route
          element={
            <RequireAuth>
              <Admin />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/hr-leads" element={<HRLeads />} />
          <Route path="/enrichment" element={<EnrichmentPage />} />
          <Route path="/messages" element={<MessagesPage />} />
        </Route>

        {/* Root → dashboard, any unknown → dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
