-- scripts/migrate.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS targeted_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('ALE','NON_ALE','Good Coded')),
  locations TEXT[] DEFAULT '{}',
  website_url TEXT,
  linkedin_url TEXT,
  about_blurb TEXT,
  news_signals JSONB DEFAULT '[]'::jsonb,
  hiring_signal BOOLEAN,
  qscore INT DEFAULT 0,
  status TEXT CHECK (status IN ('New','Contacted','Response Received','Converted','Declined')) DEFAULT 'New',
  status_remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tcompanies_unique_name ON targeted_companies (LOWER(name));

CREATE TABLE IF NOT EXISTS hr_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES targeted_companies(id) ON DELETE CASCADE,
  name TEXT,
  designation TEXT,
  linkedin_url TEXT,
  location TEXT,
  role_keywords TEXT[],
  mobile TEXT,
  email TEXT,
  email_status TEXT CHECK (email_status IN ('unknown','patterned','guessed','validated','bounced')) DEFAULT 'unknown',
  lead_status TEXT CHECK (lead_status IN ('New','Contacted','Response Received','Follow-up 1','Follow-up 2','Follow-up 3','Follow-up 4','Converted','Declined')) DEFAULT 'New',
  status_remarks TEXT,
  signal_feed JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_leads_company ON hr_leads(company_id);

CREATE TABLE IF NOT EXISTS news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT,
  company_id UUID REFERENCES targeted_companies(id) ON DELETE SET NULL,
  title TEXT,
  summary TEXT,
  url TEXT,
  source TEXT,
  published_at TIMESTAMPTZ,
  tags TEXT[],
  score INT DEFAULT 0,
  ingested_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_company ON news_items (LOWER(company_name));
