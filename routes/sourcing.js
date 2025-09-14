// routes/sourcing.js
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";
import { adminOnly } from "../utils/adminOnly.js";

const router = express.Router();

/** POST /api/sourcing/run { company_id, source? } */
router.post("/run", adminOnly, async (req, res) => {
  try {
    const { company_id, source = "manual" } = req.body || {};
    if (!company_id) return bad(res, "company_id required");

    // don’t enqueue if already running/pending
    const dup = await pool.query(
      `SELECT id FROM sourcing_jobs WHERE company_id=$1 AND status IN ('pending','running') LIMIT 1`,
      [company_id]
    );
    if (dup.rowCount) return ok(res, { queued: false, job_id: dup.rows[0].id });

    const ins = await pool.query(
      `INSERT INTO sourcing_jobs (company_id, source, status)
       VALUES ($1,$2,'pending') RETURNING *`,
      [company_id, source]
    );
    return ok(res, { queued: true, job: ins.rows[0] });
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/**
 * POST /api/sourcing/cron
 * Enqueue jobs for high-priority companies if stale.
 */
router.post("/cron", adminOnly, async (_req, res) => {
  try {
    const toQueue = await pool.query(`
      WITH lead_counts AS (
        SELECT company_id, COUNT(*) AS cnt
          FROM hr_leads
         GROUP BY company_id
      )
      SELECT c.id
        FROM targeted_companies c
        LEFT JOIN lead_counts lc ON lc.company_id=c.id
       WHERE (c.qscore >= 60 OR c.status IN ('New','Contacted'))
         AND COALESCE(lc.cnt,0) < 2
         AND NOT EXISTS (
           SELECT 1 FROM sourcing_jobs sj
            WHERE sj.company_id=c.id AND sj.status IN ('pending','running')
         )
       ORDER BY c.updated_at DESC
       LIMIT 50
    `);

    const values = toQueue.rows.map(r => `('${r.id}', 'cron', 'pending')`).join(",");
    if (values) {
      await pool.query(
        `INSERT INTO sourcing_jobs (company_id, source, status) VALUES ${values}`
      );
    }
    return ok(res, { enqueued: toQueue.rowCount });
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/** GET /api/sourcing/jobs?company_id=... */
router.get("/jobs", adminOnly, async (req, res) => {
  try {
    const { company_id } = req.query;
    const params = [];
    const where = [];
    if (company_id) { params.push(company_id); where.push(`company_id=$${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const r = await pool.query(
      `SELECT * FROM sourcing_jobs ${clause}
        ORDER BY created_at DESC
        LIMIT 200`,
      params
    );
    return ok(res, r.rows);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

export default router;
