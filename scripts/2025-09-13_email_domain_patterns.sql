-- scripts/2025-09-13_email_domain_patterns.sql
-- Domain-wide email pattern cache
-- Stores the inferred pattern for a company's email domain (e.g., first.last).

CREATE TABLE IF NOT EXISTS email_domain_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain          TEXT NOT NULL,                 -- original verbatim domain
  domain_lc       TEXT NOT NULL,                 -- normalized lower(domain), used for uniqueness
  pattern_id      TEXT NOT NULL,                 -- e.g., "first.last", "flast", ...
  examples        JSONB NOT NULL DEFAULT '[]',   -- sample name/email pairs used to infer
  verified_count  INTEGER NOT NULL DEFAULT 0,    -- how many times validated via SMTP/etc.
  source          TEXT,                          -- "llm", "manual", "verify", "import"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per domain
CREATE UNIQUE INDEX IF NOT EXISTS email_domain_patterns_domain_lc_uidx
  ON email_domain_patterns (domain_lc);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION trg_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_touch_email_domain_patterns_updated_at'
  ) THEN
    CREATE TRIGGER trg_touch_email_domain_patterns_updated_at
    BEFORE UPDATE ON email_domain_patterns
    FOR EACH ROW
    EXECUTE FUNCTION trg_touch_updated_at();
  END IF;
END $$;
