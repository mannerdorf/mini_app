-- Stable human-readable pickup job number (internal, not 1C zayavka).
BEGIN;
CREATE SEQUENCE IF NOT EXISTS pickup_job_number_seq;
ALTER TABLE pickup_jobs
  ADD COLUMN IF NOT EXISTS job_number bigint;
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM pickup_jobs
  WHERE job_number IS NULL
)
UPDATE pickup_jobs j
SET job_number = numbered.rn
FROM numbered
WHERE j.id = numbered.id;
DO $$
DECLARE m bigint;
BEGIN
  SELECT max(job_number) INTO m FROM pickup_jobs;
  IF m IS NULL THEN
    PERFORM setval('pickup_job_number_seq', 1, false);
  ELSE
    PERFORM setval('pickup_job_number_seq', m, true);
  END IF;
END $$;
ALTER TABLE pickup_jobs
  ALTER COLUMN job_number SET DEFAULT nextval('pickup_job_number_seq');
UPDATE pickup_jobs SET job_number = nextval('pickup_job_number_seq') WHERE job_number IS NULL;
ALTER TABLE pickup_jobs
  ALTER COLUMN job_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pickup_jobs_job_number_unique ON pickup_jobs (job_number);
COMMIT;
