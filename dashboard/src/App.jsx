// dashboard/src/App.jsx
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import TargetedCompanies from "./pages/Leads.jsx";      // we reuse file, but it will call /api/companies
import HRLeads from "./pages/HRLeads.jsx";              // new file below
import Enrichment from "./pages/Enrichment.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Messages from "./pages/Messages.jsx";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-xl ${isActive ? "bg-blue-600 text-white" : "hover:bg-gray-100 text-gray-800"}`
      }
      end
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
              <NavItem to="/">Dashboard</NavItem>
              <NavItem to="/leads">Targeted Companies</NavItem>
              <NavItem to="/hr-leads">HR Leads</NavItem>
              <NavItem to="/enrichment">Enrichment</NavItem>
              <NavItem to="/messages">Messages</NavItem>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<TargetedCompanies />} />
            <Route path="/hr-leads" element={<HRLeads />} />
            <Route path="/enrichment" element={<Enrichment />} />
            <Route path="/messages" element={<Messages />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
