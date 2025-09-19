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
  process.env.APOLLO_API_KEY ||
  process.env.APOLLOIO_API_KEY ||
  process.env.APOLLO_TOKEN ||
  "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

const HAS_APOLLO = !!APOLLO_API_KEY;
const LLM_OK = !!OPENAI_KEY;

/* ------------------------------ Role & geo filters ------------------------------ */
const HR_WORDS = [
  "HR","Human Resources","People","Talent","Recruiting","People Operations",
  "Head of People","HR Manager","HR Director","Compensation","Benefits","Payroll",
];
const ADMIN_WORDS = ["Admin","Administration","Office Manager","Executive Assistant"];
const FIN_WORDS = ["Finance","Financial Controller","CFO","Accounts","Accounting","Procurement"];
const ALLOWED_BUCKETS = new Set(["hr","admin","finance"]);

const UAE_EMIRATES = [
  { key: "abu dhabi", label: "Abu Dhabi" },
  { key: "dubai", label: "Dubai" },
  { key: "sharjah", label: "Sharjah" },
  { key: "ajman", label: "Ajman" },
  { key: "ras al khaimah", label: "Ras Al Khaimah" },
  { key: "umm al quwain", label: "Umm Al Quwain" },
  { key: "fujairah", label: "Fujairah" },
];
const UAE_KEYS = ["united arab emirates","uae", ...UAE_EMIRATES.map(e => e.key)];

/* ------------------------------ Jobs ------------------------------ */
const jobs = new Map();

/* ------------------------------ helpers ------------------------------ */
const log = (...a) => { try { console.error(...a); } catch {} };
const now = () => Date.now();
const ms = (t0) => Math.max(0, Date.now() - t0);

const STOPWORDS = /\b(inc|llc|ltd|limited|international|intl|company|co|corp|corporation|group|holdings?|school|bank|market|solutions?)\b/gi;

function cleanName(s = "") {
  return String(s)
    .replace(STOPWORDS, " ")
    .replace(/[^a-z0-9\s&-]/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function acronymOf(name = "") {
  const a = name.split(/[\s&-]+/).filter(Boolean).map(w => w[0]?.toUpperCase()).join("");
  return a || null;
}
function wordsToDomain(name = "") {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return base ? `${base}.com` : null;
}
function firstOf(full = "") { const p = String(full).trim().split(/\s+/); return p[0] || ""; }
function lastOf(full = "") { const p = String(full).trim().split(/\s+/); return p.length > 1 ? p[p.length - 1] : ""; }

function roleBucket(title = "") {
  const b = bucketRole(title);
  if (ALLOWED_BUCKETS.has(b)) return b;
  const t = title.toLowerCase();
  if (HR_WORDS.some(k => t.includes(k.toLowerCase()))) return "hr";
  if (ADMIN_WORDS.some(k => t.includes(k.toLowerCase()))) return "admin";
  if (FIN_WORDS.some(k => t.includes(k.toLowerCase()))) return "finance";
  return "other";
}

function detectOrgDomain(p) {
  if (!p) return null;
  const org = p.organization || p.company || p.employer || {};
  let d = org.domain || org.primary_domain || org.email_domain || null;
  if (!d && org.website_url) {
    try { d = new URL(org.website_url.startsWith("http") ? org.website_url : `https://${org.website_url}`).hostname; }
    catch {}
  }
  return d ? d.replace(/^www\./, "").toLowerCase() : null;
}

function isProviderPlaceholderEmail(e) {
  if (!e) return false;
  const s = String(e).toLowerCase();
  return (
    s === "first.last" ||
    s === "first.last@" ||
    s === "first.last@domain.com" ||
    s === "firstlast@domain.com" ||
    s.endsWith("@domain.com") ||
    s.startsWith("email_not_unlocked@")
  );
}

function emirateFromLocation(loc = "") {
  const s = String(loc).toLowerCase();
  if (!s) return null;
  for (const e of UAE_EMIRATES) {
    if (s.includes(e.key)) return e.label;
  }
  if (s.includes("united arab emirates") || s === "uae") return "UAE";
  return null;
}
function isUAE(loc = "") {
  const s = String(loc).toLowerCase();
  return UAE_KEYS.some(k => s.includes(k));
}
function joinNonEmpty(...parts) {
  return parts.filter(Boolean).join(", ");
}

/* ------------------------------ MOCK ------------------------------ */
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
      location: "Dubai, United Arab Emirates",
      emirate: "Dubai",
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
      location: "Abu Dhabi, United Arab Emirates",
      emirate: "Abu Dhabi",
    },
  ];
  return {
    status: "completed",
    company_id: null,
    results,
  };
}

/* ------------------------------ LLM company resolver ------------------------------ */
async function resolveCompanyRich(q, timings) {
  const t0 = now();
  const cleaned = cleanName(q);
  const acr = acronymOf(cleaned);

  // If no key, return a guessed shell.
  if (!LLM_OK) {
    const domain = wordsToDomain(cleaned);
    timings.llm_ms = (timings.llm_ms || 0) + ms(t0);
    return {
      name: cleaned,
      domain,
      website_url: domain ? `https://www.${domain}` : null,
      linkedin_url: null,
      hq: null,
      industry: null,
      size: null,
      synonyms: [cleaned, acr].filter(Boolean),
      mode: "Guess",
    };
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
          {
            role: "system",
            content:
              "Return JSON only with keys: name, domain, website_url, linkedin_url, hq, industry, size, synonyms[]. Domain must be primary (e.g., kbr.com).",
          },
          { role: "user", content: cleaned },
        ],
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content || "{}";
      const obj = JSON.parse(txt);
      obj.name ||= cleaned;
      obj.domain ||= wordsToDomain(obj.name || cleaned);
      obj.website_url ||= (obj.domain ? `https://www.${obj.domain}` : null);
      obj.synonyms = Array.isArray(obj.synonyms) ? obj.synonyms : [];
      if (acr) obj.synonyms.push(acr);
      obj.mode = "LLM";
      timings.llm_ms = (timings.llm_ms || 0) + ms(t0);
      return obj;
    }
  } catch (e) {
    log("LLM resolve failed", e);
  }
  const domain = wordsToDomain(cleaned);
  timings.llm_ms = (timings.llm_ms || 0) + ms(t0);
  return {
    name: cleaned,
    domain,
    website_url: domain ? `https://www.${domain}` : null,
    linkedin_url: null,
    hq: null,
    industry: null,
    size: null,
    synonyms: [cleaned, acr].filter(Boolean),
    mode: "Guess",
  };
}

function qualityScore({ domain, linkedin_url, uaeCount, patternConfidence, hq }) {
  let s = 0;
  if (domain) s += 0.2;
  if (linkedin_url) s += 0.15;
  if (uaeCount) s += Math.min(uaeCount, 10) / 10 * 0.4; // up to +0.4
  if (patternConfidence) s += Math.min(Math.max(patternConfidence, 0), 1) * 0.2;
  if (hq && /uae|united arab emirates|dubai|abu dhabi/i.test(hq)) s += 0.05;
  s = Math.max(0, Math.min(1, s));
  const reasons = [];
  if (domain) reasons.push("has primary domain");
  if (linkedin_url) reasons.push("LinkedIn page found");
  if (uaeCount) reasons.push(`${uaeCount} UAE HR/admin/finance contacts`);
  if (patternConfidence) reasons.push(`email pattern≈${Math.round(patternConfidence * 100)}%`);
  return { score: s, explanation: reasons.join("; ") || "No signals available" };
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
  return res.json({ ok: true, data: { ...mockFromQuery(q), summary: { provider: HAS_APOLLO ? "mock_fallback" : "mock" } } });
});

/* ------------------------------ Free-text SEARCH (UAE filtered + SMTP on patterned) ------------------------------ */
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "q is required" });

  const timings = {};
  try {
    const guess = await resolveCompanyRich(q, timings);

    let people = [];
    if (HAS_APOLLO) {
      const keywords = compactApolloKeywords();
      const locs = ["United Arab Emirates"];
      if (guess.domain) {
        people = await apolloPeopleByDomain({ domain: guess.domain, keywords, limit: 25, timings, locations: locs });
      }
      if (!people.length) {
        people = await apolloPeopleByName({ name: guess.name, keywords, limit: 25, timings, locations: locs });
      }
      if (!people.length && guess.synonyms?.length) {
        for (const s of guess.synonyms) {
          // eslint-disable-next-line no-await-in-loop
          const batch = await apolloPeopleByName({ name: s, keywords, limit: 25, timings, locations: locs });
          if (batch.length) { people = batch; break; }
        }
      }
    }

    if (!people.length) {
      const mock = mockFromQuery(q);
      const qs = qualityScore({
        domain: guess.domain,
        linkedin_url: guess.linkedin_url,
        uaeCount: 0,
        patternConfidence: 0,
        hq: guess.hq,
      });
      return res.json({
        ok: true,
        data: {
          ...mock,
          summary: {
            provider: HAS_APOLLO ? "mock_fallback" : "mock",
            company_guess: guess,
            timings,
            quality: qs,
          },
        },
      });
    }

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
      const location = deriveLocation(p);
      const emirate = emirateFromLocation(location);

      if (!(emirate || isUAE(location))) continue;

      let email = p.email || null;
      let email_status = email ? "provider" : "unknown";
      let email_reason = email ? "provider_supplied" : undefined;

      if (email && isProviderPlaceholderEmail(email)) {
        email = null;
        email_status = "unknown";
        email_reason = "provider_placeholder";
      }
      if (!email && domain && first && last) {
        // always produce concrete patterned email (not "first.last")
        let e = applyPattern(first, last, "first.last", domain);
        if (e && typeof e === "string" && !/@/.test(e)) e = `${e}@${domain}`;
        email = e;
        email_status = "patterned";
        email_reason = "pattern_guess";
      }

      const seniority = bucketSeniority(title || "");
      const confidence = scoreCandidate({
        role_bucket: bucket,
        seniority,
        geo_fit: emirate ? 1.0 : 0.7,
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
        location,
        emirate: emirate || null,
      });
    }

    // SMTP verify top patterned emails (quick pass)
    const tSmtp = now();
    let verified = 0;
    for (const c of normalized) {
      if (!c.email || c.email_status !== "patterned") continue;
      const v = await verifyEmail(c.email);
      c.email_status = v.status || c.email_status;
      c.email_reason = v.reason || c.email_reason;
      verified++;
      if (verified >= 10) break; // cap to keep UI snappy
    }
    timings.smtp_ms = ms(tSmtp);

    normalized.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    const qs = qualityScore({
      domain,
      linkedin_url: guess.linkedin_url,
      uaeCount: normalized.length,
      patternConfidence: 0.8, // heuristic for search-mode
      hq: guess.hq,
    });

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
          company_guess: { ...guess, domain },
          timings,
          quality: qs,
        },
      },
    });
  } catch (e) {
    log("search error", e);
    const guess = await resolveCompanyRich(q, {});
    const mock = mockFromQuery(q);
    const qs = qualityScore({
      domain: guess.domain, linkedin_url: guess.linkedin_url, uaeCount: 0, patternConfidence: 0, hq: guess.hq
    });
    return res.json({
      ok: true,
      data: { ...mock, summary: { provider: "error_fallback", company_guess: guess, timings, quality: qs } },
    });
  }
});

/* ------------------------------ Company-selected ENRICH (UAE filtered + SMTP verify) ------------------------------ */
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
        const u = new URL(company.website_url.startsWith("http") ? company.website_url : `https://${company.website_url}`);
        company.domain = u.hostname.replace(/^www\./, "");
      } catch {}
    }

    const tP = now();
    let people = [];
    let provider = "none";

    if (HAS_APOLLO && company.domain) {
      const locs = ["United Arab Emirates"];
      people = await apolloPeopleByDomain({
        domain: company.domain,
        keywords: compactApolloKeywords(),
        limit: Math.min(Math.max(max_contacts * 8, 5), 25),
        locations: locs,
      });
      provider = people.length ? "live" : "none";
    }
    const timings = { provider_ms: ms(tP) };

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
      pattern = { pattern: company.email_pattern, confidence: Number(company.pattern_confidence) || 0 };
    } else if (company.domain) {
      const cached = await loadPatternFromCache(pool, company.domain);
      if (cached) pattern = cached;
    }
    if (!pattern && learned) pattern = learned;

    let candidates = people.map(p => {
      const location = deriveLocation(p);
      const emirate = emirateFromLocation(location);
      return {
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
        location,
        emirate,
        geo_fit: emirate ? 1.0 : 0.7,
      };
    })
    .filter(c => ALLOWED_BUCKETS.has(c.role_bucket) && (c.emirate || isUAE(c.location)) && !isAgencyRecruiter(c));

    if (company.domain && pattern?.pattern) {
      candidates = candidates.map(c => {
        if (!c.email && c.first_name && c.last_name) {
          let e = applyPattern(c.first_name, c.last_name, pattern.pattern, company.domain);
          if (e && typeof e === "string" && !/@/.test(e)) e = `${e}@${company.domain}`;
          if (e) {
            c.email = e;
            c.email_status = "patterned";
            c.email_reason = "pattern_guess";
          }
        }
        return c;
      });
    }

    // SMTP verify everyone we plan to keep
    for (const c of candidates) {
      if (!c.email) continue;
      const v = await verifyEmail(c.email);
      c.email_status = v.status;
      c.email_reason = v.reason || c.email_reason;
    }

    candidates = candidates.map(c => ({
      ...c,
      confidence: scoreCandidate({
        role_bucket: c.role_bucket,
        seniority: c.seniority,
        geo_fit: c.geo_fit,
        email_status: c.email_status,
        company_match: 1.0,
      })
    })).sort((a, b) => b.confidence - a.confidence);

    const kept = [];
    const seen = new Set();
    for (const c of candidates) {
      if (!c.email || seen.has(c.email)) continue;
      if (kept.length < max_contacts && c.confidence >= 0.6) {
        kept.push(c); seen.add(c.email);
      }
    }

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
        confidence: Number((c.confidence || 0).toFixed(2)),
        source: c.source || "live",
        location: c.location || null,
        emirate: c.emirate || null,
      })),
      summary: {
        found: candidates.length,
        kept: kept.length,
        primary_contact_id: saved[0]?.id || null,
        provider,
        timings,
        quality: qualityScore({
          domain: company.domain,
          linkedin_url: null,
          uaeCount: kept.length,
          patternConfidence: pattern?.confidence || 0.8,
          hq: null
        }),
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
function compactApolloKeywords() {
  // Keep very short to avoid 422 “Value too long”
  return "HR OR Human Resources OR People OR Talent OR Recruiter OR Payroll OR Finance OR Accounting OR Admin";
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
    location: deriveLocation(p),
  };
}
function deriveLocation(p = {}) {
  const city = p.city || p.person_city || p.current_city;
  const region = p.state || p.region || p.person_region || p.current_region;
  const country = p.country || p.country_name || p.person_country || p.current_country || p.location_country;
  const raw = p.location || p.current_location || p.person_location;
  return raw || joinNonEmpty(city, region, country);
}

async function apolloPOST(endpoint, body) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) log("apollo non-200", res.status, json || "");
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    log("apollo fetch error", e);
    return { ok: false, status: 0, json: null };
  }
}
async function apolloPeopleSearch({ body, timings }) {
  const endpoint = "https://api.apollo.io/v1/people/search";
  const t0 = now();
  const r = await apolloPOST(endpoint, body);
  if (timings) timings.provider_ms = (timings.provider_ms || 0) + ms(t0);
  if (!r.ok) return [];
  const j = r.json || {};
  const people = j.people || j.matches || j.results || [];
  return people.map(mapApollo);
}
async function apolloPeopleByName({ name, keywords, limit = 25, timings, locations = [] }) {
  const body = {
    q_organization_name: name,
    q_keywords: keywords,
    page: 1,
    per_page: Math.min(Math.max(limit, 1), 25),
    person_locations: locations.length ? locations : ["United Arab Emirates"],
  };
  return apolloPeopleSearch({ body, timings });
}
async function apolloPeopleByDomain({ domain, keywords, limit = 25, timings, locations = [] }) {
  const body = {
    q_organization_domains: [domain],
    q_keywords: keywords,
    page: 1,
    per_page: Math.min(Math.max(limit, 1), 25),
    person_locations: locations.length ? locations : ["United Arab Emirates"],
  };
  return apolloPeopleSearch({ body, timings });
}
