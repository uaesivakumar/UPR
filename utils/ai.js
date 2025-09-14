// routes/enrich.js
import express from "express";
import { ok, bad } from "../utils/respond.js";
import { adminOnly } from "../utils/adminOnly.js";
import { aiEnrichFromInput } from "../utils/ai.js";

const router = express.Router();

/**
 * POST /api/enrich
 * Body: { input: string }
 * AI-powered enrichment:
 *  - LLM parses the query
 *  - Optional web search (if BING_API_KEY present) to resolve domain
 *  - LLM proposes contacts + patterned emails + outreach draft
 */
router.post("/", async (req, res) => {
  try {
    const { input } = req.body || {};
    if (!input || !String(input).trim()) return bad(res, "input required");

    const data = await aiEnrichFromInput(String(input).trim());
    return ok(res, data);
  } catch (e) {
    console.error("enrich error:", e);
    return bad(res, "enrichment failed", 500);
  }
});

/**
 * POST /api/enrich/run
 * Same as POST / (kept for backward compat with your UI)
 */
router.post("/run", async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query || !String(query).trim()) return bad(res, "query required");
    const data = await aiEnrichFromInput(String(query).trim());
    return ok(res, data);
  } catch (e) {
    console.error("enrich/run error:", e);
    return bad(res, "enrichment failed", 500);
  }
});

/**
 * POST /api/enrich/save   (admin gated)
 * Accepts the structure from the UI and persists to companies/hr_leads.
 * You already wired /api/hr-leads/from-enrichment; keep using that.
 * This endpoint stays as a convenience if you want the enrich page to save directly.
 */
router.post("/save", adminOnly, async (_req, res) => {
  return bad(res, "use /api/hr-leads/from-enrichment", 400);
});

export default router;
