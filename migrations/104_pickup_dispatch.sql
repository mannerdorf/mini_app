-- Isolated pickup module. Apply once before enabling dispatcher/driver badges.
BEGIN;
CREATE TABLE IF NOT EXISTS pickup_resources (
  id uuid PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('driver','vehicle','depot')),
  city text NOT NULL CHECK (city IN ('moscow','kaliningrad')), name text NOT NULL,
  active boolean NOT NULL DEFAULT true, data jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pickup_driver_login_unique ON pickup_resources (lower(data->>'login')) WHERE kind='driver' AND active;
CREATE TABLE IF NOT EXISTS pickup_routes (
  id uuid PRIMARY KEY, city text NOT NULL CHECK (city IN ('moscow','kaliningrad')), date date NOT NULL, name text NOT NULL,
  driver_id uuid NOT NULL REFERENCES pickup_resources(id), vehicle_id uuid NOT NULL REFERENCES pickup_resources(id),
  depot_id uuid NOT NULL REFERENCES pickup_resources(id), start_time text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','started','completed')),
  snapshot jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1, acknowledged_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickup_routes_day ON pickup_routes(city,date);
CREATE TABLE IF NOT EXISTS pickup_jobs (
  id uuid PRIMARY KEY, city text NOT NULL CHECK (city IN ('moscow','kaliningrad')), date date NOT NULL,
  data jsonb NOT NULL, route_id uuid REFERENCES pickup_routes(id), position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','arrived','picked_up','partial','problem','deposited','resolved')),
  actual_places integer CHECK (actual_places > 0), note text NOT NULL DEFAULT '', resolution text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickup_jobs_day ON pickup_jobs(city,date);
CREATE INDEX IF NOT EXISTS pickup_jobs_route ON pickup_jobs(route_id,position);
CREATE TABLE IF NOT EXISTS pickup_photos (
  id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES pickup_jobs(id), content_type text NOT NULL,
  bytes bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickup_photos_job ON pickup_photos(job_id);
CREATE TABLE IF NOT EXISTS pickup_events (
  id uuid PRIMARY KEY, route_id uuid REFERENCES pickup_routes(id), job_id uuid REFERENCES pickup_jobs(id),
  actor text NOT NULL, action text NOT NULL, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickup_events_route ON pickup_events(route_id,created_at);
CREATE TABLE IF NOT EXISTS pickup_receipts (
  actor text NOT NULL, request_id uuid NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor,request_id)
);
COMMIT;
