/**
 * Email pattern helpers
 * Exports:
 *   - inferPatternFromSamples(samples, domain?)
 *   - applyPattern(fullName, domain, pattern)
 *   - applyEmailPattern({ name }, domain, pattern)  // convenience
 *   - isProviderPlaceholderEmail(email)
 */

const PATTERNS = [
  "first.last",
  "flast",
  "firstlast",
  "first",
  "last",
  "f.last",
  "first.l",
  "first_last",
  "lfirst",
];

function splitName(fullName = "") {
  const clean = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!clean) return { first: "", last: "" };
  const parts = clean.split(" ");
  const first = parts[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return { first: first.toLowerCase(), last: last.toLowerCase() };
}

function buildLocal(first, last, pattern) {
  const f = first || "";
  const l = last || "";
  switch (pattern) {
    case "first.last":   return `${f}.${l}`;
    case "flast":        return `${f.slice(0,1)}${l}`;
    case "firstlast":    return `${f}${l}`;
    case "first":        return f;
    case "last":         return l;
    case "f.last":       return `${f.slice(0,1)}.${l}`;
    case "first.l":      return `${f}.${l.slice(0,1)}`;
    case "first_last":   return `${f}_${l}`;
    case "lfirst":       return `${l}${f}`;
    default:             return `${f}.${l}`; // default to first.last
  }
}

/** Apply a known pattern to fullName@domain */
export function applyPattern(fullName, domain, pattern = "first.last") {
  const { first, last } = splitName(fullName);
  const local = buildLocal(first, last, pattern);
  const dom = String(domain || "").toLowerCase().replace(/^https?:\/\//, "");
  return `${local}@${dom}`;
}

/** Back-compat alias for earlier imports */
export const applyEmailPattern = applyPattern;

/**
 * Guess pattern from samples of { name, email } (same domain ideally)
 * Returns { pattern, confidence, domain? }
 */
export function inferPatternFromSamples(samples = [], domainHint = "") {
  const arr = Array.isArray(samples) ? samples : [];
  const score = new Map(PATTERNS.map(p => [p, 0]));

  let domain = (domainHint || "").toLowerCase();
  for (const s of arr) {
    const name = s?.name || s?.full_name || "";
    const email = String(s?.email || "").toLowerCase();
    if (!email || !name) continue;

    const m = email.match(/@([a-z0-9.\-]+)$/i);
    if (m && !domain) domain = m[1];

    const { first, last } = splitName(name);
    for (const p of PATTERNS) {
      const expect = `${buildLocal(first, last, p)}@${m ? m[1] : domain || ""}`;
      if (expect && email === expect) {
        score.set(p, (score.get(p) || 0) + 2);
      } else {
        const local = buildLocal(first, last, p);
        if (email.startsWith(local + "@")) {
          score.set(p, (score.get(p) || 0) + 1);
        }
      }
    }
  }

  // pick best
  let best = "first.last";
  let bestVal = -Infinity;
  for (const [p, v] of score.entries()) {
    if (v > bestVal) { best = p; bestVal = v; }
  }
  const confidence = Math.max(0.5, Math.min(1, bestVal / Math.max(2, arr.length * 2)));
  return { pattern: best, confidence, domain };
}

/** Detect provider placeholders we should replace with a patterned email guess */
export function isProviderPlaceholderEmail(email = "") {
  const e = String(email || "").toLowerCase();
  return (
    !e ||
    /email[_\-]?not[_\-]?unlocked/.test(e) ||
    /protected/.test(e) ||
    /unavailable/.test(e) ||
    /example\.com$/.test(e)
  );
}

export default {
  inferPatternFromSamples,
  applyPattern,
  applyEmailPattern,
  isProviderPlaceholderEmail,
};
