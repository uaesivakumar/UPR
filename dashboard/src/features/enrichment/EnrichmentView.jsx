import React, { useMemo, useState, useCallback } from "react";
import { authFetch } from "../../utils/auth";
import LLMStatus from "./LLMStatus";

/** Helpers */
async function safeJson(resp) {
  try { return await resp.json(); } catch { return null; }
}
function prettyStatus(s) { return String(s || "unknown").toLowerCase(); }
function statusPillClass(s) {
  const v = String(s || "unknown").toLowerCase();
  if (v === "validated")
    return "text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (v === "bounced" || v === "invalid")
    return "text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200";
  if (v === "patterned" || v === "guessed")
    return "text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200";
  return "text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 border border-gray-200";
}
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const el = document.createElement("textarea");
    el.value = text; document.body.appendChild(el); el.select();
    document.execCommand("copy"); document.body.removeChild(el);
  }
}

function ScoreBadge({ score }) {
  if (typeof score !== "number") return null;
  const color =
    score >= 80
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 60
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm border ${color}`}>
      Score: <span className="font-semibold">{score}</span>/100
    </span>
  );
}

/** Main Enrichment view (company card now lives in Sidebar) */
export default function EnrichmentView({ initialQuery = "", onCompanyChange }) {
  const [query, setQuery] = useState(initialQuery);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState(null);
  const [primaryContactKey, setPrimaryContactKey] = useState(null);

  // Always-visible LLM badge
  const [llmStatus, setLlmStatus] = useState("idle");
  const [llmModel, setLlmModel] = useState(null);
  const [llmDuration, setLlmDuration] = useState(null);
  const [llmErrText, setLlmErrText] = useState(null);

  const primaryContact = useMemo(() => {
    if (!result || !result.contacts?.length) return null;
    return result.contacts.find((c) => c._k === primaryContactKey) ?? result.contacts[0];
  }, [result, primaryContactKey]);

  const isBlank = (s) => !s || s.trim().length === 0;

  const runEnrichment = useCallback(async (e) => {
    e?.preventDefault?.();
    setErr(null);
    setResult(null);
    setPrimaryContactKey(null);

    const input = query.trim();
    if (isBlank(input)) { setErr("input required"); return; }

    setLoading(true);
    setLlmStatus("running"); setLlmModel(null); setLlmDuration(null); setLlmErrText(null);

    const t0 = performance.now();
    try {
      // Tell backend to fetch across HR / TA / Payroll / Finance / Admin / Onboarding etc.
      const res = await authFetch("/api/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, departments: ["hr","hrbp","ta","payroll","finance","admin","office_admin","onboarding"] }),
      });

      const data = await safeJson(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "enrichment failed");

      const payload = data.data || {};
      const duration_ms = payload?._meta?.duration_ms ?? Math.round(performance.now() - t0);
      const model = payload?._meta?.model || "openai";

      // Filter: only **real people** (must have person name) and no generic mailbox emails
      const GENERIC_MAILBOX = /^(info|contact|admin|office|hello|support|careers|hr|jobs|payroll|finance|accounts|team|help|sales|pr|media|press|recruitment|talent|onboarding|noreply|no-reply)@/i;

      const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
      const realPeople = contacts
        .filter((c) => {
          const nameOk = !!String(c.name || "").trim();
          if (!nameOk) return false;
          const email = c.email || c.email_guess || "";
          if (!email) return true; // allow if name exists but email guessed later
          return !GENERIC_MAILBOX.test(String(email).toLowerCase());
        })
        .map((c, i) => ({ _k: c.id || `${c.name || "x"}-${c.email || c.email_guess || "x"}-${i}`, ...c }));

      const next = { ...payload, contacts: realPeople };
      setResult(next);
      setPrimaryContactKey(realPeople?.[0]?._k ?? null);

      // update left sidebar company card
      onCompanyChange?.(next.company || null);
      window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: next.company || null }));

      setLlmModel(model); setLlmDuration(duration_ms); setLlmStatus("ok");
    } catch (e2) {
      setErr(e2?.message || "Something went wrong");
      setLlmErrText(e2?.message || "Unknown error");
      setLlmStatus("error");
      onCompanyChange?.(null);
      window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
    } finally {
      setLoading(false);
    }
  }, [query, onCompanyChange]);

  const saveAsLead = useCallback(async () => {
    if (!result?.company?.name) { alert("No company to save."); return; }
    const c = primaryContact;
    const payload = {
      company: {
        name: result.company.name,
        type: result.company.type ?? null,
        locations: result.company.locations ?? (result.company.hq ? [result.company.hq] : []),
        website_url: result.company.website ?? null,
        linkedin_url: result.company.linkedin ?? null,
      },
      contact: c ? {
        name: c.name ?? null,
        designation: c.title ?? "Decision Maker",
        linkedin_url: c.linkedin ?? null,
        location: c.dept ?? result.company.hq ?? null,
        email: c.email ?? c.email_guess ?? null,
        email_status: c.email_status || (c.email ? "validated" : c.email_guess ? "patterned" : "unknown"),
        confidence: typeof c.confidence === "number" ? c.confidence : null,
      } : null,
      status: "New",
      notes: (result.outreachDraft ? "Draft present. " : "") + "Saved from Enrichment UI",
    };
    try {
      const res = await authFetch("/api/hr-leads/from-enrichment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to create HR lead");
      alert("Lead saved ✅");
    } catch (e) {
      alert(e?.message || "Failed to save lead");
    }
  }, [result, primaryContact]);

  // Quality explainability
  const q = result?.quality || null;
  const qScore = typeof q?.score === "number" ? q.score : null;
  const qFactors = Array.isArray(q?.factors) ? q.factors : [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Always-visible LLM status */}
      <LLMStatus status={llmStatus} model={llmModel} durationMs={llmDuration} errorText={llmErrText} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Enrichment</h1>
          <p className="text-sm text-gray-500">
            Paste a company website / LinkedIn URL, or describe the target (e.g., “G42 UAE Finance Director”).
          </p>
        </div>
      </div>

      {/* Query box */}
      <form onSubmit={runEnrichment} className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5 space-y-3 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">Input</label>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (err && e.target.value.trim().length > 0) setErr(null); }}
            placeholder="https://company.com  |  linkedin.com/company/...  |  'ADGM fintech HR head UAE'"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-gray-900 text-white px-4 py-2 font-medium hover:bg-black disabled:opacity-60"
          >
            {loading ? "Enriching…" : "Enrich"}
          </button>
        </div>
        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>}
      </form>

      {/* Quality explainability (top-right area) */}
      {result && (
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">Quality</h3>
            <ScoreBadge score={qScore} />
          </div>
          {qFactors.length ? (
            <ul className="grid md:grid-cols-2 gap-2">
              {qFactors.map((f, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="mt-1 inline-block w-2 h-2 rounded-full bg-gray-400" />
                  <span>
                    <span className="font-medium">{f.label}</span>
                    {typeof f.impact === "number" && <span className="ml-1 text-gray-500">(+{Math.round(f.impact)})</span>}
                    {f.detail && <span className="ml-2 text-gray-600">— {f.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-500">No explanation available.</div>
          )}
        </section>
      )}

      {/* Contacts & Outreach */}
      {result && (
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Suggested Contacts</h2>
          </div>

          {(!result.contacts || result.contacts.length === 0) ? (
            <div className="mt-4 text-sm text-gray-500">No contacts found (only real people shown; generic mailboxes hidden).</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 text-left">
                  <tr>
                    <th className="px-4 py-2">Primary</th>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Title</th>
                    <th className="px-4 py-2">Dept</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Accuracy</th>
                    <th className="px-4 py-2">LinkedIn</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.contacts.map((c) => {
                    const email = c.email || c.email_guess || null;
                    const isGuess = !c.email && !!c.email_guess;
                    const emailStatus = c.email_status || (isGuess ? "patterned" : "unknown");
                    const conf = typeof c.confidence === "number" ? Math.round(c.confidence * 100) : null;
                    return (
                      <tr key={c._k} className="border-t border-gray-100">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <input
                            type="radio"
                            name="primary"
                            checked={primaryContactKey === c._k}
                            onChange={() => setPrimaryContactKey(c._k)}
                            className="h-4 w-4"
                            aria-label="Primary contact"
                          />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">{c.name || "—"}</td>
                        <td className="px-4 py-2">{c.title || "—"}</td>
                        <td className="px-4 py-2">{c.dept || "—"}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {email ? (
                            <span className="inline-flex items-center gap-2">
                              <a className="underline" href={`mailto:${email}`}>{email}</a>
                              {isGuess && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                  guess
                                </span>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span className={statusPillClass(emailStatus)}>{prettyStatus(emailStatus)}</span>
                        </td>
                        <td className="px-4 py-2">{conf !== null ? `${conf}%` : "—"}</td>
                        <td className="px-4 py-2">
                          {c.linkedin ? <a className="underline" href={c.linkedin} target="_blank" rel="noreferrer">Profile</a> : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() =>
                              copyToClipboard(
                                result.outreachDraft ||
                                `Hi ${c.name?.split(" ")[0] || ""},\n\nWe help with payroll onboarding for premium employers in the UAE. If you prefer, I can share a tailored plan for ${result.company?.name}.`
                              )
                            }
                            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50"
                          >
                            Copy Draft
                          </button>
                          <button
                            onClick={saveAsLead}
                            className="ml-2 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs hover:bg-black"
                          >
                            Save Lead
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
