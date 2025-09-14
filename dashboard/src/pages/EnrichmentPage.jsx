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

  // read ?q= from URL if present
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

    const input = query.trim();
    if (!input) {
      setErr("input required");
      return;
    }

    setLoading(true);
    const t0 = performance.now();
    try {
      // Backend expects: POST /api/enrich  { input }
      const res = await authFetch("/api/enrich", {
        method: "POST",
        body: JSON.stringify({ input }),
      });

      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "enrichment failed");
      }

      const payload = data.data || {};
      // attach basic meta if backend didn’t
      const duration_ms = Math.round(performance.now() - t0);
      payload.meta = {
        llm: payload?.meta?.llm ?? "openai",
        model: payload?.meta?.model ?? (import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini"),
        duration_ms: payload?.meta?.duration_ms ?? duration_ms,
        used: true,
      };

      setResult(payload);
      setPrimaryContactId(payload.contacts?.[0]?.id ?? null);
    } catch (e) {
      setErr(e?.message || "Something went wrong");
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
      name: result.company.name,
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
          email_status: c.email_status || (c.email ? "validated" : (c.email_guess ? "patterned" : "unknown")),
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">Enrichment</h1>
          {/* LLM usage badge */}
          {result?.meta?.used && (
            <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 px-2 py-1">
              <SparklesIcon />
              {result?.meta?.model || "LLM"} · {result?.meta?.duration_ms ?? 0}ms
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          Paste a company website / LinkedIn URL, or describe the target (e.g.,
          “G42 UAE Finance Director”).
        </p>
      </div>

      {/* Input */}
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

      {/* Results */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Company card */}
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
                <span className="font-medium">{result.score ?? 0}/100</span>
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

          {/* Contacts table */}
          <section className="lg:col-span-2 bg-white rounded-xl shadow p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Suggested Contacts
              </h2>
              {result.contacts?.length > 0 && (
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

            {(!result.contacts || result.contacts.length === 0) ? (
              <div className="mt-4 text-sm text-gray-500">No contacts found.</div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <ContactsThead />
                  <tbody>
                    {result.contacts.map((c) => (
                      <tr key={c.id} className="border-t border-gray-200">
                        <td className="px-4 py-2 whitespace-nowrap">{c.name || "—"}</td>
                        <td className="px-4 py-2">{c.title || "—"}</td>
                        <td className="px-4 py-2">{c.dept || "—"}</td>
                        <td className="px-4 py-2">
                          {renderEmailCell(c)}
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
                          {Math.round((c.confidence ?? 0) * 100)}%
                        </td>
                        <td className="px-4 py-2">
                          <span className={statusPillClass(c.email_status)}>
                            {prettyStatus(c.email_status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Outreach editor */}
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

/* ------------------------ table subcomponents ------------------------ */

function ContactsThead() {
  return (
    <thead className="bg-gray-100 text-gray-700 text-left">
      <tr>
        <th className="px-4 py-2">Name</th>
        <th className="px-4 py-2">Title</th>
        <th className="px-4 py-2">Dept</th>
        <th className="px-4 py-2">Email</th>
        <th className="px-4 py-2">LinkedIn</th>
        <th className="px-4 py-2">Conf.</th>
        <th className="px-4 py-2">Status</th>
      </tr>
    </thead>
  );
}

/* ----------------------------- helpers ------------------------------ */

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

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="text-xs uppercase text-gray-400 w-24 shrink-0">
        {label}
      </div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

function linkOrText(url) {
  if (!url) return "—";
  const safe = String(url).startsWith("http") ? url : `https://${url}`;
  return (
    <a className="underline" href={safe} target="_blank" rel="noreferrer">
      {url}
    </a>
  );
}

/**
 * Helper requested: renderEmailCell
 * - Shows a `mailto:` link if email is present.
 * - Falls back to guessed email with a subtle “(guess)” tag.
 * - Returns "—" when neither is available.
 */
function renderEmailCell(c) {
  const email = c.email || c.email_guess || null;
  if (!email) return "—";
  const isGuess = !c.email && !!c.email_guess;
  return (
    <span className="inline-flex items-center gap-2">
      <a className="underline break-all" href={`mailto:${email}`}>
        {email}
      </a>
      {isGuess && (
        <span className="text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
          guess
        </span>
      )}
    </span>
  );
}

function prettyStatus(s) {
  if (!s) return "unknown";
  return String(s).toLowerCase();
}

function statusPillClass(s) {
  const v = String(s || "unknown").toLowerCase();
  if (v === "validated")
    return "text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (v === "bounced" || v === "invalid")
    return "text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200";
  if (v === "patterned" || v === "guessed")
    return "text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200";
  return "text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 border border-gray-200";
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M10 1l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5zm7 11l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
    </svg>
  );
}
