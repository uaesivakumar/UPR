// utils/providers/apollo.js
// Apollo People Search provider using Node 18+ global fetch (no node-fetch dep)

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function assertKey() {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY missing");
  }
}

async function apolloPost(path, body = {}) {
  assertKey();
  const resp = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      accept: "application/json",
      "x-api-key": process.env.APOLLO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // fall through
  }

  if (!resp.ok) {
    const errMsg = json?.error || json?.message || text || resp.statusText;
    throw new Error(`Apollo ${path} ${resp.status}: ${errMsg}`);
  }
  return json ?? {};
}

/**
 * Try a domain-restricted search first; if empty, fall back to org name.
 */
export async function apolloMixedPeopleSearch({
  domain,
  orgName,
  locations = [],
  titles = [],
  page = 1,
  perPage = 25,
}) {
  const basePayload = {
    page,
    per_page: perPage,
    person_locations: locations,
    person_titles: titles,
  };

  if (domain) {
    const r1 = await apolloPost("/mixed_people/search", {
      ...basePayload,
      q_organization_domains: [domain],
    });
    if ((r1.people?.length || 0) > 0) return r1.people;
  }

  if (orgName) {
    const r2 = await apolloPost("/mixed_people/search", {
      ...basePayload,
      organization_name: orgName,
    });
    if ((r2.people?.length || 0) > 0) return r2.people;
  }

  return [];
}

export default { apolloMixedPeopleSearch };
