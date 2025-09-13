// routes/hrLeads.js
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";
import { adminOnly } from "../utils/adminOnly.js";
import { isValidLeadStatus, isValidEmailStatus } from "../utils/validators.js";

const router = express.Router();

const ALLOWED_LOCATIONS = new Set(["Abu Dhabi", "Dubai", "Sharjah"]);

function normalizeLocations(value) {
  if (!value) return null;
  const arr = Array.isArray(value) ? value : String(value).split(",");
  const uniq = Array.from(
    new Set(
      arr
        .map((s) => String(s).trim())
        .filter(Boolean)
        .filter((s) => ALLOWED_LOCATIONS.has(s))
    )
  );
  return uniq.length ? uniq : null;
}

function aliasBody(body = {}) {
  // aliases from UI/forms
  const companyName =
    body.company_name ??
    body.company ??
    null;

  return {
    company_id: body.company_id ?? null,
    company_name: companyName,
    name: body.name ?? null,
    designation: body.designation ?? body.title ?? null,
    linkedin_url: body.linkedin_url ?? body.linkedin ?? null,
    location: body.location ?? null,
    mobile: body.mobile ?? body.mobile_number ?? null,
    email: body.email ?? body.emailAddress ?? null,
    email_status: body.email_status ?? "unknown",
    lead_status: body.lead_status ?? "New",
    status_remarks: body.status_remarks ?? body.remarks ?? null,
  };
}

async function getOrCreateCompanyId({ company_id, company_name }) {
  if (company_id) return company_id;
  if (!company_name) return null;

  const norm = company_name.trim();
  // try existing
  const found = await pool.query(
    "SELECT id FROM targeted_companies WHERE LOWER(name)=LOWER($1)",
    [norm]
  );
  if (found.rowCount) return found.rows[0].id;

  // minimal upsert: create a targeted company with only a name
  const ins = await pool.query(
    `INSERT INTO targeted_companies (name)
     VALUES ($1)
     RETURNING id`,
    [norm]
  );
  return ins.rows[0].id;
}

/**
 * POST /api/hr-leads
 * Body can include either company_id or company/company_name
 * Stores a lead; defaults lead_status to "New".
 */
router.post("/", async (req, res) => {
  try {
    const b = aliasBody(req.body);
    // normalize & validate
    const locationsArr = normalizeLocations(b.location);
    if (b.email_status && !isValidEmailStatus(b.email_status)) {
      return bad(res, "invalid email_status");
    }
    if (b.lead_status && !isValidLeadStatus(b.lead_status)) {
      return bad(res, "invalid lead_status");
    }

    const cid = await getOrCreateCompanyId({
      company_id: b.company_id,
      company_name: b.company_name,
    });
    if (!cid) return bad(res, "company_id or company/company_name required");

    // Optional de-dup: if same linkedin_url for same company, return existing
    if (b.linkedin_url) {
      const dup = await pool.query(
        `SELECT hl.id
           FROM hr_leads hl
          WHERE hl.company_id=$1 AND LOWER(COALESCE(hl.linkedin_url,'')) = LOWER($2)
          LIMIT 1`,
        [cid, b.linkedin_url]
      );
      if (dup.rowCount) {
        const existing = await pool.query(
          `SELECT hl.*,
                  c.name AS company_name,
                  hl.created_at AS created
             FROM hr_leads hl
             JOIN targeted_companies c ON c.id=hl.company_id
            WHERE hl.id=$1`,
          [dup.rows[0].id]
        );
        return ok(res, { existed: true, ...existing.rows[0] });
      }
    }

    const ins = await pool.query(
      `INSERT INTO hr_leads
        (company_id, name, designation, linkedin_url, location, mobile, email,
         email_status, lead_status, status_remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        cid,
        b.name,
        b.designation,
        b.linkedin_url,
        locationsArr, // store array of allowed emirates or null
        b.mobile,
        b.email,
        b.email_status || "unknown",
        b.lead_status || "New",
        b.status_remarks,
      ]
    );

    const created = await pool.query(
      `SELECT hl.*,
              c.name AS company_name,
              hl.created_at AS created
         FROM hr_leads hl
         JOIN targeted_companies c ON c.id=hl.company_id
        WHERE hl.id=$1`,
      [ins.rows[0].id]
    );

    return ok(res, created.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/**
 * GET /api/hr-leads
 * Query:
 *   - q|search
 *   - company_id
 *   - company (by name)
 *   - status (lead_status)
 *   - email_status
 *   - location
 *   - sort=created_at.desc | name.asc | company_name.asc | ...
 */
router.get("/", async (req, res) => {
  try {
    const search = req.query.q ?? req.query.search ?? "";
    const {
      company_id,
      company,
      status,
      email_status,
      location,
      sort = "created_at.desc",
    } = req.query;

    const where = [];
    const params = [];

    if (company_id) {
      params.push(company_id);
      where.push(`hl.company_id = $${params.length}`);
    }
    if (company) {
      params.push(`%${String(company).toLowerCase()}%`);
      where.push(`LOWER(c.name) LIKE $${params.length}`);
    }
    if (status) {
      if (!isValidLeadStatus(status)) return bad(res, "invalid status");
      params.push(status);
      where.push(`hl.lead_status = $${params.length}`);
    }
    if (email_status) {
      if (!isValidEmailStatus(email_status)) return bad(res, "invalid email_status");
      params.push(email_status);
      where.push(`hl.email_status = $${params.length}`);
    }
    if (location) {
      params.push(location);
      where.push(`$${params.length} = ANY(hl.location)`);
    }
    if (search) {
      const s = `%${String(search).toLowerCase()}%`;
      params.push(s);
      where.push(`(
        LOWER(COALESCE(hl.name,'')) LIKE $${params.length} OR
        LOWER(COALESCE(hl.designation,'')) LIKE $${params.length} OR
        LOWER(COALESCE(hl.email,'')) LIKE $${params.length} OR
        LOWER(COALESCE(hl.linkedin_url,'')) LIKE $${params.length}
      )`);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [col, dir] = String(sort).split(".");
    const ORDERABLE = new Set([
      "created_at",
      "name",
      "designation",
      "email_status",
      "lead_status",
      "company_name",
    ]);
    const orderCol = ORDERABLE.has(col) ? col : "created_at";
    const orderDir = dir === "asc" ? "asc" : "desc";

    const q = `
      SELECT
        hl.*,
        c.name AS company_name,
        hl.created_at AS created
      FROM hr_leads hl
      JOIN targeted_companies c ON c.id = hl.company_id
      ${clause}
      ORDER BY ${orderCol === "company_name" ? "c.name" : `hl.${orderCol}`} ${orderDir}
      LIMIT 200
    `;

    const rows = await pool.query(q, params);
    return ok(res, rows.rows);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/** GET /api/hr-leads/:id */
router.get("/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT hl.*,
              c.name AS company_name,
              hl.created_at AS created
         FROM hr_leads hl
         JOIN targeted_companies c ON c.id=hl.company_id
        WHERE hl.id=$1`,
      [req.params.id]
    );
    if (!r.rowCount) return bad(res, "not found", 404);
    return ok(res, r.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/**
 * PATCH /api/hr-leads/:id
 * Body fields allowed (aliases supported):
 *   lead_status, email_status, status_remarks, mobile|mobile_number,
 *   email|emailAddress, designation|title, linkedin_url|linkedin, location
 */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const b = aliasBody(req.body);

    const sets = [];
    const params = [];

    const assign = (col, val) => {
      params.push(val);
      sets.push(`${col}=$${params.length}`);
    };

    const locArr = normalizeLocations(b.location);

    if (b.lead_status !== undefined) {
      if (!isValidLeadStatus(b.lead_status)) return bad(res, "invalid lead_status");
      assign("lead_status", b.lead_status);
    }
    if (b.email_status !== undefined) {
      if (!isValidEmailStatus(b.email_status)) return bad(res, "invalid email_status");
      assign("email_status", b.email_status);
    }
    if (b.status_remarks !== undefined) assign("status_remarks", b.status_remarks || null);
    if (b.mobile !== undefined) assign("mobile", b.mobile || null);
    if (b.email !== undefined) assign("email", b.email || null);
    if (b.designation !== undefined) assign("designation", b.designation || null);
    if (b.linkedin_url !== undefined) assign("linkedin_url", b.linkedin_url || null);
    if (locArr !== null) assign("location", locArr);

    if (!sets.length) return bad(res, "no changes");

    params.push(id);
    const upd = await pool.query(
      `UPDATE hr_leads
          SET ${sets.join(", ")}, updated_at=now()
        WHERE id=$${params.length}
        RETURNING id`,
      params
    );

    const r = await pool.query(
      `SELECT hl.*,
              c.name AS company_name,
              hl.created_at AS created
         FROM hr_leads hl
         JOIN targeted_companies c ON c.id=hl.company_id
        WHERE hl.id=$1`,
      [upd.rows[0].id]
    );

    return ok(res, r.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

export default router;
