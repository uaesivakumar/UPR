const HR_WORDS = ["HR","Human Resources","People","Talent","Recruiting","People Operations","Head of People","HR Manager","HR Director","Compensation","Benefits","Payroll"];
const ADMIN_WORDS = ["Admin","Administration","Office Manager","Executive Assistant"];
const FIN_WORDS = ["Finance","Financial Controller","CFO","Accounts","Accounting","Procurement"];

export function roleBucket(title = "") {
  const t = String(title || "").toLowerCase();
  if (HR_WORDS.some(k => t.includes(k.toLowerCase()))) return "hr";
  if (ADMIN_WORDS.some(k => t.includes(k.toLowerCase()))) return "admin";
  if (FIN_WORDS.some(k => t.includes(k.toLowerCase()))) return "finance";
  return "other";
}

export function bucketSeniority(title = "") {
  const t = String(title).toLowerCase();
  if (/head|chief|director|vp|vice president/.test(t)) return "head";
  if (/manager|lead|principal/.test(t)) return "manager";
  if (/intern|assistant|junior|assoc/.test(t)) return "ic";
  return "ic";
}

export function scoreCandidate({ role_bucket, seniority, geo_fit = 0.7, email_status = "unknown", company_match = 0.8 }) {
  let s = 0;
  if (["hr","admin","finance"].includes(role_bucket)) s += 0.25;
  if (seniority === "head") s += 0.15;
  else if (seniority === "manager") s += 0.1;

  if (geo_fit >= 1) s += 0.25; else s += 0.15;

  s += Math.max(0, Math.min(1, company_match)) * 0.2;

  const emailGain = { provider: 0.25, valid: 0.25, accept_all: 0.15, patterned: 0.08, unknown: 0.05, invalid: -0.2 };
  s += emailGain[email_status] ?? 0;

  return Math.max(0, Math.min(1, s));
}

export function qualityScore({ domain, linkedin_url, uaeCount, patternConfidence, hq }) {
  let s = 0;
  if (domain) s += 0.2;
  if (linkedin_url) s += 0.15;
  if (uaeCount) s += Math.min(uaeCount, 10) / 10 * 0.4;
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
