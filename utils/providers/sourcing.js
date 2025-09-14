// utils/providers/sourcing.js
//
// Provider hub. We prefer Apollo for real-name sourcing.
// Returns [] if no provider configured; we never fabricate contacts.

import { fetchApolloContacts } from "./sourcing_apollo.js";

export async function fetchContactsFromProviders({ company, departments = [], min = 3 }) {
  const out = [];

  // Apollo (requires APOLLO_API_KEY)
  try {
    const ap = await fetchApolloContacts({ company, departments, limit: Math.max(min, 10) });
    if (Array.isArray(ap) && ap.length) out.push(...ap);
  } catch {
    // ignore provider errors
  }

  // Future: add additional providers (PDL, Coresignal, etc.)

  // Dedup by lowercased name
  const seen = new Set();
  return out.filter((c) => {
    const k = (c.name || "").toLowerCase();
    if (!k) return false;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
