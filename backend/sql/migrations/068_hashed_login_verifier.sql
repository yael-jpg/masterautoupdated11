-- Add password verifier fields for challenge/response (hashed-in-browser) login
-- This avoids sending plaintext passwords over the wire (network payload shows only proof).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_salt TEXT,
  ADD COLUMN IF NOT EXISTS password_verifier TEXT,
  ADD COLUMN IF NOT EXISTS password_verifier_iters INTEGER;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_password_salt TEXT,
  ADD COLUMN IF NOT EXISTS portal_password_verifier TEXT,
  ADD COLUMN IF NOT EXISTS portal_password_verifier_iters INTEGER;

INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable)
VALUES
  ('system', 'force_hashed_admin_login', 'false', 'When true, admin login requires challenge/response proof (no plaintext password fallback). Enable only after accounts are upgraded.', 'boolean', TRUE),
  ('system', 'force_hashed_portal_login', 'false', 'When true, portal login requires challenge/response proof (no plaintext password fallback). Enable only after accounts are upgraded.', 'boolean', TRUE),
  ('system', 'hashed_login_pbkdf2_iters', '150000', 'PBKDF2 iterations for hashed-in-browser login proof (higher is slower but stronger).', 'number', TRUE)
ON CONFLICT (category, "key") DO NOTHING;
