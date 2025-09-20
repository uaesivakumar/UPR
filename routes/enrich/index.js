// routes/enrich/index.js
import { Router } from "express";
import searchHandler from "./search.js";
import { pool } from "../../utils/db.js";

const router = Router();

/**
 * Keep a status endpoint the UI can ping for chips.
 * This route is intentionally OPEN (server.js protects only non-/status).
 */
router.get("/status", (_req, res) => {
  res.json({
    ok: true,
    data: { db_ok: true, llm_ok: true, data_source: "live" },
  });
});

/**
 * GET /api/enrich/search
 * Authentication is enforced by protectEnrich in server.js.
 * We wrap the actual handler to add logs for debugging 404/flow.
 */
router.get("/search", async (req, res, next) => {
  try {
    console.log(`[${req._reqid}] enrich/search hit (GET) q="${req.query?.q ?? ""}"`);
    return await searchHandler(req, res, next);
  } catch (e) {
    console.error(`[${req._reqid}] enrich/search error:`, e);
    return res.status(500).json({ ok: false, error: "search_failed" });
  }
});

/**
 * POST /api/enrich
 * Best-effort saver for contacts into hr_leads.
 */
router.post("/", async (req, res) => {
  const body = req.body || {};
  const companyId = body.company_id ?? null;
  const contacts = Array.isArray(body.contacts) ? body.contacts : [];
  const maxContacts = Number.isFinite(body.max_contacts)
    ? Math.max(0, Math.min(10, body.max_contacts))
    : 0;

  if (!companyId && contacts.length === 0 && maxContacts === 0) {
    return res.json({ ok: true, saved: 0 });
  }

  if (!pool) return res.json({ ok: true, saved: 0, warning: "db-unavailable" });

  let saved = 0;
  try {
    await pool.query("BEGIN");
    for (const c of contacts.slice(0, 20)) {
      try {
        const name = c.name ?? null;
        const designation = c.designation ?? c.title ?? null;
        const email = c.email ?? null;
        const linkedin = c.linkedin_url ?? null;
        const emirate = c.emirate ?? null;
        const source = c.source ?? "enrich";

        const sql = `
          INSERT INTO hr_leads (company_id, name, role, email, linkedin_url, emirate, status, source)
          VALUES ($1, $2, $3, $4, $5, $6, 'new', $7)
          ON CONFLICT DO NOTHING
        `;
        await pool.query(sql, [companyId, name, designation, email, linkedin, emirate, source]);
        saved++;
      } catch {
        /* ignore per-row errors so UI isn't blocked */
      }
    }
    await pool.query("COMMIT");
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    console.error(`[${req._reqid}] enrich save bulk error:`, e);
    return res.status(200).json({ ok: false, error: "bulk-insert-failed", saved });
  }

  return res.json({ ok: true, saved });
});

export default router;
