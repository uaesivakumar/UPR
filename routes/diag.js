import express from "express";
import os from "os";
import { pool } from "../utils/db.js";

const router = express.Router();

function listRoutes(app) {
  try {
    const out = [];
    for (const layer of (app?._router?.stack || [])) {
      if (layer?.route) {
        const methods = Object.keys(layer.route.methods || {})
          .filter(Boolean).map(m => m.toUpperCase()).join(",");
        out.push(`${methods} ${layer.route.path}`);
      } else if (layer?.name === "router" && layer?.handle?.stack) {
        for (const r of layer.handle.stack) {
          if (r?.route) {
            const methods = Object.keys(r.route.methods || {})
              .filter(Boolean).map(m => m.toUpperCase()).join(",");
            out.push(`${methods} ${r.route.path}`);
          }
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

router.get("/", async (req, res) => {
  // DB health
  let db_ok = false;
  let db_error = null;
  try {
    await pool.query("SELECT 1");
    db_ok = true;
  } catch (e) {
    db_error = String(e?.message || e);
  }

  // expose only booleans for sensitive envs
  const envKeys = [
    "DATABASE_URL",
    "UPR_ADMIN_USER",
    "UPR_ADMIN_PASS",
    "JWT_SECRET",
    "APOLLO_API_KEY",
    "OPENAI_API_KEY",
    "NEVERBOUNCE_API_KEY",
    "ZEROBOUNCE_API_KEY",
  ];
  const env = {};
  for (const k of envKeys) env[k] = !!process.env[k];

  res.json({
    ok: true,
    db_ok,
    db_error,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    routesMounted: listRoutes(req.app),
    env,
  });
});

export default router;
