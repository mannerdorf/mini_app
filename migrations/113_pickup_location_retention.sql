-- Supports bounded cleanup and hides GPS older than seven days on reads.
CREATE INDEX IF NOT EXISTS pickup_driver_locations_observed_idx
  ON pickup_driver_locations ((COALESCE(last_observed_at, measured_at)));
