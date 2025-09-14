import express from "express";
import { aiEnrichFromInput } from "../utils/ai.js";
import {
  detectEmailPattern,
  generateEmail,
  generateCandidates,
} from "../utils/emailPatterns.js";
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

const SMTP_VERIFY_MAX = Math.max(
  0,
  Number(process.env.SMTP_VERIFY_MAX || 3)
);

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
    // not a URL, try raw domain
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(u))) return String(u).toLowerCase();
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
    // best-effort locations array if present
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
 * Infer domain → pattern → guessed emails for contacts without email.
 * Optionally verify a limited number of guesses with SMTP providers.
 */
async function enrichEmailsForContacts(company, contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return contacts;

  const domain =
    extractDomainFromUrl(company?.website) ||
    extractDomainFromUrl(company?.linkedin) ||
    null;

  if (!domain) return contacts;

  // If any real emails exist, use them as seeds
  const seedEmails = contacts
    .map((c) => c?.email)
    .filter(Boolean)
    .map(String);

  // Try cache first
  let pattern = await getDomainPattern(domain);

  // If no cached pattern, try to detect from seeds
  if (!pattern && seedEmails.length) {
    pattern = detectEmailPattern(domain, seedEmails) || null;
    if (pattern) {
      await setDomainPattern(domain, pattern);
    }
  }

  // If still no pattern, propose candidates using names and pick the most consistent
  if (!pattern) {
    const namePairs = contacts
      .map((c) => {
        const n = String(c?.name || "").trim();
        if (!n) return null;
        const parts = n.split(/\s+/);
        return { first: parts[0] || "", last: parts.slice(1).join("") || "" };
      })
      .filter(Boolean);

    const candidates = generateCandidates(domain, namePairs);
    // Heuristic: pick the candidate format that appears most frequently/validly forms emails
    if (candidates?.length) {
      pattern = candidates[0]?.pattern || null; // utils should prefer by score
      if (pattern) {
        await setDomainPattern(domain, pattern);
      }
    }
  }

  // Assign guessed emails when missing
  let verifyCount = 0;
  for (const c of contacts) {
    if (!c) continue;

    // if already have a verified email, mark status and continue
    if (c.email) {
      c.email_status = c.email_status || "validated"; // treat provided as validated (or leave as-is)
      continue;
    }

    if (!pattern || !c.name) {
      // Unable to guess confidently
      if (!c.email_guess) c.email_status = c.email_status || "unknown";
      continue;
    }

    // derive first/last
    const parts = String(c.name).trim().split(/\s+/);
    const first = parts[0] || "";
    const last = parts.slice(1).join("") || "";

    const guess = generateEmail({ first, last }, pattern, domain);
    if (guess) {
      c.email_guess = c.email_guess || guess;
      c.email_status = c.email_status || "patterned";
    }

    // optional SMTP verification with rate-limit per request
    if (
      SMTP_VERIFY_ENABLED &&
      verifyCount < SMTP_VERIFY_MAX &&
      c.email_status !== "validated" &&
      c.email_guess
    ) {
      try {
        const vr = await verifyEmail(c.email_guess);
        // normalize verify result
        if (vr?.status === "valid" || vr?.result === "valid") {
          c.email = c.email_guess;
          c.email_status = "validated";
        } else if (vr?.status === "invalid" || vr?.result === "invalid") {
          c.email_status = "bounced";
        } else {
          // unknown / catch-all / unverifiable
          c.email_status = c.email_status || "patterned";
        }
      } catch {
        // swallow verification errors; keep guess as patterned
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
    // 1) Call LLM / provider
    const aiResp = await aiEnrichFromInput(input);

    // aiResp is expected to include { company, contacts, outreachDraft, model? }
    const company = companyFromAI(aiResp);
    const contactsRaw = Array.isArray(aiResp?.contacts) ? aiResp.contacts : [];
    const contacts = contactsRaw.map(contactFromAI);

    // 2) Email enrichment (pattern, guess, optional verify)
    await enrichEmailsForContacts(company, contacts);

    // 3) Response meta
    const duration_ms = Date.now() - started;
    const model = aiResp?.model || OPENAI_MODEL;

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
    return res
      .status(500)
      .json({
        ok: false,
        error: e?.message || "enrichment failed",
        _meta: { model: OPENAI_MODEL, duration_ms },
      });
  }
});

export default router;
