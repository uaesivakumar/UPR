// routes/enrich/search.js
// Keep this file as a thin orchestrator. All provider and helper logic lives
// in ./lib/*.js. We import dynamically and call the “best available” function
// to avoid breaking if a module’s export name changes.

import { performance } from "node:perf_hooks";

// ---------- tiny local fallbacks (used only if helper modules don't provide them)
const EMAIL_RE = /^[^@\s]+@([^\s@]+\.[^\s@]+)$/i;
const NOT_UNLOCKED_RE = /not[_-]?unlocked/i;

function stripProtoHost(s = "") {
  return String(s)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}
function emailDomain(email) {
  const m = EMAIL_RE.exec(email || "");
  return m ? m[1].toLowerCase() : null;
}
function titleCaseLoose(s = "") {
  if (!s) return s;
  if (s === s.toUpperCase()) return s;
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
function normalizeContactsFallback(arr = []) {
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
}
function dominantDomain(rows = []) {
  const counts = new Map();
  for (const r of rows) {
    const d1 = r.company_domain && stripProtoHost(r.company_domain);
    const d2 = emailDomain(r.email);
    const d = d1 || d2;
    if (!d) continue;
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [d, n] of counts) {
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best || undefined;
}
function filterToCompany(rows, { targetDomain, companyText }) {
  if (!rows.length) return rows;
  const domain = stripProtoHost(targetDomain || "");
  const text = (companyText || "").toLowerCase();

  const byDomain = domain
    ? rows.filter((r) => {
        const emailDom = emailDomain(r.email);
        const rowDom =
          r.company_domain?.toLowerCase() ||
          (r.linkedin_url ? stripProtoHost(r.linkedin_url).split("/")[0] : null);
        return emailDom === domain || rowDom === domain;
      })
    : [];

  if (byDomain.length) return byDomain;

  if (text) {
    const byText = rows.filter((r) => {
      const combined =
        [r.company_name, r.name, r.title, r.designation]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
      return combined.includes(text);
    });
    if (byText.length) return byText;
  }
  return rows;
}
function setProvider(rows, provider) {
  return rows.map((r) => ({ ...r, source: provider }));
}

// ---------- utility to pick a function from a module by likely names
function pickFn(mod, candidates) {
  if (!mod) return null;
  for (const name of candidates) {
    const fn = mod?.[name];
    if (typeof fn === "function") return { name, fn };
  }
  return null;
}

// ---------- main handler
export default async function search(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  const rid = req._reqid || Math.random().toString(36).slice(2, 8);
  const tStart = performance.now();

  const q = (req.query?.q ?? "").toString().trim();
  const overrides = {
    name: (req.query?.name ?? "").toString().trim() || undefined,
    domain: stripProtoHost(req.query?.domain ?? "") || undefined,
    linkedin_url: (req.query?.linkedin_url ?? "").toString().trim() || undefined,
    parent: (req.query?.parent ?? "").toString().trim() || undefined,
  };
  const user = req.user?.id || "admin";

  console.log(
    `[${rid}] enrich/search GET q=${JSON.stringify(q)} overrides=${JSON.stringify(
      overrides
    )} user=${user}`
  );

  // Load helper modules (optional)
  let apollo, llm, email, geo, quality;
  try { apollo = await import("./lib/apollo.js"); } catch {}
  try { llm = await import("./lib/llm.js"); } catch {}
  try { email = await import("./lib/email.js"); } catch {}
  try { geo = await import("./lib/geo.js"); } catch {}
  try { quality = await import("./lib/quality.js"); } catch {}

  const normalizeContacts =
    (email && typeof email.normalizeContacts === "function"
      ? email.normalizeContacts
      : normalizeContactsFallback);

  const emailDomainFn =
    (email && typeof email.emailDomain === "function" ? email.emailDomain : emailDomain);

  let results = [];
  const summary = {
    provider: "live",
    company_guess: {
      name: titleCaseLoose(overrides.name || q || ""),
      domain: overrides.domain || undefined,
      linkedin_url: overrides.linkedin_url || undefined,
      parent: overrides.parent || undefined,
    },
    quality: { score: 0.5, explanation: "Heuristic guess based on input." },
    timings: {},
  };

  // ---------- Provider: APOLLO first
  let usedProvider = null;
  if (apollo) {
    const apolloFn =
      pickFn(apollo, ["apolloPeopleByDomain", "searchPeopleByCompany"]) ||
      pickFn(apollo, ["searchPeople", "search", "findPeople", "run"]);

    if (apolloFn) {
      const t0 = performance.now();
      try {
        console.log(
          `[${rid}] apollo.${apolloFn.name} start name=${overrides.name || q || "-"} domain=${overrides.domain || "-"}`
        );
        const raw = await apolloFn.fn({
          q,
          name: overrides.name || q,
          domain: overrides.domain,
          linkedin_url: overrides.linkedin_url,
          parent: overrides.parent,
        });
        const list = normalizeContacts(raw?.results ?? raw);
        summary.timings.apollo_ms = Math.round(performance.now() - t0);

        const filtered = filterToCompany(list, {
          targetDomain: overrides.domain,
          companyText: overrides.name || q,
        });
        results = setProvider(filtered, "apollo");
        usedProvider = "apollo";

        // Backfill guess (name/domain/linkedin)
        if (results.length) {
          const top = results[0];
          const inferredDomain =
            overrides.domain ||
            top.company_domain ||
            emailDomainFn(top.email) ||
            dominantDomain(results);
          summary.company_guess = {
            name:
              titleCaseLoose(overrides.name || q) ||
              top.company_name ||
              titleCaseLoose(q),
            domain: inferredDomain,
            linkedin_url: overrides.linkedin_url || top.company_linkedin || undefined,
            parent: overrides.parent || undefined,
          };
        }

        console.log(
          `[${rid}] apollo.${apolloFn.name} ok count=${results.length} in ${summary.timings.apollo_ms}ms`
        );
      } catch (e) {
        summary.timings.apollo_ms = Math.round(performance.now() - t0);
        console.error(`[${rid}] apollo.${apolloFn.name} error`, e?.stack || e);
      }
    }
  }

  // ---------- Provider: LLM fallback
  if (!results.length && llm) {
    const llmFn =
      pickFn(llm, ["enrichContactsLLM", "search", "run", "generateContacts"]) || null;
    if (llmFn) {
      const t0 = performance.now();
      try {
        console.log(`[${rid}] llm.${llmFn.name} start`);
        const raw = await llmFn.fn({
          q,
          name: overrides.name || q,
          domain: overrides.domain,
          linkedin_url: overrides.linkedin_url,
          parent: overrides.parent,
        });
        const list = normalizeContacts(raw?.results ?? raw);
        summary.timings.llm_ms = Math.round(performance.now() - t0);

        const filtered = filterToCompany(list, {
          targetDomain: overrides.domain,
          companyText: overrides.name || q,
        });
        results = setProvider(filtered, "llm");
        usedProvider = "llm";

        if (results.length) {
          const top = results[0];
          const inferredDomain =
            overrides.domain ||
            top.company_domain ||
            emailDomainFn(top.email) ||
            dominantDomain(results);
          summary.company_guess = {
            name:
              titleCaseLoose(overrides.name || q) ||
              top.company_name ||
              titleCaseLoose(q),
            domain: inferredDomain,
            linkedin_url: overrides.linkedin_url || top.company_linkedin || undefined,
            parent: overrides.parent || undefined,
          };
        }

        console.log(
          `[${rid}] llm.${llmFn.name} ok count=${results.length} in ${summary.timings.llm_ms}ms`
        );
      } catch (e) {
        summary.timings.llm_ms = Math.round(performance.now() - t0);
        console.error(`[${rid}] llm.${llmFn.name} error`, e?.stack || e);
      }
    }
  }

  // ---------- Finalize timings & quality
  if (usedProvider) summary.provider = usedProvider;
  summary.timings.provider_ms =
    (usedProvider === "apollo" && summary.timings.apollo_ms) ||
    (usedProvider === "llm" && summary.timings.llm_ms) ||
    0;
  summary.timings.total_ms = Math.round(performance.now() - tStart);

  // optional quality module
  if (quality && typeof quality.scoreFor === "function") {
    try {
      summary.quality = quality.scoreFor({
        results,
        provider: summary.provider,
        guess: summary.company_guess,
      });
    } catch {
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
    `[${rid}] enrich/search → provider=${summary.provider} results=${results.length} timings=${JSON.stringify(
      summary.timings
    )} guess=${JSON.stringify(summary.company_guess)}`
  );

  return res.status(200).json({
    ok: true,
    data: { results, summary },
  });
}
