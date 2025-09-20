// routes/enrich/search.js
import { pool } from "../../utils/db.js";
import { enrichWithApollo } from "./lib/apollo.js";
import { enrichWithGeo } from "./lib/geo.js";
import { enrichWithEmail } from "./lib/email.js";
import { enrichWithLLM } from "./lib/llm.js";
import { qualityScore } from "./lib/quality.js";

/**
 * GET or POST /api/enrich/search
 * Orchestrates enrichment pipeline using modular libs.
 */
export default async function searchHandler(req, res) {
  const started = Date.now();
  const q = (req.query.q || req.body.q || "").trim();
  const name = req.query.name || req.body.name || q;
  const domain = req.query.domain || req.body.domain || null;
  const linkedin_url = req.query.linkedin_url || req.body.linkedin_url || null;
  const parent = req.query.parent || req.body.parent || null;

  if (!name && !domain && !linkedin_url) {
    return res.status(400).json({ ok: false, error: "missing_query" });
  }

  const timings = {};
  let candidates = [];
  let companyGuess = { name, domain, linkedin_url, parent };

  try {
    // Apollo enrichment (contacts)
    let t0 = Date.now();
    const apolloOut = await enrichWithApollo({ name, domain, linkedin_url });
    timings.apollo_ms = apolloOut?.ms ?? Date.now() - t0;

    if (apolloOut?.ok && Array.isArray(apolloOut.results)) {
      candidates = apolloOut.results;
    } else {
      console.warn("[enrich/search] Apollo returned no candidates", apolloOut?.error);
      candidates = [];
    }
    console.log(`[enrich/search] Apollo candidates: ${candidates.length}`);

    // Geo enrichment (tag emirates)
    t0 = Date.now();
    candidates = await enrichWithGeo(candidates);
    timings.geo_ms = Date.now() - t0;
    console.log(`[enrich/search] After Geo: ${candidates.length}`);

    // Email enrichment (pattern + verifier)
    t0 = Date.now();
    candidates = await enrichWithEmail(candidates, domain);
    timings.email_ms = Date.now() - t0;
    console.log(`[enrich/search] After Email: ${candidates.length}`);

    // LLM enrichment (refine company guess)
    t0 = Date.now();
    const llmOut = await enrichWithLLM({ name, domain, linkedin_url, candidates });
    timings.llm_ms = Date.now() - t0;

    if (llmOut?.company_guess) {
      companyGuess = { ...companyGuess, ...llmOut.company_guess };
    }
    console.log(`[enrich/search] After LLM: ${candidates.length}`);

    // Quality scoring
    t0 = Date.now();
    const quality = await qualityScore(companyGuess, candidates);
    timings.quality_ms = Date.now() - t0;
    console.log(`[enrich/search] Quality score: ${quality}`);

    const summary = {
      provider: "apollo+geo+email+llm",
      company_guess: companyGuess,
      quality,
      timings,
    };

    return res.json({
      ok: true,
      data: { results: candidates, summary },
      took_ms: Date.now() - started,
    });
  } catch (err) {
    console.error("[enrich/search] error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "internal_error",
      took_ms: Date.now() - started,
    });
  }
}
