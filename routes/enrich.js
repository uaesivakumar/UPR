// routes/enrich.js
import express from "express";
import { ok, bad } from "../utils/respond.js";
import { aiEnrichFromInput } from "../utils/ai.js";
import {
  detectPattern,
  generateEmail,
  generateCandidates,
} from "../utils/emailPatterns.js";
import { verifyEmail } from "../utils/emailVerify.js";
import { getDomainPattern, setDomainPattern } from "../utils/patternCache.js";

const router = express.Router();

const VERIFY_ENABLED = (process.env.SMTP_VERIFY_ENABLED || "true")
  .toLowerCase()
  === "true";
const VERIFY_MAX = Number(process.env.SMTP_VERIFY_MAX || 3);

/** Normalize a domain from company fields */
function extractDomain(company = {}) {
  let domain = company.domain || null;
  if (!domain && company.website) {
    try {
      const u = new URL(company.website);
      domain = u.hostname;
    } catch {
      /* ignore */
    }
  }
  if (domain) domain = String(domain).replace(/^www\./i, "").toLowerCase();
  return domain || null;
}

async function runPipeline(input) {
  const data = await aiEnrichFromInput(String(input).trim());

  // --- 1) Determine domain and check pattern cache
  const domain = extractDomain(data.company);
  let cachedPat = null;
  if (domain) {
    const cached = await getDomainPattern(domain);
    cachedPat = cached?.pattern_id || null;
  }

  // --- 2) Detect pattern from any name/email pairs present
  const pairs = (data.contacts || [])
    .filter((c) => c?.name && c?.email && String(c.email).includes("@"))
    .map((c) => ({ name: c.name, email: c.email }));

  const detectedPat = detectPattern(pairs);
  const choosePat = cachedPat || detectedPat || null;

  // --- 3) Populate missing emails via pattern or candidates
  if (domain && Array.isArray(data.contacts)) {
    for (const c of data.contacts) {
      if (!c) continue;
      const needsGuess = !c.email && !c.email_guess && c.name;
      if (!needsGuess) continue;

      if (choosePat) {
        const guess = generateEmail(c.name, domain, choosePat);
        if (guess) {
          c.email_guess = guess;
          c.email_status = c.email_status || "patterned";
        }
      } else {
        const candidates = generateCandidates(c.name, domain, 1);
        if (candidates?.[0]?.email) {
          c.email_guess = candidates[0].email;
          c.email_status = c.email_status || "patterned";
        }
      }
    }
  }

  // --- 4) Verify a handful (deduped) and mark statuses
  let validatedAny = false;
  if (VERIFY_ENABLED && domain && Array.isArray(data.contacts) && VERIFY_MAX > 0) {
    const targets = [];
    for (const c of data.contacts) {
      if (c?.email) targets.push(c.email);
      if (c?.email_guess) targets.push(c.email_guess);
    }

    const seen = new Set();
    const toCheck = [];
    for (const e of targets) {
      const v = String(e || "").toLowerCase();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      toCheck.push(v);
      if (toCheck.length >= VERIFY_MAX) break;
    }

    for (const email of toCheck) {
      try {
        const r = await verifyEmail(email);
        const hit = data.contacts.find(
          (c) => c?.email?.toLowerCase() === email || c?.email_guess?.toLowerCase() === email
        );
        if (!hit) continue;

        if (r.status === "valid") {
          validatedAny = true;
          hit.email_status = "validated";
          if (!hit.email) hit.email = email;
        } else if (r.status === "invalid") {
          hit.email_status = "bounced";
        }
      } catch {
        // ignore transient verifier errors
      }
    }
  }

  // --- 5) Persist pattern if useful
  if (domain) {
    const patToPersist = choosePat || detectedPat;
    if (patToPersist && (validatedAny || !cachedPat)) {
      const example = pairs?.[0] || null;
      await setDomainPattern({
        domain,
        pattern_id: patToPersist,
        source: cachedPat ? "verify" : (pairs.length ? "import" : "llm"),
        example,
        incrementVerified: validatedAny,
      });
    }
  }

  return data;
}

/**
 * POST /api/enrich
 * Body: { input: string }
 */
router.post("/", async (req, res) => {
  try {
    const input = req.body?.input ?? req.body?.query ?? "";
    if (!input || !String(input).trim()) return bad(res, "input required");

    const data = await runPipeline(input);
    return ok(res, data);
  } catch (e) {
    console.error("enrich error:", e);
    return bad(res, e?.message || "enrichment failed", 500);
  }
});

/**
 * Back-compat for older UI: POST /api/enrich/run
 * Body: { query: string }
 */
router.post("/run", async (req, res) => {
  try {
    const query = req.body?.query ?? "";
    if (!query || !String(query).trim()) return bad(res, "query required");

    const data = await runPipeline(query);
    return ok(res, data);
  } catch (e) {
    console.error("enrich/run error:", e);
    return bad(res, e?.message || "enrichment failed", 500);
  }
});

export default router;
