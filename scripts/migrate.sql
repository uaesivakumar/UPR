-- scripts/migrate.sql

-- idempotent helper
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'location_enum') THEN
    CREATE TYPE location_enum AS ENUM ('Abu Dhabi','Dubai','Sharjah');
  END IF;
END$$;

-- Targeted companies (formerly "leads")
CREATE TABLE IF NOT EXISTS targeted_companies (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  website       TEXT,
  linkedin      TEXT,
  company_type  TEXT CHECK (company_type IN ('ALE','NON ALE','Good Coded')) DEFAULT 'NON ALE',
  locations     location_enum[] DEFAULT '{}',
  status        TEXT CHECK (status IN ('New','Contacted','Response Revd.','Converted','Declined')) DEFAULT 'New',
  status_remarks TEXT,
  qscore        INT CHECK (qscore BETWEEN 0 AND 100) DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_targeted_companies_name ON targeted_companies (lower(name));
CREATE INDEX IF NOT EXISTS idx_targeted_companies_status ON targeted_companies (status);
CREATE INDEX IF NOT EXISTS idx_targeted_companies_qscore ON targeted_companies (qscore);
CREATE INDEX IF NOT EXISTS idx_targeted_companies_locations ON targeted_companies USING GIN (locations);

-- HR leads table
CREATE TABLE IF NOT EXISTS hr_leads (
  id             BIGSERIAL PRIMARY KEY,
  company_id     BIGINT NOT NULL REFERENCES targeted_companies(id) ON DELETE CASCADE,
  name           TEXT,
  designation    TEXT,
  linkedin_url   TEXT,
  location       TEXT,
  role           TEXT,
  mobile         TEXT,
  email          TEXT,
  status         TEXT CHECK (status IN (
                    'New','Contacted','Response rcvd',
                    'Follow-up 1 stage','F-Up 2 stage','F-Up 3 stage','F-Up 4 stage',
                    'Converted','Declined'
                  )) DEFAULT 'New',
  status_remarks TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_leads_company ON hr_leads (company_id);
CREATE INDEX IF NOT EXISTS idx_hr_leads_status ON hr_leads (status);
CREATE INDEX IF NOT EXISTS idx_hr_leads_email ON hr_leads (lower(email));
