-- Migration 022: Add updated_at to appointments for change tracking
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Back-fill existing rows
UPDATE appointments SET updated_at = created_at WHERE updated_at IS NULL;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION trg_appointments_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_set_updated_at ON appointments;
CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION trg_appointments_set_updated_at();
