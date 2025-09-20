/**
 * Quality scoring utilities
 *  - roleBucket(title)
 *  - bucketSeniority(title)
 *  - scoreCandidate(c)
 *  - qualityScore(companyGuess, candidates)
 *  - computeQuality(candidates, companyGuess)  // NEW for enrich/search.js
 *  - scoreQuality(...)  // alias kept for older imports
 */

const HR_RX = /(human\s*resources|hr|talent|recruit(ing|er)?|people ops?|people\s*(and)?\s*culture)/i;
const ADMIN_RX = /\b(admin(istration)?|office\s*manager|operations?|ops)\b/i;
const FIN_RX = /\b(finance|account(s|ing)?|payroll|fp&a)\b/i;

export function roleBucket(title = "") {
  if (HR_RX.test(title)) return "hr";
  if (ADMIN_RX.test(title)) return "admin";
  if (FIN_RX.test(title)) return "finance";
  return "other";
}

export function bucketSeniority(title = "") {
  const t = String(title).toLowerCase();
  if (/chief|cxo|cfo|coo|chro|vp|vice president|director|head/.test(t)) return "head";
  if (/lead|manager|supervisor/.test(t)) return "manager";
  if (/sr\.?|senior/.test(t)) return "senior";
  if (/intern|junior|assistant/.test(t)) return "junior";
  return "staff";
}

export function scoreCandidate(c = {}) {
  let s = 0.5;
  const bucket = c.role_bucket || roleBucket(c.designation || c.title || "");
  const senior = c.seniority || bucketSeniority(c.designation || c.title || "");

  if (bucket === "hr") s += 0.2;
  if (bucket === "admin" || bucket === "finance") s += 0.1;
  if (c.emirate && c.emirate !== "United Arab Emirates") s += 0.1;
  if (senior === "head" || senior === "manager") s += 0.05;

  if (c.email_status === "valid") s += 0.1;
  if (c.email_status === "accept_all") s += 0.02;

  s = Math.max(0, Math.min(0.98, s));
  return Number(s.toFixed(2));
}

export function qualityScore(companyGuess = {}, candidates = []) {
  let s = 0.5;
  if (companyGuess?.domain) s += 0.15;
  if (companyGuess?.linkedin_url) s += 0.05;

  const uaeCount =
    candidates.filter((c) =>
      (c.emirate || "").length &&
      (c.country || "").toLowerCase().includes("united arab emirates")
    ).length ||
    candidates.filter((c) =>
      (c.location || "").toLowerCase().includes("united arab emirates")
    ).length;

  if (uaeCount >= 5) s += 0.15;
  else if (uaeCount >= 1) s += 0.05;

  const patterned = candidates.filter(
    (c) => c.email && !c.email.includes("@example.")
  ).length;
  if (patterned >= 5) s += 0.15;
  else if (patterned >= 1) s += 0.05;

  return Number(Math.max(0, Math.min(0.98, s)).toFixed(2));
}

/**
 * New wrapper for enrich/search.js
 * Returns both score and human explanation
 */
export function computeQuality(candidates = [], companyGuess = {}) {
  const score = qualityScore(companyGuess, candidates);
  let explanation = "Base quality score.";
  if (!candidates.length) {
    explanation = "No candidates to score.";
  } else if (score > 0.8) {
    explanation = "High-quality match with multiple valid signals.";
  } else if (score > 0.6) {
    explanation = "Moderate-quality match with some signals.";
  } else {
    explanation = "Low-quality match or insufficient data.";
  }
  return { score, explanation };
}

// legacy alias
export const scoreQuality = qualityScore;

export default {
  roleBucket,
  bucketSeniority,
  scoreCandidate,
  qualityScore,
  computeQuality,
  scoreQuality,
};
