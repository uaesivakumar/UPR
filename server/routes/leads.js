// server/routes/leads.js
import express from "express";
import requireSession from "../middleware/requireSession.js";
import multer from "multer";
import { parse } from "csv-parse/sync";

const SORT_WHITELIST = new Set(["id", "company", "role", "salary_band", "status", "created_at"]);
const DIR_WHITELIST = new Set(["asc", "desc"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

export default function leadsRoutes(pool) {
  const router = express.Router();

  // all /api/leads/* require session
  router.use(requireSession);

  // list (server-side search + pagination)
  router.get("/", async (req, res) => {
    try {
      const q = (req.query.q ?? "").toString().trim();
      const page = Math.max(1, parseInt(req.query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size ?? "10", 10) || 10));

      // sort format: "created_at:desc" or "company:asc"
      const [sortColRaw, sortDirRaw] = (req.query.sort ?? "created_at:desc").toString().split(":");
      const sortCol = SORT_WHITELIST.has(sortColRaw) ? sortColRaw : "created_at";
      const sortDir = DIR_WHITELIST.has((sortDirRaw || "desc").toLowerCase()) ? sortDirRaw.toLowerCase() : "desc";

      const where = q
        ? `WHERE company ILIKE '%'||$1||'%' OR role ILIKE '%'||$1||'%' OR status ILIKE '%'||$1||'%' OR CAST(id AS TEXT) ILIKE '%'||$1||'%'`
        : "";
      const params = [];
      if (q) params.push(q);

      const totalSql = `SELECT COUNT(*)::int AS count FROM leads ${where}`;
      const totalRes = await pool.query(totalSql, params);
      const total = totalRes.rows[0]?.count ?? 0;

      const offset = (page - 1) * pageSize;
      const dataSql = `
        SELECT id, company, role, salary_band, status, created_at
        FROM leads
        ${where}
        ORDER BY ${sortCol} ${sortDir}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      const dataRes = await pool.query(dataSql, [...params, pageSize, offset]);
      res.json({ ok: true, data: dataRes.rows, total, page, page_size: pageSize, sort: `${sortCol}:${sortDir}` });
    } catch (e) {
      console.error("leads:list", e);
      res.status(500).json({ ok: false, error: "DB error" });
    }
  });

  // create
  router.post("/", async (req, res) => {
    const { company, role, salary_band = "AED 50K+", status = "New" } = req.body || {};
    if (!company || !role) return res.status(400).json({ ok: false, error: "company and role required" });
    try {
      const { rows } = await pool.query(
        `INSERT INTO leads (company, role, salary_band, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, company, role, salary_band, status, created_at`,
        [company, role, salary_band, status]
      );
      res.json({ ok: true, data: rows[0] });
    } catch (e) {
      console.error("leads:create", e);
      res.status(500).json({ ok: false, error: "DB error" });
    }
  });

  // bulk import (CSV)
  router.post("/bulk", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: "file is required (field name: file)" });
    try {
      const text = req.file.buffer.toString("utf8");
      const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });

      // Allowed headers: company, role, salary_band, status
      const normalized = rows
        .map((r) => ({
          company: r.company || r.Company || r.company_name || "",
          role: r.role || r.Role || "",
          salary_band: r.salary_band || r.Salary || r["salary band"] || "AED 50K+",
          status: r.status || r.Status || "New",
        }))
        .filter((r) => r.company && r.role);

      if (normalized.length === 0) return res.json({ ok: true, imported: 0 });

      // Transactional insert
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const r of normalized) {
          await client.query(
            `INSERT INTO leads (company, role, salary_band, status)
             VALUES ($1, $2, $3, $4)`,
            [r.company, r.role, r.salary_band, r.status]
          );
        }
        await client.query("COMMIT");
        res.json({ ok: true, imported: normalized.length });
      } catch (e) {
        await client.query("ROLLBACK");
        console.error("leads:bulk", e);
        res.status(500).json({ ok: false, error: "bulk insert error" });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("leads:bulk-parse", e);
      res.status(400).json({ ok: false, error: "invalid CSV" });
    }
  });

  // update
  router.put("/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { company, role, salary_band, status } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "invalid id" });
    if (!company || !role) return res.status(400).json({ ok: false, error: "company and role required" });

    try {
      const { rows } = await pool.query(
        `UPDATE leads
           SET company=$1, role=$2, salary_band=$3, status=$4
         WHERE id=$5
         RETURNING id, company, role, salary_band, status, created_at`,
        [company, role, salary_band || "AED 50K+", status || "New", id]
      );
      if (rows.length === 0) return res.status(404).json({ ok: false, error: "not found" });
      res.json({ ok: true, data: rows[0] });
    } catch (e) {
      console.error("leads:update", e);
      res.status(500).json({ ok: false, error: "DB error" });
    }
  });

  // delete
  router.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "invalid id" });
    try {
      const { rowCount } = await pool.query("DELETE FROM leads WHERE id=$1", [id]);
      if (rowCount === 0) return res.status(404).json({ ok: false, error: "not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error("leads:delete", e);
      res.status(500).json({ ok: false, error: "DB error" });
    }
  });

  return router;
}
