// routes/enrich/search.js
import { Router } from "express";

// Data providers / helpers
import {
  // flexible: any of these may be no-ops depending on your apollo.js
  searchPeopleByCompany,
  compactApolloKeywords,
} from "./lib/apollo.js";

import {
  qualityScore,
  scoreCandidate,   // used per-row for confidence tweaks (safe if pass-through)
} from "./lib/quality.js";

import {
  emirateFromLocation,
  tagEmirate,         // graceful if it just returns input.emirate internally
  isUAE,
} from "./lib/geo.js";

import {
  inferPatternFromSamples,
  applyPattern as applyEmailPattern,   // alias to what email.js exports
  isProviderPlaceholderEmail,
  loadPatternFromCache,
  savePatternToCache,
  verifyEmail,                          // may return { status:'unknown', reason:'no_verifier' }
} from "./lib/email.js";

import { guessCompany as llmGuessCompany } from "./lib/llm.js";

// hard 12s cutoff so UI never hangs forever
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(new Error("timeout")), 12_000);
// pass controller.signal to any fetches you do, then finally:
clearTimeout(timeout);


const router = Router();

/**
 * Normalize a person row to UI schema
 */
function normalizeCandidate(raw, domainHint) {
  const name = raw?.name || [raw?.first_name, raw?.last_name].filter(Boolean).join(" ").trim();
  const designation = raw?.designation || raw?.title || "";
  const linkedin_url = raw?.linkedin_url || raw?.linkedin || "";
  const email = raw?.email || "";
  const location = raw?.location || raw?.city || raw?.country || "";

  // Emirate tagging (best-effort)
  let emirate = raw?.emirate || emirateFromLocation(location) || "";
  if (!emirate && location) {
    emirate = tagEmirate(location) || "";
  }

  // Confidence / role bucket scoring may be a light wrapper inside scoreCandidate()
  const confidence = (() => {
    try {
      return Number(scoreCandidate({ ...raw, name, designation, email, emirate }) || 0.75);
    } catch {
      return 0.75;
    }
  })();

  // Status from provider (if present) or unknown
  const email_status = raw?.email_status || "unknown";
  const email_reason = raw?.email_reason || (email ? "provider" : "no_verifier");

  return {
    name,
    designation,
    linkedin_url,
    email,
    email_status,
    email_reason,
    role_bucket: raw?.role_bucket || raw?.role || "",
    seniority: raw?.seniority || "",
    source: raw?.source || "live",
    confidence,
    location,
    emirate,
    domain_hint: domainHint || null,
  };
}

/**
 * Safely time an async fn, returning { ms, value, error }
 */
async function timeIt(fn) {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ms: Date.now() - t0, value, error: null };
  } catch (error) {
    return { ms: Date.now() - t0, value: null, error };
  }
}

router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();

  // Optional user corrections from the UI “Fix company” modal
  const overrides = {
    name: String(req.query.name || "").trim() || null,
    domain: String(req.query.domain || "").trim() || null,
    linkedin_url: String(req.query.linkedin_url || "").trim() || null,
    parent: String(req.query.parent || "").trim() || null,
  };

  // Short-circuit empty query with a clean envelope (prevents UI spinner from hanging)
  if (!q && !overrides.name && !overrides.domain && !overrides.linkedin_url) {
    return res.json({
      ok: true,
      data: {
        summary: {
          provider: "live",
          timings: { provider_ms: 0, llm_ms: 0, smtp_ms: 0 },
          company_guess: null,
          quality: { score: 0, explanation: "Empty query" },
          total_candidates: 0,
          kept: 0,
        },
        results: [],
      },
    });
  }

  // 1) Company disambiguation (LLM best-effort). Never block results if it fails.
  const llm = await timeIt(async () => {
    try {
      const g = await llmGuessCompany({
        q,
        overrides,
      });
      return g || null;
    } catch {
      return null;
    }
  });

  // Compose the final guess with user overrides taking priority
  const company_guess = {
    ...(llm.value || {}),
    ...(overrides.name ? { name: overrides.name } : {}),
    ...(overrides.domain ? { domain: overrides.domain } : {}),
    ...(overrides.linkedin_url ? { linkedin_url: overrides.linkedin_url } : {}),
    ...(overrides.parent ? { parent: overrides.parent } : {}),
    // Small normalization
    website_url: (overrides.domain || llm.value?.domain)
      ? `https://${(overrides.domain || llm.value?.domain || "").replace(/^https?:\/\//i, "")}`
      : (llm.value?.website_url || undefined),
    mode: overrides.name || overrides.domain || overrides.linkedin_url ? "User+LLM" : (llm.value ? "LLM" : "heuristic"),
  };

  // 2) Provider lookup (Apollo or equivalent)
  const provider = await timeIt(async () => {
    const key = compactApolloKeywords
      ? compactApolloKeywords(q, company_guess?.name || "", company_guess?.domain || "", company_guess?.linkedin_url || "")
      : q;

    const rows = await searchPeopleByCompany({
      query: key,
      name: company_guess?.name || null,
      domain: company_guess?.domain || null,
      linkedin_url: company_guess?.linkedin_url || null,
      parent: company_guess?.parent || null,
      // You can pass other knobs (country filters, etc.) here.
    });

    return Array.isArray(rows) ? rows : [];
  });

  // 3) Normalize candidates
  const normalized = (provider.value || []).map((r) => normalizeCandidate(r, company_guess?.domain || null));

  // 4) Email pattern (infer/apply) — best effort, UAE-first
  try {
    const domain = (company_guess?.domain || "").toLowerCase();
    if (domain) {
      // build samples for pattern inference (skip obvious placeholders)
      const samples = normalized
        .filter((r) => r.email && !isProviderPlaceholderEmail(r.email))
        .map((r) => ({ name: r.name, email: r.email }));

      // include any cached pattern (helps for second searches)
      const cached = await loadPatternFromCache(domain);
      const inferred = samples.length ? await inferPatternFromSamples(samples, domain) : null;
      const pattern = inferred || cached || null;

      if (pattern) {
        await savePatternToCache(domain, pattern);

        for (const r of normalized) {
          // only fill if missing AND looks UAE (reduce false positives for foreign branches)
          if (!r.email && r.name && isUAE(r.location || r.emirate || "")) {
            try {
              r.email = applyEmailPattern(pattern, r.name, domain);
              r.email_status = "unknown";
              r.email_reason = "pattern";
            } catch {
              // ignore
            }
          }
        }
      }
    }
  } catch {
    // never break the request for pattern issues
  }

  // 5) Optional verification pass (will be "unknown" if no verifier keys)
  try {
    await Promise.all(
      normalized.map(async (r) => {
        if (!r.email) return;
        const { status, reason } = await verifyEmail(r.email);
        r.email_status = status || r.email_status || "unknown";
        if (reason) r.email_reason = reason;
      })
    );
  } catch {
    // ignore verifier errors; keep UI snappy
  }

  // 6) Final quality rollup
  const quality = (() => {
    try {
      return qualityScore({
        company: {
          name: company_guess?.name || "",
          domain: company_guess?.domain || "",
          linkedin_url: company_guess?.linkedin_url || "",
        },
        contacts: normalized,
      });
    } catch {
      return { score: 0.7, explanation: "Heuristic" };
    }
  })();

  // 7) Response
  const summary = {
    total_candidates: provider.value ? provider.value.length : 0,
    kept: normalized.length,
    provider: "live",
    company_guess,
    timings: {
      llm_ms: llm.ms,
      provider_ms: provider.ms,
      smtp_ms: 0,
    },
    quality,
  };

  // Even if provider errored, return ok: true with empty results so UI never spins forever.
  return res.json({
    ok: true,
    data: {
      summary,
      results: normalized,
    },
    // surface non-fatal provider/llm errors in debug field (not used by UI)
    debug: {
      llm_error: llm.error ? String(llm.error?.message || llm.error) : null,
      provider_error: provider.error ? String(provider.error?.message || provider.error) : null,
    },
  });
});

export default router;
