import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../../utils/auth";

export default function EnrichmentView() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [company, setCompany] = useState(null); // left sidebar company (LLM guess or selected)
  const [quality, setQuality] = useState(null);
  const [timings, setTimings] = useState({}); // { llm_ms, provider_ms, smtp_ms }

  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState({}); // id->bool
  const [savingCompanyId, setSavingCompanyId] = useState(""); // when we need to save into an existing company
  const [companiesForSelect, setCompaniesForSelect] = useState([]);

  // status lights
  const [status, setStatus] = useState({ data: "live", db_ok: true, llm_ok: true });

  // Listen for selection broadcasted from Companies page (if user clicks a row there)
  useEffect(() => {
    const handler = (e) => {
      const c = e.detail || null;
      if (c) {
        setCompany({
          name: c.name,
          domain: c.domain || (c.website_url ? tryUrlToDomain(c.website_url) : null),
          website_url: c.website_url || null,
          linkedin_url: c.linkedin_url || null,
          hq: c.hq || null,
          industry: c.industry || null,
          size: c.size || null,
          mode: "Selected",
        });
        setSavingCompanyId(c.id);
      }
    };
    window.addEventListener("upr:companySidebar", handler);
    return () => window.removeEventListener("upr:companySidebar", handler);
  }, []);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const r = await authFetch("/api/enrich/status");
        const j = await r.json();
        if (!abort && j?.ok) {
          const d = j.data || {};
          setStatus({ data: d.data_source, db_ok: !!d.db_ok, llm_ok: !!d.llm_ok });
        }
      } catch {}
    })();
    return () => { abort = true; };
  }, []);

  // Preload company list for "save into" dropdown
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const r = await authFetch(`/api/companies?sort=created_at.desc&limit=100`);
        const j = await r.json();
        if (!abort && j?.ok) setCompaniesForSelect(j.data || []);
      } catch {}
    })();
    return () => { abort = true; };
  }, []);

  const allChecked = useMemo(() => {
    if (!rows.length) return false;
    return rows.every((r) => selected[r._id]);
  }, [rows, selected]);

  const toggleAll = () => {
    if (!rows.length) return;
    const next = {};
    if (!allChecked) rows.forEach((r) => { next[r._id] = true; });
    setSelected(next);
  };

  const run = async () => {
    if (!query.trim() && !savingCompanyId) return;
    setLoading(true);
    setErr("");
    setRows([]);
    setSelected({});
    setQuality(null);
    setTimings({});

    try {
      if (savingCompanyId) {
        // If a company is already chosen (from sidebar), we *could* call POST /api/enrich to write into DB.
        // Here, we keep non-destructive search UX; user can still “Add to HR Leads” from results.
      }

      const endpoint = `/api/enrich/search?q=${encodeURIComponent(query.trim() || company?.name || "")}`;
      const r = await authFetch(endpoint);
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Search failed");

      const data = j.data || {};
      const guess = data.summary?.company_guess || null;
      setCompany(guess || null);
      setQuality(data.summary?.quality || null);
      setTimings(data.summary?.timings || {});
      setRows((data.results || []).map((it, idx) => ({ ...it, _id: `${idx}_${it.email || it.linkedin_url || it.name}` })));
    } catch (e) {
      setErr(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const createCompanyAndUse = async () => {
    if (!company?.name) return;
    try {
      const payload = {
        name: company.name,
        website_url: company.website_url || (company.domain ? `https://www.${company.domain}` : null),
        linkedin_url: company.linkedin_url || null,
        domain: company.domain || null,
        type: null,
        status: "New",
        locations: [],
      };
      const r = await authFetch("/api/manual/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Create failed");
      setSavingCompanyId(j.id || j.data?.id);
      // refresh dropdown
      const rr = await authFetch(`/api/companies?sort=created_at.desc&limit=100`);
      const jj = await rr.json();
      if (jj?.ok) setCompaniesForSelect(jj.data || []);
    } catch (e) {
      alert(e.message || "Create failed");
    }
  };

  const addSelectedToLeads = async () => {
    if (!savingCompanyId) return;
    const chosen = rows.filter((r) => selected[r._id]);
    if (!chosen.length) return;

    let okCount = 0, failCount = 0;
    for (const c of chosen) {
      try {
        const payload = {
          company_id: savingCompanyId,
          name: c.name,
          designation: c.designation,
          email: c.email || null,
          linkedin_url: c.linkedin_url || null,
          role_bucket: c.role_bucket || null,
          seniority: c.seniority || null,
          email_status: c.email_status || "unknown",
        };
        const r = await authFetch("/api/manual/hr-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || "Save failed");
        okCount++;
      } catch {
        failCount++;
      }
    }
    alert(`Saved ${okCount} lead(s)${failCount ? `, ${failCount} failed` : ""}.`);
  };

  return (
    <div className="grid grid-cols-12 gap-6 p-6">
      {/* Sidebar: Company card (sticky) */}
      <aside className="col-span-12 md:col-span-3">
        <CompanyCard
          company={company}
          quality={quality}
          onCreateAndUse={createCompanyAndUse}
          onClear={() => { setCompany(null); setSavingCompanyId(""); }}
        />
      </aside>

      {/* Main */}
      <main className="col-span-12 md:col-span-9">
        {/* Top status chips */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Chip ok>Data Source: {status.data}</Chip>
          <Chip ok={status.db_ok}>DB</Chip>
          <Chip ok={status.llm_ok}>LLM</Chip>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-1">Enrichment</h1>
        <p className="text-sm text-gray-500 mb-4">
          {savingCompanyId
            ? `Saving into selected company (ID: ${savingCompanyId}).`
            : "No company selected — search by company name."}
        </p>

        {/* Input row */}
        <div className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter company name (e.g., Revolut)"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
          <button
            onClick={run}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Enrich"}
          </button>
        </div>

        {/* Actions row */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            className="rounded-xl border px-3 py-2"
            value={savingCompanyId}
            onChange={(e) => setSavingCompanyId(e.target.value)}
          >
            <option value="">{company?.name ? "— Choose company —" : "— Choose company —"}</option>
            {companiesForSelect.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button
            onClick={createCompanyAndUse}
            className="px-3 py-2 rounded-xl border"
            disabled={!company?.name}
            title="Create a company from the left card and use it as the save target"
          >
            Create “{company?.name || "company"}”
          </button>

          <button
            onClick={addSelectedToLeads}
            className="px-3 py-2 rounded-xl bg-gray-900 text-white disabled:opacity-50"
            disabled={!savingCompanyId || !Object.values(selected).some(Boolean)}
          >
            Add to HR Leads
          </button>
        </div>

        {/* Results header chips with timings */}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Chip ok>Data Source: {status.data} • {fmtMs(timings.provider_ms)}</Chip>
            <Chip ok={status.db_ok}>DB</Chip>
            <Chip ok={status.llm_ok}>LLM • {fmtMs(timings.llm_ms)}</Chip>
            {timings.smtp_ms ? <Chip ok>SMTP • {fmtMs(timings.smtp_ms)}</Chip> : null}
          </div>
        )}

        {/* Errors */}
        {err && <div className="text-red-600 mb-3">{err}</div>}

        {/* Results table */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </Th>
                <Th>Name</Th>
                <Th>Emirate</Th>
                <Th>Title</Th>
                <Th>Email</Th>
                <Th>LinkedIn</Th>
                <Th>Confidence</Th>
                <Th>Status</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                  No contacts found (only real people shown; generic mailboxes hidden).
                </td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r._id} className="hover:bg-gray-50/60">
                    <Td>
                      <input
                        type="checkbox"
                        checked={!!selected[r._id]}
                        onChange={(e) => setSelected({ ...selected, [r._id]: e.target.checked })}
                      />
                    </Td>
                    <Td className="font-medium">{r.name || "—"}</Td>
                    <Td>{r.emirate || "—"}</Td>
                    <Td>{r.designation || "—"}</Td>
                    <Td>
                      {r.email ? (
                        <a className="underline underline-offset-2" href={`mailto:${r.email}`}>{r.email}</a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </Td>
                    <Td>
                      {r.linkedin_url ? (
                        <a className="underline underline-offset-2" href={r.linkedin_url} target="_blank" rel="noreferrer">
                          LinkedIn
                        </a>
                      ) : <span className="text-gray-400">—</span>}
                    </Td>
                    <Td>{typeof r.confidence === "number" ? r.confidence.toFixed(2) : "—"}</Td>
                    <Td><Badge>{r.email_status || "unknown"}</Badge></Td>
                    <Td>{r.source || "live"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

/* ---------------- UI bits ---------------- */
function CompanyCard({ company, quality, onCreateAndUse, onClear }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white sticky top-6">
      <div className="p-4 border-b">
        <div className="text-xs uppercase font-semibold text-gray-500">Company</div>
        <div className="mt-2 text-lg font-semibold leading-tight">
          {company?.name || <span className="text-gray-400">No company</span>}
        </div>
        {company?.mode && (
          <div className="mt-1 text-xs text-gray-500">Mode: {company.mode}</div>
        )}
      </div>

      <div className="p-4 space-y-2 text-sm">
        <Field label="Domain">
          {company?.domain ? company.domain : "—"}
        </Field>
        <Field label="Website">
          {company?.website_url ? (
            <a className="underline underline-offset-2" href={company.website_url} target="_blank" rel="noreferrer">
              {crop(company.website_url, 36)}
            </a>
          ) : "—"}
        </Field>
        <Field label="LinkedIn">
          {company?.linkedin_url ? (
            <a className="underline underline-offset-2" href={company.linkedin_url} target="_blank" rel="noreferrer">
              {crop(company.linkedin_url, 36)}
            </a>
          ) : "—"}
        </Field>
        <Field label="HQ">{company?.hq || "—"}</Field>
        <Field label="Industry">{company?.industry || "—"}</Field>
        <Field label="Size">{company?.size || "—"}</Field>
      </div>

      <div className="p-4 border-t">
        <div className="text-xs uppercase font-semibold text-gray-500 mb-1">Quality</div>
        {quality ? (
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{Math.round(quality.score * 100)}%</div>
            <div className="text-xs text-gray-500 text-right w-48">{quality.explanation}</div>
          </div>
        ) : (
          <div className="text-xs text-gray-400">No explanation available.</div>
        )}

        <div className="flex gap-2 mt-3">
          <button className="px-3 py-2 rounded-xl border" onClick={onCreateAndUse} disabled={!company?.name}>
            Create & use
          </button>
          <button className="px-3 py-2 rounded-xl border" onClick={onClear}>Clear</button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children, ok = true }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      • {children}
    </span>
  );
}
function Th({ children }) {
  return <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`px-3 py-3 align-top ${className}`}>{children}</td>;
}
function Badge({ children }) {
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">{children}</span>;
}
function Field({ label, children }) {
  return (
    <div className="flex items-start justify-between">
      <div className="text-xs text-gray-500 w-24">{label}</div>
      <div className="text-gray-800 max-w-[12rem] text-right">{children}</div>
    </div>
  );
}

/* ---------------- utils ---------------- */
function crop(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function tryUrlToDomain(u) {
  try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return null; }
}
function fmtMs(v) { if (!v && v !== 0) return ""; return `${v}ms`; }
