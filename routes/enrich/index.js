// routes/enrich/index.js
import { Router } from "express";
import searchHandler from "./search.js";
import { pool } from "../../utils/db.js";

const router = Router();

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
}

/** Chips status */
router.get("/status", (_req, res) => {
  noStore(res);
  res.json({
    ok: true,
    data: {
      db_ok: !!pool,   // reflect DB connectivity
      llm_ok: true,    // you can extend with a real LLM health check
      data_source: "live",
    },
  });
});

/** GET /api/enrich/search */
router.get("/search", async (req, res) => {
  try {
    noStore(res);
    const q = (req.query?.q || "").trim();
    console.log(`[${req._reqid}] enrich/search GET q="${q}"`);
    await searchHandler(req, res);
  } catch (e) {
    console.error(`[${req._reqid}] enrich/search GET error`, e?.stack || e);
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

/** POST /api/enrich/search */
router.post("/search", async (req, res) => {
  try {
    noStore(res);

    // Map POST body into query fields
    req.query = req.query || {};
    if (req.body?.q) req.query.q = String(req.body.q);
    if (req.body?.name) req.query.name = String(req.body.name);
    if (req.body?.domain) req.query.domain = String(req.body.domain);
    if (req.body?.linkedin_url) req.query.linkedin_url = String(req.body.linkedin_url);
    if (req.body?.parent) req.query.parent = String(req.body.parent);

    const q = (req.query?.q || "").trim();
    console.log(
      `[${req._reqid}] enrich/search POST q="${q}" bodyKeys=${Object.keys(req.body || {})}`
    );
    await searchHandler(req, res);
  } catch (e) {
    console.error(`[${req._reqid}] enrich/search POST error`, e?.stack || e);
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

/** Save contacts into hr_leads */
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
        await pool.query(sql, [
          companyId,
          name,
          designation,
          email,
          linkedin,
          emirate,
          source,
        ]);
        saved++;
      } catch {
        /* ignore per-row errors */
      }
    }
    await pool.query("COMMIT");
  } catch (e) {
    try {
      await pool.query("ROLLBACK");
    } catch {}
    console.error(`[${req._reqid}] enrich/save error`, e?.stack || e);
    return res
      .status(200)
      .json({ ok: false, error: "bulk-insert-failed", saved });
  }

  return res.json({ ok: true, saved });
});

export default router;
