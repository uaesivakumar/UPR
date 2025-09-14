// utils/patternCache.js
// Exports:
//  - getDomainPattern(domain) -> { domain, pattern_id, verified_count } | null
//  - setDomainPattern({ domain, pattern_id, source, example, incrementVerified }) -> void
//
// This is an in-memory cache by default. Replace with Postgres persistence later.

const mem = new Map();

export async function getDomainPattern(domain) {
  const d = (domain || "").toLowerCase();
  if (!d) return null;
  return mem.get(d) || null;
}

export async function setDomainPattern({ domain, pattern_id, source, example, incrementVerified }) {
  const d = (domain || "").toLowerCase();
  if (!d || !pattern_id) return;
  const prev = mem.get(d) || { domain: d, pattern_id: null, verified_count: 0 };
  mem.set(d, {
    domain: d,
    pattern_id,
    verified_count: prev.verified_count + (incrementVerified ? 1 : 0),
    source: source || prev.source || "unknown",
    example: example || prev.example || null,
    updated_at: new Date().toISOString(),
  });
}
