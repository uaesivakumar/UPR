// routes/enrich.js
import express from "express";
import { aiEnrichFromInput } from "../utils/ai.js";
import { normalizeDomain, includesNormalized } from "../utils/normalize.js";
import { apolloMixedPeopleSearch } from "../utils/apollo.js";
import { detectPattern, generateCandidates } from "../utils/emailPatterns.js";
import { getDomainPattern, setDomainPattern } from "../utils/patternCache.js";
import { verifyEmail } from "../utils/emailVerify.js";

const router = express.Router();

/**
 * Helpers
 */
function pickCompanyMeta(ai) {
  const c = ai?.company || {};
  const website = c.website || c.website_url || null;
  const domain = normalizeDomain(website || c.domain || null);
  const name = c.name || ai?.companyName || null;
  return {
    name,
    website,
    domain,
    linkedin: c.linkedin || c.linkedin_url || null,
    hq: c.hq || c.location || null,
    industry: c.industry || null,
    size: c.size || null,
    notes: c.notes || null,
  };
}

function currentAtOrg(person, { domain, name }) {
  // 1) Prefer exact current employment history flag
  const eh = Array.isArray(person.employment_history) ? person.employment_history : [];
  const curr = eh.find((e) => e?.current) || null;

  // If Apollo attaches top-level "organization" for current employment:
  const org = person.organization || {};

  const domainMatch =
    (org?.primary_domain && domain && org.primary_domain.toLowerCase() === domain.toLowerCase()) ||
    false;

  const nameMatch =
    (org?.name && name && includesNormalized(org.name, name)) ||
    (curr?.organization_name && name && includesNormalized(curr.organization_name, name)) ||
    false;

  return Boolean(curr && (domain ? domainMatch : nameMatch));
}

function cleanEmailStatus(raw) {
  const v = (raw || "").toLowerCase();
  // Apollo often returns "verified" while email is locked; treat as unknown until truly verified by us
  if (v === "verified" || v === "valid") return "unlocked_required";
  return v || "unknown";
}

function qualityExplain(company, contacts) {
  const items = [];
  const scoreParts = [];

  if (company.hq && includesNormalized(company.hq, "uae")) {
    items.push({ label: "UAE HQ/Presence", delta: +10, detail: company.hq });
    scoreParts.push(10);
  }
  if (company.industry) {
    items.push({ label: "Industry fit", delta: +4, detail: company.industry });
    scoreParts.push(4);
  }
  if (contacts.length > 0) {
    items.push({ label: "Decision makers found", delta: +6, detail: `${contacts.length} contacts` });
    scoreParts.push(6);
  }
  const score = scoreParts.reduce((a, b) => a + b, 0);
  return { items, score };
}

/**
 * POST /api/enrich
 * body: { input: string }
 */
router.post("/", async (req, res) => {
  const t0 = Date.now();
  try {
    const input = String(req.body?.input || "").trim();
    if (!input) return res.status(400).json({ ok: false, error: "input required" });

    // 1) LLM shaping
    const ai = await aiEnrichFromInput(input);
    const company = pickCompanyMeta(ai);

    // 2) Apollo — strictly bind to this company (domain preferred)
    const titles = [
      "human resources", "hr", "talent acquisition", "recruiter",
      "payroll", "finance", "office admin", "admin manager", "onboarding",
      "people operations",
    ];
    const people = await apolloMixedPeopleSearch({
      domain: company.domain,
      orgName: company.name,
      locations: ["United Arab Emirates", "UAE", "Abu Dhabi", "Dubai", "Sharjah"],
      titles,
      page: 1,
      perPage: 25,
    });

    // 3) Post-filter: must be CURRENTLY at the org
    const filtered = people.filter((p) => currentAtOrg(p, { domain: company.domain, name: company.name }));

    // 4) Map → contacts
    const contacts = [];
    for (const p of filtered) {
      const first = p.first_name || "";
      const last = p.last_name || "";
      const full = `${first} ${last}`.trim();
      const linkedIn = p.linkedin_url || null;

      // Apollo often masks emails; we only trust our own checks
      let email = null;
      let email_status = cleanEmailStatus(p.email_status); // "unlocked_required" or "unknown"
      let accuracy = 0.7;

      // If you’ve collected patterns per-domain, reuse them
      const cachedPattern = await getDomainPattern(company.domain);
      let email_guess = null;

      if (!email) {
        // create candidates
        const candidates = generateCandidates({ first, last, domain: company.domain, max: 3 });
        if (cachedPattern) {
          const best = candidates.find((c) => c.pattern === cachedPattern) || candidates[0];
          email_guess = best?.email || null;
        } else {
          email_guess = candidates[0]?.email || null;
        }
        email_status = email_guess ? "patterned" : email_status;
      }

      // Optional SMTP verification (respect your env flags/rate limits)
      let smtp_status = null;
      if (process.env.SMTP_VERIFY_ENABLED === "true" && email_guess) {
        try {
          const vr = await verifyEmail(email_guess);
          smtp_status = vr?.status || null; // e.g., "valid" | "invalid" | "catch_all" | "unknown"
          if (vr?.pattern && !cachedPattern) await setDomainPattern(company.domain, vr.pattern);
          if (vr?.ok) {
            email = email_guess;
            email_status = "validated";
            accuracy = 0.9;
          } else if (vr?.status === "invalid") {
            email_status = "bounced";
          }
        } catch {
          // ignore verifier failures
        }
      }

      contacts.push({
        id: p.id,
        name: full || null,
        title: p.title || null,
        dept: (p.departments?.[0] || "").replace(/^master_/, "") || null,
        linkedin: linkedIn,
        confidence: accuracy,
        email,
        email_guess,
        email_status,
        why: {
          matched_domain: p.organization?.primary_domain || null,
          matched_name: p.organization?.name || null,
          current: true,
          source: "apollo",
        },
      });
    }

    // 5) Quality & meta
    const q = qualityExplain(company, contacts);
    const duration_ms = Date.now() - t0;

    return res.json({
      ok: true,
      data: {
        company,
        contacts,
        score: q.score,
        explanation: q.items,
        meta: { used: true, llm: "openai", model: ai?.meta?.model || "gpt-4o-mini", duration_ms },
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "enrichment failed" });
  }
});

export default router;
