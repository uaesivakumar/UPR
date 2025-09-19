import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../utils/auth";

/**
 * EnrichmentPage
 * - Works with new backend:
 *   GET  /api/enrich/status
 *   GET  /api/enrich/search?q=...
 *   POST /api/enrich { company_id, max_contacts }
 * - UAE focus, Emirate column, status chips (Data Source / DB / LLM with timings)
 * - Left company card (from LLM guess) + "Create & use" or clear
 * - Save selected rows to chosen company OR quick-create from card
 */

export default function EnrichmentPage() {
  // top status indicators
  const [status, setStatus] = useState({ data_source: "mock", db_ok: false, llm_ok: false });
  // llm-resolved company guess
  const [guess, setGuess] = useState(null);
  // input + results
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [timings, setTimings] = useState({});
  const [rows, setRows] = useState([]);
  // companies list for "save into" dropdown
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  // selection
  const [selected, setSelected] = useState({});
  // raw response
  const [showRaw, setShowRaw] = useState(false);
  const [quality, setQuality] = useState(null);

  // load status + a small page of companies for the dropdown
  useEffect(() => {
    (async () => {
      try {
        const s = await fetchJSON("/api/enrich/status");
        if (s?.ok) setStatus(s.data || {});
      } catch {}
      try {
        const r = await fetchJSON("/api/companies?sort=created_at.desc&limit=50");
        if (r?.ok && Array.isArray(r.data)) setCompanies(r.data);
      } catch {}
    })();
  }, []);

  const anySelected = useMemo(() => Object.values(selected).some(Boolean), [selected]);

  const runSearch = async () => {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setErr("");
    setRows([]);
    setSelected({});
    try {
      const res = await fetchJSON(`/api/enrich/search?q=${encodeURIComponent(query)}`);
      if (!res?.ok) throw new Error(res?.error || "Search failed");
      const d = res.data || {};
      const summ = d.summary || {};
      setGuess(summ.company_guess || null);
      setTimings(summ.timings || {});
      setQuality(summ.quality || null);
      setRows(Array.isArray(d.results) ? d.results : []);
    } catch (e) {
      setErr(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (idx) => setSelected((s) => ({ ...s, [idx]: !s[idx] }));

  const createCompanyFromGuess = async () => {
    if (!guess?.name) return;
    try {
      const payload = {
        name: guess.name,
        website_url: guess.website_url || null,
        linkedin_url: guess.linkedin_url || null,
        domain: guess.domain || null,
        locations: [],
        type: null,
        status: "New",
      };
      const r = await fetchJSON("/api/manual/companies", { method: "POST", body: payload });
      if (!r?.id && !(r?.data?.id)) throw new Error(r?.error || "Create failed");
      const id = r.id || r.data.id;
      setCompanyId(id);
      // refresh dropdown
      const list = await fetchJSON("/api/companies?sort=created_at.desc&limit=50");
      if (list?.ok && Array.isArray(list.data)) setCompanies(list.data);
    } catch (e) {
      alert(e.message || "Failed to create company");
    }
  };

  const addToHrLeads = async () => {
    if (!companyId) { alert("Choose a company to save into."); return; }

    // collect selected rows
    const picked = rows
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => selected[i]);

    // if we have explicit selections, save them directly via manual leads API (exactly what user chose)
    if (picked.length) {
      let ok = 0, fail = 0;
      for (const { r } of picked) {
        const payload = {
          company_id: companyId,
          name: r.name,
          designation: r.designation || "",
          email: r.email || null,
          linkedin_url: r.linkedin_url || "",
          role_bucket: r.role_bucket || null,
          seniority: r.seniority || null,
          source: r.source || "live",
          confidence: r.confidence ?? null,
          email_status: r.email_status || "unknown",
          email_reason: r.email_reason || null,
        };
        try {
          const x = await fetchJSON("/api/manual/hr-leads", { method: "POST", body: payload });
          if (x?.id || x?.ok) ok++; else fail++;
        } catch { fail++; }
      }
      alert(`Saved ${ok} / ${picked.length} lead(s).`);
      return;
    }

    // otherwise let backend do its auto-pick based on provider
    try {
      const resp = await fetchJSON("/api/enrich", { method: "POST", body: { company_id: companyId, max_contacts: 3 } });
      if (resp?.status === "completed" || resp?.ok) {
        alert("Leads added.");
      } else {
        alert(resp?.error || "Failed to add leads");
      }
    } catch (e) {
      alert(e.message || "Failed to add leads");
    }
  };

  return (
    <div className="p-6">
      {/* top bar status */}
      <div className="flex flex-wrap gap-2 justify-end mb-3">
        <StatusPill label="Data Source" value={status.data_source || "mock"} />
        <StatusPill label="DB" ok={!!status.db_ok} />
        <StatusPill label="LLM" ok={!!status.llm_ok} />
      </div>

      {/* header */}
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-1">Enrichment</h1>
      <p className="text-sm text-gray-500 mb-4">No company selected — search by company name.</p>

      <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-6">
        {/* LEFT: company card */}
        <CompanyCard
          guess={guess}
          onCreate={createCompanyFromGuess}
          onClear={() => setGuess(null)}
        />

        {/* RIGHT: main */}
        <div>
          {/* input */}
          <div className="flex gap-2 mb-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              placeholder="Type a company name (e.g., “G42 UAE Finance Director”)"
              className="flex-1 px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            <button
              onClick={runSearch}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Searching…" : "Enrich"}
            </button>
          </div>

          {/* choose where to save + actions */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="px-3 py-2 rounded-xl border bg-white"
            >
              <option value="">— Choose company —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {guess?.name && (
              <button
                onClick={createCompanyFromGuess}
                className="px-3 py-2 rounded-xl border"
              >
                Create “{truncate(guess.name, 22)}”
              </button>
            )}
            <button
              onClick={addToHrLeads}
              disabled={!companyId && !anySelected}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
              title={!companyId && !anySelected ? "Pick a company or select rows" : ""}
            >
              Add to HR Leads
            </button>
          </div>

          {/* indicators for this result batch */}
          {(timings.provider_ms || timings.llm_ms) && (
            <div className="flex flex-wrap gap-2 mb-2">
              <StatusPill label="Data Source" value={status.data_source || "live"} ms={timings.provider_ms} solid />
              <StatusPill label="DB" ok={!!status.db_ok} solid />
              <StatusPill label="LLM" ok={!!status.llm_ok} ms={timings.llm_ms} solid />
            </div>
          )}

          {/* error */}
          {err && <div className="text-red-600 mb-3">{err}</div>}

          {/* table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <Th className="w-10"></Th>
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
                  <tr><Td colSpan={9} className="text-center text-gray-500 py-6">Loading…</Td></tr>
                ) : rows.length === 0 ? (
                  <tr><Td colSpan={9} className="text-center text-gray-500 py-10">No results.</Td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50/60">
                      <Td>
                        <input
                          type="checkbox"
                          checked={!!selected[i]}
                          onChange={() => toggleSelect(i)}
                        />
                      </Td>
                      <Td>{r.name || "—"}</Td>
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
                          <a className="underline underline-offset-2" href={r.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a>
                        ) : <span className="text-gray-400">—</span>}
                      </Td>
                      <Td>{typeof r.confidence === "number" ? r.confidence.toFixed(2) : "—"}</Td>
                      <Td><Badge>{r.email_status || "unknown"}</Badge></Td>
                      <Td>{r.source || "—"}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* quality + raw toggle */}
          <div className="mt-3 flex items-center justify-between">
            <div>
              {quality && (
                <span className="text-sm text-gray-600">
                  Quality: <b>{(quality.score * 100).toFixed(0)}%</b> — {quality.explanation}
                </span>
              )}
            </div>
            <button className="text-sm underline" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide raw response" : "Show raw response"}
            </button>
          </div>
          {showRaw && (
            <pre className="mt-2 p-3 rounded-xl bg-gray-50 text-xs overflow-auto">
{JSON.stringify({ guess, timings, rows }, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- small helpers ---------- */
function StatusPill({ label, value, ok, ms, solid }) {
  const green = "bg-emerald-100 text-emerald-800";
  const gray  = "bg-gray-100 text-gray-700";
  const red   = "bg-red-100 text-red-700";
  const tone = typeof ok === "boolean" ? (ok ? green : red) : (value === "live" ? green : gray);
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${solid ? "" : "border border-gray-200"} ${tone}`}>
      <span className="inline-block w-2 h-2 rounded-full bg-current opacity-70"></span>
      <span className="font-medium">{label}:</span>
      {typeof ok === "boolean" ? <span>{ok ? "OK" : "Down"}</span> : <span>{value}</span>}
      {typeof ms === "number" && <span>• {ms}ms</span>}
    </span>
  );
}

function CompanyCard({ guess, onCreate, onClear }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 h-fit">
      <div className="text-sm font-semibold text-gray-900 mb-2">Company</div>
      {!guess ? (
        <div className="text-sm text-gray-500">No company selected.</div>
      ) : (
        <>
          <div className="font-medium text-gray-900">{guess.name || "—"}</div>
          <div className="text-xs text-gray-500 mt-2">Domain: <b>{guess.domain || "—"}</b></div>
          <div className="text-xs text-gray-500">Mode: {guess.mode || "Guess"}</div>
          <div className="flex gap-2 mt-3">
            <button className="px-3 py-1.5 rounded-xl border" onClick={onCreate}>Create &amp; use</button>
            <button className="px-3 py-1.5 rounded-xl border" onClick={onClear}>Clear</button>
          </div>
          <div className="mt-3 space-y-1 text-xs">
            {guess.website_url && <div><a className="underline" href={guess.website_url} target="_blank" rel="noreferrer">{guess.website_url}</a></div>}
            {guess.linkedin_url && <div><a className="underline" href={guess.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a></div>}
            {guess.hq && <div>HQ: {guess.hq}</div>}
            {guess.industry && <div>Industry: {guess.industry}</div>}
            {guess.size && <div>Size: {guess.size}</div>}
          </div>
        </>
      )}
    </div>
  );
}

async function fetchJSON(url, opts = {}) {
  const o = { ...opts };
  if (o.body && typeof o.body !== "string") {
    o.headers = { ...(o.headers || {}), "Content-Type": "application/json" };
    o.body = JSON.stringify(o.body);
  }
  const res = await authFetch(url, o);
  const json = await res.json().catch(() => ({}));
  return json;
}

function Th({ children, className="" }) {
  return <th className={`px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>{children}</th>;
}
function Td({ children, className="", colSpan }) {
  return <td className={`px-4 py-2 align-top ${className}`} colSpan={colSpan}>{children}</td>;
}
function Badge({ children }) {
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">{children}</span>;
}
function truncate(s, n) {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
