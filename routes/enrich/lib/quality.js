/**
 * Quality heuristics for companies & candidates
 * Exports:
 *   - roleBucket(title)
 *   - bucketSeniority(title)
 *   - scoreCandidate(c)
 *   - qualityScore(summaryLike)       // company-level
 *   - scoreQuality(summaryLike)       // alias for back-compat
 */

export function roleBucket(title = "") {
  const t = String(title).toLowerCase();
  if (/(hr|people|talent|recruit|human resources)/.test(t)) return "hr";
  if (/(admin|administrator|office|operations)/.test(t)) return "admin";
  if (/(finance|account|payroll|treasury)/.test(t)) return "finance";
  return "other";
}

export function bucketSeniority(title = "") {
  const t = String(title).toLowerCase();
  if (/(chief|cxo|cfo|coo|chro|chief human|chief people|chief talent)/.test(t)) return "cxo";
  if (/(vp|vice president)/.test(t)) return "vp";
  if (/(director)/.test(t)) return "director";
  if (/(head)/.test(t)) return "head";
  if (/(manager|lead)/.test(t)) return "manager";
  return "staff";
}

export function scoreCandidate(c = {}) {
  let s = 0.5;

  const bucket = c.role_bucket || roleBucket(c.designation || c.title);
  if (["hr","admin","finance"].includes(bucket)) s += 0.15;
  const senior = c.seniority || bucketSeniority(c.designation || c.title);
  if (["manager","head","director","vp","cxo"].includes(senior)) s += 0.1;

  if (typeof c.confidence === "number") {
    s += Math.max(-0.1, Math.min(0.2, c.confidence - 0.85));
  }

  if (c.emirate || /united arab emirates|uae/i.test(c.location || "")) s += 0.05;

  const emailStatus = String(c.email_status || "").toLowerCase();
  if (emailStatus === "valid" || emailStatus === "provider") s += 0.1;
  if (emailStatus === "accept_all") s += 0.03;

  return Math.max(0, Math.min(1, s));
}

/** Company-level scoring */
export function qualityScore(summary = {}) {
  let s = 0.5;

  if (summary.company_guess?.domain) s += 0.15;
  if (summary.company_guess?.linkedin_url) s += 0.1;

  const kept = Number(summary.kept || summary.total_candidates || 0);
  if (kept >= 5) s += 0.1;
  if (kept >= 10) s += 0.05;

  if (summary.email_pattern_confidence >= 0.7) s += 0.05;

  return Math.max(0, Math.min(1, s));
}

/** Back-compat alias */
export const scoreQuality = qualityScore;

export default {
  roleBucket,
  bucketSeniority,
  scoreCandidate,
  qualityScore,
  scoreQuality,
};
