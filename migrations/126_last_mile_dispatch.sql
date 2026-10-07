BEGIN;
-- Separate pickup and last-mile billing for the same transport.
DROP INDEX IF EXISTS pickup_billing_transport;
CREATE UNIQUE INDEX pickup_billing_transport ON pickup_billing(transport_number, (coalesce(source->>'serviceKind','pickup')));

CREATE OR REPLACE FUNCTION enqueue_pickup_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(NEW.data->>'serviceKind','pickup') <> 'last_mile' AND NEW.status = 'deposited' AND coalesce(trim(NEW.data->>'zayavkaNumber'),'') <> '' THEN
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

CREATE OR REPLACE FUNCTION enqueue_pickup_auto_billing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='deposited' AND NEW.data->>'issueCustomerBill'='true'
    AND NEW.data->>'customerBillMode'='auto' AND (btrim(coalesce(NEW.data->>'zayavkaNumber',''))<>'' OR (NEW.data->>'serviceKind'='last_mile' AND btrim(coalesce(NEW.data->>'cargoNumber',''))<>'')) THEN
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

COMMIT;
