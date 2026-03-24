CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  role_id INT NOT NULL REFERENCES roles(id),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  mobile VARCHAR(30) NOT NULL,
  email VARCHAR(150),
  address TEXT,
  preferred_contact_method VARCHAR(30),
  customer_type VARCHAR(30) NOT NULL,
  lead_source VARCHAR(80),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  interaction_type VARCHAR(40),
  note TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_documents (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  doc_type VARCHAR(40),
  file_name TEXT,
  file_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  plate_number VARCHAR(40) UNIQUE NOT NULL,
  conduction_sticker VARCHAR(40),
  vin_chassis VARCHAR(80),
  make VARCHAR(60) NOT NULL,
  model VARCHAR(80) NOT NULL,
  year INT,
  variant VARCHAR(80),
  color VARCHAR(40),
  odometer INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_photos (
  id SERIAL PRIMARY KEY,
  vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  photo_type VARCHAR(20) NOT NULL,
  tag VARCHAR(50),
  file_url TEXT NOT NULL,
  sale_id INT REFERENCES sales(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_service_records (
  id SERIAL PRIMARY KEY,
  vehicle_id INT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  sale_id INT REFERENCES sales(id) ON DELETE CASCADE,
  service_date TIMESTAMP NOT NULL,
  service_description TEXT,
  damage_notes TEXT,
  remarks TEXT,
  assigned_staff_id INT REFERENCES users(id),
  assigned_staff_name VARCHAR(120),
  odometer_reading INT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(50) NOT NULL,
  base_price NUMERIC(12,2) NOT NULL,
  description TEXT,
  materials_notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  reference_no VARCHAR(60) UNIQUE NOT NULL,
  doc_type VARCHAR(20) NOT NULL,
  customer_id INT NOT NULL REFERENCES customers(id),
  vehicle_id INT NOT NULL REFERENCES vehicles(id),
  service_package VARCHAR(120) NOT NULL,
  add_ons JSONB,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL,
  workflow_status VARCHAR(30) NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_name VARCHAR(120) NOT NULL,
  item_type VARCHAR(40),
  qty INT DEFAULT 1,
  price NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_type VARCHAR(30) NOT NULL,
  reference_no VARCHAR(100),
  is_deposit BOOLEAN DEFAULT FALSE,
  received_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  vehicle_id INT NOT NULL REFERENCES vehicles(id),
  service_id INT REFERENCES services(id),
  schedule_start TIMESTAMP NOT NULL,
  schedule_end TIMESTAMP,
  bay VARCHAR(40),
  installer_team VARCHAR(60),
  estimated_duration_minutes INT,
  status VARCHAR(30) NOT NULL,
  notification_channel VARCHAR(40),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id SERIAL PRIMARY KEY,
  method_name VARCHAR(40) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS discount_rules (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(80) NOT NULL,
  discount_type VARCHAR(20) NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  requires_approval BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS staff_commissions (
  id SERIAL PRIMARY KEY,
  staff_name VARCHAR(120) NOT NULL,
  service_category VARCHAR(80),
  commission_percent NUMERIC(5,2)
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id SERIAL PRIMARY KEY,
  channel VARCHAR(30) NOT NULL,
  template_name VARCHAR(80) NOT NULL,
  message_template TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(80) NOT NULL,
  entity_id INT,
  meta JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS online_quotation_requests (
  id SERIAL PRIMARY KEY,
  branch VARCHAR(120),
  full_name VARCHAR(120) NOT NULL,
  mobile VARCHAR(30) NOT NULL,
  email VARCHAR(150),

  vehicle_make VARCHAR(60) NOT NULL,
  vehicle_model VARCHAR(80),
  vehicle_plate VARCHAR(40),
  vehicle_size VARCHAR(30),

  service_id INT REFERENCES services(id) ON DELETE SET NULL,
  unit_price NUMERIC(12,2) DEFAULT 0,
  preferred_date TIMESTAMP,
  end_date TIMESTAMP,
  notes TEXT,

  status VARCHAR(30) NOT NULL DEFAULT 'New',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_online_quotation_requests_created_at ON online_quotation_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_online_quotation_requests_status ON online_quotation_requests (status);
