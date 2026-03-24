-- Migration 040: Reset vehicle_makes to the canonical PH brand list (PostgreSQL)
-- Deactivates every existing make, then upserts exactly the approved brands.
-- Using "deactivate all then activate approved" avoids breaking FK references
-- on vehicles that already reference a make_id.

-- Ensure country_origin column exists (idempotent)
ALTER TABLE vehicle_makes
  ADD COLUMN IF NOT EXISTS country_origin VARCHAR(50) DEFAULT NULL;

-- Step 1: Deactivate every existing brand
UPDATE vehicle_makes SET is_active = FALSE;

-- Step 2: Upsert the canonical brand list.
-- ON CONFLICT (name) re-activates and corrects any row already present.
INSERT INTO vehicle_makes (name, category, country_origin, is_active)
VALUES

-- Japanese Brands
('Toyota',     'Japanese', 'Japan',          TRUE),
('Mitsubishi', 'Japanese', 'Japan',          TRUE),
('Nissan',     'Japanese', 'Japan',          TRUE),
('Honda',      'Japanese', 'Japan',          TRUE),
('Mazda',      'Japanese', 'Japan',          TRUE),
('Suzuki',     'Japanese', 'Japan',          TRUE),
('Isuzu',      'Japanese', 'Japan',          TRUE),
('Subaru',     'Japanese', 'Japan',          TRUE),

-- Korean Brands
('Hyundai',    'Korean',   'South Korea',    TRUE),
('Kia',        'Korean',   'South Korea',    TRUE),

-- American Brands
('Ford',       'American', 'USA',            TRUE),
('Chevrolet',  'American', 'USA',            TRUE),
('Tesla',      'American', 'USA',            TRUE),

-- German Brands
('BMW',            'German',  'Germany',     TRUE),
('Mercedes-Benz',  'German',  'Germany',     TRUE),
('Volkswagen',     'German',  'Germany',     TRUE),
('Porsche',        'German',  'Germany',     TRUE),
('Audi',           'German',  'Germany',     TRUE),

-- French Brands
('Peugeot',    'French',  'France',          TRUE),

-- British Brands
('Land Rover', 'British', 'United Kingdom',  TRUE),
('Mini',       'British', 'United Kingdom',  TRUE),
('MG',         'British', 'United Kingdom',  TRUE),

-- Chinese Brands
('Geely',      'Chinese', 'China',           TRUE),
('Chery',      'Chinese', 'China',           TRUE),
('GAC',        'Chinese', 'China',           TRUE),
('Jetour',     'Chinese', 'China',           TRUE),
('Foton',      'Chinese', 'China',           TRUE),
('BYD',        'Chinese', 'China',           TRUE),
('JMC',        'Chinese', 'China',           TRUE),
('GAC Aion',   'Chinese', 'China',           TRUE),

-- Indian Brands
('Tata',       'Indian',  'India',           TRUE),

-- Swedish Brands
('Volvo',      'Swedish', 'Sweden',          TRUE),

-- Italian Brands
('Ferrari',     'Italian', 'Italy',          TRUE),
('Lamborghini', 'Italian', 'Italy',          TRUE),
('Maserati',    'Italian', 'Italy',          TRUE)

ON CONFLICT (name) DO UPDATE SET
  is_active      = EXCLUDED.is_active,
  category       = EXCLUDED.category,
  country_origin = EXCLUDED.country_origin;
