-- Migration 037: Add campaign default subject/name/audience/scheduled_at settings

INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('email', 'default_campaign_name', 'Promo Campaign', 'Default campaign name used in quick blasts', 'string', TRUE),
('email', 'default_campaign_subject', 'Exclusive Offer from MasterAuto', 'Default subject line for campaign emails', 'string', TRUE),
('email', 'default_audience', 'ALL', 'Default audience for quick blasts (ALL|VIP|FIRST_TIME|INACTIVE)', 'string', TRUE),
('email', 'default_scheduled_at', '', 'Default scheduled send datetime for campaigns (ISO string)', 'string', TRUE)
ON CONFLICT (category, "key") DO NOTHING;
