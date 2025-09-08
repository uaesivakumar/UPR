import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Sparkles, MessagesSquare } from "lucide-react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/enrichment", label: "Enrichment", icon: Sparkles },
  { to: "/messages", label: "Messages", icon: MessagesSquare },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="h-16 px-5 flex items-center">
        <div className="text-lg font-semibold tracking-tight">UAE Premium Radar</div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
               ${isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 text-xs text-gray-500">Admin Console</div>
    </aside>
  );
}
