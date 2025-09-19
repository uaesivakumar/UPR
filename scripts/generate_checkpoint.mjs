// scripts/generate_checkpoint.mjs
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const fence = "```";
const EXCLUDES = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);
const FULL_MAX_BYTES = 80 * 1024; // 80 KB per file cap
const FULL_PATHS = [
  "server.js",
  "routes/",
  "utils/",
  "dashboard/src/pages/",
  "dashboard/src/features/"
];
const SNAPSHOT_FULL = process.env.SNAPSHOT_FULL === "1";

function sh(cmd) {
  try { return execSync(cmd, { stdio: ["ignore","pipe","ignore"] }).toString().trim(); }
  catch { return ""; }
}

function listTreePortable() {
  const p = join(ROOT, "project-structure.txt");
  if (existsSync(p)) return readFileSync(p, "utf-8");
  const isWin = process.platform === "win32";
  const cmd = isWin ? "git ls-files" :
    'find . -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" -print';
  return sh(cmd);
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (EXCLUDES.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function pickFiles() {
  const all = walk(ROOT);
  const want = [];
  for (const f of all) {
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    if (
      rel === "server.js" ||
      rel.startsWith("routes/") ||
      rel.startsWith("utils/") ||
      rel.startsWith("dashboard/src/pages/") ||
      rel.startsWith("dashboard/src/features/")
    ) {
      if (/\.(m?js|cjs|jsx|tsx|ts)$/.test(rel)) want.push(rel);
    }
  }
  return want.sort();
}

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function analyzeFile(text) {
  const imports = text.match(/^\s*(import .*?from\s+['"].+?['"];?|const .*?=\s*require\(['"].+?['"]\);)/gm) || [];
  const envs = [...new Set((text.match(/process\.env\.[A-Z0-9_]+/g) || []).map(s => s.replace("process.env.","")))].sort();
  const appUses = text.match(/app\.use\(.+?\);/gm) || [];
  const endpoints = text.match(/app\.(get|post|put|patch|delete)\(.+?\);/gm) || [];
  const lines = text.split("\n");
  const head = lines.slice(0, 40).join("\n");
  const tail = lines.slice(-25).join("\n");
  return { imports, envs, appUses, endpoints, head, tail };
}

const commit = sh("git rev-parse --short HEAD") || "uncommitted";
const branch = sh("git rev-parse --abbrev-ref HEAD") || "unknown";
const dateISO = new Date().toISOString().replace(/\.\d+Z$/, "Z");

let pkgName = ""; let pkgDeps = {}; let pkgScripts = {};
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  pkgName = pkg.name || "";
  pkgDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  pkgScripts = pkg.scripts || {};
} catch {}

const structure = listTreePortable();
const files = pickFiles();

const snapshots = [];
for (const rel of files) {
  const full = join(ROOT, rel);
  const text = readSafe(full);
  const h = sha(text || rel);
  let size = 0, mtime = null;
  try { const st = statSync(full); size = st.size; mtime = new Date(st.mtime).toISOString(); } catch {}
  const meta = analyzeFile(text);
  snapshots.push({ path: rel, size, mtime, sha256: h, ...meta });
}

const generated_human = new Date().toUTCString();

writeFileSync(
  join(ROOT, "UPR_SNAPSHOTS.json"),
  JSON.stringify({
    generated: dateISO,
    generated_human,
    branch,
    commit,
    package: pkgName || undefined,
    package_dependencies: pkgDeps,
    package_scripts: pkgScripts,
    files: snapshots
  }, null, 2),
  "utf-8"
);

const md = `# UPR — Project Checkpoint (auto)

**Generated:** ${dateISO}  
**Branch:** ${branch}  
**Commit:** ${commit}${pkgName ? `\n**Package:** ${pkgName}` : ""}

---

## How to use in new sessions
1) Upload **UPR_CHECKPOINT.md**, **project-structure.txt**, and **UPR_SNAPSHOTS.json**.
2) Say: “Load UPR_CHECKPOINT.md”.

---

## Project structure (snapshot)
<details><summary>Click to expand</summary>

\`\`\`
${structure}
\`\`\`

</details>

## Files covered by snapshot
\`\`\`
${files.join('\n') || '(none)'}
\`\`\`

*(For per-file details, see \`UPR_SNAPSHOTS.json\`.)*
`;

writeFileSync(join(ROOT, "UPR_CHECKPOINT.md"), md, "utf-8");
console.log("Wrote UPR_CHECKPOINT.md and UPR_SNAPSHOTS.json");
