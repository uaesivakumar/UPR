// utils/providers/sourcing_apollo.js
//
// Apollo provider adapter: fetch real people by company + departments.
//
// PLAN NOTE:
// - People Search API requires a paid plan (Basic+). On Free, Apollo returns
//   an error such as 403/feature-not-available; we swallow it and return [].
//
// AUTH NOTE (per banner & docs):
// - Include API key in headers (X-Api-Key), not in URL/body.
//
// ENV:
//   APOLLO_API_KEY=sk_xxx
//   APOLLO_DEFAULT_COUNTRY (optional, default "United Arab Emirates")

const API_KEY = process.env.APOLLO_API_KEY || null;
const DEFAULT_COUNTRY = process.env.APOLLO_DEFAULT_COUNTRY || "United Arab Emirates";

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

function cleanStr(s) { if (!s) return null; const t = String(s).trim(); return t.length ? t : null; }
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }
function normDomain(u) {
  try { return new URL(u).hostname; }
  catch {
    const s = String(u || "").trim().toLowerCase();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) ? s : null;
  }
}
function buildTitleQuery(departments = []) {
  if (!Array.isArray(depts) && !Array.isArray(departments)) return null;
  const src = Array.isArray(departments) ? departments : [];
  const keys = uniq(src.flatMap((d) => TITLE_MAP[d] || []));
  return keys.length ? keys.join("|") : null; // e.g. "hr|talent|payroll"
}
function guessDeptFromTitle(title) {
  const t = String(title || "").toLowerCase();
  for (const [id, keys] of Object.entries(TITLE_MAP)) {
    if (keys.some((k) => t.includes(k))) {
      return ({
        hr: "HR", hrbp: "HRBP", ta: "Talent Acquisition", payroll: "Payroll",
        finance: "Finance", admin: "Admin", office_admin: "Office Admin", onboarding: "Onboarding",
      })[id] || null;
    }
  }
  return null;
}

/**
 * Fetch people for a given company.
 * @param {Object} opts
 * @param {Object} opts.company  - expects { website?, linkedin?, name? }
 * @param {string[]} opts.departments - e.g., ['hr','ta',...]
 * @param {number} opts.limit    - max contacts to return (default 10)
 * @param {string} opts.country  - filter country (default UAE)
 */
export async function fetchApolloContacts({ company, departments = [], limit = 10, country = DEFAULT_COUNTRY }) {
  if (!API_KEY) return []; // not configured

  const domain =
    normDomain(company?.website) ||
    normDomain(company?.linkedin) ||
    null;

  const person_titles = buildTitleQuery(departments);

  // Apollo People Search (current docs): POST /api/v1/mixed_people/search
  // Ref: https://docs.apollo.io/reference/people-search
  const endpoint = "https://api.apollo.io/api/v1/mixed_people/search";

  const body = {
    page: 1,
    per_page: Math.min(Math.max(5, limit), 50),
    person_location: country,
    // Prefer exact company match by domain; fall back to name when no domain
    q_organization_domains: domain ? [domain] : undefined,
    organization_name: !domain ? cleanStr(company?.name) : undefined,
    person_titles: person_titles || undefined,
    // DO NOT reveal emails here to save credits; UPR handles pattern/verify
  };

  let results = null;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache",
        "X-Api-Key": API_KEY, // <-- header per deprecation notice
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      // Free plans or insufficient scope commonly return 402/403 with a message
      // We purposely don’t throw—return [] so UPR falls back gracefully.
      return [];
    }
    results = await resp.json();
  } catch {
    return [];
  }

  const people = Array.isArray(results?.people)
    ? results.people
    : Array.isArray(results?.contacts)
    ? results.contacts
    : [];

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

    return {
      id: p?.id || undefined,
      name: name || null,
      title: title || null,
      dept: guessDeptFromTitle(title),
      linkedin: linkedin || null,
      email: null,          // don’t spend credits here
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
