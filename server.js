// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

import { pool } from "./utils/db.js";
import { adminOnly } from "./utils/adminOnly.js";

// API routers
import companiesRouter from "./routes/companies.js";
import hrLeadsRouter from "./routes/hrLeads.js";
import newsRouter from "./routes/news.js";
import enrichRouter from "./routes/enrich.js";
import statsRouter from "./routes/stats.js"; // <-- NEW

// JWT helpers (support whichever export name your utils/jwt.js provides)
import * as jwtUtil from "./utils/jwt.js";

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
  } catch {
    res.status(500).json({ ok: false, db_ok: false });
  }
});

// ---------- Auth (username/password + JWT) ----------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";

// Pick whichever exists in utils/jwt.js
const signToken =
  jwtUtil.signAdminJwt || jwtUtil.signJwt || jwtUtil.sign || (() => { throw new Error("No signer in utils/jwt.js"); });

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "username and password required" });
    }
    if (!ADMIN_USERNAME || (!ADMIN_PASSWORD && !ADMIN_PASSWORD_HASH)) {
      return res.status(500).json({ ok: false, error: "server auth not configured" });
    }

    const userOk = username === ADMIN_USERNAME;
    let passOk = false;

    if (ADMIN_PASSWORD_HASH) {
      try {
        passOk = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
      } catch {
        passOk = false;
      }
    } else {
      passOk = password === ADMIN_PASSWORD;
    }

    if (!userOk || !passOk) {
      return res.status(401).json({ ok: false, error: "invalid credentials" });
    }

    const token = signToken({ sub: ADMIN_USERNAME, role: "admin" }, { expiresIn: "30d" });
    return res.json({ ok: true, token });
  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ ok: false, error: "login failed" });
  }
});

// Verification used by the dashboard client
app.get("/api/auth/verify", adminOnly, (_req, res) => res.json({ ok: true }));
// Back-compat (old UI)
app.get("/api/admin/verify", adminOnly, (_req, res) => res.json({ ok: true }));

// ---------- API ----------
app.use("/api/companies", companiesRouter);
app.use("/api/hr-leads", hrLeadsRouter);
app.use("/api/news", newsRouter);
app.use("/api/enrich", enrichRouter);
app.use("/api/stats", statsRouter); // <-- NEW

// ---------- Static (dashboard SPA) ----------
const dashboardDist = path.join(__dirname, "dashboard", "dist");
if (fs.existsSync(dashboardDist)) {
  // Cache built assets, but always fetch a fresh index.html so new deploys reflect immediately
  app.use(express.static(dashboardDist, { maxAge: "1h", immutable: true }));

  // SPA fallback – mark HTML as no-store so browsers don't keep old shells
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
}

// ---------- Optional worker banner ----------
if ((process.env.SOURCING_WORKER_ENABLED || "").toLowerCase() === "true") {
  console.log("[worker] enabled (external worker process should be running).");
} else {
  console.log("[worker] disabled (SOURCING_WORKER_ENABLED!=true). Skipping.");
}

app.listen(PORT, () => {
  console.log(`UPR backend listening on ${PORT}`);
});
