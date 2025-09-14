// utils/emailPatterns.js
// Exports:
//   - detectPattern(pairs) -> pattern_id | null
//   - generateEmail(name, domain, pattern_id) -> string | null
//   - generateCandidates(name, domain, limit=5) -> [{ pattern_id, email }]
//
// Notes:
// - pattern_id is a *string* label like "first.last", "flast", etc.
// - name is assumed "First Last" (middle names ignored).
// - domain should be root like "example.com".

/** Split "First M Last" → {first, last} (lowercased, alnum only) */
function splitName(name = "") {
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: null, last: null };

  const first = sanitize(parts[0]);
  const last = parts.length > 1 ? sanitize(parts[parts.length - 1]) : null;
  return { first, last };
}

/** Lowercase alnum-only for local-part generation */
function sanitize(s = "") {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Normalize domain by stripping protocol / www. */
function normalizeDomain(d = "") {
  let dom = String(d).trim().toLowerCase();
  dom = dom.replace(/^https?:\/\//, "").replace(/^www\./, "");
  // keep only host portion
  const slash = dom.indexOf("/");
  if (slash >= 0) dom = dom.slice(0, slash);
  return dom || null;
}

/** Known pattern implementations (local part only) */
const PATTERNS = {
  "first.last": ({ first, last }) => (first && last ? `${first}.${last}` : null),
  "first_last": ({ first, last }) => (first && last ? `${first}_${last}` : null),
  "first-last": ({ first, last }) => (first && last ? `${first}-${last}` : null),

  "flast": ({ first, last }) => (first && last ? `${first[0]}${last}` : null),
  "firstl": ({ first, last }) => (first && last ? `${first}${last[0]}` : null),
  "f.last": ({ first, last }) => (first && last ? `${first[0]}.${last}` : null),
  "first.l": ({ first, last }) => (first && last ? `${first}.${last[0]}` : null),
  "f_last": ({ first, last }) => (first && last ? `${first[0]}_${last}` : null),

  "firstlast": ({ first, last }) => (first && last ? `${first}${last}` : null),
  "lastfirst": ({ first, last }) => (first && last ? `${last}${first}` : null),

  "first": ({ first }) => (first ? first : null),
  "last": ({ last }) => (last ? last : null),
  "lfirst": ({ first, last }) => (first && last ? `${last[0]}${first}` : null),
  "lastf": ({ first, last }) => (first && last ? `${last}${first[0]}` : null),
};

/** Generate local part by pattern_id, then assemble full email */
export function generateEmail(name, domain, pattern_id) {
  if (!name || !domain || !pattern_id) return null;
  const { first, last } = splitName(name);
  if (!first) return null;

  const dom = normalizeDomain(domain);
  if (!dom) return null;

  const fn = PATTERNS[pattern_id];
  if (!fn) return null;

  const local = fn({ first, last });
  if (!local) return null;

  return `${local}@${dom}`;
}

/** Try to detect the pattern that best fits given pairs [{name, email}] */
export function detectPattern(pairs = []) {
  // Prepare votes across patterns
  const voteMap = new Map(Object.keys(PATTERNS).map((k) => [k, 0]));

  let totalComparable = 0;

  for (const p of pairs) {
    const name = p?.name || "";
    const email = (p?.email || "").toLowerCase();
    if (!name || !email.includes("@")) continue;

    const { first, last } = splitName(name);
    if (!first) continue;

    const [local, dom] = email.split("@");
    if (!local || !dom) continue;

    totalComparable++;

    for (const [patternId, fn] of Object.entries(PATTERNS)) {
      const candidate = fn({ first, last });
      if (candidate && candidate === local) {
        voteMap.set(patternId, (voteMap.get(patternId) || 0) + 1);
      }
    }
  }

  // If we never had anything to compare, return null
  if (!totalComparable) return null;

  // Find the pattern with the highest votes
  let bestId = null;
  let bestVotes = 0;
  let ties = 0;

  for (const [patternId, votes] of voteMap.entries()) {
    if (votes > bestVotes) {
      bestVotes = votes;
      bestId = patternId;
      ties = 0;
    } else if (votes === bestVotes && votes > 0) {
      ties++;
    }
  }

  // Avoid returning a guess on ties or zero-vote results
  if (!bestVotes || ties > 0) return null;

  return bestId;
}

/** Produce a small set of candidate emails for a name + domain */
export function generateCandidates(name, domain, limit = 5) {
  const dom = normalizeDomain(domain);
  if (!name || !dom) return [];
  const order = [
    "first.last",
    "flast",
    "firstlast",
    "first",
    "last",
    "first_last",
    "first-last",
    "f.last",
    "lastf",
    "first.l",
    "firstl",
    "lastfirst",
    "f_last",
    "lfirst",
  ];

  const out = [];
  const seen = new Set();

  for (const pattern_id of order) {
    const email = generateEmail(name, dom, pattern_id);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ pattern_id, email });
    if (out.length >= limit) break;
  }
  return out;
}
