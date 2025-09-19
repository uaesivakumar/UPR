// dashboard/src/features/enrichment/EnrichmentView.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "../../utils/auth";

/**
 * Optional props:
 *  - initialQuery?: string
 *  - onCompanyChange?: (company|null) => void
 */
export default function EnrichmentView({ initialQuery = "", onCompanyChange = () => {} }) {
  // UI state
  const [text, setText] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [llmErr, setLlmErr] = useState(null);

  // Selected company from CompaniesPage (via window event)
  const [company, setCompany] = useState(null); // { id, name, domain, website_url }

  // API result
  const [result, setResult] = useState(null); // { status, company_id|null, results: [], summary: {} }

  const inputRef = useRef(null);

  // Listen for broadcasted selections from CompaniesPage (or anywhere else)
  useEffect(() => {
    const onSidebarCompany = (e) => {
      const detail = e?.detail || null;
      if (!detail) {
        setCompany(null);
        onCompanyChange(null);
        return;
      }
      setCompany({
        id: detail.id,
        name: detail.name,
        domain: detail.domain,
        website_url: detail.website_url,
      });
      if (detail.name && !text) setText(detail.name);
      onCompanyChange(detail);
    };
    window.addEventListener("upr:companySidebar", onSidebarCompany);
    return () => window.removeEventListener("upr:companySidebar", onSidebarCompany);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCompanyChange]);

  // If initialQuery changes (route param ?q=), sync into input
  useEffect(() => {
    if (initialQuery) setText(initialQuery);
  }, [initialQuery]);

  const canSubmit = useMemo(() => {
    return Boolean(company?.id) || Boolean(text && text.trim().length > 0);
  }, [company, text]);

  const callMock = useCallback(async (q) => {
    const res = await authFetch(`/api/enrich/mock?q=${encodeURIComponent(q)}`);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Mock enrich failed (${res.status}): ${t || res.statusText}`);
    }
    return res.json();
  }, []);

  const callReal = useCallback(async (company_id) => {
    const res = await authFetch(`/api/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id,
        max_contacts: 3,
        role: "hr",
        geo: "uae",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Enrich failed (${res.status}): ${t || res.statusText}`);
    }
    return res.json();
  }, []);

  const clearSelected = useCallback(() => {
    setCompany(null);
    onCompanyChange(null);
    // also tell the rest of the app
    window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
  }, [onCompanyChange]);

  const handleEnrich = useCallback(async () => {
    if (!canSubmit) return;
    setLoading(true);
    setErr(null);
    setLlmErr(null);
    setResult(null);

    try {
      let data;
      if (company?.id) {
        data = await callReal(company.id);
        // make sure the sidebar keeps this visible (optional)
        window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: company }));
      } else {
        const q = text.trim();
        if (!q) throw new Error("company_id is required");
        data = await callMock(q);
        // no company in mock mode
        window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
      }
      setResult(data || null);
    } catch (e) {
      setErr(e?.message || "Enrichment failed");
      setLlmErr("error");
    } finally {
      setLoading(false);
    }
  }, [canSubmit, company, text, callMock, callReal]);

  const contacts = result?.results || [];
  const summary = result?.summary || {};
  const isMock = !company?.id;

  return (
    <div className="p-6 space-y-6">
      {/* Top status row */}
      <div className="flex items-center justify-between">
        <div />
        {llmErr && (
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            LLM error
          </span>
        )}
        <div />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Enrichment</h1>
          <p className="text-sm text-gray-500 mt-1">
            Paste a company website / LinkedIn URL, or select a company from the list.
          </p>
        </div>

        {/* Selected company pill */}
        {company?.name && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
              <span className="mr-1 opacity-70">Selected:</span> {company.name}
            </span>
            <button
              onClick={clearSelected}
              className="text-sm underline text-gray-700 hover:text-gray-900"
              title="Clear selection"
            >
              clear
            </button>
          </div>
        )}
      </div>

      {/* Input + Enrich */}
      <div className="max-w-3xl mx-auto w-full">
        <label className="block text-sm text-gray-500 mb-2 text-center">
          {company?.id
            ? "Real enrichment mode (POST /api/enrich)."
            : "No company selected — using mock (GET /api/enrich/mock?q=...)."}
        </label>

        <div className="flex items-stretch gap-2">
          <input
            ref={inputRef}
            className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring"
            placeholder="Enter company name (e.g., Revolut) — or pick a company from the Companies page"
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

        {!company?.id && (!text || !text.trim()) && (
          <div className="mt-2 text-sm text-red-600 text-center">
            company_id is required (select a company) or type a name to use mock.
          </div>
        )}
        {err && <div className="mt-2 text-sm text-red-600 text-center">{err}</div>}
      </div>

      {/* Results */}
      {result && (
        <div className="max-w-5xl mx-auto w-full">
          <div className="rounded-xl border p-4 bg-white">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {company?.name ? (
                  <>
                    Results for <span className="font-semibold">{company.name}</span>
                  </>
                ) : (
                  <>Results (mock)</>
                )}
              </div>
              <div className="text-sm text-gray-500">
                {summary?.kept != null && summary?.found != null
                  ? `Kept ${summary.kept} of ${summary.found}`
                  : summary?.total_candidates != null
                  ? `Candidates: ${summary.total_candidates}`
                  : null}
              </div>
            </div>

            {/* Contacts list */}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
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
                      <td colSpan={7} className="py-6 text-center text-gray-500">
                        No contacts found.
                      </td>
                    </tr>
                  ) : (
                    contacts.map((c, idx) => (
                      <tr key={idx} className="align-top">
                        <Td className="font-medium">{c.name || "—"}</Td>
                        <Td>{c.designation || "—"}</Td>
                        <Td>
                          {c.email ? (
                            <a href={`mailto:${c.email}`} className="underline break-all">
                              {c.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>
                          {c.linkedin_url ? (
                            <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="underline break-all">
                              LinkedIn
                            </a>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>{c.confidence != null ? c.confidence.toFixed(2) : "—"}</Td>
                        <Td>{c.email_status || "—"}</Td>
                        <Td className="text-gray-500">{c.source || (isMock ? "mock" : "provider_or_pattern")}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer note */}
            <div className="mt-4 text-xs text-gray-500">
              {company?.id
                ? "Best-effort insert into HR Leads is performed server-side if the table exists."
                : "Mock mode: no database writes are performed."}
            </div>
          </div>

          {/* Raw JSON pane for debugging */}
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

/* ---------- small UI helpers ---------- */

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
