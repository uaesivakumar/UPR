// routes/companies.js
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";
import { computeQScore } from "../utils/qscore.js";
import { isValidCompanyType, isValidCompanyStatus } from "../utils/validators.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { name, type, locations = [], website_url = null, linkedin_url = null } = req.body || {};
    if (!name) return bad(res, "name required");
    if (type && !isValidCompanyType(type)) return bad(res, "invalid type");

    const norm = name.trim();
    const exists = await pool.query("SELECT id FROM targeted_companies WHERE LOWER(name)=LOWER($1)", [norm]);
    if (exists.rowCount) return ok(res, { id: exists.rows[0].id, existed: true });

    const ins = await pool.query(
      `INSERT INTO targeted_companies (name,type,locations,website_url,linkedin_url)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [norm, type || null, locations, website_url, linkedin_url]
    );
    return ok(res, ins.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

router.get("/", async (req, res) => {
  try {
    const { search = "", type, status, location, sort = "created_at.desc" } = req.query;
    const params = [];
    const where = [];
    if (search) { params.push(`%${search}%`); where.push(`LOWER(name) LIKE LOWER($${params.length})`); }
    if (type) { params.push(type); where.push(`type=$${params.length}`); }
    if (status) { params.push(status); where.push(`status=$${params.length}`); }
    if (location) { params.push(location); where.push(`$${params.length} = ANY(locations)`); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [col, dir] = String(sort).split(".");
    const orderCol = ["name", "qscore", "created_at"].includes(col) ? col : "created_at";
    const orderDir = dir === "asc" ? "asc" : "desc";
    const q = `SELECT * FROM targeted_companies ${clause} ORDER BY ${orderCol} ${orderDir} LIMIT 200`;
    const rows = await pool.query(q, params);
    return ok(res, rows.rows);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM targeted_companies WHERE id=$1", [req.params.id]);
    if (!r.rowCount) return bad(res, "not found", 404);
    return ok(res, r.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ["type", "locations", "website_url", "linkedin_url", "status", "status_remarks", "about_blurb"];
    const sets = [], params = [];
    for (const k of fields) {
      if (k in req.body) {
        if (k === "type" && !isValidCompanyType(req.body[k])) return bad(res, "invalid type");
        if (k === "status" && !isValidCompanyStatus(req.body[k])) return bad(res, "invalid status");
        params.push(req.body[k]);
        sets.push(`${k}=$${params.length}`);
      }
    }
    if (!sets.length) return bad(res, "no changes");
    params.push(id);
    const r = await pool.query(
      `UPDATE targeted_companies SET ${sets.join(",")}, updated_at=now() WHERE id=$${params.length} RETURNING *`,
      params
    );
    return ok(res, r.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

router.get("/:id/news", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM news_items WHERE company_id=$1 ORDER BY published_at DESC LIMIT 50`,
      [req.params.id]
    );
    return ok(res, r.rows);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

router.post("/:id/recompute-qscore", async (req, res) => {
  try {
    const { id } = req.params;
    const c = await pool.query("SELECT * FROM targeted_companies WHERE id=$1", [id]);
    if (!c.rowCount) return bad(res, "not found", 404);
    const n = await pool.query("SELECT tags FROM news_items WHERE company_id=$1", [id]);
    const qscore = computeQScore(c.rows[0], n.rows);
    const u = await pool.query(
      "UPDATE targeted_companies SET qscore=$1, updated_at=now() WHERE id=$2 RETURNING *",
      [qscore, id]
    );
    return ok(res, u.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

export default router;
