-- Last GPS fix per pickup route; no movement history. Safe to re-apply.
BEGIN;
CREATE TABLE IF NOT EXISTS pickup_driver_locations (
  route_id uuid PRIMARY KEY REFERENCES pickup_routes(id) ON DELETE CASCADE,
  driver_login text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy double precision NOT NULL CHECK (accuracy BETWEEN 0 AND 100000),
  measured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
