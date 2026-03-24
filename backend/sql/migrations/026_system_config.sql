-- 026: System Configuration Management
-- Stores global settings, business rules, and operational behavior.
-- All changes are logged in config_change_logs for full audit trail.

-- ── Main config store ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
  id           SERIAL PRIMARY KEY,
  category     VARCHAR(60)  NOT NULL,
  key          VARCHAR(100) NOT NULL,
  value        TEXT,
  label        VARCHAR(200),
  description  TEXT,
  value_type   VARCHAR(30)  NOT NULL DEFAULT 'string', -- string|boolean|integer|float|json
  updated_by   INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMP    DEFAULT NOW(),
  UNIQUE(category, key)
);

-- ── Immutable change log (no DELETE allowed via app layer) ────────────────
CREATE TABLE IF NOT EXISTS config_change_logs (
  id               SERIAL PRIMARY KEY,
  category         VARCHAR(60)  NOT NULL,
  config_key       VARCHAR(100) NOT NULL,
  old_value        TEXT,
  new_value        TEXT,
  changed_by       INT REFERENCES users(id) ON DELETE SET NULL,
  changed_by_name  VARCHAR(200),
  ip_address       VARCHAR(45),
  changed_at       TIMESTAMP    DEFAULT NOW()
);

-- Prevent deletes on config_change_logs (rule-based guard)
CREATE OR REPLACE RULE no_delete_config_logs AS
  ON DELETE TO config_change_logs DO INSTEAD NOTHING;

-- ── Default seed values ───────────────────────────────────────────────────

-- A. General Settings
INSERT INTO system_config (category, key, value, label, description, value_type) VALUES
  ('general', 'system_name',  'Master Auto',  'System Name',       'Display name of the system',           'string'),
  ('general', 'currency',     'PHP',          'Default Currency',  'ISO 4217 currency code',               'string'),
  ('general', 'timezone',     'Asia/Manila',  'Time Zone',         'System time zone identifier',          'string'),
  ('general', 'date_format',  'MM/DD/YYYY',   'Date Format',       'Default date display format',          'string')
ON CONFLICT (category, key) DO NOTHING;

-- B. Business Information
INSERT INTO system_config (category, key, value, label, description, value_type) VALUES
  ('business', 'business_name',    'Master Auto',        'Business Name',    'Legal/registered business name',    'string'),
  ('business', 'address',          '',                   'Address',          'Full business address',             'string'),
  ('business', 'contact_number',   '',                   'Contact Number',   'Primary contact number',            'string'),
  ('business', 'email',            '',                   'Business Email',   'Primary business email',            'string'),
  ('business', 'tax_rate',         '12',                 'Tax / VAT Rate (%)', 'Applicable VAT/tax percentage',   'float')
ON CONFLICT (category, key) DO NOTHING;

-- C. Vehicle Configuration
INSERT INTO system_config (category, key, value, label, description, value_type) VALUES
  ('vehicle', 'plate_validation_enabled', 'true',
   'Enable Plate Number Validation', 'Validate plate numbers against PH LTO format', 'boolean'),
  ('vehicle', 'default_categories',
   '["Sedan","SUV","Pickup","Van","Hatchback","Motorcycle","Truck","Bus"]',
   'Default Vehicle Categories', 'Default categories for vehicle classification', 'json')
ON CONFLICT (category, key) DO NOTHING;

-- D. Booking Rules
INSERT INTO system_config (category, key, value, label, description, value_type) VALUES
  ('booking', 'allow_cancel_partial_payment', 'true',
   'Allow Cancellation After Partial Payment',
   'Can bookings be cancelled after a partial payment has been made', 'boolean'),
  ('booking', 'auto_complete_when_paid', 'true',
   'Auto-Mark Booking as Completed When Fully Paid',
   'Automatically mark bookings as complete once full payment is received', 'boolean'),
  ('booking', 'allow_edit_after_approval', 'false',
   'Allow Editing After Approval',
   'Allow staff to edit booking details after approval has been given', 'boolean'),
  ('booking', 'enable_guest_booking', 'false',
   'Enable Guest Booking',
   'Allow service bookings without a registered customer account', 'boolean'),
  ('booking', 'auto_cancel_unpaid_hours', '24',
   'Auto-Cancel Unpaid Bookings After (Hours)',
   'Number of hours before auto-cancelling unpaid bookings. Set 0 to disable.', 'integer')
ON CONFLICT (category, key) DO NOTHING;

-- E. Payment Configuration
INSERT INTO system_config (category, key, value, label, description, value_type) VALUES
  ('payment', 'enable_partial_payments', 'true',
   'Enable Partial Payments',
   'Allow customers to pay in partial installments', 'boolean'),
  ('payment', 'min_downpayment_percent', '30',
   'Minimum Down Payment (%)',
   'Minimum percentage required as down payment', 'float'),
  ('payment', 'accepted_methods',
   '["Cash","GCash","Bank Transfer","Check","Credit Card"]',
   'Accepted Payment Methods',
   'List of active payment method options', 'json'),
  ('payment', 'refund_rules',
   'Refunds are processed within 3–5 business days after approval.',
   'Refund Policy',
   'Refund policy displayed to customers and staff', 'string')
ON CONFLICT (category, key) DO NOTHING;

-- F. Sales Configuration
INSERT INTO system_config (category, key, value, label, description, value_type) VALUES
  ('sales', 'include_archived_in_reports', 'false',
   'Include Archived Records in Reports',
   'Include archived sales/booking records when generating reports', 'boolean'),
  ('sales', 'daily_sales_behavior', 'invoice_date',
   'Daily Sales Calculation Behavior',
   'Base daily sales on: invoice_date or payment_date', 'string'),
  ('sales', 'default_pricing_rule', 'standard',
   'Default Service Pricing Rule',
   'Pricing rule applied by default when creating services', 'string')
ON CONFLICT (category, key) DO NOTHING;
