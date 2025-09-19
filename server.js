import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { pool } from "./utils/db.js";
import { adminOnly } from "./utils/adminOnly.js";

import companiesRouter from "./routes/companies.js";
import hrLeadsRouter from "./routes/hrLeads.js";
import newsRouter from "./routes/news.js";
import enrichRouter from "./routes/enrich.js"; // <-- refactored aggregator
import { signJwt } from "./utils/jwt.js"; // username/password login

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ---------- Middleware ----------
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------- Health / Diagnostics ----------
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/__diag", async (_req, res) => {
  let db_ok = false;
  try { await pool.query("SELECT 1"); db_ok = true; } catch {}
  const env = [
    "DATABASE_URL","NEVERBOUNCE_API_KEY","ZEROBOUNCE_API_KEY",
    "ADMIN_USERNAME","ADMIN_PASSWORD","JWT_SECRET",
    "OPENAI_API_KEY","APOLLO_API_KEY","APOLLOIO_API_KEY","APOLLO_TOKEN"
  ].reduce((o,k)=> (o[k] = !!process.env[k], o), {});
  const routesMounted =
    (app._router?.stack || [])
      .filter(l => l?.route)
      .map(l => (Object.keys(l.route.methods)[0] || "GET") + " " + l.route.path);
  res.json({ ok: true, db_ok, env, routesMounted });
});

// ---------- Auth (username/password only) ----------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const u = process.env.ADMIN_USERNAME || process.env.UPR_ADMIN_USER || "admin";
    const p = process.env.ADMIN_PASSWORD || process.env.UPR_ADMIN_PASS || "admin123";

    if (!username || !password)
      return res.status(400).json({ ok: false, error: "missing credentials" });
    if (String(username) !== String(u) || String(password) !== String(p))
      return res.status(401).json({ ok: false, error: "invalid credentials" });

    const token = signJwt({ sub: "admin", role: "admin" }, "12h");
    return res.json({ ok: true, token });
  } catch {
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

  res.json({ ok: true, data: { companies, leads, outreach, new7d, recent } });
});

// ---------- API Routers ----------
app.use("/api/companies", companiesRouter);
app.use("/api/hr-leads", hrLeadsRouter);
app.use("/api/news", newsRouter);
app.use("/api/enrich", enrichRouter);

// ---------- Static (dashboard SPA) ----------
const dashboardDist = path.join(__dirname, "dashboard", "dist");

if (fs.existsSync(dashboardDist)) {
  app.use(
    express.static(dashboardDist, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store, must-revalidate");
        }
      },
    })
  );

  const indexFile = path.join(dashboardDist, "index.html");
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(indexFile);
  });
}

/**
 * Rich diagnostics endpoint. Doesn't replace /__diag; it's available at /__diag_full
 * so we don't rely on where the minimal /__diag was registered.
 */
import os from "os";
function listRoutes(app) {
  try {
    const out = [];
    for (const layer of (app?._router?.stack || [])) {
      if (layer?.route) {
        const methods = Object.keys(layer.route.methods || {})
          .filter(Boolean).map(m => m.toUpperCase()).join(",");
        out.push(`${methods} ${layer.route.path}`);
      } else if (layer?.name === "router" && layer?.handle?.stack) {
        for (const r of layer.handle.stack) {
          if (r?.route) {
            const methods = Object.keys(r.route.methods || {})
              .filter(Boolean).map(m => m.toUpperCase()).join(",");
            out.push(`${methods} ${r.route.path}`);
          }
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

app.get("/__diag_full", async (_req, res) => {
  let db_ok = false;
  let db_error = null;
  try {
    await pool.query("SELECT 1");
    db_ok = true;
  } catch (e) {
    db_ok = false;
    db_error = String(e?.message || e);
  }

  const envKeys = [
    "DATABASE_URL",
    "UPR_ADMIN_USER",
    "UPR_ADMIN_PASS",
    "JWT_SECRET",
    "APOLLO_API_KEY",
    "OPENAI_API_KEY",
    "NEVERBOUNCE_API_KEY",
    "ZEROBOUNCE_API_KEY",
  ];
  const env = {};
  for (const k of envKeys) env[k] = !!process.env[k];

  res.json({
    ok: true,
    db_ok,
    db_error,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    routesMounted: listRoutes(app),
    env,
  });
});
app.listen(PORT, () => {
  console.log(`UPR backend listening on ${PORT}`);
});
