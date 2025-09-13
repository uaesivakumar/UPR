// dashboard/src/pages/EnrichmentPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authFetch, getAuthHeader } from "../utils/auth";

export default function EnrichmentPage() {
  const [sp] = useSearchParams();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [result, setResult] = useState(null);
  const [primaryContactId, setPrimaryContactId] = useState(null);

  useEffect(() => {
    const v = sp.get("q");
    if (v) setQuery(v);
  }, [sp]);

  const primaryContact = useMemo(() => {
    if (!result || !result.contacts?.length) return null;
    const pick = result.contacts.find((c) => c.id === primaryContactId) ?? result.contacts[0];
    return pick ?? null;
  }, [result, primaryContactId]);

  async function runEnrichment(e) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    setPrimaryContactId(null);

    if (!query.trim()) {
      setErr("Please enter a company URL, LinkedIn, or a descriptive query.");
      return;
    }

    setLoading(true);
    try {
      // Server route for enrichment (adjusted to new modular API)
      const res = await authFetch("/api/enrichment/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok || !data?.data) {
        throw new Error(data?.error || "Enrichment failed");
      }
      setResult(data.data);
      setPrimaryContactId(data.data.contacts?.[0]?.id ?? null);
    } catch (e) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function saveAsTargetedCompany() {
    if (!result?.company?.name) {
      alert("No company to save.");
      return;
    }

    // Map enrichment -> companies payload
    const companyPayload = {
      name: result.company.name,
      website_url: result.company.website || null,
      linkedin_url: result.company.linkedin || null,
      // choose any UAE locations we detected; fallback empty []
      locations: Array.isArray(result.company.locations) ? result.company.locations : [],
      // leave type for now (ALE/NON_ALE/Good Coded can be edited later)
      type: result.company.type || null,
      status: "New",
      qscore: Number.isFinite(result.score) ? Math.round(result.score) : 0,
    };

    try {
      // 1) create company
      const cRes = await authFetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(companyPayload),
      });
      const cData = await safeJson(cRes);
      if (!cRes.ok || !cData?.ok || !cData?.data?.id) {
        throw new Error(cData?.error || "Failed to create company");
      }
      const companyId = cData.data.id;

      // 2) optionally create an HR lead from the selected primary contact
      if (primaryContact) {
        const leadPayload = {
          company_id: companyId,
          name: primaryContact.name || null,
          designation: primaryContact.title || null,
          linkedin_url: primaryContact.linkedin || null,
          location: primaryContact.location || null,
          email: primaryContact.email || null,
          email_status: primaryContact.email_status || null, // validated/guessed/patterned/bounced/unknown
          lead_status: "New",
        };

        const lRes = await authFetch("/api/hr-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify(leadPayload),
        });
        const lData = await safeJson(lRes);
        if (!lRes.ok || !lData?.ok) {
          // non-fatal: company is already created
          console.warn("HR lead create failed:", lData?.error || lRes.statusText);
        }
      }

      alert("Saved ✅  (Company created, lead added if a primary contact was selected)");
    } catch (e) {
      alert(e?.message || "Save failed");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Enrichment</h1>
        <p className="text-sm text-gray-500">
          Paste a company website / LinkedIn URL, or describe the target (e.g., “ADGM fintech HR head UAE”).
        </p>
      </div>

      <form onSubmit={runEnrichment} className="bg-white rounded-xl shadow p-4 md:p-5 space-y-3">
        <label className="block text-sm font-medium text-gray-700">Input</label>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="https://company.com | https://linkedin.com/company/... | 'Abu Dhabi HR Director fintech'"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-gray-900 text-white px-4 py-2 font-medium hover:bg-gray-800 disabled:opacity-60"
          >
            {loading ? "Enriching…" : "Enrich"}
          </button>
        </div>
        {err && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>
        )}
      </form>

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Company card */}
          <section className="lg:col-span-1 bg-white rounded-xl shadow p-5 space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">Company</h2>
            <div className="text-sm text-gray-700">
              <Row label="Name" value={result.company.name} />
              <Row label="Website" value={linkOrText(result.company.website)} />
              <Row label="LinkedIn" value={linkOrText(result.company.linkedin)} />
              <Row label="HQ" value={result.company.hq || "—"} />
              <Row label="Industry" value={result.company.industry || "—"} />
              <Row label="Size" value={result.company.size || "—"} />
              {Array.isArray(result.company.locations) && result.company.locations.length > 0 && (
                <Row label="Locations" value={result.company.locations.join(", ")} />
              )}
              {result.company.notes && (
                <div className="mt-2">
                  <div className="text-xs uppercase text-gray-400">Notes</div>
                  <p className="mt-1">{result.company.notes}</p>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm">
                <span className="text-gray-500">Quality Score:</span>{" "}
                <span className="font-medium">{Math.round(result.score ?? 0)}/100</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(result.tags || []).map((t) => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Contacts table */}
          <section className="lg:col-span-2 bg-white rounded-xl shadow p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Suggested Contacts</h2>
              {Array.isArray(result.contacts) && result.contacts.length > 0 && (
                <select
                  className="border rounded-lg px-2 py-1 text-sm"
                  value={primaryContactId ?? ""}
                  onChange={(e) => setPrimaryContactId(e.target.value)}
                >
                  {result.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {!result.contacts?.length ? (
              <div className="mt-4 text-sm text-gray-500">No contacts found.</div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 text-gray-700 text-left">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Title</th>
                      <th className="px-4 py-2">Dept</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">LinkedIn</th>
                      <th className="px-4 py-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.contacts.map((c) => (
                      <tr key={c.id} className="border-t border-gray-200">
                        <td className="px-4 py-2">{c.name}</td>
                        <td className="px-4 py-2">{c.title}</td>
                        <td className="px-4 py-2">{c.dept || "—"}</td>
                        <td className="px-4 py-2">
                          {c.email ? <a className="underline" href={`mailto:${c.email}`}>{c.email}</a> : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {c.linkedin ? (
                            <a className="underline" href={ensureHttp(c.linkedin)} target="_blank" rel="noreferrer">
                              Profile
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2">{Math.round((c.confidence ?? 0) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Outreach + Save */}
          <section className="lg:col-span-3 bg-white rounded-xl shadow p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Outreach Draft</h2>
              <div className="flex gap-2">
                <button onClick={() => copyToClipboard(result.outreachDraft)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
                  Copy
                </button>
                <button onClick={saveAsTargetedCompany} className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800">
                  Save as Targeted Company
                </button>
              </div>
            </div>
            <textarea
              className="w-full min-h-[180px] border rounded-xl px-3 py-2"
              value={result.outreachDraft}
              onChange={(e) => setResult((prev) => (prev ? { ...prev, outreachDraft: e.target.value } : prev))}
            />
            {primaryContact && (
              <p className="text-xs text-gray-500">
                Primary contact: <span className="font-medium">{primaryContact.name}</span> — {primaryContact.title}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text || "";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="text-xs uppercase text-gray-400 w-24 shrink-0">{label}</div>
      <div className="text-sm break-words">{value ?? "—"}</div>
    </div>
  );
}

function ensureHttp(url) {
  if (!url) return null;
  return url.startsWith("http") ? url : `https://${url}`;
}

function linkOrText(url) {
  if (!url) return "—";
  const safe = ensureHttp(url);
  return (
    <a className="underline" href={safe} target="_blank" rel="noreferrer">
      {url}
    </a>
  );
}
