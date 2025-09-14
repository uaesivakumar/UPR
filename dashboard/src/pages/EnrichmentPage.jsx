// dashboard/src/pages/EnrichmentPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authFetch } from "../utils/auth";

/**
 * Enrichment (LLM-powered)
 * - Sends POST /api/enrich  { input }
 * - Shows small "LLM • live" badge next to title when request succeeds
 * - Can save a primary suggested contact as an HR Lead
 */
export default function EnrichmentPage() {
  const [sp] = useSearchParams();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const [primaryContactId, setPrimaryContactId] = useState(null);
  const [llmUsed, setLlmUsed] = useState(false);

  useEffect(() => {
    const v = sp.get("q");
    if (v) setQuery(v);
  }, [sp]);

  const primaryContact = useMemo(() => {
    if (!result?.contacts?.length) return null;
    return result.contacts.find((c) => c.id === primaryContactId) ?? result.contacts[0] ?? null;
  }, [result, primaryContactId]);

  async function runEnrichment(e) {
    e?.preventDefault?.();
    setErr(null);
    setResult(null);
    setPrimaryContactId(null);
    setLlmUsed(false);

    if (!query.trim()) {
      setErr("Please enter a company URL, LinkedIn, or a descriptive query.");
      return;
    }

    setLoading(true);
    try {
      // IMPORTANT: call /api/enrich (not /run)
      const res = await authFetch("/api/enrich", {
        method: "POST",
        body: JSON.stringify({ input: query.trim() }),
      });

      const data = await safeJson(res);
      if (!res.ok || !data?.ok || !data?.data) {
        throw new Error(data?.error || "Enrichment failed");
      }

      const normalized = normalizePayload(data.data);
      setResult(normalized);
      setPrimaryContactId(normalized.contacts?.[0]?.id ?? null);
      setLlmUsed(true);
    } catch (e) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function saveAsLead() {
    if (!result?.company?.name) {
      alert("No company to save.");
      return;
    }
    const c = primaryContact;
    const payload = {
      company: {
        name: result.company.name,
        locations: result.company.hq ? [result.company.hq] : [],
        website_url: result.company.website ?? null,
        linkedin_url: result.company.linkedin ?? null,
        type: result.company.type ?? null,
      },
      contact: c
        ? {
            name: c.name ?? null,
            designation: c.title ?? "Decision Maker",
            linkedin_url: c.linkedin ?? null,
            location: c.dept ?? result.company.hq ?? null,
            email: c.email ?? c.email_guess ?? null,
            email_status: (c.email && "validated") || c.email_status || "unknown",
          }
        : {
            name: "Decision Maker",
            designation: "Decision Maker",
            linkedin_url: null,
            location: result.company.hq ?? null,
            email: null,
            email_status: "unknown",
          },
      status: "New",
      notes: "Saved from Enrichment UI",
    };

    try {
      const res = await authFetch("/api/hr-leads/from-enrichment", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to create HR lead");
      }
      alert("Lead saved ✅");
    } catch (e) {
      alert(e?.message || "Failed to save lead");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">Enrichment</h1>
        {llmUsed && <LlmBadge />}
      </div>
      <p className="text-sm text-gray-500">
        Paste a company website / LinkedIn URL, or describe the target (e.g., “G42 UAE Finance Director”).
      </p>

      <form onSubmit={runEnrichment} className="bg-white rounded-xl shadow p-4 md:p-5 space-y-3">
        <label className="block text-sm font-medium text-gray-700">Input</label>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="https://company.com  |  https://linkedin.com/company/...  |  'ADGM fintech HR head UAE'"
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
        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>}
      </form>

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-1 bg-white rounded-xl shadow p-5 space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">Company</h2>
            <div className="text-sm text-gray-700">
              <Row label="Name" value={result.company.name || "—"} />
              <Row label="Website" value={linkOrText(result.company.website)} />
              <Row label="LinkedIn" value={linkOrText(result.company.linkedin)} />
              <Row label="HQ" value={result.company.hq || "—"} />
              <Row label="Industry" value={result.company.industry || "—"} />
              <Row label="Size" value={result.company.size || "—"} />
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
                <span className="font-medium">{result.score}/100</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.tags.map((t) => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="lg:col-span-2 bg-white rounded-xl shadow p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Suggested Contacts</h2>
              {result.contacts.length > 0 && (
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

            {result.contacts.length === 0 ? (
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
                          {c.email || c.email_guess ? (
                            <a className="underline" href={`mailto:${c.email || c.email_guess}`}>
                              {c.email || c.email_guess}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {c.linkedin ? (
                            <a className="underline" href={c.linkedin} target="_blank" rel="noreferrer">
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

          <section className="lg:col-span-3 bg-white rounded-xl shadow p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Outreach Draft</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(result.outreachDraft)}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Copy
                </button>
                <button onClick={saveAsLead} className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800">
                  Save as Lead
                </button>
              </div>
            </div>
            <textarea
              className="w-full min-h-[180px] border rounded-xl px-3 py-2"
              value={result.outreachDraft}
              onChange={(e) =>
                setResult((prev) => (prev ? { ...prev, outreachDraft: e.target.value } : prev))
              }
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

/* ----------------- helpers ----------------- */

function LlmBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
      LLM • live
    </span>
  );
}

function normalizePayload(raw) {
  // Make the UI resilient to either our stub or a richer LLM result.
  const company = {
    name: raw?.company?.name || raw?.company_name || "",
    website: raw?.company?.website ?? raw?.website ?? null,
    linkedin: raw?.company?.linkedin ?? raw?.linkedin_url ?? null,
    hq: raw?.company?.hq ?? raw?.hq ?? null,
    industry: raw?.company?.industry ?? null,
    size: raw?.company?.size ?? null,
    type: raw?.company?.type ?? null,
    notes: raw?.company?.notes ?? raw?.notes ?? null,
  };

  const contacts = Array.isArray(raw?.contacts)
    ? raw.contacts.map((c, i) => ({
        id: c.id || `${i}`,
        name: c.name || "",
        title: c.title || "",
        dept: c.dept || null,
        email: c.email || null,
        email_guess: c.email_guess || null,
        email_status: c.email_status || "unknown",
        linkedin: c.linkedin || c.linkedin_url || null,
        confidence: typeof c.confidence === "number" ? c.confidence : (typeof c.score === "number" ? c.score / 100 : 0),
      }))
    : [];

  const tags = Array.isArray(raw?.tags) ? raw.tags : [];
  const score =
    typeof raw?.score === "number"
      ? raw.score
      : Math.min(100, Math.round(((company.name ? 0.4 : 0) + (contacts.length ? 0.6 : 0)) * 100));

  const outreachDraft =
    raw?.outreachDraft ||
    `Subject: Partnership with ${company.name || "your team"}

Hi ${contacts[0]?.name || "there"},

We help HR teams in the UAE reduce sourcing time and improve lead quality using an enrichment + outreach workflow.

Happy to share a shortlist tailored to ${company.hq || "your location"} within 24 hours.

Best,
UPR Team`;

  return { company, contacts, tags, score, outreachDraft };
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
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

function linkOrText(url) {
  if (!url) return "—";
  const safe = String(url).startsWith("http") ? String(url) : `https://${url}`;
  return (
    <a className="underline" href={safe} target="_blank" rel="noreferrer">
      {url}
    </a>
  );
}
