// server/routes/meta.js
import express from "express";
import fs from "fs";

export default function metaRoutes({ pool, clientDir, indexHtml }) {
  const router = express.Router();

  router.get("/health", (_req, res) => res.json({ ok: true }));

  router.get("/__diag", async (_req, res) => {
    let db_ok = false;
    try {
      const r = await pool.query("select 1 as ok");
      db_ok = r.rows?.[0]?.ok === 1;
    } catch {}
    res.json({
      ok: true,
      clientDir,
      index_exists: fs.existsSync(indexHtml),
      db_ok,
    });
  });

  return router;
}
