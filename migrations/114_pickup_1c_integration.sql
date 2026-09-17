-- Durable outbox: local completion never depends on 1C availability.
CREATE TABLE IF NOT EXISTS pickup_number_sync (
  job_id uuid PRIMARY KEY REFERENCES pickup_jobs(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  pickup_number text NOT NULL,
  customer_inn text NOT NULL,
  generation integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','synced','error')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickup_number_sync_pending ON pickup_number_sync(next_attempt_at) WHERE state <> 'synced';
CREATE OR REPLACE FUNCTION enqueue_pickup_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'deposited' AND coalesce(trim(NEW.data->>'zayavkaNumber'),'') <> '' THEN
    INSERT INTO pickup_number_sync(job_id,order_number,pickup_number,customer_inn)
    VALUES(NEW.id,trim(NEW.data->>'zayavkaNumber'),NEW.job_number,coalesce(NEW.data->>'customerInn',''))
    ON CONFLICT(job_id) DO UPDATE SET
      order_number=EXCLUDED.order_number,pickup_number=EXCLUDED.pickup_number,customer_inn=EXCLUDED.customer_inn,
      generation=pickup_number_sync.generation+1,state='pending',attempts=0,next_attempt_at=now(),last_error=NULL,synced_at=NULL,updated_at=now()
    WHERE (pickup_number_sync.order_number,pickup_number_sync.pickup_number,pickup_number_sync.customer_inn)
      IS DISTINCT FROM (EXCLUDED.order_number,EXCLUDED.pickup_number,EXCLUDED.customer_inn);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pickup_number_outbox ON pickup_jobs;
CREATE TRIGGER pickup_number_outbox AFTER INSERT OR UPDATE ON pickup_jobs FOR EACH ROW EXECUTE FUNCTION enqueue_pickup_number();
INSERT INTO pickup_number_sync(job_id,order_number,pickup_number,customer_inn)
SELECT id,trim(data->>'zayavkaNumber'),job_number,coalesce(data->>'customerInn','') FROM pickup_jobs
WHERE status='deposited' AND coalesce(trim(data->>'zayavkaNumber'),'')<>'' ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS pickup_billing (
  job_id uuid PRIMARY KEY REFERENCES pickup_jobs(id) ON DELETE RESTRICT,
  transport_number text NOT NULL,
  source jsonb NOT NULL,
  amount numeric(14,2) CHECK (amount>=0),
  amount_manual boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'not_issued' CHECK(status IN ('not_issued','sending','transmitted','manual','issued','uncertain')),
  version integer NOT NULL DEFAULT 1,
  last_error text,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pickup_billing_events (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES pickup_billing(job_id),
  actor text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Freeze allocated parcel IDs before the first network attempt, so a retry
-- reuses exactly the same payload and the existing one_c_order_submissions receipt.
CREATE TABLE IF NOT EXISTS documents_order_prepared (
  customer_inn text NOT NULL,
  client_number text NOT NULL,
  actor text NOT NULL,
  request_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(customer_inn,client_number)
);

-- SetPickupCost identifies a document by number alone. Never bill it twice locally.
CREATE UNIQUE INDEX IF NOT EXISTS pickup_billing_transport ON pickup_billing(transport_number);
-- Full upstream payload already stores new GetPerevozki fields. Add lookup indexes
-- when the normalized cache has been provisioned; no lossy data rewrite is needed.
DO $$ BEGIN
  IF to_regclass('public.cache_perevozki_rows') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS cache_perevozki_pickup_number ON cache_perevozki_rows ((coalesce(payload->>'НомерПикапа',payload->>'PickupNumber')));
    CREATE INDEX IF NOT EXISTS cache_perevozki_raw_number ON cache_perevozki_rows ((coalesce(payload->>'rawNumber',payload->>'Number',payload->>'НомерПеревозки')));
  END IF;
END $$;
