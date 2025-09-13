// routes/hrLeads.js
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";
import { adminOnly } from "../utils/adminOnly.js";
import {
  UAE_LOCATIONS,
  isValidLeadStatus,
  isValidEmailStatus,
  isValidLocation,
} from "../utils/validators.js";

const router = express.Router();

/* ------------------------------ helpers ------------------------------ */

function normalizeLocations(value) {
  if (!value) return null;
  const arr = Array.isArray(value) ? value : String(value).split(",");
  const cleaned = Array.from(
    new Set(
      arr
        .map((s) => String(s).trim())
        .filter(Boolean)
        .filter((s) => isValidLocation(s))
    )
  );
  return cleaned.length ? cleaned : null;
}

/** Accepts various form/UI aliases and returns a normalized object */
function aliasBody(body = {}) {
  const companyName = body.company_name ?? body.company ?? null;
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

/** Minimal get-or-create by company name (name required) */
async function getOrCreateCompanyId({ company_id, company_name }) {
  if (company_id) return company_id;
  if (!company_name) return null;

  const norm = company_name.trim();
  const found = await pool.query(
    "SELECT id FROM targeted_companies WHERE LOWER(name)=LOWER($1)",
    [norm]
  );
  if (found.rowCount) return found.rows[0].id;

  const ins = await pool.query(
    `INSERT INTO targeted_companies (name, status)
     VALUES ($1, 'New')
     RETURNING id`,
    [norm]
  );
  return ins.rows[0].id;
}

/** Get-or-create with optional field updates from an enrichment object */
async function getOrCreateCompanyDetailed(c = {}) {
  if (!c || !c.name) return null;
  const norm = c.name.trim();

  const found = await pool.query(
    "SELECT id FROM targeted_companies WHERE LOWER(name)=LOWER($1)",
    [norm]
  );
  if (found.rowCount) {
    // best-effort light update if enrichment provides fields
    const sets = [];
    const params = [];
    if (c.type) {
      sets.push(`type=$${sets.length + 1}`);
      params.push(c.type);
    }
    if (c.locations) {
      sets.push(`locations=$${sets.length + 1}`);
      params.push(normalizeLocations(c.locations) || null);
    }
    if (c.website_url) {
      sets.push(`website_url=$${sets.length + 1}`);
      params.push(c.website_url);
    }
    if (c.linkedin_url) {
      sets.push(`linkedin_url=$${sets.length + 1}`);
      params.push(c.linkedin_url);
    }
    if (sets.length) {
      params.push(found.rows[0].id);
      await pool.query(
        `UPDATE targeted_companies
            SET ${sets.join(",")}, updated_at=now()
          WHERE id=$${params.length}`,
        params
      );
    }
    return found.rows[0].id;
  }

  const ins = await pool.query(
    `INSERT INTO targeted_companies
        (name, type, locations, website_url, linkedin_url, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      norm,
      c.type || null,
      normalizeLocations(c.locations) || null,
      c.website_url || null,
      c.linkedin_url || null,
      "New",
    ]
  );
  return ins.rows[0].id;
}

/* --------------------------------- POST -------------------------------- */

/**
 * POST /api/hr-leads
 * Body: either company_id OR company/company_name (aliases accepted)
 * Stores a single lead. Defaults: lead_status="New", email_status="unknown".
 */
router.post("/", async (req, res) => {
  try {
    const b = aliasBody(req.body);

    // validations
    if (b.email_status && !isValidEmailStatus(b.email_status)) {
      return bad(res, "invalid email_status");
    }
    if (b.lead_status && !isValidLeadStatus(b.lead_status)) {
      return bad(res, "invalid lead_status");
    }
    const locArr = normalizeLocations(b.location);

    const cid = await getOrCreateCompanyId({
      company_id: b.company_id,
      company_name: b.company_name,
    });
    if (!cid) return bad(res, "company_id or company/company_name required");

    // de-dup on linkedin url (within company)
    if (b.linkedin_url) {
      const dup = await pool.query(
        `SELECT id FROM hr_leads
          WHERE company_id=$1
            AND LOWER(COALESCE(linkedin_url,'')) = LOWER($2)
          LIMIT 1`,
        [cid, b.linkedin_url]
      );
      if (dup.rowCount) {
        const existing = await pool.query(
          `SELECT hl.*, c.name AS company_name, hl.created_at AS created
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
        locArr,
        b.mobile,
        b.email,
        b.email_status || "unknown",
        b.lead_status || "New",
        b.status_remarks || null,
      ]
    );

    const created = await pool.query(
      `SELECT hl.*, c.name AS company_name, hl.created_at AS created
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

/* ---------------------------------- GET --------------------------------- */

/**
 * GET /api/hr-leads
 * Query:
 *   - q|search  (name, designation, email, linkedin_url)
 *   - company_id
 *   - company   (name contains)
 *   - status    (lead_status)
 *   - email_status
 *   - location  (exact match in location array)
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
      // one exact location; if you want multiple, accept CSV and use ANY with array
      params.push(location);
      where.push(`$${params.length} = ANY(hl.location)`);
    }
    if (search) {
      const s = `%${String(search).toLowerCase()}%`;
      const idx = params.push(s); // reuse the same param index
      where.push(`(
        LOWER(COALESCE(hl.name,'')) LIKE $${idx} OR
        LOWER(COALESCE(hl.designation,'')) LIKE $${idx} OR
        LOWER(COALESCE(hl.email,'')) LIKE $${idx} OR
        LOWER(COALESCE(hl.linkedin_url,'')) LIKE $${idx}
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
      `SELECT hl.*, c.name AS company_name, hl.created_at AS created
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

/* -------------------------------- PATCH --------------------------------- */

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
      `SELECT hl.*, c.name AS company_name, hl.created_at AS created
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

/* -------------------------- admin-only endpoints ------------------------- */

/**
 * POST /api/hr-leads/from-enrichment  (admin only)
 * Body:
 *  {
 *    company: { name, type?, locations?, website_url?, linkedin_url? },
 *    contact: { name?, designation?, linkedin_url?, location?, mobile?, email?, email_status? },
 *    status?: "New" | "Contacted" | ...,
 *    notes?: string
 *  }
 */
router.post("/from-enrichment", adminOnly, async (req, res) => {
  try {
    const { company, contact = {}, status, notes } = req.body || {};
    const companyId = await getOrCreateCompanyDetailed(company || {});
    if (!companyId) return bad(res, "company.name required");

    const b = aliasBody({
      ...contact,
      company_id: companyId,
      lead_status: status || contact.lead_status || "New",
      status_remarks: notes ?? contact.status_remarks ?? null,
    });

    // de-dup by linkedin/email within company
    if (b.linkedin_url || b.email) {
      const params = [companyId];
      const ors = [];
      if (b.linkedin_url) {
        params.push(b.linkedin_url);
        ors.push(`LOWER(COALESCE(hl.linkedin_url,'')) = LOWER($${params.length})`);
      }
      if (b.email) {
        params.push(b.email);
        ors.push(`LOWER(COALESCE(hl.email,'')) = LOWER($${params.length})`);
      }
      if (ors.length) {
        const dup = await pool.query(
          `SELECT id FROM hr_leads hl WHERE hl.company_id=$1 AND (${ors.join(" OR ")}) LIMIT 1`,
          params
        );
        if (dup.rowCount) {
          const existing = await pool.query(
            `SELECT hl.*, c.name AS company_name, hl.created_at AS created
               FROM hr_leads hl
               JOIN targeted_companies c ON c.id=hl.company_id
              WHERE hl.id=$1`,
            [dup.rows[0].id]
          );
          return ok(res, { existed: true, company_id: companyId, lead: existing.rows[0] });
        }
      }
    }

    const locArr = normalizeLocations(b.location);
    const ins = await pool.query(
      `INSERT INTO hr_leads
        (company_id, name, designation, linkedin_url, location, mobile, email,
         email_status, lead_status, status_remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        companyId,
        b.name,
        b.designation,
        b.linkedin_url,
        locArr,
        b.mobile,
        b.email,
        b.email_status || "unknown",
        b.lead_status || "New",
        b.status_remarks || null,
      ]
    );

    const created = await pool.query(
      `SELECT hl.*, c.name AS company_name, hl.created_at AS created
         FROM hr_leads hl
         JOIN targeted_companies c ON c.id=hl.company_id
        WHERE hl.id=$1`,
      [ins.rows[0].id]
    );

    return ok(res, { company_id: companyId, lead: created.rows[0] });
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/**
 * POST /api/hr-leads/bulk  (admin only)
 * Body: Array<{ company_id? | company?: {...}, name?, designation?, linkedin_url?, location?, mobile?, email?, email_status?, lead_status?, status_remarks? }>
 */
router.post("/bulk", adminOnly, async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : req.body?.items || [];
    if (!items.length) return bad(res, "no items");

    const results = [];
    for (const item of items) {
      try {
        const companyId =
          item.company_id || (await getOrCreateCompanyDetailed(item.company || {}));
        if (!companyId) throw new Error("company_id or company.name required");

        const b = aliasBody({ ...item, company_id: companyId });
        const locArr = normalizeLocations(b.location);

        const ins = await pool.query(
          `INSERT INTO hr_leads
            (company_id, name, designation, linkedin_url, location, mobile, email,
             email_status, lead_status, status_remarks)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            companyId,
            b.name,
            b.designation,
            b.linkedin_url,
            locArr,
            b.mobile,
            b.email,
            b.email_status || "unknown",
            b.lead_status || "New",
            b.status_remarks || null,
          ]
        );

        results.push({ ok: true, id: ins.rows[0].id });
      } catch (err) {
        results.push({ ok: false, error: err.message });
      }
    }

    return ok(res, { count: results.length, results });
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

export default router;
