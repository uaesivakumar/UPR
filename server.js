// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import pkg from "pg";

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ---- Admin login creds ----
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "supersecret";

// ---- Admin token (for direct token login) ----
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

// ---- DB pool ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(express.json());

// ---- SPA paths ----
const clientDir = path.join(__dirname, "dashboard", "dist");
const indexHtml = path.join(clientDir, "index.html");

// ---- Sessions (in-memory) ----
const SESSIONS = new Set();
const makeToken = () => crypto.randomUUID();
const readBearer = (req) => {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
};

const hasAccess = (token) => {
  if (!token) return false;
  if (SESSIONS.has(token)) return true;
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return true;
  return false;
};

// ---- Diag ----
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/__diag", async (_req, res) => {
  let db_ok = false;
  try {
    const r = await pool.query("select 1 as ok");
    db_ok = r.rows?.[0]?.ok === 1;
  } catch {}
  res.json({
    ok: true,
    admin_username_set: Boolean(process.env.ADMIN_USERNAME),
    admin_token_set: Boolean(ADMIN_TOKEN),
    clientDir,
    index_exists: fs.existsSync(indexHtml),
    db_ok,
  });
});
app.get("/__ls", (_req, res) => {
  try {
    const root = fs.readdirSync(__dirname);
    const dash = fs.existsSync(path.join(__dirname, "dashboard"))
      ? fs.readdirSync(path.join(__dirname, "dashboard"))
      : null;
    const dist = fs.existsSync(clientDir) ? fs.readdirSync(clientDir) : null;
    res.json({ ok: true, root, dash, dist });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---- Public auth routes ----
// Session login (returns a bearer token)
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = makeToken();
    SESSIONS.add(token);
    return res.json({ ok: true, token });
  }
  return res.status(401).json({ ok: false, error: "Invalid credentials" });
});

// Verify ADMIN_TOKEN (for token mode)
app.get("/api/auth/verify", (req, res) => {
  try {
    const token = readBearer(req);
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("[auth] verify error:", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ---- DRY auth middleware for /api/* (after public auth endpoints) ----
const EXEMPT = new Set([
  "/api/auth/login",
  "/api/auth/verify",
]);

app.use("/api", (req, res, next) => {
  if (EXEMPT.has(req.path)) return next();
  const t = readBearer(req);
  if (!hasAccess(t)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
});

// ---- Protected auth route ----
app.post("/api/auth/logout", (req, res) => {
  const t = readBearer(req);
  if (t) SESSIONS.delete(t);
  res.json({ ok: true });
});

// ---- Leads (Postgres) ----
app.get("/api/leads", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, company, role, salary_band, status, created_at FROM leads ORDER BY created_at DESC"
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error("Error fetching leads:", e);
    res.status(500).json({ ok: false, error: "DB error" });
  }
});

app.post("/api/leads", async (req, res) => {
  const { company, role, salary_band = "AED 50K+", status = "New" } = req.body || {};
  if (!company || !role) {
    return res.status(400).json({ ok: false, error: "company and role required" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO leads (company, role, salary_band, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, company, role, salary_band, status, created_at`,
      [company, role, salary_band, status]
    );
    res.json({ ok: true, data: rows[0] });
  } catch (e) {
    console.error("Error inserting lead:", e);
    res.status(500).json({ ok: false, error: "DB error" });
  }
});

// ---- Enrichment (mock) ----
app.post("/api/enrichment/run", (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ ok: false, error: "query is required" });
    }

    let companyName = "Target Company";
    try {
      if (query.includes("http")) {
        const u = new URL(query);
        const host = (u.hostname || "").replace(/^www\./i, "");
        companyName = host || companyName;
      } else {
        companyName = (query.split(",")[0] || query).trim() || companyName;
      }
      companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);
    } catch {
      /* keep default */
    }

    const payload = {
      company: {
        name: companyName,
        website: query.startsWith("http") ? query : null,
        linkedin: query.includes("linkedin.com/company/") ? query : null,
        hq: "UAE, Dubai",
        industry: "Technology",
        size: "500-1000",
        notes: "Auto-generated mock enrichment. Replace with real provider later.",
      },
      contacts: [
        {
          id: "c1",
          name: "Finance Director (UAE)",
          title: "Finance Director",
          dept: "Finance",
          email: null,
          linkedin: null,
          confidence: 0.86,
        },
        {
          id: "c2",
          name: "Head of HR (MENA)",
          title: "Head of Human Resources",
          dept: "HR",
          email: null,
          linkedin: null,
          confidence: 0.74,
        },
        {
          id: "c3",
          name: "Admin / Payroll Lead",
          title: "Payroll Lead",
          dept: "Admin",
          email: null,
          linkedin: null,
          confidence: 0.69,
        },
      ],
      score: 78,
      tags: ["High-salary", "UAE presence", "Growth"],
      outreachDraft: `Hi {{Name}},

I help UAE employers onboard senior hires smoothly by setting up their salary accounts and credit cards on Day 1 (even before Emirates ID is issued). For ${companyName}, this removes HR follow-ups and gives your team a single trusted banking contact.

If useful, I can share a quick 5-minute outline tailored to your payroll process.

Regards,
Sivakumar
Trusted Banking Partner • Emirates NBD`,
    };

    return res.json({ ok: true, data: payload, meta: { ts: Date.now() } });
  } catch (e) {
    console.error("Enrichment error:", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ---- Static + SPA fallback ----
if (fs.existsSync(clientDir)) app.use(express.static(clientDir));
app.get(/.*/, (_req, res) => {
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  res.status(500).send("UI not built");
});

app.listen(PORT, () => {
  console.log(`[UPR] Server listening on :${PORT}`);
});
