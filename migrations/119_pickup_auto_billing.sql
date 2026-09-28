BEGIN;
CREATE TABLE IF NOT EXISTS pickup_auto_billing_queue (
  job_id uuid PRIMARY KEY REFERENCES pickup_jobs(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','done')),
  attempts integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickup_auto_billing_due ON pickup_auto_billing_queue(next_at) WHERE state='pending';
CREATE OR REPLACE FUNCTION enqueue_pickup_auto_billing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='deposited' AND NEW.data->>'issueCustomerBill'='true'
    AND NEW.data->>'customerBillMode'='auto' AND btrim(coalesce(NEW.data->>'zayavkaNumber',''))<>'' THEN
    IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.data->>'zayavkaNumber' IS DISTINCT FROM NEW.data->>'zayavkaNumber'
      OR OLD.data->>'customerBillMode' IS DISTINCT FROM NEW.data->>'customerBillMode'
      OR OLD.data->>'issueCustomerBill' IS DISTINCT FROM NEW.data->>'issueCustomerBill'
      OR OLD.data->>'mkadKm' IS DISTINCT FROM NEW.data->>'mkadKm'
      OR OLD.data->>'priceRub' IS DISTINCT FROM NEW.data->>'priceRub'
      OR OLD.data->>'payment' IS DISTINCT FROM NEW.data->>'payment' THEN
      INSERT INTO pickup_auto_billing_queue(job_id) VALUES(NEW.id)
      ON CONFLICT(job_id) DO UPDATE SET next_at=now(),last_error=NULL,updated_at=now()
        WHERE pickup_auto_billing_queue.state='pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pickup_auto_billing_enqueue ON pickup_jobs;
CREATE TRIGGER pickup_auto_billing_enqueue AFTER INSERT OR UPDATE ON pickup_jobs
FOR EACH ROW EXECUTE FUNCTION enqueue_pickup_auto_billing();
COMMIT;
