// utils/apollo.js
import fetch from "node-fetch";

/**
 * Apollo wrapper (People Search).
 * Requires: process.env.APOLLO_API_KEY
 */
const APOLLO_BASE = "https://api.apollo.io/api/v1";

function assertKey() {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY missing");
  }
}

async function apolloPost(path, body) {
  assertKey();
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "accept": "application/json",
      "x-api-key": process.env.APOLLO_API_KEY,
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apollo ${path} ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/**
 * Try a domain-restricted search first; if it returns 0,
 * fall back to organization_name (less precise).
 */
export async function apolloMixedPeopleSearch({
  domain, orgName, locations = [], titles = [],
  page = 1, perPage = 25,
}) {
  const basePayload = {
    page, per_page: perPage,
    person_locations: locations,
    person_titles: titles,
  };

  // 1) Try domain
  if (domain) {
    const p1 = await apolloPost("/mixed_people/search", {
      ...basePayload,
      q_organization_domains: [domain],
    });
    if ((p1.people?.length || 0) > 0) return p1.people;
  }

  // 2) Fallback to organization name
  if (orgName) {
    const p2 = await apolloPost("/mixed_people/search", {
      ...basePayload,
      organization_name: orgName,
    });
    if ((p2.people?.length || 0) > 0) return p2.people;
  }

  // 3) Nothing
  return [];
}
