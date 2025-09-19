/**
 * Quality scoring for an enrichment result set.
 *   company: { domain, linkedin_url, hq, industry, size }
 *   results: [{ role_bucket, email_status, location, emirate, source, confidence }]
 * Returns: { score: 0..1, explanation: string }
 */
function inUAE(hq = "") {
  const s = String(hq).toLowerCase();
  const emirates = ["abu dhabi","dubai","sharjah","ajman","fujairah","ras al khaimah","umm al quwain","united arab emirates"];
  return emirates.some(e => s.includes(e));
}

export function scoreQuality(company = {}, results = []) {
  let score = 0;
  const notes = [];

  if (company.domain)       { score += 0.30; notes.push("has primary domain"); }
  if (company.linkedin_url) { score += 0.10; notes.push("LinkedIn page found"); }
  if (company.hq && inUAE(company.hq)) { score += 0.10; notes.push("HQ in UAE"); }
  if (company.industry)     { score += 0.05; }
  if (company.size)         { score += 0.05; }

  // Prefer UAE + HR/Admin/Finance contacts
  const buckets = new Set(["hr","admin","finance"]);
  const isUAE = (loc="") => {
    const s = String(loc).toLowerCase();
    return ["abu dhabi","dubai","sharjah","ajman","fujairah","ras al khaimah","umm al quwain","united arab emirates"].some(x => s.includes(x));
  };
  const useful = results.filter(r => buckets.has(String(r.role_bucket||"").toLowerCase()) &&
    (isUAE(r.emirate) || isUAE(r.location)));
  if (useful.length) {
    const boost = Math.min(0.30, useful.length * 0.05); // up to +0.30
    score += boost;
    notes.push(`${useful.length} UAE HR/admin/finance contacts`);
  }

  // Email status quality (up to +0.20)
  const st = results.map(r => String(r.email_status||"unknown").toLowerCase());
  const valid = st.filter(s => s==="valid").length;
  const acceptAll = st.filter(s => s==="accept_all").length;
  const patterned = st.filter(s => s==="patterned").length;
  const denom = results.length || 1;
  const ratio = (valid + 0.6*acceptAll + 0.8*patterned) / denom;
  score += Math.min(0.20, ratio * 0.20);
  notes.push(`email pattern≈${Math.round(ratio*100)}%`);

  return { score: Math.max(0, Math.min(1, score)), explanation: notes.join("; ") || "no signals" };
}

export default { scoreQuality };
