// utils/emailPatterns.js
import { normalizeDomain } from "./normalize.js";

const COMMON_PATTERNS = [
  "first.last",
  "f.last",
  "first.l",
  "first",
  "last",
  "firstlast",
  "flast",
];

export function detectPattern(seedEmails = [], person = { first: "", last: "" }) {
  // trivial detector; prefer explicit seed emails you store later
  // returns a string pattern name or null
  return seedEmails.length ? "first.last" : null;
}

export function generateEmail({ first, last, domain, pattern }) {
  if (!first || !last || !domain) return null;
  const d = normalizeDomain(domain);
  const f = String(first).toLowerCase().replace(/[^a-z]/g, "");
  const l = String(last).toLowerCase().replace(/[^a-z]/g, "");
  const map = {
    "first.last": `${f}.${l}`,
    "f.last": `${f[0] ?? ""}.${l}`,
    "first.l": `${f}.${l[0] ?? ""}`,
    "first": f,
    "last": l,
    "firstlast": `${f}${l}`,
    "flast": `${(f[0] ?? "")}${l}`,
  };
  const local = map[pattern] ?? map["first.last"];
  return local && d ? `${local}@${d}` : null;
}

export function generateCandidates({ first, last, domain, max = 4 }) {
  const d = normalizeDomain(domain);
  const seen = new Set();
  const out = [];
  for (const p of COMMON_PATTERNS) {
    const e = generateEmail({ first, last, domain: d, pattern: p });
    if (e && !seen.has(e)) {
      seen.add(e);
      out.push({ email: e, pattern: p });
      if (out.length >= max) break;
    }
  }
  return out;
}
