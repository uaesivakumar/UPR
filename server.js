// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { pool } from "./utils/db.js";
import { adminOnly } from "./utils/adminOnly.js";
import { signAdminJwt } from "./utils/jwt.js";

import companiesRouter from "./routes/companies.js";
import hrLeadsRouter from "./routes/hrLeads.js";
import newsRouter from "./routes/news.js";
import enrichRouter from "./routes/enrich.js";

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

// ---------- Auth (username/password) ----------
const ADMIN_USER = process.env.ADMIN_USER || "";
const ADMIN_PASS = process.env.ADMIN_PASS || "";

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "username and password required" });
  }
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = signAdminJwt();
    return res.json({ ok: true, token });
  }
  return res.status(401).json({ ok: false, error: "invalid credentials" });
});

// Used by dashboard to validate stored token
app.get("/api/admin/verify", adminOnly, (_req, res) => res.json({ ok: true }));
app.get("/api/auth/verify", adminOnly, (_req, res) => res.json({ ok: true }));

// ---------- API ----------
app.use("/api/companies", companiesRouter);
app.use("/api/hr-leads", hrLeadsRouter);
app.use("/api/news", newsRouter);
app.use("/api/enrich", enrichRouter);

// ---------- Static (dashboard SPA) ----------
const dashboardDist = path.join(__dirname, "dashboard", "dist");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get("*", (_req, res) => res.sendFile(path.join(dashboardDist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`UPR backend listening on ${PORT}`);
});
