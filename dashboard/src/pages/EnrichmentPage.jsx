// dashboard/src/pages/EnrichmentPage.jsx
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../utils/auth";

function Pill({ ok = true, label, ms }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
        ok ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-600"
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
  const [summary, setSummary] = useState(null); // timings, provider, company_guess, quality

  // disambiguation modal state
  const [fixOpen, setFixOpen] = useState(false);
  const [fixName, setFixName] = useState("");
  const [fixDomain, setFixDomain] = useState("");
  const [fixLinkedIn, setFixLinkedIn] = useState("");
  const [fixParent, setFixParent] = useState("");

  const companyGuess = summary?.company_guess;

  const run = async (overrides = {}) => {
    if (!q.trim() && !overrides.name && !overrides.domain && !overrides.linkedin_url) {
      setErr("Enter a company name first.");
      return;
    }
    setLoading(true);
    setErr("");
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

      const res = await authFetch(`/api/enrich/search?${sp.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Search failed");

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
      setErr(e?.message || "Search failed");
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const addToHR = async (companyId, selectedIdxs) => {
    if (!companyId) return;
    const toSave = selectedIdxs.length ? selectedIdxs.map((i) => rows[i]) : null; // backend auto-picks if null
    const body = toSave
      ? { company_id: companyId, contacts: toSave }
      : { company_id: companyId, max_contacts: 3 };

    const res = await authFetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) throw new Error(json?.error || "Save failed");
    return json;
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

  const [pickedCompanyId, setPickedCompanyId] = useState("");
  const [picked, setPicked] = useState({}); // idx -> true
  const pickedIdxs = useMemo(
    () => Object.keys(picked).filter((k) => picked[k]).map((n) => Number(n)),
    [picked]
  );

  return (
    <div className="p-6">
      {/* Header status chips (always on) */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <Pill label={`Data Source: ${summary?.provider || "live"}`} ok />
        <Pill label="DB" ok />
        <Pill label="LLM" ok />
      </div>

      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-gray-900">Enrichment</h1>
      <p className="mb-4 text-sm text-gray-500">No company selected — search by company name.</p>

      {/* Search bar + actions */}
      <div className="mb-3 flex items-center gap-2">
        <input
          className="flex-1 rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          placeholder='Type company name (e.g., "First Abu Dhabi Bank")'
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

      {/* Per-run timings */}
      <div className="mb-3 flex items-center gap-2">
        <Pill label={`Data Source: ${summary?.provider || "live"}`} ok ms={summary?.timings?.provider_ms} />
        <Pill label="DB" ok />
        <Pill label="LLM" ok ms={summary?.timings?.llm_ms} />
        {companyGuess?.name && (
          <span className="ml-2 text-sm text-gray-600">
            Guess: <span className="font-medium">{companyGuess.name}</span>{" "}
            <button className="ml-2 text-blue-600 underline" onClick={() => setFixOpen(true)}>
              Not right? Fix
            </button>
          </span>
        )}
      </div>

      {/* error */}
      {err && <div className="mb-3 text-red-600">{err}</div>}

      {/* Results */}
      <div className="overflow-hidden rounded-2xl border">
        <div className="min-w-full">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
            <div className="text-sm text-gray-700">
              {loading ? "Loading…" : `Candidates: ${rows.length || 0}`}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border px-3 py-2 text-sm"
                value={pickedCompanyId}
                onChange={(e) => setPickedCompanyId(e.target.value)}
              >
                <option value="">— Choose company —</option>
                {companyGuess?.name && <option value="__guess__">Use guessed: {companyGuess.name}</option>}
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
                <th className="px-3 py-2 w-8"></th>
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
                  <td className="px-3 py-2">{r.name}</td>
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
          Quality: {(summary.quality.score * 100).toFixed(0)}% — {summary.quality.explanation || "—"}
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
            <div className="p-4 space-y-3">
              <Field label="Name">
                <input className="w-full rounded border px-3 py-2" value={fixName} onChange={(e) => setFixName(e.target.value)} />
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
                <input className="w-full rounded border px-3 py-2" value={fixLinkedIn} onChange={(e) => setFixLinkedIn(e.target.value)} />
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
                    run({ name: fixName, domain: fixDomain, linkedin_url: fixLinkedIn, parent: fixParent });
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

function Field({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-sm text-gray-700">{label}</div>
      {children}
    </div>
  );
}
