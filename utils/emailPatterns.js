// utils/emailPatterns.js
import { pool } from "./db.js";

const DEFAULT_PATTERNS = [
  "{first}.{last}@{domain}",
  "{f}{last}@{domain}",
  "{first}{l}@{domain}",
  "{first}@{domain}",
  "{first}_{last}@{domain}",
  "{last}{f}@{domain}",
  "{first}-{last}@{domain}",
];

export function applyPattern(first, last, pattern, domain) {
  const f = (first || "").toLowerCase().replace(/[^a-z]/g, "");
  const l = (last || "").toLowerCase().replace(/[^a-z]/g, "");
  return pattern
    .replace("{first}", f)
    .replace("{last}", l)
    .replace("{f}", f.slice(0, 1))
    .replace("{l}", l.slice(0, 1))
    .replace("{domain}", domain);
}

/**
 * Given sample emails (name+email) of the same domain, infer the most likely pattern.
 * @param {Array<{name:string,email:string}>} samples
 * @param {string} domain
 * @returns {{pattern:string, confidence:number}|null}
 */
export function inferPatternFromSamples(samples, domain) {
  const counts = new Map();
  for (const s of samples) {
    const [first, last] = splitName(s.name);
    if (!first) continue;
    for (const p of DEFAULT_PATTERNS) {
      const guess = applyPattern(first, last, p, domain);
      if (eqEmail(guess, s.email)) counts.set(p, (counts.get(p) || 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [bestPattern, hits] = sorted[0];
  const confidence = Math.min(1, hits / Math.max(2, samples.length));
  return { pattern: bestPattern, confidence };
}

function splitName(name = "") {
  const parts = name.trim().split(/\s+/);
  if (!parts.length) return ["", ""];
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return [first, last];
}
function eqEmail(a = "", b = "") {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function loadPatternFromCache(dbOrPool, domain) {
  const db = dbOrPool?.query ? dbOrPool : pool;
  const q = `SELECT pattern, sample_email, confidence FROM email_pattern_cache WHERE domain = $1`;
  try {
    const { rows } = await db.query(q, [domain]);
    if (!rows[0]) return null;
    return { pattern: rows[0].pattern, confidence: Number(rows[0].confidence) || 0.0 };
  } catch (e) {
    if (String(e?.code) === "42P01") return null; // table missing
    throw e;
  }
}

export async function savePatternToCache(dbOrPool, domain, pattern, sample_email, confidence = 0.7) {
  const db = dbOrPool?.query ? dbOrPool : pool;
  const q = `
    INSERT INTO email_pattern_cache (domain, pattern, sample_email, confidence, updated_at)
    VALUES ($1,$2,$3,$4, now())
    ON CONFLICT (domain) DO UPDATE SET
      pattern = EXCLUDED.pattern,
      sample_email = EXCLUDED.sample_email,
      confidence = EXCLUDED.confidence,
      updated_at = now()
  `;
  try {
    await db.query(q, [domain, pattern, sample_email || null, confidence]);
  } catch (e) {
    if (String(e?.code) === "42P01") return; // table not present yet: skip
    throw e;
  }
}
