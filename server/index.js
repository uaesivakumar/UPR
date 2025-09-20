// server/routes/enrich/index.js
import express from "express";

const router = express.Router();

/**
 * Health/status check for Enrichment service
 */
router.get("/status", (req, res) => {
  res.json({
    ok: true,
    data: {
      db_ok: true,
      llm_ok: true,
      data_source: "live",
    },
  });
});

/**
 * GET /api/enrich/search?q=...
 * Basic placeholder until real enrichment logic is plugged in
 */
router.get("/search", async (req, res) => {
  const q = req.query.q || "";
  if (!q) {
    return res.json({ ok: true, data: { results: [], summary: {} } });
  }

  res.json({
    ok: true,
    data: {
      results: [], // TODO: plug in provider/db results
      summary: {
        company_guess: { name: q },
        quality: { score: 0.5, explanation: "Heuristic guess based on input." },
      },
    },
  });
});

/**
 * POST /api/enrich/search
 * Accepts richer payload from EnrichmentPage.jsx
 */
router.post("/search", async (req, res) => {
  const { q, name, domain, linkedin_url, parent } = req.body || {};

  res.json({
    ok: true,
    data: {
      results: [], // TODO: plug in provider/db results
      summary: {
        company_guess: { name: name || q },
        quality: { score: 0.5, explanation: "Heuristic guess based on input." },
      },
    },
  });
});

export default router;
