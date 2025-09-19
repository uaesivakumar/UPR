import { NavLink, useLocation } from "react-router-dom";
import { useMemo } from "react";

function CompanyCard({ company }) {
  const c = company || {};
  return (
    <div className="rounded-xl border border-zinc-200 p-4 mt-6">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Company</div>
      {!c.name ? (
        <div className="text-sm text-zinc-500">
          No company selected. Pick one in <a className="underline" href="/companies">Companies</a> or use LLM on the{" "}
          <a className="underline" href="/enrichment">Enrichment</a> page.
        </div>
      ) : (
        <>
          <div className="font-semibold leading-tight">{c.name}</div>
          <div className="text-xs text-zinc-500 mt-1">Domain: {c.domain || "—"}</div>
          <div className="text-xs text-zinc-500">Mode: {c.mode || "—"}</div>
          {c.website_url && (
            <div className="text-xs mt-2">
              <a className="text-blue-600 underline" href={c.website_url} target="_blank" rel="noreferrer">Website</a>
            </div>
          )}
          {c.linkedin_url && (
            <div className="text-xs mt-1">
              <a className="text-blue-600 underline" href={c.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a>
            </div>
          )}
          {(c.hq || c.industry || c.size) && (
            <div className="text-xs text-zinc-600 mt-2 space-y-0.5">
              {c.hq && <div>HQ: {c.hq}</div>}
              {c.industry && <div>Industry: {c.industry}</div>}
              {c.size && <div>Size: {c.size}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Sidebar({ company }) {
  const loc = useLocation();
  const links = useMemo(() => ([
    { to: "/", label: "Dashboard" },
    { to: "/companies", label: "Companies" },
    { to: "/hr-leads", label: "HR Leads" },
    { to: "/enrichment", label: "Enrichment" },
    { to: "/messages", label: "Messages" },
  ]), []);

  return (
    <aside className="w-[240px] shrink-0 px-4 py-6 border-r border-zinc-200">
      <div className="text-lg font-semibold mb-6">UAE Premium Radar</div>
      <nav className="flex flex-col gap-1">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              "px-3 py-2 rounded-lg text-sm " +
              (isActive ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100")
            }
            end={l.to === "/"}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <CompanyCard company={company} />
    </aside>
  );
}
