import express from "express";
import { aiEnrichFromInput } from "../utils/ai.js";
import { detectPattern, generateEmail, generateCandidates } from "../utils/emailPatterns.js";
import { verifyEmail } from "../utils/emailVerify.js";
import { getDomainPattern, setDomainPattern } from "../utils/patternCache.js";

const router = express.Router();

/* ------------------------------- config ------------------------------ */

const OPENAI_MODEL =
  process.env.OPENAI_MODEL ||
  process.env.VITE_OPENAI_MODEL ||
  "gpt-4o-mini";

const SMTP_VERIFY_ENABLED =
  (process.env.SMTP_VERIFY_ENABLED || "false").toLowerCase() === "true";

const SMTP_VERIFY_MAX = Math.max(0, Number(process.env.SMTP_VERIFY_MAX || 3));

/* ------------------------------ helpers ----------------------------- */

function cleanStr(s) {
  if (!s) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

function titleCase(s) {
  if (!s) return s;
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}

function normalizeUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function extractDomainFromUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname;
  } catch {
    const s = String(u || "").trim().toLowerCase();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return s;
    return null;
  }
}

function companyFromAI(raw) {
  const c = raw?.company || raw?.data?.company || raw || {};
  const out = {
    name: cleanStr(c.name) ? titleCase(c.name) : null,
    website: normalizeUrl(c.website ?? c.website_url),
    linkedin: normalizeUrl(c.linkedin ?? c.linkedin_url),
    hq: cleanStr(c.hq) || cleanStr(c.location) || null,
    industry: cleanStr(c.industry) || null,
    size: cleanStr(c.size) || null,
    type: cleanStr(c.type) || null,
    notes: cleanStr(c.notes) || null,
    locations: Array.isArray(c.locations)
      ? c.locations.filter(Boolean)
      : c.hq
      ? [c.hq]
      : [],
  };
  return out;
}

function contactFromAI(c) {
  if (!c) return null;
  const name = cleanStr(c.name);
  const title = cleanStr(c.title || c.role);
  const dept = cleanStr(c.dept || c.department);
  const linkedin = normalizeUrl(c.linkedin || c.linkedin_url);
  const email = cleanStr(c.email);
  const email_guess = cleanStr(c.email_guess);

  return {
    id: c.id || undefined,
    name: name || null,
    title: title || null,
    dept: dept || null,
    linkedin: linkedin || null,
    email: email || null,
    email_guess: email_guess || null,
    email_status: cleanStr(c.email_status) || null,
    confidence: typeof c.confidence === "number" ? c.confidence : null,
    score: typeof c.score === "number" ? c.score : null,
  };
}

/**
 * Build {name,email} pairs for pattern detection.
 */
function seedPairs(contacts) {
  if (!Array.isArray(contacts)) return [];
  return contacts
    .map((c) => ({
      name: cleanStr(c?.name) || null,
      email: cleanStr(c?.email) || null,
    }))
    .filter((p) => p.name && p.email && p.email.includes("@"));
}

/**
 * Guess/verify emails for contacts that lack a real email using:
 *  1) cached pattern from patternCache
 *  2) detectPattern(pairs) if we have seed emails
 *  3) generateCandidates fallback (choose first)
 */
async function enrichEmailsForContacts(company, contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return contacts;

  const domain =
    extractDomainFromUrl(company?.website) ||
    extractDomainFromUrl(company?.linkedin) ||
    null;

  if (!domain) {
    // No domain → just mark unknown if missing
    for (const c of contacts) {
      if (!c?.email && !c?.email_guess) {
        c.email_status = c.email_status || "unknown";
      }
    }
    return contacts;
  }

  // 1) cache
  const cached = await getDomainPattern(domain);
  let pattern_id = cached?.pattern_id || null;

  // 2) detect from seeds if no cache
  if (!pattern_id) {
    const pairs = seedPairs(contacts);
    const detected = detectPattern(pairs);
    if (detected) {
      pattern_id = detected;
      await setDomainPattern({
        domain,
        pattern_id,
        source: "detectPattern(seeds)",
        example: pairs[0]?.email || null,
      });
    }
  }

  // 3) assign guesses
  let verifyCount = 0;

  for (const c of contacts) {
    if (!c) continue;

    // keep provided emails
    if (c.email) {
      c.email_status = c.email_status || "validated";
      continue;
    }

    // Need a name to generate anything
    if (!c.name) {
      c.email_status = c.email_status || "unknown";
      continue;
    }

    let guess = null;

    if (pattern_id) {
      // generateEmail(name, domain, pattern_id)
      guess = generateEmail(c.name, domain, pattern_id);
    } else {
      // fallback: generateCandidates(name, domain) then pick the first
      const cand = generateCandidates(c.name, domain, 1);
      if (Array.isArray(cand) && cand.length) {
        pattern_id = cand[0]?.pattern_id || pattern_id;
        guess = cand[0]?.email || null;

        if (cand[0]?.pattern_id) {
          await setDomainPattern({
            domain,
            pattern_id: cand[0].pattern_id,
            source: "generateCandidates(fallback)",
            example: guess,
          });
        }
      }
    }

    if (guess) {
      c.email_guess = c.email_guess || guess;
      c.email_status = c.email_status || "patterned";
    } else {
      c.email_status = c.email_status || "unknown";
      continue;
    }

    // Optional SMTP verification (rate-limited per request)
    if (
      SMTP_VERIFY_ENABLED &&
      verifyCount < SMTP_VERIFY_MAX &&
      c.email_status !== "validated" &&
      c.email_guess
    ) {
      try {
        const vr = await verifyEmail(c.email_guess);
        if (vr?.status === "valid") {
          c.email = c.email_guess;
          c.email_status = "validated";
          await setDomainPattern({
            domain,
            pattern_id,
            source: "smtp-verify",
            example: c.email,
            incrementVerified: true,
          });
        } else if (vr?.status === "invalid") {
          c.email_status = "bounced";
        } else {
          // unknown / catch-all → keep as patterned
          c.email_status = c.email_status || "patterned";
        }
      } catch {
        // swallow verifier exceptions
        c.email_status = c.email_status || "patterned";
      } finally {
        verifyCount += 1;
      }
    }
  }

  return contacts;
}

/* -------------------------------- route ----------------------------- */

/**
 * POST /api/enrich
 * body: { input: string }
 * returns: { ok, data: { company, contacts[], outreachDraft?, _meta: { model, duration_ms } } }
 */
router.post("/", async (req, res) => {
  const started = Date.now();
  const input = cleanStr(req.body?.input);

  if (!input) {
    return res.status(400).json({ ok: false, error: "input required" });
  }

  try {
    // 1) Provider / LLM
    const aiResp = await aiEnrichFromInput(input);

    // 2) Normalize fields
    const company = companyFromAI(aiResp);
    const contactsRaw = Array.isArray(aiResp?.contacts) ? aiResp.contacts : [];
    const contacts = contactsRaw.map(contactFromAI);

    // 3) Email enrichment
    await enrichEmailsForContacts(company, contacts);

    // 4) Meta
    const duration_ms = Date.now() - started;
    const model =
      aiResp?.model ||
      aiResp?.meta?.llm ||
      OPENAI_MODEL;

    const payload = {
      company,
      contacts,
      outreachDraft: cleanStr(aiResp?.outreachDraft) || null,
      _meta: {
        model,
        duration_ms,
      },
    };

    return res.json({ ok: true, data: payload });
  } catch (e) {
    const duration_ms = Date.now() - started;
    return res.status(500).json({
      ok: false,
      error: e?.message || "enrichment failed",
      _meta: { model: OPENAI_MODEL, duration_ms },
    });
  }
});

export default router;
