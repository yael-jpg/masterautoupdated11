-- 023: Add plate validation & verification fields to vehicles
-- is_suspicious:  flagged by auto-detection (repeating chars, all-same-digit, etc.)
-- plate_verified: admin-confirmed plate legitimacy
-- verified_by:    user id of admin who verified
-- verified_at:    timestamp of verification

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS is_suspicious    BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS plate_verified   BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_by      INT       REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMP;

-- Drop the old simple UNIQUE constraint on plate_number (allows same plate for same customer)
-- and replace with a unique index that permits duplicates across customers with a warning.
-- We keep plate_number globally unique as the original schema intended.
-- (The route logic will handle cross-customer warnings before insert.)
