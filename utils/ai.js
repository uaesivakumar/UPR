// utils/ai.js
// Provides: aiEnrichFromInput(input: string)
// - If OPENAI_API_KEY is set, calls OpenAI for enrichment (lightweight prompt).
// - Otherwise returns a deterministic mock so the app never crashes.
//
// This file intentionally has a single named export { aiEnrichFromInput }
// to match routes/enrich.js.

import crypto from "node:crypto";

// --- Helpers ---------------------------------------------------------------

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
    .trim();
}

function guessCompany(input) {
  const raw = String(input || "").trim();
  // Grab a token that looks like a domain, else first word(s).
  const domainMatch = raw.match(/\b([a-z0-9-]+\.[a-z]{2,})(?:\/|$)/i);
  const name =
    (domainMatch ? domainMatch[1].split(".")[0] : raw.replace(/[^a-z0-9\s.-]/gi, " "))
      .split(/\s+/)
      .slice(0, 5)
      .join(" ")
      || "Unknown Company";
  let domain = domainMatch ? domainMatch[1] : null;
  if (!domain && /\b[A-Z0-9.-]+\b/.test(raw)) {
    const token = raw.split(/\s+/).find((t) => t.includes(".") && !t.includes("http"));
    if (token) domain = token.replace(/^www\./i, "");
  }
  return {
    name: titleCase(name),
    domain: domain || null,
    website: domain ? `https://${domain}` : null,
    linkedin: null,
    hq: /abu\s*dhabi/i.test(raw) ? "Abu Dhabi" : (/dubai/i.test(raw) ? "Dubai" : null),
    industry: null,
    size: null,
    notes: null,
  };
}

function mockContacts(company, input) {
  const base = (company.domain || company.name || "company").toLowerCase().replace(/\s+/g, "");
  const dept = /finance|payroll/i.test(input) ? "Finance"
            : /talent|recruit|hr/i.test(input) ? "HR"
            : null;

  const candidates = [
    { name: "HR Director", title: "HR Director", dept: "HR", user: "hr" },
    { name: "TA Manager", title: "Talent Acquisition Manager", dept: "HR", user: "careers" },
    { name: "Payroll Lead", title: "Payroll Lead", dept: "Finance", user: "payroll" }
  ];

  return candidates
    .filter((c) => !dept || c.dept === dept)
    .map((c, i) => ({
      id: uuid(),
      name: c.name,
      title: c.title,
      dept: c.dept,
      // We purposely *guess* here; the enrich pipeline will pattern/verify later.
      email: null,
      email_guess: company.domain ? `${c.user}@${company.domain}` : null,
      email_status: company.domain ? "patterned" : "unknown",
      linkedin: null,
      confidence: 0.6 + 0.1 * (2 - i), // 0.8, 0.7, 0.6
      score: Math.round(60 + 10 * (2 - i)),
    }));
}

function mockTags(input) {
  const tags = [];
  if (/uae|abu\s*dhabi|dubai/i.test(input)) tags.push("UAE");
  if (/hr|talent|recruit/i.test(input)) tags.push("HR");
  if (/finance|payroll/i.test(input)) tags.push("Finance");
  if (/ai|tech|data/i.test(input)) tags.push("Tech");
  return tags.length ? tags : ["General"];
}

function mockDraft(company, contacts) {
  const c = contacts[0];
  const toName = c?.name || "Hiring Team";
  return `Subject: Partnership with ${company.name}

Hi ${toName},

I’m reaching out regarding ${company.name} and recent hiring needs in the UAE. We can help you reduce sourcing time and improve lead quality using a focused enrichment + outreach workflow.

If helpful, I can share a shortlist tailored to ${company.hq || "your HQ"} within 24 hours.

Best,
UPR Team`;
}

// --- OpenAI (optional) -----------------------------------------------------

async function openAIEnrich(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // Lazy import to avoid bundling for environments without the key.
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const prompt = `
You are a data enricher. Given a short query, extract:
- company: { name, domain (root like example.com), linkedin_url (if obvious), hq city if mentioned }
- top 1-3 relevant decision-maker contacts: { name, title, dept, linkedin_url if obvious }
Return strict JSON with keys: company, contacts[].
Query: "${input}"`;

  const resp = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: "Return only valid JSON." },
      { role: "user", content: prompt },
    ],
  });

  const text = resp.choices?.[0]?.message?.content?.trim() || "";
  // Try JSON parse; if fails, fall back to null (caller will mock)
  try {
    const parsed = JSON.parse(text);
    return {
      company: {
        name: parsed?.company?.name || null,
        domain: parsed?.company?.domain || null,
        website: parsed?.company?.domain ? `https://${parsed.company.domain}` : null,
        linkedin: parsed?.company?.linkedin_url || null,
        hq: parsed?.company?.hq || null,
        industry: null,
        size: null,
        notes: null,
      },
      contacts: Array.isArray(parsed?.contacts)
        ? parsed.contacts.slice(0, 3).map((c) => ({
            id: uuid(),
            name: c?.name || null,
            title: c?.title || null,
            dept: c?.dept || null,
            linkedin: c?.linkedin_url || null,
            email: null,
            email_guess: null,
            email_status: "unknown",
            confidence: 0.7,
            score: 70,
          }))
        : [],
    };
  } catch {
    return null;
  }
}

// --- Public API ------------------------------------------------------------

export async function aiEnrichFromInput(input) {
  // Try OpenAI if configured
  try {
    const viaAI = await openAIEnrich(input);
    if (viaAI?.company?.name) {
      // Add tags/score/draft for the UI to stay consistent
      const tags = mockTags(input);
      const score = 70 + Math.min(20, tags.length * 5);
      const outreachDraft = mockDraft(viaAI.company, viaAI.contacts || []);
      return {
        company: viaAI.company,
        contacts: viaAI.contacts || [],
        tags,
        score,
        outreachDraft,
      };
    }
  } catch (e) {
    // swallow and fall back to mock
    console.warn("OpenAI enrich failed, using mock:", e?.message || e);
  }

  // Deterministic mock fallback (no external calls)
  const company = guessCompany(input);
  const contacts = mockContacts(company, input);
  const tags = mockTags(input);
  const score = 65 + Math.min(20, tags.length * 5);
  const outreachDraft = mockDraft(company, contacts);

  return {
    company,
    contacts,
    tags,
    score,
    outreachDraft,
  };
}
