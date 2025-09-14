// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";

import { pool } from "./utils/db.js";
import { adminOnly } from "./utils/adminOnly.js";

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

// ---------- Admin token verification (used by dashboard login) ----------
app.get("/api/admin/verify", adminOnly, (_req, res) => res.json({ ok: true }));
// Back-compat alias
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
  // SPA fallback
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
}

// ---------- Optional background worker boot ----------
function bootSourcingWorker() {
  const enabled =
    String(process.env.SOURCING_WORKER_ENABLED ?? "false").toLowerCase() === "true";
  if (!enabled) {
    console.log("[worker] disabled (SOURCING_WORKER_ENABLED!=true). Skipping.");
    return;
  }
  const workerPath = path.join(__dirname, "workers", "sourcingWorker.js");
  if (!fs.existsSync(workerPath)) {
    console.warn("[worker] sourcingWorker.js not found. Skipping.");
    return;
  }
  (async () => {
    try {
      const url = pathToFileURL(workerPath).href;
      const mod = await import(url);
      if (typeof mod.startSourcingWorker === "function") {
        mod.startSourcingWorker();
        console.log("[worker] sourcing worker started.");
      } else {
        console.warn("[worker] Module has no startSourcingWorker(). Skipping.");
      }
    } catch (e) {
      console.error("[worker] failed to start sourcing worker:", e);
    }
  })();
}

app.listen(PORT, () => {
  console.log(`UPR backend listening on ${PORT}`);
  // fire-and-forget
  bootSourcingWorker();
});
