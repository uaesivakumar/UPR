// scripts/bundle_snapshot.mjs
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function sh(cmd) { execSync(cmd, { stdio: "inherit" }); }

// Always refresh snapshots first
sh("node scripts/generate_checkpoint.mjs");

// Zip if available; otherwise tar.gz fallback
try {
  sh('zip -q -r snapshot_bundle.zip UPR_CHECKPOINT.md UPR_SNAPSHOTS.json project-structure.txt');
  console.log("Wrote snapshot_bundle.zip");
} catch (e) {
  sh('tar -czf snapshot_bundle.tgz UPR_CHECKPOINT.md UPR_SNAPSHOTS.json project-structure.txt');
  console.log("Wrote snapshot_bundle.tgz");
}
