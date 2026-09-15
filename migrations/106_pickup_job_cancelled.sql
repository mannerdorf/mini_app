-- Статус «отменён» для заборов.
BEGIN;
ALTER TABLE pickup_jobs DROP CONSTRAINT IF EXISTS pickup_jobs_status_check;
ALTER TABLE pickup_jobs ADD CONSTRAINT pickup_jobs_status_check CHECK (
  status IN (
    'pending',
    'arrived',
    'picked_up',
    'partial',
    'problem',
    'deposited',
    'resolved',
    'cancelled'
  )
);
COMMIT;
