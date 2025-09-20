// routes/enrich/search.js
import { performance } from "node:perf_hooks";

// ---------------------------- small utilities ----------------------------
const NOT_UNLOCKED_RE = /not[_-]?unlocked/i;
const EMAIL_RE = /^[^@\s]+@([^\s@]+\.[^\s@]+)$/i;

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
}

function stripProtoHost(s = "") {
  return String(s)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function extractDomainFromEmail(email) {
  const m = EMAIL_RE.exec(email || "");
  return m ? m[1].toLowerCase() : null;
}

function normalizeContacts(arr = []) {
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => {
    // normalize email + status; redact "not unlocked" placeholders
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
      // we'll overwrite this to the provider used ("apollo"/"llm") later
      source: c.provider ?? c.source ?? undefined,
      // allow provider to pass through extra fields without breaking UI
      company_name: c.company_name ?? c.company ?? c.org ?? undefined,
      company_domain: c.company_domain ?? undefined,
      company_linkedin: c.company_linkedin ?? undefined,
    };
  });
}

function filterToCompany(rows, { targetDomain, companyText }) {
  if (!rows.length) return rows;

  const domain = stripProtoHost(targetDomain || "");
  const text = (companyText || "").toLowerCase();

  const byDomain = domain
    ? rows.filter((r) => {
        const emailDom = extractDomainFromEmail(r.email);
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

  // fallback: return original if no heuristic match
  return rows;
}

function setProvider(rows, provider) {
  return rows.map((r) => ({ ...r, source: provider }));
}

// pick a function from a provider module by trying common names
function pickFn(mod, candidates) {
  if (!mod) return null;
  for (const name of candidates) {
    const fn = mod?.[name];
    if (typeof fn === "function") return { name, fn };
  }
  return null;
}

// ------------------------------ main handler ------------------------------
export default async function enrichSearchHandler(req, res) {
  noStore(res);

  const rid = req._reqid || Math.random().toString(36).slice(2, 8);
  const tStart = performance.now();

  const q = (req.query?.q ?? "").toString().trim();
  const overrides = {
    name: (req.query?.name ?? "").toString().trim() || undefined,
    domain: stripProtoHost(req.query?.domain ?? "") || undefined,
    linkedin_url: (req.query?.linkedin_url ?? "").toString().trim() || undefined,
    parent: (req.query?.parent ?? "").toString().trim() || undefined,
  };
  const userId = req.userId || req.user?.id || "anon";

  console.log(
    `[${rid}] enrich/search q=${JSON.stringify(q)} overrides=${JSON.stringify(
      overrides
    )} user=${userId}`
  );

  const summary = {
    provider: "live",
    company_guess: undefined, // fill below
    quality: { score: 0.5, explanation: "Heuristic guess based on input." },
    timings: {},
  };

  // Seed company guess from overrides / q
  summary.company_guess = {
    name: overrides.name || q || undefined,
    domain: overrides.domain || undefined,
    linkedin_url: overrides.linkedin_url || undefined,
    parent: overrides.parent || undefined,
  };

  let results = [];
  let usedProvider = null;

  // ---------------------------- APOLLO path ----------------------------
  let apollo;
  try {
    apollo = await import("./lib/apollo.js").catch(() => null);
    console.log(
      `[${rid}] provider: apollo loaded=${!!apollo} keys=${
        apollo ? Object.keys(apollo).join(",") : "-"
      }`
    );
  } catch (e) {
    console.error(`[${rid}] provider: apollo import error`, e?.stack || e);
  }

  if (apollo) {
    // Prefer company-aware functions first
    const apolloFn =
      pickFn(apollo, ["apolloPeopleByDomain", "searchPeopleByCompany"]) ||
      pickFn(apollo, ["searchPeople", "search", "findPeople", "run"]);

    if (apolloFn) {
      const t0 = performance.now();
      try {
        console.log(
          `[${rid}] apollo.${apolloFn.name} → start (name=${overrides.name || q || "-"}, domain=${
            overrides.domain || "-"
          })`
        );

        // Compose a compact arg object but don't assume concrete signature
        const args = {
          q,
          name: overrides.name || q,
          domain: overrides.domain,
          linkedin_url: overrides.linkedin_url,
          parent: overrides.parent,
        };

        const raw = await apolloFn.fn(args);
        const list = normalizeContacts(raw?.results ?? raw);

        // set timing
        summary.timings.apollo_ms = Math.round(performance.now() - t0);
        console.log(
          `[${rid}] apollo.${apolloFn.name} → ok count=${list.length} in ${summary.timings.apollo_ms}ms`
        );

        // focus to company
        const filtered = filterToCompany(list, {
          targetDomain: overrides.domain,
          companyText: overrides.name || q,
        });

        results = setProvider(filtered, "apollo");
        usedProvider = "apollo";

        // improve company guess from top row hints if domain missing
        if (results.length) {
          const top = results[0];
          summary.company_guess = {
            name: (overrides.name || q) ?? top.company_name ?? undefined,
            domain: overrides.domain || top.company_domain || extractDomainFromEmail(top.email) || undefined,
            linkedin_url: overrides.linkedin_url || top.company_linkedin || undefined,
            parent: overrides.parent || undefined,
          };
        }
      } catch (e) {
        summary.timings.apollo_ms = Math.round(performance.now() - t0);
        console.error(
          `[${rid}] apollo.${apolloFn.name} → error after ${summary.timings.apollo_ms}ms`,
          e?.stack || e
        );
      }
    } else {
      console.log(`[${rid}] apollo: no callable search function found`);
    }
  }

  // ------------------------------ LLM fallback ------------------------------
  if (!results.length) {
    let llm;
    try {
      llm = await import("./lib/llm.js").catch(() => null);
      console.log(
        `[${rid}] provider: llm loaded=${!!llm} keys=${llm ? Object.keys(llm).join(",") : "-"}`
      );
    } catch (e) {
      console.error(`[${rid}] provider: llm import error`, e?.stack || e);
    }

    if (llm) {
      const llmFn =
        pickFn(llm, ["enrichContactsLLM", "search", "run", "generateContacts"]) || null;
      if (llmFn) {
        const t0 = performance.now();
        try {
          console.log(`[${rid}] llm.${llmFn.name} → start`);
          const raw = await llmFn.fn({
            q,
            name: overrides.name || q,
            domain: overrides.domain,
            linkedin_url: overrides.linkedin_url,
            parent: overrides.parent,
          });
          const list = normalizeContacts(raw?.results ?? raw);
          summary.timings.llm_ms = Math.round(performance.now() - t0);
          console.log(
            `[${rid}] llm.${llmFn.name} → ok count=${list.length} in ${summary.timings.llm_ms}ms`
          );

          const filtered = filterToCompany(list, {
            targetDomain: overrides.domain,
            companyText: overrides.name || q,
          });

          results = setProvider(filtered, "llm");
          usedProvider = "llm";

          if (results.length) {
            const top = results[0];
            // backfill guess if missing
            summary.company_guess = {
              name: summary.company_guess?.name || top.company_name || q || undefined,
              domain:
                summary.company_guess?.domain ||
                top.company_domain ||
                extractDomainFromEmail(top.email) ||
                undefined,
              linkedin_url:
                summary.company_guess?.linkedin_url || top.company_linkedin || undefined,
              parent: summary.company_guess?.parent || overrides.parent || undefined,
            };
          }
        } catch (e) {
          summary.timings.llm_ms = Math.round(performance.now() - t0);
          console.error(
            `[${rid}] llm.${llmFn.name} → error after ${summary.timings.llm_ms}ms`,
            e?.stack || e
          );
        }
      } else {
        console.log(`[${rid}] llm: no callable search function found`);
      }
    }
  }

  // finalize provider + total timing
  if (usedProvider) summary.provider = usedProvider;
  summary.timings.total_ms = Math.round(performance.now() - tStart);

  // Decide quality score: crude heuristic
  const qty = results.length;
  summary.quality = {
    score: Math.max(0.3, Math.min(0.95, qty >= 8 ? 0.9 : qty >= 3 ? 0.7 : 0.5)),
    explanation: qty
      ? `Found ${qty} candidates from ${summary.provider}.`
      : "No matches found.",
  };

  // Log final shape
  console.log(
    `[${rid}] enrich/search → provider=${summary.provider} results=${qty} timings=${JSON.stringify(
      summary.timings
    )} guess=${JSON.stringify(summary.company_guess)}`
  );

  // Always 200 with normalized payload (frontend already handles empty)
  return res.status(200).json({
    ok: true,
    data: {
      results,
      summary,
    },
  });
}
