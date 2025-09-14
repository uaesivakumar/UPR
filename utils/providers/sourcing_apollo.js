// utils/providers/sourcing_apollo.js
//
// Apollo provider adapter: fetch real people by company + departments.
// Auth via header: X-Api-Key (per Apollo deprecation notice).
//
// Scopes needed:
//   - api/v1/people/search   (required)
//   - api/v1/mixed_people/search (tick if visible; we fall back to it)
// Optional:
//   - api/v1/organizations/search, api/v1/organizations/show
//
// ENV:
//   APOLLO_API_KEY=sk_... (required)
//   APOLLO_DEFAULT_COUNTRY="United Arab Emirates" (optional)
//
// Notes:
// - We do discovery only (no email reveal). UPR will pattern+SMTP-verify.
// - We filter to real names (must contain space) and map dept from title.

const API_KEY = process.env.APOLLO_API_KEY || null;
const DEFAULT_COUNTRY = process.env.APOLLO_DEFAULT_COUNTRY || "United Arab Emirates";

const TITLE_MAP = {
  hr: ["hr", "human resources", "people"],
  hrbp: ["hrbp", "business partner"],
  ta: ["talent", "recruit", "acquisition", "sourcing"],
  payroll: ["payroll"],
  finance: ["finance", "account", "controller", "cfo", "fp&a"],
  admin: ["admin", "administration"],
  office_admin: ["office admin", "office manager", "facilities"],
  onboarding: ["onboarding", "people operations", "people ops"],
};

function cleanStr(s){ if(!s) return null; const t=String(s).trim(); return t.length?t:null; }
function uniq(a){ return [...new Set((a||[]).filter(Boolean))]; }
function normDomain(u){
  try { return new URL(u).hostname; }
  catch { const s=String(u||"").trim().toLowerCase(); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)?s:null; }
}
function buildTitleQuery(departments=[]){
  const keys = uniq(departments.flatMap(d => TITLE_MAP[d]||[]));
  return keys.length ? keys.join("|") : null; // e.g. "hr|talent|payroll"
}
function guessDeptFromTitle(title){
  const t = String(title||"").toLowerCase();
  for (const [id, keys] of Object.entries(TITLE_MAP)){
    if (keys.some(k => t.includes(k))){
      return ({hr:"HR",hrbp:"HRBP",ta:"Talent Acquisition",payroll:"Payroll",finance:"Finance",admin:"Admin",office_admin:"Office Admin",onboarding:"Onboarding"})[id]||null;
    }
  }
  return null;
}
function mapPeopleToContacts(people){
  return (people||[]).map((p,i)=>{
    const name = cleanStr(p?.name) || cleanStr(p?.full_name) ||
      (p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : null);
    const title = cleanStr(p?.title) || cleanStr(p?.headline) || cleanStr(p?.employment_title);
    const linkedin = cleanStr(p?.linkedin_url) || cleanStr(p?.linkedin_profile_url) || null;
    return {
      id: p?.id || undefined,
      name: name || null,
      title: title || null,
      dept: guessDeptFromTitle(title),
      linkedin: linkedin,
      email: null,
      email_guess: null,
      email_status: "unknown",
      confidence: null,
      _provider: "apollo",
      _k: `${name || "x"}-${i}`,
    };
  }).filter(c => c.name && /\s/.test(c.name)); // real person only
}

export async function fetchApolloContacts({ company, departments = [], limit = 10, country = DEFAULT_COUNTRY }) {
  if (!API_KEY) return [];

  const domain = normDomain(company?.website) || normDomain(company?.linkedin) || null;
  const person_titles = buildTitleQuery(departments);
  const body = {
    page: 1,
    per_page: Math.min(Math.max(5, limit), 50),
    person_titles: person_titles || undefined,
    organization_locations: [country].filter(Boolean),
    q_organization_domains: domain ? [domain] : undefined,
    organization_name: !domain ? cleanStr(company?.name) : undefined,
  };

  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "X-Api-Key": API_KEY,
  };

  // Try people/search first, then mixed_people/search
  const endpoints = [
    "https://api.apollo.io/api/v1/people/search",
    "https://api.apollo.io/api/v1/mixed_people/search",
  ];

  for (const url of endpoints){
    try {
      const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const people = Array.isArray(data?.people) ? data.people :
                     Array.isArray(data?.contacts) ? data.contacts : [];
      const contacts = mapPeopleToContacts(people);
      if (contacts.length) return contacts;
    } catch { /* try next */ }
  }
  return [];
}
