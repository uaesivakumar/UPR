// server.js
import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";

import { pool } from "./utils/db.js";
// NOTE: adminOnly not required anymore for auth verify; leaving other files untouched
// import { adminOnly } from "./utils/adminOnly.js";

import companiesRouter from "./routes/companies.js";
import hrLeadsRouter from "./routes/hrLeads.js";
import newsRouter from "./routes/news.js";
import enrichRouter from "./routes/enrich/index.js"; // index should re-export search/enrichCompany
import { signJwt } from "./utils/jwt.js"; // username/password login

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

/* ------------------------------ helpers (auth) ------------------------------ */
const COOKIE_NAME = "upr_jwt";
const isProd = process.env.NODE_ENV === "production";

// tiny cookie reader (no extra deps)
function getCookie(req, name) {
  const str = req.headers?.cookie || "";
  if (!str) return null;
  const pairs = str.split(";").map(s => s.trim().split("="));
  const map = Object.fromEntries(pairs);
  const v = map[name];
  return v ? decodeURIComponent(v) : null;
}

function setAuthCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${14 * 24 * 60 * 60}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

/* -------------------------------- Middleware -------------------------------- */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ---------------------------------- Health ---------------------------------- */
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/__diag", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db_ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, db_ok: false, error: String(err?.message || err) });
  }
});

/* ----------------------- Auth (username/password only) ----------------------- */
// POST /api/auth/login -> sets HttpOnly cookie + returns {ok:true}
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const u = process.env.ADMIN_USERNAME || process.env.UPR_ADMIN_USER || "admin";
    const p = process.env.ADMIN_PASSWORD || process.env.UPR_ADMIN_PASS || "admin123";

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "missing credentials" });
    }
    if (String(username) !== String(u) || String(password) !== String(p)) {
      return res.status(401).json({ ok: false, error: "invalid credentials" });
    }
    // 14d token by default
    const token = signJwt({ sub: "admin", role: "admin", u: username }, "14d");
    setAuthCookie(res, token);
    return res.json({ ok: true });
  } catch (_e) {
    return res.status(500).json({ ok: false, error: "login failed" });
  }
});

// GET /api/auth/verify -> reads cookie and verifies locally
app.get("/api/auth/verify", (req, res) => {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return res.status(401).json({ ok: false, error: "no_cookie" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ ok: true, user: { username: payload?.u || "admin" } });
  } catch (_e) {
    return res.status(401).json({ ok: false, error: "invalid_token" });
  }
});

// POST /api/auth/logout -> clears cookie
app.post("/api/auth/logout", (req, res) => {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
  res.json({ ok: true });
});

/* ------------------------- Stats (for DashboardHome) ------------------------- */
// keep this open for now; if you want to guard it, copy the verify logic above into a middleware
app.get("/api/stats", async (_req, res) => {
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
  // Outreach approximation (tweak if you have an outreach table)
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

/* --------------------------------- API Routers -------------------------------- */
app.use("/api/companies", companiesRouter);
app.use("/api/hr-leads", hrLeadsRouter);
app.use("/api/news", newsRouter);
app.use("/api/enrich", enrichRouter);

/* ----------------------------- Diagnostics (full) ----------------------------- */
function listRoutes(appOrRouter) {
  const out = [];
  const stack = (appOrRouter && appOrRouter._router ? appOrRouter._router.stack : appOrRouter.stack) || [];
  for (const layer of stack) {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase());
      out.push(...methods.map(m => `${m} ${layer.route.path}`));
    } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
      for (const l2 of layer.handle.stack) {
        if (l2.route && l2.route.path) {
          const methods = Object.keys(l2.route.methods || {}).map(m => m.toUpperCase());
          out.push(...methods.map(m => `${m} ${l2.route.path}`));
        }
      }
    }
  }
  return out;
}

function envFlags() {
  const keys = [
    "DATABASE_URL",
    "UPR_ADMIN_USER","UPR_ADMIN_PASS","ADMIN_USERNAME","ADMIN_PASSWORD",
    "JWT_SECRET",
    "APOLLO_API_KEY",
    "OPENAI_API_KEY",
    "NEVERBOUNCE_API_KEY",
    "ZEROBOUNCE_API_KEY"
  ];
  const o = {};
  for (const k of keys) o[k] = !!process.env[k];
  return o;
}

async function dbPing() {
  try {
    await pool.query("SELECT 1");
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function diagPayload() {
  const db = await dbPing();
  return {
    ok: true,
    db_ok: db.ok,
    db_error: db.error,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    routesMounted: listRoutes(app),
    env: envFlags(),
  };
}

// /api/__diag_full returns JSON
app.get("/api/__diag_full", async (_req, res) => {
  const payload = await diagPayload();
  res.json(payload);
});

// root /__diag_full mirrors /api/__diag_full for curl convenience
app.get("/__diag_full", async (_req, res) => {
  const payload = await diagPayload();
  res.json(payload);
});

/* -------------------------- Static (dashboard SPA) --------------------------- */
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

  // SPA fallback: anything not under /api/* returns index.html with no-store
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(indexFile);
  });
}

/* ---------------------------------- Start ---------------------------------- */
app.listen(PORT, () => {
  console.log(`UPR backend listening on ${PORT}`);
});
