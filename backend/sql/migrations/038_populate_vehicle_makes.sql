-- Migration 038: Populate Vehicle Makes master data
-- Inserts commonly available car brands (Philippines-focused).
-- Idempotent: uses ON DUPLICATE KEY UPDATE to avoid duplicates and to re-activate existing rows.

INSERT INTO vehicle_makes (name, category, is_active, logo_url) VALUES
-- Japanese Brands
('Toyota', 'Japanese', TRUE, '/images/vehicle-logos/toyota.png'),
('Mitsubishi', 'Japanese', TRUE, '/images/vehicle-logos/mitsubishi.png'),
('Nissan', 'Japanese', TRUE, '/images/vehicle-logos/nissan.png'),
('Honda', 'Japanese', TRUE, '/images/vehicle-logos/honda.png'),
('Mazda', 'Japanese', TRUE, '/images/vehicle-logos/mazda.png'),
('Suzuki', 'Japanese', TRUE, '/images/vehicle-logos/suzuki.png'),
('Isuzu', 'Japanese', TRUE, '/images/vehicle-logos/isuzu.png'),
('Subaru', 'Japanese', TRUE, '/images/vehicle-logos/subaru.png'),

-- Korean Brands
('Hyundai', 'Korean', TRUE, '/images/vehicle-logos/hyundai.png'),
('Kia', 'Korean', TRUE, '/images/vehicle-logos/kia.png'),

-- American Brands
('Ford', 'American', TRUE, '/images/vehicle-logos/ford.png'),
('Chevrolet', 'American', TRUE, '/images/vehicle-logos/chevrolet.png'),

-- German / European Brands
('BMW', 'European', TRUE, '/images/vehicle-logos/bmw.png'),
('Mercedes-Benz', 'European', TRUE, '/images/vehicle-logos/mercedes.png'),
('Volkswagen', 'European', TRUE, '/images/vehicle-logos/volkswagen.png'),
('Porsche', 'European', TRUE, '/images/vehicle-logos/porsche.png'),
('Audi', 'European', TRUE, '/images/vehicle-logos/audi.png'),
('Peugeot', 'European', TRUE, '/images/vehicle-logos/peugeot.png'),
('Land Rover', 'European', TRUE, '/images/vehicle-logos/landrover.png'),
('Mini', 'European', TRUE, '/images/vehicle-logos/mini.png'),
('MG', 'European', TRUE, '/images/vehicle-logos/mg.png'),
('Volvo', 'European', TRUE, '/images/vehicle-logos/volvo.png'),
('Ferrari', 'European', TRUE, '/images/vehicle-logos/ferrari.png'),
('Lamborghini', 'European', TRUE, '/images/vehicle-logos/lamborghini.png'),
('Maserati', 'European', TRUE, '/images/vehicle-logos/maserati.png'),

-- Chinese Brands
('Geely', 'Chinese', TRUE, '/images/vehicle-logos/geely.png'),
('Chery', 'Chinese', TRUE, '/images/vehicle-logos/chery.png'),
('GAC', 'Chinese', TRUE, '/images/vehicle-logos/gac.png'),
('Jetour', 'Chinese', TRUE, '/images/vehicle-logos/jetour.png'),
('Foton', 'Chinese', TRUE, '/images/vehicle-logos/foton.png'),
('BYD', 'Chinese', TRUE, '/images/vehicle-logos/byd.png'),
('JMC', 'Chinese', TRUE, '/images/vehicle-logos/jmc.png'),

-- Indian
('Tata', 'Other', TRUE, '/images/vehicle-logos/tata.png'),

-- EV / Special
('Tesla', 'American', TRUE, '/images/vehicle-logos/tesla.png'),
('GAC Aion', 'Chinese', TRUE, '/images/vehicle-logos/gac-aion.png')

ON DUPLICATE KEY UPDATE
  is_active = VALUES(is_active),
  category = VALUES(category),
  logo_url = COALESCE(VALUES(logo_url), vehicle_makes.logo_url),
  updated_at = CURRENT_TIMESTAMP;
