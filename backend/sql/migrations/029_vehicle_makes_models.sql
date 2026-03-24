-- Migration 029: Vehicle Makes and Models System
-- Complete vehicle management system for Philippine booking platform

-- ==========================================
-- 1. Vehicle Makes Table
-- ==========================================
CREATE TABLE IF NOT EXISTS vehicle_makes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  category ENUM('Japanese', 'Korean', 'American', 'European', 'Chinese', 'Other') NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  logo_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_active (is_active),
  FULLTEXT INDEX ft_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 2. Vehicle Models Table
-- ==========================================
CREATE TABLE IF NOT EXISTS vehicle_models (
  id INT PRIMARY KEY AUTO_INCREMENT,
  make_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  year_from INT,
  year_to INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (make_id) REFERENCES vehicle_makes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_model (make_id, name),
  INDEX idx_make_id (make_id),
  INDEX idx_active (is_active),
  FULLTEXT INDEX ft_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 3. Vehicle Variants Table
-- ==========================================
CREATE TABLE IF NOT EXISTS vehicle_variants (
  id INT PRIMARY KEY AUTO_INCREMENT,
  model_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  body_type VARCHAR(50),
  fuel_type VARCHAR(50),
  transmission VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (model_id) REFERENCES vehicle_models(id) ON DELETE CASCADE,
  UNIQUE KEY unique_variant (model_id, name),
  INDEX idx_model_id (model_id),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 4. Update Vehicles Table (if not already migrated)
-- ==========================================
-- NOTE: Update existing vehicles table to use these relationships
-- ALTER TABLE vehicles ADD COLUMN make_id INT AFTER customer_id;
-- ALTER TABLE vehicles ADD COLUMN model_id INT AFTER make_id;
-- ALTER TABLE vehicles ADD COLUMN variant_id INT AFTER model_id;
-- ALTER TABLE vehicles ADD COLUMN custom_make VARCHAR(100) AFTER variant_id;
-- ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_make FOREIGN KEY (make_id) REFERENCES vehicle_makes(id) ON DELETE SET NULL;
-- ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_model FOREIGN KEY (model_id) REFERENCES vehicle_models(id) ON DELETE SET NULL;
-- ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_variant FOREIGN KEY (variant_id) REFERENCES vehicle_variants(id) ON DELETE SET NULL;

-- ==========================================
-- 5. Normalize Plate Numbers
-- ==========================================
-- If vehicles table exists, add normalization
-- UPDATE vehicles SET plate_number = UPPER(TRIM(REPLACE(REPLACE(plate_number, '-', ''), ' ', ''))) WHERE plate_number IS NOT NULL;

-- ==========================================
-- 6. Create Indexes for Performance
-- ==========================================
-- CREATE INDEX idx_vehicles_make ON vehicles(make_id);
-- CREATE INDEX idx_vehicles_model ON vehicles(model_id);
-- CREATE INDEX idx_vehicles_variant ON vehicles(variant_id);
-- CREATE INDEX idx_vehicles_customer ON vehicles(customer_id);
-- CREATE UNIQUE INDEX idx_plate_unique ON vehicles(plate_number) WHERE plate_number IS NOT NULL;

-- ==========================================
-- 7. Insert Philippine Popular Vehicle Makes
-- ==========================================
INSERT INTO vehicle_makes (name, category, logo_url) VALUES
-- Japanese Brands
('Toyota', 'Japanese', '/images/vehicle-logos/toyota.png'),
('Honda', 'Japanese', '/images/vehicle-logos/honda.png'),
('Mitsubishi', 'Japanese', '/images/vehicle-logos/mitsubishi.png'),
('Nissan', 'Japanese', '/images/vehicle-logos/nissan.png'),
('Suzuki', 'Japanese', '/images/vehicle-logos/suzuki.png'),
('Mazda', 'Japanese', '/images/vehicle-logos/mazda.png'),
('Subaru', 'Japanese', '/images/vehicle-logos/subaru.png'),
('Isuzu', 'Japanese', '/images/vehicle-logos/isuzu.png'),
('Daihatsu', 'Japanese', '/images/vehicle-logos/daihatsu.png'),
('Yamaha', 'Japanese', NULL),

-- Korean Brands
('Hyundai', 'Korean', '/images/vehicle-logos/hyundai.png'),
('Kia', 'Korean', '/images/vehicle-logos/kia.png'),

-- American Brands
('Ford', 'American', '/images/vehicle-logos/ford.png'),
('Chevrolet', 'American', '/images/vehicle-logos/chevrolet.png'),
('GMC', 'American', '/images/vehicle-logos/gmc.png'),
('Jeep', 'American', '/images/vehicle-logos/jeep.png'),

-- European Brands
('BMW', 'European', '/images/vehicle-logos/bmw.png'),
('Mercedes-Benz', 'European', '/images/vehicle-logos/mercedes.png'),
('Audi', 'European', '/images/vehicle-logos/audi.png'),
('Volkswagen', 'European', '/images/vehicle-logos/volkswagen.png'),
('Porsche', 'European', '/images/vehicle-logos/porsche.png'),
('Volvo', 'European', '/images/vehicle-logos/volvo.png'),
('Lexus', 'European', '/images/vehicle-logos/lexus.png'),
('Renault', 'European', '/images/vehicle-logos/renault.png'),

-- Chinese Brands
('MG', 'Chinese', '/images/vehicle-logos/mg.png'),
('Geely', 'Chinese', '/images/vehicle-logos/geely.png'),
('Chery', 'Chinese', '/images/vehicle-logos/chery.png'),
('Foton', 'Chinese', '/images/vehicle-logos/foton.png'),
('GAC', 'Chinese', '/images/vehicle-logos/gac.png'),
('BYD', 'Chinese', '/images/vehicle-logos/byd.png'),

-- Other/Luxury
('Other (Specify)', 'Other', NULL)
ON DUPLICATE KEY UPDATE is_active = TRUE;

-- ==========================================
-- 8. Insert Sample Models for Popular Brands
-- ==========================================
-- Toyota Models
INSERT INTO vehicle_models (make_id, name, year_from, year_to, is_active) VALUES
((SELECT id FROM vehicle_makes WHERE name = 'Toyota'), 'Vios', 2003, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Toyota'), 'Corolla', 1966, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Toyota'), 'Fortuner', 2004, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Toyota'), 'Hiace', 1967, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Toyota'), 'Innova', 2004, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Toyota'), 'Camry', 1982, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Toyota'), 'Avanza', 2003, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Toyota'), 'Wigo', 2009, NULL, TRUE),

-- Honda Models
((SELECT id FROM vehicle_makes WHERE name = 'Honda'), 'City', 1997, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Honda'), 'Civic', 1972, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Honda'), 'CR-V', 1995, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Honda'), 'Accord', 1976, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Honda'), 'Jazz', 2001, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Honda'), 'Odyssey', 1994, NULL, TRUE),

-- Mitsubishi Models
((SELECT id FROM vehicle_makes WHERE name = 'Mitsubishi'), 'Mirage', 1988, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Mitsubishi'), 'Lancer', 1973, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Mitsubishi'), 'Montero', 1981, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Mitsubishi'), 'Pajero', 1981, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Mitsubishi'), 'Outlander', 2001, NULL, TRUE),

-- Nissan Models
((SELECT id FROM vehicle_makes WHERE name = 'Nissan'), 'Almera', 1995, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Nissan'), 'Sentra', 1982, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Nissan'), 'Navara', 1997, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Nissan'), 'X-Trail', 2000, NULL, TRUE),

-- Hyundai Models
((SELECT id FROM vehicle_makes WHERE name = 'Hyundai'), 'Accent', 1994, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Hyundai'), 'Elantra', 1990, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Hyundai'), 'Tucson', 2004, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Hyundai'), 'Santa Fe', 2000, NULL, TRUE),

-- Kia Models
((SELECT id FROM vehicle_makes WHERE name = 'Kia'), 'Soluto', 2011, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Kia'), 'Picanto', 2004, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Kia'), 'Cerato', 2003, NULL, TRUE),
((SELECT id FROM vehicle_makes WHERE name = 'Kia'), 'Sportage', 1993, NULL, TRUE);

-- ==========================================
-- 9. Insert Sample Variants for Some Models
-- ==========================================
-- Toyota Vios Variants
INSERT INTO vehicle_variants (model_id, name, body_type, fuel_type, transmission) VALUES
((SELECT id FROM vehicle_models WHERE name = 'Vios' AND make_id = (SELECT id FROM vehicle_makes WHERE name = 'Toyota')), 'Manual 1.3', 'Sedan', 'Gasoline', 'Manual'),
((SELECT id FROM vehicle_models WHERE name = 'Vios' AND make_id = (SELECT id FROM vehicle_makes WHERE name = 'Toyota')), 'Automatic 1.5', 'Sedan', 'Gasoline', 'Automatic'),
((SELECT id FROM vehicle_models WHERE name = 'Vios' AND make_id = (SELECT id FROM vehicle_makes WHERE name = 'Toyota')), 'Hybrid', 'Sedan', 'Hybrid', 'Automatic');

-- Honda City Variants
INSERT INTO vehicle_variants (model_id, name, body_type, fuel_type, transmission) VALUES
((SELECT id FROM vehicle_models WHERE name = 'City' AND make_id = (SELECT id FROM vehicle_makes WHERE name = 'Honda')), 'Manual 1.5', 'Sedan', 'Gasoline', 'Manual'),
((SELECT id FROM vehicle_models WHERE name = 'City' AND make_id = (SELECT id FROM vehicle_makes WHERE name = 'Honda')), 'Automatic 1.5', 'Sedan', 'Gasoline', 'Automatic');

-- ==========================================
-- 10. View for Easy Querying
-- ==========================================
CREATE OR REPLACE VIEW v_vehicle_catalog AS
SELECT 
  vm.id AS make_id,
  vm.name AS make,
  vm.category,
  vmodel.id AS model_id,
  vmodel.name AS model,
  vmodel.year_from,
  vmodel.year_to,
  vv.id AS variant_id,
  vv.name AS variant,
  vv.body_type,
  vv.fuel_type,
  vv.transmission
FROM vehicle_makes vm
LEFT JOIN vehicle_models vmodel ON vm.id = vmodel.make_id AND vmodel.is_active = TRUE
LEFT JOIN vehicle_variants vv ON vmodel.id = vv.model_id AND vv.is_active = TRUE
WHERE vm.is_active = TRUE
ORDER BY vm.category, vm.name, vmodel.name, vv.name;
