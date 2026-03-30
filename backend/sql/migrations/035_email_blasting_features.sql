-- Migration 035: Email Blasting feature toggles and configuration

-- Core campaign management toggles
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'enable_campaign_management', 'true', 'Enable campaign management features (create/edit/schedule/duplicate/archive)', 'boolean', TRUE),
('email', 'allow_duplicate_campaign', 'true', 'Allow duplicating campaigns', 'boolean', TRUE),
('email', 'save_as_draft_enabled', 'true', 'Allow saving campaigns as draft', 'boolean', TRUE),
('email', 'schedule_send_enabled', 'true', 'Allow scheduling campaign sends', 'boolean', TRUE),
('email', 'activate_immediately_enabled', 'true', 'Allow activating campaigns for immediate send', 'boolean', TRUE),
('email', 'auto_archive_completed', 'true', 'Automatically archive completed campaigns', 'boolean', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- Audience segmentation toggles
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'segmentation_by_customer_type', 'true', 'Allow filtering audience by customer type (Regular / VIP / New)', 'boolean', TRUE),
('email', 'segmentation_by_service_history', 'true', 'Allow filtering by past service history', 'boolean', TRUE),
('email', 'segmentation_by_vehicle_type', 'true', 'Allow filtering by vehicle type', 'boolean', TRUE),
('email', 'segmentation_by_last_activity', 'true', 'Allow filtering by last activity / last transaction date', 'boolean', TRUE),
('email', 'segmentation_by_min_spend', 'true', 'Allow filtering by minimum historical spending', 'boolean', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- Promotion integration
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'promotion_integration_enabled', 'true', 'Enable dynamic linking of existing promotions to campaigns', 'boolean', TRUE),
('email', 'promotion_auto_load_fields', '["name","discount_value","expiry_date","promo_code"]', 'Fields auto-loaded from selected promotion (JSON array)', 'json', TRUE),
('email', 'show_promo_code_by_default', 'false', 'Show promo code in emails by default when promotion selected', 'boolean', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- Email builder
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'builder_rich_text_enabled', 'true', 'Enable rich text email editor (WYSIWYG)', 'boolean', TRUE),
('email', 'builder_image_upload_enabled', 'true', 'Allow image/header/banner uploads for campaigns', 'boolean', TRUE),
('email', 'builder_dynamic_variables', '["{{customer_name}}","{{promotion_name}}","{{discount_value}}","{{expiry_date}}"]', 'Supported dynamic variables (JSON array)', 'json', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- CTA (required)
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'require_cta_button', 'true', 'Require CTA button before activating a campaign', 'boolean', TRUE),
('email', 'cta_default_label', 'ENROLL NOW', 'Default CTA label for campaigns', 'string', TRUE),
('email', 'cta_click_tracking', 'true', 'Enable click tracking for CTA button', 'boolean', TRUE),
('email', 'cta_default_style', '{"color":"#1a56db","alignment":"center"}', 'Default CTA styling JSON', 'json', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- Sending engine / deliverability
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'sending_batch_size', '200', 'Default number of emails to send per batch', 'number', TRUE),
('email', 'sending_batch_delay_ms', '1000', 'Delay in milliseconds between sending batches', 'number', TRUE),
('email', 'sending_retry_attempts', '3', 'Number of retry attempts for failed deliveries', 'number', TRUE),
('email', 'sending_provider', 'sendgrid', 'Preferred sending provider (sendgrid|ses|smtp|mailchimp)', 'string', TRUE),
('email', 'prevent_duplicate_sends', 'true', 'Prevent duplicate sends to the same recipient within a campaign', 'boolean', TRUE),
('email', 'log_delivery_status', 'true', 'Log delivery status for each recipient', 'boolean', TRUE),
('email', 'handle_bounces', 'true', 'Detect and handle bounce emails', 'boolean', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- Analytics & tracking
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'analytics_enabled', 'true', 'Enable campaign analytics dashboard', 'boolean', TRUE),
('email', 'analytics_collect_revenue', 'true', 'Collect revenue metrics for campaign conversions', 'boolean', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- Security & compliance
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'auto_add_unsubscribe', 'true', 'Automatically append unsubscribe link to campaign emails', 'boolean', TRUE),
('email', 'include_company_footer', 'true', 'Automatically include company address footer', 'boolean', TRUE),
('email', 'spf_dkim_dmrc_check', 'false', 'Check SPF/DKIM/DMARC before large sends', 'boolean', TRUE),
('email', 'spam_risk_checker_enabled', 'true', 'Enable spam risk indicator for campaigns', 'boolean', TRUE),
('email', 'audit_logs_for_email_admin', 'true', 'Record audit logs for email admin actions', 'boolean', TRUE)
ON CONFLICT (category, "key") DO NOTHING;
