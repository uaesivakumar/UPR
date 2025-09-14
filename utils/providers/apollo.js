// utils/providers/apollo.js
// Lightweight Apollo client with smart fallbacks for people search.
// Requires: process.env.APOLLO_API_KEY
// Node 18+ has global fetch; Node 20.x on Render is fine.

const APOLLO_BASE = "https://api.apollo.io";

function has(val) {
  return val !== undefined && val !== null && String(val).trim() !== "";
}

async function apolloPost(path, body) {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY missing");

  const r = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-api-key": key,
      accept: "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // leave json null
  }

  if (!r.ok) {
    const msg = json?.error?.message || json?.message || r.statusText || "apollo error";
    const err = new Error(`apollo ${r.status} ${msg}`);
    err.status = r.status;
    err.body = json || text;
    throw err;
  }
  return json || {};
}

function normalizePeople(payload) {
  const list = payload?.people || payload?.contacts || [];
  return list.map((p) => {
    const orgDomain =
      p?.organization?.primary_domain ||
      p?.organization?.website_url?.replace(/^https?:\/\//, "") ||
      null;

    return {
      id: p?.id || null,
      first_name: p?.first_name || "",
      last_name: p?.last_name || "",
      name: p?.name || [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim(),
      title: p?.title || "",
      linkedin: p?.linkedin_url || null,
      company_domain: orgDomain,
      company_name: p?.organization?.name || null,
      location: p?.formatted_address || [p?.city, p?.state, p?.country].filter(Boolean).join(", "),
      // emails are locked in search; we fill later via pattern guess (and optional verify)
      email: null,
      email_status: null,
      confidence: 0.8, // heuristic default; we don't get a score from search
      dept: Array.isArray(p?.departments) && p.departments.length ? p.departments[0] : null,
    };
  });
}

/**
 * Smart search for HR/Finance/Admin decision makers at a company.
 * Tries up to 4 variants (domain+UAE → name+UAE → domain → name).
 *
 * @param {object} opts
 * @param {string} [opts.companyDomain] e.g., "petrofac.com"
 * @param {string} [opts.companyName]   e.g., "Petrofac"
 * @param {string} [opts.region]        e.g., "United Arab Emirates"
 * @param {number} [opts.perPage]       default 25
 */
export async function searchPeopleForCompany(opts = {}) {
  const {
    companyDomain,
    companyName,
    region = "United Arab Emirates",
    perPage = 25,
  } = opts;

  const roleTerms = [
    "human resources",
    "hr",
    "talent acquisition",
    "recruiter",
    "payroll",
    "finance",
    "office admin",
    "admin manager",
    "onboarding",
  ];

  const seniorities = ["director", "vp", "c_suite", "head", "manager"];

  const attempts = [];

  if (has(companyDomain)) {
    attempts.push({
      label: "domain+region",
      body: {
        page: 1,
        per_page: perPage,
        q_organization_domains: [companyDomain],
        person_locations: ["Abu Dhabi", region, "UAE"],
        person_titles: roleTerms,
        person_seniorities: seniorities,
      },
    });
  }
  if (has(companyName)) {
    attempts.push({
      label: "name+region",
      body: {
        page: 1,
        per_page: perPage,
        organization_name: companyName,
        person_locations: ["Abu Dhabi", region, "UAE"],
        person_titles: roleTerms,
        person_seniorities: seniorities,
      },
    });
  }
  if (has(companyDomain)) {
    attempts.push({
      label: "domain only",
      body: {
        page: 1,
        per_page: perPage,
        q_organization_domains: [companyDomain],
        person_titles: roleTerms,
        person_seniorities: seniorities,
      },
    });
  }
  if (has(companyName)) {
    attempts.push({
      label: "name only",
      body: {
        page: 1,
        per_page: perPage,
        organization_name: companyName,
        person_titles: roleTerms,
        person_seniorities: seniorities,
      },
    });
  }

  const results = [];
  let usedVariant = null;
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const json = await apolloPost("/api/v1/mixed_people/search", attempt.body);
      const people = normalizePeople(json);
      if (people.length > 0) {
        results.push(...people);
        usedVariant = attempt.label;
        break;
      }
    } catch (err) {
      lastError = err;
      // soft fail; try next
    }
  }

  return {
    people: deDupePeople(results),
    meta: {
      provider: "apollo",
      variant: usedVariant,
      ok: results.length > 0,
      error: results.length === 0 && lastError ? String(lastError) : null,
    },
  };
}

function deDupePeople(list) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const k = `${(p.name || "").toLowerCase()}|${(p.title || "").toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
