// dashboard/src/features/enrichment/EnrichmentView.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "../../utils/auth";

export default function EnrichmentView() {
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState({ db_ok: null, llm_ok: null, data_source: null });
  const [company, setCompany] = useState(null);
  const [result, setResult] = useState(null);

  const [rowsChecked, setRowsChecked] = useState({});
  const [companies, setCompanies] = useState([]);
  const [saveCompanyId, setSaveCompanyId] = useState("");
  const [saveCompanyMeta, setSaveCompanyMeta] = useState(null);

  const [showRaw, setShowRaw] = useState(false);
  const inputRef = useRef(null);

  // status polling
  const loadStatus = useCallback(async () => {
    try {
      const r = await authFetch("/api/enrich/status");
      const j = await r.json();
      if (j?.data) setStatus(j.data);
    } catch {
      setStatus((s) => ({ ...s, db_ok: false }));
    }
  }, []);
  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 20000);
    return () => clearInterval(t);
  }, [loadStatus]);

  // selected company broadcast
  useEffect(() => {
    const onSidebarCompany = (e) => {
      const detail = e?.detail || null;
      setCompany(detail);
      if (detail?.name && !text) setText(detail.name);
      if (detail?.id) {
        setSaveCompanyId(detail.id);
        setSaveCompanyMeta({ id: detail.id, name: detail.name, domain: detail.domain || null });
      }
    };
    window.addEventListener("upr:companySidebar", onSidebarCompany);
    return () => window.removeEventListener("upr:companySidebar", onSidebarCompany);
  }, [text]);

  // load company list (for saving into)
  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch(`/api/companies?sort=name.asc`);
        const j = await r.json();
        if (r.ok && j?.ok) setCompanies(j.data || []);
      } catch {}
    })();
  }, []);

  const canSubmit = useMemo(() => Boolean(company?.id) || Boolean(text && text.trim()), [company, text]);

  const callSearch = useCallback(async (q) => {
    const res = await authFetch(`/api/enrich/search?q=${encodeURIComponent(q)}`);
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(raw?.error || "Search failed");
    return raw?.data || raw;
  }, []);

  const callReal = useCallback(async (company_id) => {
    const res = await authFetch(`/api/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id, max_contacts: 3 }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(raw?.error || "Enrich failed");
    return raw;
  }, []);

  const createCompany = useCallback(async (guess) => {
    const payload = {
      name: guess.name || (guess.domain ? guess.domain.replace(/\.[a-z]+$/, "") : "Company"),
      website_url: guess.domain ? `https://${guess.domain}` : null,
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
    if (r.ok && j?.id) return { id: j.id, name: payload.name, domain: guess.domain || null };
    throw new Error(j?.error || "Failed to create company");
  }, []);

  const handleEnrich = useCallback(async () => {
    setAttempted(true);
    if (!canSubmit) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    setRowsChecked({});
    try {
      let data;
      if (company?.id) {
        data = await callReal(company.id);
        window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: company }));
      } else {
        data = await callSearch(text.trim());
        const guess = data?.summary?.company_guess || null;
        if (guess && (!saveCompanyId || !saveCompanyMeta)) {
          try {
            const ensured = await createCompany(guess);
            setSaveCompanyId(ensured.id);
            setSaveCompanyMeta(ensured);
          } catch {}
        }
        window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
      }
      setResult(data || null);
    } catch (e) {
      setErr(e?.message || "Enrichment failed");
    } finally {
      setLoading(false);
    }
  }, [canSubmit, company, text, callSearch, callReal, saveCompanyId, saveCompanyMeta, createCompany]);

  const toggleRow = (idx) => setRowsChecked((m) => ({ ...m, [idx]: !m[idx] }));
  const selectedCount = useMemo(
    () => Object.values(rowsChecked).filter(Boolean).length,
    [rowsChecked]
  );

  const contacts = result?.results || [];
  const summary = result?.summary || {};
  const resultsProvider = summary?.provider || null;
  const timings = summary?.timings || {};

  const targetCompanyName = company?.name || saveCompanyMeta?.name || "";

  const addSelectedToLeads = useCallback(async () => {
    const targetCompanyId = company?.id || saveCompanyId || saveCompanyMeta?.id;
    if (!targetCompanyId) {
      setErr("Choose or create a company to save leads into.");
      return;
    }
    if (selectedCount === 0) {
      setErr("Select at least one contact.");
      return;
    }
    setErr(null);
    for (let i = 0; i < contacts.length; i++) {
      if (!rowsChecked[i]) continue;
      const r = contacts[i];
      try {
        await authFetch("/api/manual/hr-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: targetCompanyId,
            name: r.name,
            designation: r.designation || null,
            email: r.email || null,
            linkedin_url: r.linkedin_url || null,
          }),
        });
      } catch {}
    }
    alert("Saved selected contacts to HR Leads.");
  }, [company, saveCompanyId, saveCompanyMeta, selectedCount, contacts, rowsChecked]);

  return (
    <div className="p-6 space-y-6">
      {/* page-level capability chips */}
      <div className="flex items-center justify-end">
        <Chip ok={status.data_source === "live"} label={`Data Source: ${status.data_source === "live" ? "Live" : "Mock"}`} />
        <Chip ok={!!status.db_ok} label="DB" />
        <Chip ok={!!status.llm_ok} label="LLM" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left company card */}
        <aside className="lg:col-span-1">
          <CompanyCard selected={company} guess={summary?.company_guess} />
        </aside>

        {/* Main */}
        <main className="lg:col-span-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Enrichment</h1>
              <p className="text-sm text-gray-500 mt-1">
                {company?.id
                  ? "Company selected — using real enrichment (POST /api/enrich)."
                  : "No company selected — search by name (GET /api/enrich/search?q=...)."}
              </p>
            </div>

            {company?.name && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                  <span className="mr-1 opacity-70">Selected:</span> {company.name}
                </span>
                <button
                  onClick={() => {
                    setCompany(null);
                    setSaveCompanyId("");
                    setSaveCompanyMeta(null);
                    window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
                  }}
                  className="text-sm underline text-gray-700 hover:text-gray-900"
                  title="Clear selection"
                >
                  clear
                </button>
              </div>
            )}
          </div>

          {/* input */}
          <div>
            <div className="flex items-stretch gap-2">
              <input
                ref={inputRef}
                className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring"
                placeholder="Enter company name (e.g., KBR / Revolut) — or pick a company on the Companies page"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (company?.id || text.trim()) && !loading) handleEnrich();
                }}
                disabled={!!company?.id}
              />
              <button
                className="rounded-md bg-gray-900 text-white px-4 py-2 disabled:opacity-50"
                onClick={handleEnrich}
                disabled={!((company?.id) || text.trim()) || loading}
              >
                {loading ? "Enriching..." : "Enrich"}
              </button>
            </div>
            {attempted && !(company?.id || text.trim()) && (
              <div className="mt-2 text-sm text-red-600 text-center">
                Please select a company or enter a name to search.
              </div>
            )}
            {err && <div className="mt-2 text-sm text-red-600 text-center">{err}</div>}
          </div>

          {/* results header */}
          {result && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {targetCompanyName ? (
                  <>Saving into: <b>{targetCompanyName}</b></>
                ) : (
                  "Choose a company to save into"
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* allow choosing company if none selected/created */}
                {!company?.id && !saveCompanyMeta?.id && (
                  <select
                    className="rounded border px-2 py-1 text-sm"
                    value={saveCompanyId}
                    onChange={(e) => setSaveCompanyId(e.target.value)}
                  >
                    <option value="">— Choose company to save into —</option>
                    {companies.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  className="rounded bg-gray-900 text-white px-3 py-1.5 text-sm disabled:opacity-50"
                  onClick={addSelectedToLeads}
                  disabled={selectedCount === 0 || (!company?.id && !saveCompanyId && !saveCompanyMeta?.id)}
                  title="Add selected contacts to HR Leads"
                >
                  Add to HR Leads
                </button>
              </div>
            </div>
          )}

          {/* results table */}
          {result && (
            <div className="rounded-xl border p-4 bg-white">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  {summary?.total_candidates != null
                    ? `Candidates: ${summary.total_candidates}`
                    : summary?.kept != null && summary?.found != null
                    ? `Kept ${summary.kept} of ${summary.found}`
                    : null}
                </div>
                <div className="flex items-center gap-2">
                  <Chip ok={resultsProvider === "live"} label={
                    resultsProvider === "live"
                      ? `Data Source: Live${timings.provider_ms ? ` • ${timings.provider_ms}ms` : ""}`
                      : resultsProvider === "mock"
                      ? "Data Source: Mock"
                      : resultsProvider === "mock_fallback"
                      ? "Data Source: Mock (fallback)"
                      : resultsProvider === "error_fallback"
                      ? "Data Source: Mock (error)"
                      : "Data Source"
                  } />
                  <Chip ok={!!status.db_ok} label={`DB${timings.db_ms ? ` • ${timings.db_ms}ms` : ""}`} />
                  <Chip ok={!!status.llm_ok} label={`LLM${timings.llm_ms ? ` • ${timings.llm_ms}ms` : ""}`} />
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <Th />
                      <Th>Name</Th>
                      <Th>Title</Th>
                      <Th>Email</Th>
                      <Th>LinkedIn</Th>
                      <Th>Confidence</Th>
                      <Th>Status</Th>
                      <Th>Source</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {contacts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-gray-500">
                          No contacts found.
                        </td>
                      </tr>
                    ) : (
                      contacts.map((c, idx) => (
                        <tr key={idx} className="align-top">
                          <Td className="w-10">
                            <input type="checkbox" checked={!!rowsChecked[idx]} onChange={() => toggleRow(idx)} />
                          </Td>
                          <Td className="font-medium">{c.name || "—"}</Td>
                          <Td>{c.designation || "—"}</Td>
                          <Td className="break-all">
                            {c.email ? (
                              <a href={`mailto:${c.email}`} className="underline">
                                {c.email}
                              </a>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </Td>
                          <Td>
                            {c.linkedin_url ? (
                              <a
                                href={c.linkedin_url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline break-all"
                              >
                                LinkedIn
                              </a>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </Td>
                          <Td>{c.confidence != null ? Number(c.confidence).toFixed(2) : "—"}</Td>
                          <Td>{c.email_status || "—"}</Td>
                          <Td className="text-gray-500">{c.source || resultsProvider || "—"}</Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-xs text-gray-500">
                {company?.id
                  ? "Company mode: verified contacts are saved automatically."
                  : "Search mode: results are not saved. Select rows and click “Add to HR Leads” to store them."}
              </div>
            </div>
          )}

          {/* raw json (collapsible) */}
          {result && (
            <div className="mt-3">
              <button
                className="text-sm underline"
                onClick={() => setShowRaw((v) => !v)}
              >
                {showRaw ? "Hide raw response" : "Show raw response"}
              </button>
              {showRaw && (
                <div className="mt-2 rounded-xl border p-3 bg-gray-50">
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

/* ------------------------------ UI bits ------------------------------ */
function Chip({ ok, label }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-yellow-500"}`} />
      {label}
    </span>
  );
}
function CompanyCard({ selected, guess }) {
  const c = selected || guess;
  if (!c) {
    return (
      <div className="rounded-xl border p-3 bg-white text-sm text-gray-500">
        No company selected.
      </div>
    );
  }
  return (
    <div className="rounded-xl border p-3 bg-white text-sm">
      <div className="font-semibold text-gray-900">{c.name || "—"}</div>
      <div className="mt-1 text-gray-600">Domain: {c.domain || "—"}</div>
      {selected ? (
        <div className="mt-1 text-gray-600">Mode: Selected</div>
      ) : (
        <div className="mt-1 text-gray-600">Mode: Guess</div>
      )}
    </div>
  );
}
function Th({ children }) {
  return (
    <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}
function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
