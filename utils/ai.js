// utils/ai.js
import crypto from "crypto";

/**
 * aiEnrichFromInput(input: string) -> {
 *   company: { name, domain, website, linkedin, hq, industry, size, notes },
 *   contacts: [{ id, name, title, dept, email, email_guess, email_status, linkedin, confidence, score }],
 *   score, tags, outreachDraft,
 *   meta: { llm: 'openai' | 'rules', took_ms: number }
 * }
 */

function titleCase(s) {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map(w => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
function looksLikeDomain(s) { return /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(s || ""); }
function firstNonEmpty(...vals) { return vals.find(v => !!(v && String(v).trim())) || null; }

function candidatesFromName(name) {
  const cleaned = String(name || "").replace(/[^a-z0-9 ]/gi, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/\s+/).slice(0, 3);
  const base = parts.join("");
  // Try common UAE/tech TLDs
  return [`${base}.com`, `${base}.ae`, `${base}.ai`];
}

async function probeDomain(url) {
  // best-effort: check if HEAD 200-ish; ignore failures
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(u, { method: "HEAD" });
    if (r.ok) return new URL(u).hostname;
  } catch {}
  return null;
}

function emailFromPattern(fullName, domain, pattern = "first.last") {
  const [first, middle, last] = String(fullName || "")
    .toLowerCase()
    .replace(/[^a-z \-']/g, " ")
    .trim()
    .split(/\s+/);
  const f = (first || "").replace(/[^a-z]/g, "");
  const l = (last || middle || "").replace(/[^a-z]/g, "");
  const i = f ? f[0] : "";
  const j = l ? l[0] : "";
  if (!domain || !f) return null;
  switch (pattern) {
    case "first.last":    return `${f}${l ? "." + l : ""}@${domain}`;
    case "firstlast":     return `${f}${l}@${domain}`;
    case "f.last":        return `${i}${l ? "." + l : ""}@${domain}`;
    case "first.l":       return `${f}${l ? "." + j : ""}@${domain}`;
    case "flast":         return `${i}${l}@${domain}`;
    default:              return `${f}${l ? "." + l : ""}@${domain}`;
  }
}

function scoreFromTitle(t) {
  const s = (t || "").toLowerCase();
  if (/head|director|vp|chief/.test(s)) return 0.8;
  if (/manager|lead/.test(s)) return 0.7;
  return 0.6;
}

export async function aiEnrichFromInput(input) {
  const started = Date.now();
  const trimmed = String(input || "").trim();

  // 1) Extract a company-ish phrase for fallback mode
  const rawName = titleCase(
    trimmed
      .replace(/https?:\/\/\S+/g, "")
      .replace(/linkedin\.com\/company\/\S+/gi, "")
      .replace(/[^\w\s&'-]/g, " ")
  ).replace(/\s+/g, " ").trim();

  let company = {
    name: rawName || "Unknown",
    domain: null,
    website: null,
    linkedin: null,
    hq: null,
    industry: null,
    size: null,
    notes: null,
  };

  // 2) Try to extract/guess a domain quickly
  const inlineDomain = (trimmed.match(/\b([a-z0-9-]+\.[a-z]{2,})\b/i) || [])[1];
  if (inlineDomain) company.domain = inlineDomain.toLowerCase();

  if (!company.domain && company.name && company.name.length <= 40) {
    // Heuristic guesses and probe one quickly
    for (const c of candidatesFromName(company.name)) {
      const hit = await probeDomain(c);
      if (hit) { company.domain = hit; company.website = `https://${hit}`; break; }
    }
  }
  if (!company.website && company.domain) company.website = `https://${company.domain}`;

  // 3) If OPENAI_API_KEY exists, ask the LLM to structure & improve
  const useLLM = !!process.env.OPENAI_API_KEY;
  let contacts = [];

  if (useLLM) {
    const sys = `You are a precise data extractor. 
Return STRICT JSON with keys:
company {name, domain, website, linkedin, hq, industry, size, notes}
contacts: array of max 3 objects {name, title, dept, linkedin}
Never invent real emails; leave email empty.`;

    const user = `Input: ${trimmed}\n\nIf input lacks clear company, infer likely name from phrase.`;

    const body = {
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    };

    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(txt);

      // Merge back into our object (prefer LLM but keep any domain we probed)
      company = {
        ...company,
        ...parsed.company,
        name: titleCase(parsed?.company?.name || company.name),
        domain: firstNonEmpty(parsed?.company?.domain, company.domain),
        website: firstNonEmpty(parsed?.company?.website, company.website),
        linkedin: firstNonEmpty(parsed?.company?.linkedin, null),
        hq: firstNonEmpty(parsed?.company?.hq, null),
      };

      contacts = Array.isArray(parsed?.contacts) ? parsed.contacts.slice(0, 3) : [];
    } catch (e) {
      console.warn("openai enrich failed (falling back):", e?.message);
    }
  }

  // 4) Rules fallback / post-processing
  if (!contacts.length) {
    contacts = [
      { name: "HR Director", title: "HR Director", dept: "HR", linkedin: null },
      { name: "TA Manager",  title: "Talent Acquisition Manager", dept: "HR", linkedin: null },
      { name: "Payroll Lead", title: "Payroll Lead", dept: "Finance", linkedin: null },
    ];
  }

  // 5) Add ids, confidence, and email guesses
  const pattern = "first.last";
  contacts = contacts.map(c => {
    const id = crypto.randomUUID();
    const confidence = scoreFromTitle(c.title);
    const email_guess = company.domain ? emailFromPattern(c.name, company.domain, pattern) : null;
    return {
      id,
      name: titleCase(c.name),
      title: titleCase(c.title),
      dept: c.dept || null,
      email: null,
      email_guess,
      email_status: email_guess ? "patterned" : "unknown",
      linkedin: c.linkedin || null,
      confidence,
      score: Math.round(confidence * 100),
    };
  });

  // 6) A simple overall score + tags + outreach template
  const score = Math.round(
    (contacts.reduce((s, c) => s + c.score, 0) / (contacts.length || 1) +
      (company.domain ? 20 : 0)) / 1.2
  );

  const tags = [];
  if (/uae|dubai|abudhabi|abu dhabi/i.test(trimmed)) tags.push("UAE");
  if (/hr|talent|people/i.test(trimmed)) tags.push("HR");

  const pc = contacts[0];
  const outreachDraft =
`Subject: Partnership with ${company.name}

Hi ${pc?.name || "there"},

I’m reaching out about ${company.name}. We help HR teams cut sourcing time and improve lead quality with an enrichment + outreach workflow tailored to ${company.hq || "your region"}.

If helpful, I can share a shortlist for your current roles within 24 hours.

Best,
UPR Team`;

  return {
    company,
    contacts,
    score,
    tags,
    outreachDraft,
    meta: { llm: useLLM ? "openai" : "rules", took_ms: Date.now() - started },
  };
}
