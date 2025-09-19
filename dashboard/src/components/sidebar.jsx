// dashboard/src/components/sidebar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authFetch } from "../utils/auth";

const LS_KEY = "upr:lastCompanyGuess";

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [company, setCompany] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Listen for broadcasts from Companies/Enrichment pages
  useEffect(() => {
    const handler = (e) => {
      const detail = e?.detail || null;
      setCompany(detail);
      try {
        if (detail) localStorage.setItem(LS_KEY, JSON.stringify(detail));
        else localStorage.removeItem(LS_KEY);
      } catch {}
    };
    window.addEventListener("upr:companySidebar", handler);
    return () => window.removeEventListener("upr:companySidebar", handler);
  }, []);

  const isActive = (to) => pathname.startsWith(to);
  const goCompanies = () => navigate("/companies");
  const goEnrichment = () => navigate("/enrichment");

  return (
    <aside className="w-64 shrink-0 p-4 border-r border-gray-200 bg-gray-50 min-h-screen">
      {/* Brand */}
      <div className="mb-6">
        <div className="text-lg font-semibold">UAE Premium Radar</div>
        <div className="text-xs text-gray-500">Admin Console</div>
      </div>

      {/* Nav */}
      <nav className="space-y-1 mb-4">
        <NavItem to="/dashboard" active={isActive("/dashboard")}>Dashboard</NavItem>
        <NavItem to="/companies" active={isActive("/companies")}>Companies</NavItem>
        <NavItem to="/hr-leads" active={isActive("/hr-leads")}>HR Leads</NavItem>
        <NavItem to="/enrichment" active={isActive("/enrichment")}>Enrichment</NavItem>
        <NavItem to="/messages" active={isActive("/messages")}>Messages</NavItem>
      </nav>

      {/* Dynamic Company Panel */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-gray-700 mb-2">Company</div>
        {!company ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-3 text-xs text-gray-500">
            No company selected. Pick one in <button className="underline" onClick={goCompanies}>Companies</button> or use LLM on the <button className="underline" onClick={goEnrichment}>Enrichment</button> page.
          </div>
        ) : (
          <CompanyCard
            company={company}
            onClear={() => {
              setCompany(null);
              try { localStorage.removeItem(LS_KEY); } catch {}
              // also let any listeners know we cleared
              window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
            }}
            onCreated={(created) => {
              // Replace the guess with the real DB company
              const detail = {
                id: created.id,
                name: created.name,
                domain: created.domain,
                website_url: created.website_url,
                linkedin_url: created.linkedin_url,
              };
              setCompany(detail);
              try { localStorage.setItem(LS_KEY, JSON.stringify(detail)); } catch {}
              // broadcast so Enrichment picks it up as “selected”
              window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail }));
            }}
          />
        )}
      </div>
    </aside>
  );
}

/* ------------ helpers/components ------------ */

function NavItem({ to, active, children }) {
  return (
    <Link
      to={to}
      className={`block px-3 py-2 rounded-lg ${active ? "bg-gray-900 text-white" : "text-gray-800 hover:bg-gray-100"}`}
    >
      {children}
    </Link>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <div className="text-gray-500">{label}</div>
      <div className="text-gray-800 text-right">{children || "—"}</div>
    </div>
  );
}

function CompanyCard({ company, onClear, onCreated }) {
  const isSaved = !!company?.id; // if we already have a DB id
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const name = company?.name || "—";
  const domain = company?.domain || extractDomain(company?.website_url);
  const website = company?.website_url || (domain ? `https://${domain}` : "");
  const linkedin = company?.linkedin_url || "";

  const canCreate = !isSaved && name && (domain || website || linkedin);

  const createCompany = async () => {
    if (!canCreate) return;
    setSaving(true);
    setErr("");
    try {
      const payload = {
        name: name,
        website_url: website || null,
        linkedin_url: linkedin || null,
        domain: domain || null,
        locations: [],
        type: null,
        status: "New",
      };
      const res = await saveJSON("/api/manual/companies", payload);
      if (!res?.id && !(res?.data?.id)) throw new Error(res?.error || "Create failed");
      onCreated?.(res.id ? res : res.data);
    } catch (e) {
      setErr(e.message || "Failed to create company");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  const fields = useMemo(() => ([
    ["Domain", domain ? (<button className="underline" onClick={() => copy(domain)}>{domain}</button>) : "—"],
    ["Website", website ? (<a className="underline" href={website} target="_blank" rel="noreferrer">{short(website)}</a>) : "—"],
    ["LinkedIn", linkedin ? (<a className="underline" href={linkedin} target="_blank" rel="noreferrer">Open</a>) : "—"],
    company?.hq ? ["HQ", company.hq] : null,
    company?.industry ? ["Industry", company.industry] : null,
    company?.size ? ["Size", company.size] : null,
    company?.mode ? ["Mode", company.mode] : null,
  ].filter(Boolean)), [domain, website, linkedin, company]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <div className="font-medium text-gray-900 leading-snug mb-2">{name}</div>
      <div className="space-y-1 mb-3">
        {fields.map(([label, val]) => <Row key={label} label={label}>{val}</Row>)}
      </div>

      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      <div className="flex items-center gap-2">
        {canCreate ? (
          <button
            className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs disabled:opacity-50"
            onClick={createCompany}
            disabled={saving}
            title="Create this company in DB and use it"
          >
            {saving ? "Creating…" : "Create & use"}
          </button>
        ) : isSaved ? (
          <Link
            to={`/companies?search=${encodeURIComponent(name)}`}
            className="px-3 py-1.5 rounded-lg border text-xs"
            title="Open in Companies"
          >
            Open in Companies
          </Link>
        ) : null}

        <button className="px-3 py-1.5 rounded-lg border text-xs" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}

function extractDomain(url = "") {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function short(s = "", n = 28) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
async function saveJSON(url, body) {
  const res = await authFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
