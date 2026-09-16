-- Уникальный номер забора (сквозной ID для 1С, заявки, перевозки, биллинга).
BEGIN;

CREATE SEQUENCE IF NOT EXISTS pickup_job_number_seq START WITH 1;

ALTER TABLE pickup_jobs
  ADD COLUMN IF NOT EXISTS job_number text;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM pickup_jobs
  WHERE job_number IS NULL OR btrim(job_number) = ''
)
UPDATE pickup_jobs j
SET job_number = 'ZB-' || lpad(n.rn::text, 6, '0')
FROM numbered n
WHERE j.id = n.id;

SELECT setval(
  'pickup_job_number_seq',
  GREATEST(
    1,
    COALESCE(
      (
        SELECT max(
          NULLIF(regexp_replace(job_number, '^ZB-', ''), '')::bigint
        )
        FROM pickup_jobs
        WHERE job_number ~ '^ZB-[0-9]+$'
      ),
      0
    ) + 1
  ),
  false
);

ALTER TABLE pickup_jobs
  ALTER COLUMN job_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pickup_jobs_job_number_unique
  ON pickup_jobs (job_number);

CREATE INDEX IF NOT EXISTS pickup_jobs_job_number_idx
  ON pickup_jobs (job_number);

COMMIT;
