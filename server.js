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

// Simple creds (env-backed; defaults to admin/supersecret)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "supersecret";

// NEW: Admin bearer token (optional). If set, can be used instead of session.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

// DB pool (Render/Supabase)
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

// Accept either a valid session token OR the ADMIN_TOKEN (if defined)
const hasAccess = (token) => {
  if (!token) return false;
  if (SESSIONS.has(token)) return true;
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return true;
  return false;
};

const requireSession = (req, res) => {
  const t = readBearer(req);
  if (!t) return res.status(401).json({ ok: false, error: "Missing token" });
  if (!hasAccess(t)) return res.status(401).json({ ok: false, error: "Invalid session" });
  return true;
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

// ---- Auth: username/password (session-based) ----
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = makeToken();
    SESSIONS.add(token);
    return res.json({ ok: true, token });
  }
  return res.status(401).json({ ok: false, error: "Invalid credentials" });
});

app.post("/api/auth/logout", (req, res) => {
  const t = readBearer(req);
  if (t) SESSIONS.delete(t);
  res.json({ ok: true });
});

// ---- NEW: Auth: bearer ADMIN_TOKEN verification ----
// Frontend Login (token mode) will call this with Authorization: Bearer <token>
app.get("/api/auth/verify", (req, res) => {
  try {
    const token = readBearer(req);
    // Spec: verify strictly against ADMIN_TOKEN
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ---- Leads (Postgres) ----
app.get("/api/leads", async (req, res) => {
  if (!requireSession(req, res)) return;
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
  if (!requireSession(req, res)) return;
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

// ---- Static + SPA fallback ----
if (fs.existsSync(clientDir)) app.use(express.static(clientDir));
app.get(/.*/, (_req, res) => {
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  res.status(500).send("UI not built");
});

app.listen(PORT, () => {
  console.log(`[UPR] Server listening on :${PORT}`);
});
