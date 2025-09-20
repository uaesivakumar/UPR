// routes/enrich/search.js
import { enrichWithApollo } from "./lib/apollo.js";
import { enrichWithGeo } from "./lib/geo.js";
import { enrichWithEmail } from "./lib/email.js";
import { enrichWithLLM } from "./lib/llm.js";
import { qualityScore } from "./lib/quality.js";

/**
 * GET or POST /api/enrich/search
 * Pipeline:
 *   1) LLM (company guess)  -> gives us a domain early
 *   2) Apollo (contacts)    -> query by domain when available
 *   3) Geo / Email          -> tag emirate, synthesize/verify emails
 *   4) Quality              -> page-level score
 */
export default async function searchHandler(req, res) {
  const started = Date.now();

  const q = (req.query.q || req.body?.q || "").trim();
  const overrides = {
    name: (req.query.name || req.body?.name || q || "").trim() || null,
    domain: (req.query.domain || req.body?.domain || "").trim() || null,
    linkedin_url: (req.query.linkedin_url || req.body?.linkedin_url || "").trim() || null,
    parent: (req.query.parent || req.body?.parent || "").trim() || null,
  };

  if (!overrides.name && !overrides.domain && !overrides.linkedin_url) {
    return res.status(200).json({
      ok: true,
      data: { results: [], summary: { provider: "live", company_guess: { name: q || "" }, quality: { score: 0.5 } } },
      took_ms: Date.now() - started,
    });
  }

  const timings = {};
  let companyGuess = null;
  let candidates = [];

  try {
    // 1) LLM FIRST — so we get a domain to constrain Apollo
    let t0 = Date.now();
    const llm = await enrichWithLLM({
      name: overrides.name,
      domain: overrides.domain,
      linkedin_url: overrides.linkedin_url,
      parent: overrides.parent,
      q,
    });
    timings.llm_ms = Date.now() - t0;

    companyGuess = {
      name: overrides.name || llm?.name || llm?.company_guess?.name || q || null,
      domain: overrides.domain || llm?.domain || llm?.company_guess?.domain || null,
      linkedin_url: overrides.linkedin_url || llm?.linkedin_url || llm?.company_guess?.linkedin_url || null,
      parent: overrides.parent || llm?.company_guess?.parent || null,
    };

    // 2) Apollo — use domain if we have it; otherwise name fallback
    t0 = Date.now();
    const ap = await enrichWithApollo({
      name: companyGuess.name,
      domain: companyGuess.domain,
      linkedin_url: companyGuess.linkedin_url,
      limit: 20,
    });
    timings.apollo_ms = ap?.ms ?? Date.now() - t0;

    // Guardrail: if we have a domain, keep only rows that match it
    const dom = (companyGuess.domain || "").toLowerCase();
    const filtered = dom
      ? (ap?.results || []).filter((r) => {
          const host = String(r.org_domain || r.company_domain || "").toLowerCase();
          return host ? host === dom : true; // if Apollo didn’t include org domain, don’t over-prune
        })
      : (ap?.results || []);

    candidates = filtered;

    // 3) Geo + Email (use domain from companyGuess)
    t0 = Date.now();
    candidates = await enrichWithGeo(candidates);
    timings.geo_ms = Date.now() - t0;

    t0 = Date.now();
    candidates = await enrichWithEmail(candidates, companyGuess.domain || null);
    timings.email_ms = Date.now() - t0;

    // 4) Quality
    t0 = Date.now();
    const qScore = await qualityScore(companyGuess, candidates);
    timings.quality_ms = Date.now() - t0;

    const summary = {
      provider: "apollo+geo+email+llm",
      company_guess: companyGuess,
      quality: { score: qScore, explanation: "Domain-first Apollo + UAE targeting" },
      timings,
    };

    return res.json({
      ok: true,
      data: { results: candidates, summary },
      took_ms: Date.now() - started,
    });
  } catch (e) {
    console.error("[enrich/search] error", e?.stack || e);
    return res.status(200).json({
      ok: true,
      data: {
        results: [],
        summary: {
          provider: "live",
          company_guess: companyGuess || { name: q || overrides.name || "" },
          quality: { score: 0.5, explanation: "fallback after error" },
          timings,
        },
      },
      took_ms: Date.now() - started,
    });
  }
}
