import express from "express";
import { guessCompany } from "./lib/llm.js";
import { searchPeopleByCompany } from "./lib/apollo.js";
import { scoreQuality } from "./lib/quality.js";
import { tagEmirate } from "./lib/geo.js";
import { applyEmailPattern } from "./lib/email.js";

const router = express.Router();

/**
 * GET /api/enrich/search
 * q=free text (required)
 * Optional overrides:
 *   &name=Exact Co Name
 *   &domain=example.com    (or full URL; we normalize to domain)
 *   &linkedin_url=...
 *   &parent=Mubadala
 */
router.get("/", async (req, res) => {
  const t0 = Date.now();
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ ok:false, error:"missing q" });

    const overrides = {
      name: req.query.name ? String(req.query.name) : undefined,
      domain: req.query.domain ? String(req.query.domain) : undefined,
      linkedin_url: req.query.linkedin_url ? String(req.query.linkedin_url) : undefined,
      parent: req.query.parent ? String(req.query.parent) : undefined,
    };

    // 1) LLM guess (respects overrides)
    const g0 = Date.now();
    const guess = await guessCompany(q, overrides);
    const llm_ms = Date.now() - g0;

    // 2) Provider search (domain preferred)
    const p0 = Date.now();
    const providerResults = await searchPeopleByCompany({
      name: guess.name,
      domain: guess.domain,
      linkedin_url: guess.linkedin_url,
      // Filter to UAE + HR/Admin/Finance within the provider func
    });
    const provider_ms = Date.now() - p0;

    // 3) Post-process: emirate tagging + email pattern
    const results = (providerResults || []).map((r) => {
      const em = tagEmirate(r.location);
      const withEmail = applyEmailPattern(guess.domain, r);
      return { ...withEmail, emirate: em };
    });

    // 4) Quality
    const quality = scoreQuality({ guess, results });

    return res.json({
      ok: true,
      data: {
        status: "completed",
        results,
        summary: {
          provider: "live",
          company_guess: guess,
          timings: { llm_ms, provider_ms, smtp_ms: 0 },
          quality,
          total_candidates: results.length,
          kept: results.length,
        },
      },
    });
  } catch (e) {
    console.error("enrich search error", e);
    res.status(500).json({ ok:false, error:"search_failed" });
  }
});

export default router;
