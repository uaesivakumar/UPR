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

/* ------------------------------ ENV & consts ------------------------------ */
const APOLLO_API_KEY =
  process.env.APOLLO_API_KEY ||
  process.env.APOLLOIO_API_KEY ||
  process.env.APOLLO_TOKEN ||
  "";
const hasApollo = !!APOLLO_API_KEY;

const HR_TITLES = [
  "HR",
  "Human Resources",
  "People",
  "Talent",
  "Recruiting",
  "People Operations",
  "Head of People",
  "HR Manager",
  "HR Director",
];

/* ------------------------------ In-memory jobs ---------------------------- */
const jobs = new Map();

/* ------------------------------ tiny helpers ------------------------------ */

function makeMockFromText(q) {
  const domain = q.toLowerCase().replace(/\s+/g, "") + ".com";
  const results = [
    {
      name: "Jane Doe",
      designation: "HR Manager",
      linkedin_url: `https://www.linkedin.com/in/jane-doe-hr-${Math.floor(Math.random() * 9000 + 1000)}/`,
      email: `jane.doe@${domain}`,
      email_status: "valid",
      email_reason: "mock",
      role_bucket: "hr",
      seniority: "manager",
      source: "mock",
      confidence: 0.92,
    },
    {
      name: "John Smith",
      designation: "Head of People",
      linkedin_url: `https://www.linkedin.com/in/john-smith-people-${Math.floor(Math.random() * 9000 + 1000)}/`,
      email: `john.smith@${domain}`,
      email_status: "accept_all",
      email_reason: "mock",
      role_bucket: "hr",
      seniority: "head",
      source: "mock",
      confidence: 0.88,
    },
  ];
  return {
    status: "completed",
    company_id: null,
    results,
    summary: {
      total_candidates: results.length,
      kept: results.length,
      pattern_used: `first.last@${domain}`,
      verification_provider: "mock",
      provider: "mock",
    },
  };
}

function guessFirst(name = "") {
  const parts = name.trim().split(/\s+/);
  return parts[0] || "";
}
function guessLast(name = "") {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/* Ensure we never crash the UI: wrap any provider call, return [] on error. */
async function safeCall(fn, ...args) {
  try {
    const out = await fn(...args);
    return Array.isArray(out) ? out : [];
  } catch (e) {
    console.error("provider error:", e);
    return [];
  }
}

/* --------------------------- Free-text MOCK route ------------------------- */
/** Dev helper kept for local testing. */
router.get("/mock", async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "q is required" });
  return res.json(makeMockFromText(q));
});

/* ----------------------- Free-text provider SEARCH ------------------------ */
/**
 * GET /api/enrich/search?q=...
 * Uses Apollo when configured. **Never** returns 500 — falls back to mock.
 * Response shape: { ok: true, data: {status, results, summary:{provider}} }
 */
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "q is required" });

  let candidates = [];
  if (hasApollo) {
    candidates = await safeCall(apolloPeopleSearchByText, {
      q,
      limit: 5,
      geo: "United Arab Emirates",
      keywords: HR_TITLES.join(" OR "),
    });
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    const mock = makeMockFromText(q);
    return res.json({
      ok: true,
      data: mock,
      provider: hasApollo ? "apollo_fallback_to_mock" : "mock_only",
    });
  }

  const results = candidates.map((p) => ({
    name: p.name,
    designation: p.title,
    linkedin_url: p.linkedin_url,
    email: p.email ?? null,
    email_status: p.email ? "provider" : "unknown",
    email_reason: p.email ? "provider_supplied" : undefined,
    role_bucket: "hr",
    seniority: p.seniority || null,
    source: "apollo",
    confidence: 0.85,
  }));

  return res.json({
    ok: true,
    data: {
      status: "completed",
      company_id: null,
      results,
      summary: {
        total_candidates: results.length,
        kept: results.length,
        provider: "apollo",
      },
    },
  });
});

/* ------------------------ Company-selected ENRICH ------------------------- */
/**
 * POST /api/enrich
 * body: { company_id, max_contacts?:number, role?:'hr', geo?:'uae' }
 * Uses provider by company domain, then patterns + verifies + scores,
 * best-effort upserts into hr_leads (if table exists).
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

    // derive domain if only website is stored
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

    // 1) Provider candidates (Apollo by domain)
    let providerUsed = "none";
    let providerCandidates = [];
    if (hasApollo && company.domain) {
      providerCandidates = await safeCall(apolloPeopleSearchByDomain, {
        domain: company.domain,
        limit: max_contacts * 4,
        geo: "United Arab Emirates",
        keywords: HR_TITLES.join(" OR "),
      });
      providerUsed = providerCandidates.length ? "apollo" : "none";
    }

    // 2) Learn pattern if possible from provider samples
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

    // 3) Load cached/known pattern
    let pattern = null;
    if (company.email_pattern && (company.pattern_confidence ?? 0) >= 0.7) {
      pattern = { pattern: company.email_pattern, confidence: Number(company.pattern_confidence) || 0 };
    } else if (company.domain) {
      const cached = await loadPatternFromCache(pool, company.domain);
      if (cached) pattern = cached;
    }
    if (!pattern && learnedPattern) pattern = learnedPattern;

    // 4) Normalize, filter to HR, knock out agencies
    let candidates = (providerCandidates || []).map((p) => ({
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

    candidates = candidates
      .map((c) => ({
        ...c,
        role_bucket: bucketRole(c.designation || ""),
        seniority: bucketSeniority(c.designation || ""),
      }))
      .filter((c) => c.role_bucket === "hr" && !isAgencyRecruiter(c));

    // 5) Pattern emails if missing
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

    // 6) Verify
    for (const c of candidates) {
      if (!c.email) continue;
      const v = await verifyEmail(c.email);
      c.email_status = v.status;        // 'valid' | 'accept_all' | 'unknown' | 'invalid'
      c.email_reason = v.reason || c.email_reason;
    }

    // 7) Score + dedupe + top N
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

    // 8) Best-effort upsert
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
      summary: {
        found: candidates.length,
        kept: kept.length,
        primary_contact_id: primary,
        provider: providerUsed, // <-- surfaces 'apollo' | 'none'
      },
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

/* ----------------------------- Job status GET ----------------------------- */
router.get("/:job_id", (req, res) => {
  const job = jobs.get(req.params.job_id);
  if (!job) return res.status(404).json({ error: "job_not_found" });
  return res.json(job);
});

export default router;

/* -------------------------------- helpers --------------------------------- */
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

/* ---------------------- Apollo helper implementations --------------------- */
/**
 * Try multiple auth styles that Apollo accounts commonly use:
 *  1) Body: { api_key }
 *  2) Header: Authorization: Bearer <key>
 *  3) Header: X-Api-Key: <key>
 * Returns [] on any error or non-200.
 */
async function apolloPeopleSearchByText({ q, limit = 5, geo, keywords }) {
  const base = "https://api.apollo.io/v1/people/search";
  const payload = {
    q_keywords: keywords,
    q_organization_name: q,
    page: 1,
    per_page: Math.min(Math.max(limit, 1), 25),
    person_locations: geo ? [geo] : undefined,
  };
  const mappers = [mapApolloPerson];
  return await tryApolloCalls(base, payload, mappers);
}

async function apolloPeopleSearchByDomain({ domain, limit = 8, geo, keywords }) {
  const base = "https://api.apollo.io/v1/people/search";
  const payload = {
    q_keywords: keywords,
    q_organization_domains: [domain],
    page: 1,
    per_page: Math.min(Math.max(limit, 1), 25),
    person_locations: geo ? [geo] : undefined,
  };
  const mappers = [mapApolloPerson];
  return await tryApolloCalls(base, payload, mappers);
}

/* Try multiple auth variants; return mapped people or [] */
async function tryApolloCalls(endpoint, body, mappers) {
  // v1: put api_key in body
  {
    const r = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: APOLLO_API_KEY, ...body }),
    });
    const arr = await extractPeopleArray(r);
    if (arr.length) return arr.map((p) => mapWith(mappers, p));
  }
  // v2: Authorization: Bearer
  {
    const r = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${APOLLO_API_KEY}` },
      body: JSON.stringify(body),
    });
    const arr = await extractPeopleArray(r);
    if (arr.length) return arr.map((p) => mapWith(mappers, p));
  }
  // v3: X-Api-Key header
  {
    const r = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
      body: JSON.stringify(body),
    });
    const arr = await extractPeopleArray(r);
    if (arr.length) return arr.map((p) => mapWith(mappers, p));
  }
  return [];
}

/* fetch that never throws; returns { ok:boolean, status:number, json?:obj } */
async function safeFetch(url, init) {
  try {
    const res = await fetch(url, init);
    let json = null;
    try {
      json = await res.json();
    } catch {}
    if (!res.ok) {
      console.warn("apollo non-200", res.status, json || (await res.text().catch(() => "")));
    }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    console.error("apollo fetch error", e);
    return { ok: false, status: 0, json: null };
  }
}

async function extractPeopleArray(resp) {
  if (!resp?.ok) return [];
  const j = resp.json || {};
  return j.people || j.matches || j.results || [];
}

function mapWith(mappers, p) {
  for (const m of mappers) {
    const r = m(p);
    if (r) return r;
  }
  return null;
}

function mapApolloPerson(p) {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.name || "";
  return {
    source: "apollo",
    name,
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    title: p.title || p.position || "",
    designation: p.title || p.position || "",
    linkedin_url: p.linkedin_url || p.linkedin || "",
    email: p.email || (p.email_status === "verified" ? p.email : null),
    seniority: p.seniority || null,
  };
}
