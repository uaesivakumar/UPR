/**
 * Very lightweight heuristics-based guesser with override support.
 * If overrides are passed (name/domain/linkedin_url), they win.
 * Otherwise we infer from the text, preferring .ae domains for UAE context
 * and recognizing simple "X from Y" subsidiary language.
 */
export async function guessCompany(q, overrides = {}) {
  const out = {
    name: null,
    domain: null,
    website_url: null,
    linkedin_url: null,
    hq: "United Arab Emirates",
    industry: null,
    size: null,
    synonyms: [],
    mode: "LLM",
    confidence: 0.7,
  };

  // 1) Overrides first
  if (overrides.name) out.name = overrides.name;
  if (overrides.domain) {
    const d = overrides.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    out.domain = d;
    out.website_url = `https://${d}`;
  }
  if (overrides.linkedin_url) out.linkedin_url = overrides.linkedin_url;

  // 2) If we still need, infer from q
  const ql = String(q || "").toLowerCase();
  const tokens = ql.split(/\s+/).filter(Boolean);

  // simple patterns for "X from Y" / "X @ Y"
  const fromIdx = tokens.indexOf("from");
  if (!out.name && fromIdx > 0) {
    out.name = tokens.slice(0, fromIdx).join(" ");
  }
  if (!out.name) {
    out.name = String(q || "").trim();
  }

  // prefer .ae if likely UAE
  if (!out.domain) {
    const brand = out.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const ends = /bank|university|government|gulf|dubai|abu|sharjah/.test(ql)
      ? [".com", ".ae"]
      : [".ae", ".com"];
    out.domain = `${brand}${ends[0]}`;
    out.website_url = `https://${out.domain}`;
  }

  // record parent for reference
  if (overrides.parent) out.synonyms.push(overrides.parent);

  return out;
}

/**
 * Wrapper to fit into enrichment pipeline
 * Returns: { company_guess }
 */
export async function enrichWithLLM({ name, domain, linkedin_url, candidates }) {
  try {
    const q = name || domain || linkedin_url || "";
    const guess = await guessCompany(q, { name, domain, linkedin_url });
    return { company_guess: guess };
  } catch (e) {
    console.error("[llm] enrichWithLLM error", e);
    return { company_guess: {} };
  }
}

export default {
  guessCompany,
  enrichWithLLM,
};
