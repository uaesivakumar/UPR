import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import CompanySidebarCard from "../features/enrichment/CompanySidebarCard";

/**
 * Sidebar with menu + dynamic Company panel (appears on Enrichment when available).
 * We listen for a window event:  window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: company }))
 */
export default function Sidebar() {
  const { pathname } = useLocation();
  const [company, setCompany] = useState(null);

  useEffect(() => {
    const handler = (e) => setCompany(e.detail || null);
    window.addEventListener("upr:companySidebar", handler);
    return () => window.removeEventListener("upr:companySidebar", handler);
  }, []);

  const item = (to, label) => {
    const active = pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`block px-3 py-2 rounded-lg ${active ? "bg-gray-900 text-white" : "text-gray-800 hover:bg-gray-100"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <aside className="w-64 shrink-0 p-4 border-r border-gray-200 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <div className="text-lg font-semibold">UAE Premium Radar</div>
        <div className="text-xs text-gray-500">Admin Console</div>
      </div>

      <nav className="space-y-1">
        {item("/dashboard", "Dashboard")}
        {item("/companies", "Companies")}
        {item("/hr-leads", "HR Leads")}
        {item("/enrichment", "Enrichment")}
        {item("/messages", "Messages")}
      </nav>

      {/* Dynamic company card under menu (uses available vertical space) */}
      <CompanySidebarCard company={company} />
    </aside>
  );
}
