-- 024: Vehicle makes reference table + models support
-- Keeps vehicles.make as VARCHAR for backward compatibility
-- Adds vehicle_makes as a reference/lookup table
-- Adds vehicle_models for dynamic model dropdown
-- Adds custom_make to vehicles for "Other (Specify)"

CREATE TABLE IF NOT EXISTS vehicle_makes (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(60) UNIQUE NOT NULL,
  category VARCHAR(40),
  sort_order INT DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_models (
  id       SERIAL PRIMARY KEY,
  make_id  INT NOT NULL REFERENCES vehicle_makes(id) ON DELETE CASCADE,
  name     VARCHAR(80) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(make_id, name)
);

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS custom_make VARCHAR(80);

-- ── Seed: Philippine common vehicle brands ──────────────────────────────

-- Japanese
INSERT INTO vehicle_makes (name, category, sort_order) VALUES
  ('Toyota',     'Japanese', 1),
  ('Honda',      'Japanese', 2),
  ('Mitsubishi', 'Japanese', 3),
  ('Nissan',     'Japanese', 4),
  ('Suzuki',     'Japanese', 5),
  ('Mazda',      'Japanese', 6),
  ('Subaru',     'Japanese', 7),
  ('Isuzu',      'Japanese', 8)
ON CONFLICT (name) DO NOTHING;

-- Korean
INSERT INTO vehicle_makes (name, category, sort_order) VALUES
  ('Hyundai', 'Korean', 10),
  ('Kia',     'Korean', 11)
ON CONFLICT (name) DO NOTHING;

-- American / European
INSERT INTO vehicle_makes (name, category, sort_order) VALUES
  ('Ford',         'American / European', 20),
  ('Chevrolet',    'American / European', 21),
  ('Volkswagen',   'American / European', 22),
  ('BMW',          'American / European', 23),
  ('Mercedes-Benz','American / European', 24),
  ('Audi',         'American / European', 25),
  ('Porsche',      'American / European', 26),
  ('Lexus',        'American / European', 27),
  ('Volvo',        'American / European', 28),
  ('Jeep',         'American / European', 29)
ON CONFLICT (name) DO NOTHING;

-- Chinese / Newer Brands
INSERT INTO vehicle_makes (name, category, sort_order) VALUES
  ('MG',    'Chinese / Newer', 40),
  ('Geely', 'Chinese / Newer', 41),
  ('Chery', 'Chinese / Newer', 42),
  ('Foton', 'Chinese / Newer', 43),
  ('GAC',   'Chinese / Newer', 44),
  ('BYD',   'Chinese / Newer', 45),
  ('Changan','Chinese / Newer', 46),
  ('JAC',   'Chinese / Newer', 47)
ON CONFLICT (name) DO NOTHING;

-- Other (catch-all)
INSERT INTO vehicle_makes (name, category, sort_order) VALUES
  ('Other', NULL, 999)
ON CONFLICT (name) DO NOTHING;

-- ── Seed: Common models per top makes ───────────────────────────────────

-- Toyota
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Vios'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Innova'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Fortuner'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Hilux'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Wigo'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Rush'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Avanza'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Corolla Cross'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Raize'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Camry'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'Land Cruiser'),
  ((SELECT id FROM vehicle_makes WHERE name='Toyota'), 'HiAce')
ON CONFLICT (make_id, name) DO NOTHING;

-- Honda
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Honda'), 'City'),
  ((SELECT id FROM vehicle_makes WHERE name='Honda'), 'Civic'),
  ((SELECT id FROM vehicle_makes WHERE name='Honda'), 'CR-V'),
  ((SELECT id FROM vehicle_makes WHERE name='Honda'), 'BR-V'),
  ((SELECT id FROM vehicle_makes WHERE name='Honda'), 'HR-V'),
  ((SELECT id FROM vehicle_makes WHERE name='Honda'), 'Brio'),
  ((SELECT id FROM vehicle_makes WHERE name='Honda'), 'Accord'),
  ((SELECT id FROM vehicle_makes WHERE name='Honda'), 'WR-V')
ON CONFLICT (make_id, name) DO NOTHING;

-- Mitsubishi
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Mitsubishi'), 'Mirage'),
  ((SELECT id FROM vehicle_makes WHERE name='Mitsubishi'), 'Mirage G4'),
  ((SELECT id FROM vehicle_makes WHERE name='Mitsubishi'), 'Xpander'),
  ((SELECT id FROM vehicle_makes WHERE name='Mitsubishi'), 'Xpander Cross'),
  ((SELECT id FROM vehicle_makes WHERE name='Mitsubishi'), 'Montero Sport'),
  ((SELECT id FROM vehicle_makes WHERE name='Mitsubishi'), 'Strada'),
  ((SELECT id FROM vehicle_makes WHERE name='Mitsubishi'), 'L300'),
  ((SELECT id FROM vehicle_makes WHERE name='Mitsubishi'), 'Outlander')
ON CONFLICT (make_id, name) DO NOTHING;

-- Nissan
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Nissan'), 'Navara'),
  ((SELECT id FROM vehicle_makes WHERE name='Nissan'), 'Terra'),
  ((SELECT id FROM vehicle_makes WHERE name='Nissan'), 'Almera'),
  ((SELECT id FROM vehicle_makes WHERE name='Nissan'), 'Kicks'),
  ((SELECT id FROM vehicle_makes WHERE name='Nissan'), 'Patrol'),
  ((SELECT id FROM vehicle_makes WHERE name='Nissan'), 'X-Trail')
ON CONFLICT (make_id, name) DO NOTHING;

-- Suzuki
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Suzuki'), 'Ertiga'),
  ((SELECT id FROM vehicle_makes WHERE name='Suzuki'), 'Swift'),
  ((SELECT id FROM vehicle_makes WHERE name='Suzuki'), 'Celerio'),
  ((SELECT id FROM vehicle_makes WHERE name='Suzuki'), 'Dzire'),
  ((SELECT id FROM vehicle_makes WHERE name='Suzuki'), 'Vitara'),
  ((SELECT id FROM vehicle_makes WHERE name='Suzuki'), 'Jimny'),
  ((SELECT id FROM vehicle_makes WHERE name='Suzuki'), 'S-Presso'),
  ((SELECT id FROM vehicle_makes WHERE name='Suzuki'), 'XL7')
ON CONFLICT (make_id, name) DO NOTHING;

-- Hyundai
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Hyundai'), 'Accent'),
  ((SELECT id FROM vehicle_makes WHERE name='Hyundai'), 'Creta'),
  ((SELECT id FROM vehicle_makes WHERE name='Hyundai'), 'Tucson'),
  ((SELECT id FROM vehicle_makes WHERE name='Hyundai'), 'Santa Fe'),
  ((SELECT id FROM vehicle_makes WHERE name='Hyundai'), 'Staria'),
  ((SELECT id FROM vehicle_makes WHERE name='Hyundai'), 'Stargazer')
ON CONFLICT (make_id, name) DO NOTHING;

-- Kia
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Kia'), 'Picanto'),
  ((SELECT id FROM vehicle_makes WHERE name='Kia'), 'Stonic'),
  ((SELECT id FROM vehicle_makes WHERE name='Kia'), 'Seltos'),
  ((SELECT id FROM vehicle_makes WHERE name='Kia'), 'Sportage'),
  ((SELECT id FROM vehicle_makes WHERE name='Kia'), 'Carnival'),
  ((SELECT id FROM vehicle_makes WHERE name='Kia'), 'Sorento')
ON CONFLICT (make_id, name) DO NOTHING;

-- Ford
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Ford'), 'Ranger'),
  ((SELECT id FROM vehicle_makes WHERE name='Ford'), 'Everest'),
  ((SELECT id FROM vehicle_makes WHERE name='Ford'), 'Territory'),
  ((SELECT id FROM vehicle_makes WHERE name='Ford'), 'EcoSport'),
  ((SELECT id FROM vehicle_makes WHERE name='Ford'), 'Expedition')
ON CONFLICT (make_id, name) DO NOTHING;

-- MG
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='MG'), 'ZS'),
  ((SELECT id FROM vehicle_makes WHERE name='MG'), 'MG 5'),
  ((SELECT id FROM vehicle_makes WHERE name='MG'), 'RX5'),
  ((SELECT id FROM vehicle_makes WHERE name='MG'), 'HS'),
  ((SELECT id FROM vehicle_makes WHERE name='MG'), 'MG 4')
ON CONFLICT (make_id, name) DO NOTHING;

-- Geely
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Geely'), 'Coolray'),
  ((SELECT id FROM vehicle_makes WHERE name='Geely'), 'Emgrand'),
  ((SELECT id FROM vehicle_makes WHERE name='Geely'), 'Azkarra'),
  ((SELECT id FROM vehicle_makes WHERE name='Geely'), 'Okavango')
ON CONFLICT (make_id, name) DO NOTHING;

-- Chery
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Chery'), 'Tiggo 2 Pro'),
  ((SELECT id FROM vehicle_makes WHERE name='Chery'), 'Tiggo 5X'),
  ((SELECT id FROM vehicle_makes WHERE name='Chery'), 'Tiggo 7 Pro'),
  ((SELECT id FROM vehicle_makes WHERE name='Chery'), 'Tiggo 8 Pro')
ON CONFLICT (make_id, name) DO NOTHING;

-- Isuzu
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Isuzu'), 'D-Max'),
  ((SELECT id FROM vehicle_makes WHERE name='Isuzu'), 'mu-X'),
  ((SELECT id FROM vehicle_makes WHERE name='Isuzu'), 'Traviz')
ON CONFLICT (make_id, name) DO NOTHING;

-- Mazda
INSERT INTO vehicle_models (make_id, name) VALUES
  ((SELECT id FROM vehicle_makes WHERE name='Mazda'), 'Mazda2'),
  ((SELECT id FROM vehicle_makes WHERE name='Mazda'), 'Mazda3'),
  ((SELECT id FROM vehicle_makes WHERE name='Mazda'), 'CX-5'),
  ((SELECT id FROM vehicle_makes WHERE name='Mazda'), 'CX-30'),
  ((SELECT id FROM vehicle_makes WHERE name='Mazda'), 'CX-8'),
  ((SELECT id FROM vehicle_makes WHERE name='Mazda'), 'BT-50')
ON CONFLICT (make_id, name) DO NOTHING;
