// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pkg from "pg";

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-admin-token";

// --- DB Pool ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(express.json());

// paths
const clientDir = path.join(__dirname, "dashboard", "dist");
const indexHtml = path.join(clientDir, "index.html");

// auth helpers
function readBearer(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}
function requireAdmin(req, res) {
  const token = readBearer(req);
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: "Invalid token" });
  return true;
}

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// leads: list
app.get("/api/leads", async (req, res) => {
  if (!requireAdmin(req, res)) return;
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

// leads: create
app.post("/api/leads", async (req, res) => {
  if (!requireAdmin(req, res)) return;
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

// static + SPA fallback
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
}
app.get(/.*/, (_req, res) => {
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  res.status(500).send("UI not built");
});

app.listen(PORT, () => {
  console.log(`[UPR] Server running on port ${PORT}`);
});
