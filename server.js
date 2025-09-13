// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { pool } from "./utils/db.js";

// Routers (modularized)
import companiesRouter from "./routes/companies.js";
import hrLeadsRouter from "./routes/hrLeads.js";
import newsRouter from "./routes/news.js";
import enrichRouter from "./routes/enrich.js"; // mounted on /api/enrich AND /api/enrichment

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Behind Render/Heroku-style proxies
app.set("trust proxy", true);

// Basic body parsing
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Health + diagnostics
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/__diag", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db_ok: true });
  } catch {
    res.status(500).json({ ok: false, db_ok: false });
  }
});

// ---------- API (modular) ----------
app.use("/api/companies", companiesRouter);
app.use("/api/hr-leads", hrLeadsRouter);
app.use("/api/news", newsRouter);

// Enrichment: support both legacy and new paths
app.use("/api/enrich", enrichRouter);
app.use("/api/enrichment", enrichRouter);

// API 404 (after all mounts)
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// Central error handler (only for API requests)
app.use((err, req, res, _next) => {
  // If it's an API route, return JSON; otherwise let the SPA handle below
  if (req.path.startsWith("/api")) {
    console.error(err);
    res.status(500).json({ ok: false, error: "server error" });
    return;
  }
  // non-API falls through to SPA
  _next(err);
});

// ---------- Static (SPA dashboard) ----------
const dashboardDist = path.join(__dirname, "dashboard", "dist");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  // SPA fallback (everything not /api/*)
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`UPR backend listening on ${PORT}`);
});
