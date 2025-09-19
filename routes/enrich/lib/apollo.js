/**
 * Apollo provider wrapper.
 * Exports:
 *   - searchPeopleByCompany({ name, domain, linkedin_url })
 *
 * Requires env: APOLLO_API_KEY
 * Uses /v1/people/search with X-Api-Key header.
 *
 * Results are normalized to:
 * {
 *   name, designation, linkedin_url, email, email_status, email_reason,
 *   role_bucket, seniority, source: "live", confidence, location
 * }
 */

const API = "https://api.apollo.io/v1/people/search";

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

export async function searchPeopleByCompany({ name, domain, linkedin_url } = {}) {
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    console.warn("apollo: missing APOLLO_API_KEY");
    return [];
  }

  // Build query body
  const body = {
    page: 1,
    per_page: 25,
    person_locations: ["United Arab Emirates"],
    person_departments: ["Human Resources", "Administrative", "Accounting", "Finance"],
    person_seniorities: ["manager","head","director","vp","cxo","lead","owner","partner","principal","staff"],
  };

  if (domain) {
    body.organization_domains = [String(domain).toLowerCase()];
  } else if (name) {
    body.q_organization_name = clean(name, 50);
  }

  // Defensive: LinkedIn company hint can improve results if the API supports it
  if (linkedin_url && /linkedin\.com\/company\//i.test(linkedin_url)) {
    body.q_organization_name = body.q_organization_name || clean(name || "", 50);
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
    return [];
  }

  let data = {};
  try { data = await resp.json(); } catch { data = {}; }

  const people = Array.isArray(data.people) ? data.people
                : Array.isArray(data.contacts) ? data.contacts
                : [];

  const results = people.map((p) => {
    const fullName = p.name || [p.first_name, p.last_name].filter(Boolean).join(" ");
    const title = p.title || p.label || p.headline || "";
    const email = p.email || p.primary_email || p.personal_emails?.[0] || p.work_email || null;
    // Apollo often redacts; sometimes it returns a "email_status" but no email.
    const email_status = p.email_status || (email ? "provider" : "unknown");
    const location = mkLocation(p) || p.location || p.city || "";
    const confidence = typeof p.confidence === "number" ? p.confidence
                      : email ? 0.9 : 0.85;

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
      // some APIs return pattern hints like "first.last" in a separate field; capture if present
      pattern_hint: p.email_pattern || p.pattern || null,
    };
  });

  // only keep HR/Admin/Finance buckets (defense-in-depth)
  return results.filter(r => ["hr","admin","finance"].includes(r.role_bucket));
}

export default { searchPeopleByCompany };
