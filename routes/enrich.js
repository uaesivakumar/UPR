import express from "express";
import { aiEnrichFromInput } from "../utils/ai.js";
import { detectPattern, generateEmail, generateCandidates } from "../utils/emailPatterns.js";
import { verifyEmail } from "../utils/emailVerify.js";
import { getDomainPattern, setDomainPattern } from "../utils/patternCache.js";
import { fetchContactsFromProviders } from "../utils/providers/sourcing.js";

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
const ROLE_ONLY_NAME = /^(hr|ta|talent|recruit(ment|er)?|people|payroll|finance|accounts|admin|office|operations|onboarding)\s*(head|lead|manager|director|specialist|officer)?$/i;

function cleanStr(s) { if (!s) return null; const t = String(s).trim(); return t.length ? t : null; }
function titleCase(s) { if (!s) return s; return String(s).toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase()); }
function normalizeUrl(u) { if (!u) return null; const s = String(u).trim(); if (!s) return null; if (/^https?:\/\//i.test(s)) return s; return `https://${s}`; }
function extractDomainFromUrl(u) { try { const url = new URL(u); return url.hostname; } catch { const s = String(u || "").trim().toLowerCase(); if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return s; return null; } }

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
function isRealPersonName(name) {
  const n = cleanStr(name);
  if (!n) return false;
  if (ROLE_ONLY_NAME.test(n)) return false;
  return /\s/.test(n) && n.split(/\s+/).some((p) => p.length >= 2);
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

    if (c.email) {
      if (/^.+@.+$/.test(c.email) && !GENERIC_MAILBOX.test(String(c.email).toLowerCase())) {
        c.email_status = c.email_status || "validated";
        continue;
      } else {
        c.email = null;
        c.email_status = "generic";
      }
    }

    if (!isRealPersonName(c.name)) { c.email_status = c.email_status || "unknown"; continue; }

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

    if (SMTP_VERIFY_ENABLED && verifyCount < SMTP_VERIFY_MAX && c.email_status !== "validated" && c.email_guess) {
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
      } finally { verifyCount += 1; }
    }
  }

  return contacts.filter((c) => isRealPersonName(c?.name) && !(GENERIC_MAILBOX.test(String((c?.email || c?.email_guess || "")).toLowerCase())));
}

/** Simple quality fallback if provider doesn't return one. */
function computeQuality(company, contacts, tags = []) {
  let score = 50;
  const factors = [];
  if (company?.hq && /united arab emirates|dubai|abu dhabi/i.test(company.hq)) { score += 10; factors.push({ label: "UAE HQ/Presence", impact: 10, detail: company.hq }); }
  if (company?.size && /10,?000\+|5000\+|enterprise|group/i.test(company.size)) { score += 8; factors.push({ label: "Enterprise size", impact: 8, detail: company.size }); }
  if (Array.isArray(tags) && tags.some((t) => /hiring|expansion|new office|contract/i.test(t))) { score += 7; factors.push({ label: "Recent hiring/expansion signal", impact: 7 }); }
  if (Array.isArray(contacts) && contacts.length >= 3) { score += 6; factors.push({ label: "Decision makers found", impact: 6, detail: `${contacts.length} contacts` }); }
  if (company?.industry) { score += 4; factors.push({ label: "Industry fit", impact: 4, detail: company.industry }); }
  score = Math.max(0, Math.min(100, score));
  return { score, factors };
}

/* -------------------------------- route ----------------------------- */
router.post("/", async (req, res) => {
  const started = Date.now();
  const input = cleanStr(req.body?.input);
  const departments = Array.isArray(req.body?.departments) ? req.body.departments : ["hr","hrbp","ta","payroll","finance","admin","office_admin","onboarding"];
  if (!input) return res.status(400).json({ ok: false, error: "input required" });

  try {
    // 1) LLM → company normalization + seed contacts (may include placeholders)
    const aiResp = await aiEnrichFromInput(input, { departments });

    const company = companyFromAI(aiResp);
    const contactsRaw = Array.isArray(aiResp?.contacts) ? aiResp.contacts : [];
    let contacts = contactsRaw.map(contactFromAI).filter((c) => isRealPersonName(c?.name));

    // 2) Provider fallback (Apollo) if too few real people
    if (!contacts || contacts.length < 2) {
      const fromProviders = await fetchContactsFromProviders({ company, departments, min: 3 });
      if (Array.isArray(fromProviders) && fromProviders.length) {
        contacts = [...contacts, ...fromProviders];
      }
      // Dedup by name
      const seen = new Set();
      contacts = contacts.filter((c) => {
        const k = (c.name || "").toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    // 3) Email enrichment (pattern + optional SMTP)
    contacts = await enrichEmailsForContacts(company, contacts);

    // 4) Quality
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
