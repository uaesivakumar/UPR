// server/routes/leads.js
import express from "express";
import requireSession from "../middleware/requireSession.js";

export default function leadsRoutes(pool) {
  const router = express.Router();

  // all /api/leads/* require session
  router.use(requireSession);

  // list
  router.get("/", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT id, company, role, salary_band, status, created_at FROM leads ORDER BY created_at DESC"
      );
      res.json({ ok: true, data: rows });
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
