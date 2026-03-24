-- Migration 036: Add default campaign content setting for Email Blasting

INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'default_campaign_content', 'Hello {{customer_name}},\n\nWe have an exclusive offer for you! Use code {{promo_code}} to get a discount on your next service.\n\nBest regards,\nMasterAuto Team', 'Default HTML/text content used when creating quick email blasts (supports placeholders like {{customer_name}}, {{promotion_name}}, {{promo_code}})', 'string', TRUE);
