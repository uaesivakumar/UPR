// server/index.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { PORT } from "./config.js";
import pool from "./db.js";
import authRoutes from "./routes/auth.js";
import leadsRoutes from "./routes/leads.js";
import metaRoutes from "./routes/meta.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Paths to built frontend (../dashboard/dist)
const clientDir = path.join(__dirname, "..", "dashboard", "dist");
const indexHtml = path.join(clientDir, "index.html");

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes(pool));
app.use(metaRoutes({ pool, clientDir, indexHtml }));

// Static + SPA fallback
if (fs.existsSync(clientDir)) app.use(express.static(clientDir));
app.get(/.*/, (_req, res) => {
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  res.status(500).send("UI not built");
});

app.listen(PORT, () => {
  console.log(`[UPR] listening on :${PORT}`);
});
