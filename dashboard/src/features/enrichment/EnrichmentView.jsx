// dashboard/src/features/enrichment/EnrichmentView.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "../../utils/auth";

export default function EnrichmentView() {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState({ db_ok: null, llm_ok: null, data_source: null });
  const [company, setCompany] = useState(null);               // selected from Companies page
  const [guess, setGuess] = useState(null);                  // LLM guess {name,domain}
  const [result, setResult] = useState(null);                // API result (search or job)

  const [companies, setCompanies] = useState([]);
  const [saveCompanyId, setSaveCompanyId] = useState("");    // where to save in search mode
  const [checked, setChecked] = useState({});                // table selections
  const [showRaw, setShowRaw] = useState(false);

  /* ---------------- status chips ---------------- */
  const loadStatus = useCallback(async () => {
    try {
      const r = await authFetch("/api/enrich/status");
      const j = await r.json();
      if (j?.data) setStatus(j.data);
    } catch {/* ignore */}
  }, []);
  useEffect(() => { loadStatus(); const t = setInterval(loadStatus, 20000); return () => clearInterval(t); }, [loadStatus]);

  /* ---------------- listen to Companies page selection ---------------- */
  useEffect(() => {
    const h = (e) => {
      const c = e?.detail || null;
      setCompany(c);
      if (c?.name) setText(c.name);
      setSaveCompanyId(c?.id || "");
    };
    window.addEventListener("upr:companySidebar", h);
    return () => window.removeEventListener("upr:companySidebar", h);
  }, []);

  /* ---------------- load company list to allow saving ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch("/api/companies?sort=name.asc");
        const j = await r.json();
        if (r.ok && j?.ok) setCompanies(j.data || []);
      } catch {}
    })();
  }, []);

  const canRun = useMemo(() => Boolean(company?.id) || Boolean(text.trim()), [company, text]);

  const run = useCallback(async () => {
    if (!canRun || loading) return;
    setLoading(true); setErr(""); setResult(null); setGuess(null); setChecked({});
    try {
      if (company?.id) {
        // real enrichment (selected company)
        const r = await authFetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: company.id, max_contacts: 3 }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Enrich failed");
        setResult(j);
      } else {
        // name search
        const r = await authFetch(`/api/enrich/search?q=${encodeURIComponent(text.trim())}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Search failed");
        setResult(j?.data || j);
        setGuess(j?.data?.summary?.company_guess || null);
      }
    } catch (e) {
      setErr(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }, [canRun, loading, company, text]);

  const contacts = result?.results || [];
  const summary  = result?.summary || {};
  const timings  = summary?.timings || {};

  const selectedCount = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);
  const toggle = (i) => setChecked((m) => ({ ...m, [i]: !m[i] }));

  const onAddLeads = useCallback(async () => {
    const targetId = company?.id || saveCompanyId;
    if (!targetId) { setErr("Choose a company to save into."); return; }
    const picks = contacts.filter((_, i) => checked[i]);
    if (!picks.length) { setErr("Select at least one contact."); return; }

    setErr("");
    for (const c of picks) {
      // eslint-disable-next-line no-await-in-loop
      await authFetch("/api/manual/hr-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: targetId,
          name: c.name,
          designation: c.designation || null,
          email: c.email || null,
          linkedin_url: c.linkedin_url || null,
        }),
      }).catch(()=>{});
    }
    alert("Added to HR Leads");
  }, [company, saveCompanyId, contacts, checked]);

  const createAndUseGuess = useCallback(async () => {
    if (!guess?.name) return;
    try {
      const payload = {
        name: guess.name,
        website_url: guess.domain ? `https://${guess.domain}` : null,
        status: "New",
        locations: [],
      };
      const r = await authFetch("/api/manual/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j?.id) throw new Error(j?.error || "Create failed");
      setSaveCompanyId(j.id);
      setCompany({ id: j.id, name: guess.name, domain: guess.domain || null });
      window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: { id: j.id, name: guess.name, domain: guess.domain || null }}));
    } catch (e) {
      setErr(e?.message || "Failed to create");
    }
  }, [guess]);

  return (
    <div className="p-6 space-y-6">
      {/* top status chips */}
      <div className="flex items-center justify-end gap-2">
        <Chip ok={status.data_source === "live"} label={`Data Source: ${status.data_source === "live" ? "Live" : "Mock"}`} />
        <Chip ok={!!status.db_ok} label="DB" />
        <Chip ok={!!status.llm_ok} label="LLM" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* sidebar company card */}
        <aside className="lg:col-span-1">
          <CompanyCard
            selected={company}
            guess={guess}
            onCreateGuess={createAndUseGuess}
            clear={() => { setCompany(null); setSaveCompanyId(""); setGuess(null); }}
          />
        </aside>

        {/* main */}
        <main className="lg:col-span-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Enrichment</h1>
              <p className="text-sm text-gray-500 mt-1">
                {company?.id ? "Company selected — using real enrichment." : "No company selected — search by company name."}
              </p>
            </div>
          </div>

          {/* input */}
          <div className="flex items-stretch gap-2">
            <input
              className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring disabled:bg-gray-50"
              placeholder="Enter company name (e.g., KBR, Vision Bank) — or pick a company on the Companies page"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e)=>{ if (e.key === "Enter") run(); }}
              disabled={!!company?.id}
            />
            <button
              className="rounded-xl bg-gray-900 text-white px-4 py-2 disabled:opacity-50"
              onClick={run}
              disabled={!((company?.id) || text.trim()) || loading}
            >
              {loading ? "Enriching…" : "Enrich"}
            </button>
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}

          {/* results header & actions */}
          {result && (
            <div className="flex items-center justify-between mt-2">
              <div className="text-sm text-gray-600">
                {company?.name ? <>Saving into: <b>{company.name}</b></> : "Choose a company to save into"}
              </div>
              <div className="flex items-center gap-2">
                {!company?.id && (
                  <select
                    className="rounded border px-2 py-1 text-sm"
                    value={saveCompanyId}
                    onChange={(e) => setSaveCompanyId(e.target.value)}
                  >
                    <option value="">— Choose company —</option>
                    {companies.map((c)=> <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                <button
                  className="rounded bg-gray-900 text-white px-3 py-1.5 text-sm disabled:opacity-50"
                  onClick={onAddLeads}
                  disabled={selectedCount === 0 || (!company?.id && !saveCompanyId)}
                >
                  Add to HR Leads
                </button>
              </div>
            </div>
          )}

          {/* results block */}
          {result && (
            <div className="rounded-2xl border bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-sm text-gray-500">
                  {summary?.total_candidates != null ? `Candidates: ${summary.total_candidates}` :
                   summary?.kept != null && summary?.found != null ? `Kept ${summary.kept} of ${summary.found}` : null}
                </div>
                <div className="flex items-center gap-2">
                  <Chip ok={summary?.provider === "live"} label={`Data Source: ${summary?.provider || "—"}${timings?.provider_ms ? ` • ${timings.provider_ms}ms` : ""}`} />
                  <Chip ok={!!status.db_ok} label={`DB${timings?.db_ms ? ` • ${timings.db_ms}ms` : ""}`} />
                  <Chip ok={!!status.llm_ok} label={`LLM${timings?.llm_ms ? ` • ${timings.llm_ms}ms` : ""}`} />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm table-fixed">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <TH className="w-10" />
                      <TH className="w-48">Name</TH>
                      <TH className="w-64">Title</TH>
                      <TH className="w-64">Email</TH>
                      <TH className="w-40">LinkedIn</TH>
                      <TH className="w-24">Confidence</TH>
                      <TH className="w-28">Status</TH>
                      <TH className="w-24">Source</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {contacts.length === 0 ? (
                      <tr><td colSpan={8} className="py-6 text-center text-gray-500">No contacts found.</td></tr>
                    ) : contacts.map((c, i) => (
                      <tr key={i} className="align-top">
                        <TD><input type="checkbox" checked={!!checked[i]} onChange={()=>toggle(i)} /></TD>
                        <TD className="font-medium">{c.name || "—"}</TD>
                        <TD className="">{c.designation || "—"}</TD>
                        <TD className="whitespace-nowrap">
                          {c.email ? <a className="underline" href={`mailto:${c.email}`}>{c.email}</a> : <span className="text-gray-400">—</span>}
                        </TD>
                        <TD className="truncate">
                          {c.linkedin_url ? <a className="underline" href={c.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a> : <span className="text-gray-400">—</span>}
                        </TD>
                        <TD>{c.confidence != null ? Number(c.confidence).toFixed(2) : "—"}</TD>
                        <TD>{c.email_status || "—"}</TD>
                        <TD className="text-gray-500">{c.source || summary?.provider || "—"}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 text-xs text-gray-500 border-t">
                {company?.id
                  ? "Company mode: verified contacts are saved automatically."
                  : "Search mode: results are not saved. Select rows and click “Add to HR Leads” to store them."}
              </div>
            </div>
          )}

          {result && (
            <div className="pt-2">
              <button className="text-sm underline" onClick={()=>setShowRaw(v=>!v)}>
                {showRaw ? "Hide raw response" : "Show raw response"}
              </button>
              {showRaw && (
                <div className="mt-2 rounded-xl border bg-gray-50 p-3">
                  <pre className="text-xs whitespace-pre-wrap text-gray-800">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ---------------- small UI bits ---------------- */
function Chip({ ok, label }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-yellow-500"}`} />
      {label}
    </span>
  );
}
function CompanyCard({ selected, guess, onCreateGuess, clear }) {
  const c = selected || guess;
  if (!c) {
    return (
      <div className="rounded-2xl border bg-white p-4 text-sm text-gray-500">
        No company selected.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border bg-white p-4 text-sm space-y-2">
      <div className="text-gray-900 font-semibold">{c.name || "—"}</div>
      <div className="text-gray-600">Domain: {c.domain || "—"}</div>
      <div className="text-gray-600">Mode: {selected ? "Selected" : "Guess"}</div>
      <div className="pt-2 flex gap-2">
        {guess && (
          <button className="rounded border px-2 py-1" onClick={onCreateGuess}>
            Create & use
          </button>
        )}
        <button className="rounded border px-2 py-1" onClick={clear}>Clear</button>
      </div>
    </div>
  );
}
function TH({ className="", children }) {
  return <th className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>{children}</th>;
}
function TD({ className="", children }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
