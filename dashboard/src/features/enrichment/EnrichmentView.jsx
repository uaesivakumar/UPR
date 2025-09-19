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

  const inputRef = useRef(null);

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

  const findOrCreateCompany = useCallback(
    async (guess) => {
      if (!guess?.name && !guess?.domain) return null;
      try {
        const term = encodeURIComponent(guess.domain || guess.name);
        const r = await authFetch(`/api/companies?search=${term}&sort=name.asc`);
        const j = await r.json();
        if (r.ok && j?.ok && Array.isArray(j.data)) {
          const hit =
            j.data.find((c) => c.domain && guess.domain && c.domain.toLowerCase() === guess.domain.toLowerCase()) ||
            j.data.find((c) => c.name && guess.name && c.name.toLowerCase() === guess.name.toLowerCase()) ||
            null;
          if (hit) return { id: hit.id, name: hit.name, domain: hit.domain || null };
        }
      } catch {}
      try {
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
      } catch {}
      return null;
    },
    []
  );

  const handleEnrich = useCallback(async () => {
    setAttempted(true);
    if (!canSubmit) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    setRowsChecked({});
    setSaveCompanyMeta(company?.id ? { id: company.id, name: company.name, domain: company.domain || null } : null);
    try {
      let data;
      if (company?.id) {
        data = await callReal(company.id);
        window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: company }));
      } else {
        data = await callSearch(text.trim());
        const guess = data?.summary?.company_guess || null;
        if (guess && (!saveCompanyId || !saveCompanyMeta)) {
          const ensured = await findOrCreateCompany(guess);
          if (ensured) {
            setSaveCompanyId(ensured.id);
            setSaveCompanyMeta(ensured);
          }
        }
        window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
      }
      setResult(data || null);
    } catch (e) {
      setErr(e?.message || "Enrichment failed");
    } finally {
      setLoading(false);
    }
  }, [canSubmit, company, text, callSearch, callReal, saveCompanyId, saveCompanyMeta, findOrCreateCompany]);

  const toggleRow = (idx) => setRowsChecked((m) => ({ ...m, [idx]: !m[idx] }));

  const selectedRows = useMemo(() => {
    const out = [];
    (result?.results || []).forEach((r, i) => {
      if (rowsChecked[i]) out.push({ i, r });
    });
    return out;
  }, [result, rowsChecked]);

  const addSelectedToLeads = useCallback(async () => {
    const targetCompanyId = company?.id || saveCompanyId || saveCompanyMeta?.id;
    if (!targetCompanyId) {
      setErr("Choose or create a company to save leads into.");
      return;
    }
    if (selectedRows.length === 0) {
      setErr("Select at least one contact.");
      return;
    }
    setErr(null);
    for (const { r } of selectedRows) {
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
  }, [selectedRows, company, saveCompanyId, saveCompanyMeta]);

  const contacts = result?.results || [];
  const summary = result?.summary || {};
  const resultsProvider = summary?.provider || null; // 'live' | 'mock' | 'mock_fallback' | 'error_fallback'

  const CapabilityChips = () => (
    <div className="flex items-center gap-3">
      <StatusDot ok={status.data_source === "live"} label={`Data Source: ${status.data_source === "live" ? "Live" : "Mock"}`} />
      <StatusDot ok={!!status.db_ok} label="DB" />
      <StatusDot ok={!!status.llm_ok} label="LLM" />
    </div>
  );

  const ResultsChips = () => {
    const text =
      resultsProvider === "live"
        ? "Data Source: Live"
        : resultsProvider === "mock"
        ? "Data Source: Mock"
        : resultsProvider === "mock_fallback"
        ? "Data Source: Mock (fallback)"
        : resultsProvider === "error_fallback"
        ? "Data Source: Mock (error)"
        : null;
    return (
      <div className="flex items-center gap-3">
        {text && <StatusDot ok={resultsProvider === "live"} label={text} />}
        <StatusDot ok={!!status.db_ok} label="DB" />
        <StatusDot ok={!!status.llm_ok} label="LLM" />
      </div>
    );
  };

  const showCreateCompany = !company?.id && !saveCompanyId && summary?.company_guess;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-end">
        <CapabilityChips />
      </div>

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

      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-stretch gap-2">
          <input
            ref={inputRef}
            className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring"
            placeholder="Enter company name (e.g., KBR / Revolut) — or pick a company on the Companies page"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit && !loading) handleEnrich();
            }}
            disabled={!!company?.id}
          />
          <button className="rounded-md bg-gray-900 text-white px-4 py-2 disabled:opacity-50" onClick={handleEnrich} disabled={!canSubmit || loading}>
            {loading ? "Enriching..." : "Enrich"}
          </button>
        </div>

        {attempted && !canSubmit && <div className="mt-2 text-sm text-red-600 text-center">Please select a company or enter a name to search.</div>}
        {err && <div className="mt-2 text-sm text-red-600 text-center">{err}</div>}
      </div>

      {result && (
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Results</div>
            <div className="flex items-center gap-2">
              {company?.id ? (
                <span className="text-sm text-gray-600">Saving into: <b>{company.name}</b></span>
              ) : saveCompanyMeta ? (
                <span className="text-sm text-gray-600">Saving into: <b>{saveCompanyMeta.name}</b></span>
              ) : (
                <>
                  <select className="rounded border px-2 py-1 text-sm" value={saveCompanyId} onChange={(e) => setSaveCompanyId(e.target.value)}>
                    <option value="">— Choose company to save into —</option>
                    {companies.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {showCreateCompany && (
                <button
                  className="rounded border px-2 py-1 text-sm"
                  onClick={async () => {
                    const ensured = await findOrCreateCompany(summary.company_guess);
                    if (ensured) {
                      setSaveCompanyId(ensured.id);
                      setSaveCompanyMeta(ensured);
                    }
                  }}
                >
                  Create “{summary.company_guess?.name || "Company"}”
                </button>
              )}

              <button
                className="rounded bg-gray-900 text-white px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={addSelectedToLeads}
                disabled={selectedRows.length === 0 || (!company?.id && !saveCompanyId && !saveCompanyMeta?.id)}
                title="Add selected contacts to HR Leads"
              >
                Add to HR Leads
              </button>
            </div>
          </div>

          <div className="rounded-xl border p-4 bg-white">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {summary?.total_candidates != null
                  ? `Candidates: ${summary.total_candidates}`
                  : summary?.kept != null && summary?.found != null
                  ? `Kept ${summary.kept} of ${summary.found}`
                  : null}
              </div>
              <ResultsChips />
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
                        <Td>
                          {c.email ? (
                            <a href={`mailto:${c.email}`} className="underline break-all">
                              {c.email}
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </Td>
                        <Td>
                          {c.linkedin_url ? (
                            <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="underline break-all">
                              LinkedIn
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </Td>
                        <Td>{c.confidence != null ? Number(c.confidence).toFixed(2) : "—"}</Td>
                        <Td>{c.email_status || "—"}</Td>
                        <Td className="text-gray-500">{c.source || (resultsProvider || "—")}</Td>
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

          <div className="mt-4 rounded-xl border p-3 bg-gray-50">
            <div className="text-xs font-semibold mb-2 text-gray-600">Raw response</div>
            <pre className="text-xs whitespace-pre-wrap text-gray-800">{JSON.stringify(result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ ok, label }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-yellow-500"}`} />
      {label}
    </span>
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
