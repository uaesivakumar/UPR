import { useEffect, useState } from "react";

/**
 * Sidebar shows either:
 * - selectedCompany (from CompaniesPage row click or LLM guess), or
 * - a helpful empty-state hint.
 *
 * Broadcast event: `upr:companySidebar`  { id, name, domain, website_url, linkedin_url, ... }
 * We persist to localStorage so it survives refreshes.
 */

export default function Sidebar() {
  const [company, setCompany] = useState(() => {
    try {
      const s = localStorage.getItem("upr:selectedCompany");
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handler = (e) => {
      const c = e?.detail || null;
      setCompany(c);
      try {
        if (c) localStorage.setItem("upr:selectedCompany", JSON.stringify(c));
        else localStorage.removeItem("upr:selectedCompany");
      } catch {}
    };
    window.addEventListener("upr:companySidebar", handler);
    return () => window.removeEventListener("upr:companySidebar", handler);
  }, []);

  const clear = () => {
    setCompany(null);
    try { localStorage.removeItem("upr:selectedCompany"); } catch {}
    window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
  };

  return (
    <aside className="px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Company</div>

      {/* Empty state ONLY when no company */}
      {!company && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
          No company selected. Pick one in <a className="underline" href="/companies">Companies</a> or use LLM on the <a className="underline" href="/enrichment">Enrichment</a> page.
        </div>
      )}

      {/* Company card */}
      {company && (
        <div className="rounded-xl border bg-white p-4">
          <div className="text-center">
            <div className="text-sm font-semibold text-gray-900">{company.name || "—"}</div>
            <div className="mt-1 text-xs text-gray-500">Domain: <span className="font-mono">{company.domain || "—"}</span></div>
            <div className="mt-0.5 text-[11px] text-gray-400">Mode: {company.mode || "—"}</div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
              onClick={() => window.dispatchEvent(new CustomEvent("upr:companyUseNow", { detail: company }))}
              title="Create in DB (if needed) and use for saving HR leads"
            >
              Create &amp; use
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={clear}
              title="Clear selected company"
            >
              Clear
            </button>
          </div>

          <div className="mt-3 space-y-1 text-xs">
            {company.website_url && (
              <div>
                <a className="text-blue-600 underline" href={company.website_url} target="_blank" rel="noreferrer">
                  {company.website_url}
                </a>
              </div>
            )}
            {company.linkedin_url && (
              <div>
                <a className="text-blue-600 underline" href={company.linkedin_url} target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
              </div>
            )}
            {company.hq && <div className="text-gray-600">HQ: {company.hq}</div>}
            {company.industry && <div className="text-gray-600">Industry: {company.industry}</div>}
            {company.size && <div className="text-gray-600">Size: {company.size}</div>}
          </div>
        </div>
      )}
    </aside>
  );
}
