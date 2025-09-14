// utils/providers/sourcing_apollo.js
//
// Apollo provider adapter: fetch real people by company + departments.
// NOTES
// - Requires: APOLLO_API_KEY in env.
// - We DO NOT reveal emails here to save credits; we just return real names,
//   titles, LinkedIn (when present) and company match. Our existing email
//   patterning + optional SMTP verification will handle addresses.
//
// API shape on Apollo changes occasionally; we try two well-known endpoints.
// If the first fails, we retry a second path. We also keep payload minimal
// and tolerant to field name differences.

const API_KEY = process.env.APOLLO_API_KEY || null;

// Map our department ids to title keywords.
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

function cleanStr(s) {
  if (!s) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}
function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}
function buildTitleQuery(departments = []) {
  if (!Array.isArray(departments) || departments.length === 0) return null;
  const keys = uniq(
    departments.flatMap((d) => TITLE_MAP[d] || [])
  );
  if (!keys.length) return null;
  // Apollo supports OR-style simple search for titles; we join with pipes.
  // Example: "hr|talent|payroll"
  return keys.join("|");
}

function normDomain(u) {
  try {
    const url = new URL(u);
    return url.hostname;
  } catch {
    const s = String(u || "").trim().toLowerCase();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return s;
    return null;
  }
}

/**
 * Fetch people for a given company.
 * @param {Object} opts
 * @param {Object} opts.company  - expects { website?, linkedin?, name? }
 * @param {string[]} opts.departments - e.g., ['hr','ta',...]
 * @param {number} opts.limit    - max contacts to return (default 10)
 * @param {string} opts.country  - filter country (default 'United Arab Emirates')
 */
export async function fetchApolloContacts({ company, departments = [], limit = 10, country = "United Arab Emirates" }) {
  if (!API_KEY) return []; // not configured

  const titleQuery = buildTitleQuery(departments) || null;
  const domain =
    normDomain(company?.website) ||
    normDomain(company?.linkedin) ||
    null;

  // Build base payload (tolerant to API variations)
  const basePayload = {
    api_key: API_KEY, // historically accepted in body
    page: 1,
    per_page: Math.min(Math.max(5, limit), 50),
    person_location: country,
    // Favor current employment and company match by domain when available
    q_organization_domains: domain ? [domain] : undefined,
    organization_name: !domain ? cleanStr(company?.name) : undefined,
    person_titles: titleQuery || undefined,
    // Do not force email reveal; we’ll pattern/verify ourselves
    // open_email: "No", // (leave out to avoid credit spend)
  };

  // Try primary endpoint; if it fails, try fallback path.
  const endpoints = [
    "https://api.apollo.io/v1/people/search",
    "https://api.apollo.io/api/v1/people/search",
  ];

  let results = null;
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(basePayload),
      });
      if (resp.ok) {
        results = await resp.json();
        break;
      }
    } catch {
      // continue to next endpoint
    }
  }

  const people = Array.isArray(results?.people) ? results.people : Array.isArray(results?.contacts) ? results.contacts : [];

  // Map to UPR’s contact shape
  const contacts = people.map((p, i) => {
    const name =
      cleanStr(p?.name) ||
      cleanStr(p?.full_name) ||
      cleanStr(p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : null);

    const title =
      cleanStr(p?.title) ||
      cleanStr(p?.headline) ||
      cleanStr(p?.employment_title);

    const linkedin =
      cleanStr(p?.linkedin_url) ||
      cleanStr(p?.linkedin_profile_url) ||
      null;

    const dept = guessDeptFromTitle(title);

    return {
      id: p?.id || undefined,
      name: name || null,
      title: title || null,
      dept: dept || null,
      linkedin: linkedin || null,
      email: null,              // we don’t reveal in provider to save credits
      email_guess: null,
      email_status: "unknown",
      confidence: null,
      _provider: "apollo",
      _k: `${name || "x"}-${i}`,
    };
  });

  // Keep only rows with real person names (First Last)
  return contacts.filter((c) => c.name && /\s/.test(c.name));
}

function guessDeptFromTitle(title) {
  const t = String(title || "").toLowerCase();
  for (const [id, keys] of Object.entries(TITLE_MAP)) {
    if (keys.some((k) => t.includes(k))) {
      return (
        {
          hr: "HR",
          hrbp: "HRBP",
          ta: "Talent Acquisition",
          payroll: "Payroll",
          finance: "Finance",
          admin: "Admin",
          office_admin: "Office Admin",
          onboarding: "Onboarding",
        }[id] || null
      );
    }
  }
  return null;
}
