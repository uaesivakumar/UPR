const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

const STOPWORDS = /\b(inc|llc|ltd|limited|international|intl|company|co|corp|corporation|group|holdings?|school|bank|market|solutions?)\b/gi;

export function cleanName(s = "") {
  return String(s)
    .replace(STOPWORDS, " ")
    .replace(/[^a-z0-9\s&-]/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
export function acronymOf(name = "") {
  const a = name.split(/[\s&-]+/).filter(Boolean).map(w => w[0]?.toUpperCase()).join("");
  return a || null;
}
export function wordsToDomain(name = "") {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return base ? `${base}.com` : null;
}

export async function resolveCompanyRich(q, timings = {}) {
  const t0 = Date.now();
  const cleaned = cleanName(q);
  const acr = acronymOf(cleaned);

  if (!OPENAI_KEY) {
    const domain = wordsToDomain(cleaned);
    timings.llm_ms = (timings.llm_ms || 0) + (Date.now() - t0);
    return {
      name: cleaned,
      domain,
      website_url: domain ? `https://www.${domain}` : null,
      linkedin_url: null,
      hq: null,
      industry: null,
      size: null,
      synonyms: [cleaned, acr].filter(Boolean),
      mode: "Guess",
    };
  }

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return JSON only with keys: name, domain, website_url, linkedin_url, hq, industry, size, synonyms[]. Domain must be the primary corporate domain (e.g., kbr.com)." },
          { role: "user", content: cleaned },
        ],
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content || "{}";
      const obj = JSON.parse(txt);
      obj.name ||= cleaned;
      obj.domain ||= wordsToDomain(obj.name || cleaned);
      obj.website_url ||= (obj.domain ? `https://www.${obj.domain}` : null);
      obj.synonyms = Array.isArray(obj.synonyms) ? obj.synonyms : [];
      if (acr) obj.synonyms.push(acr);
      obj.mode = "LLM";
      timings.llm_ms = (timings.llm_ms || 0) + (Date.now() - t0);
      return obj;
    }
  } catch (e) {
    console.error("LLM resolve failed", e);
  }
  const domain = wordsToDomain(cleaned);
  timings.llm_ms = (timings.llm_ms || 0) + (Date.now() - t0);
  return {
    name: cleaned,
    domain,
    website_url: domain ? `https://www.${domain}` : null,
    linkedin_url: null,
    hq: null,
    industry: null,
    size: null,
    synonyms: [cleaned, acr].filter(Boolean),
    mode: "Guess",
  };
}
