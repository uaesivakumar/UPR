// routes/enrich.js
import express from "express";
import { ok, bad } from "../utils/respond.js";
import { aiEnrichFromInput } from "../utils/ai.js";
import { detectPattern, generateEmail, generateCandidates } from "../utils/emailPatterns.js";
import { verifyEmail } from "../utils/emailVerify.js";
import { getDomainPattern, setDomainPattern } from "../utils/patternCache.js";

const router = express.Router();

const VERIFY_ENABLED = (process.env.SMTP_VERIFY_ENABLED || "true").toLowerCase() === "true";
const VERIFY_MAX = Number(process.env.SMTP_VERIFY_MAX || 3);

/**
 * POST /api/enrich
 * Body: { input: string }
 */
router.post("/", async (req, res) => {
  try {
    const { input } = req.body || {};
    if (!input || !String(input).trim()) return bad(res, "input required");

    const data = await aiEnrichFromInput(String(input).trim());

    const domain = data.company?.domain || null;

    // 1) Try pattern cache first
    let cachedPat = null;
    if (domain) {
      const cached = await getDomainPattern(domain);
      cachedPat = cached?.pattern_id || null;
    }

    // 2) Try to detect pattern from present pairs
    const pairs = (data.contacts || [])
      .filter(c => c.name && c.email && String(c.email).includes("@"))
      .map(c => ({ name: c.name, email: c.email }));

    let detectedPat = detectPattern(pairs);

    // 3) Fill missing emails using pattern (cached > detected) or generate candidates
    const choosePat = cachedPat || detectedPat || null;

    if (domain) {
      for (const c of data.contacts) {
        if (!c.email && !c.email_guess && c.name) {
          if (choosePat) {
            const guess = generateEmail(c.name, domain, choosePat);
            if (guess) {
              c.email_guess = guess;
              c.email_status = c.email_status || "patterned";
            }
          } else {
            const candidates = generateCandidates(c.name, domain, 1);
            if (candidates[0]) {
              c.email_guess = candidates[0].email;
              c.email_status = c.email_status || "patterned";
            }
          }
        }
      }
    }

    // 4) Optionally verify a handful; if we validated any and have a pattern, persist
    let validatedAny = false;

    if (VERIFY_ENABLED && domain) {
      const targets = [];
      for (const c of data.contacts) if (c.email) targets.push(c.email);
      for (const c of data.contacts) if (c.email_guess) targets.push(c.email_guess);

      const seen = new Set();
      const toCheck = [];
      for (const e of targets) {
        if (!e) continue;
        const v = String(e).toLowerCase();
        if (seen.has(v)) continue;
        seen.add(v);
        toCheck.push(v);
        if (toCheck.length >= VERIFY_MAX) break;
      }

      for (const email of toCheck) {
        try {
          const r = await verifyEmail(email);
          const hit = data.contacts.find(c => c.email === email || c.email_guess === email);
          if (r.status === "valid") {
            validatedAny = true;
            if (hit) hit.email_status = "validated";
            if (hit && !hit.email) hit.email = email;
          } else if (r.status === "invalid") {
            if (hit) hit.email_status = "bounced";
          }
        } catch {
          /* ignore */
        }
      }
    }

    // 5) Persist pattern if we have one and either (a) not cached yet, or (b) we validated
    if (domain) {
      const patToPersist = choosePat || detectedPat;
      if (patToPersist && (validatedAny || !cachedPat)) {
        const example = pairs[0] || null;
        await setDomainPattern({
          domain,
          pattern_id: patToPersist,
          source: cachedPat ? "verify" : (pairs.length ? "import" : "llm"),
          example,
          incrementVerified: validatedAny,
        });
      }
    }

    return ok(res, data);
  } catch (e) {
    console.error("enrich error:", e);
    return bad(res, "enrichment failed", 500);
  }
});

/** Back-compat for page code */
router.post("/run", async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query || !String(query).trim()) return bad(res, "query required");
    req.body.input = query;
    return router.handle(req, res);
  } catch (e) {
    console.error("enrich/run error:", e);
    return bad(res, "enrichment failed", 500);
  }
});

export default router;
