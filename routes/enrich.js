// routes/enrich.js
import express from "express";
import { nanoid } from "nanoid";

import { pool } from "../utils/db.js";
import {
  scoreCandidate,
  bucketRole,
  bucketSeniority,
  isAgencyRecruiter,
} from "../utils/patternHelpers.js";
import {
  inferPatternFromSamples,
  applyPattern,
  loadPatternFromCache,
  savePatternToCache,
} from "../utils/emailPatterns.js";
import { verifyEmail } from "../utils/emailVerify.js";

const router = express.Router();

// In-memory job store (MVP)
const jobs = new Map();

/**
 * GET /api/enrich/mock?q=Company+Name
 * Lightweight mock enrichment to test the UI without needing a company_id.
 * NOTE: This MUST be registered BEFORE the "/:job_id" route to avoid being captured as a param.
 */
router.get("/mock", async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "q is required" });
  const domain = q.toLowerCase().replace(/\s+/g, "") + ".com";

  const results = [
    {
      name: "Jane Doe",
      designation: "HR Manager",
      linkedin_url: `https://www.linkedin.com/in/jane-doe-hr-${Math.floor(Math.random()*9000+1000)}/`,
      email: `jane.doe@${domain}`,
      email_status: "valid",
      email_reason: "mock",
      role_bucket: "hr",
      seniority: "manager",
      source: "mock",
      confidence: 0.92
    },
    {
      name: "John Smith",
      designation: "Head of People",
      linkedin_url: `https://www.linkedin.com/in/john-smith-people-${Math.floor(Math.random()*9000+1000)}/`,
      email: `john.smith@${domain}`,
      email_status: "accept_all",
      email_reason: "mock",
      role_bucket: "hr",
      seniority: "head",
      source: "mock",
      confidence: 0.88
    }
  ];

  return res.json({
    status: "completed",
    company_id: null,
    results,
    summary: {
      total_candidates: results.length,
      kept: results.length,
      pattern_used: "first.last@" + domain,
      verification_provider: "mock"
    }
  });
});

/**
 * POST /api/enrich
 * body: { company_id: string, max_contacts?: number, role?: "hr", geo?: "uae" }
 */
router.post("/", async (req, res) => {
  const { company_id, max_contacts = 3, role = "hr", geo = "uae" } = req.body || {};
  if (!company_id) return res.status(400).json({ error: "company_id is required" });

  const job_id = `enrich_${Date.now()}_${nanoid(6)}`;
  jobs.set(job_id, { status: "queued", company_id, results: [], summary: {} });

  try {
    const company = await getCompany(company_id);
    if (!company) {
      const payload = { job_id, status: "error", error: "company_not_found" };
      jobs.set(job_id, payload);
      return res.status(404).json(payload);
    }

    // Ensure domain
    if (!company.domain && company.website_url) {
      try {
        const u = new URL(
          company.website_url.startsWith("http")
            ? company.website_url
            : `https://${company.website_url}`
        );
        company.domain = u.hostname.replace(/^www\./, "");
      } catch {}
    }

    // 1) Query provider (placeholder → returns [])
    const providerCandidates = await queryPrimaryProvider({
      company,
      role,
      geo,
      limit: max_contacts,
    });

    // 2) Learn pattern from provider samples (if possible)
    let learnedPattern = null;
    const samples = providerCandidates
      .filter((c) => c.email && c.first_name && c.last_name)
      .map((c) => ({ name: `${c.first_name} ${c.last_name}`, email: c.email }));

    if (samples.length >= 2 && company.domain) {
      learnedPattern = inferPatternFromSamples(samples, company.domain);
      if (learnedPattern?.pattern && learnedPattern.confidence >= 0.7) {
        await savePatternToCache(
          pool,
          company.domain,
          learnedPattern.pattern,
          samples[0]?.email,
          learnedPattern.confidence
        );
      }
    }

    // 3) Load known/cached pattern
    let pattern = null;
    if (company.email_pattern && (company.pattern_confidence ?? 0) >= 0.7) {
      pattern = {
        pattern: company.email_pattern,
        confidence: Number(company.pattern_confidence) || 0,
      };
    } else if (company.domain) {
      const cached = await loadPatternFromCache(pool, company.domain);
      if (cached) pattern = cached;
    }
    if (!pattern && learnedPattern) pattern = learnedPattern;

    // 4) Normalize candidates
    let candidates = normalizeCandidates(providerCandidates, company);

    // 5) Role + seniority + exclude agencies
    candidates = candidates
      .map((c) => ({
        ...c,
        role_bucket: bucketRole(c.designation || ""),
        seniority: bucketSeniority(c.designation || ""),
      }))
      .filter((c) => c.role_bucket === "hr" && !isAgencyRecruiter(c));

    // 6) Pattern-guess emails if missing
    if (company.domain && pattern?.pattern) {
      candidates = candidates.map((c) => {
        if (!c.email && c.first_name && c.last_name) {
          c.email = applyPattern(c.first_name, c.last_name, pattern.pattern, company.domain);
          c.email_status = "patterned";
          c.email_reason = "pattern_guess";
        }
        return c;
      });
    }

    // 7) Verify emails
    for (const c of candidates) {
      if (!c.email) continue;
      const v = await verifyEmail(c.email);
      c.email_status = v.status; // 'valid'|'accept_all'|'unknown'|'invalid'|'bounced'
      c.email_reason = v.reason || c.email_reason;
    }

    // 8) Score and pick top N (unique emails)
    candidates = candidates.map((c) => ({
      ...c,
      confidence: scoreCandidate({
        role_bucket: c.role_bucket,
        seniority: c.seniority,
        geo_fit: c.geo_fit ?? 1.0,
        email_status: c.email_status,
        company_match: 1.0,
      }),
    }));
    candidates.sort((a, b) => b.confidence - a.confidence);

    const seen = new Set();
    const kept = [];
    for (const c of candidates) {
      if (!c.email || seen.has(c.email)) continue;
      if (kept.length < max_contacts && c.confidence >= 0.6) {
        kept.push(c);
        seen.add(c.email);
      }
    }

    // 9) Persist to hr_leads if table exists (best-effort)
    const saved = [];
    for (const c of kept) {
      try {
        const row = await upsertHrLead(company_id, c);
        saved.push(row);
      } catch (e) {
        if (String(e?.code) !== "42P01") console.error("hr_leads upsert error:", e);
      }
    }
    const primary = saved[0]?.id || null;

    const result = {
      status: "completed",
      company_id,
      results: kept.map((c) => ({
        name: c.name,
        designation: c.designation,
        linkedin_url: c.linkedin_url,
        email: c.email,
        email_status: c.email_status,
        confidence: c.confidence,
        role_bucket: c.role_bucket,
        seniority: c.seniority,
        source: c.source || "provider_or_pattern",
        email_reason: c.email_reason,
      })),
      summary: { found: candidates.length, kept: kept.length, primary_contact_id: primary },
    };

    jobs.set(job_id, result);
    return res.status(202).json({ job_id, ...result });
  } catch (err) {
    console.error("enrich job error:", err);
    const payload = { job_id, status: "error", error: "exception" };
    jobs.set(job_id, payload);
    return res.status(500).json(payload);
  }
});

/**
 * GET /api/enrich/:job_id
 */
router.get("/:job_id", (req, res) => {
  const job = jobs.get(req.params.job_id);
  if (!job) return res.status(404).json({ error: "job_not_found" });
  return res.json(job);
});

export default router;

// ---------- helpers ----------
async function getCompany(company_id) {
  const q = `
    SELECT id, name, website_url, domain, email_pattern, pattern_confidence
    FROM targeted_companies
    WHERE id = $1
    LIMIT 1
  `;
  try {
    const { rows } = await pool.query(q, [company_id]);
    return rows[0];
  } catch (e) {
    if (String(e?.code) === "42P01") return null;
    throw e;
  }
}

function normalizeCandidates(providerCandidates, company) {
  return (providerCandidates || []).map((p) => ({
    source: p.source || "provider",
    name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.name || "",
    first_name: p.first_name || guessFirst(p.name),
    last_name: p.last_name || guessLast(p.name),
    designation: p.title || p.designation || "",
    linkedin_url: p.linkedin || p.linkedin_url || "",
    email: p.email || null,
    email_status: p.email ? "provider" : "unknown",
    email_reason: p.email ? "provider_supplied" : undefined,
    company_name: company?.name,
    geo_fit: 1.0,
  }));
}

function guessFirst(name = "") {
  const parts = name.trim().split(/\s+/);
  return parts[0] || "";
}
function guessLast(name = "") {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

async function upsertHrLead(company_id, c) {
  const q = `
    INSERT INTO hr_leads
      (company_id, name, designation, linkedin_url, email, email_status, lead_status,
       source, confidence, role_bucket, seniority, email_reason)
    VALUES
      ($1,$2,$3,$4,$5,$6,'New',$7,$8,$9,$10,$11)
    ON CONFLICT (company_id, email)
    DO UPDATE SET
      designation = EXCLUDED.designation,
      linkedin_url = EXCLUDED.linkedin_url,
      email_status = EXCLUDED.email_status,
      source = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      role_bucket = EXCLUDED.role_bucket,
      seniority = EXCLUDED.seniority,
      email_reason = EXCLUDED.email_reason
    RETURNING id, company_id, email, confidence
  `;
  const vals = [
    company_id,
    c.name || "",
    c.designation || "",
    c.linkedin_url || "",
    c.email || null,
    c.email_status || "unknown",
    c.source || "provider_or_pattern",
    c.confidence ?? null,
    c.role_bucket || null,
    c.seniority || null,
    c.email_reason || null,
  ];
  const { rows } = await pool.query(q, vals);
  return rows[0];
}

// TODO: Wire Apollo/Clearbit/PDL here
async function queryPrimaryProvider() {
  return [];
}
