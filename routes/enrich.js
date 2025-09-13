// routes/enrich.js
import express from "express";
import { ok, bad } from "../utils/respond.js";

const router = express.Router();

function parseInput(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return { text: "", host: null, companyName: "" };

  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase();                   // e.g., g42.ai
    const nameFromHost = host
      .replace(/^www\./, "")
      .replace(/\.[a-z]{2,}$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
    return { text: raw, host, companyName: nameFromHost };
  } catch {
    // free text → try to slug to host-ish
    const slug = raw
      .toLowerCase()
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const host = slug ? `${slug}.com` : null;                // best-effort
    const companyName = raw
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());
    return { text: raw, host, companyName };
  }
}

function guessLinkedInCompany(host) {
  if (!host) return null;
  const base = host.replace(/^www\./, "").replace(/\.[a-z]{2,}$/i, "");
  return `https://www.linkedin.com/company/${base}`;
}

function patternEmails(host) {
  if (!host) return [];
  return [
    { name: "HR Director", title: "HR Director", email_guess: `hr@${host}`, score: 82, email_status: "patterned" },
    { name: "TA Manager", title: "Talent Acquisition Manager", email_guess: `careers@${host}`, score: 71, email_status: "patterned" },
    { name: "Payroll Lead", title: "Payroll Lead", email_guess: `payroll@${host}`, score: 68, email_status: "patterned" },
  ];
}

// POST /api/enrich  { input: string }
router.post("/", async (req, res) => {
  try {
    const { input } = req.body || {};
    if (!input || !String(input).trim()) return bad(res, "input required");

    const parsed = parseInput(input);
    const website = parsed.host ? `https://${parsed.host}` : null;

    const contacts = patternEmails(parsed.host).map((c, i) => ({
      id: `c_${i + 1}`,
      name: c.name,
      title: c.title,
      dept: i === 0 ? "HR" : i === 1 ? "Talent Acquisition" : "Payroll",
      email: null,                    // keep as null (only a guess)
      linkedin: null,
      confidence: (c.score || 70) / 100,
      email_guess: c.email_guess,
      email_status: c.email_status,
    }));

    const data = {
      company: {
        name: parsed.companyName || "Unknown Company",
        website,
        linkedin: guessLinkedInCompany(parsed.host),
        hq: "Abu Dhabi",
        industry: "Technology",
        size: "1000–5000",
        notes: `Query: ${parsed.text}`,
        locations: ["Abu Dhabi"],
        type: "ALE",
      },
      contacts,
      tags: ["uae", "hr", "lead-gen"],
      score: 72,
      outreachDraft:
        `Subject: Quick intro — payroll savings for ${parsed.companyName || "your team"}\n\n` +
        `Hi {{first}},\n\n` +
        `We help UAE employers reduce payroll costs (WPS-compliant) while improving employee experience. ` +
        `Based on ${parsed.companyName || "your company"}’s size, there’s likely a 10–15% saving.\n\n` +
        `Worth a 15-min chat this week?\n\n— Siva`,
    };

    return ok(res, data);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

export default router;
