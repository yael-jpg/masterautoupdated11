-- 025: Vehicle variants table + seed popular PH variants per model

CREATE TABLE IF NOT EXISTS vehicle_variants (
  id        SERIAL PRIMARY KEY,
  model_id  INT NOT NULL REFERENCES vehicle_models(id) ON DELETE CASCADE,
  name      VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model_id, name)
);

-- ── Helper function for clean inserts ──────────────────────────────────────
-- Insert variants by (make_name, model_name, variant_name)
-- Uses CTEs to resolve IDs cleanly

-- Toyota Vios
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.3 XLE CVT'),('1.3 G CVT'),('1.3 E CVT'),('1.3 E MT'),('1.2 J MT'),('GR-S CVT')
) AS v(name)
WHERE mk.name = 'Toyota' AND vm.name = 'Vios'
ON CONFLICT (model_id, name) DO NOTHING;

-- Toyota Innova
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.8 G AT Diesel'),('2.8 E AT Diesel'),('2.8 E MT Diesel'),('2.0 E AT Gas'),('2.8 GR-S AT'),('Crysta 2.8 V AT')
) AS v(name)
WHERE mk.name = 'Toyota' AND vm.name = 'Innova'
ON CONFLICT (model_id, name) DO NOTHING;

-- Toyota Fortuner
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.8 GR-S 4x4 AT'),('2.8 V 4x2 AT'),('2.8 G 4x4 AT'),('2.8 G 4x2 AT'),('2.7 G 4x2 AT Gas'),('2.4 G 4x2 MT')
) AS v(name)
WHERE mk.name = 'Toyota' AND vm.name = 'Fortuner'
ON CONFLICT (model_id, name) DO NOTHING;

-- Toyota Hilux
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.8 GR Sport 4x4 AT'),('2.8 Conquest 4x4 AT'),('2.8 Conquest 4x2 AT'),('2.4 G 4x2 AT'),('2.4 E 4x2 MT'),('2.8 SR5 4x4 AT')
) AS v(name)
WHERE mk.name = 'Toyota' AND vm.name = 'Hilux'
ON CONFLICT (model_id, name) DO NOTHING;

-- Toyota Wigo
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.0 G AT'),('1.0 G MT'),('1.0 E MT'),('GR-S MT')
) AS v(name)
WHERE mk.name = 'Toyota' AND vm.name = 'Wigo'
ON CONFLICT (model_id, name) DO NOTHING;

-- Toyota Rush
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.5 S AT'),('1.5 G AT'),('1.5 E MT')
) AS v(name)
WHERE mk.name = 'Toyota' AND vm.name = 'Rush'
ON CONFLICT (model_id, name) DO NOTHING;

-- Toyota Raize
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.0 GR-S CVT'),('1.0 Z CVT'),('1.0 G CVT'),('1.0 E CVT')
) AS v(name)
WHERE mk.name = 'Toyota' AND vm.name = 'Raize'
ON CONFLICT (model_id, name) DO NOTHING;

-- Toyota Corolla Cross
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.8 Hybrid Premium CVT'),('1.8 Hybrid CVT'),('1.8 V CVT Gas'),('1.8 G CVT Gas')
) AS v(name)
WHERE mk.name = 'Toyota' AND vm.name = 'Corolla Cross'
ON CONFLICT (model_id, name) DO NOTHING;

-- Honda City
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.5 RS CVT'),('1.5 V CVT'),('1.5 S CVT'),('1.5 E CVT'),('1.5 Hybrid RS CVT')
) AS v(name)
WHERE mk.name = 'Honda' AND vm.name = 'City'
ON CONFLICT (model_id, name) DO NOTHING;

-- Honda Civic
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.5 RS Turbo CVT'),('1.5 V Turbo CVT'),('1.8 E CVT'),('2.0 Type R MT')
) AS v(name)
WHERE mk.name = 'Honda' AND vm.name = 'Civic'
ON CONFLICT (model_id, name) DO NOTHING;

-- Honda CR-V
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.6 S Diesel AT'),('1.6 V Diesel AT 4WD'),('2.0 S CVT Gas'),('2.0 V CVT Gas')
) AS v(name)
WHERE mk.name = 'Honda' AND vm.name = 'CR-V'
ON CONFLICT (model_id, name) DO NOTHING;

-- Honda BR-V
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.5 V CVT'),('1.5 S CVT'),('1.5 S MT')
) AS v(name)
WHERE mk.name = 'Honda' AND vm.name = 'BR-V'
ON CONFLICT (model_id, name) DO NOTHING;

-- Honda Brio
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.2 RS CVT'),('1.2 V CVT'),('1.2 S MT')
) AS v(name)
WHERE mk.name = 'Honda' AND vm.name = 'Brio'
ON CONFLICT (model_id, name) DO NOTHING;

-- Mitsubishi Xpander
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.5 GLS Sport AT'),('1.5 GLS AT'),('1.5 GLX MT'),('Cross 1.5 AT')
) AS v(name)
WHERE mk.name = 'Mitsubishi' AND vm.name = 'Xpander'
ON CONFLICT (model_id, name) DO NOTHING;

-- Mitsubishi Montero Sport
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.4 GLS Premium AT 4WD'),('2.4 GLS AT 4x2'),('2.4 GT AT 4x2'),('2.4 GLX MT 4x2')
) AS v(name)
WHERE mk.name = 'Mitsubishi' AND vm.name = 'Montero Sport'
ON CONFLICT (model_id, name) DO NOTHING;

-- Mitsubishi Mirage G4
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.2 GLS CVT'),('1.2 GLX CVT'),('1.2 GLX MT')
) AS v(name)
WHERE mk.name = 'Mitsubishi' AND vm.name = 'Mirage G4'
ON CONFLICT (model_id, name) DO NOTHING;

-- Nissan Navara
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.5 Pro-4X AT 4WD'),('2.5 EL Calibre AT 4WD'),('2.5 EL AT 4x2'),('2.5 EL MT 4x2'),('2.5 SL AT 4x2')
) AS v(name)
WHERE mk.name = 'Nissan' AND vm.name = 'Navara'
ON CONFLICT (model_id, name) DO NOTHING;

-- Nissan Terra
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.5 VL 4WD AT'),('2.5 VE 4x2 AT'),('2.5 S 4x2 AT'),('2.5 S 4x2 MT')
) AS v(name)
WHERE mk.name = 'Nissan' AND vm.name = 'Terra'
ON CONFLICT (model_id, name) DO NOTHING;

-- Suzuki Ertiga
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.5 GL AT'),('1.5 GL MT'),('1.5 GA MT')
) AS v(name)
WHERE mk.name = 'Suzuki' AND vm.name = 'Ertiga'
ON CONFLICT (model_id, name) DO NOTHING;

-- Suzuki Jimny
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.5 AT 4WD'),('1.5 MT 4WD'),('1.5 GL AT')
) AS v(name)
WHERE mk.name = 'Suzuki' AND vm.name = 'Jimny'
ON CONFLICT (model_id, name) DO NOTHING;

-- Hyundai Accent
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.4 GL MT Gas'),('1.4 GL AT Gas'),('1.6 CRDi GL AT Diesel'),('1.6 CRDi GL MT Diesel')
) AS v(name)
WHERE mk.name = 'Hyundai' AND vm.name = 'Accent'
ON CONFLICT (model_id, name) DO NOTHING;

-- Hyundai Tucson
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.0 GLS AT AWD'),('2.0 GL AT'),('2.0 GL MT'),('1.6 T-GDi AT 4WD')
) AS v(name)
WHERE mk.name = 'Hyundai' AND vm.name = 'Tucson'
ON CONFLICT (model_id, name) DO NOTHING;

-- Kia Picanto
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.2 EX AT'),('1.2 LX AT'),('1.0 LX MT')
) AS v(name)
WHERE mk.name = 'Kia' AND vm.name = 'Picanto'
ON CONFLICT (model_id, name) DO NOTHING;

-- Kia Seltos
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.4 T-GDi EX+ DCT'),('1.4 T-GDi EX DCT'),('1.5 LX IVT')
) AS v(name)
WHERE mk.name = 'Kia' AND vm.name = 'Seltos'
ON CONFLICT (model_id, name) DO NOTHING;

-- Ford Ranger
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.0 Raptor 4WD AT'),('2.0 Wildtrak 4WD AT'),('2.0 Sport 4x2 AT'),('2.0 XLT+ 4x2 AT'),('2.2 XLT AT'),('2.2 XL MT')
) AS v(name)
WHERE mk.name = 'Ford' AND vm.name = 'Ranger'
ON CONFLICT (model_id, name) DO NOTHING;

-- Ford Everest
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.0 Titanium+ 4WD Bi-T AT'),('2.0 Titanium 4x2 AT'),('2.0 Sport 4x2 AT'),('2.0 Ambiente 4x2 AT')
) AS v(name)
WHERE mk.name = 'Ford' AND vm.name = 'Everest'
ON CONFLICT (model_id, name) DO NOTHING;

-- MG ZS
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.5 Alpha CVT'),('1.5 Style CVT'),('1.5 Core CVT'),('EV Luxury'),('EV Excite')
) AS v(name)
WHERE mk.name = 'MG' AND vm.name = 'ZS'
ON CONFLICT (model_id, name) DO NOTHING;

-- Geely Coolray
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('1.5 360T DCT'),('1.5 Premium DCT'),('1.5 Sport DCT')
) AS v(name)
WHERE mk.name = 'Geely' AND vm.name = 'Coolray'
ON CONFLICT (model_id, name) DO NOTHING;

-- Isuzu D-Max
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('3.0 LS-E AT 4WD'),('3.0 LS-A AT 4x2'),('3.0 LS AT 4x2'),('3.0 LT AT 4x2'),('3.0 LT MT 4x2'),('2.5 SX MT 4x2')
) AS v(name)
WHERE mk.name = 'Isuzu' AND vm.name = 'D-Max'
ON CONFLICT (model_id, name) DO NOTHING;

-- Isuzu mu-X
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('3.0 LS-E AT 4WD'),('3.0 LS-A AT 4x2'),('3.0 LS AT 4x2'),('3.0 LT AT 4x2')
) AS v(name)
WHERE mk.name = 'Isuzu' AND vm.name = 'mu-X'
ON CONFLICT (model_id, name) DO NOTHING;

-- Mazda CX-5
INSERT INTO vehicle_variants (model_id, name)
SELECT vm.id, v.name FROM vehicle_models vm
JOIN vehicle_makes mk ON mk.id = vm.make_id
CROSS JOIN (VALUES
  ('2.5 AWD Sport AT'),('2.0 SkyActiv-G FWD AT'),('2.2 SkyActiv-D FWD AT'),('2.5 Turbo AWD AT')
) AS v(name)
WHERE mk.name = 'Mazda' AND vm.name = 'CX-5'
ON CONFLICT (model_id, name) DO NOTHING;
