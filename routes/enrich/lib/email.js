/**
 * Email utilities used by enrichment routes.
 * Backward-compatible export names expected by search.js:
 *   - applyEmailPattern(fullName, domain, pattern?)
 * Also provides:
 *   - inferPatternFromSamples(domain, samples)
 *   - verifyEmailSMTP(email)  -> { status, reason }
 */

const CLEAN = (s = "") => String(s).normalize("NFKD");

/** Split a full name into [first, last] with basic cleanup */
function splitName(fullName = "") {
  const raw = CLEAN(fullName).trim().replace(/\s+/g, " ");
  if (!raw) return ["", ""];
  const parts = raw.split(" ");
  const first = parts[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return [first, last];
}

/** Sanitize name part to letters only, lowercase */
function slugPart(s = "") {
  return CLEAN(s).toLowerCase().replace(/[^a-z]/g, "");
}

/** Normalize domain ("https://kbr.com/foo" -> "kbr.com") */
function normalizeDomain(domain = "") {
  let d = String(domain).trim();
  d = d.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return d.toLowerCase();
}

/**
 * Build an email using a pattern id.
 * Supported patterns:
 *  - first.last
 *  - firstlast
 *  - f.last
 *  - first.l
 *  - first_last
 *  - first-last
 *  - first
 *  - last
 *  - firstl
 *  - flast
 */
export function applyEmailPattern(fullName, domain, pattern = "first.last") {
  if (!fullName || !domain) return null;

  const dom = normalizeDomain(domain);
  const [firstRaw, lastRaw] = splitName(fullName);
  const f = slugPart(firstRaw);
  const l = slugPart(lastRaw);
  const fi = f.slice(0, 1);
  const li = l.slice(0, 1);

  const table = {
    "first.last": `${f}.${l}@${dom}`,
    "firstlast": `${f}${l}@${dom}`,
    "f.last": `${fi}.${l}@${dom}`,
    "first.l": `${f}.${li}@${dom}`,
    "first_last": `${f}_${l}@${dom}`,
    "first-last": `${f}-${l}@${dom}`,
    "first": `${f}@${dom}`,
    "last": `${l}@${dom}`,
    "firstl": `${f}${li}@${dom}`,
    "flast": `${fi}${l}@${dom}`,
  };

  // Fallback to first.last if unknown
  return table[pattern] || table["first.last"];
}

/**
 * Infer a pattern from known samples belonging to the same domain.
 * samples: array of email strings.
 * Returns one of the supported pattern ids, or "first.last" as fallback.
 */
export function inferPatternFromSamples(domain, samples = []) {
  const dom = normalizeDomain(domain);
  const pats = [
    "first.last",
    "firstlast",
    "f.last",
    "first.l",
    "first_last",
    "first-last",
    "first",
    "last",
    "firstl",
    "flast",
  ];

  // Simple heuristic: check occurrences of separators
  let score = Object.fromEntries(pats.map((p) => [p, 0]));

  for (const e of samples) {
    if (typeof e !== "string") continue;
    const email = e.toLowerCase().trim();
    if (!email.endsWith(`@${dom}`)) continue;
    const local = email.split("@")[0];

    if (/\./.test(local)) score["first.last"] += 1;
    if (!/\W/.test(local)) score["firstlast"] += 0.5; // letters only
    if (/^[a-z]\.[a-z]/.test(local)) score["f.last"] += 1;
    if (/^[a-z]+\.[a-z]$/.test(local)) score["first.l"] += 1;
    if (/_/.test(local)) score["first_last"] += 1;
    if (/-/.test(local)) score["first-last"] += 1;
    if (/^[a-z]+$/.test(local)) {
      score["first"] += 0.25;
      score["last"] += 0.25;
    }
    if (/^[a-z]+[a-z]$/.test(local)) score["firstl"] += 0.25;
    if (/^[a-z][a-z]+$/.test(local)) score["flast"] += 0.25;
  }

  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : "first.last";
}

/**
 * SMTP verification stub.
 * If NEVERBOUNCE_API_KEY or ZEROBOUNCE_API_KEY exist, this can be wired later.
 * For now, return {status: "unknown", reason: "no_verifier"} to keep callers happy.
 */
export async function verifyEmailSMTP(_email) {
  const hasNB = !!process.env.NEVERBOUNCE_API_KEY;
  const hasZB = !!process.env.ZEROBOUNCE_API_KEY;

  if (!hasNB && !hasZB) {
    return { status: "unknown", reason: "no_verifier" };
  }

  // Placeholder: integrate real verifier here when keys are configured
  // Implementations should normalize to {status: "valid"|"invalid"|"accept_all"|"unknown", reason}
  return { status: "unknown", reason: "not_implemented" };
}

// Also export helpers some callers may use
export const _internal = { splitName, slugPart, normalizeDomain };
