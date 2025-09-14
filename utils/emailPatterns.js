// utils/emailPattern.js

const clean = (s) => (s || "").trim().toLowerCase();

export function nameTokens(fullName) {
  const n = clean(fullName).replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return { first: "", last: "" };
  const parts = n.split(" ");
  const first = parts[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return { first, last };
}

export function commonCandidates(fullName, domain) {
  const { first, last } = nameTokens(fullName);
  if (!first || !domain) return [];
  const f = first[0];
  const l = last ? last[0] : "";
  const base = [];

  if (last) {
    base.push(`${first}.${last}@${domain}`);
    base.push(`${first}${last}@${domain}`);
    base.push(`${f}.${last}@${domain}`);
    base.push(`${f}${last}@${domain}`);
    base.push(`${first}.${l}@${domain}`);
    base.push(`${first}${l}@${domain}`);
    base.push(`${last}.${first}@${domain}`);
  } else {
    base.push(`${first}@${domain}`);
    base.push(`${f}@${domain}`);
  }
  // dedupe
  return Array.from(new Set(base.map((s) => s.toLowerCase())));
}

export function inferPatternFromKnown(knownEmail, fullName) {
  // crude pattern recognizer from a single known email
  // returns a function (fullName, domain) => email
  if (!knownEmail || !fullName) return null;
  const m = String(knownEmail).toLowerCase().match(/^([^@]+)@(.+)$/);
  if (!m) return null;
  const local = m[1];
  return (name, domain) => {
    const { first, last } = nameTokens(name);
    if (!first) return null;

    // test against templates; pick the one matching the known local
    const templates = [
      () => last ? `${first}.${last}` : `${first}`,
      () => last ? `${first}${last}` : `${first}`,
      () => last ? `${first[0]}.${last}` : `${first[0]}`,
      () => last ? `${first[0]}${last}` : `${first[0]}`,
      () => last ? `${last}.${first}` : `${first}`,
      () => last ? `${first}.${last[0]}` : `${first}`,
      () => last ? `${first}${last[0]}` : `${first}`
    ];

    for (const t of templates) {
      if (t(name, "").toLowerCase() === local) {
        const guess = t(name, "").toLowerCase();
        return `${guess}@${domain}`;
      }
    }
    // fallback to first.last
    return last ? `${first}.${last}@${domain}` : `${first}@${domain}`;
  };
}
