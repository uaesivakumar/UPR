import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

// Reads the last selected company (if any) from localStorage.
// Pages can set it via: localStorage.setItem("upr.company.sidebar", JSON.stringify(company))
function useSidebarCompany() {
  const [company, setCompany] = useState(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("upr.company.sidebar");
      if (raw) setCompany(JSON.parse(raw));
    } catch (_) {
      // ignore parse errors
    }
  }, []);
  return company;
}

export default function Sidebar() {
  const loc = useLocation();
  const company = useSidebarCompany();

  const item = (to, label) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-md px-3 py-2 text-sm font-medium ${
          isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
        }`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <aside className="w-64 shrink-0 border-r bg-white min-h-screen">
      <div className="p-4 text-xs font-semibold tracking-wide text-gray-500">UAE Premium Radar</div>
      <nav className="px-3 space-y-1">
        {item("/dashboard", "Dashboard")}
        {item("/companies", "Companies")}
        {item("/hr-leads", "HR Leads")}
        {item("/enrichment", "Enrichment")}
        {item("/messages", "Messages")}
      </nav>

      {/* Company card (safe if unavailable) */}
      <div className="p-4">
        <div className="text-xs font-semibold tracking-wide text-gray-500 mb-2">Company</div>
        {company ? (
          <div className="rounded-lg border p-3 text-sm">
            <div className="font-semibold">{company.name || "—"}</div>
            <div className="text-gray-600">
              Domain: <span className="font-mono">{company.domain || "—"}</span>
            </div>
            {company.website_url ? (
              <a
                href={company.website_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline text-xs"
              >
                {company.website_url}
              </a>
            ) : null}
            {company.hq ? <div className="text-xs text-gray-600 mt-1">HQ: {company.hq}</div> : null}
            {company.industry ? (
              <div className="text-xs text-gray-600">Industry: {company.industry}</div>
            ) : null}
            {company.size ? <div className="text-xs text-gray-600">Size: {company.size}</div> : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-3 text-xs text-gray-600">
            No company selected. Pick one in <span className="font-medium">Companies</span> or use LLM on the{" "}
            <span className="font-medium">Enrichment</span> page.
          </div>
        )}
      </div>
    </aside>
  );
}
