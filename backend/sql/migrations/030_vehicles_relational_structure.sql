-- Migration 030: Vehicle Registration Relational Structure
-- Updates vehicles table to use foreign keys instead of text fields
-- Enforces data integrity through cascade relationships

-- ==========================================
-- 1. Add Foreign Key Columns to vehicles Table
-- ==========================================
ALTER TABLE vehicles ADD COLUMN make_id INT AFTER customer_id;
ALTER TABLE vehicles ADD COLUMN model_id INT AFTER make_id;
ALTER TABLE vehicles ADD COLUMN variant_id INT AFTER model_id;
ALTER TABLE vehicles ADD COLUMN custom_make VARCHAR(100) AFTER variant_id;
ALTER TABLE vehicles ADD COLUMN custom_model VARCHAR(100) AFTER custom_make;

-- ==========================================
-- 2. Add Foreign Key Constraints
-- ==========================================
ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_make 
  FOREIGN KEY (make_id) REFERENCES vehicle_makes(id) ON DELETE SET NULL;

ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_model 
  FOREIGN KEY (model_id) REFERENCES vehicle_models(id) ON DELETE SET NULL;

ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_variant 
  FOREIGN KEY (variant_id) REFERENCES vehicle_variants(id) ON DELETE SET NULL;

-- ==========================================
-- 3. Create Indexes for Performance
-- ==========================================
CREATE INDEX idx_vehicles_make ON vehicles(make_id);
CREATE INDEX idx_vehicles_model ON vehicles(model_id);
CREATE INDEX idx_vehicles_variant ON vehicles(variant_id);
CREATE INDEX idx_vehicles_customer ON vehicles(customer_id);
CREATE UNIQUE INDEX idx_plate_unique ON vehicles(plate_number);

-- ==========================================
-- 4. Data Migration: Match existing text data to IDs
-- ==========================================
-- This handles the migration from text-based make/model/variant to relational
-- For exact matches, populate the IDs automatically
-- For non-matching data, preserve in custom fields

-- Update makes where text matches exactly
UPDATE vehicles v
SET v.make_id = vm.id
FROM vehicle_makes vm
WHERE LOWER(TRIM(v.make)) = LOWER(TRIM(vm.name))
  AND v.make_id IS NULL;

-- Update models where make_id was found and model text matches
UPDATE vehicles v
SET v.model_id = vmodel.id
FROM vehicle_models vmodel
WHERE v.make_id = vmodel.make_id
  AND LOWER(TRIM(v.model)) = LOWER(TRIM(vmodel.name))
  AND v.model_id IS NULL;

-- Update variants where model_id was found and variant text matches
UPDATE vehicles v
SET v.variant_id = vvt.id
FROM vehicle_variants vvt
WHERE v.model_id = vvt.model_id
  AND LOWER(TRIM(v.variant)) = LOWER(TRIM(vvt.name))
  AND v.variant_id IS NULL;

-- Store unmatched make names in custom_make
UPDATE vehicles
SET custom_make = make
WHERE make_id IS NULL
  AND make IS NOT NULL
  AND make != '';

-- Store unmatched model names in custom_model
UPDATE vehicles
SET custom_model = model
WHERE model_id IS NULL
  AND model IS NOT NULL
  AND model != '';

-- ==========================================
-- 5. Create Log Table for Migration Audit
-- ==========================================
CREATE TABLE IF NOT EXISTS migration_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  migration_name VARCHAR(100),
  status VARCHAR(20),
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  message TEXT,
  records_affected INT
);

-- Log this migration
INSERT INTO migration_log (migration_name, status, message, records_affected)
SELECT 
  '030_vehicles_relational_structure',
  'completed',
  CONCAT(
    'Migrated vehicles to use foreign keys. ',
    'Matched IDs: ', COALESCE(SUM(CASE WHEN make_id IS NOT NULL THEN 1 ELSE 0 END), 0),
    ', Unmatched: ', COALESCE(SUM(CASE WHEN make_id IS NULL THEN 1 ELSE 0 END), 0)
  ),
  COUNT(*)
FROM vehicles;

-- ==========================================
-- 6. View for Easy Vehicle Querying with Details
-- ==========================================
CREATE OR REPLACE VIEW v_vehicles_detailed AS
SELECT 
  v.id AS vehicle_id,
  v.customer_id,
  -- Make Details
  COALESCE(vm.id, NULL) AS make_id,
  COALESCE(vm.name, v.custom_make) AS make_name,
  vm.category AS make_category,
  -- Model Details
  COALESCE(vmod.id, NULL) AS model_id,
  COALESCE(vmod.name, v.custom_model) AS model_name,
  -- Variant Details
  COALESCE(vvt.id, NULL) AS variant_id,
  COALESCE(vvt.name, v.variant) AS variant_name,
  vvt.body_type,
  vvt.fuel_type,
  vvt.transmission,
  -- Vehicle Info
  v.plate_number,
  v.year,
  v.color,
  v.odometer,
  v.created_at,
  v.updated_at
FROM vehicles v
LEFT JOIN vehicle_makes vm ON v.make_id = vm.id
LEFT JOIN vehicle_models vmod ON v.model_id = vmod.id
LEFT JOIN vehicle_variants vvt ON v.variant_id = vvt.id
ORDER BY v.customer_id, v.created_at DESC;

-- ==========================================
-- 7. Trigger: Prevent Invalid Model Selection
-- ==========================================
-- Ensure selected model belongs to selected make
DELIMITER //
CREATE TRIGGER tr_vehicles_model_validation BEFORE INSERT ON vehicles
FOR EACH ROW
BEGIN
  IF NEW.model_id IS NOT NULL AND NEW.make_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM vehicle_models 
      WHERE id = NEW.model_id AND make_id = NEW.make_id
    ) THEN
      SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = 'Selected model does not belong to selected make';
    END IF;
  END IF;
END //

CREATE TRIGGER tr_vehicles_model_validation_update BEFORE UPDATE ON vehicles
FOR EACH ROW
BEGIN
  IF NEW.model_id IS NOT NULL AND NEW.make_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM vehicle_models 
      WHERE id = NEW.model_id AND make_id = NEW.make_id
    ) THEN
      SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = 'Selected model does not belong to selected make';
    END IF;
  END IF;
END //

-- Ensure selected variant belongs to selected model
CREATE TRIGGER tr_vehicles_variant_validation BEFORE INSERT ON vehicles
FOR EACH ROW
BEGIN
  IF NEW.variant_id IS NOT NULL AND NEW.model_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM vehicle_variants 
      WHERE id = NEW.variant_id AND model_id = NEW.model_id
    ) THEN
      SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = 'Selected variant does not belong to selected model';
    END IF;
  END IF;
END //

CREATE TRIGGER tr_vehicles_variant_validation_update BEFORE UPDATE ON vehicles
FOR EACH ROW
BEGIN
  IF NEW.variant_id IS NOT NULL AND NEW.model_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM vehicle_variants 
      WHERE id = NEW.variant_id AND model_id = NEW.model_id
    ) THEN
      SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = 'Selected variant does not belong to selected model';
    END IF;
  END IF;
END //

DELIMITER ;

-- ==========================================
-- 8. Prevent Deletion of Makes in Use
-- ==========================================
-- Update the vehicle_makes table to support soft delete
-- Add status column if not exists
ALTER TABLE vehicle_makes MODIFY COLUMN is_active BOOLEAN DEFAULT TRUE;

-- ==========================================
-- 9. Create Procedure to Check Make Usage
-- ==========================================
DELIMITER //
CREATE PROCEDURE sp_check_make_usage(IN p_make_id INT, OUT p_count INT)
BEGIN
  SELECT COUNT(*) INTO p_count
  FROM vehicles
  WHERE make_id = p_make_id;
END //
DELIMITER ;

-- ==========================================
-- 10. Create Procedure to Check Model Usage
-- ==========================================
DELIMITER //
CREATE PROCEDURE sp_check_model_usage(IN p_model_id INT, OUT p_count INT)
BEGIN
  SELECT COUNT(*) INTO p_count
  FROM vehicles
  WHERE model_id = p_model_id;
END //
DELIMITER ;

-- ==========================================
-- 11. Create Procedure to Check Variant Usage
-- ==========================================
DELIMITER //
CREATE PROCEDURE sp_check_variant_usage(IN p_variant_id INT, OUT p_count INT)
BEGIN
  SELECT COUNT(*) INTO p_variant_id
  FROM vehicles
  WHERE variant_id = p_variant_id;
END //
DELIMITER ;
