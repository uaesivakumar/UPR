import express from "express";
import * as LLM from "./lib/llm.js";
import * as Apollo from "./lib/apollo.js";
import { scoreQuality } from "./lib/quality.js";
import { tagEmirate } from "./lib/geo.js";
import { applyEmailPattern } from "./lib/email.js";

const router = express.Router();

/**
 * GET /api/enrich/search
 * q=free text (required)
 * Optional overrides:
 *   &name=Exact Company Name
 *   &domain=example.com  (or full URL; we normalize)
 *   &linkedin_url=...
 *   &parent=Mubadala
 */
router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ ok: false, error: "missing q" });

    const overrides = {
      name: req.query.name ? String(req.query.name) : undefined,
      domain: req.query.domain ? String(req.query.domain) : undefined,
      linkedin_url: req.query.linkedin_url ? String(req.query.linkedin_url) : undefined,
      parent: req.query.parent ? String(req.query.parent) : undefined,
    };

    // 1) LLM guess (respects overrides)
    const tLLM0 = Date.now();
    const guess = await LLM.guessCompany(q, overrides);
    const llm_ms = Date.now() - tLLM0;

    // 2) Provider search
    const tProv0 = Date.now();
    const providerResults = await Apollo.searchPeopleByCompany({
      name: guess.name,
      domain: guess.domain,
      linkedin_url: guess.linkedin_url,
    });
    const provider_ms = Date.now() - tProv0;

    // 3) Post-process results: emirate + pattern email if provider redacted
    const results = (providerResults || []).map((r) => {
      let email = r.email || null;
      let email_status = r.email_status || (email ? "provider" : "unknown");
      let email_reason = r.email_reason || (email ? "provider" : "no_email");

      if ((!email || !String(email).includes("@")) && guess.domain) {
        // pattern_hint like "first.last" or a placeholder "first.last"
        const hint = (typeof r.pattern_hint === "string" && !r.pattern_hint.includes("@"))
          ? r.pattern_hint
          : (typeof email === "string" && !email.includes("@") ? email : "first.last");
        const guessed = applyEmailPattern(r.name || "", guess.domain, hint);
        if (guessed) {
          email = guessed;
          email_status = "patterned";
          email_reason = "pattern_guess";
        }
      }

      return {
        ...r,
        email,
        email_status,
        email_reason,
        emirate: tagEmirate(r.location),
        source: r.source || "live",
      };
    });

    // 4) Quality
    const quality = scoreQuality(guess, results);

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
    return res.status(500).json({ ok: false, error: "search_failed" });
  }
});

export default router;
