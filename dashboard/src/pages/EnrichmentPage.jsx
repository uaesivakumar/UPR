// dashboard/src/pages/EnrichmentPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authFetch } from "../utils/auth";

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
    const pick =
      result.contacts.find((c) => c.id === primaryContactId) ??
      result.contacts[0];
    return pick ?? null;
  }, [result, primaryContactId]);

  async function runEnrichment(e) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    setPrimaryContactId(null);

    if (!query.trim()) {
      setErr("input required");
      return;
    }

    setLoading(true);
    try {
      // Preferred single endpoint
      const res = await authFetch("/api/enrich", {
        method: "POST",
        body: JSON.stringify({ input: query.trim() }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok || !data?.data) {
        throw new Error(data?.error || "enrichment failed");
      }
      const out = normalizeEnrichment(data.data);
      setResult(out);
      setPrimaryContactId(out.contacts?.[0]?.id ?? null);
    } catch (e) {
      setErr(e?.message || "something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function saveAsLead() {
    if (!result || !result.company?.name) {
      alert("No company to save.");
      return;
    }

    const company = {
      name: result.company.name || null,
      type: result.company.type ?? null,
      locations:
        result.company.locations ??
        (result.company.hq ? [result.company.hq] : []),
      website_url: result.company.website ?? null,
      linkedin_url: result.company.linkedin ?? null,
    };

    const c = primaryContact;
    const contact = c
      ? {
          name: c.name ?? null,
          designation: c.title ?? "Decision Maker",
          linkedin_url: c.linkedin ?? null,
          location: c.dept ?? result.company.hq ?? null,
          email: c.email ?? c.email_guess ?? null,
          email_status: c.email_status || (c.email ? "validated" : "unknown"),
        }
      : {
          name: "Decision Maker",
          designation: "Decision Maker",
          linkedin_url: null,
          location: result.company.hq ?? null,
          email: null,
          email_status: "unknown",
        };

    const payload = {
      company,
      contact,
      status: "New",
      notes:
        (result.outreachDraft ? "Draft present. " : "") +
        "Saved from Enrichment UI",
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

  const llmOn = !!result; // route is AI-backed; show badge when we have a result

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Enrichment</h1>
        {llmOn && <Pill>LLM: On</Pill>}
      </div>
      <p className="text-sm text-gray-500">
        Paste a company website / LinkedIn URL, or describe the target (e.g.,
        “G42 UAE Finance Director”).
      </p>

      <form
        onSubmit={runEnrichment}
        className="bg-white rounded-xl shadow p-4 md:p-5 space-y-3"
      >
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
        {err && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
            {err}
          </div>
        )}
      </form>

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Company */}
          <section className="lg:col-span-1 bg-white rounded-xl shadow p-5 space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">Company</h2>
            <div className="text-sm text-gray-700">
              <Row label="Name" value={result.company.name} />
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
                {(result.tags || []).map((t) => (
                  <span
                    key={t}
                    className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Contacts with Email Status + Confidence */}
          <section className="lg:col-span-2 bg-white rounded-xl shadow p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Suggested Contacts
              </h2>
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
                  {/* >>> UPDATED TABLE HEADER (includes Status column) */}
                  <thead className="bg-gray-100 text-gray-700 text-left">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Title</th>
                      <th className="px-4 py-2">Dept</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">LinkedIn</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Confidence</th>
                    </tr>
                  </thead>

                  {/* >>> UPDATED TABLE BODY (uses StatusBadge) */}
                  <tbody>
                    {result.contacts.map((c) => (
                      <tr key={c.id} className="border-t border-gray-200">
                        <td className="px-4 py-2">{c.name || "—"}</td>
                        <td className="px-4 py-2">{c.title || "—"}</td>
                        <td className="px-4 py-2">{c.dept || "—"}</td>
                        <td className="px-4 py-2">
                          {c.email ? (
                            <a className="underline" href={`mailto:${c.email}`}>
                              {c.email}
                            </a>
                          ) : (
                            c.email_guess || "—"
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {c.linkedin ? (
                            <a
                              className="underline"
                              href={c.linkedin}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Profile
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={c.email_status} />
                        </td>
                        <td className="px-4 py-2">
                          {Math.round((c.confidence ?? 0) * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Outreach */}
          <section className="lg:col-span-3 bg-white rounded-xl shadow p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Outreach Draft
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(result.outreachDraft || "")}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Copy
                </button>
                <button
                  onClick={saveAsLead}
                  className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800"
                >
                  Save as Lead
                </button>
              </div>
            </div>
            <textarea
              className="w-full min-h-[180px] border rounded-xl px-3 py-2"
              value={result.outreachDraft || ""}
              onChange={(e) =>
                setResult((prev) =>
                  prev ? { ...prev, outreachDraft: e.target.value } : prev
                )
              }
            />
            {primaryContact && (
              <p className="text-xs text-gray-500">
                Primary contact:{" "}
                <span className="font-medium">{primaryContact.name}</span> —{" "}
                {primaryContact.title}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function Pill({ children }) {
  return (
    <span className="text-xs px-2 py-1 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">
      {children}
    </span>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="text-xs uppercase text-gray-400 w-24 shrink-0">
        {label}
      </div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function linkOrText(url) {
  if (!url) return "—";
  const safe = url.startsWith("http") ? url : `https://${url}`;
  return (
    <a className="underline" href={safe} target="_blank" rel="noreferrer">
      {url}
    </a>
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
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

/** Normalizes backend shapes so the UI doesn't crash if fields are missing. */
function normalizeEnrichment(raw) {
  const company = {
    name: raw?.company?.name || "—",
    website: raw?.company?.website ?? raw?.company?.domain ?? null,
    linkedin: raw?.company?.linkedin ?? raw?.company?.linkedin_url ?? null,
    hq: raw?.company?.hq ?? raw?.company?.location ?? null,
    size: raw?.company?.size ?? null,
    industry: raw?.company?.industry ?? null,
    notes: raw?.company?.notes ?? null,
    locations: raw?.company?.locations ?? null,
    type: raw?.company?.type ?? null,
  };

  const contacts = (raw?.contacts || []).map((c, i) => ({
    id: c.id || `${i}`,
    name: c.name || "—",
    title: c.title || "—",
    dept: c.dept || null,
    email: c.email || null,
    email_guess: c.email_guess || null,
    email_status: c.email_status || "unknown",
    linkedin: c.linkedin || c.linkedin_url || null,
    confidence:
      typeof c.confidence === "number"
        ? c.confidence
        : typeof c.score === "number"
        ? c.score / 100
        : 0,
    score: typeof c.score === "number" ? c.score : undefined,
  }));

  return {
    company,
    contacts,
    tags: raw?.tags || [],
    score:
      typeof raw?.score === "number"
        ? raw.score
        : Math.round(
            (contacts.reduce((a, b) => a + (b.confidence || 0), 0) /
              Math.max(contacts.length || 1, 1)) *
              100
          ),
    outreachDraft:
      raw?.outreachDraft ||
      `Subject: Partnership with ${company.name}\n\nHi HR Director,\n\nI’m reaching out to share how we can reduce sourcing time and improve lead quality for your UAE hiring.\n\nIf helpful, I can share a shortlist tailored to ${company.hq || "your HQ"} within 24 hours.\n\nBest,\nUPR Team`,
  };
}

/** >>> Email Status pill used in the contacts table */
function StatusBadge({ status }) {
  const s = (status || "unknown").toLowerCase();
  const cfg =
    {
      validated: {
        cls: "bg-green-50 text-green-700 border-green-200",
        label: "Validated",
      },
      bounced: {
        cls: "bg-red-50 text-red-700 border-red-200",
        label: "Bounced",
      },
      patterned: {
        cls: "bg-amber-50 text-amber-700 border-amber-200",
        label: "Patterned",
      },
      unknown: {
        cls: "bg-gray-50 text-gray-700 border-gray-200",
        label: "Unknown",
      },
    }[s] ||
    {
      cls: "bg-gray-50 text-gray-700 border-gray-200",
      label: s,
    };

  return (
    <span className={`text-xs px-2 py-1 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
