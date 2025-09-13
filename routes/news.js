// routes/news.js
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { tag, days, q } = req.query;
    const where = [], params = [];
    if (q) { params.push(`%${q}%`); where.push(`(LOWER(title) LIKE LOWER($${params.length}) OR LOWER(summary) LIKE LOWER($${params.length}))`); }
    if (tag) { params.push(tag); where.push(`$${params.length} = ANY(tags)`); }
    if (days) { params.push(days); where.push(`published_at >= now() - ($${params.length}::text || ' days')::interval`); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const r = await pool.query(`SELECT * FROM news_items ${clause} ORDER BY published_at DESC LIMIT 200`, params);
    return ok(res, r.rows);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

router.post("/ingest", async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return bad(res, "items[] required");
    const vals = [];
    for (const it of items) {
      vals.push([
        it.company_name || null,
        it.company_id || null,
        it.title || null,
        it.summary || null,
        it.url || null,
        it.source || null,
        it.published_at || null,
        Array.isArray(it.tags) ? it.tags : [],
        it.score ?? 0,
      ]);
    }
    const placeholders = vals
      .map((_, i) => `($${i * 9 + 1},$${i * 9 + 2},$${i * 9 + 3},$${i * 9 + 4},$${i * 9 + 5},$${i * 9 + 6},$${i * 9 + 7},$${i * 9 + 8},$${i * 9 + 9})`)
      .join(",");
    const flat = vals.flat();
    const q = `
      INSERT INTO news_items (company_name, company_id, title, summary, url, source, published_at, tags, score)
      VALUES ${placeholders} RETURNING id
    `;
    const r = await pool.query(q, flat);
    return ok(res, { inserted: r.rowCount });
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

export default router;
