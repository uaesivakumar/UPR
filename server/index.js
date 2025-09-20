import express from "express";
const router = express.Router();

router.get("/status", (req, res) => {
  res.json({ ok: true, data: { db_ok: true, llm_ok: true, data_source: "live" } });
});

router.get("/search", async (req, res) => {
  // placeholder search handler
  const q = req.query.q || "";
  if (!q) return res.json({ ok: true, data: { results: [], summary: {} } });

  // TODO: wire your real enrichment logic
  res.json({
    ok: true,
    data: {
      results: [],
      summary: {
        company_guess: { name: q },
        quality: { score: 0.5, explanation: "Heuristic guess based on input." },
      },
    },
  });
});

router.post("/search", async (req, res) => {
  const { q, name, domain, linkedin_url } = req.body || {};
  res.json({
    ok: true,
    data: {
      results: [],
      summary: {
        company_guess: { name: name || q },
        quality: { score: 0.5, explanation: "Heuristic guess based on input." },
      },
    },
  });
});

export default router;
