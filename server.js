// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

import { pool } from "./utils/db.js";
import { adminOnly } from "./utils/adminOnly.js";
import { signJwt } from "./utils/jwt.js";

import companiesRouter from "./routes/companies.js";
import hrLeadsRouter from "./routes/hrLeads.js";
import newsRouter from "./routes/news.js";
import enrichRouter from "./routes/enrich.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

/* ---------- helpers ---------- */
function pickEnv(names) {
  for (const n of names) {
    const v = process.env[n];
    if (v != null && String(v).length > 0) return v;
  }
  return null;
}

// Accept MANY aliases so you don’t fight env names.
const ADMIN_USER =
  pickEnv(["ADMIN_USER", "ADMIN_USERNAME", "DASHBOARD_USER", "AUTH_USER"]) ||
  "admin";

const ADMIN_PASS_PLAINTEXT = pickEnv([
  "ADMIN_PASSWORD",
  "ADMIN_PASS",
  "DASHBOARD_PASSWORD",
  "AUTH_PASSWORD",
]);

const ADMIN_PASS_BCRYPT = pickEnv([
  "ADMIN_PASSWORD_BCRYPT",
  "ADMIN_PASSWORD_HASH",
  "DASHBOARD_PASSWORD_BCRYPT",
]);

/* ---------- middleware ---------- */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ---------- health/diag ---------- */
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/__diag", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      db_ok: true,
      // Don’t leak values, just presence flags:
      auth: {
        ADMIN_USER_present: !!ADMIN_USER,
        ADMIN_PASSWORD_present: !!ADMIN_PASS_PLAINTEXT,
        ADMIN_PASSWORD_BCRYPT_present: !!ADMIN_PASS_BCRYPT,
      },
    });
  } catch {
    res.status(500).json({ ok: false, db_ok: false });
  }
});

/* ---------- auth: username/password ---------- */
// POST /api/auth/login { username, password }
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "username/password required" });
    }

    if (username !== ADMIN_USER) {
      return res.status(401).json({ ok: false, error: "invalid credentials" });
    }

    // bcrypt mode wins if provided; otherwise plaintext compare
    if (ADMIN_PASS_BCRYPT) {
      const ok = await bcrypt.compare(password, ADMIN_PASS_BCRYPT);
      if (!ok) return res.status(401).json({ ok: false, error: "invalid credentials" });
    } else if (ADMIN_PASS_PLAINTEXT) {
      if (password !== ADMIN_PASS_PLAINTEXT) {
        return res.status(401).json({ ok: false, error: "invalid credentials" });
      }
    } else {
      // No password set in env at all -> deny
      return res.status(401).json({ ok: false, error: "admin password not set" });
    }

    const token = signJwt({ sub: ADMIN_USER, role: "admin" }, 60 * 60 * 24 * 7);
    return res.json({ ok: true, token });
  } catch (e) {
    console.error("login error", e);
    return res.status(500).json({ ok: false, error: "login failed" });
  }
});

// GET /api/auth/verify (JWT must be sent as Authorization: Bearer <token>)
app.get("/api/auth/verify", adminOnly, (_req, res) => {
  res.json({ ok: true });
});

// Back-compat for earlier UI alias
app.get("/api/admin/verify", adminOnly, (_req, res) => {
  res.json({ ok: true });
});

/* ---------- API routers (JWT-protected where needed) ---------- */
app.use("/api/companies", companiesRouter);
app.use("/api/hr-leads", hrLeadsRouter);
app.use("/api/news", newsRouter);
app.use("/api/enrich", enrichRouter);

/* ---------- static dashboard (SPA) ---------- */
const dashboardDist = path.join(__dirname, "dashboard", "dist");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`UPR backend listening on ${PORT}`);
  console.log(
    `[auth] user=${ADMIN_USER} mode=${
      ADMIN_PASS_BCRYPT ? "bcrypt" : ADMIN_PASS_PLAINTEXT ? "plaintext" : "unset"
    }`
  );
});
