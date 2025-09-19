// dashboard/src/pages/Admin.jsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../utils/auth";

export default function Admin() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-[260px] border-r bg-white">
        <div className="px-4 py-4 text-sm font-semibold text-gray-700">
          UAE Premium Radar
        </div>

        <nav className="px-2 space-y-1">
          <SideItem to="/dashboard" label="Dashboard" />
          <SideItem to="/companies" label="Companies" />
          <SideItem to="/hr-leads" label="HR Leads" />
          <SideItem to="/enrichment" label="Enrichment" />
          <SideItem to="/messages" label="Messages" />
        </nav>

        {/* Company card placeholder (left column) */}
        <div className="m-4 rounded-xl border border-dashed p-4 text-sm text-gray-600">
          <div className="font-medium mb-1">Company</div>
          <div>
            No company selected. Pick one in <span className="font-medium">Companies</span> or use LLM on the{" "}
            <span className="font-medium">Enrichment</span> page.
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-[64px] border-b bg-white flex items-center gap-3 px-4">
          <input
            className="flex-1 rounded-xl border px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            placeholder="Search companies, LinkedIn URLs, or roles..."
            onKeyDown={(e) => {
              // Simple behavior: Enter focuses the Enrichment page (where search happens)
              if (e.key === "Enter") navigate("/enrichment");
            }}
          />
          <button className="rounded-xl bg-gray-900 px-4 py-2 text-white font-medium">
            + Add Lead
          </button>
          <button
            className="rounded-xl border px-4 py-2 text-gray-700 bg-white"
            onClick={() => {
              logout();
              // after clearing token, route to login
              navigate("/login", { replace: true });
            }}
          >
            Logout
          </button>
        </header>

        {/* CONTENT OUTLET (this is what was missing) */}
        <main className="flex-1 p-4 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SideItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 text-[15px] ${
          isActive ? "bg-gray-900 text-white" : "text-gray-800 hover:bg-gray-100"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
