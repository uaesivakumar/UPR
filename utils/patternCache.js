// utils/patternCache.js
import { pool } from "./db.js";

export async function getDomainPattern(domain) {
  if (!domain) return null;
  const r = await pool.query(
    `SELECT domain, pattern_id, examples, verified_count, source, updated_at
       FROM email_domain_patterns
      WHERE domain_lc = LOWER($1)
      LIMIT 1`,
    [domain]
  );
  return r.rowCount ? r.rows[0] : null;
}

/**
 * Upsert a domain pattern.
 * - If `example` is provided as { name, email }, it is appended to examples[] (deduped by email).
 * - If `incrementVerified` is true and status was validated, increments verified_count.
 */
export async function setDomainPattern({
  domain,
  pattern_id,
  source = "manual",
  example = null,
  incrementVerified = false,
}) {
  if (!domain || !pattern_id) return null;

  // Minimal dedupe for examples by email
  const exampleJson = example ? JSON.stringify(example) : null;

  const sql = `
    INSERT INTO email_domain_patterns (domain, domain_lc, pattern_id, examples, verified_count, source)
    VALUES ($1, LOWER($1), $2, COALESCE($3::jsonb, '[]'::jsonb), $4, $5)
    ON CONFLICT (domain_lc)
    DO UPDATE SET
      pattern_id = EXCLUDED.pattern_id,
      examples =
        CASE
          WHEN $3::jsonb IS NULL THEN email_domain_patterns.examples
          ELSE (
            SELECT to_jsonb(
              (
                SELECT ARRAY(
                  SELECT DISTINCT e
                  FROM jsonb_array_elements(email_domain_patterns.examples || EXCLUDED.examples) AS e
                )
              )
            )
          )
        END,
      verified_count = email_domain_patterns.verified_count + GREATEST(EXCLUDED.verified_count, 0),
      source = COALESCE(EXCLUDED.source, email_domain_patterns.source),
      updated_at = now()
    RETURNING domain, pattern_id, examples, verified_count, source, updated_at
  `;

  const verifiedIncrement = incrementVerified ? 1 : 0;

  const r = await pool.query(sql, [
    domain,
    pattern_id,
    exampleJson,
    verifiedIncrement,
    source,
  ]);
  return r.rows[0];
}
