-- Contact persons per supplier (sender) for pickup dispatch.
BEGIN;
CREATE TABLE IF NOT EXISTS pickup_supplier_contacts (
  id uuid PRIMARY KEY,
  sender_inn text NOT NULL,
  phone_digits text NOT NULL,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  extension text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT 'Звонки',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_inn, phone_digits)
);
CREATE INDEX IF NOT EXISTS pickup_supplier_contacts_sender
  ON pickup_supplier_contacts (sender_inn, updated_at DESC);
COMMIT;
