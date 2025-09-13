// utils/db.js
import pg from "pg";
const { Pool } = pg;

// Prefer DATABASE_URL (Render/Heroku-style), fall back to POSTGRES_URL
const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || null;

if (!connectionString) {
  console.warn(
    "[db] No DATABASE_URL/POSTGRES_URL set; queries will fail until configured."
  );
}

export const pool = new Pool({
  connectionString,
  // Enable SSL in hosted environments that require it
  ssl:
    process.env.PGSSLMODE === "require" ||
    (connectionString && !connectionString.includes("localhost"))
      ? { rejectUnauthorized: false }
      : undefined,
  max: parseInt(process.env.PGPOOL_MAX || "10", 10),
  idleTimeoutMillis: 30_000,
});

/** Convenience wrappers (optional) */
export async function query(text, params) {
  return pool.query(text, params);
}
export async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
