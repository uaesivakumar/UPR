// routes/enrich/search.js
import { performance } from "node:perf_hooks";

/* -------------------- tiny local utils + safe fallbacks -------------------- */
const EMAIL_RE = /^[^@\s]+@([^\s@]+\.[^\s@]+)$/i;
const NOT_UNLOCKED_RE = /not[_-]?unlocked/i;

const stripProtoHost = (s = "") =>
  String(s).trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();

const emailDomain = (email) => {
  const m = EMAIL_RE.exec(email || "");
  return m ? m[1].toLowerCase() : null;
};

const tc = (s = "") => {
  if (!s) return s;
  if (s === s.toUpperCase()) return s; // keep acronyms like ADGM
  return s.split(/\s+/).map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");
};

const normalizeContactsFallback = (arr = []) => {
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => {
    let email = c.email ?? c.work_email ?? c.contact_email ?? null;
    let email_status = c.email_status ?? c.verification ?? undefined;
    if (email && NOT_UNLOCKED_RE.test(email)) {
      email = null;
      email_status = "locked";
    }
    return {
      name: c.name ?? c.full_name ?? c.person ?? "—",
      designation: c.designation ?? c.title ?? c.role ?? undefined,
      title: c.title ?? c.designation ?? c.role ?? undefined,
      email,
      linkedin_url: c.linkedin_url ?? c.linkedin ?? c.linkedinProfile ?? undefined,
      emirate: c.emirate ?? c.location ?? undefined,
      confidence: typeof c.confidence === "number" ? c.confidence : undefined,
      email_status,
      company_name: c.company_name ?? c.company ?? c.org ?? undefined,
      company_domain: c.company_domain ?? undefined,
      company_linkedin: c.company_linkedin ?? undefined,
      source: c.provider ?? c.source ?? undefined,
    };
  });
};

const dominantDomain = (rows = []) => {
  const counts = new Map();
  for (const r of rows) {
    const d = (r.company_domain && stripProtoHost(r.company_domain)) || emailDomain(r.email);
    if (!d) continue;
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  let best = null, n = 0;
  for (const [d, c] of counts) if (c > n) { best = d; n = c; }
  return best || undefined;
};

const filterToCompany = (rows, { domain, name }) => {
  if (!rows?.length) return rows;
  const d = domain && stripProtoHost(domain);
  const n = (name || "").toLowerCase();

  if (d) {
    const byDom = rows.filter((r) => {
      const em = emailDomain(r.email);
      const cd = r.company_domain && stripProtoHost(r.company_domain);
      return em === d || cd === d;
    });
    if (byDom.length) return byDom;
  }
  if (n) {
    const byTxt = rows.filter((r) => {
      const blob = [r.company_name, r.name, r.title, r.designation].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(n);
    });
    if (byTxt.length) return byTxt;
  }
  return rows;
};

const withSource = (rows, source) => rows.map(r => ({ ...r, source }));

const pickFn = (mod, names) => {
  if (!mod) return null;
  for (const k of names) if (typeof mod[k] === "function") return { name: k, fn: mod[k] };
  return null;
};

/* -------------------------------- handler ---------------------------------- */
export default async function search(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  const rid = req._reqid || Math.random().toString(36).slice(2, 8);
  const t0 = performance.now();

  const q = String(req.query?.q ?? "").trim();
  const overrides = {
    name: (req.query?.name ?? "").toString().trim() || undefined,
    domain: stripProtoHost(req.query?.domain ?? "") || undefined,
    linkedin_url: (req.query?.linkedin_url ?? "").toString().trim() || undefined,
    parent: (req.query?.parent ?? "").toString().trim() || undefined,
  };
  const user = req.user?.id || "admin";

  console.log(`[${rid}] enrich/search q=${JSON.stringify(q)} overrides=${JSON.stringify(overrides)} user=${user}`);

  // Load modules (best-effort; each is optional)
  let apollo, llm, email, geo, quality;
  try { apollo = await import("./lib/apollo.js"); } catch {}
  try { llm = await import("./lib/llm.js"); } catch {}
  try { email = await import("./lib/email.js"); } catch {}
  try { geo = await import("./lib/geo.js"); } catch {}
  try { quality = await import("./lib/quality.js"); } catch {}

  const normalizeContacts =
    (email && typeof email.normalizeContacts === "function" ? email.normalizeContacts : normalizeContactsFallback);
  const emailDomainFn =
    (email && typeof email.emailDomain === "function" ? email.emailDomain : emailDomain);

  /* ------------------- 1) Resolve company (name, domain, li) ------------------- */
  const target = {
    name: tc(overrides.name || q),
    domain: overrides.domain || undefined,
    linkedin_url: overrides.linkedin_url || undefined,
    parent: overrides.parent || undefined,
  };

  const resolveCompany = async () => {
    if (target.domain) return; // already set

    // Try apollo resolver(s)
    const r1 =
      pickFn(apollo, ["companyForName", "companyByName", "resolveCompany", "companyInfo", "companyDomainForName"]);
    if (r1) {
      try {
        const c = await r1.fn({ name: target.name });
        if (c && (c.domain || c.linkedin_url || c.name)) {
          target.domain = target.domain || (c.domain && stripProtoHost(c.domain));
          target.linkedin_url = target.linkedin_url || c.linkedin_url || c.linkedin;
          target.name = tc(target.name || c.name);
          console.log(`[${rid}] resolver: apollo.${r1.name} →`, JSON.stringify({ name: target.name, domain: target.domain, li: !!target.linkedin_url }));
        }
      } catch (e) {
        console.warn(`[${rid}] resolver: apollo.${r1.name} failed`, e?.message || e);
      }
    }

    // Fallback to LLM guesser if available
    if (!target.domain && llm) {
      const g1 = pickFn(llm, ["companyGuess", "guessCompany", "resolveCompany"]);
      if (g1) {
        try {
          const g = await g1.fn({ name: target.name });
          if (g) {
            target.domain = g.domain ? stripProtoHost(g.domain) : target.domain;
            target.linkedin_url = target.linkedin_url || g.linkedin_url || undefined;
            target.parent = target.parent || g.parent || undefined;
            target.name = tc(target.name || g.name);
            console.log(`[${rid}] resolver: llm.${g1.name} →`, JSON.stringify({ name: target.name, domain: target.domain, li: !!target.linkedin_url }));
          }
        } catch (e) {
          console.warn(`[${rid}] resolver: llm.${g1.name} failed`, e?.message || e);
        }
      }
    }
  };

  await resolveCompany();

  /* ------------------ 2) Pick provider + run the people search ----------------- */
  let results = [];
  const summary = {
    provider: "live",
    company_guess: { ...target },
    timings: {},
    quality: { score: 0.5, explanation: "Heuristic guess based on input." },
  };

  // prefer Apollo
  if (apollo) {
    const byDomain = pickFn(apollo, ["apolloPeopleByDomain", "peopleByDomain", "searchByDomain"]);
    const byCompany = pickFn(apollo, ["searchPeopleByCompany", "peopleByCompany", "search"]);

    const wantDomain = !!target.domain;
    const locHint =
      (geo && pickFn(geo, ["deriveLocation", "uaeLocation", "defaultLocation"])?.fn?.() ) ||
      { country: "United Arab Emirates", city: null };

    try {
      const tA = performance.now();
      if (wantDomain && byDomain) {
        console.log(`[${rid}] apollo.${byDomain.name} start name=${target.name} domain=${target.domain}`);
        const raw = await byDomain.fn({ name: target.name, domain: target.domain, location: locHint });
        const list = normalizeContacts(raw?.results ?? raw);
        results = withSource(filterToCompany(list, { domain: target.domain, name: target.name }), "apollo");
      } else if (byCompany) {
        console.log(`[${rid}] apollo.${byCompany.name} start name=${target.name} (no domain) loc=${JSON.stringify(locHint)}`);
        const raw = await byCompany.fn({ name: target.name, location: locHint });
        const list = normalizeContacts(raw?.results ?? raw);
        // infer domain from batch, then hard-filter
        const inferred = target.domain || dominantDomain(list);
        results = withSource(filterToCompany(list, { domain: inferred, name: target.name }), "apollo");
        if (!target.domain && inferred) target.domain = inferred;
      }
      summary.timings.apollo_ms = Math.round(performance.now() - tA);
      if (results.length) summary.provider = "apollo";
    } catch (e) {
      summary.timings.apollo_ms = Math.round(performance.now() - tA);
      console.error(`[${rid}] apollo search error`, e?.stack || e);
    }
  }

  // fallback to LLM if nothing useful
  if (!results.length && llm) {
    const s1 = pickFn(llm, ["enrichContactsLLM", "search", "generateContacts", "run"]);
    if (s1) {
      try {
        const tL = performance.now();
        console.log(`[${rid}] llm.${s1.name} start`);
        const raw = await s1.fn({
          q,
          name: target.name,
          domain: target.domain,
          linkedin_url: target.linkedin_url,
          parent: target.parent,
        });
        const list = normalizeContacts(raw?.results ?? raw);
        results = withSource(filterToCompany(list, { domain: target.domain, name: target.name }), "llm");
        summary.timings.llm_ms = Math.round(performance.now() - tL);
        if (results.length) summary.provider = "llm";
      } catch (e) {
        summary.timings.llm_ms = Math.round(performance.now() - (summary.timings.llm_ms || performance.now()));
        console.error(`[${rid}] llm search error`, e?.stack || e);
      }
    }
  }

  // finalize guess (take from data if missing)
  if (results.length) {
    const top = results[0];
    summary.company_guess = {
      name: target.name || top.company_name || tc(q),
      domain: target.domain || top.company_domain || emailDomainFn(top.email) || dominantDomain(results),
      linkedin_url: target.linkedin_url || top.company_linkedin || undefined,
      parent: target.parent || undefined,
    };
  }

  // timings
  summary.timings.provider_ms =
    (summary.provider === "apollo" && summary.timings.apollo_ms) ||
    (summary.provider === "llm" && summary.timings.llm_ms) || 0;
  summary.timings.total_ms = Math.round(performance.now() - t0);

  // quality
  if (quality && typeof quality.scoreFor === "function") {
    try {
      summary.quality = quality.scoreFor({
        results,
        provider: summary.provider,
        guess: summary.company_guess,
      });
    } catch (e) {
      // keep fallback
    }
  } else {
    const n = results.length;
    summary.quality = {
      score: Math.max(0.3, Math.min(0.95, n >= 8 ? 0.9 : n >= 3 ? 0.7 : 0.5)),
      explanation: n ? `Found ${n} candidates from ${summary.provider}.` : "No matches found.",
    };
  }

  console.log(
    `[${rid}] enrich/search → provider=${summary.provider} count=${results.length} timings=${JSON.stringify(
      summary.timings
    )} guess=${JSON.stringify(summary.company_guess)}`
  );

  return res.status(200).json({ ok: true, data: { results, summary } });
}
