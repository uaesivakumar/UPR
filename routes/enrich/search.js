// server/routes/enrich/search.js
import express from "express";
import * as apollo from "./lib/apollo.js";
import * as llm from "./lib/llm.js";
import * as geo from "./lib/geo.js";
import * as email from "./lib/email.js";
import * as quality from "./lib/quality.js";

const router = express.Router();

/**
 * GET /api/enrich/search?q=company
 */
router.get("/search", async (req, res) => {
  const q = req.query.q || "";
  const t0 = Date.now();

  const timings = {};
  let company = null;
  let candidates = [];
  let error = null;

  try {
    // --- 1. Guess company (name + domain) ---
    const t1 = Date.now();
    try {
      company = await llm.guessCompany(q);
    } catch (err) {
      error = `llm.guessCompany failed: ${err.message}`;
      company = { name: q, domain: null };
    }
    timings.llm_ms = Date.now() - t1;

    // --- 2. Apollo search ---
    const t2 = Date.now();
    try {
      if (company?.name) {
        candidates = await apollo.searchPeopleByCompany(company.name, company.domain);
      }
    } catch (err) {
      error = `apollo.searchPeopleByCompany failed: ${err.message}`;
    }
    timings.apollo_ms = Date.now() - t2;

    // --- 3. Geo enrichment ---
    const t3 = Date.now();
    try {
      candidates = await geo.enrich(candidates);
    } catch (err) {
      error = `geo.enrich failed: ${err.message}`;
    }
    timings.geo_ms = Date.now() - t3;

    // --- 4. Email enrichment ---
    const t4 = Date.now();
    try {
      candidates = await email.enrich(candidates);
    } catch (err) {
      error = `email.enrich failed: ${err.message}`;
    }
    timings.email_ms = Date.now() - t4;

    // --- 5. Quality scoring ---
    const t5 = Date.now();
    try {
      candidates = quality.score(candidates, company);
    } catch (err) {
      error = `quality.score failed: ${err.message}`;
    }
    timings.quality_ms = Date.now() - t5;

  } catch (err) {
    error = err.message;
  }

  const totalMs = Date.now() - t0;
  timings.total_ms = totalMs;

  return res.json({
    ok: !error,
    error,
    query: q,
    company,
    candidates,
    timings,
    provider: "apollo+llm+geo+email+quality"
  });
});

export default router;
