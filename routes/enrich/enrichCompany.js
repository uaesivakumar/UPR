import express from "express";
import { nanoid } from "nanoid";
import {
  compactApolloKeywords, apolloPeopleByDomain,
  deriveLocation
} from "./lib/apollo.js";
import { qualityScore, scoreCandidate, roleBucket, bucketSeniority } from "./lib/quality.js";
import { emirateFromLocation, isUAE } from "./lib/geo.js";
import {
  inferPatternFromSamples, applyPattern, isProviderPlaceholderEmail,
  loadPatternFromCache, savePatternToCache, verifyEmail
} from "./lib/email.js";

export default function buildEnrichCompanyRouter({ pool }) {
  const router = express.Router();
  const jobs = new Map();

  // POST /api/enrich  { company_id, max_contacts? }
  router.post("/", async (req, res) => {
    const { company_id, max_contacts = 3 } = req.body || {};
    if (!company_id) return res.status(400).json({ status: "error", error: "company_id_required" });

    const job_id = `enrich_${Date.now()}_${nanoid(6)}`;
    jobs.set(job_id, { status: "queued", company_id, results: [], summary: {} });

    try {
      const company = await getCompany(pool, company_id);
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

      const HAS_APOLLO = !!(process.env.APOLLO_API_KEY || process.env.APOLLOIO_API_KEY || process.env.APOLLO_TOKEN);
      let people = [];
      let provider = "none";

      const timings = {};
      if (HAS_APOLLO && company.domain) {
        const t0 = Date.now();
        people = await apolloPeopleByDomain({
          domain: company.domain,
          keywords: compactApolloKeywords(),
          limit: Math.min(Math.max(max_contacts * 8, 5), 25),
          locations: ["United Arab Emirates"],
        });
        timings.provider_ms = Date.now() - t0;
        provider = people.length ? "live" : "none";
      }

      // learn pattern from provider samples
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

      // from DB cache
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
          first_name: p.first_name || (p.name || "").split(" ")[0],
          last_name: p.last_name || (p.name || "").split(" ").slice(-1)[0],
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
      .filter(c => ["hr","admin","finance"].includes(c.role_bucket) && (c.emirate || isUAE(c.location)));

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

      // SMTP verify all kept later (but compute now)
      for (const c of candidates) {
        if (!c.email) continue;
        const v = await verifyEmail(c.email);
        c.email_status = v.status || c.email_status;
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
        try { saved.push(await upsertLead(pool, company_id, c)); }
        catch (e) { if (String(e?.code) !== "42P01") console.error("hr_leads upsert:", e); }
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
      const payload = { job_id, status: "error", error: "exception" };
      jobs.set(job_id, payload);
      return res.status(500).json(payload);
    }
  });

  // GET /api/enrich/:job_id
  router.get("/:job_id", (req, res) => {
    const job = jobs.get(req.params.job_id);
    if (!job) return res.status(404).json({ error: "job_not_found" });
    res.json(job);
  });

  return router;
}

/* ---------------- DB helpers ---------------- */
async function getCompany(pool, id) {
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
async function upsertLead(pool, company_id, c) {
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
