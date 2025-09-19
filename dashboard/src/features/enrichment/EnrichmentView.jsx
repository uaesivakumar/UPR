// dashboard/src/features/enrichment/EnrichmentView.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "../../utils/auth";

/**
 * Enrichment page:
 * - Always-on status chips (LLM / Data Source / DB)
 * - Company info side card (listens to 'upr:companySidebar')
 * - Free-text search calls /api/enrich/search (HR/Admin/Finance only)
 * - Company-selected enrich calls POST /api/enrich
 * - Select rows + "Add to HR Leads" (choose company in search mode)
 */
export default function EnrichmentView() {
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState({ db_ok: null, llm_ok: null, data_source: null });

  const [company, setCompany] = useState(null); // { id, name, domain, website_url }
  const [result, setResult] = useState(null);

  const [rowsChecked, setRowsChecked] = useState({});
  const [companies, setCompanies] = useState([]);
  const [saveCompanyId, setSaveCompanyId] = useState("");

  const inputRef = useRef(null);

  /* ------------------------- status chips polling ------------------------- */
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

  /* --------------------- company broadcast & prefill ---------------------- */
  useEffect(() => {
    const onSidebarCompany = (e) => {
      const detail = e?.detail || null;
      setCompany(detail);
      if (detail?.name && !text) setText(detail.name);
      // when explicit selection exists, it will be the save target
      if (detail?.id) setSaveCompanyId(detail.id);
    };
    window.addEventListener("upr:companySidebar", onSidebarCompany);
    return () => window.removeEventListener("upr:companySidebar", onSidebarCompany);
  }, [text]);

  /* -------------------------- companies for save ------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch(`/api/companies?sort=name.asc`);
        const j = await r.json();
        if (r.ok && j?.ok) setCompanies(j.data || []);
      } catch {}
    })();
  }, []);

  const canSubmit = useMemo(() => {
    return Boolean(company?.id) || Boolean(text && text.trim());
  }, [company, text]);

  const callStatusProviderName = useMemo(() => {
    if (status.data_source === "live") return { text: "Data Source: Live", dot: "bg-green-500" };
    if (status.data_source === "mock") return { text: "Data Source: Mock", dot: "bg-yellow-500" };
    return null;
  }, [status]);

  const chip = (ok, on, label) => {
    if (ok == null) return null;
    return (
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
        <span className={`inline-block h-2 w-2 rounded-full ${on ? "bg-green-500" : "bg-red-500"}`} />
        {label}
      </span>
    );
  };

  const headerChips = (
    <div className="flex items-center gap-3">
      {callStatusProviderName && (
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
          <span className={`inline-block h-2 w-2 rounded-full ${callStatusProviderName.dot}`} />
          {callStatusProviderName.text}
        </span>
      )}
      {chip(status.db_ok, status.db_ok, "DB")}
      {chip(status.llm_ok, status.llm_ok, "LLM")}
    </div>
  );

  /* --------------------------- API helpers ------------------------------- */
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
      body: JSON.stringify({ company_id, max_contacts: 3, role: "hr", geo: "uae" }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(raw?.error || "Enrich failed");
    return raw;
  }, []);

  /* ----------------------------- actions --------------------------------- */
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
        window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
      }
      setResult(data || null);
    } catch (e) {
      setErr(e?.message || "Enrichment failed");
    } finally {
      setLoading(false);
    }
  }, [canSubmit, company, text, callSearch, callReal]);

  const toggleRow = (idx) => {
    setRowsChecked((m) => ({ ...m, [idx]: !m[idx] }));
  };

  const selectedRows = useMemo(() => {
    const out = [];
    (result?.results || []).forEach((r, i) => {
      if (rowsChecked[i]) out.push({ i, r });
    });
    return out;
  }, [result, rowsChecked]);

  const addSelectedToLeads = useCallback(async () => {
    const targetCompanyId = company?.id || saveCompanyId;
    if (!targetCompanyId) {
      setErr("Choose a company to save leads into.");
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
      } catch (e) {
        // keep going; best-effort
        console.error("save lead failed", e);
      }
    }
    // Optional: simple toast
    alert("Saved selected contacts to HR Leads.");
  }, [selectedRows, company, saveCompanyId]);

  /* -------------------------------- UI ----------------------------------- */
  const contacts = result?.results || [];
  const summary = result?.summary || {};

  // side company card
  const CompanyCard = company ? (
    <div className="hidden xl:block fixed left-4 top-48 w-64 rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold mb-2">Company</div>
      <div className="text-sm">
        <div className="font-medium">{company.name || "—"}</div>
        <div className="text-gray-500 truncate">{company.website_url || company.domain || "—"}</div>
        <div className="mt-2">
          <button
            onClick={() => {
              setCompany(null);
              setSaveCompanyId("");
              window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
            }}
            className="text-xs underline text-gray-700 hover:text-gray-900"
          >
            clear
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="p-6 space-y-6">
      {/* Always-visible chips */}
      <div className="flex items-center justify-end">{headerChips}</div>

      {/* Company quick card on the left */}
      {CompanyCard}

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
            placeholder="Enter company name (e.g., Revolut) — or pick a company on the Companies page"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit && !loading) handleEnrich();
            }}
            disabled={!!company?.id}
          />
          <button
            className="rounded-md bg-gray-900 text-white px-4 py-2 disabled:opacity-50"
            onClick={handleEnrich}
            disabled={!canSubmit || loading}
          >
            {loading ? "Enriching..." : "Enrich"}
          </button>
        </div>

        {/* show validation only AFTER an attempt */}
        {attempted && !canSubmit && (
          <div className="mt-2 text-sm text-red-600 text-center">
            Please select a company or enter a name to search.
          </div>
        )}
        {err && <div className="mt-2 text-sm text-red-600 text-center">{err}</div>}
      </div>

      {result && (
        <div className="max-w-5xl mx-auto w-full">
          {/* Save toolbar */}
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Results</div>
            <div className="flex items-center gap-2">
              {!company?.id && (
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
                disabled={selectedRows.length === 0 || (!company?.id && !saveCompanyId)}
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
              <div className="flex items-center gap-3">
                {/* mirror chips near results as well */}
                {headerChips}
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
                          <input
                            type="checkbox"
                            checked={!!rowsChecked[idx]}
                            onChange={() => toggleRow(idx)}
                          />
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
                        <Td className="text-gray-500">{c.source || "live"}</Td>
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
            <pre className="text-xs whitespace-pre-wrap text-gray-800">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
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
