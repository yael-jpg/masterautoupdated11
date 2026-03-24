-- Migration 045: Add default_cta_url to email blasting configuration
-- Also ensures default_sender_name, default_sender_email, default_cta_label are seeded

INSERT INTO configuration_settings (category, key, value, description, data_type, is_editable)
VALUES
  ('email', 'default_cta_url',     '',                         'URL for the call-to-action button in campaign emails',               'string', TRUE),
  ('email', 'default_sender_name',  'MasterAuto',               'Display name shown in the From field of campaign emails',            'string', TRUE),
  ('email', 'default_sender_email', 'noreply@masterauto.com',   'Reply-to / From email address for campaign emails',                  'string', TRUE),
  ('email', 'default_cta_label',    'ENROLL NOW',               'Text label for the call-to-action button in campaign emails',        'string', TRUE)
ON CONFLICT (category, key) DO NOTHING;
