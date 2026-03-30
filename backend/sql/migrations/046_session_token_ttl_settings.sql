-- Add configurable session token TTLs (admin + portal)
-- Stored in minutes so it can represent both minutes and hours.

INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable)
VALUES
  ('system', 'admin_session_token_ttl_minutes', '600', 'Admin JWT session token time-to-live in minutes (e.g. 600 = 10 hours).', 'number', TRUE),
  ('system', 'portal_session_token_ttl_minutes', '43200', 'Portal JWT session token time-to-live in minutes (e.g. 43200 = 30 days).', 'number', TRUE)
ON CONFLICT (category, "key") DO NOTHING;
