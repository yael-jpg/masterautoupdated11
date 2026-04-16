-- Migration 083: Add message template configuration fields for Promo, PMS, and Subscription emails
-- This migration adds configurable message templates that auto-connect to email campaigns

INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
-- Promo Code Email Message Template Configuration
('promo', 'promo_enabled', 'true', 'Include promo message in email campaigns', 'boolean', TRUE),
('promo', 'promo_subject', 'Exclusive Offer — {percent}% Off Your Next Service', 'Subject line for promo emails', 'string', TRUE),
('promo', 'promo_greeting', 'Hey {customer_name}! We have an exclusive offer just for you. Use code {code} for {percent}% off your next service.', 'Opening message for promo email', 'string', TRUE),
('promo', 'promo_reminders', 'This offer is valid for {days} days only.\nMinimum purchase of ₱{min_purchase} required.\nPromo code cannot be combined with other offers.', 'Terms and conditions for promo offer (newline separated)', 'string', TRUE),
('promo', 'promo_closing', 'Don''t miss out! Claim your discount today and give your vehicle the care it deserves.', 'Closing message for promo email', 'string', TRUE),

-- PMS Email Message Template Configuration
('pms_email', 'enabled', 'true', 'Send PMS reminder emails to customers', 'boolean', TRUE),
('pms_email', 'subject', 'PMS Reminder for {plate_number}', 'Subject line for PMS reminder email', 'string', TRUE),
('pms_email', 'greeting', 'This is to remind you that your vehicle plate no. {plate_number}, availed package {package_name} is due for your next preventive maintenance service.', 'Opening message for PMS email', 'string', TRUE),
('pms_email', 'reminders', 'Delaying your PMS may affect warranty coverage.\nYour last service was at {last_service_date}.\nBook early to avoid long wait times.', 'Maintenance tips and reminders (newline separated)', 'string', TRUE),
('pms_email', 'closing', 'Book your PMS appointment today to keep your vehicle in top condition.', 'Closing message encouraging booking', 'string', TRUE),

-- Subscription Email Message Template Configuration
('subscription_email', 'enabled', 'true', 'Send subscription renewal reminder emails', 'boolean', TRUE),
('subscription_email', 'subject', 'Your {package_name} Subscription is {status} — {plate_number}', 'Subject line for subscription email (supports placeholders)', 'string', TRUE),
('subscription_email', 'greeting', 'Dear {customer_name}, your {package_name} subscription for plate {plate_number} is {status}. Renew now to maintain continuous coverage and benefits.', 'Opening message about subscription status', 'string', TRUE),
('subscription_email', 'reminders', 'Your subscription expires on {end_date}.\nRenewal takes less than 5 minutes.\nAll benefits and coverage will cease after expiration.\nEarly renewal is available anytime.', 'Key renewal points (newline separated)', 'string', TRUE),
('subscription_email', 'closing', 'Renew your subscription today and continue enjoying priority service and exclusive benefits.', 'Closing call-to-action for renewal', 'string', TRUE)
ON CONFLICT (category, "key") DO NOTHING;
