/**
 * Quality scoring for an enrichment result set.
 * Input:
 *   company (object) — fields we may use: domain, linkedin_url, hq, industry, size
 *   results (array) — contacts with role_bucket, email_status, location/emirate, source, confidence
 * Output:
 *   { score: number 0..1, explanation: string }
 */

function pct(x) { return Math.round(x * 100); }
function hasUAE(hq = "") {
  const s = String(hq).toLowerCase();
  return s.includes("united arab emirates") || ["abu dhabi","dubai","sharjah","ajman","fujairah","ras al khaimah","umm al quwain"].some(e => s.includes(e));
}

export function scoreQuality(company = {}, results = []) {
  let score = 0;
  const notes = [];

  // Company metadata signals
  if (company.domain)        { score += 0.30; notes.push("has primary domain"); }
  if (company.linkedin_url)  { score += 0.10; notes.push("LinkedIn page found"); }
  if (company.hq && hasUAE(company.hq)) { score += 0.10; notes.push("HQ in UAE"); }
  if (company.industry)      { score += 0.05; }
  if (company.size)          { score += 0.05; }

  // Contact signals (favor HR/Admin/Finance and UAE)
  const buckets = new Set(["hr","admin","finance"]);
  const contactsUAE = results.filter(r => {
    const emirate = (r.emirate || "").toLowerCase();
    const loc = String(r.location || "").toLowerCase();
    const inUAE = ["abu dhabi","dubai","sharjah","ajman","fujairah","ras al khaimah","umm al quwain","united arab emirates"].some(k => emirate.includes(k) || loc.includes(k));
    return inUAE && buckets.has(String(r.role_bucket || "").toLowerCase());
  });
  const kept = contactsUAE.length;
  if (kept > 0) {
    // up to +0.30 for useful UAE contacts
    const contactBoost = Math.min(0.30, kept * 0.05); // 5% per contact, cap at 6 contacts
    score += contactBoost;
    notes.push(`${kept} UAE HR/admin/finance contacts`);
  }

  // Email pattern/verification quality (up to +0.20)
  const emailStatuses = results.map(r => String(r.email_status || "unknown").toLowerCase());
  const valid = emailStatuses.filter(s => s === "valid").length;
  const acceptAll = emailStatuses.filter(s => s === "accept_all").length;
  const patterned = emailStatuses.filter(s => s === "patterned").length;
  const denom = results.length || 1;
  // treat valid=1.0, accept_all=0.6, patterned=0.8 toward pattern quality
  const qualityRatio = (valid + 0.6*acceptAll + 0.8*patterned) / denom;
  score += Math.min(0.20, qualityRatio * 0.20);
  if (denom > 0) {
    const approx = Math.round(qualityRatio * 100);
    notes.push(`email pattern≈${approx}%`);
  }

  // clamp
  if (score < 0) score = 0;
  if (score > 1) score = 1;

  return {
    score,
    explanation: notes.length ? notes.join("; ") : "no signals",
  };
}

export default { scoreQuality };
