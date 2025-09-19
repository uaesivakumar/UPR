const APOLLO_API_KEY = process.env.APOLLO_API_KEY || process.env.APOLLOIO_API_KEY || process.env.APOLLO_TOKEN || "";

export function compactApolloKeywords() {
  // Short to avoid "Value too long" 422s
  return "HR OR Human Resources OR People OR Talent OR Recruiter OR Payroll OR Finance OR Accounting OR Admin";
}

export function detectOrgDomain(p) {
  const org = p.organization || p.company || p.employer || {};
  let d = org.domain || org.primary_domain || org.email_domain || null;
  if (!d && org.website_url) {
    try { d = new URL(org.website_url.startsWith("http") ? org.website_url : `https://${org.website_url}`).hostname; }
    catch {}
  }
  return d ? d.replace(/^www\./, "").toLowerCase() : null;
}

export function deriveLocation(p = {}) {
  const city = p.city || p.person_city || p.current_city;
  const region = p.state || p.region || p.person_region || p.current_region;
  const country = p.country || p.country_name || p.person_country || p.current_country || p.location_country;
  const raw = p.location || p.current_location || p.person_location;
  return raw || [city, region, country].filter(Boolean).join(", ");
}

function mapApollo(p) {
  return {
    name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.name || "",
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    title: p.title || p.position || "",
    designation: p.title || p.position || "",
    linkedin_url: p.linkedin_url || p.linkedin || "",
    email: p.email || null,
    organization: p.organization || p.company || p.employer || {
      domain: p.organization_domain || p.company_domain || null,
      website_url: p.organization_website_url || p.company_website_url || null,
    },
    seniority: p.seniority || null,
    location: deriveLocation(p),
  };
}

async function apolloPOST(endpoint, body) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) console.error("apollo non-200", res.status, json || "");
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    console.error("apollo fetch error", e);
    return { ok: false, status: 0, json: null };
  }
}

async function apolloPeopleSearch({ body, timings }) {
  const endpoint = "https://api.apollo.io/v1/people/search";
  const t0 = Date.now();
  const r = await apolloPOST(endpoint, body);
  if (timings) timings.provider_ms = (timings.provider_ms || 0) + (Date.now() - t0);
  if (!r.ok) return [];
  const j = r.json || {};
  const people = j.people || j.matches || j.results || [];
  return people.map(mapApollo);
}

export async function apolloPeopleByName({ name, keywords, limit = 25, timings, locations = [] }) {
  const body = {
    q_organization_name: name,
    q_keywords: keywords,
    page: 1,
    per_page: Math.min(Math.max(limit, 1), 25),
    person_locations: locations.length ? locations : ["United Arab Emirates"],
  };
  return apolloPeopleSearch({ body, timings });
}

export async function apolloPeopleByDomain({ domain, keywords, limit = 25, timings, locations = [] }) {
  const body = {
    q_organization_domains: [domain],
    q_keywords: keywords,
    page: 1,
    per_page: Math.min(Math.max(limit, 1), 25),
    person_locations: locations.length ? locations : ["United Arab Emirates"],
  };
  return apolloPeopleSearch({ body, timings });
}
