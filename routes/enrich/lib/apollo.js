/**
 * Apollo provider wrapper
 * Exports:
 *   - compactApolloKeywords(text, limit?)
 *   - apolloPeopleByDomain(domain | {domain, ...opts})
 *   - apolloPeopleByName(name | {name, ...opts})
 *   - searchPeopleByCompany({ name, domain, linkedin_url, ...opts })
 *
 * Requires: APOLLO_API_KEY
 */

const API = "https://api.apollo.io/v1/people/search";

/* ---------------- helpers ---------------- */

function clean(s = "", n = 80) {
  return String(s).trim().replace(/\s+/g, " ").slice(0, n);
}
function pickRoleBucket(title = "") {
  const t = String(title).toLowerCase();
  if (/(hr|people|talent|recruit|human resources)/.test(t)) return "hr";
  if (/(admin|administrator|office|operations)/.test(t)) return "admin";
  if (/(finance|account|payroll|treasury)/.test(t)) return "finance";
  return "other";
}
function seniorityFromTitle(title = "") {
  const t = String(title).toLowerCase();
  if (/(chief|cxo|cfo|coo|chro|chief human|chief people|chief talent)/.test(t)) return "cxo";
  if (/(vp|vice president)/.test(t)) return "vp";
  if (/(director|head)/.test(t)) return "head";
  if (/(manager|lead)/.test(t)) return "manager";
  return "staff";
}
function mkLocation(p = {}) {
  const parts = [p.city, p.state, p.country].filter(Boolean);
  return parts.join(", ");
}

/** Deduplicate + keep salient tokens for org names */
export function compactApolloKeywords(text = "", limit = 6) {
  const stop = new Set([
    "the","and","of","for","inc","llc","ltd","company","co","group","international","global","solutions","services"
  ]);
  const toks = String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const uniq = [];
  for (const t of toks) {
    if (stop.has(t) || t.length < 3) continue;
    if (!uniq.includes(t)) uniq.push(t);
  }
  return uniq.slice(0, limit);
}

/* ---------------- core HTTP ---------------- */

async function callApollo(body) {
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    console.warn("apollo: missing APOLLO_API_KEY");
    return { people: [] };
  }

  const resp = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": key,
    },
    body: JSON.stringify(body),
  });

  const status = resp.status;
  if (!resp.ok) {
    let payload = null;
    try { payload = await resp.json(); } catch {}
    console.error("apollo non-200", status, payload || await resp.text());
    return { people: [] };
  }

  try { return await resp.json(); } catch { return { people: [] }; }
}

function normalizeResults(arr = []) {
  const list = Array.isArray(arr) ? arr : [];
  return list.map((p) => {
    const fullName = p.name || [p.first_name, p.last_name].filter(Boolean).join(" ");
    const title = p.title || p.label || p.headline || "";
    const email = p.email || p.primary_email || p.personal_emails?.[0] || p.work_email || null;
    const email_status = p.email_status || (email ? "provider" : "unknown");
    const location = mkLocation(p) || p.location || p.city || "";
    const confidence = typeof p.confidence === "number" ? p.confidence : (email ? 0.9 : 0.85);

    return {
      name: fullName,
      designation: title,
      linkedin_url: p.linkedin_url || p.linkedin || null,
      email,
      email_status,
      email_reason: email ? "provider" : "no_email",
      role_bucket: pickRoleBucket(title),
      seniority: seniorityFromTitle(title),
      source: "live",
      confidence,
      location,
      pattern_hint: p.email_pattern || p.pattern || null,
    };
  }).filter(r => ["hr","admin","finance"].includes(r.role_bucket));
}

/* ---------------- outward API ---------------- */

/**
 * apolloPeopleByDomain(domainOrOpts)
 * domainOrOpts: string | { domain, page?, per_page?, locations?, departments?, seniorities? }
 */
export async function apolloPeopleByDomain(domainOrOpts) {
  const opts = typeof domainOrOpts === "string" ? { domain: domainOrOpts } : (domainOrOpts || {});
  const {
    domain,
    page = 1,
    per_page = 25,
    locations = ["United Arab Emirates"],
    departments = ["Human Resources", "Administrative", "Accounting", "Finance"],
    seniorities = ["manager","head","director","vp","cxo","lead","owner","partner","principal","staff"],
  } = opts;

  if (!domain) return [];

  const body = {
    page,
    per_page,
    person_locations: locations,
    person_departments: departments,
    person_seniorities: seniorities,
    organization_domains: [String(domain).toLowerCase()],
  };

  const data = await callApollo(body);
  const people = Array.isArray(data.people) ? data.people
                : Array.isArray(data.contacts) ? data.contacts
                : [];
  return normalizeResults(people);
}

/**
 * apolloPeopleByName(nameOrOpts)
 */
export async function apolloPeopleByName(nameOrOpts) {
  const opts = typeof nameOrOpts === "string" ? { name: nameOrOpts } : (nameOrOpts || {});
  const {
    name,
    page = 1,
    per_page = 25,
    locations = ["United Arab Emirates"],
    departments = ["Human Resources", "Administrative", "Accounting", "Finance"],
    seniorities = ["manager","head","director","vp","cxo","lead","owner","partner","principal","staff"],
  } = opts;

  if (!name) return [];

  const body = {
    page,
    per_page,
    person_locations: locations,
    person_departments: departments,
    person_seniorities: seniorities,
    q_organization_name: clean(name, 50),
  };

  const data = await callApollo(body);
  const people = Array.isArray(data.people) ? data.people
                : Array.isArray(data.contacts) ? data.contacts
                : [];
  return normalizeResults(people);
}

/**
 * searchPeopleByCompany — convenience chooser used by search.js
 */
export async function searchPeopleByCompany({ name, domain, linkedin_url } = {}) {
  if (domain) {
    return apolloPeopleByDomain({ domain });
  }
  if (name) {
    return apolloPeopleByName({ name });
  }
  // last resort: try compacted keywords from linkedin_url/company name mash
  const kw = clean((linkedin_url || name || ""), 80);
  const tokens = compactApolloKeywords(kw, 4).join(" ");
  if (tokens) return apolloPeopleByName(tokens);
  return [];
}

export default {
  compactApolloKeywords,
  apolloPeopleByDomain,
  apolloPeopleByName,
  searchPeopleByCompany,
};
