-- targeted_companies safety adds
ALTER TABLE targeted_companies
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS status_remarks TEXT,
  ADD COLUMN IF NOT EXISTS about_blurb TEXT,
  ADD COLUMN IF NOT EXISTS qscore INTEGER;

-- hr_leads safety adds
ALTER TABLE hr_leads
  ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS status_remarks TEXT,
  ADD COLUMN IF NOT EXISTS mobile TEXT;

-- basic indexes
CREATE INDEX IF NOT EXISTS idx_tc_name ON targeted_companies (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_tc_status ON targeted_companies (status);
CREATE INDEX IF NOT EXISTS idx_tc_qscore ON targeted_companies (qscore);
CREATE INDEX IF NOT EXISTS idx_hr_company ON hr_leads (company_id);
CREATE INDEX IF NOT EXISTS idx_hr_status ON hr_leads (lead_status);
