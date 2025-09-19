// utils/patternHelpers.js

export function bucketRole(title = "") {
  const t = title.toLowerCase();
  const hr = /(human\s*resources|hr\b|people|talent|recruit(ing|er)?|hrbp|comp(ensation)?|benefits|total\s*rewards|hr\s*ops|people\s*ops)/;
  return hr.test(t) ? "hr" : "other";
}

export function bucketSeniority(title = "") {
  const t = title.toLowerCase();
  if (/(chief|chro|vp|vice\s*president)/.test(t)) return "cxo";
  if (/director|head/.test(t)) return "director";
  if (/manager|lead/.test(t)) return "manager";
  return "ic";
}

export function isAgencyRecruiter(cand) {
  const t = (cand.designation || "").toLowerCase();
  const company = (cand.company_name || "").toLowerCase();
  const agency = /(consultant|agency|headhunter|rpo|recruitment\s*agency|talent\s*partner\s*\(external\))/;
  return agency.test(t) || agency.test(company);
}

/**
 * Confidence scoring (0..1 rounded to 2 decimals)
 */
export function scoreCandidate({ role_bucket, seniority, geo_fit, email_status, company_match }) {
  const role_fit = role_bucket === "hr" ? 1.0 : 0.0;
  const seniority_fit =
    seniority === "cxo" || seniority === "director" ? 1.0
      : seniority === "manager" ? 0.8
      : seniority === "ic" ? 0.4
      : 0.0;

  const email_verif =
    email_status === "valid" ? 1.0
      : email_status === "accept_all" ? 0.7
      : email_status === "patterned" ? 0.3
      : 0.0;

  const gf = typeof geo_fit === "number" ? Math.max(0, Math.min(1, geo_fit)) : 0.6;
  const cm = typeof company_match === "number" ? company_match : 1.0;

  const score =
    0.30 * role_fit +
    0.25 * seniority_fit +
    0.20 * gf +
    0.15 * email_verif +
    0.10 * cm;

  return Math.round(score * 100) / 100;
}
