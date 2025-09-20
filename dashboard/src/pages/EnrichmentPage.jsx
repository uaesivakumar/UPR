// dashboard/src/pages/EnrichmentPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
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

function Field({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-sm text-gray-700">{label}</div>
      {children}
    </div>
  );
}

export default function EnrichmentPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null); // timings, provider, company_guess, quality

  // service status lights
  const [dbOk, setDbOk] = useState(true);
  const [llmOk, setLlmOk] = useState(true);
  const [dataSource, setDataSource] = useState("live");
  const [statusTimings, setStatusTimings] = useState({});

  // disambiguation modal state
  const [fixOpen, setFixOpen] = useState(false);
  const [fixName, setFixName] = useState("");
  const [fixDomain, setFixDomain] = useState("");
  const [fixLinkedIn, setFixLinkedIn] = useState("");
  const [fixParent, setFixParent] = useState("");

  const [pickedCompanyId, setPickedCompanyId] = useState("");
  const [picked, setPicked] = useState({}); // idx -> true
  const pickedIdxs = useMemo(
    () => Object.keys(picked).filter((k) => picked[k]).map((n) => Number(n)),
    [picked]
  );

  const inFlight = useRef(null); // AbortController for current request

  const companyGuess = summary?.company_guess;

  // ----- Fetch with abort + hard timeout so UI never stays stuck -----
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

  // probe /api/enrich/status for chips
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/enrich/status", {
          method: "GET",
          noRedirect: true,
          headers: { Accept: "application/json" },
        });
        if (res.status === 401) return;
        const j = await res.json().catch(() => ({}));
        if (!cancelled && j?.ok) {
          setDbOk(!!j.data?.db_ok);
          setLlmOk(!!j.data?.llm_ok);
          setDataSource(j.data?.data_source || "live");
          // setStatusTimings({ provider_ms: j.data?.provider_ms, llm_ms: j.data?.llm_ms })
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (overrides = {}) => {
    if (!q.trim() && !overrides.name && !overrides.domain && !overrides.linkedin_url) {
      setErr("Type a company name first.");
      return;
    }

    setLoading(true);
    setErr("");

    // Cancel any prior request
    try {
      if (inFlight.current) inFlight.current.abort("new-search");
    } catch {}

    try {
      const sp = new URLSearchParams();
      sp.set("q", q.trim());
      if (overrides.name) sp.set("name", overrides.name.trim());
      if (overrides.domain)
        sp.set(
          "domain",
          overrides.domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "")
        );
      if (overrides.linkedin_url) sp.set("linkedin_url", overrides.linkedin_url.trim());
      if (overrides.parent) sp.set("parent", overrides.parent.trim());

      // --- 1) Try GET first ---
      const getUrl = `/api/enrich/search?${sp.toString()}`;
      console.log("[Enrichment] GET", getUrl);
      let res = await fetchWithTimeout(
        getUrl,
        { method: "GET", noRedirect: true, headers: { Accept: "application/json" } },
        25000
      );

      if (res.status === 401) {
        setErr("Your session seems to have expired. Please sign in again.");
        setRows([]);
        setSummary(null);
        return;
      }

      let json = await res.json().catch(() => ({}));

      // --- 2) If GET returns ok but empty results, fallback to POST body ---
      const emptyOk =
        res.ok &&
        json?.ok &&
        json?.data &&
        Array.isArray(json.data.results) &&
        json.data.results.length === 0;

      if (emptyOk) {
        const postBody = {
          q: q.trim(),
          name: overrides.name || undefined,
          domain: overrides.domain
            ? overrides.domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "")
            : undefined,
          linkedin_url: overrides.linkedin_url || undefined,
          parent: overrides.parent || undefined,
        };
        console.log("[Enrichment] POST /api/enrich/search (fallback)", postBody);
        res = await fetchWithTimeout(
          "/api/enrich/search",
          {
            method: "POST",
            noRedirect: true,
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(postBody),
          },
          25000
        );
        json = await res.json().catch(() => ({}));
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Search failed (${res.status})`);
      }

      const data = json.data || {};
      setRows(Array.isArray(data.results) ? data.results : []);
      setSummary(data.summary || null);

      // seed fix form with what we got
      const g = data.summary?.company_guess || {};
      setFixName(g.name || "");
      setFixDomain(g.domain || "");
      setFixLinkedIn(g.linkedin_url || "");
      setFixParent("");
    } catch (e) {
      if (e?.name === "AbortError") return;
      setErr(e?.message || "Search failed");
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  // listen to company selection from sidebar/companies page
  useEffect(() => {
    const useNow = (e) => {
      const c = e?.detail;
      if (!c) return;
      setFixDomain(c.domain || "");
      run({ domain: c.domain, name: c.name, linkedin_url: c.linkedin_url });
    };
    window.addEventListener("upr:companyUseNow", useNow);
    return () => window.removeEventListener("upr:companyUseNow", useNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // clean up on unmount
  useEffect(() => {
    return () => {
      try {
        if (inFlight.current) inFlight.current.abort("unmount");
      } catch {}
    };
  }, []);

  const addToHR = async (companyId, selectedIdxs) => {
    if (!companyId) return;
    const toSave = selectedIdxs.length ? selectedIdxs.map((i) => rows[i]) : null; // backend will auto-pick if null

    const body = toSave
      ? { company_id: companyId, contacts: toSave }
      : { company_id: companyId, max_contacts: 3 };

    const res = await authFetch("/api/enrich", {
      method: "POST",
      noRedirect: true,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      throw new Error("Your session seems to have expired. Please sign in again.");
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || "Save failed");
    return json;
  };

  return (
    <div className="p-6">
      {/* Header status chips (always on) */}
      <div className="mb-4 flex items-center justify-end gap-2">
        <Pill label={`Data Source: ${dataSource || "live"}`} ok />
        <Pill label="DB" ok={!!dbOk} ms={statusTimings?.db_ms} />
        <Pill label="LLM" ok={!!llmOk} ms={statusTimings?.llm_ms} />
      </div>

      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-gray-900">
        Enrichment
      </h1>
      <p className="mb-4 text-sm text-gray-500">
        No company selected — search by company name.
      </p>

      {/* Search bar + actions */}
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
          onClick={() => run()}
        >
          {loading ? "Loading…" : "Enrich"}
        </button>
      </div>

      {/* per-run timings */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill
          label={`Data Source: ${summary?.provider || dataSource || "live"}`}
          ok
          ms={summary?.timings?.provider_ms}
        />
        <Pill label="DB" ok={!!dbOk} />
        <Pill label="LLM" ok={!!llmOk} ms={summary?.timings?.llm_ms} />
        {summary?.company_guess?.name && (
          <span className="ml-2 text-sm text-gray-600">
            Guess: <span className="font-medium">{summary.company_guess.name}</span>{" "}
            <button className="ml-2 text-blue-600 underline" onClick={() => setFixOpen(true)}>
              Not right? Fix
            </button>
          </span>
        )}
      </div>

      {/* error */}
      {err && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Results */}
      <div className="overflow-hidden rounded-2xl border">
        <div className="min-w-full">
          <div className="flex items-center justify-between border-b bg-gray-50 px-3 py-2">
            <div className="text-sm text-gray-700">Candidates: {rows.length || 0}</div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border px-3 py-2 text-sm"
                value={pickedCompanyId}
                onChange={(e) => setPickedCompanyId(e.target.value)}
              >
                <option value="">— Choose company —</option>
                {companyGuess?.name && (
                  <option value="__guess__">Use guessed: {companyGuess.name}</option>
                )}
              </select>
              <button
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!pickedCompanyId || (pickedIdxs.length === 0 && rows.length === 0)}
                onClick={async () => {
                  const company_id = pickedCompanyId === "__guess__" ? null : pickedCompanyId;
                  try {
                    await addToHR(company_id, pickedIdxs);
                    setPicked({});
                    alert("Saved!");
                  } catch (e) {
                    alert(e.message || "Save failed");
                  }
                }}
              >
                Add to HR Leads
              </button>
            </div>
          </div>

          <table className="w-full">
            <thead className="bg-white">
              <tr className="text-xs uppercase text-gray-500">
                <th className="w-8 px-3 py-2" />
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
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!picked[i]}
                      onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))}
                    />
                  </td>
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
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={9}>
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quality note */}
      {summary?.quality?.score != null && (
        <div className="mt-2 text-sm text-gray-600">
          Quality: {(summary.quality.score * 100).toFixed(0)}% —{" "}
          {summary.quality.explanation || "—"}
        </div>
      )}

      {/* Fix company modal */}
      {fixOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-lg font-semibold">Correct Company</div>
              <button className="text-gray-500" onClick={() => setFixOpen(false)}>
                ✕
              </button>
            </div>
            <div className="space-y-3 p-4">
              <Field label="Name">
                <input
                  className="w-full rounded border px-3 py-2"
                  value={fixName}
                  onChange={(e) => setFixName(e.target.value)}
                />
              </Field>
              <Field label="Website / Domain">
                <input
                  className="w-full rounded border px-3 py-2"
                  placeholder="solutionsplus.ae"
                  value={fixDomain}
                  onChange={(e) => setFixDomain(e.target.value)}
                />
              </Field>
              <Field label="LinkedIn URL">
                <input
                  className="w-full rounded border px-3 py-2"
                  value={fixLinkedIn}
                  onChange={(e) => setFixLinkedIn(e.target.value)}
                />
              </Field>
              <Field label="Parent / Group (optional)">
                <input
                  className="w-full rounded border px-3 py-2"
                  placeholder="Mubadala"
                  value={fixParent}
                  onChange={(e) => setFixParent(e.target.value)}
                />
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <button className="rounded border px-4 py-2" onClick={() => setFixOpen(false)}>
                  Cancel
                </button>
                <button
                  className="rounded bg-gray-900 px-4 py-2 font-medium text-white"
                  onClick={() => {
                    setFixOpen(false);
                    run({
                      name: fixName,
                      domain: fixDomain,
                      linkedin_url: fixLinkedIn,
                      parent: fixParent,
                    });
                  }}
                >
                  Apply &amp; Re-run
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
