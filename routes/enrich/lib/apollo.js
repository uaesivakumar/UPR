// routes/enrich/lib/apollo.js
const APOLLO_BASE = "https://api.apollo.io/v1";

function apolloHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": process.env.APOLLO_API_KEY || "",
  };
}

function roleFiltersToQuery(roleFilters = ["hr", "admin", "finance"]) {
  return [
    "hr", "human resources", "talent", "recruit", "people", "people operations", "people & culture",
    "admin", "office manager", "operations",
    "finance", "account", "payroll",
  ].join(" OR ");
}

async function apolloPOST(path, body) {
  if (!process.env.APOLLO_API_KEY) return { ok: true, people: [], provider: "mock", reason: "no_api_key" };
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

export async function searchPeopleByCompany({ name, domain, limit = 20, roleFilters } = {}) {
  const per_page = Math.min(Math.max(Number(limit) || 20, 1), 25);
  const q_keywords = roleFiltersToQuery(roleFilters);
  const cleanDomain = (domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  const body = {
    q_keywords,
    person_locations: ["United Arab Emirates"],
    person_seniority_levels: ["manager","director","vp","cxo","head","senior","staff"],
    organization_domains: cleanDomain ? [cleanDomain] : undefined,
    organization_names: !cleanDomain && name ? [name] : undefined,
    page: 1,
    per_page,
  };

  const data = await apolloPOST("/people/search", body);
  return Array.isArray(data?.people) ? data.people : [];
}

function deriveLocation(p = {}) {
  return (
    p?.formatted_address ||
    p?.location ||
    [p?.city, p?.state, p?.country].filter(Boolean).join(", ") ||
    ""
  );
}

export async function enrichWithApollo(query = {}) {
  const start = Date.now();
  try {
    const { name, domain, limit } = query;
    const people = await searchPeopleByCompany({ name, domain, limit });

    const results = (people || []).map((p) => ({
      name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" "),
      designation: p.title || null,
      email: p.email || null,
      email_status: p.email_status || "unknown",
      linkedin_url: p.linkedin_url || null,
      emirate: deriveLocation(p),
      confidence: 0.70,
      source: "apollo",
      // carry org domain so the search handler can filter if needed
      org_domain: p?.organization?.primary_domain || null,
      company_domain: p?.organization?.primary_domain || null,
    }));

    const ms = Date.now() - start;
    console.log("[enrichWithApollo] got %d candidates in %dms", results.length, ms);
    return { ok: true, results, provider: "apollo", ms };
  } catch (e) {
    console.error("Apollo enrichment failed", e);
    return { ok: false, results: [], provider: "apollo", error: String(e?.message || e) };
  }
}

export default { searchPeopleByCompany, enrichWithApollo };
