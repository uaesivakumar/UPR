// utils/normalize.js
export function normalizeDomain(input) {
  if (!input) return null;
  let s = String(input).trim();
  try {
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    const u = new URL(s);
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    // not a URL, maybe already a domain
    let host = s.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  }
}

export function includesNormalized(a, b) {
  if (!a || !b) return false;
  return String(a).toLowerCase().includes(String(b).toLowerCase());
}
