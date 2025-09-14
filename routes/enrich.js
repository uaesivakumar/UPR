import express from "express";
import { aiEnrichFromInput } from "../utils/ai.js";
import { detectPattern, generateEmail, generateCandidates } from "../utils/emailPatterns.js";
import { verifyEmail } from "../utils/emailVerify.js";
import { getDomainPattern, setDomainPattern } from "../utils/patternCache.js";

const router = express.Router();

const OPENAI_MODEL =
  process.env.OPENAI_MODEL ||
  process.env.VITE_OPENAI_MODEL ||
  "gpt-4o-mini";

const SMTP_VERIFY_ENABLED =
  (process.env.SMTP_VERIFY_ENABLED || "false").toLowerCase() === "true";

const SMTP_VERIFY_MAX = Math.max(0, Number(process.env.SMTP_VERIFY_MAX || 3));

/* ------------------------------ helpers ----------------------------- */
const GENERIC_MAILBOX = /^(info|contact|admin|office|hello|support|careers|jobs|hr|payroll|finance|accounts|team|help|sales|pr|media|press|recruitment|talent|onboarding|noreply|no-reply)@/i;

function cleanStr(s) { if (!s) return null; const t = String(s).trim(); return t.length ? t : null; }
function titleCase(s) { if (!s) return s; return String(s).toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase()); }
function normalizeUrl(u) { if (!u) return null; const s = String(u).trim(); if (!s) return null; if (/^https?:\/\//i.test(s)) return s; return `https://${s}`; }
function extractDomainFromUrl(u) {
  try { const url = new URL(u); return url.hostname; }
  catch { const s = String(u || "").trim().toLowerCase(); if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return s; return null; }
}

function companyFromAI(raw) {
  const c = raw?.company || raw?.data?.company || raw || {};
  return {
    name: cleanStr(c.name) ? titleCase(c.name) : null,
    website: normalizeUrl(c.website ?? c.website_url),
    linkedin: normalizeUrl(c.linkedin ?? c.linkedin_url),
    hq: cleanStr(c.hq) || cleanStr(c.location) || null,
    industry: cleanStr(c.industry) || null,
    size: cleanStr(c.size) || null,
    type: cleanStr(c.type) || null,
    notes: cleanStr(c.notes) || null,
    locations: Array.isArray(c.locations) ? c.locations.filter(Boolean) : c.hq ? [c.hq] : [],
  };
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
function seedPairs(contacts) {
  if (!Array.isArray(contacts)) return [];
  return contacts
    .map((c) => ({ name: cleanStr(c?.name) || null, email: cleanStr(c?.email) || null }))
    .filter((p) => p.name && p.email && p.email.includes("@") && !GENERIC_MAILBOX.test(p.email));
}

/** Guess/verify emails for contacts that lack a real email (skip generic mailboxes). */
async function enrichEmailsForContacts(company, contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return contacts;

  const domain =
    extractDomainFromUrl(company?.website) ||
    extractDomainFromUrl(company?.linkedin) ||
    null;

  // If no domain → mark unknown if missing
  if (!domain) {
    for (const c of contacts) {
      if (!c?.email && !c?.email_guess) c.email_status = c.email_status || "unknown";
    }
    return contacts;
  }

  const cached = await getDomainPattern(domain);
  let pattern_id = cached?.pattern_id || null;

  if (!pattern_id) {
    const pairs = seedPairs(contacts);
    const detected = detectPattern(pairs);
    if (detected) {
      pattern_id = detected;
      await setDomainPattern({ domain, pattern_id, source: "detectPattern(seeds)", example: pairs[0]?.email || null });
    }
  }

  let verifyCount = 0;
  for (const c of contacts) {
    if (!c) continue;

    // keep provided emails if they are not generic mailboxes
    if (c.email) {
      if (GENERIC_MAILBOX.test(String(c.email).toLowerCase())) {
        c.email_status = "generic";
        c.email = null;
      } else {
        c.email_status = c.email_status || "validated";
        continue;
      }
    }

    // Need a person name to generate anything
    if (!c.name) { c.email_status = c.email_status || "unknown"; continue; }

    let guess = null;
    if (pattern_id) {
      guess = generateEmail(c.name, domain, pattern_id);
    } else {
      const cand = generateCandidates(c.name, domain, 1);
      if (Array.isArray(cand) && cand.length) {
        pattern_id = cand[0]?.pattern_id || pattern_id;
        guess = cand[0]?.email || null;
        if (cand[0]?.pattern_id) {
          await setDomainPattern({ domain, pattern_id: cand[0].pattern_id, source: "generateCandidates(fallback)", example: guess });
        }
      }
    }

    if (guess && !GENERIC_MAILBOX.test(String(guess).toLowerCase())) {
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
          await setDomainPattern({ domain, pattern_id, source: "smtp-verify", example: c.email, incrementVerified: true });
        } else if (vr?.status === "invalid") {
          c.email_status = "bounced";
        } else {
          c.email_status = c.email_status || "patterned";
        }
      } catch {
        c.email_status = c.email_status || "patterned";
      } finally {
        verifyCount += 1;
      }
    }
  }

  // Final pass: drop rows that are still generic/named-missing
  return contacts.filter((c) => {
    const hasName = !!cleanStr(c?.name);
    const useEmail = c?.email || c?.email_guess;
    const isGeneric = GENERIC_MAILBOX.test(String(useEmail || "").toLowerCase());
    return hasName && !isGeneric;
  });
}

/** Simple quality fallback if provider doesn't return one. */
function computeQuality(company, contacts, tags = []) {
  let score = 50;
  const factors = [];
  if (company?.hq && /united arab emirates|dubai|abu dhabi/i.test(company.hq)) {
    score += 10; factors.push({ label: "UAE HQ/Presence", impact: 10, detail: company.hq });
  }
  if (company?.size && /10,?000\+|5000\+|enterprise|group/i.test(company.size)) {
    score += 8; factors.push({ label: "Enterprise size", impact: 8, detail: company.size });
  }
  if (Array.isArray(tags) && tags.some((t) => /hiring|expansion|new office|contract/i.test(t))) {
    score += 7; factors.push({ label: "Recent hiring/expansion signal", impact: 7 });
  }
  if (Array.isArray(contacts) && contacts.length >= 3) {
    score += 6; factors.push({ label: "Decision makers found", impact: 6, detail: `${contacts.length} contacts` });
  }
  if (company?.industry) {
    score += 4; factors.push({ label: "Industry fit", impact: 4, detail: company.industry });
  }
  score = Math.max(0, Math.min(100, score));
  return { score, factors };
}

/* -------------------------------- route ----------------------------- */
/**
 * POST /api/enrich
 * body: { input: string, departments?: string[] }
 * returns: { ok, data: { company, contacts[], outreachDraft?, quality:{score,factors[]}, _meta:{ model, duration_ms } } }
 */
router.post("/", async (req, res) => {
  const started = Date.now();
  const input = cleanStr(req.body?.input);
  const departments = Array.isArray(req.body?.departments) ? req.body.departments : null;
  if (!input) return res.status(400).json({ ok: false, error: "input required" });

  try {
    const aiResp = await aiEnrichFromInput(input, { departments });

    const company = companyFromAI(aiResp);
    const contactsRaw = Array.isArray(aiResp?.contacts) ? aiResp.contacts : [];
    let contacts = contactsRaw.map(contactFromAI);

    // enrich emails & remove generic mailboxes / nameless rows
    contacts = await enrichEmailsForContacts(company, contacts);

    let quality = null;
    if (aiResp?.quality && typeof aiResp.quality.score === "number") {
      quality = { score: aiResp.quality.score, factors: Array.isArray(aiResp.quality.factors) ? aiResp.quality.factors : [] };
    } else {
      quality = computeQuality(company, contacts, Array.isArray(aiResp?.tags) ? aiResp.tags : []);
    }

    const duration_ms = Date.now() - started;
    const model = aiResp?.model || aiResp?.meta?.llm || OPENAI_MODEL;

    const payload = {
      company,
      contacts,
      outreachDraft: cleanStr(aiResp?.outreachDraft) || null,
      quality,
      tags: Array.isArray(aiResp?.tags) ? aiResp.tags : [],
      _meta: { model, duration_ms },
    };

    return res.json({ ok: true, data: payload });
  } catch (e) {
    const duration_ms = Date.now() - started;
    return res.status(500).json({ ok: false, error: e?.message || "enrichment failed", _meta: { model: OPENAI_MODEL, duration_ms } });
  }
});

export default router;
