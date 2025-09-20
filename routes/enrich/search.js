// routes/enrich/search.js
import { Router } from "express";

/**
 * Fast, safe handler that never hangs the UI.
 * Query params supported: q, name, domain, linkedin_url, parent
 *
 * Response shape:
 * { ok: true, data: { results: Contact[], summary: { provider, timings, company_guess, quality } } }
 */
export default async function searchHandler(req, res) {
  const started = Date.now();
  const q = String(req.query.q || "").trim();
  const name = String(req.query.name || q || "").trim();
  const domain = String(req.query.domain || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  const linkedin_url = String(req.query.linkedin_url || "").trim();
  const parent = String(req.query.parent || "").trim();

  // Build a lightweight company guess from the inputs we have.
  const company_guess = {};
  if (name) company_guess.name = name;
  if (domain) company_guess.domain = domain;
  if (linkedin_url) company_guess.linkedin_url = linkedin_url;
  if (parent) company_guess.parent = parent;

  // NOTE: Plug your real providers here behind try/catch with strict timeouts.
  // This default returns quickly with no candidates instead of hanging.
  const results = [];

  const summary = {
    provider: "live",
    timings: { provider_ms: Date.now() - started, llm_ms: 0 },
    company_guess,
    quality: { score: 0.5, explanation: "Heuristic guess based on input." },
  };

  return res.json({ ok: true, data: { results, summary } });
}

// Optional Router export if you ever want to mount this file directly.
export const router = Router().get("/search", searchHandler);
