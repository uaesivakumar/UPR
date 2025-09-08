// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-admin-token";

app.use(express.json());

// --- paths ---
const clientDir = path.join(__dirname, "dashboard", "dist");
const indexHtml = path.join(clientDir, "index.html");

// --- startup logs ---
console.log("[UPR] __dirname:", __dirname);
console.log("[UPR] clientDir:", clientDir);
console.log("[UPR] indexHtml exists:", fs.existsSync(indexHtml));

// --- health/diag ---
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/__diag", (_req, res) =>
  res.json({
    ok: true,
    admin_token_set: Boolean(process.env.ADMIN_TOKEN),
    clientDir,
    index_exists: fs.existsSync(indexHtml),
    cwd: process.cwd(),
    env_port: process.env.PORT || null,
  })
);
// list files to verify image contents
app.get("/__ls", (_req, res) => {
  try {
    const root = fs.readdirSync(__dirname);
    const dash = fs.existsSync(path.join(__dirname, "dashboard"))
      ? fs.readdirSync(path.join(__dirname, "dashboard"))
      : null;
    const dist = fs.existsSync(clientDir) ? fs.readdirSync(clientDir) : null;
    res.json({ ok: true, root, dash, dist });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- auth validate ---
app.post("/api/auth/validate", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: "Invalid token" });
  return res.json({ ok: true });
});

// --- sample leads (protected) ---
const SAMPLE_LEADS = [
  { id: "ld_001", company: "Al Noor Holdings", role: "HR Director", salary_band: "AED 55K+", status: "New" },
  { id: "ld_002", company: "Falak Tech", role: "Finance Manager", salary_band: "AED 60K+", status: "Qualified" },
  { id: "ld_003", company: "Desert Labs", role: "Admin Lead", salary_band: "AED 50K+", status: "Contacted" },
];
app.get("/api/leads", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: "Unauthorized" });
  res.json({ ok: true, data: SAMPLE_LEADS });
});

// --- static + SPA fallback ---
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
}
app.get("*", (_req, res) => {
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  res.status(500).send("UI not built: missing dashboard/dist/index.html");
});

app.listen(PORT, () => {
  console.log(`[UPR] Server listening on :${PORT}`);
});
