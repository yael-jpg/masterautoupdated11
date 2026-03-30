-- Configuration Management System
-- Stores global settings, business rules, and operational behavior

-- Create configuration_settings table
CREATE TABLE IF NOT EXISTS configuration_settings (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  value TEXT,
  description TEXT,
  data_type VARCHAR(20) DEFAULT 'string',
  is_editable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INT,
  updated_by INT,
  UNIQUE (category, "key"),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create configuration_audit_logs table
CREATE TABLE IF NOT EXISTS configuration_audit_logs (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by INT NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(45),
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_config_category_key ON configuration_settings(category, "key");
CREATE INDEX IF NOT EXISTS idx_audit_category_key ON configuration_audit_logs(category, "key");
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON configuration_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_changed_by ON configuration_audit_logs(changed_by);

-- Insert default configuration settings

-- A. General Settings
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('general', 'system_name', 'Master Auto', 'Main system name displayed throughout the app', 'string', TRUE),
('general', 'default_currency', 'PHP', 'Default currency for transactions', 'string', TRUE),
('general', 'time_zone', 'Asia/Manila', 'System time zone settings', 'string', TRUE),
('general', 'date_format', 'MM/DD/YYYY', 'Default date format for display', 'string', TRUE),
('general', 'system_logo_url', '/images/logo.png', 'URL to system logo', 'string', TRUE),
('general', 'system_email', 'info@masterauto.com', 'System email for notifications', 'string', TRUE),
('general', 'language', 'en', 'Default language', 'string', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- B. Business Information
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('business', 'business_name', 'Master Auto Service Center', 'Official business name', 'string', TRUE),
('business', 'business_address', '123 Auto Street, Manila', 'Business address', 'string', TRUE),
('business', 'business_contact', '+63 2 1234 5678', 'Main contact number', 'string', TRUE),
('business', 'business_email', 'contact@masterauto.com', 'Business email address', 'string', TRUE),
('business', 'tax_vat_rate', '12', 'VAT rate percentage', 'number', TRUE),
('business', 'registration_number', '', 'Business registration number', 'string', TRUE),
('business', 'operating_hours', '{"mon_fri":"9:00 AM - 6:00 PM","sat":"9:00 AM - 5:00 PM","sun":"Closed"}', 'Operating hours by day', 'json', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- C. Vehicle Configuration
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('vehicle', 'enable_vehicle_makes', 'true', 'Enable vehicle make management', 'boolean', TRUE),
('vehicle', 'enable_vehicle_models', 'true', 'Enable vehicle model management', 'boolean', TRUE),
('vehicle', 'enable_variants', 'true', 'Enable vehicle variant management', 'boolean', TRUE),
('vehicle', 'plate_validation_enabled', 'true', 'Enable plate number validation', 'boolean', TRUE),
('vehicle', 'plate_format', 'XX###XXXX|###XXXX|XXXX###|ABC1234', 'Accepted plate formats (regex patterns)', 'string', TRUE),
('vehicle', 'default_categories', '["Sedan","SUV","Hatchback","Pickup","Van"]', 'Default vehicle categories', 'json', TRUE),
('vehicle', 'allow_custom_plate', 'false', 'Allow vehicles with placeholder plates', 'boolean', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- D. Booking Rules
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('booking', 'enable_guest_booking', 'false', 'Allow bookings without customer registration', 'boolean', TRUE),
('booking', 'allow_cancel_after_partial_payment', 'true', 'Allow cancellation after partial payment', 'boolean', TRUE),
('booking', 'allow_edit_after_approval', 'false', 'Allow editing booking details after approval', 'boolean', TRUE),
('booking', 'auto_complete_when_paid', 'false', 'Auto-mark booking as completed when fully paid', 'boolean', TRUE),
('booking', 'auto_cancel_unpaid_hours', '48', 'Hours to wait before auto-cancelling unpaid bookings', 'number', TRUE),
('booking', 'minimum_booking_notice', '24', 'Minimum hours notice required to book', 'number', TRUE),
('booking', 'allow_multiple_services', 'true', 'Allow multiple services in single booking', 'boolean', TRUE),
('booking', 'require_phone_verification', 'false', 'Require phone verification for guest bookings', 'boolean', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- E. Payment Configuration
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('payment', 'enable_partial_payments', 'true', 'Enable partial/installment payments', 'boolean', TRUE),
('payment', 'minimum_down_payment_percentage', '30', 'Minimum down payment as percentage of total', 'number', TRUE),
('payment', 'accepted_payment_methods', '["Cash","Credit Card","Debit Card","Bank Transfer","GCash","PayMaya"]', 'List of accepted payment methods', 'json', TRUE),
('payment', 'enable_refunds', 'true', 'Enable refund processing', 'boolean', TRUE),
('payment', 'refund_eligibility_days', '30', 'Days after payment to allow refunds', 'number', TRUE),
('payment', 'payment_due_days', '30', 'Days after booking for full payment due', 'number', TRUE),
('payment', 'enable_online_payment', 'false', 'Enable online payment gateway integration', 'boolean', TRUE),
('payment', 'online_payment_provider', '', 'Online payment provider (Stripe, PayMongo, etc)', 'string', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- F. Sales Configuration
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('sales', 'include_archived_in_reports', 'false', 'Include archived records in sales reports', 'boolean', TRUE),
('sales', 'default_service_pricing', '{"labor_cost":"hourly","parts_markup":"25"}', 'Default pricing rules for services', 'json', TRUE),
('sales', 'calculate_daily_sales', 'true', 'Auto-calculate daily sales summary', 'boolean', TRUE),
('sales', 'report_generation_time', '00:00', 'Time to generate daily reports (HH:MM format)', 'string', TRUE),
('sales', 'enable_sales_targets', 'false', 'Enable sales target tracking', 'boolean', TRUE),
('sales', 'sales_target_amount', '0', 'Monthly sales target amount', 'number', TRUE),
('sales', 'tax_calculation_method', 'inclusive', 'Tax calculation: inclusive or exclusive', 'string', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- G. User Roles & Permissions
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('roles', 'roles_definition', '[{"role":"Admin","permissions":["all"]},{"role":"Mechanic","permissions":["appointments","services_assign"]},{"role":"Cashier","permissions":["payments","invoices"]},{"role":"Manager","permissions":["reports","sales","staff"]}]', 'Role definitions and permissions', 'json', TRUE),
('roles', 'require_two_factor_auth', 'false', 'Require two-factor authentication for admin', 'boolean', TRUE),
('roles', 'session_timeout_minutes', '30', 'Auto logout after inactivity (minutes)', 'number', TRUE),
('roles', 'max_login_attempts', '5', 'Maximum failed login attempts before lockout', 'number', TRUE),
('roles', 'password_expiry_days', '90', 'Force password change after N days (0 = disabled)', 'number', TRUE)
ON CONFLICT (category, "key") DO NOTHING;

-- H. System Logs (Status only - not editable)
INSERT INTO configuration_settings (category, "key", value, description, data_type, is_editable) VALUES
('system', 'enable_audit_logging', 'true', 'Enable audit trail logging', 'boolean', TRUE),
('system', 'log_retention_days', '365', 'Retain audit logs for N days', 'number', TRUE),
('system', 'enable_error_logging', 'true', 'Enable error logging', 'boolean', TRUE),
('system', 'database_backup_enabled', 'true', 'Enable automatic database backups', 'boolean', FALSE),
('system', 'last_backup_date', NULL, 'Timestamp of last backup', 'string', FALSE),
('system', 'system_version', '1.0.0', 'Current system version', 'string', FALSE),
('system', 'system_status', 'operational', 'Current system status', 'string', FALSE)
ON CONFLICT (category, "key") DO NOTHING;
