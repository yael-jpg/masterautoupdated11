-- 027: Add body_type to vehicles (driven by Settings > Vehicle > Default Vehicle Categories)

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS body_type VARCHAR(60);
