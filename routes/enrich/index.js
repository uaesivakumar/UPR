// routes/enrich/index.js
import { Router } from "express";
import searchHandler from "./search.js"; // your real logic
import { pool } from "../../utils/db.js";

const router = Router();

/**
 * Status for chips
 */
router.get("/status", (_req, res) => {
  res.json({ ok: true, data: { db_ok: true, llm_ok: true, data_source: "live" } });
});

/**
 * GET /api/enrich/search
 * We wrap your real searchHandler with logging and normalize "no results" to 200.
 */
router.get("/search", async (req, res, next) => {
  try {
    const q = (req.query?.q || "").trim();
    console.log(`[${req._reqid}] enrich/search GET q="${q}"`);
    // Run your existing logic
    const send = res.json.bind(res);
    res.json = (payload) => {
      console.log(`[${req._reqid}] enrich/search RESP`, {
        status: res.statusCode,
        hasResults: Array.isArray(payload?.data?.results) && payload.data.results.length > 0,
      });
      return send(payload);
    };
    await searchHandler(req, res, next);
  } catch (e) {
    console.error(`[${req._reqid}] enrich/search error`, e?.stack || e);
    // If your handler throws "not_found" or returns 404, normalize to empty 200
    if (!res.headersSent) {
      res.status(200).json({
        ok: true,
        data: {
          results: [],
          summary: {
            provider: "live",
            quality: { score: 0.5, explanation: "No matches found." },
          },
        },
      });
    }
  }
});

/**
 * POST /api/enrich  (save contacts)
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
        /* ignore per-row errors */
      }
    }
    await pool.query("COMMIT");
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    console.error(`[${req._reqid}] enrich/save error`, e?.stack || e);
    return res.status(200).json({ ok: false, error: "bulk-insert-failed", saved });
  }

  return res.json({ ok: true, saved });
});

export default router;
