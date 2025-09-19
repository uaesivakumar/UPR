/** Email helpers: patterning, cache, and verification (ZeroBounce/NeverBounce if keys present). */

const KNOWN_PATTERNS = [
  "first.last","firstlast","f.last","first.l","flast","last.first","first","last"
];

export function isProviderPlaceholderEmail(e) {
  if (!e) return false;
  const s = String(e).toLowerCase();
  return (
    s === "first.last" ||
    s === "first.last@" ||
    s === "first.last@domain.com" ||
    s === "firstlast@domain.com" ||
    s.endsWith("@domain.com") ||
    s.startsWith("email_not_unlocked@")
  );
}

export function applyPattern(first, last, pattern, domain) {
  const f = String(first || "").toLowerCase().replace(/[^a-z]/g, "");
  const l = String(last  || "").toLowerCase().replace(/[^a-z]/g, "");
  const fl = f?.[0] || ""; const ll = l?.[0] || "";
  let local = "";
  switch (pattern) {
    case "first.last":  local = `${f}.${l}`; break;
    case "firstlast":   local = `${f}${l}`; break;
    case "f.last":      local = `${fl}.${l}`; break;
    case "first.l":     local = `${f}.${ll}`; break;
    case "flast":       local = `${fl}${l}`; break;
    case "last.first":  local = `${l}.${f}`; break;
    case "first":       local = f; break;
    case "last":        local = l; break;
    default:            local = `${f}.${l}`;
  }
  return domain ? `${local}@${domain}` : local;
}

export function inferPatternFromSamples(samples = [], domain) {
  // samples: [{name, email}]
  const tallies = new Map();
  for (const s of samples) {
    const [first, ...rest] = String(s.name || "").trim().split(/\s+/);
    const last = rest.slice(-1)[0] || "";
    const local = String(s.email || "").toLowerCase().split("@")[0];
    for (const p of KNOWN_PATTERNS) {
      if (applyPattern(first, last, p, "").toLowerCase() === local) {
        tallies.set(p, (tallies.get(p) || 0) + 1);
      }
    }
  }
  let best = null, max = 0;
  tallies.forEach((v, k) => { if (v > max) { max = v; best = k; } });
  if (!best || max < 2) return null;
  const conf = Math.min(1, max / Math.max(2, samples.length));
  return { pattern: best, confidence: Number(conf.toFixed(2)), sample: samples[0]?.email || null, domain: domain || null };
}

/* ---------------- Pattern cache (email_patterns table) ---------------- */
export async function savePatternToCache(pool, domain, pattern, sample_email, confidence) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_patterns (
        domain TEXT PRIMARY KEY,
        pattern TEXT,
        sample_email TEXT,
        confidence NUMERIC,
        updated_at TIMESTAMP DEFAULT NOW()
      )`);
    await pool.query(`
      INSERT INTO email_patterns (domain, pattern, sample_email, confidence)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (domain) DO UPDATE SET
        pattern=EXCLUDED.pattern,
        sample_email=EXCLUDED.sample_email,
        confidence=EXCLUDED.confidence,
        updated_at=NOW()
    `, [domain, pattern, sample_email || null, confidence || null]);
  } catch (e) {
    if (String(e?.code) !== "42P01") console.error("savePatternToCache", e);
  }
}
export async function loadPatternFromCache(pool, domain) {
  try {
    const { rows } = await pool.query(`SELECT pattern, sample_email, confidence FROM email_patterns WHERE domain=$1 LIMIT 1`, [domain]);
    if (!rows?.length) return null;
    return { pattern: rows[0].pattern, confidence: Number(rows[0].confidence) || 0, sample: rows[0].sample_email || null };
  } catch (e) {
    if (String(e?.code) !== "42P01") console.error("loadPatternFromCache", e);
    return null;
  }
}

/* ---------------- Verification (ZeroBounce / NeverBounce) ---------------- */
const ZB_KEY = process.env.ZEROBOUNCE_API_KEY || "";
const NB_KEY = process.env.NEVERBOUNCE_API_KEY || "";

export async function verifyEmail(email) {
  try {
    if (ZB_KEY) {
      const u = new URL("https://api.zerobounce.net/v2/validate");
      u.searchParams.set("api_key", ZB_KEY);
      u.searchParams.set("email", email);
      const r = await fetch(u.toString(), { method: "GET" });
      const j = await r.json().catch(() => null);
      const s = (j?.status || "").toLowerCase();
      if (s === "valid") return { status: "valid", reason: "zerobounce" };
      if (s === "invalid") return { status: "invalid", reason: j?.sub_status || "zerobounce" };
      if (s === "catch-all") return { status: "accept_all", reason: "zerobounce" };
      return { status: "unknown", reason: "zerobounce" };
    }
    if (NB_KEY) {
      const r = await fetch("https://api.neverbounce.com/v4/single/check?key="+encodeURIComponent(NB_KEY)+"&email="+encodeURIComponent(email), { method: "GET" });
      const j = await r.json().catch(() => null);
      const s = (j?.result || "").toLowerCase();
      if (s === "valid") return { status: "valid", reason: "neverbounce" };
      if (s === "invalid") return { status: "invalid", reason: "neverbounce" };
      if (s === "catchall" || s === "unknown") return { status: "accept_all", reason: "neverbounce" };
      return { status: "unknown", reason: "neverbounce" };
    }
  } catch (e) {
    console.error("verifyEmail error", e);
  }
  return { status: "unknown", reason: "no_verifier" };
}
