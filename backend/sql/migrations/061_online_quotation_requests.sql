-- Migration 061: Online quotation requests table
-- Supports guest quotation request capture and staff/admin management.

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
