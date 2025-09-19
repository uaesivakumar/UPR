ALTER TABLE IF EXISTS targeted_companies
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS email_pattern TEXT,
  ADD COLUMN IF NOT EXISTS pattern_confidence NUMERIC;

ALTER TABLE IF EXISTS hr_leads
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_ref TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS seniority TEXT,
  ADD COLUMN IF NOT EXISTS role_bucket TEXT,
  ADD COLUMN IF NOT EXISTS email_reason TEXT;

CREATE TABLE IF NOT EXISTS email_pattern_cache (
  domain TEXT PRIMARY KEY,
  pattern TEXT,
  sample_email TEXT,
  confidence NUMERIC,
  updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_leads_company_email ON hr_leads(company_id, email);
