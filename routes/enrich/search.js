import express from "express";

// Import libs defensively as namespaces to avoid named-export breakages
import * as apollo from "./lib/apollo.js";
import * as llm from "./lib/llm.js";
import * as geo from "./lib/geo.js";
import * as quality from "./lib/quality.js";
import * as email from "./lib/email.js";

const router = express.Router();

/* ------------------------------ helpers/utils ------------------------------ */

const pickFn = (...cands) => cands.find((f) => typeof f === "function");

const toDomain = (str) => {
  if (!str) return "";
  const s = String(str).trim();
  try {
    if (/^https?:\/\//i.test(s)) return new URL(s).hostname.replace(/^www\./i, "");
    // already looks like a domain
    return s.replace(/^www\./i, "").split("/")[0];
  } catch {
    return s.replace(/^www\./i, "").split("/")[0];
  }
};

const emirateFallback = (loc = "") => {
  const s = String(loc || "").toLowerCase();
  if (s.includes("abu dhabi")) return "Abu Dhabi";
  if (s.includes("dubai")) return "Dubai";
  if (s.includes("sharjah")) return "Sharjah";
  if (s.includes("ajman")) return "Ajman";
  if (s.includes("umm al") || s.includes("uaq")) return "Umm Al Quwain";
  if (s.includes("ras al khaimah") || s.includes("rak")) return "Ras Al Khaimah";
  if (s.includes("fujairah")) return "Fujairah";
  return "";
};

const tagEmirate = geo.tagEmirate || emirateFallback;

const roleBucketGuess = (title = "") => {
  const t = String(title || "").toLowerCase();
  if (/hr|human\s*resources|talent|recruit/i.test(t)) return "hr";
  if (/admin|office\s*manager|secretar/i.test(t)) return "admin";
  if (/finance|account|payroll|treasur/i.test(t)) return "finance";
  return "other";
};

const guessEmailFromPattern = (pattern, name, domain) => {
  if (!pattern || !name || !domain) return null;
  const n = String(name).trim();
  const parts = n.split(/\s+/).filter(Boolean);
  const first = (parts[0] || "").toLowerCase().replace(/[^a-z]/g, "");
  const last = (parts[parts.length - 1] || "").toLowerCase().replace(/[^a-z]/g, "");
  const f = first[0] || "";
  const l = last[0] || "";

  let local = null;

  const p = String(pattern).toLowerCase();
  if (p.includes("first.last")) local = `${first}.${last}`;
  else if (p.includes("first_last")) local = `${first}_${last}`;
  else if (p.includes("firstlast")) local = `${first}${last}`;
  else if (p.includes("f.last")) local = `${f}.${last}`;
  else if (p.includes("firstl")) local = `${first}${l}`;
  else if (p.includes("first")) local = first;
  else if (p.includes("last")) local = last;

  if (!local) return null;
  return `${local}@${domain}`;
};

const qualityHeuristic = ({ company, results }) => {
  const domOk = !!company?.domain;
  const liOk = !!company?.linkedin_url;
  const uaeCount = (results || []).filter((r) => /united arab emirates|dubai|abu dhabi|sharjah|rak|fujairah|ajman|umm al quwain/i.test(String(r.location || ""))).length;
  const hrish = (results || []).filter((r) => /hr|human\s*resources|talent|recruit|people/i.test(String(r.designation || r.title || ""))).length;

  let score = 0.2 * (domOk ? 1 : 0) + 0.2 * (liOk ? 1 : 0);
  score += Math.min(0.3, (uaeCount / Math.max(1, results.length)) * 0.3);
  score += Math.min(0.3, (hrish / Math.max(1, results.length)) * 0.3);

  const explanation = [
    domOk ? "has primary domain" : null,
    liOk ? "LinkedIn page found" : null,
    `${uaeCount} UAE contacts`,
    `${hrish} HR/talent contacts`,
  ].filter(Boolean).join("; ");

  return { score: Math.max(0, Math.min(1, score)), explanation };
};

const withTimeout = (p, ms = 12000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/* ---------------------------------- route ---------------------------------- */

router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ ok: false, error: "missing q", data: { summary: null, results: [] } });

  const overrides = {
    name: (req.query.name || "").trim(),
    domain: toDomain(req.query.domain || ""),
    linkedin_url: (req.query.linkedin_url || "").trim(),
    parent: (req.query.parent || "").trim(),
  };

  const t0 = Date.now();
  let companyGuess = null;
  let llm_ms = 0;

  try {
    if (overrides.name || overrides.domain || overrides.linkedin_url || overrides.parent) {
      companyGuess = {
        name: overrides.name || q,
        domain: overrides.domain || "",
        linkedin_url: overrides.linkedin_url || "",
        parent: overrides.parent || "",
        mode: "manual",
      };
    } else {
      const guessFn = pickFn(apollo.guessCompany, llm.guessCompany, llm.companyGuess);
      if (guessFn) {
        companyGuess = await withTimeout(Promise.resolve(guessFn(q)));
      } else {
        companyGuess = { name: q, domain: "", mode: "guess" };
      }
      companyGuess.domain = toDomain(companyGuess.domain || companyGuess.website_url || "");
      companyGuess.mode = companyGuess.mode || "LLM";
    }
  } catch (e) {
    companyGuess = { name: q, domain: "", mode: "fallback" };
  } finally {
    llm_ms = Date.now() - t0;
  }

  const t1 = Date.now();
  let rawResults = [];
  let provider_ms = 0;
  let provider = "live";

  try {
    const peopleFn =
      pickFn(apollo.searchPeopleByCompany, apollo.searchPeople, apollo.peopleByCompany, apollo.apolloPeopleByCompany) ||
      null;
    if (peopleFn) {
      rawResults = await withTimeout(Promise.resolve(peopleFn(companyGuess, { q })), 10000);
    } else {
      rawResults = [];
    }
  } catch (_e) {
    rawResults = [];
  } finally {
    provider_ms = Date.now() - t1;
  }

  // Normalize + enrich each row
  const domain = companyGuess?.domain || toDomain(companyGuess?.website_url || "");
  const normalized = (rawResults || []).map((r) => {
    const name = r.name || r.full_name || r.fullName || "";
    const designation = r.designation || r.title || r.job_title || "";
    const linkedin_url = r.linkedin_url || r.linkedin || r.linkedinUrl || "";
    const location = r.location || r.city || r.region || "";
    const source = r.source || "live";
    const confidence = typeof r.confidence === "number" ? r.confidence : 0.8;

    // Replace provider pattern placeholders with actual guess if needed
    let emailAddr = r.email || "";
    if (emailAddr && /first|last|f\.|_/.test(emailAddr) && domain && name) {
      // looks like a pattern, try to resolve
      const localPart = emailAddr.split("@")[0] || "";
      const resolved = guessEmailFromPattern(localPart, name, domain);
      if (resolved) emailAddr = resolved;
    } else if (!emailAddr && r.pattern && domain && name) {
      const resolved = guessEmailFromPattern(r.pattern, name, domain);
      if (resolved) emailAddr = resolved;
    }

    return {
      name,
      designation,
      linkedin_url,
      email: emailAddr || null,
      email_status: r.email_status || (emailAddr ? "unknown" : "none"),
      email_reason: r.email_reason || (emailAddr ? "no_verifier" : "no_email"),
      role_bucket: r.role_bucket || roleBucketGuess(designation),
      seniority: r.seniority || r.level || null,
      source,
      confidence,
      location,
      emirate: tagEmirate(location),
    };
  });

  // Quality
  const qualityFn = pickFn(quality.scoreQuality, quality.qualityScore, quality.computeQuality);
  const qual = qualityFn ? qualityFn({ company: companyGuess, results: normalized }) : qualityHeuristic({ company: companyGuess, results: normalized });

  return res.json({
    ok: true,
    data: {
      summary: {
        provider,
        company_guess: companyGuess,
        quality: qual,
        timings: { llm_ms, provider_ms, smtp_ms: 0 },
      },
      results: normalized,
    },
  });
});

export default router;
