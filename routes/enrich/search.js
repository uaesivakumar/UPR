import express from "express";
import { resolveCompanyRich, cleanName } from "./lib/llm.js";
import {
  compactApolloKeywords, apolloPeopleByDomain, apolloPeopleByName,
  detectOrgDomain, deriveLocation
} from "./lib/apollo.js";
import { qualityScore, scoreCandidate, roleBucket, bucketSeniority } from "./lib/quality.js";
import { emirateFromLocation, isUAE } from "./lib/geo.js";
import { applyPattern, isProviderPlaceholderEmail, verifyEmail } from "./lib/email.js";

export default function buildSearchRouter({ pool }) {
  const router = express.Router();

  // GET /api/enrich/search?q=...
  router.get("/search", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ ok: false, error: "q is required" });

    const timings = {};
    try {
      // 1) Resolve company (LLM or guess)
      const guess = await resolveCompanyRich(q, timings);

      // 2) Query provider (Apollo) with UAE + role filters
      const HAS_APOLLO = !!(process.env.APOLLO_API_KEY || process.env.APOLLOIO_API_KEY || process.env.APOLLO_TOKEN);
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
        if (!people.length && Array.isArray(guess.synonyms)) {
          for (const s of guess.synonyms) {
            // eslint-disable-next-line no-await-in-loop
            const batch = await apolloPeopleByName({ name: s, keywords, limit: 25, timings, locations: locs });
            if (batch.length) { people = batch; break; }
          }
        }
      }

      // 3) No provider or empty -> light mock fallback
      if (!people.length) {
        const domain = (guess.domain || "example.com");
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
        const qs = qualityScore({
          domain: guess.domain,
          linkedin_url: guess.linkedin_url,
          uaeCount: 0,
          patternConfidence: 0,
          hq: guess.hq,
        });
        return res.json({
          ok: true,
          data: { status: "completed", company_id: null, results, summary: { provider: "mock", company_guess: guess, timings, quality: qs } }
        });
      }

      // 4) Normalize + filter (HR/Admin/Finance in UAE). Pattern & quick SMTP verify.
      const domain =
        people.map(detectOrgDomain).filter(Boolean)[0] ||
        guess.domain ||
        null;

      const normalized = [];
      for (const p of people) {
        const title = p.designation || p.title || "";
        const bucket = roleBucket(title);
        if (!["hr", "admin", "finance"].includes(bucket)) continue;

        const location = deriveLocation(p);
        const emirate = emirateFromLocation(location);
        if (!(emirate || isUAE(location))) continue;

        const first = p.first_name || (p.name || "").split(" ")[0] || "";
        const last  = p.last_name  || (p.name || "").split(" ").slice(-1)[0] || "";

        let email = p.email || null;
        let email_status = email ? "provider" : "unknown";
        let email_reason = email ? "provider_supplied" : undefined;

        if (email && isProviderPlaceholderEmail(email)) {
          email = null;
          email_status = "unknown";
          email_reason = "provider_placeholder";
        }
        if (!email && domain && first && last) {
          let e = applyPattern(first, last, "first.last", domain);
          if (e && typeof e === "string" && !/@/.test(e)) e = `${e}@${domain}`;
          email = e;
          email_status = "patterned";
          email_reason = "pattern_guess";
        }

        const seniority = bucketSeniority(title);
        const confidence = scoreCandidate({
          role_bucket: bucket,
          seniority,
          geo_fit: emirate ? 1.0 : 0.7,
          email_status,
          company_match: domain ? 1.0 : 0.6,
        });

        normalized.push({
          name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" ").trim(),
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

      // SMTP quick pass for top patterned emails
      const pk = normalized.filter(c => c.email && c.email_status === "patterned").slice(0, 10);
      const tSmtp = Date.now();
      for (const c of pk) {
        const v = await verifyEmail(c.email);
        if (v?.status) {
          c.email_status = v.status;
          c.email_reason = v.reason || c.email_reason;
        }
      }
      timings.smtp_ms = Date.now() - tSmtp;

      normalized.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

      const qs = qualityScore({
        domain,
        linkedin_url: guess.linkedin_url,
        uaeCount: normalized.length,
        patternConfidence: 0.8,
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
      return res.status(500).json({ ok: false, error: "search_failed" });
    }
  });

  return router;
}
