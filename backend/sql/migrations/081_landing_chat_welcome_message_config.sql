-- Migration 081: Landing chat welcome message configuration

INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable)
VALUES (
  'landing_chat',
  'welcome_message',
  'Hello! Thank you for contacting Master Auto. Please share your concern and our assistant will acknowledge it first, then a SuperAdmin will respond shortly.',
  'Initial greeting shown in landing chat when no messages exist yet.',
  'string',
  TRUE
)
ON CONFLICT (category, "key") DO NOTHING;

UPDATE configuration_settings
SET value = 'Thank you, {{name}}. Your message has been received and queued. A SuperAdmin will assist you as soon as possible.',
    description = 'Fallback automatic message when no intent match exists.',
    updated_at = NOW()
WHERE category = 'landing_chat'
  AND "key" = 'auto_reply_template'
  AND (
    value IS NULL
    OR value = ''
    OR value = 'Thanks {{name}}! This is our automatic assistant. Your message has been queued and SuperAdmin will reply as soon as possible.'
  );
