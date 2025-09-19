/**
 * Quality & classification helpers for enrichment.
 *
 * Exports:
 *  - roleBucket(title)
 *  - bucketSeniority(title)
 *  - scoreCandidate(candidate)
 *  - scoreQuality(company, results)       // main set-level scorer
 *  - qualityScore(company, results)       // alias used by enrichCompany.js
 */

function lc(s = "") { return String(s).toLowerCase(); }
function inUAEText(s = "") {
  const x = lc(s);
  return [
    "abu dhabi","dubai","sharjah","ajman","fujairah",
    "ras al khaimah","umm al quwain","united arab emirates","uae"
  ].some(k => x.includes(k));
}

export function roleBucket(title = "") {
  const t = lc(title);
  if (/(hr|people|talent|recruit|human resources)/.test(t)) return "hr";
  if (/(admin|administrator|office|operations)/.test(t))   return "admin";
  if (/(finance|account|payroll|treasury)/.test(t))        return "finance";
  return "other";
}

export function bucketSeniority(title = "") {
  const t = lc(title);
  if (/(chief|cxo|cfo|coo|chro|chief human|chief people|chief talent)/.test(t)) return "cxo";
  if (/(vp|vice president)/.test(t))                                             return "vp";
  if (/(director)/.test(t))                                                      return "director";
  if (/(head)/.test(t))                                                          return "head";
  if (/(manager|lead)/.test(t))                                                  return "manager";
  return "staff";
}

/**
 * scoreCandidate: 0..1
 * Considers bucket relevance (HR/Admin/Finance), emirate/UAE location,
 * email_status, and seniority.
 */
export function scoreCandidate(c = {}) {
  let s = 0;

  // Bucket relevance
  const bucket = (c.role_bucket || roleBucket(c.designation || c.title || "")).toLowerCase();
  if (bucket === "hr") s += 0.35;
  else if (bucket === "admin" || bucket === "finance") s += 0.25;
  else s += 0.05;

  // Location signal
  const loc = `${c.emirate || ""} ${c.location || ""}`;
  if (inUAEText(loc)) s += 0.25;

  // Email status
  const st = lc(c.email_status || "unknown");
  if (st === "valid") s += 0.25;
  else if (st === "accept_all") s += 0.18;
  else if (st === "patterned") s += 0.15;
  else if (st === "unknown") s += 0.05;

  // Seniority
  const sen = (c.seniority || bucketSeniority(c.designation || c.title || "")).toLowerCase();
  if (["cxo","vp","director","head"].includes(sen)) s += 0.10;
  else if (sen === "manager" || sen === "lead") s += 0.06;
  else s += 0.03;

  // Clamp
  if (s < 0) s = 0;
  if (s > 1) s = 1;
  return s;
}

/**
 * scoreQuality: set-level 0..1 with explanation
 * company: { domain, linkedin_url, hq, industry, size }
 * results: array of candidates
 */
export function scoreQuality(company = {}, results = []) {
  let score = 0;
  const notes = [];

  if (company.domain)       { score += 0.30; notes.push("has primary domain"); }
  if (company.linkedin_url) { score += 0.10; notes.push("LinkedIn page found"); }
  if (company.hq && inUAEText(company.hq)) { score += 0.10; notes.push("HQ in UAE"); }
  if (company.industry)     { score += 0.05; }
  if (company.size)         { score += 0.05; }

  // Useful contacts (UAE + relevant buckets)
  const useful = results.filter(r => ["hr","admin","finance"].includes(lc(r.role_bucket || "")) &&
    (inUAEText(r.emirate) || inUAEText(r.location)));
  if (useful.length) {
    const boost = Math.min(0.30, useful.length * 0.05); // up to +0.30
    score += boost;
    notes.push(`${useful.length} UAE HR/admin/finance contacts`);
  }

  // Email quality up to +0.20
  const st = results.map(r => lc(r.email_status || "unknown"));
  const valid = st.filter(x => x === "valid").length;
  const acceptAll = st.filter(x => x === "accept_all").length;
  const patterned = st.filter(x => x === "patterned").length;
  const denom = results.length || 1;
  const ratio = (valid + 0.6*acceptAll + 0.8*patterned) / denom;
  score += Math.min(0.20, ratio * 0.20);
  notes.push(`email pattern≈${Math.round(ratio*100)}%`);

  // Clamp and explain
  if (score < 0) score = 0;
  if (score > 1) score = 1;

  return { score, explanation: notes.join("; ") || "no signals" };
}

/** alias kept for compatibility with enrichCompany.js */
export const qualityScore = scoreQuality;

export default {
  roleBucket,
  bucketSeniority,
  scoreCandidate,
  scoreQuality,
  qualityScore,
};
