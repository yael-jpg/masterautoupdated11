-- Migration 042: Seed popular PH-market models, variants, and years
--               for all remaining active makes (Kia, Nissan, Suzuki, Mazda,
--               Isuzu, Subaru, Chevrolet, BMW, Mercedes-Benz, VW, Audi,
--               Porsche, Land Rover, Mini, Volvo, Peugeot, Chery, MG, GAC,
--               GAC Aion, Foton, Jetour, JMC, Tesla, Tata, Ferrari,
--               Lamborghini, Maserati)

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers (dropped at end of transaction)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _get_make_id(p_pattern TEXT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v INT;
BEGIN
  SELECT id INTO v FROM vehicle_makes
  WHERE LOWER(name) LIKE LOWER(p_pattern) AND is_active = TRUE
  LIMIT 1;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION _seed_model(p_make_id INT, p_model TEXT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v INT;
BEGIN
  IF p_make_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO vehicle_models(make_id, name, is_active)
    VALUES(p_make_id, p_model, TRUE)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v FROM vehicle_models
    WHERE make_id = p_make_id AND name = p_model;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION _seed_variant(
  p_model_id INT, p_name TEXT, p_trans TEXT, p_fuel TEXT,
  p_yr_from INT, p_yr_to INT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v INT; yr INT;
BEGIN
  IF p_model_id IS NULL THEN RETURN; END IF;
  INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
    VALUES(p_model_id, p_name, p_trans, p_fuel, TRUE)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v FROM vehicle_variants
    WHERE model_id = p_model_id AND name = p_name;
  FOR yr IN p_yr_from..p_yr_to LOOP
    INSERT INTO vehicle_years(variant_id, year_model)
      VALUES(v, yr) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  mk INT;
  md INT;
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- KIA
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%kia%');

md := _seed_model(mk, 'Picanto');
PERFORM _seed_variant(md, 'LX MT',   'Manual',    'Gasoline', 2019, 2024);
PERFORM _seed_variant(md, 'EX CVT',  'Automatic', 'Gasoline', 2019, 2024);

md := _seed_model(mk, 'Stonic');
PERFORM _seed_variant(md, 'LX MT',   'Manual',    'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'EX CVT',  'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Seltos');
PERFORM _seed_variant(md, 'LX CVT',  'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'EX+ CVT', 'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'Sportage');
PERFORM _seed_variant(md, 'LX AT',   'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'EX AT',   'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Carnival');
PERFORM _seed_variant(md, 'EX AT',   'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'SX AT',   'Automatic', 'Gasoline', 2021, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- NISSAN
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%nissan%');

md := _seed_model(mk, 'Almera');
PERFORM _seed_variant(md, 'E MT',    'Manual',    'Gasoline', 2019, 2024);
PERFORM _seed_variant(md, 'V CVT',   'Automatic', 'Gasoline', 2019, 2024);

md := _seed_model(mk, 'Terra');
PERFORM _seed_variant(md, 'VE AT',   'Automatic', 'Diesel',   2019, 2024);
PERFORM _seed_variant(md, 'VL AT',   'Automatic', 'Diesel',   2019, 2024);

md := _seed_model(mk, 'Navara');
PERFORM _seed_variant(md, 'EL AT',   'Automatic', 'Diesel',   2019, 2024);
PERFORM _seed_variant(md, 'VL AT',   'Automatic', 'Diesel',   2019, 2024);

md := _seed_model(mk, 'Kicks');
PERFORM _seed_variant(md, 'E CVT',   'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'V CVT',   'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'Patrol');
PERFORM _seed_variant(md, 'Ti AT',   'Automatic', 'Gasoline', 2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- SUZUKI
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%suzuki%');

md := _seed_model(mk, 'Ertiga');
PERFORM _seed_variant(md, 'GA MT',   'Manual',    'Gasoline', 2019, 2024);
PERFORM _seed_variant(md, 'GL AT',   'Automatic', 'Gasoline', 2019, 2024);

md := _seed_model(mk, 'XL7');
PERFORM _seed_variant(md, 'GL AT',   'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'GLX AT',  'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Swift');
PERFORM _seed_variant(md, 'GA MT',   'Manual',    'Gasoline', 2019, 2024);
PERFORM _seed_variant(md, 'GL AT',   'Automatic', 'Gasoline', 2019, 2024);

md := _seed_model(mk, 'Jimny');
PERFORM _seed_variant(md, 'GL MT',   'Manual',    'Gasoline', 2019, 2024);
PERFORM _seed_variant(md, 'GLX AT',  'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'S-Presso');
PERFORM _seed_variant(md, 'GA AGS',  'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'GL AGS',  'Automatic', 'Gasoline', 2021, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- MAZDA
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%mazda%');

md := _seed_model(mk, 'Mazda 2');
PERFORM _seed_variant(md, 'V Sedan AT',      'Automatic', 'Gasoline', 2019, 2024);
PERFORM _seed_variant(md, 'Speed HB AT',     'Automatic', 'Gasoline', 2019, 2024);

md := _seed_model(mk, 'Mazda 3');
PERFORM _seed_variant(md, 'Sedan AT',        'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Fastback AT',     'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'CX-3');
PERFORM _seed_variant(md, 'Sport Plus AT',   'Automatic', 'Gasoline', 2019, 2024);

md := _seed_model(mk, 'CX-30');
PERFORM _seed_variant(md, 'Touring AT',      'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'Carbon Edition AT','Automatic','Gasoline', 2022, 2024);

md := _seed_model(mk, 'CX-5');
PERFORM _seed_variant(md, 'Sport AT',        'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Touring AT',      'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'AWD AT',          'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'BT-50');
PERFORM _seed_variant(md, 'XTR AT',          'Automatic', 'Diesel', 2021, 2024);
PERFORM _seed_variant(md, 'Thunder AT',      'Automatic', 'Diesel', 2021, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- ISUZU
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%isuzu%');

md := _seed_model(mk, 'D-Max');
PERFORM _seed_variant(md, 'LS 4x2 MT',      'Manual',    'Diesel', 2019, 2024);
PERFORM _seed_variant(md, 'LS 4x2 AT',      'Automatic', 'Diesel', 2019, 2024);
PERFORM _seed_variant(md, 'LS-E 4x4 AT',    'Automatic', 'Diesel', 2020, 2024);

md := _seed_model(mk, 'mu-X');
PERFORM _seed_variant(md, 'LS-A 4x2 AT',    'Automatic', 'Diesel', 2019, 2024);
PERFORM _seed_variant(md, 'LS-E 4x4 AT',    'Automatic', 'Diesel', 2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- SUBARU
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%subaru%');

md := _seed_model(mk, 'Forester');
PERFORM _seed_variant(md, '2.0i-L CVT',     'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, '2.0i-S CVT',     'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'XV');
PERFORM _seed_variant(md, '2.0i CVT',       'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, '2.0i-S CVT',     'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Outback');
PERFORM _seed_variant(md, 'EyeSight CVT',   'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'WRX');
PERFORM _seed_variant(md, 'Premium CVT',    'Automatic', 'Gasoline', 2022, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- CHEVROLET
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%chevrolet%');

md := _seed_model(mk, 'Trailblazer');
PERFORM _seed_variant(md, 'LT AT',          'Automatic', 'Diesel', 2019, 2024);
PERFORM _seed_variant(md, 'LTZ AT',         'Automatic', 'Diesel', 2019, 2024);

md := _seed_model(mk, 'Colorado');
PERFORM _seed_variant(md, 'LT AT',          'Automatic', 'Diesel', 2019, 2024);
PERFORM _seed_variant(md, 'LTZ AT',         'Automatic', 'Diesel', 2019, 2024);
PERFORM _seed_variant(md, 'High Country AT','Automatic', 'Diesel', 2019, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- BMW
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%bmw%');

md := _seed_model(mk, '118i');
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, '318i');
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Sport AT',       'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, '520i');
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Sport AT',       'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'X1');
PERFORM _seed_variant(md, 'sDrive18i AT',   'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'X3');
PERFORM _seed_variant(md, 'xDrive20i AT',   'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'X5');
PERFORM _seed_variant(md, 'xDrive30d AT',   'Automatic', 'Diesel',   2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- MERCEDES-BENZ
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%mercedes%');

md := _seed_model(mk, 'A 180');
PERFORM _seed_variant(md, 'Progressive AT', 'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'C 200');
PERFORM _seed_variant(md, 'Avantgarde AT',  'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'AMG Line AT',    'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'E 200');
PERFORM _seed_variant(md, 'Avantgarde AT',  'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'GLC 200');
PERFORM _seed_variant(md, 'AMG Line AT',    'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'GLE 450');
PERFORM _seed_variant(md, '4MATIC AT',      'Automatic', 'Gasoline', 2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- VOLKSWAGEN
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%volkswagen%');

md := _seed_model(mk, 'Polo');
PERFORM _seed_variant(md, 'Comfortline AT', 'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Highline AT',    'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Golf');
PERFORM _seed_variant(md, 'Style AT',       'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'T-Cross');
PERFORM _seed_variant(md, 'TSI AT',         'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'Tiguan');
PERFORM _seed_variant(md, 'TSI AT',         'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Allspace AT',    'Automatic', 'Gasoline', 2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- AUDI
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%audi%');

md := _seed_model(mk, 'A3');
PERFORM _seed_variant(md, 'Sportback AT',   'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'A4');
PERFORM _seed_variant(md, '35 TFSI AT',     'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Q3');
PERFORM _seed_variant(md, '35 TFSI AT',     'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Q5');
PERFORM _seed_variant(md, '45 TFSI AT',     'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Q7');
PERFORM _seed_variant(md, '55 TFSI AT',     'Automatic', 'Gasoline', 2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- PORSCHE
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%porsche%');

md := _seed_model(mk, 'Macan');
PERFORM _seed_variant(md, 'AT',             'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'S AT',           'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Cayenne');
PERFORM _seed_variant(md, 'AT',             'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'E-Hybrid AT',    'Automatic', 'Hybrid',   2021, 2024);

md := _seed_model(mk, '911');
PERFORM _seed_variant(md, 'Carrera AT',     'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Carrera S AT',   'Automatic', 'Gasoline', 2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- LAND ROVER
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%land rover%');

md := _seed_model(mk, 'Defender');
PERFORM _seed_variant(md, '90 SE AT',       'Automatic', 'Diesel',   2021, 2024);
PERFORM _seed_variant(md, '110 SE AT',      'Automatic', 'Diesel',   2021, 2024);
PERFORM _seed_variant(md, '110 X AT',       'Automatic', 'Diesel',   2021, 2024);

md := _seed_model(mk, 'Discovery Sport');
PERFORM _seed_variant(md, 'SE AT',          'Automatic', 'Diesel',   2020, 2024);
PERFORM _seed_variant(md, 'HSE AT',         'Automatic', 'Diesel',   2020, 2024);

md := _seed_model(mk, 'Range Rover Sport');
PERFORM _seed_variant(md, 'SE AT',          'Automatic', 'Diesel',   2020, 2024);
PERFORM _seed_variant(md, 'HSE Dynamic AT', 'Automatic', 'Diesel',   2020, 2024);

md := _seed_model(mk, 'Range Rover');
PERFORM _seed_variant(md, 'SE AT',          'Automatic', 'Diesel',   2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- MINI
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%mini%');

md := _seed_model(mk, 'Cooper');
PERFORM _seed_variant(md, '3-door AT',      'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'S 3-door AT',    'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Countryman');
PERFORM _seed_variant(md, 'Cooper AT',      'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Cooper S AT',    'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Clubman');
PERFORM _seed_variant(md, 'Cooper AT',      'Automatic', 'Gasoline', 2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- VOLVO
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%volvo%');

md := _seed_model(mk, 'XC40');
PERFORM _seed_variant(md, 'B3 Momentum AT',    'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'T5 AWD R-Design AT','Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'Recharge Pure Electric','Automatic','Electric',2022, 2024);

md := _seed_model(mk, 'XC60');
PERFORM _seed_variant(md, 'B5 AWD AT',         'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'XC90');
PERFORM _seed_variant(md, 'B5 AWD AT',         'Automatic', 'Gasoline', 2021, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- PEUGEOT
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%peugeot%');

md := _seed_model(mk, '2008');
PERFORM _seed_variant(md, 'Allure AT',      'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'GT AT',          'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, '3008');
PERFORM _seed_variant(md, 'Allure AT',      'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'GT AT',          'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, '5008');
PERFORM _seed_variant(md, 'Allure AT',      'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'GT AT',          'Automatic', 'Gasoline', 2021, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- CHERY
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%chery%');

md := _seed_model(mk, 'Tiggo 5x');
PERFORM _seed_variant(md, 'Comfort AT',     'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'Tiggo 7 Pro');
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2022, 2024);
PERFORM _seed_variant(md, 'Royale AT',      'Automatic', 'Gasoline', 2022, 2024);

md := _seed_model(mk, 'Tiggo 8 Pro');
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2022, 2024);
PERFORM _seed_variant(md, 'Royale AT',      'Automatic', 'Gasoline', 2022, 2024);

md := _seed_model(mk, 'Omoda 5');
PERFORM _seed_variant(md, 'Comfort AT',     'Automatic', 'Gasoline', 2023, 2024);
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2023, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- MG
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%mg%');

md := _seed_model(mk, 'ZS');
PERFORM _seed_variant(md, 'Alpha AT',       'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Trophy AT',      'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'MG 5');
PERFORM _seed_variant(md, 'Alpha AT',       'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'Trophy AT',      'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'HS');
PERFORM _seed_variant(md, 'Alpha AT',       'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'Trophy AT',      'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'MG One');
PERFORM _seed_variant(md, 'Comfort AT',     'Automatic', 'Gasoline', 2023, 2024);
PERFORM _seed_variant(md, 'Trophy AT',      'Automatic', 'Gasoline', 2023, 2024);

md := _seed_model(mk, 'VS');
PERFORM _seed_variant(md, 'Alpha AT',       'Automatic', 'Gasoline', 2019, 2022);

-- ══════════════════════════════════════════════════════════════════════════════
-- GAC
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('gac');

md := _seed_model(mk, 'GS3');
PERFORM _seed_variant(md, 'Comfort AT',     'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'GS5');
PERFORM _seed_variant(md, 'Comfort AT',     'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'GS8');
PERFORM _seed_variant(md, 'Comfort AT',     'Automatic', 'Gasoline', 2021, 2024);
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'GN8');
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2022, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- GAC AION
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%aion%');

md := _seed_model(mk, 'Aion Y');
PERFORM _seed_variant(md, 'Standard AT',    'Automatic', 'Electric', 2022, 2024);
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Electric', 2022, 2024);

md := _seed_model(mk, 'Aion S');
PERFORM _seed_variant(md, 'Standard AT',    'Automatic', 'Electric', 2023, 2024);
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Electric', 2023, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- FOTON
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%foton%');

md := _seed_model(mk, 'Thunder');
PERFORM _seed_variant(md, 'Expedition AT',  'Automatic', 'Diesel', 2019, 2024);
PERFORM _seed_variant(md, 'Typhoon AT',     'Automatic', 'Diesel', 2020, 2024);

md := _seed_model(mk, 'View Transvan');
PERFORM _seed_variant(md, 'Comfort MT',     'Manual',    'Diesel', 2019, 2024);

md := _seed_model(mk, 'Toano');
PERFORM _seed_variant(md, 'Comfort MT',     'Manual',    'Diesel', 2021, 2024);
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Diesel', 2022, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- JETOUR
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%jetour%');

md := _seed_model(mk, 'Dashing');
PERFORM _seed_variant(md, 'Comfort AT',     'Automatic', 'Gasoline', 2022, 2024);
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2022, 2024);

md := _seed_model(mk, 'X70');
PERFORM _seed_variant(md, 'Comfort AT',     'Automatic', 'Gasoline', 2022, 2024);
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Gasoline', 2022, 2024);

md := _seed_model(mk, 'Traveller');
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Diesel', 2023, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- JMC
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%jmc%');

md := _seed_model(mk, 'Vigus Pro');
PERFORM _seed_variant(md, 'XL AT',          'Automatic', 'Diesel', 2022, 2024);
PERFORM _seed_variant(md, 'XLT AT',         'Automatic', 'Diesel', 2022, 2024);

md := _seed_model(mk, 'Conquer');
PERFORM _seed_variant(md, 'Luxury AT',      'Automatic', 'Diesel', 2023, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- TESLA
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%tesla%');

md := _seed_model(mk, 'Model 3');
PERFORM _seed_variant(md, 'Standard Range AT',  'Automatic', 'Electric', 2021, 2024);
PERFORM _seed_variant(md, 'Long Range AWD AT',  'Automatic', 'Electric', 2021, 2024);
PERFORM _seed_variant(md, 'Performance AWD AT', 'Automatic', 'Electric', 2021, 2024);

md := _seed_model(mk, 'Model Y');
PERFORM _seed_variant(md, 'Standard Range AT',  'Automatic', 'Electric', 2022, 2024);
PERFORM _seed_variant(md, 'Long Range AWD AT',  'Automatic', 'Electric', 2022, 2024);
PERFORM _seed_variant(md, 'Performance AWD AT', 'Automatic', 'Electric', 2022, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- TATA
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%tata%');

md := _seed_model(mk, 'Ace');
PERFORM _seed_variant(md, 'Hi-Deck FB MT',  'Manual', 'Diesel', 2019, 2024);

md := _seed_model(mk, 'Xenon');
PERFORM _seed_variant(md, 'Double Cab MT',  'Manual', 'Diesel', 2019, 2023);

-- ══════════════════════════════════════════════════════════════════════════════
-- FERRARI
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%ferrari%');

md := _seed_model(mk, 'Roma');
PERFORM _seed_variant(md, 'AT',             'Automatic', 'Gasoline', 2021, 2024);

md := _seed_model(mk, 'SF90 Stradale');
PERFORM _seed_variant(md, 'AT',             'Automatic', 'Hybrid',   2021, 2024);
PERFORM _seed_variant(md, 'Spider AT',      'Automatic', 'Hybrid',   2022, 2024);

md := _seed_model(mk, '296 GTB');
PERFORM _seed_variant(md, 'AT',             'Automatic', 'Hybrid',   2022, 2024);

md := _seed_model(mk, 'F8 Tributo');
PERFORM _seed_variant(md, 'AT',             'Automatic', 'Gasoline', 2020, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- LAMBORGHINI
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%lamborghini%');

md := _seed_model(mk, 'Huracan');
PERFORM _seed_variant(md, 'Evo AT',         'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Evo Spyder AT',  'Automatic', 'Gasoline', 2020, 2024);

md := _seed_model(mk, 'Urus');
PERFORM _seed_variant(md, 'AT',             'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'S AT',           'Automatic', 'Gasoline', 2023, 2024);

md := _seed_model(mk, 'Revuelto');
PERFORM _seed_variant(md, 'AT',             'Automatic', 'Hybrid',   2024, 2024);

-- ══════════════════════════════════════════════════════════════════════════════
-- MASERATI
-- ══════════════════════════════════════════════════════════════════════════════
mk := _get_make_id('%maserati%');

md := _seed_model(mk, 'Ghibli');
PERFORM _seed_variant(md, 'GT AT',          'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'GT Diesel AT',   'Automatic', 'Diesel',   2020, 2024);

md := _seed_model(mk, 'Levante');
PERFORM _seed_variant(md, 'GT AT',          'Automatic', 'Gasoline', 2020, 2024);
PERFORM _seed_variant(md, 'Modena AT',      'Automatic', 'Gasoline', 2022, 2024);

md := _seed_model(mk, 'GranTurismo');
PERFORM _seed_variant(md, 'Modena AT',      'Automatic', 'Gasoline', 2023, 2024);
PERFORM _seed_variant(md, 'Folgore AT',     'Automatic', 'Electric',  2024, 2024);

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Drop helpers
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS _seed_variant(INT, TEXT, TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS _seed_model(INT, TEXT);
DROP FUNCTION IF EXISTS _get_make_id(TEXT);
