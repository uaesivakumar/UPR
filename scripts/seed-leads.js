// scripts/seed-leads.js
// Seeds the leads table with a handful of demo rows.

import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const rows = [
  { company: "Emirates NBD", role: "Senior Finance Manager", salary_band: "AED 150K+", status: "New" },
  { company: "G42", role: "Head of HR (MENA)", salary_band: "AED 100K+", status: "Contacted" },
  { company: "ADNOC", role: "Payroll Lead", salary_band: "AED 100K+", status: "Qualified" },
  { company: "Emaar", role: "Compensation & Benefits Manager", salary_band: "AED 150K+", status: "New" },
  { company: "ADGM", role: "Finance Director", salary_band: "AED 150K+", status: "New" },
];

async function ensureSchema() {
  const ddl = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      salary_band TEXT NOT NULL DEFAULT 'AED 50K+',
      status TEXT NOT NULL DEFAULT 'New',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
    CREATE INDEX IF NOT EXISTS leads_company_idx ON leads (company);
  `;
  await pool.query(ddl);
}

async function seed() {
  await ensureSchema();

  const insert =
    `INSERT INTO leads (company, role, salary_band, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`;

  for (const r of rows) {
    await pool.query(insert, [r.company, r.role, r.salary_band, r.status]);
  }
  console.log(`Seeded ${rows.length} leads.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
