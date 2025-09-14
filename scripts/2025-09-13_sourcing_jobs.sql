-- sourcing job queue
CREATE TABLE IF NOT EXISTS sourcing_jobs (
  id           BIGSERIAL PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES targeted_companies(id) ON DELETE CASCADE,
  source       TEXT DEFAULT 'manual', -- manual|cron|news|ui
  status       TEXT NOT NULL DEFAULT 'pending', -- pending|running|done|failed
  attempts     INT NOT NULL DEFAULT 0,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  error_text   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_jobs_status ON sourcing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sourcing_jobs_company ON sourcing_jobs(company_id);

-- small helper so updated_at stays fresh
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_sourcing_jobs ON sourcing_jobs;
CREATE TRIGGER trg_touch_sourcing_jobs
BEFORE UPDATE ON sourcing_jobs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
