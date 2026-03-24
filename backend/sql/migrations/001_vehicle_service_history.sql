-- Migration: Add comprehensive vehicle service history tracking
-- Date: 2026-02-18
-- Description: Adds service records table for damage tracking, remarks, and enhanced photo support

-- Add sale_id column to vehicle_photos if not exists
ALTER TABLE vehicle_photos 
ADD COLUMN IF NOT EXISTS sale_id INT REFERENCES sales(id) ON DELETE CASCADE;

-- Create vehicle_service_records table for comprehensive tracking
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vehicle_service_records_vehicle_id 
  ON vehicle_service_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_service_records_sale_id 
  ON vehicle_service_records(sale_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_service_records_service_date 
  ON vehicle_service_records(service_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_photos_sale_id 
  ON vehicle_photos(sale_id);

-- Add comments for documentation
COMMENT ON TABLE vehicle_service_records IS 'Comprehensive service history records with damage tracking and remarks';
COMMENT ON COLUMN vehicle_service_records.damage_notes IS 'Documentation of any damage found during service';
COMMENT ON COLUMN vehicle_service_records.remarks IS 'General notes and observations about the service';
COMMENT ON COLUMN vehicle_photos.sale_id IS 'Links photos to specific sales/service transactions';
