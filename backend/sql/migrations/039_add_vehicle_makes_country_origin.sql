-- Migration 039: Add `country_origin` to vehicle_makes and populate master data
-- Adds country_origin column (if missing) and upserts common vehicle makes

ALTER TABLE vehicle_makes
  ADD COLUMN IF NOT EXISTS country_origin VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Upsert requested brands with country_origin and activate them
INSERT INTO vehicle_makes (name, category, country_origin, is_active, logo_url)
VALUES
('Toyota', 'Japanese', 'Japan', TRUE, '/images/vehicle-logos/toyota.png'),
('Mitsubishi', 'Japanese', 'Japan', TRUE, '/images/vehicle-logos/mitsubishi.png'),
('Nissan', 'Japanese', 'Japan', TRUE, '/images/vehicle-logos/nissan.png'),
('Honda', 'Japanese', 'Japan', TRUE, '/images/vehicle-logos/honda.png'),
('Mazda', 'Japanese', 'Japan', TRUE, '/images/vehicle-logos/mazda.png'),
('Suzuki', 'Japanese', 'Japan', TRUE, '/images/vehicle-logos/suzuki.png'),
('Isuzu', 'Japanese', 'Japan', TRUE, '/images/vehicle-logos/isuzu.png'),
('Subaru', 'Japanese', 'Japan', TRUE, '/images/vehicle-logos/subaru.png'),

('Hyundai', 'Korean', 'South Korea', TRUE, '/images/vehicle-logos/hyundai.png'),
('Kia', 'Korean', 'South Korea', TRUE, '/images/vehicle-logos/kia.png'),

('Ford', 'American', 'USA', TRUE, '/images/vehicle-logos/ford.png'),
('Chevrolet', 'American', 'USA', TRUE, '/images/vehicle-logos/chevrolet.png'),

('BMW', 'European', 'Germany', TRUE, '/images/vehicle-logos/bmw.png'),
('Mercedes-Benz', 'European', 'Germany', TRUE, '/images/vehicle-logos/mercedes.png'),
('Volkswagen', 'European', 'Germany', TRUE, '/images/vehicle-logos/volkswagen.png'),
('Porsche', 'European', 'Germany', TRUE, '/images/vehicle-logos/porsche.png'),
('Audi', 'European', 'Germany', TRUE, '/images/vehicle-logos/audi.png'),
('Peugeot', 'European', 'France', TRUE, '/images/vehicle-logos/peugeot.png'),

('Land Rover', 'European', 'United Kingdom', TRUE, '/images/vehicle-logos/landrover.png'),
('Mini', 'European', 'United Kingdom', TRUE, '/images/vehicle-logos/mini.png'),
('MG', 'Chinese', 'China', TRUE, '/images/vehicle-logos/mg.png'),

('Geely', 'Chinese', 'China', TRUE, '/images/vehicle-logos/geely.png'),
('Chery', 'Chinese', 'China', TRUE, '/images/vehicle-logos/chery.png'),
('GAC', 'Chinese', 'China', TRUE, '/images/vehicle-logos/gac.png'),
('Jetour', 'Chinese', 'China', TRUE, '/images/vehicle-logos/jetour.png'),
('Foton', 'Chinese', 'China', TRUE, '/images/vehicle-logos/foton.png'),
('BYD', 'Chinese', 'China', TRUE, '/images/vehicle-logos/byd.png'),
('JMC', 'Chinese', 'China', TRUE, '/images/vehicle-logos/jmc.png'),

('Tata', 'Other', 'India', TRUE, '/images/vehicle-logos/tata.png'),

('Volvo', 'European', 'Sweden', TRUE, '/images/vehicle-logos/volvo.png'),

('Ferrari', 'European', 'Italy', TRUE, '/images/vehicle-logos/ferrari.png'),
('Lamborghini', 'European', 'Italy', TRUE, '/images/vehicle-logos/lamborghini.png'),
('Maserati', 'European', 'Italy', TRUE, '/images/vehicle-logos/maserati.png'),

-- EV-focused
('Tesla', 'American', 'USA', TRUE, '/images/vehicle-logos/tesla.png'),
('GAC Aion', 'Chinese', 'China', TRUE, '/images/vehicle-logos/gac-aion.png')
ON CONFLICT (name) DO UPDATE
SET
  is_active = EXCLUDED.is_active,
  country_origin = COALESCE(EXCLUDED.country_origin, vehicle_makes.country_origin),
  category = COALESCE(EXCLUDED.category, vehicle_makes.category),
  logo_url = COALESCE(EXCLUDED.logo_url, vehicle_makes.logo_url),
  updated_at = NOW();
