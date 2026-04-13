-- Migration 080: Landing chat AI/autoreply configuration defaults

INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable)
VALUES
  ('landing_chat', 'auto_reply_enabled', 'true', 'Enable automatic pre-reply before SuperAdmin joins.', 'boolean', TRUE),
  ('landing_chat', 'auto_reply_template', 'Thanks {{name}}! This is our automatic assistant. Your message has been queued and SuperAdmin will reply as soon as possible.', 'Fallback automatic message when no intent match exists.', 'string', TRUE),
  ('landing_chat', 'ml_intent_enabled', 'true', 'Enable ML-style intent matching for smarter automatic replies.', 'boolean', TRUE),
  (
    'landing_chat',
    'ml_intent_rules',
    '[
      {"intent":"pricing","keywords":["price","cost","how much","rate","discount"]},
      {"intent":"booking","keywords":["book","schedule","appointment","slot","available"]},
      {"intent":"location","keywords":["where","location","address","branch","map"]},
      {"intent":"services","keywords":["service","ppf","ceramic","tint","detailing","package"]},
      {"intent":"status","keywords":["status","update","progress","follow up","follow-up"]}
    ]',
    'Intent keyword model used by auto-reply classifier.',
    'json',
    TRUE
  ),
  (
    'landing_chat',
    'ml_intent_replies',
    '{
      "pricing":"Thanks {{name}}. For pricing, our team will provide a quotation based on your vehicle and preferred service.",
      "booking":"Thanks {{name}}. For booking requests, please share your preferred date/time and vehicle details.",
      "location":"Thanks {{name}}. Our team will send the exact branch/location details shortly.",
      "services":"Thanks {{name}}. We offer PPF, ceramic coating, tint, detailing, and seat cover packages.",
      "status":"Thanks {{name}}. We have logged your request and SuperAdmin will send an update soon.",
      "fallback":"Thanks {{name}}! Your message is queued. SuperAdmin will reply as soon as possible."
    }',
    'Response templates for ML intent categories and fallback.',
    'json',
    TRUE
  )
ON CONFLICT (category, "key") DO NOTHING;
