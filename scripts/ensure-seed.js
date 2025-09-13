// scripts/ensure-seed.js
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DEMO_ROWS = [
  { company: "Emirates NBD", role: "Senior Finance Manager", salary_band: "AED 150K+", status: "New" },
  { company: "G42", role: "Head of HR (MENA)", salary_band: "AED 100K+", status: "Contacted" },
  { company: "ADNOC", role: "Payroll Lead", salary_band: "AED 100K+", status: "Qualified" },
  { company: "Emaar", role: "Compensation & Benefits Manager", salary_band: "AED 150K+", status: "New" },
  { company: "ADGM", role: "Finance Director", salary_band: "AED 150K+", status: "New" }
];

async function ensureSchema() {
  // Works whether uuid-ossp or pgcrypto is available
  await pool.query(`DO $$
  BEGIN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    EXCEPTION WHEN OTHERS THEN
      -- Fall back to pgcrypto if uuid-ossp blocked
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    END;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'leads'
    ) THEN
      EXECUTE '
        CREATE TABLE leads (
          id UUID PRIMARY KEY DEFAULT
            CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = ''uuid-ossp'')
              THEN uuid_generate_v4()
              ELSE gen_random_uuid()
            END,
          company TEXT NOT NULL,
          role TEXT NOT NULL,
          salary_band TEXT NOT NULL DEFAULT ''AED 50K+'',
          status TEXT NOT NULL DEFAULT ''New'',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      ';
    END IF;
    CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
    CREATE INDEX IF NOT EXISTS leads_company_idx ON leads (company);
  END $$;`);
}

async function seedIfEmpty() {
  // get advisory lock to avoid race on multi-instance
  const LOCK_KEY = 82736123; // arbitrary
  const { rows: lockRows } = await pool.query("SELECT pg_try_advisory_lock($1) AS got", [LOCK_KEY]);
  if (!lockRows?.[0]?.got) {
    console.log("[seed] Another instance is seeding. Skipping.");
    return;
  }

  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM leads");
    const count = rows?.[0]?.c ?? 0;
    if (count > 0) {
      console.log(`[seed] Leads already present (${count}). Skipping seed.`);
      return;
    }

    const insert =
      `INSERT INTO leads (company, role, salary_band, status)
       VALUES ($1, $2, $3, $4)`;
    for (const r of DEMO_ROWS) {
      await pool.query(insert, [r.company, r.role, r.salary_band, r.status]);
    }
    console.log(`[seed] Inserted ${DEMO_ROWS.length} demo leads.`);
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}

(async () => {
  try {
    await ensureSchema();
    await seedIfEmpty();
  } catch (err) {
    console.error("[seed] error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
