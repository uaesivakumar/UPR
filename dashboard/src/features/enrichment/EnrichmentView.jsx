// dashboard/src/features/enrichment/EnrichmentView.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "../../utils/auth";

export default function EnrichmentView() {
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [llmErr, setLlmErr] = useState(null);
  const [company, setCompany] = useState(null); // { id, name, domain, website_url }
  const [result, setResult] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    const onSidebarCompany = (e) => {
      const detail = e?.detail || null;
      setCompany(detail);
      if (detail?.name && !text) setText(detail.name);
    };
    window.addEventListener("upr:companySidebar", onSidebarCompany);
    return () => window.removeEventListener("upr:companySidebar", onSidebarCompany);
  }, [text]);

  const canSubmit = useMemo(() => {
    return Boolean(company?.id) || Boolean(text && text.trim());
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
      body: JSON.stringify({ company_id, max_contacts: 3, role: "hr", geo: "uae" }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Enrich failed (${res.status}): ${t || res.statusText}`);
    }
    return res.json();
  }, []);

  const clearSelected = useCallback(() => {
    setCompany(null);
    window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
  }, []);

  const handleEnrich = useCallback(async () => {
    setAttempted(true);
    if (!canSubmit) return;
    setLoading(true);
    setErr(null);
    setLlmErr(null);
    setResult(null);
    try {
      let data;
      if (company?.id) {
        data = await callReal(company.id);
        window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: company }));
      } else {
        data = await callMock(text.trim());
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

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Enrichment</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isMock
              ? "No company selected — using mock (GET /api/enrich/mock?q=...)."
              : "Company selected — using real enrichment (POST /api/enrich)."}
          </p>
        </div>

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

        {/* Show validation only AFTER an attempt */}
        {attempted && !canSubmit && (
          <div className="mt-2 text-sm text-red-600 text-center">
            Select a company or type a name to use mock.
          </div>
        )}
        {err && <div className="mt-2 text-sm text-red-600 text-center">{err}</div>}
      </div>

      {result && (
        <div className="max-w-5xl mx-auto w-full">
          <div className="rounded-xl border p-4 bg-white">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {company?.name ? (
                  <>Results for <span className="font-semibold">{company.name}</span></>
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

            <div className="mt-4 text-xs text-gray-500">
              {company?.id
                ? "Best-effort insert to HR Leads is performed server-side if the table exists."
                : "Mock mode: no database writes."}
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
