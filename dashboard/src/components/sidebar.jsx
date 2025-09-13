// dashboard/src/components/sidebar.jsx
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { getToken, logout as clientLogout } from "../utils/auth";
import { useCallback } from "react";

/**
 * Sidebar with:
 * - App brand
 * - Nav links (Dashboard, Companies, HR Leads, Enrichment, Messages)
 * - Logout button (calls /api/auth/logout best-effort, clears token, redirects to /login)
 *
 * Tailwind-only, minimal and clean.
 */
export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const doLogout = useCallback(async () => {
    // Best-effort server logout (session mode). Token-mode will just ignore this.
    try {
      const token = getToken();
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // ignore
    }
    // Client-side cleanup & redirect
    clientLogout(); // clears token + redirects to /login
  }, []);

  const linkBase =
    "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition";
  const active = "bg-gray-900 text-white shadow";
  const inactive = "text-gray-700 hover:bg-gray-100";

  const nav = [
    { to: "/", label: "Dashboard", icon: DashboardIcon },
    { to: "/companies", label: "Companies", icon: CompaniesIcon }, // renamed
    { to: "/hr-leads", label: "HR Leads", icon: HRLeadsIcon },     // new
    { to: "/enrichment", label: "Enrichment", icon: EnrichmentIcon },
    { to: "/messages", label: "Messages", icon: MessagesIcon },
  ];

  return (
    <aside className="hidden md:flex md:flex-col w-64 border-r border-gray-200 bg-white">
      {/* Brand */}
      <div className="h-16 px-5 flex items-center border-b border-gray-200">
        <div className="flex items-center gap-2">
          <LogoIcon />
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold text-gray-900">
              UAE Premium Radar
            </span>
            <span className="text-xs text-gray-500">Admin Console</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${linkBase} ${isActive ? active : inactive}`
            }
            end={to === "/"}
          >
            <Icon active={location.pathname === to} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={doLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gray-100 text-gray-800 hover:bg-gray-200 transition"
          aria-label="Log out"
        >
          <LogoutIcon />
          <span className="text-sm font-medium">Logout</span>
        </button>
        <p className="mt-2 text-[11px] text-gray-400 text-center">
          You can log back in anytime.
        </p>
      </div>
    </aside>
  );
}

/* --- Tiny inline icons (neutral, no external deps) --- */

function LogoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-gray-900">
      <path
        d="M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0Zm4.5 0a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DashboardIcon({ active }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className={active ? "text-white" : "text-gray-600"}
    >
      <path
        d="M3 3h8v8H3V3Zm10 0h8v5h-8V3ZM3 13h8v8H3v-8Zm10 7v-8h8v8h-8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CompaniesIcon({ active }) {
  // simple "buildings" icon
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className={active ? "text-white" : "text-gray-600"}
    >
      <path
        d="M3 21V6l8-3 8 3v15H3Zm2-2h5V7L5 8.8V19Zm7 0h5V9l-5-1.9V19Zm-4-7h2v2H8v-2Zm0-3h2v2H8V9Zm7 6h2v2h-2v-2Zm0-3h2v2h-2v-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HRLeadsIcon({ active }) {
  // simple "person" icon
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className={active ? "text-white" : "text-gray-600"}
    >
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EnrichmentIcon({ active }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className={active ? "text-white" : "text-gray-600"}
    >
      <path
        d="M12 2 2 7l10 5 10-5-10-5Zm0 7-7.5-3.75L12 3.5l7.5 3.75L12 9Zm-8 4 8 4 8-4v6l-8 4-8-4v-6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MessagesIcon({ active }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className={active ? "text-white" : "text-gray-600"}
    >
      <path
        d="M4 4h16v12H7l-3 3V4Zm2 4h12V6H6v2Zm0 4h8v-2H6v2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="text-gray-700">
      <path
        d="M10 17v2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5v2H5v10h5Zm9-5-3-3v2h-8v2h8v2l3-3Z"
        fill="currentColor"
      />
    </svg>
  );
}
