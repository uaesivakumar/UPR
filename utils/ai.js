// utils/ai.js
// Single source of truth for "AI enrichment".
// If OPENAI_API_KEY is set, we call OpenAI for structured JSON.
// Otherwise we fall back to a deterministic heuristic stub so the app still works.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";

/** Utility: safe JSON.parse with fallback */
function tryParseJSON(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}

/** Utility: naive company parsing/normalization when no LLM is available */
function naiveParseCompany(input) {
  const raw = String(input || "").trim();
  const name = raw.toUpperCase();
  // Pull a "domain" from the last token that looks like a domain, else join words
  const guess = raw.replace(/https?:\/\//i, "").trim();
  // If it already looks like a host, keep it; else produce a simple slug
  const domainLike = guess.match(/\b[a-z0-9.-]+\.[a-z]{2,}\b/i)?.[0] || null;
  const slug = raw.split(/\s+/).join("").toLowerCase();
  const domain = domainLike || slug;
  return {
    name,
    website: domainLike ? `https://${domainLike}` : null,
    domain,
    linkedin: null,
    hq: (raw.match(/\b(Abu Dhabi|Dubai|Sharjah)\b/i)?.[0]) || null,
    industry: null,
    size: null,
    notes: null,
  };
}

/** Utility: stub contacts when no LLM */
function naiveContacts(company) {
  const base = (company?.domain || company?.name || "company").toLowerCase();
  const at = company?.domain && company.domain.includes(".") ? company.domain : `${base}.com`;
  return [
    {
      id: "c1",
      name: "HR Director",
      title: "HR Director",
      dept: "HR",
      linkedin: null,
      email: `hr@${at}`,
      confidence: 0.82,
      email_status: "patterned",
    },
    {
      id: "c2",
      name: "Talent Acquisition Manager",
      title: "Talent Acquisition Manager",
      dept: "HR",
      linkedin: null,
      email: `careers@${at}`,
      confidence: 0.71,
      email_status: "patterned",
    },
    {
      id: "c3",
      name: "Payroll Lead",
      title: "Payroll Lead",
      dept: "Finance",
      linkedin: null,
      email: `payroll@${at}`,
      confidence: 0.68,
      email_status: "patterned",
    },
  ];
}

/** Utility: trivial scoring + tags */
function scoreAndTags(input, company, contacts) {
  const tags = [];
  if (/uae|abu dhabi|dubai|sharjah/i.test(input)) tags.push("UAE");
  if (/hr|talent|recruit/i.test(input)) tags.push("HR");
  if (/finance|payroll/i.test(input)) tags.push("Finance");
  const score =
    60 +
    Math.min(30, (company.website ? 10 : 0) + (company.linkedin ? 10 : 0) + (contacts.length * 3));
  return { score: Math.round(score), tags };
}

/** Utility: simple outreach draft */
function outreachDraft(company, primary) {
  const contactName = primary?.name?.split(" ")[0] || "there";
  return `Hi ${contactName},

I’m reaching out regarding ${company?.name || "your company"}. We specialize in UAE payroll and benefits optimization and thought this might be relevant to your team.

If helpful, I can share a 1-page assessment tailored to ${company?.name || "your org"} and UAE regulations.

Would you be open to a brief chat this week?

Best,
— UPR Team`;
}

/**
 * Call OpenAI for structured enrichment when a key exists.
 * The model returns a strict JSON object matching our schema.
 */
async function callOpenAIForEnrichment(input) {
  const sys = `
You are a data extraction assistant. Given a short free-text query about a company and target roles,
return a STRICT JSON object with this exact shape:

{
  "company": {
    "name": "string",
    "website": "string|null",
    "domain": "string",
    "linkedin": "string|null",
    "hq": "Abu Dhabi|Dubai|Sharjah|null",
    "industry": "string|null",
    "size": "string|null",
    "notes": "string|null"
  },
  "contacts": [
    {
      "id": "string",
      "name": "string",
      "title": "string",
      "dept": "string|null",
      "linkedin": "string|null",
      "email": "string|null",
      "confidence": 0.0
    }
  ],
  "tags": ["string", "..."],
  "score": 0,
  "outreachDraft": "string"
}

Rules:
- If you don't know a value, use null (not "unknown").
- "hq" must be one of Abu Dhabi, Dubai, Sharjah or null.
- "confidence" is 0..1.
- IDs can be short strings ("c1","c2"...).
- Return ONLY the JSON. No commentary.`;

  const user = `Query: ${input}`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = tryParseJSON(content);
  if (!parsed || !parsed.company || !Array.isArray(parsed.contacts)) {
    throw new Error("OpenAI returned invalid JSON");
  }
  return parsed;
}

/**
 * Main exported function: returns a normalized enrichment payload.
 * - Uses OpenAI when OPENAI_API_KEY is present
 * - Falls back to a deterministic heuristic when not
 */
export async function aiEnrichFromInput(input) {
  const q = String(input || "").trim();
  if (!q) throw new Error("input required");

  if (OPENAI_API_KEY) {
    try {
      const rich = await callOpenAIForEnrichment(q);
      // Ensure minimal fields exist
      if (!rich.outreachDraft) {
        rich.outreachDraft = outreachDraft(rich.company, rich.contacts?.[0]);
      }
      if (typeof rich.score !== "number" || !Array.isArray(rich.tags)) {
        const st = scoreAndTags(q, rich.company || {}, rich.contacts || []);
        rich.score = st.score;
        rich.tags = st.tags;
      }
      return rich;
    } catch (err) {
      // If LLM fails, degrade gracefully to heuristic
      console.error("[ai] OpenAI failure; falling back:", err.message || err);
    }
  }

  // Heuristic path
  const company = naiveParseCompany(q);
  const contacts = naiveContacts(company);
  const { score, tags } = scoreAndTags(q, company, contacts);
  return {
    company,
    contacts,
    tags,
    score,
    outreachDraft: outreachDraft(company, contacts[0]),
  };
}
