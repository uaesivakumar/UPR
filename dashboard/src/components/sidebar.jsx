// dashboard/src/components/sidebar.jsx
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

const NavItem = ({ to, label }) => {
  const { pathname } = useLocation();
  const active =
    (to === "/" && pathname === "/") || (to !== "/" && pathname.startsWith(to));
  return (
    <Link
      to={to}
      className={
        "block rounded-md px-3 py-2 text-sm font-medium transition " +
        (active
          ? "bg-gray-900 text-white"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900")
      }
    >
      {label}
    </Link>
  );
};

function CompanyMiniCard() {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    // Enrichment page should `sessionStorage.setItem("enrich_company", JSON.stringify({...}))`
    try {
      const raw =
        sessionStorage.getItem("enrich_company") ||
        localStorage.getItem("enrich_company");
      if (raw) setCompany(JSON.parse(raw));
    } catch {}
  }, []);

  if (!company) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-3 text-xs text-gray-600">
        <div className="mb-1 font-semibold uppercase tracking-wide text-gray-500">
          Company
        </div>
        <div>No company selected. Pick one in <Link to="/companies" className="underline">Companies</Link> or use LLM on the <Link to="/enrichment" className="underline">Enrichment</Link> page.</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Company
      </div>
      <div className="text-sm font-semibold leading-tight">
        {company.name || "—"}
      </div>
      <div className="mt-1 text-xs text-gray-600">
        <div className="truncate">
          <span className="font-medium">Domain:</span>{" "}
          {company.domain || "—"}
        </div>
        {company.website_url && (
          <div className="truncate">
            <a
              className="text-blue-600 hover:underline"
              href={company.website_url}
              target="_blank"
              rel="noreferrer"
            >
              {company.website_url}
            </a>
          </div>
        )}
        {company.linkedin_url && (
          <div className="truncate">
            <a
              className="text-blue-600 hover:underline"
              href={company.linkedin_url}
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          </div>
        )}
        {company.hq && (
          <div className="truncate">
            <span className="font-medium">HQ:</span> {company.hq}
          </div>
        )}
        {company.industry && (
          <div className="truncate">
            <span className="font-medium">Industry:</span> {company.industry}
          </div>
        )}
        {company.size && (
          <div className="truncate">
            <span className="font-medium">Size:</span> {company.size}
          </div>
        )}
        {company.mode && (
          <div className="truncate">
            <span className="font-medium">Mode:</span> {company.mode}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sidebar() {
  // Fixed, full-height left rail; reserve width with a spacer div in App layout
  return (
    <>
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 flex-col border-r bg-white md:flex">
        <div className="p-4">
          <div className="text-lg font-semibold">UAE Premium Radar</div>
          <div className="text-xs text-gray-500">Admin Console</div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          <NavItem to="/" label="Dashboard" />
          <NavItem to="/companies" label="Companies" />
          <NavItem to="/hr-leads" label="HR Leads" />
          <NavItem to="/enrichment" label="Enrichment" />
          <NavItem to="/messages" label="Messages" />
        </nav>

        <div className="p-3">
          <CompanyMiniCard />
        </div>
      </aside>

      {/* spacer to reserve the fixed sidebar’s width on md+ */}
      <div className="hidden w-64 shrink-0 md:block" />
    </>
  );
}
