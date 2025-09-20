/**
 * Email utilities + enrichment pipeline
 *  - inferPatternFromSamples(emails[], domain?)
 *  - applyPattern(person, domain, pattern)
 *  - applyEmailPattern(person, domain, pattern)
 *  - isProviderPlaceholderEmail(email)
 *  - loadPatternFromCache(domain)
 *  - savePatternToCache(domain, pattern)
 *  - verifyEmail(email)
 *  - enrichWithEmail(candidates[], domain?)   <-- added
 */

const PATTERN_CACHE = new Map();

/** very small name tokenizer */
function splitName(obj) {
  const raw =
    obj?.name ||
    [obj?.first_name, obj?.last_name].filter(Boolean).join(" ") ||
    "";
  const s = String(raw).trim().replace(/\s+/g, " ");
  if (!s) return { first: "", last: "" };
  const parts = s.split(" ");
  const first = (obj?.first_name || parts[0] || "").toLowerCase();
  const last = (obj?.last_name || parts.slice(-1)[0] || "").toLowerCase();
  return { first, last };
}

/** apply a guessed pattern to produce an email string */
export function applyPattern(person, domain, pattern) {
  const { first, last } = splitName(person);
  const f = first.replace(/[^a-z]/g, "");
  const l = last.replace(/[^a-z]/g, "");
  const fl = f?.[0] || "";
  const ll = l?.[0] || "";
  const d = String(domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*/, "");

  if (!d || (!f && !l)) return "";

  const local = (() => {
    switch (String(pattern || "").toLowerCase()) {
      case "first.last": return `${f}.${l}`;
      case "first_last": return `${f}_${l}`;
      case "firstlast":  return `${f}${l}`;
      case "f.last":     return `${fl}.${l}`;
      case "first.l":    return `${f}.${ll}`;
      case "first":      return `${f}`;
      case "last":       return `${l}`;
      default:
        return f && l ? `${f}.${l}` : (f || l);
    }
  })();

  return local ? `${local}@${d}` : "";
}

/** alias kept for older imports */
export const applyEmailPattern = applyPattern;

/** detect apollo placeholder or other locked emails */
export function isProviderPlaceholderEmail(email) {
  const s = String(email || "").toLowerCase();
  return (
    !s ||
    s.includes("email_not_unlocked@") ||
    s.includes("placeholder@") ||
    s.includes("blocked@") ||
    s === "n/a"
  );
}

/** naive pattern inference from sample emails (same domain preferred) */
export function inferPatternFromSamples(emails = [], domain = "") {
  const d = (domain || "").toLowerCase();
  const locals = [];
  for (const e of emails) {
    const m = String(e || "").toLowerCase().match(/^([^@]+)@([^@]+)$/);
    if (!m) continue;
    const [, local, host] = m;
    if (d && host !== d) continue;
    locals.push(local);
  }
  if (!locals.length) return "";

  const hasDot = locals.some((l) => /^[a-z]+\.([a-z]+)$/.test(l));
  const hasUnd = locals.some((l) => /^[a-z]+_([a-z]+)$/.test(l));
  const hasInitialDot = locals.some((l) => /^[a-z]\.[a-z]+$/.test(l));
  const hasFirstOnly = locals.some((l) => /^[a-z]+$/.test(l));
  const hasConcat = locals.some((l) => /^[a-z]+[a-z]+$/.test(l));

  if (hasDot) return "first.last";
  if (hasUnd) return "first_last";
  if (hasInitialDot) return "f.last";
  if (hasConcat) return "firstlast";
  if (hasFirstOnly) return "first";
  return "first.last";
}

/** per-process memory cache */
export function loadPatternFromCache(domain) {
  const k = (domain || "").toLowerCase();
  return PATTERN_CACHE.get(k) || "";
}
export function savePatternToCache(domain, pattern) {
  const k = (domain || "").toLowerCase();
  if (!k || !pattern) return;
  PATTERN_CACHE.set(k, String(pattern));
}

/** Email verification */
export async function verifyEmail(email) {
  try {
    const nb = process.env.NEVERBOUNCE_API_KEY;
    if (nb) {
      const resp = await fetch("https://api.neverbounce.com/v4/single/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: nb, email }),
      });
      const json = await resp.json();
      if (json && json.result) {
        const map = { valid: "valid", invalid: "invalid", catchall: "accept_all", disposable: "risky", unknown: "unknown" };
        return { status: map[json.result] || "unknown", reason: "neverbounce" };
      }
    }

    const zb = process.env.ZEROBOUNCE_API_KEY;
    if (zb) {
      const url = new URL("https://api.zerobounce.net/v2/validate");
      url.searchParams.set("api_key", zb);
      url.searchParams.set("email", email);
      const resp = await fetch(url.toString());
      const json = await resp.json();
      if (json && json.status) {
        const map = { valid: "valid", invalid: "invalid", catch_all: "accept_all", unknown: "unknown" };
        return { status: map[json.status] || "unknown", reason: "zerobounce" };
      }
    }
  } catch {
    return { status: "unknown", reason: "verifier_error" };
  }
  return { status: "unknown", reason: "no_verifier" };
}

/**
 * Enrich candidates with emails (guesses + verification)
 */
export async function enrichWithEmail(candidates = [], domain = null) {
  if (!Array.isArray(candidates)) return [];

  // Infer a pattern from known emails
  const knownEmails = candidates.map(c => c.email).filter(Boolean);
  let pattern = loadPatternFromCache(domain);
  if (!pattern && knownEmails.length) {
    pattern = inferPatternFromSamples(knownEmails, domain);
    savePatternToCache(domain, pattern);
  }

  const enriched = [];
  for (const c of candidates) {
    const out = { ...c };

    // Guess if missing and we have domain
    if (!out.email && domain) {
      out.email = applyPattern(out, domain, pattern || "first.last");
      out.email_status = "guessed";
    }

    // Skip placeholders
    if (isProviderPlaceholderEmail(out.email)) {
      out.email_status = "placeholder";
    }

    // Verify if we have an email
    if (out.email && !out.email_status?.startsWith("valid")) {
      const v = await verifyEmail(out.email);
      out.email_status = v.status;
    }

    enriched.push(out);
  }

  return enriched;
}

export default {
  inferPatternFromSamples,
  applyPattern,
  applyEmailPattern,
  isProviderPlaceholderEmail,
  loadPatternFromCache,
  savePatternToCache,
  verifyEmail,
  enrichWithEmail,
};
