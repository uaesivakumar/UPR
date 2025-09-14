// routes/stats.js
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";

const router = express.Router();

/**
 * GET /api/stats
 * Returns summary counts + recent activity for the dashboard.
 */
router.get("/", async (_req, res) => {
  try {
    const [[companies], [leads], [msgs]] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM companies`),
      pool.query(`SELECT COUNT(*)::int AS n FROM hr_leads`),
      // If you don't have a messages table yet, this will return 0 via COALESCE:
      pool.query(`SELECT COALESCE(SUM(1),0)::int AS n FROM messages`)
        .catch(() => [{ n: 0 }]),
    ]);

    // Recent activity: last 3 leads with company + status
    const { rows: recent } = await pool.query(
      `SELECT id, company, designation AS role, status,
              to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
         FROM hr_leads
     ORDER BY created_at DESC NULLS LAST
        LIMIT 3`
    );

    return ok(res, {
      companiesTracked: companies?.rows?.[0]?.n ?? 0,
      leadsIdentified:  leads?.rows?.[0]?.n ?? 0,
      outreachSent:     msgs?.rows?.[0]?.n ?? 0,
      recentActivity:   recent,
    });
  } catch (e) {
    console.error("stats error:", e);
    return bad(res, "failed to load stats", 500);
  }
});

export default router;
