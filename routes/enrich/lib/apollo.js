/**
 * Apollo provider wrapper (uses X-Api-Key header).
 * Exports:
 *  - searchPeopleByCompany({ name?, domain?, limit?, roleFilters? })
 *  - apolloPeopleByDomain(domain, { limit?, roleFilters? })
 *  - compactApolloKeywords(q)
 *  - deriveLocation(person)
 */

const APOLLO_BASE = "https://api.apollo.io/v1";

function apolloHeaders() {
  const key = process.env.APOLLO_API_KEY || "";
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Api-Key": key, // IMPORTANT: header (not query string)
  };
}

function roleFiltersToQuery(roleFilters = ["hr","admin","finance"]) {
  // Titles we care about (high recall but focused)
  const titles = [
    "hr", "human resources", "talent", "recruit", "people", "people operations", "people & culture",
    "admin", "office manager", "operations",
    "finance", "account", "payroll"
  ];
  // Apollo uses 'person_titles' OR 'q_keywords' depending on endpoint; we’ll use q_keywords to be flexible
  return titles.join(" OR ");
}

async function apolloPOST(path, body) {
  if (!process.env.APOLLO_API_KEY) {
    return { ok: true, people: [], provider: "mock", reason: "no_api_key" };
  }
  const resp = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: apolloHeaders(),
    body: JSON.stringify(body || {}),
  });
  if (!resp.ok) {
    let err;
    try { err = await resp.json(); } catch { err = { error: await resp.text() }; }
    console.error("apollo non-200", resp.status, err);
    return { ok: false, error: err?.error || `apollo_${resp.status}` };
  }
  return await resp.json();
}

export async function searchPeopleByCompany({ name, domain, limit = 10, roleFilters } = {}) {
  const per_page = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const q_keywords = roleFiltersToQuery(roleFilters);

  const body = {
    q_keywords,
    person_locations: ["United Arab Emirates"],
    person_seniority_levels: ["manager","director","vp","cxo","head","senior","staff"],
    organization_domains: domain ? [domain] : undefined,
    organization_names: !domain && name ? [name] : undefined,
    page: 1,
    per_page,
  };

  const data = await apolloPOST("/people/search", body);
  if (!data || !data.people) return [];
  return data.people;
}

export async function apolloPeopleByDomain(domain, { limit = 10, roleFilters } = {}) {
  if (!domain) return [];
  const people = await searchPeopleByCompany({ domain, limit, roleFilters });
  return people;
}

export function compactApolloKeywords(q = "") {
  return String(q).replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").trim();
}

export function deriveLocation(p = {}) {
  return (
    p?.location ||
    [p?.city, p?.state, p?.country].filter(Boolean).join(", ") ||
    ""
  );
}

export default {
  searchPeopleByCompany,
  apolloPeopleByDomain,
  compactApolloKeywords,
  deriveLocation,
};
