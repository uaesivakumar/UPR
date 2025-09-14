// routes/email.js
import express from "express";
import { ok, bad } from "../utils/respond.js";
import { adminOnly } from "../utils/adminOnly.js";
import { detectPattern, generateEmail, generateCandidates } from "../utils/emailPatterns.js";
import { verifyEmail } from "../utils/emailVerify.js";
import { getDomainPattern, setDomainPattern } from "../utils/patternCache.js";

const router = express.Router();

const MAX_VERIFY = Number(process.env.SMTP_VERIFY_MAX || 8);

/**
 * POST /api/email/verify  (admin-gated)
 * Body:
 * {
 *   emails?: string[],                   // emails to verify (optional)
 *   domain?: string,                     // domain to infer/generate against
 *   names?: string[],                    // names to generate candidates (when pattern known/guessed)
 *   known?: [{ name, email }],           // pairs for discovery
 *   savePattern?: boolean                // persist discovered pattern to cache (default true)
 * }
 */
router.post("/verify", adminOnly, async (req, res) => {
  try {
    const {
      emails = [],
      domain,
      names = [],
      known = [],
      savePattern = true,
    } = req.body || {};

    if (!emails.length && !domain) {
      return bad(res, "Provide emails or a domain");
    }

    // 1) Try cache for domain
    let cached = domain ? await getDomainPattern(domain) : null;

    // 2) Can we detect a pattern from known pairs?
    let discovered = null;
    const patternFromKnown = detectPattern(known);
    if (patternFromKnown && domain) {
      discovered = { domain, pattern_id: patternFromKnown, source: "verify" };
      if (savePattern) {
        await setDomainPattern({
          domain,
          pattern_id: patternFromKnown,
          source: "verify",
          example: known.find(k => k?.email) || null,
        });
        cached = await getDomainPattern(domain);
      }
    }

    // 3) Generate emails for provided names (if we have a pattern)
    const generated = [];
    if (domain && names.length) {
      const pat = (cached && cached.pattern_id) || (discovered && discovered.pattern_id) || null;
      if (pat) {
        for (const n of names) {
          const email = generateEmail(n, domain, pat);
          if (email) generated.push({ name: n, email, pattern: pat });
        }
      } else {
        // fallback: first candidate per name
        for (const n of names) {
          const c = generateCandidates(n, domain, 1)[0];
          if (c) generated.push({ name: n, email: c.email, pattern: c.pattern, guessed: true });
        }
      }
    }

    // 4) Build verification list (emails + generated)
    const verifyList = [];
    const seen = new Set();
    for (const e of emails) {
      const v = String(e || "").trim().toLowerCase();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      verifyList.push(v);
    }
    for (const g of generated) {
      const v = String(g.email || "").trim().toLowerCase();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      verifyList.push(v);
    }
    verifyList.splice(MAX_VERIFY); // cap

    // 5) Verify (best-effort)
    const results = [];
    for (const email of verifyList) {
      try {
        const r = await verifyEmail(email);
        results.push({ email, status: r.status, mxHost: r.mxHost });
      } catch (e) {
        results.push({ email, status: "unknown", error: String(e?.message || e) });
      }
    }

    // 6) If we just validated something for the domain and have a chosen pattern, bump verified_count
    if (domain) {
      const gotValid = results.some(r => r.status === "valid" && r.email.endsWith(`@${domain.toLowerCase()}`));
      const pat = (cached && cached.pattern_id) || (discovered && discovered.pattern_id) || null;
      if (gotValid && pat && savePattern) {
        await setDomainPattern({
          domain,
          pattern_id: pat,
          source: (cached && cached.source) || "verify",
          incrementVerified: true,
        });
      }
    }

    return ok(res, {
      domain: domain || null,
      cachedPattern: cached ? cached.pattern_id : null,
      discoveredPattern: discovered ? discovered.pattern_id : null,
      generated,
      results,
    });
  } catch (e) {
    console.error("email/verify error:", e);
    return bad(res, "verification failed", 500);
  }
});

/** GET /api/email/pattern?domain=example.com  (admin-gated) */
router.get("/pattern", adminOnly, async (req, res) => {
  try {
    const { domain } = req.query;
    if (!domain) return bad(res, "domain required");
    const row = await getDomainPattern(domain);
    return ok(res, row || null);
  } catch (e) {
    console.error("email/pattern get error:", e);
    return bad(res, "server error", 500);
  }
});

/** POST /api/email/pattern  (admin-gated, manual set) */
router.post("/pattern", adminOnly, async (req, res) => {
  try {
    const { domain, pattern_id, example } = req.body || {};
    if (!domain || !pattern_id) return bad(res, "domain and pattern_id required");
    const r = await setDomainPattern({ domain, pattern_id, source: "manual", example });
    return ok(res, r);
  } catch (e) {
    console.error("email/pattern post error:", e);
    return bad(res, "server error", 500);
  }
});

export default router;
