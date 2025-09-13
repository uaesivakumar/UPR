// routes/companies.js
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";
import { computeQScore } from "../utils/qscore.js";
import { isValidCompanyType, isValidCompanyStatus } from "../utils/validators.js";

const router = express.Router();

const ALLOWED_LOCATIONS = new Set(["Abu Dhabi", "Dubai", "Sharjah"]);
function normalizeLocations(loc) {
  if (!loc) return [];
  const arr = Array.isArray(loc) ? loc : String(loc).split(","); // allow comma-separated
  return Array.from(
    new Set(
      arr
        .map((s) => String(s).trim())
        .filter(Boolean)
        .filter((s) => ALLOWED_LOCATIONS.has(s))
    )
  );
}

function coalesceBodyAliases(body = {}) {
  // Accept both old and new keys
  return {
    name: body.name,
    type: body.type ?? body.company_type, // "ALE" | "NON ALE" | "Good Coded"
    locations: normalizeLocations(body.locations),
    website_url: body.website_url ?? body.website,
    linkedin_url: body.linkedin_url ?? body.linkedin,
    status: body.status,
    status_remarks: body.status_remarks,
    about_blurb: body.about_blurb,
  };
}

/**
 * POST /api/companies
 * Body: { name, type|company_type, locations[], website_url|website, linkedin_url|linkedin }
 */
router.post("/", async (req, res) => {
  try {
    const { name, type, locations, website_url, linkedin_url } = coalesceBodyAliases(req.body);
    if (!name) return bad(res, "name required");
    if (type && !isValidCompanyType(type)) return bad(res, "invalid type");

    const norm = name.trim();
    const exists = await pool.query(
      "SELECT id FROM targeted_companies WHERE LOWER(name)=LOWER($1)",
      [norm]
    );
    if (exists.rowCount) return ok(res, { id: exists.rows[0].id, existed: true });

    const ins = await pool.query(
      `INSERT INTO targeted_companies (name, type, locations, website_url, linkedin_url)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, type, locations, website_url, linkedin_url, status, status_remarks, about_blurb, qscore, created_at AS created`,
      [norm, type || null, locations, website_url || null, linkedin_url || null]
    );
    return ok(res, ins.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/**
 * GET /api/companies
 * Query: q|search, type, status, location, sort (name|qscore|created_at).(asc|desc)
 */
router.get("/", async (req, res) => {
  try {
    const search = req.query.q ?? req.query.search ?? "";
    const { type, status, location, sort = "created_at.desc" } = req.query;

    const params = [];
    const where = [];

    if (search) {
      params.push(`%${String(search).toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length}
                   OR LOWER(COALESCE(website_url,'')) LIKE $${params.length}
                   OR LOWER(COALESCE(linkedin_url,'')) LIKE $${params.length})`);
    }
    if (type) {
      params.push(type);
      where.push(`type=$${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status=$${params.length}`);
    }
    if (location) {
      params.push(location);
      where.push(`$${params.length} = ANY(locations)`);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [col, dir] = String(sort).split(".");
    const orderCol = ["name", "qscore", "created_at"].includes(col) ? col : "created_at";
    const orderDir = dir === "asc" ? "asc" : "desc";

    const q = `
      SELECT
        id, name, type, locations, website_url, linkedin_url,
        status, status_remarks, about_blurb, qscore,
        created_at AS created, updated_at
      FROM targeted_companies
      ${clause}
      ORDER BY ${orderCol} ${orderDir}
      LIMIT 200
    `;
    const rows = await pool.query(q, params);
    return ok(res, rows.rows);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/** GET /api/companies/:id */
router.get("/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, type, locations, website_url, linkedin_url,
              status, status_remarks, about_blurb, qscore,
              created_at AS created, updated_at
       FROM targeted_companies WHERE id=$1`,
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
 * PATCH /api/companies/:id
 * Accepts same aliases as POST.
 */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = coalesceBodyAliases(req.body);

    const sets = [];
    const params = [];

    const assign = (k, v) => {
      if (v !== undefined) {
        params.push(v);
        sets.push(`${k}=$${params.length}`);
      }
    };

    if (body.type) {
      if (!isValidCompanyType(body.type)) return bad(res, "invalid type");
      assign("type", body.type);
    }
    if (body.locations) assign("locations", body.locations);
    if (body.website_url !== undefined) assign("website_url", body.website_url || null);
    if (body.linkedin_url !== undefined) assign("linkedin_url", body.linkedin_url || null);

    if (body.status !== undefined) {
      if (!isValidCompanyStatus(body.status)) return bad(res, "invalid status");
      assign("status", body.status);
    }
    if (body.status_remarks !== undefined) assign("status_remarks", body.status_remarks || null);
    if (body.about_blurb !== undefined) assign("about_blurb", body.about_blurb || null);

    if (!sets.length) return bad(res, "no changes");

    params.push(id);
    const r = await pool.query(
      `UPDATE targeted_companies
         SET ${sets.join(", ")}, updated_at=now()
       WHERE id=$${params.length}
       RETURNING id, name, type, locations, website_url, linkedin_url,
                 status, status_remarks, about_blurb, qscore,
                 created_at AS created, updated_at`,
      params
    );
    return ok(res, r.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/** GET /api/companies/:id/news */
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

/** POST /api/companies/:id/recompute-qscore */
router.post("/:id/recompute-qscore", async (req, res) => {
  try {
    const { id } = req.params;
    const c = await pool.query("SELECT * FROM targeted_companies WHERE id=$1", [id]);
    if (!c.rowCount) return bad(res, "not found", 404);

    const n = await pool.query("SELECT tags FROM news_items WHERE company_id=$1", [id]);
    const qscore = computeQScore(c.rows[0], n.rows);

    const u = await pool.query(
      `UPDATE targeted_companies
         SET qscore=$1, updated_at=now()
       WHERE id=$2
       RETURNING id, name, type, locations, website_url, linkedin_url,
                 status, status_remarks, about_blurb, qscore,
                 created_at AS created, updated_at`,
      [qscore, id]
    );
    return ok(res, u.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

export default router;
