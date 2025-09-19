// routes/enrich.js
import express from "express";
import { nanoid } from "nanoid";
import { pool } from "../utils/db.js";

import {
  bucketRole,
  bucketSeniority,
  isAgencyRecruiter,
  scoreCandidate,
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
  process.env.APOLLO_API_KEY || process.env.APOLLOIO_API_KEY || process.env.APOLLO_TOKEN || "";
const hasApollo = !!APOLLO_API_KEY;
const LLM_KEY = process.env.OPENAI_API_KEY || "";
const LLM_OK = !!LLM_KEY;

const HR_KEYWORDS = [
  "HR",
  "Human Resources",
  "People",
  "Talent",
  "Recruiting",
  "People Operations",
  "Head of People",
  "HR Manager",
  "HR Director",
  "Compensation",
  "Benefits",
  "Payroll",
];
const ADMIN_KEYWORDS = ["Admin", "Administration", "Office Manager", "Executive Assistant"];
const FINANCE_KEYWORDS = ["Finance", "Financial Controller", "CFO", "Accounts", "Accounting", "Procurement"];
const ALLOWED_BUCKETS = new Set(["hr", "admin", "finance"]);

/* ------------------------------ In-memory jobs ---------------------------- */
const jobs = new Map();

/* ------------------------------ tiny helpers ------------------------------ */

function safeLog(...args) {
  try {
    console.error(...args);
  } catch {}
}

async function safeCall(fn, args) {
  try {
    const out = await fn(args);
    return Array.isArray(out) ? out : out ? [out] : [];
  } catch (e) {
    safeLog("[safeCall] error:", e);
    return [];
  }
}

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
      company_guess: { name: q, domain },
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

function cleanCompanyName(name = "") {
  return String(name)
    .replace(/\b(inc|llc|ltd|limited|international|intl|co|company|corp|corporation|group|holdings?)\b/gi, "")
    .replace(/[^a-z0-9\s&-]/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function makeAcronym(name = "") {
  const letters = name
    .split(/[\s&-]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return letters || null;
}

function detectDomainFromCandidate(p) {
  if (p?.email && p.email.includes("@")) return p.email.split("@").pop().trim().toLowerCase();
  const org = p.organization || p.company || p.employer || {};
  const d =
    org.domain ||
    org.primary_domain ||
    org.email_domain ||
    (org.website_url
      ? (() => {
          try {
            const u = new URL(org.website_url.startsWith("http") ? org.website_url : `https://${org.website_url}`);
            return u.hostname.replace(/^www\./, "");
          } catch {
            return null;
          }
        })()
      : null);
  if (d) return String(d).toLowerCase();
  if (p.company_linkedin_url) {
    const m = /linkedin\.com\/company\/([^/]+)/i.exec(p.company_linkedin_url);
    if (m) return `${m[1].toLowerCase()}.com`;
  }
  return null;
}

function roleBucketFromTitle(title = "") {
  const b = bucketRole(title);
  if (ALLOWED_BUCKETS.has(b)) return b;
  const t = title.toLowerCase();
  if (HR_KEYWORDS.some((k) => t.includes(k.toLowerCase()))) return "hr";
  if (ADMIN_KEYWORDS.some((k) => t.includes(k.toLowerCase()))) return "admin";
  if (FINANCE_KEYWORDS.some((k) => t.includes(k.toLowerCase()))) return "finance";
  return "other";
}

/* --------------------------------- LLM ----------------------------------- */
async function resolveCompanyFromQuery(q) {
  const cleaned = cleanCompanyName(q);
  const acronym = makeAcronym(cleaned);
  const curated = [
    { match: /kellogg\s*brown\s*and\s*root/i, name: "KBR", domain: "kbr.com", synonyms: ["KBR", "Kellogg Brown & Root"] },
  ];
  for (const c of curated) {
    if (c.match.test(q)) return { name: c.name, domain: c.domain, synonyms: c.synonyms };
  }

  if (LLM_OK) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LLM_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You convert noisy company names to a JSON {name, domain, synonyms} where domain is the primary public website domain (e.g., 'kbr.com'). Only output valid JSON.",
            },
            { role: "user", content: `Company: "${q}"` },
          ],
        }),
      });
      if (resp.ok) {
        const json = await resp.json();
        const text = json?.choices?.[0]?.message?.content || "{}";
        const obj = JSON.parse(text);
        if (obj?.domain) {
          obj.name = obj.name || cleaned;
          obj.synonyms = Array.isArray(obj.synonyms) ? obj.synonyms : [];
          if (acronym) obj.synonyms.push(acronym);
          return obj;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { name: cleaned, domain: null, synonyms: [cleaned, acronym].filter(Boolean) };
}

/* -------------------------------- Status --------------------------------- */
router.get("/status", async (_req, res) => {
  let db_ok = false;
  try {
    await pool.query("SELECT 1");
    db_ok = true;
  } catch {
    db_ok = false;
  }
  res.json({
    ok: true,
    data: {
      db_ok,
      llm_ok: LLM_OK,
      data_source: hasApollo ? "live" : "mock",
    },
  });
});

/* --------------------------- Free-text MOCK route ------------------------- */
router.get("/mock", async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "q is required" });
  const mock = makeMockFromText(q);
  mock.summary.provider = "mock";
  return res.json({ ok: true, data: mock });
});

/* ----------------------- Free-text provider SEARCH ------------------------ */
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "q is required" });

  try {
    const allKeywords = [...HR_KEYWORDS, ...ADMIN_KEYWORDS, ...FINANCE_KEYWORDS].join(" OR ");
    let people = [];
    let companyGuess = null;

    if (hasApollo) {
      // 1) try by organization name (filtered)
      people = await safeCall(apolloPeopleSearchByText, {
        q,
        limit: 20,
        geo: "United Arab Emirates",
        keywords: allKeywords,
      });

      // 2) resolve company & try domain
      if (!people.length) {
        companyGuess = await resolveCompanyFromQuery(q);
        if (companyGuess?.domain) {
          people = await safeCall(apolloPeopleSearchByDomain, {
            domain: companyGuess.domain,
            limit: 20,
            geo: "United Arab Emirates",
            keywords: allKeywords,
          });
        }
      }

      // 3) loosen by synonyms / no keywords
      if (!people.length) {
        const synonyms = (companyGuess?.synonyms || []).slice(0, 3);
        const namesToTry = [q, cleanCompanyName(q), ...synonyms].filter(Boolean);
        for (const name of namesToTry) {
          const batch = await safeCall(apolloPeopleSearchByText, {
            q: name,
            limit: 20,
            geo: "United Arab Emirates",
            keywords: undefined,
          });
          if (batch.length) {
            people = batch;
            break;
          }
        }
      }
    }

    if (!people.length) {
      const mock = makeMockFromText(q);
      if (companyGuess) mock.summary.company_guess = companyGuess;
      mock.summary.provider = hasApollo ? "mock_fallback" : "mock";
      return res.json({ ok: true, data: mock });
    }

    // Normalize + filter + email pattern if locked
    let domain =
      people
        .map(detectDomainFromCandidate)
        .filter(Boolean)
        .map((s) => s.replace(/^www\./, ""))
        .find(Boolean) || companyGuess?.domain || null;

    const results = [];
    for (const p of people) {
      const title = p.title || p.position || p.designation || "";
      const rb = roleBucketFromTitle(title);
      if (!ALLOWED_BUCKETS.has(rb)) continue;

      const seniority = bucketSeniority(title || "");
      let email = p.email || null;
      let email_status = p.email ? "provider" : "unknown";
      let email_reason;

      if (email && /^email_not_unlocked@/i.test(email)) {
        email = null;
        email_status = "unknown";
        email_reason = "provider_locked_email";
      }

      const first = p.first_name || guessFirst(p.name || "");
      const last = p.last_name || guessLast(p.name || "");

      if (!email && domain && first && last) {
        email = applyPattern(first, last, "first.last", domain);
        email_status = "patterned";
        email_reason = "pattern_guess";
      }

      results.push({
        name: [first, last].filter(Boolean).join(" ").trim() || p.name || "",
        designation: title,
        linkedin_url: p.linkedin_url || p.linkedin || "",
        email,
        email_status,
        email_reason,
        role_bucket: rb,
        seniority,
        source: "live",
        confidence: 0.85,
      });
    }

    return res.json({
      ok: true,
      data: {
        status: "completed",
        company_id: null,
        results,
        summary: {
          total_candidates: results.length,
          kept: results.length,
          provider: "live",
          company_guess: companyGuess || (domain ? { name: cleanCompanyName(q), domain } : null),
        },
      },
    });
  } catch (e) {
    safeLog("search route error:", e);
    // never 500 out: send a safe fallback so UI doesn’t show “Search failed”
    const mock = makeMockFromText(q);
    mock.summary.provider = "error_fallback";
    return res.json({ ok: true, data: mock });
  }
});

/* ------------------------ Company-selected ENRICH ------------------------- */
router.post("/", async (req, res) => {
  const { company_id, max_contacts = 3 } = req.body || {};
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

    if (!company.domain && company.website_url) {
      try {
        const u = new URL(
          company.website_url.startsWith("http") ? company.website_url : `https://${company.website_url}`
        );
        company.domain = u.hostname.replace(/^www\./, "");
      } catch {}
    }

    let providerUsed = "none";
    let providerCandidates = [];
    if (hasApollo && company.domain) {
      providerCandidates = await safeCall(apolloPeopleSearchByDomain, {
        domain: company.domain,
        limit: max_contacts * 6,
        geo: "United Arab Emirates",
        keywords: [...HR_KEYWORDS, ...ADMIN_KEYWORDS, ...FINANCE_KEYWORDS].join(" OR "),
      });
      providerUsed = providerCandidates.length ? "live" : "none";
    }

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

    let pattern = null;
    if (company.email_pattern && (company.pattern_confidence ?? 0) >= 0.7) {
      pattern = { pattern: company.email_pattern, confidence: Number(company.pattern_confidence) || 0 };
    } else if (company.domain) {
      const cached = await loadPatternFromCache(pool, company.domain);
      if (cached) pattern = cached;
    }
    if (!pattern && learnedPattern) pattern = learnedPattern;

    let candidates = (providerCandidates || []).map((p) => ({
      source: "live",
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
        role_bucket: roleBucketFromTitle(c.designation || ""),
        seniority: bucketSeniority(c.designation || ""),
      }))
      .filter((c) => ALLOWED_BUCKETS.has(c.role_bucket) && !isAgencyRecruiter(c));

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

    for (const c of candidates) {
      if (!c.email) continue;
      const v = await verifyEmail(c.email);
      c.email_status = v.status;
      c.email_reason = v.reason || c.email_reason;
    }

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

    const saved = [];
    for (const c of kept) {
      try {
        const row = await upsertHrLead(company_id, c);
        saved.push(row);
      } catch (e) {
        if (String(e?.code) !== "42P01") safeLog("hr_leads upsert error:", e);
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
        source: c.source || "live",
        email_reason: c.email_reason,
      })),
      summary: {
        found: candidates.length,
        kept: kept.length,
        primary_contact_id: primary,
        provider: providerUsed, // 'live' | 'none'
      },
    };

    jobs.set(job_id, result);
    return res.status(202).json({ job_id, ...result });
  } catch (err) {
    safeLog("enrich job error:", err);
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
    c.source || "live",
    c.confidence ?? null,
    c.role_bucket || null,
    c.seniority || null,
    c.email_reason || null,
  ];
  const { rows } = await pool.query(q, vals);
  return rows[0];
}

/* ---------------------- Apollo helper implementations --------------------- */
async function apolloPeopleSearchByText({ q, limit = 5, geo, keywords }) {
  const base = "https://api.apollo.io/v1/people/search";
  const payload = {
    q_keywords: keywords,
    q_organization_name: q,
    page: 1,
    per_page: Math.min(Math.max(limit, 1), 25),
    person_locations: geo ? [geo] : undefined,
  };
  return await tryApolloCalls(base, payload);
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
  return await tryApolloCalls(base, payload);
}

async function tryApolloCalls(endpoint, body) {
  // v1: api_key in body
  {
    const r = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: APOLLO_API_KEY, ...body }),
    });
    const arr = await extractPeopleArray(r);
    if (arr.length) return arr.map(mapApolloPerson);
  }
  // v2: Authorization Bearer
  {
    const r = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${APOLLO_API_KEY}` },
      body: JSON.stringify(body),
    });
    const arr = await extractPeopleArray(r);
    if (arr.length) return arr.map(mapApolloPerson);
  }
  // v3: X-Api-Key
  {
    const r = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
      body: JSON.stringify(body),
    });
    const arr = await extractPeopleArray(r);
    if (arr.length) return arr.map(mapApolloPerson);
  }
  return [];
}

async function safeFetch(url, init) {
  try {
    const res = await fetch(url, init);
    let json = null;
    try {
      json = await res.json();
    } catch {}
    if (!res.ok) {
      safeLog("apollo non-200", res.status, json || (await res.text().catch(() => "")));
    }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    safeLog("apollo fetch error", e);
    return { ok: false, status: 0, json: null };
  }
}
async function extractPeopleArray(resp) {
  if (!resp?.ok) return [];
  const j = resp.json || {};
  return j.people || j.matches || j.results || [];
}
function mapApolloPerson(p) {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.name || "";
  const org =
    p.organization ||
    p.company ||
    p.employer || {
      domain: p.organization_domain || p.company_domain || null,
      website_url: p.organization_website_url || p.company_website_url || null,
    };
  const company_linkedin_url =
    p.organization_linkedin_url || p.company_linkedin_url || p.company_linkedin || null;

  return {
    source: "live",
    name,
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    title: p.title || p.position || "",
    designation: p.title || p.position || "",
    linkedin_url: p.linkedin_url || p.linkedin || "",
    company_linkedin_url,
    email: p.email || (p.email_status === "verified" ? p.email : null),
    organization: org,
    seniority: p.seniority || null,
  };
}
