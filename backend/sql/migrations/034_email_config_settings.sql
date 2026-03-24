-- Migration 034: Email Blasting configuration defaults

-- Insert editable settings for Email Blasting module
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'enable_email_blasting', 'true', 'Enable the Email Blasting module (show in Settings and allow campaigns)', 'boolean', TRUE),
('email', 'default_sender_name', 'MasterAuto', 'Default sender name for campaign emails', 'string', TRUE),
('email', 'default_sender_email', 'noreply@masterauto.com', 'Default sender email for campaigns', 'string', TRUE),
('email', 'default_cta_label', 'ENROLL NOW', 'Default CTA button label (required)', 'string', TRUE),
('email', 'require_cta', 'true', 'Require a CTA button before activating campaigns', 'boolean', TRUE),
('email', 'auto_unsubscribe', 'true', 'Automatically add unsubscribe link to campaigns', 'boolean', TRUE),
('email', 'include_company_address', 'true', 'Include company address in campaign footer', 'boolean', TRUE),
('email', 'throttle_batch_size', '200', 'Default number of emails per sending batch', 'number', TRUE),
('email', 'throttle_delay_ms', '1000', 'Delay in milliseconds between sending batches', 'number', TRUE),
('email', 'domain_auth_check', 'false', 'Validate domain authentication (SPF/DKIM/DMARC) before sending', 'boolean', TRUE),
('email', 'sendgrid_enabled', 'false', 'Enable SendGrid integration for sending campaigns', 'boolean', TRUE),
('email', 'mailchimp_enabled', 'false', 'Enable Mailchimp integration for campaigns', 'boolean', TRUE),
('email', 'preview_recipients', '[]', 'List of emails to send preview/test messages to (JSON array)', 'json', TRUE),
('email', 'spam_risk_threshold', '0.5', 'Spam risk threshold (0-1) used by spam checker', 'number', TRUE),
('email', 'default_schedule_timezone', 'Asia/Manila', 'Default timezone for scheduled campaigns', 'string', TRUE);
