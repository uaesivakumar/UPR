// utils/emailPatterns.js
// ESM module. Provides helpers to generate candidate emails and detect a domain pattern
// from known seed emails. Exports:
//   - detectEmailPattern({ domain, seeds? }) -> string|null
//   - generateEmail({ first, last, domain, pattern }) -> string
//   - generateCandidates({ first, last, domain, limit? }) -> string[]
//
// Back-compat aliases also exported:
//   - detectPattern (alias of detectEmailPattern)
//   - buildCandidates (alias of generateCandidates)
//
// Notes:
// - "seeds" is an optional array of known valid emails for this domain;
//   if absent, detection returns null and callers should try SMTP verify on candidates.
// - Pattern identifiers (lowercase):
//     first.last, firstlast, first_last, first-last,
//     f.last, f_last, f-last, flast, firstl,
//     last.first, lastfirst, last_first, last-first,
//     l.first, lfirst
//
// All generation is lowercase with ASCII-safe sanitization.

const SAFE = /[a-z]/;
function sanitizeNamePart(s) {
  if (!s) return "";
  // keep letters/numbers, strip punctuation/accents (basic)
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .replace(/[^a-z0-9]/g, "");
}

function firstInitial(s) {
  const t = sanitizeNamePart(s);
  return t ? t[0] : "";
}

function lastInitial(s) {
  const t = sanitizeNamePart(s);
  return t ? t[0] : "";
}

function normDomain(domain) {
  if (!domain) return null;
  try {
    const u = new URL(domain.startsWith("http") ? domain : `https://${domain}`);
    return u.hostname.toLowerCase();
  } catch {
    return String(domain).toLowerCase().replace(/^mailto:/, "").replace(/^@/, "");
  }
}

export const PATTERNS = [
  "first.last",
  "firstlast",
  "first_last",
  "first-last",

  "f.last",
  "f_last",
  "f-last",
  "flast",
  "firstl",

  "last.first",
  "lastfirst",
  "last_first",
  "last-first",

  "l.first",
  "lfirst",
];

/**
 * Turn (first,last,domain,pattern) into an email.
 */
export function generateEmail({ first, last, domain, pattern }) {
  const f = sanitizeNamePart(first);
  const l = sanitizeNamePart(last);
  const d = normDomain(domain);
  if (!d || (!f && !l)) return null;

  switch (String(pattern).toLowerCase()) {
    case "first.last":
      return `${f}.${l}@${d}`;
    case "firstlast":
      return `${f}${l}@${d}`;
    case "first_last":
      return `${f}_${l}@${d}`;
    case "first-last":
      return `${f}-${l}@${d}`;

    case "f.last":
      return `${firstInitial(f)}.${l}@${d}`;
    case "f_last":
      return `${firstInitial(f)}_${l}@${d}`;
    case "f-last":
      return `${firstInitial(f)}-${l}@${d}`;
    case "flast":
      return `${firstInitial(f)}${l}@${d}`;
    case "firstl":
      return `${f}${lastInitial(l)}@${d}`;

    case "last.first":
      return `${l}.${f}@${d}`;
    case "lastfirst":
      return `${l}${f}@${d}`;
    case "last_first":
      return `${l}_${f}@${d}`;
    case "last-first":
      return `${l}-${f}@${d}`;

    case "l.first":
      return `${lastInitial(l)}.${f}@${d}`;
    case "lfirst":
      return `${lastInitial(l)}${f}@${d}`;

    default:
      // sensible default
      return `${f}.${l}@${d}`;
  }
}

/**
 * Generate a ranked list of likely candidate emails for a person at a domain.
 */
export function generateCandidates({ first, last, domain, limit = 10 }) {
  const f = sanitizeNamePart(first);
  const l = sanitizeNamePart(last);
  const d = normDomain(domain);
  if (!d || (!f && !l)) return [];

  // order by global prevalence
  const order = [
    "first.last",
    "flast",
    "firstlast",
    "f.last",
    "firstl",
    "first_last",
    "first-last",
    "last.first",
    "l.first",
    "lastfirst",
    "lfirst",
    "last_first",
    "last-first",
  ];

  const out = [];
  for (const p of order) {
    const email = generateEmail({ first: f, last: l, domain: d, pattern: p });
    if (email && SAFE.test(email)) out.push(email);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Detect the dominant email pattern for a domain from known seed emails.
 * If no seeds are provided or detection is ambiguous, returns null.
 *
 * @param {Object} opts
 * @param {String} opts.domain - The domain to detect for (e.g., "petrofac.com")
 * @param {Array<String>} [opts.seeds] - Known valid emails for this domain
 * @returns {String|null} pattern id
 */
export function detectEmailPattern({ domain, seeds = [] } = {}) {
  const d = normDomain(domain);
  const emails = Array.isArray(seeds) ? seeds : [];
  if (!d || emails.length === 0) return null;

  // extract name parts from seeds like john.smith@domain
  const rows = emails
    .map((e) => String(e).toLowerCase().trim())
    .filter((e) => e.endsWith(`@${d}`))
    .map((e) => e.split("@")[0])
    .map((local) => {
      // attempt to decompose common patterns to [first,last]
      // we try several splitters; if we can't safely parse, skip
      let first = null;
      let last = null;

      const trySet = (a, b) => {
        if (a && b) {
          first = sanitizeNamePart(a);
          last = sanitizeNamePart(b);
        }
      };

      if (local.includes(".")) {
        const [a, b] = local.split(".");
        trySet(a, b);
      }
      if ((!first || !last) && local.includes("_")) {
        const [a, b] = local.split("_");
        trySet(a, b);
      }
      if ((!first || !last) && local.includes("-")) {
        const [a, b] = local.split("-");
        trySet(a, b);
      }
      if ((!first || !last) && local.length >= 2) {
        // heuristics for flast / firstl
        // flast: jsmith
        // firstl: johns
        const m = local.match(/^([a-z])([a-z]+)$/);
        if (m) {
          first = m[1];
          last = m[2];
        } else if (local.length > 2) {
          // lastfirst or firstlast — ambiguous; give up
        }
      }

      return first && last ? { first, last, local } : null;
    })
    .filter(Boolean);

  if (!rows.length) return null;

  // vote the pattern that best recreates the local part
  const votes = new Map(); // pattern -> count
  for (const r of rows) {
    for (const p of PATTERNS) {
      const email = generateEmail({ first: r.first, last: r.last, domain: d, pattern: p });
      const local = email ? email.split("@")[0] : "";
      if (local === r.local) {
        votes.set(p, (votes.get(p) || 0) + 1);
      }
    }
  }

  if (votes.size === 0) return null;

  // pick the most voted pattern; break ties by our global order preference
  const pref = new Map(PATTERNS.map((p, i) => [p, i]));
  let best = null;
  let bestCount = -1;
  let bestPref = Infinity;

  for (const [p, count] of votes.entries()) {
    const prefRank = pref.get(p) ?? 999;
    if (count > bestCount || (count === bestCount && prefRank < bestPref)) {
      best = p;
      bestCount = count;
      bestPref = prefRank;
    }
  }

  return best || null;
}

// -------- Backwards-compat aliases --------
export const detectPattern = detectEmailPattern;
export const buildCandidates = generateCandidates;

export default {
  detectEmailPattern,
  generateEmail,
  generateCandidates,
  detectPattern: detectEmailPattern,
  buildCandidates: generateCandidates,
  PATTERNS,
};
