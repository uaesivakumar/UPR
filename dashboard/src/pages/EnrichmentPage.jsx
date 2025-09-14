import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { authFetch } from "../utils/auth";

/* ----------------------------- LLM Status ----------------------------- */
/** Always-visible LLM status pill (idle → running → ok/error). */
function LLMStatus({ status = "idle", model = null, durationMs = null, errorText = null }) {
  const tone =
    {
      idle: "bg-gray-100 text-gray-700 border border-gray-200",
      running: "bg-blue-50 text-blue-700 border border-blue-200",
      ok: "bg-green-50 text-green-700 border border-green-200",
      error: "bg-red-50 text-red-700 border border-red-200",
    }[status] || "bg-gray-100 text-gray-700 border border-gray-200";

  return (
    <div className="mb-4 flex items-center justify-between">
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${tone}`}>
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            status === "running" ? "animate-pulse bg-current opacity-90" : "bg-current opacity-60"
          }`}
        />
        <span className="font-medium">LLM</span>
        <span className="opacity-80">
          {status === "idle" && "idle"}
          {status === "running" && "working…"}
          {status === "ok" && (model || "ready")}
          {status === "error" && "error"}
        </span>
        {status === "ok" && typeof durationMs === "number" && (
          <span className="opacity-70">• {Math.max(0, Math.round(durationMs))} ms</span>
        )}
      </div>
      {status === "error" && errorText && <div className="text-sm text-red-700">{errorText}</div>}
    </div>
  );
}

/* ----------------------------- Page ----------------------------- */

const ALL_DEPTS = [
  { id: "hr", label: "HR" },
  { id: "hrbp", label: "HRBP" },
  { id: "ta", label: "Talent Acquisition" },
  { id: "payroll", label: "Payroll" },
  { id: "finance", label: "Finance" },
  { id: "admin", label: "Admin" },
  { id: "office_admin", label: "Office Admin" },
  { id: "onboarding", label: "Onboarding" },
];

export default function EnrichmentPage() {
  const [sp] = useSearchParams();

  // input + validation
  const [query, setQuery] = useState("");
  const [err, setErr] = useState(null);

  // department filters
  const [deptSel, setDeptSel] = useState(new Set(ALL_DEPTS.map((d) => d.id)));

  // request/response state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // selection
  const [primaryContactId, setPrimaryContactId] = useState(null);

  // LLM badge state
  const [llmStatus, setLlmStatus] = useState("idle"); // "idle" | "running" | "ok" | "error"
  const [llmModel, setLlmModel] = useState(null);
  const [llmDuration, setLlmDuration] = useState(null);
  const [llmErrText, setLlmErrText] = useState(null);

  // read ?q= from URL if present
  useEffect(() => {
    const v = sp.get("q");
    if (v) setQuery(v);
  }, [sp]);

  const primaryContact = useMemo(() => {
    if (!result || !result.contacts?.length) return null;
    const pick =
      result.contacts.find((c) => (c.id || c._k) === primaryContactId) ?? result.contacts[0];
    return pick ?? null;
  }, [result, primaryContactId]);

  const isBlank = (s) => !s || s.trim().length === 0;

  const toggleDept = (id) => {
    setDeptSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function runEnrichment(e) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    setPrimaryContactId(null);

    const input = query.trim();
    if (isBlank(input)) {
      setErr("input required");
      return;
    }

    setLoading(true);

    // LLM badge → running
    setLlmStatus("running");
    setLlmModel(null);
    setLlmDuration(null);
    setLlmErrText(null);

    const t0 = performance.now();
    try {
      const body = {
        input,
        departments: Array.from(deptSel), // tell backend what teams to pull
      };

      const res = await authFetch("/api/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "enrichment failed");
      }

      const payload = data.data || {};

      // Normalize meta for the badge
      const duration_ms =
        (payload?._meta && typeof payload._meta.duration_ms === "number" && payload._meta.duration_ms) ||
        (typeof data?.duration_ms === "number" && data.duration_ms) ||
        Math.round(performance.now() - t0);

      const model =
        (payload?._meta && payload._meta.model) ||
        payload?.meta?.model ||
        data?.model ||
        (import.meta.env?.VITE_OPENAI_MODEL || "openai");

      // Attach _k keys for stable React keys when id absent
      const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
      const contactsWithKey = contacts.map((c, i) => ({
        _k: c.id || `${c.name || "x"}-${c.email || c.email_guess || "x"}-${i}`,
        ...c,
      }));

      setResult({
        ...payload,
        contacts: contactsWithKey,
      });
      setPrimaryContactId(contactsWithKey?.[0]?._k ?? null);

      // LLM badge → ok
      setLlmModel(model);
      setLlmDuration(duration_ms);
      setLlmStatus("ok");
    } catch (e) {
      setErr(e?.message || "Something went wrong");
      setLlmErrText(e?.message || "Unknown error");
      setLlmStatus("error");
    } finally {
      setLoading(false);
    }
  }

  const saveAsLead = useCallback(async () => {
    if (!result || !result.company?.name) {
      alert("No company to save.");
      return;
    }

    const company = {
      name: result.company.name,
      type: result.company.type ?? null,
      locations:
        result.company.locations ?? (result.company.hq ? [result.company.hq] : []),
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
          email_status:
            c.email_status || (c.email ? "validated" : c.email_guess ? "patterned" : "unknown"),
          confidence: typeof c.confidence === "number" ? c.confidence : null,
        }
      : {
          name: "Decision Maker",
          designation: "Decision Maker",
          linkedin_url: null,
          location: result.company.hq ?? null,
          email: null,
          email_status: "unknown",
          confidence: null,
        };

    const payload = {
      company,
      contact,
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
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to create HR lead");
      }
      alert("Lead saved ✅");
    } catch (e) {
      alert(e?.message || "Failed to save lead");
    }
  }, [result, primaryContact]);

  // Filter contacts by selected departments (if backend didn’t already)
  const filteredContacts = useMemo(() => {
    if (!result?.contacts) return [];
    const active = deptSel;
    return result.contacts.filter((c) => {
      const d = String(c.dept || "").toLowerCase();
      if (active.size === 0) return true;
      // heuristic mapping
      const map = {
        hr: ["hr", "human resources", "people"],
        hrbp: ["hrbp"],
        ta: ["ta", "talent", "talent acquisition", "recruit"],
        payroll: ["payroll"],
        finance: ["finance", "account", "cfo", "fp&a"],
        admin: ["admin", "administration"],
        office_admin: ["office", "office admin", "facility"],
        onboarding: ["onboarding", "people operations"],
      };
      for (const id of active) {
        const keys = map[id] || [];
        if (keys.some((k) => d.includes(k))) return true;
      }
      // also let title drive inclusion
      const t = String(c.title || "").toLowerCase();
      for (const id of active) {
        const keys = map[id] || [];
        if (keys.some((k) => t.includes(k))) return true;
      }
      return false;
    });
  }, [result, deptSel]);

  // Explainability: show top factors behind quality.score (fallback if not provided)
  const quality = result?.quality || null;
  const qScore = typeof quality?.score === "number" ? quality.score : result?.score ?? null;
  const qFactors = Array.isArray(quality?.factors) ? quality.factors : computeQualityFactorsFallback(result);

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

      {/* Query + Dept filters */}
      <form onSubmit={runEnrichment} className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5 space-y-3 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">Input</label>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (err && e.target.value.trim().length > 0) setErr(null);
            }}
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

        {/* Department Filters */}
        <div className="pt-2">
          <div className="text-xs uppercase text-gray-400 mb-2">Departments</div>
          <div className="flex flex-wrap gap-2">
            {ALL_DEPTS.map((d) => {
              const active = deptSel.has(d.id);
              return (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => toggleDept(d.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${
                    active
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-white text-gray-700 border-gray-200"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>}
      </form>

      {/* Results */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Company + Quality Explainability */}
          <div className="space-y-6">
            {/* Company card */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Company</h2>
                {result?._meta?.model && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 px-2 py-1">
                    <SparklesIcon /> {result?._meta?.model} · {result?._meta?.duration_ms ?? 0}ms
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-700">
                <Row label="Name" value={result.company?.name || "—"} />
                <Row label="Website" value={linkOrText(result.company?.website)} />
                <Row label="LinkedIn" value={linkOrText(result.company?.linkedin)} />
                <Row label="HQ" value={result.company?.hq || "—"} />
                <Row label="Industry" value={result.company?.industry || "—"} />
                <Row label="Size" value={result.company?.size || "—"} />
                {Array.isArray(result.company?.locations) && result.company.locations.length > 0 && (
                  <Row label="Locations" value={result.company.locations.join(", ")} />
                )}
                {result.company?.notes && (
                  <div className="mt-2">
                    <div className="text-xs uppercase text-gray-400">Notes</div>
                    <p className="mt-1">{result.company.notes}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Quality Explainability */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900">Quality</h3>
                <ScoreBadge score={qScore} />
              </div>
              {qFactors?.length ? (
                <ul className="space-y-2">
                  {qFactors.map((f, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="mt-1 inline-block w-2 h-2 rounded-full bg-gray-400" />
                      <span>
                        <span className="font-medium">{f.label}</span>
                        {typeof f.impact === "number" && (
                          <span className="ml-1 text-gray-500">(+{Math.round(f.impact)})</span>
                        )}
                        {f.detail && <span className="ml-2 text-gray-600">— {f.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500">No explanation available.</div>
              )}
            </section>
          </div>

          {/* Right column: Contacts + Outreach */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contacts table */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Suggested Contacts</h2>
                {filteredContacts.length > 0 && (
                  <select
                    className="border rounded-lg px-2 py-1 text-sm"
                    value={primaryContactId ?? ""}
                    onChange={(e) => setPrimaryContactId(e.target.value)}
                  >
                    {filteredContacts.map((c) => (
                      <option key={c._k} value={c._k}>
                        {c.name} — {c.title || c.dept || "—"}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {filteredContacts.length === 0 ? (
                <div className="mt-4 text-sm text-gray-500">No contacts found for selected departments.</div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <ContactsThead />
                    <tbody>
                      {filteredContacts.map((c) => {
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
                                checked={primaryContactId === c._k}
                                onChange={() => setPrimaryContactId(c._k)}
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
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <span className={statusPillClass(emailStatus)}>{prettyStatus(emailStatus)}</span>
                            </td>
                            <td className="px-4 py-2">{conf !== null ? `${conf}%` : "—"}</td>
                            <td className="px-4 py-2">
                              {c.linkedin ? (
                                <a className="underline" href={c.linkedin} target="_blank" rel="noreferrer">
                                  Profile
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    result.outreachDraft ||
                                      `Hi ${c.name?.split(" ")[0] || ""},\n\n` +
                                        `We help with payroll onboarding for premium employers in the UAE. ` +
                                        `If you prefer, I can share a tailored plan for ${result.company?.name}.`
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

            {/* Outreach editor (optional visible even if contacts empty) */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Outreach Draft</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(result.outreachDraft || "")}
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    Copy
                  </button>
                  <button
                    onClick={saveAsLead}
                    className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-black"
                  >
                    Save Lead
                  </button>
                </div>
              </div>
              <textarea
                className="w-full min-h-[160px] border rounded-xl px-3 py-2"
                value={result.outreachDraft || ""}
                onChange={(e) =>
                  setResult((prev) => (prev ? { ...prev, outreachDraft: e.target.value } : prev))
                }
              />
              {primaryContact && (
                <p className="text-xs text-gray-500">
                  Primary contact: <span className="font-medium">{primaryContact.name}</span> —{" "}
                  {primaryContact.title}
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------ table subcomponents ------------------------ */

function ContactsThead() {
  return (
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
      <div className="text-xs uppercase text-gray-400 w-24 shrink-0">{label}</div>
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
    return "text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200";
  return "text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 border border-gray-200";
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M10 1l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5zm7 11l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
    </svg>
  );
}

/** Fallback explainability if backend doesn't provide factors. */
function computeQualityFactorsFallback(result) {
  if (!result) return [];
  const factors = [];
  const c = result.company || {};
  if (c.hq?.toLowerCase().includes("united arab emirates") || c.hq?.toLowerCase().includes("dubai") || c.hq?.toLowerCase().includes("abu dhabi")) {
    factors.push({ label: "UAE HQ/Presence", impact: 10, detail: "Operating from UAE (HQ/office)" });
  }
  if (c.size && /10,?000\+|5000\+|enterprise|group/i.test(c.size)) {
    factors.push({ label: "Enterprise size", impact: 8, detail: c.size });
  }
  if (Array.isArray(result.tags) && result.tags.some((t) => /hiring|expansion|new office|contract/i.test(t))) {
    factors.push({ label: "Recent hiring/expansion signal", impact: 7 });
  }
  if (Array.isArray(result.contacts) && result.contacts.length >= 3) {
    factors.push({ label: "Decision makers found", impact: 6, detail: `${result.contacts.length} contacts` });
  }
  if (c.industry) {
    factors.push({ label: "Industry fit", impact: 4, detail: c.industry });
  }
  return factors.slice(0, 6);
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
