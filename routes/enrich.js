// routes/enrich.js
// POST /api/enrich  { input: string }
//
// Pipeline:
// 1) LLM shapes company + seed contacts (existing utils/ai.js)
// 2) Apollo people search (real humans only, HR/Finance/Admin)
// 3) Email pattern guess (+ optional SMTP verify & cache per domain)
// 4) Merge, score explainability, return

import express from "express";
import { aiEnrichFromInput } from "../utils/ai.js";
import {
  detectEmailPattern,
  generateEmail,
  generateCandidates,
} from "../utils/emailPatterns.js";
import { verifyEmail } from "../utils/emailVerify.js";
import { getDomainPattern, setDomainPattern } from "../utils/patternCache.js";
import { searchPeopleForCompany } from "../utils/providers/apollo.js";
import { verifyJwt } from "../utils/jwt.js";

const router = express.Router();

// --- simple auth guard (JWT in Authorization: Bearer <token>) ---
router.use(async (req, res, next) => {
  try {
    const h = req.headers.authorization || "";
    const tok = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!tok) return res.status(401).json({ ok: false, error: "unauthorized" });
    const u = await verifyJwt(tok);
    req.user = u;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
});

function titleCase(s) {
  if (!s) return s;
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}

function normalizeCompany(c = {}) {
  const name = titleCase(c.name || "");
  const out = {
    name,
    website: c.website || c.website_url || null,
    linkedin: c.linkedin || c.linkedin_url || null,
    hq: c.hq || c.locations?.[0] || null,
    locations: c.locations || (c.hq ? [c.hq] : []),
    industry: c.industry || null,
    size: c.size || null,
    type: c.type || null,
    notes: c.notes || null,
  };
  return out;
}

function onlyRealPeople(list = []) {
  const genericRe = /\b(hr|careers|info|support|admin|payroll|jobs|hello|contact)\b/i;
  return list.filter((p) => {
    const nm = (p.name || "").trim();
    if (!nm || nm.split(" ").length < 2) return false; // require firstname lastname
    // discard obvious generic titles without a person
    const em = (p.email || "").toLowerCase();
    if (em && genericRe.test(em)) return false;
    return true;
  });
}

async function guessAndVerifyEmails(people, domain) {
  if (!domain) return people;

  // 1) Get/calc pattern for domain
  let pattern = await getDomainPattern(domain);
  if (!pattern) {
    pattern = await detectEmailPattern({ domain });
    if (pattern) await setDomainPattern(domain, pattern);
  }

  const enableSMTP = String(process.env.SMTP_VERIFY_ENABLED || "false").toLowerCase() === "true";
  const smtpMax = Number(process.env.SMTP_VERIFY_MAX || 3);

  let verifiedCount = 0;

  // 2) fill emails
  const out = [];
  for (const p of people) {
    let email = p.email || null;
    let status = p.email_status || "unknown";

    if (!email && pattern) {
      email = generateEmail({
        first: p.first_name || (p.name || "").split(" ")[0],
        last: p.last_name || (p.name || "").split(" ").slice(1).join(" "),
        domain,
        pattern,
      });
      status = "patterned";
    }

    if (!email && !pattern) {
      const cands = generateCandidates({
        first: p.first_name || (p.name || "").split(" ")[0],
        last: p.last_name || (p.name || "").split(" ").slice(1).join(" "),
        domain,
      });
      email = cands[0] || null;
      status = email ? "guessed" : "unknown";
    }

    // 3) optional SMTP verify (rate limited)
    if (email && enableSMTP && verifiedCount < smtpMax) {
      try {
        const ok = await verifyEmail(email);
        status = ok ? "validated" : "invalid";
      } catch {
        // ignore verify errors
      } finally {
        verifiedCount += 1;
      }
    }

    out.push({ ...p, email, email_status: status });
  }
  return out;
}

function scoreExplainability(company, people) {
  const bullets = [];
  let score = 50; // base

  // HQ / presence
  if (company?.hq?.toLowerCase?.().includes("abu dhabi") || company?.locations?.some((x) => /uae|abu dhabi|dubai/i.test(x))) {
    bullets.push({ k: "UAE HQ/Presence", delta: +10, note: company.hq || company.locations?.join(", ") });
    score += 10;
  }

  // industry keyword nudge
  if (company?.industry) {
    bullets.push({ k: "Industry fit", delta: +4, note: company.industry });
    score += 4;
  }

  // decision makers found
  if (people.length >= 1) {
    bullets.push({ k: "Decision makers found", delta: +6, note: `${people.length} contacts` });
    score += 6;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons: bullets,
  };
}

router.post("/", async (req, res) => {
  const t0 = Date.now();
  try {
    const input = String(req.body?.input || "").trim();
    if (!input) return res.status(400).json({ ok: false, error: "input required" });

    // 1) LLM shaping (company + seed contacts)
    const shaped = await aiEnrichFromInput(input);
    const company = normalizeCompany(shaped?.company || {});
    const llmMeta = shaped?.meta || {};

    // 2) Apollo people (real humans; UAE HR/Finance/Admin)
    const domainFromUrl = (company.website || "").replace(/^https?:\/\//, "").split("/")[0] || null;
    const { people: apolloPeople, meta: apolloMeta } = await searchPeopleForCompany({
      companyDomain: domainFromUrl || null,
      companyName: company.name || null,
      region: "United Arab Emirates",
      perPage: 25,
    });

    // 3) Merge contacts (Apollo + LLM seeds), keep real people only
    const merged = mergeContacts(onlyRealPeople(apolloPeople), onlyRealPeople(shaped?.contacts || []));

    // 4) Email guess + optional SMTP verify
    const contactsWithEmail = await guessAndVerifyEmails(merged, domainFromUrl);

    // 5) Explainability for quality score
    const quality = scoreExplainability(company, contactsWithEmail);

    // 6) Respond
    const duration_ms = Date.now() - t0;
    return res.json({
      ok: true,
      data: {
        company,
        contacts: contactsWithEmail,
        outreachDraft: shaped?.outreachDraft || "",
        tags: shaped?.tags || [],
        score: quality.score,
        quality_reasons: quality.reasons, // front-end shows these bullets
        meta: {
          used: true,
          llm: "openai",
          model: llmMeta?.model || (process.env.OPENAI_MODEL || "gpt-4o-mini"),
          duration_ms,
          providers: {
            apollo: apolloMeta,
          },
        },
      },
    });
  } catch (err) {
    const msg = err?.message || "enrichment failed";
    if (process.env.UPR_LOG_PROVIDERS === "true") {
      // eslint-disable-next-line no-console
      console.error("[/api/enrich] error:", msg, err?.status || "", err?.body ? JSON.stringify(err.body).slice(0, 500) : "");
    }
    return res.status(500).json({ ok: false, error: msg });
  }
});

function mergeContacts(apollo = [], seed = []) {
  const all = [...apollo, ...seed];
  const byKey = new Map();
  for (const c of all) {
    const key = `${(c.name || "").toLowerCase()}|${(c.title || "").toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  return Array.from(byKey.values());
}

export default router;
