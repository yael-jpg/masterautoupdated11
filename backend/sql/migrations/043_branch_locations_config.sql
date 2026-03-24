-- 043: Add branch_locations to booking configuration
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable)
VALUES (
  'booking',
  'branch_locations',
  '["Cubao","Manila"]',
  'List of branch locations shown in the New Booking dropdown',
  'json',
  true
)
ON CONFLICT (category, "key") DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = NOW();
