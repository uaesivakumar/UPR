// dashboard/src/pages/EnrichmentPage.jsx
import { useEffect, useRef, useState } from "react";
import { authFetch } from "../utils/auth";

function Pill({ ok = true, label, ms }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
        ok
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-gray-200 bg-gray-50 text-gray-600"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-gray-400"}`} />
      {label}
      {typeof ms === "number" ? ` • ${ms}ms` : ""}
    </span>
  );
}

export default function EnrichmentPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Summary bits from backend
  const [company, setCompany] = useState(null);        // { name, domain, linkedin_url, parent? }
  const [timings, setTimings] = useState({});          // { llm_ms, apollo_ms, geo_ms, email_ms, quality_ms }
  const [provider, setProvider] = useState("");        // "apollo+geo+email+llm"

  const inFlight = useRef(null);

  // Small helper: fetch with abort + hard timeout
  async function fetchWithTimeout(url, options = {}, ms = 25000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort("timeout"), ms);
    const merged = { ...options, signal: controller.signal };
    inFlight.current = controller;
    try {
      const res = await authFetch(url, merged);
      return res;
    } finally {
      clearTimeout(t);
      inFlight.current = null;
    }
  }

  const run = async () => {
    if (!q.trim()) {
      setErr("Type a company name first.");
      return;
    }
    setLoading(true);
    setErr("");

    try {
      const sp = new URLSearchParams();
      sp.set("q", q.trim());
      const res = await fetchWithTimeout(
        `/api/enrich/search?${sp.toString()}`,
        { method: "GET", noRedirect: true, headers: { Accept: "application/json" } },
        25000
      );

      if (res.status === 401) {
        setErr("Your session expired. Please sign in again.");
        setRows([]);
        setCompany(null);
        setTimings({});
        setProvider("");
        return;
      }

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Search failed (${res.status})`);
      }

      // ✅ pull from the new shape
      const data = json.data || {};
      const summary = data.summary || {};

      setRows(Array.isArray(data.results) ? data.results : []);
      setCompany(summary.company_guess || null);
      setTimings(summary.timings || {});
      setProvider(summary.provider || "live");

      // Optional: broadcast to the sidebar “Company” widget if it listens for this event
      // so it can render the selected company box immediately.
      try {
        if (summary.company_guess) {
          window.dispatchEvent(
            new CustomEvent("upr:enrichCompanyGuess", { detail: summary.company_guess })
          );
        }
      } catch {}
    } catch (e) {
      if (e?.name !== "AbortError") {
        setErr(e?.message || "Search failed");
        setRows([]);
        setCompany(null);
        setTimings({});
        setProvider("");
      }
    } finally {
      setLoading(false);
    }
  };

  // Clean up any inflight request when unmounting
  useEffect(() => {
    return () => {
      try {
        if (inFlight.current) inFlight.current.abort("unmount");
      } catch {}
    };
  }, []);

  return (
    <div className="p-6">
      {/* Status chips */}
      <div className="mb-4 flex items-center justify-end gap-2">
        <Pill label={`Data Source: ${provider || "live"}`} ok ms={timings.provider_ms} />
        <Pill label="LLM" ok ms={timings.llm_ms} />
        <Pill label="Apollo" ok ms={timings.apollo_ms} />
        <Pill label="Geo" ok ms={timings.geo_ms} />
        <Pill label="Email" ok ms={timings.email_ms} />
        <Pill label="Quality" ok ms={timings.quality_ms} />
      </div>

      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-gray-900">Enrichment</h1>
      <p className="mb-4 text-sm text-gray-500">
        Search by company name and review enriched leads.
      </p>

      {/* Search bar */}
      <div className="mb-3 flex items-center gap-2">
        <input
          className="flex-1 rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          placeholder='Type company name (e.g., “First Abu Dhabi Bank”)'
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
        />
        <button
          className="rounded-xl bg-gray-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          disabled={loading}
          onClick={run}
        >
          {loading ? "Loading…" : "Enrich"}
        </button>
      </div>

      {/* Error */}
      {err && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Company summary from LLM guess */}
      {company && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <div>
            <span className="font-medium">Company:</span> {company.name || "—"}
          </div>
          {company.domain && (
            <div>
              <span className="font-medium">Domain:</span> {company.domain}
            </div>
          )}
          {company.linkedin_url && (
            <div>
              <span className="font-medium">LinkedIn:</span>{" "}
              <a href={company.linkedin_url} className="underline" target="_blank" rel="noreferrer">
                {company.linkedin_url}
              </a>
            </div>
          )}
          {company.parent && (
            <div>
              <span className="font-medium">Parent / Group:</span> {company.parent}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="overflow-hidden rounded-2xl border">
        <div className="min-w-full">
          <div className="flex items-center justify-between border-b bg-gray-50 px-3 py-2">
            <div className="text-sm text-gray-700">Candidates: {rows.length || 0}</div>
          </div>

          <table className="w-full">
            <thead className="bg-white">
              <tr className="text-xs uppercase text-gray-500">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Emirate</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">LinkedIn</th>
                <th className="px-3 py-2 text-left">Confidence</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{r.name || "—"}</td>
                  <td className="px-3 py-2">{r.emirate || "—"}</td>
                  <td className="px-3 py-2">{r.designation || r.title || "—"}</td>
                  <td className="px-3 py-2">
                    {r.email ? (
                      <a className="underline" href={`mailto:${r.email}`}>
                        {r.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.linkedin_url ? (
                      <a className="underline" href={r.linkedin_url} target="_blank" rel="noreferrer">
                        LinkedIn
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {typeof r.confidence === "number" ? r.confidence.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.email_status || "—"}</td>
                  <td className="px-3 py-2">{r.source || "—"}</td>
                </tr>
              ))}

              {rows.length === 0 && !loading && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={8}>
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
