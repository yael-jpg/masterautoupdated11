-- Migration 082: Promo Code Configuration Settings
-- Adds system-wide configuration settings for controlling promo code behavior across email campaigns

-- Add Promo Code Configuration Settings to configuration_settings table
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('promo', 'enable_promo_codes', 'true', 'Enable/disable promo code functionality system-wide', 'boolean', TRUE),
('promo', 'max_discount_percentage', '50', 'Maximum discount percentage allowed for any single promo code', 'number', TRUE),
('promo', 'max_uses_per_code', '100', 'Default maximum uses for new promo codes (0 = unlimited)', 'number', TRUE),
('promo', 'default_expiration_days', '30', 'Default expiration period in days for new promo codes', 'number', TRUE),
('promo', 'allow_fixed_discount', 'true', 'Allow flat/fixed amount discounts in promo codes', 'boolean', TRUE),
('promo', 'allow_percentage_discount', 'true', 'Allow percentage-based discounts in promo codes', 'boolean', TRUE),
('promo', 'require_minimum_purchase', 'false', 'Require minimum purchase amount to apply promo code', 'boolean', TRUE),
('promo', 'minimum_purchase_amount', '100', 'Minimum purchase amount required for promo code application (in default currency)', 'number', TRUE),
('promo', 'allow_stacking_promos', 'false', 'Allow multiple promo codes to be stacked on single quotation', 'boolean', TRUE),
('promo', 'restrict_to_email_blast', 'true', 'Restrict promo codes only to those included in email campaigns', 'boolean', TRUE),
('promo', 'auto_disable_expired', 'true', 'Automatically disable expired promo codes', 'boolean', TRUE),
('promo', 'enable_usage_tracking', 'true', 'Track promo code usage in audit logs', 'boolean', TRUE)
ON CONFLICT (category, "key") DO NOTHING;
