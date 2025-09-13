// dashboard/src/App.jsx
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";

import DashboardHome from "./pages/DashboardHome.jsx";
import CompaniesPage from "./pages/CompaniesPage.jsx";
import HRLeads from "./pages/HRLeads.jsx";
import EnrichmentPage from "./pages/EnrichmentPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";

// Optional pages you already have in the folder list:
import AdminDashboard from "./pages/AdminDashboard.jsx";
import Login from "./pages/Login.jsx";

function NavItem({ to, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-3 py-2 rounded-xl ${isActive ? "bg-blue-600 text-white" : "hover:bg-gray-100 text-gray-800"}`
      }
    >
      {children}
    </NavLink>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-10 bg-white border-b">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <div className="text-xl font-semibold">UPR — UAE Premium Radar</div>
            <nav className="flex gap-2">
              <NavItem to="/" end>Dashboard</NavItem>
              <NavItem to="/companies">Targeted Companies</NavItem>
              <NavItem to="/hr-leads">HR Leads</NavItem>
              <NavItem to="/enrichment">Enrichment</NavItem>
              <NavItem to="/messages">Messages</NavItem>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/hr-leads" element={<HRLeads />} />
            <Route path="/enrichment" element={<EnrichmentPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<div className="text-sm text-gray-600">Not found.</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
