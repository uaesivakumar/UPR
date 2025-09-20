// routes/enrich/index.js
import { Router } from "express";
import searchHandler from "./search.js";
import { pool } from "../../utils/db.js";

const router = Router();

/**
 * GET /api/enrich/search
 * Delegates to the search handler.
 * Authentication is already enforced by protectEnrich in server.js.
 */
router.get("/search", searchHandler);

/**
 * POST /api/enrich
 * Best-effort saver for contacts into hr_leads. We keep this permissive so the UI
 * never blocks; if the DB call fails we still return a JSON response.
 *
 * Body (either):
 *   { company_id, contacts: [{ name, designation|title, email, linkedin_url, emirate, source }] }
 * or
 *   { company_id, max_contacts: number }   // server chooses up to N from last search (noop here)
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

  // If a DB issue happens, don’t hard-fail the UI.
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
        /* ignore per-row errors */
      }
    }
    await pool.query("COMMIT");
  } catch {
    try { await pool.query("ROLLBACK"); } catch {}
    return res.status(200).json({ ok: false, error: "bulk-insert-failed", saved });
  }

  return res.json({ ok: true, saved });
});

export default router;
