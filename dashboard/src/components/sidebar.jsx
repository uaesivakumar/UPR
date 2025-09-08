import { NavLink } from "react-router-dom";

const linkBase =
  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition";
const linkActive = "bg-blue-100 text-blue-700";
const linkIdle = "text-gray-700 hover:bg-gray-100";

export default function Sidebar() {
  return (
    <aside className="h-screen w-64 shrink-0 border-r bg-white p-4 sticky top-0">
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">UAE Premium Radar</h1>
        <p className="text-xs text-gray-500">Admin Console</p>
      </div>

      <nav className="space-y-2">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkIdle}`
          }
        >
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/leads"
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkIdle}`
          }
        >
          <span>Leads</span>
        </NavLink>

        <NavLink
          to="/enrichment"
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkIdle}`
          }
        >
          <span>Enrichment</span>
        </NavLink>

        <NavLink
          to="/messages"
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkIdle}`
          }
        >
          <span>Messages</span>
        </NavLink>
      </nav>
    </aside>
  );
}
