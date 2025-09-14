// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { pool } from "./utils/db.js";
import { adminOnly } from "./utils/adminOnly.js";

import companiesRouter from "./routes/companies.js";
import hrLeadsRouter from "./routes/hrLeads.js";
import newsRouter from "./routes/news.js";
import enrichRouter from "./routes/enrich.js";
import { signJwt } from "./utils/jwt.js"; // username/password login

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ---------- Middleware ----------
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------- Health ----------
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/__diag", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db_ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, db_ok: false, error: String(err?.message || err) });
  }
});

// ---------- Auth (username/password only) ----------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const u = process.env.ADMIN_USERNAME || "admin";
    const p = process.env.ADMIN_PASSWORD || "admin123";

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "missing credentials" });
    }
    if (String(username) !== String(u) || String(password) !== String(p)) {
      return res.status(401).json({ ok: false, error: "invalid credentials" });
    }
    const token = signJwt({ sub: "admin", role: "admin" }, "12h");
    return res.json({ ok: true, token });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "login failed" });
  }
});

// Handy verify endpoint for the dashboard
app.get("/api/auth/verify", adminOnly, (_req, res) => res.json({ ok: true }));

// ---------- Stats (for DashboardHome) ----------
app.get("/api/stats", adminOnly, async (_req, res) => {
  const safeCount = async (sql) => {
    try {
      const { rows } = await pool.query(sql);
      return Number(rows?.[0]?.count || 0);
    } catch {
      return 0;
    }
  };
  const companies = await safeCount(`SELECT COUNT(*) FROM companies`);
  const leads     = await safeCount(`SELECT COUNT(*) FROM hr_leads`);
  const new7d     = await safeCount(`SELECT COUNT(*) FROM hr_leads WHERE created_at >= NOW() - INTERVAL '7 days'`);
  // Outreach: if you have a messages/outreach table, replace this; otherwise we approximate:
  const outreach  = await safeCount(`SELECT COUNT(*) FROM hr_leads WHERE status ILIKE 'contacted' OR status ILIKE 'outreach%'`);

  let recent = [];
  try {
    const { rows } = await pool.query(`
      SELECT id, company_name, role, status, created_at
      FROM hr_leads
      ORDER BY created_at DESC NULLS LAST
      LIMIT 5
    `);
    recent = rows || [];
  } catch {
    recent = [];
  }

  res.json({
    ok: true,
    data: { companies, leads, outreach, new7d, recent }
  });
});

// ---------- API Routers ----------
app.use("/api/companies", companiesRouter);
app.use("/api/hr-leads", hrLeadsRouter);
app.use("/api/news", newsRouter);
app.use("/api/enrich", enrichRouter);

// ---------- Static (dashboard SPA) ----------
const dashboardDist = path.join(__dirname, "dashboard", "dist");

// serve static assets (cache) but *not* index.html
if (fs.existsSync(dashboardDist)) {
  app.use(
    express.static(dashboardDist, {
      setHeaders: (res, filePath) => {
        // don’t cache HTML (especially index.html)
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store, must-revalidate");
        }
      },
    })
  );

  const indexFile = path.join(dashboardDist, "index.html");

  // SPA fallback: anything not under /api/* returns index.html with no-store
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(indexFile);
  });
}

app.listen(PORT, () => {
  console.log(`UPR backend listening on ${PORT}`);
});
