// routes/hrLeads.js
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";
import { isValidLeadStatus, isValidEmailStatus } from "../utils/validators.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { company_id, name, designation, linkedin_url, location, email, email_status } = req.body || {};
    if (!company_id) return bad(res, "company_id required");
    if (email_status && !isValidEmailStatus(email_status)) return bad(res, "invalid email_status");

    const r = await pool.query(
      `INSERT INTO hr_leads (company_id, name, designation, linkedin_url, location, email, email_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [company_id, name || null, designation || null, linkedin_url || null, location || null, email || null, email_status || "unknown"]
    );
    return ok(res, r.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

router.get("/", async (req, res) => {
  try {
    const { company_id, status, search, email_status } = req.query;
    const where = [], params = [];
    if (company_id) { params.push(company_id); where.push(`company_id=$${params.length}`); }
    if (status) { 
      if (!isValidLeadStatus(status)) return bad(res, "invalid status");
      params.push(status); where.push(`lead_status=$${params.length}`);
    }
    if (email_status) {
      if (!isValidEmailStatus(email_status)) return bad(res, "invalid email_status");
      params.push(email_status); where.push(`email_status=$${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(LOWER(name) LIKE LOWER($${params.length}) OR LOWER(designation) LIKE LOWER($${params.length}))`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const r = await pool.query(`SELECT * FROM hr_leads ${clause} ORDER BY created_at DESC LIMIT 200`, params);
    return ok(res, r.rows);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ["lead_status", "email_status", "status_remarks", "mobile", "email", "designation", "linkedin_url", "location"];
    const sets = [], params = [];
    for (const k of fields) {
      if (k in req.body) {
        if (k === "lead_status" && !isValidLeadStatus(req.body[k])) return bad(res, "invalid lead_status");
        if (k === "email_status" && !isValidEmailStatus(req.body[k])) return bad(res, "invalid email_status");
        params.push(req.body[k]);
        sets.push(`${k}=$${params.length}`);
      }
    }
    if (!sets.length) return bad(res, "no changes");
    params.push(id);
    const r = await pool.query(
      `UPDATE hr_leads SET ${sets.join(",")}, updated_at=now() WHERE id=$${params.length} RETURNING *`,
      params
    );
    return ok(res, r.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

export default router;
