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

/* ------------------------------ ENV ------------------------------ */
const APOLLO_API_KEY =
  process.env.APOLLO_API_KEY || process.env.APOLLOIO_API_KEY || process.env.APOLLO_TOKEN || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

const HAS_APOLLO = !!APOLLO_API_KEY;
const LLM_OK = !!OPENAI_KEY;

/* ------------------------------ Role filters ------------------------------ */
const HR_WORDS = [
  "HR","Human Resources","People","Talent","Recruiting","People Operations","Head of People","HR Manager","HR Director","Compensation","Benefits","Payroll"
];
const ADMIN_WORDS = ["Admin","Administration","Office Manager","Executive Assistant"];
const FIN_WORDS = ["Finance","Financial Controller","CFO","Accounts","Accounting","Procurement"];

const ALLOWED_BUCKETS = new Set(["hr","admin","finance"]);

/* ------------------------------ In-memory jobs ------------------------------ */
const jobs = new Map();

/* ------------------------------ utils ------------------------------ */
const log = (...a) => { try { console.error(...a); } catch {} };
const now = () => Date.now();
const ms = (t0) => Math.max(0, Date.now() - t0);

const stopwords = /\b(inc|llc|ltd|limited|international|intl|company|co|corp|corporation|group|holdings?|school|bank|market)\b/gi;

function cleanName(s="") {
  return String(s)
    .replace(stopwords, "")
    .replace(/[^a-z0-9\s&-]/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function acronymOf(name="") {
  const a = name.split(/[\s&-]+/).filter(Boolean).map(w => w[0]?.toUpperCase()).join("");
  return a || null;
}
function wordsToDomain(name="") {
  // heuristic: “Gems United Indian School” -> “gemsunitedindianschool.com”
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return base ? `${base}.com` : null;
}
function firstOf(full=""){ const p=String(full).trim().split(/\s+/); return p[0]||""; }
function lastOf(full=""){ const p=String(full).trim().split(/\s+/); return p.length>1?p[p.length-1]:""; }

function roleBucket(title="") {
  const b = bucketRole(title);
  if (ALLOWED_BUCKETS.has(b)) return b;
  const t = title.toLowerCase();
  if (HR_WORDS.some(k=>t.includes(k.toLowerCase()))) return "hr";
  if (ADMIN_WORDS.some(k=>t.includes(k.toLowerCase()))) return "admin";
  if (FIN_WORDS.some(k=>t.includes(k.toLowerCase()))) return "finance";
  return "other";
}

function detectOrgDomain(p) {
  if (!p) return null;
  const org = p.organization || p.company || p.employer || {};
  let d = org.domain || org.primary_domain || org.email_domain || null;
  if (!d && org.website_url) {
    try { d = new URL(org.website_url.startsWith("http")?org.website_url:`https://${org.website_url}`).hostname; }
    catch {}
  }
  return d ? d.replace(/^www\./,"").toLowerCase() : null;
}

function isProviderPlaceholderEmail(e) {
  if (!e) return false;
  const s = String(e).toLowerCase();
  return (
    s === "first.last" ||
    s === "first.last@" ||
    s.endsWith("@domain.com") ||
    s === "first.last@domain.com" ||
    s === "firstlast@domain.com" ||
    s.startsWith("email_not_unlocked@")
  );
}

function mockFromQuery(q) {
  const domain = wordsToDomain(q) || "example.com";
  const results = [
    {
      name: "Jane Doe",
      designation: "HR Manager",
      linkedin_url: "https://www.linkedin.com/in/jane-doe-hr/",
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
      linkedin_url: "https://www.linkedin.com/in/john-smith-people/",
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
      timings: {},
    },
  };
}

/* ------------------------------ LLM company resolver ------------------------------ */
async function resolveCompany(q, timings) {
  const t0 = now();
  const cleaned = cleanName(q);
  const acr = acronymOf(cleaned);

  // quick curated alias
  if (/kellogg\s*brown\s*and\s*root/i.test(q)) {
    timings.llm_ms = (timings.llm_ms || 0) + ms(t0);
    return { name: "KBR", domain: "kbr.com", synonyms: ["KBR","Kellogg Brown & Root"] };
  }

  if (!LLM_OK) {
    const domain = wordsToDomain(cleaned);
    timings.llm_ms = (timings.llm_ms || 0) + ms(t0);
    return { name: cleaned, domain, synonyms: [cleaned, acr].filter(Boolean) };
  }

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return JSON {name, domain, synonyms[]} for the company. Domain must be the primary website (e.g., kbr.com). Only JSON." },
          { role: "user", content: cleaned }
        ],
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content || "{}";
      const obj = JSON.parse(txt);
      obj.name ||= cleaned;
      obj.synonyms = Array.isArray(obj.synonyms) ? obj.synonyms : [];
      if (!obj.domain) obj.domain = wordsToDomain(obj.name || cleaned);
      if (acr) obj.synonyms.push(acr);
      timings.llm_ms = (timings.llm_ms || 0) + ms(t0);
      return obj;
    }
  } catch (e) {
    log("LLM resolve failed", e);
  }
  const domain = wordsToDomain(cleaned);
  timings.llm_ms = (timings.llm_ms || 0) + ms(t0);
  return { name: cleaned, domain, synonyms: [cleaned, acr].filter(Boolean) };
}

/* ------------------------------ Status chip ------------------------------ */
router.get("/status", async (_req, res) => {
  let db_ok = false;
  try { await pool.query("SELECT 1"); db_ok = true; } catch { db_ok = false; }
  res.json({ ok: true, data: { db_ok, llm_ok: LLM_OK, data_source: HAS_APOLLO ? "live" : "mock" } });
});

/* ------------------------------ Simple mock ------------------------------ */
router.get("/mock", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "q is required" });
  return res.json({ ok: true, data: mockFromQuery(q) });
});

/* ------------------------------ Free-text SEARCH ------------------------------ */
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "q is required" });

  const timings = {};
  try {
    const guess = await resolveCompany(q, timings);

    let people = [];
    if (HAS_APOLLO) {
      const keywords = [...HR_WORDS, ...ADMIN_WORDS, ...FIN_WORDS].join(" OR ");
      // try by domain first if we have one
      if (guess.domain) {
        people = await apolloPeopleByDomain({ domain: guess.domain, keywords, limit: 25, timings });
      }
      // fallback to org name
      if (!people.length) {
        people = await apolloPeopleByName({ name: guess.name, keywords, limit: 25, timings });
      }
      // last-chance: relaxed name
      if (!people.length && guess.synonyms?.length) {
        for (const s of guess.synonyms) {
          // eslint-disable-next-line no-await-in-loop
          const batch = await apolloPeopleByName({ name: s, limit: 25, timings });
          if (batch.length) { people = batch; break; }
        }
      }
    }

    if (!people.length) {
      const mock = mockFromQuery(q);
      mock.summary.provider = HAS_APOLLO ? "mock_fallback" : "mock";
      mock.summary.company_guess = guess;
      mock.summary.timings = timings;
      return res.json({ ok: true, data: mock });
    }

    // Determine domain from candidates or guess
    const domain =
      people.map(detectOrgDomain).filter(Boolean)[0] ||
      guess.domain ||
      null;

    const normalized = [];
    for (const p of people) {
      const title = p.title || p.position || p.designation || "";
      const bucket = roleBucket(title);
      if (!ALLOWED_BUCKETS.has(bucket)) continue;

      const first = p.first_name || firstOf(p.name || "");
      const last  = p.last_name  || lastOf(p.name || "");

      let email = p.email || null;
      let email_status = email ? "provider" : "unknown";
      let email_reason = email ? "provider_supplied" : undefined;

      // Drop provider placeholders (we’ll re-pattern only if we have a real domain)
      if (email && isProviderPlaceholderEmail(email)) {
        email = null;
        email_status = "unknown";
        email_reason = "provider_placeholder";
      }
      if (!email && domain && first && last) {
        // pattern with REAL domain only
        let pat = applyPattern(first, last, "first.last", domain);
        if (pat && typeof pat === "string" && !pat.includes("@")) pat = `${pat}@${domain}`;
        if (pat) {
          email = pat;
          email_status = "patterned";
          email_reason = "pattern_guess";
        }
      }

      const seniority = bucketSeniority(title || "");
      const confidence = scoreCandidate({
        role_bucket: bucket,
        seniority,
        geo_fit: 0.85,
        email_status,
        company_match: domain ? 1.0 : 0.6,
      });

      normalized.push({
        name: [first, last].filter(Boolean).join(" ").trim() || p.name || "",
        designation: title,
        linkedin_url: p.linkedin_url || p.linkedin || "",
        email,
        email_status,
        email_reason,
        role_bucket: bucket,
        seniority,
        source: "live",
        confidence: Number(confidence.toFixed(2)),
      });
    }

    normalized.sort((a,b)=> (b.confidence||0) - (a.confidence||0));

    return res.json({
      ok: true,
      data: {
        status: "completed",
        company_id: null,
        results: normalized,
        summary: {
          total_candidates: normalized.length,
          kept: normalized.length,
          provider: "live",
          company_guess: guess,
          timings,
        }
      }
    });
  } catch (e) {
    log("search error", e);
    const mock = mockFromQuery(q);
    mock.summary.provider = "error_fallback";
    mock.summary.timings = timings;
    return res.json({ ok: true, data: mock });
  }
});

/* ------------------------------ Company-selected ENRICH ------------------------------ */
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
        const u = new URL(company.website_url.startsWith("http")?company.website_url:`https://${company.website_url}`);
        company.domain = u.hostname.replace(/^www\./,"");
      } catch {}
    }

    let provider = "none";
    const tP = now();
    let people = [];

    if (HAS_APOLLO && company.domain) {
      people = await apolloPeopleByDomain({
        domain: company.domain,
        keywords: [...HR_WORDS, ...ADMIN_WORDS, ...FIN_WORDS].join(" OR "),
        limit: max_contacts * 6,
      });
      provider = people.length ? "live" : "none";
    }
    const timings = { provider_ms: ms(tP) };

    // infer pattern
    let learned = null;
    const samples = people
      .filter(c => c.email && c.first_name && c.last_name)
      .map(c => ({ name: `${c.first_name} ${c.last_name}`, email: c.email }));
    if (samples.length >= 2 && company.domain) {
      learned = inferPatternFromSamples(samples, company.domain);
      if (learned?.pattern && learned.confidence >= 0.7) {
        await savePatternToCache(pool, company.domain, learned.pattern, samples[0]?.email, learned.confidence);
      }
    }

    let pattern = null;
    if (company.email_pattern && (company.pattern_confidence ?? 0) >= 0.7) {
      pattern = { pattern: company.email_pattern, confidence: Number(company.pattern_confidence)||0 };
    } else if (company.domain) {
      const cached = await loadPatternFromCache(pool, company.domain);
      if (cached) pattern = cached;
    }
    if (!pattern && learned) pattern = learned;

    // map + filter
    let candidates = people.map(p => ({
      source: "live",
      name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.name || "",
      first_name: p.first_name || firstOf(p.name),
      last_name: p.last_name || lastOf(p.name),
      designation: p.title || p.designation || "",
      linkedin_url: p.linkedin || p.linkedin_url || "",
      email: (p.email && !isProviderPlaceholderEmail(p.email)) ? p.email : null,
      email_status: (p.email && !isProviderPlaceholderEmail(p.email)) ? "provider" : "unknown",
      email_reason: (p.email && !isProviderPlaceholderEmail(p.email)) ? "provider_supplied" : undefined,
      role_bucket: roleBucket(p.title || p.designation || ""),
      seniority: bucketSeniority(p.title || p.designation || ""),
      geo_fit: 1.0,
    })).filter(c => ALLOWED_BUCKETS.has(c.role_bucket) && !isAgencyRecruiter(c));

    // pattern if possible
    if (company.domain && pattern?.pattern) {
      candidates = candidates.map(c => {
        if (!c.email && c.first_name && c.last_name) {
          let e = applyPattern(c.first_name, c.last_name, pattern.pattern, company.domain);
          if (e && typeof e === "string" && !e.includes("@")) e = `${e}@${company.domain}`;
          if (e) {
            c.email = e;
            c.email_status = "patterned";
            c.email_reason = "pattern_guess";
          }
        }
        return c;
      });
    }

    // verify
    for (const c of candidates) {
      if (!c.email) continue;
      const v = await verifyEmail(c.email);
      c.email_status = v.status;
      c.email_reason = v.reason || c.email_reason;
    }

    // score
    candidates = candidates.map(c => ({
      ...c,
      confidence: scoreCandidate({
        role_bucket: c.role_bucket,
        seniority: c.seniority,
        geo_fit: c.geo_fit,
        email_status: c.email_status,
        company_match: 1.0,
      })
    })).sort((a,b)=> b.confidence - a.confidence);

    // keep top uniques
    const kept = [];
    const seen = new Set();
    for (const c of candidates) {
      if (!c.email || seen.has(c.email)) continue;
      if (kept.length < max_contacts && c.confidence >= 0.6) {
        kept.push(c); seen.add(c.email);
      }
    }

    // save to DB
    const saved = [];
    for (const c of kept) {
      try { saved.push(await upsertLead(company_id, c)); }
      catch (e) { if (String(e?.code) !== "42P01") log("hr_leads upsert:", e); }
    }

    const resp = {
      status: "completed",
      company_id,
      results: kept.map(c => ({
        name: c.name,
        designation: c.designation,
        linkedin_url: c.linkedin_url,
        email: c.email,
        email_status: c.email_status,
        email_reason: c.email_reason,
        role_bucket: c.role_bucket,
        seniority: c.seniority,
        confidence: Number((c.confidence||0).toFixed(2)),
        source: c.source || "live",
      })),
      summary: {
        found: candidates.length,
        kept: kept.length,
        primary_contact_id: saved[0]?.id || null,
        provider,
        timings,
      }
    };

    jobs.set(job_id, resp);
    return res.status(202).json({ job_id, ...resp });
  } catch (e) {
    log("enrich job error", e);
    const payload = { job_id, status: "error", error: "exception" };
    jobs.set(job_id, payload);
    return res.status(500).json(payload);
  }
});

/* ------------------------------ Job GET ------------------------------ */
router.get("/:job_id", (req, res) => {
  const job = jobs.get(req.params.job_id);
  if (!job) return res.status(404).json({ error: "job_not_found" });
  res.json(job);
});

export default router;

/* ------------------------------ DB helpers ------------------------------ */
async function getCompany(id) {
  try {
    const { rows } = await pool.query(
      `SELECT id,name,website_url,domain,email_pattern,pattern_confidence FROM targeted_companies WHERE id=$1 LIMIT 1`,
      [id]
    );
    return rows[0];
  } catch (e) {
    if (String(e?.code) === "42P01") return null;
    throw e;
  }
}
async function upsertLead(company_id, c) {
  const q = `
    INSERT INTO hr_leads
      (company_id,name,designation,linkedin_url,email,email_status,lead_status,source,confidence,role_bucket,seniority,email_reason)
    VALUES
      ($1,$2,$3,$4,$5,$6,'New',$7,$8,$9,$10,$11)
    ON CONFLICT (company_id,email) DO UPDATE SET
      designation=EXCLUDED.designation,
      linkedin_url=EXCLUDED.linkedin_url,
      email_status=EXCLUDED.email_status,
      source=EXCLUDED.source,
      confidence=EXCLUDED.confidence,
      role_bucket=EXCLUDED.role_bucket,
      seniority=EXCLUDED.seniority,
      email_reason=EXCLUDED.email_reason
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

/* ------------------------------ Apollo helpers ------------------------------ */
async function apolloPeopleByName({ name, keywords, limit = 25, timings }) {
  return await apolloPeopleSearch({
    body: {
      q_organization_name: name,
      q_keywords: keywords,
      page: 1,
      per_page: Math.min(Math.max(limit,1),25),
    },
    timings,
  });
}
async function apolloPeopleByDomain({ domain, keywords, limit = 25, timings }) {
  return await apolloPeopleSearch({
    body: {
      q_organization_domains: [domain],
      q_keywords: keywords,
      page: 1,
      per_page: Math.min(Math.max(limit,1),25),
    },
    timings,
  });
}
async function apolloPeopleSearch({ body, timings }) {
  const endpoint = "https://api.apollo.io/v1/people/search";
  const t0 = now();

  // Try api_key in body
  let r = await tryFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ api_key: APOLLO_API_KEY, ...body })
  });
  let people = extractPeople(r);
  if (!people.length) {
    // Try bearer
    r = await tryFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type":"application/json", Authorization:`Bearer ${APOLLO_API_KEY}` },
      body: JSON.stringify(body)
    });
    people = extractPeople(r);
  }
  if (!people.length) {
    // Try X-Api-Key
    r = await tryFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type":"application/json", "X-Api-Key": APOLLO_API_KEY },
      body: JSON.stringify(body)
    });
    people = extractPeople(r);
  }

  timings.provider_ms = (timings?.provider_ms || 0) + ms(t0);
  return people.map(mapApollo);
}
function extractPeople(resp) {
  if (!resp?.ok) return [];
  const j = resp.json || {};
  return j.people || j.matches || j.results || [];
}
async function tryFetch(url, init) {
  try {
    const res = await fetch(url, init);
    let json = null; try { json = await res.json(); } catch {}
    if (!res.ok) log("apollo non-200", res.status, json || "");
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    log("apollo fetch error", e);
    return { ok: false, status: 0, json: null };
  }
}
function mapApollo(p) {
  return {
    name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.name || "",
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    title: p.title || p.position || "",
    designation: p.title || p.position || "",
    linkedin_url: p.linkedin_url || p.linkedin || "",
    email: p.email || null,
    organization: p.organization || p.company || p.employer || {
      domain: p.organization_domain || p.company_domain || null,
      website_url: p.organization_website_url || p.company_website_url || null,
    },
    seniority: p.seniority || null,
  };
}
