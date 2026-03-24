-- Migration 041: Add is_active to vehicle_models/variants, add transmission/fuel_type to variants,
--                create vehicle_years table, seed models/variants/years for PH market

-- ─────────────────────────────────────────
-- 1. Alter vehicle_models
-- ─────────────────────────────────────────
ALTER TABLE vehicle_models
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_vehicle_models_make
  ON vehicle_models(make_id);

-- ─────────────────────────────────────────
-- 2. Alter vehicle_variants
-- ─────────────────────────────────────────
ALTER TABLE vehicle_variants
  ADD COLUMN IF NOT EXISTS is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS transmission VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fuel_type    VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_vehicle_variants_model
  ON vehicle_variants(model_id);

-- ─────────────────────────────────────────
-- 3. Create vehicle_years
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_years (
  id         SERIAL PRIMARY KEY,
  variant_id INT  NOT NULL REFERENCES vehicle_variants(id) ON DELETE CASCADE,
  year_model INT  NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(variant_id, year_model)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_years_variant
  ON vehicle_years(variant_id);

-- ─────────────────────────────────────────
-- 4. Seed models, variants, years
-- ─────────────────────────────────────────
DO $$
DECLARE
  -- make IDs
  v_toyota      INT;
  v_mitsubishi  INT;
  v_honda       INT;
  v_ford        INT;
  v_hyundai     INT;
  v_geely       INT;
  v_byd         INT;

  -- model IDs
  m_vios        INT;
  m_hilux       INT;
  m_fortuner    INT;
  m_mirage      INT;
  m_montero     INT;
  m_city        INT;
  m_brv         INT;
  m_ranger      INT;
  m_tucson      INT;
  m_coolray     INT;
  m_atto3       INT;

  -- variant IDs
  vr            INT;
  yr            INT;
BEGIN
  -- ── resolve make IDs ──────────────────────────────────────────────────────
  SELECT id INTO v_toyota     FROM vehicle_makes WHERE LOWER(name) LIKE '%toyota%'     AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_mitsubishi FROM vehicle_makes WHERE LOWER(name) LIKE '%mitsubishi%' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_honda      FROM vehicle_makes WHERE LOWER(name) LIKE '%honda%'      AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_ford       FROM vehicle_makes WHERE LOWER(name) LIKE '%ford%'       AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_hyundai    FROM vehicle_makes WHERE LOWER(name) LIKE '%hyundai%'    AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_geely      FROM vehicle_makes WHERE LOWER(name) LIKE '%geely%'      AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_byd        FROM vehicle_makes WHERE LOWER(name) LIKE '%byd%'        AND is_active = TRUE LIMIT 1;

  -- ── helper: insert model, return id ───────────────────────────────────────
  -- Toyota models
  IF v_toyota IS NOT NULL THEN
    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_toyota, 'Vios', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_vios FROM vehicle_models WHERE make_id = v_toyota AND name = 'Vios' LIMIT 1;

    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_toyota, 'Hilux', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_hilux FROM vehicle_models WHERE make_id = v_toyota AND name = 'Hilux' LIMIT 1;

    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_toyota, 'Fortuner', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_fortuner FROM vehicle_models WHERE make_id = v_toyota AND name = 'Fortuner' LIMIT 1;
  END IF;

  -- Mitsubishi models
  IF v_mitsubishi IS NOT NULL THEN
    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_mitsubishi, 'Mirage G4', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_mirage FROM vehicle_models WHERE make_id = v_mitsubishi AND name = 'Mirage G4' LIMIT 1;

    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_mitsubishi, 'Montero Sport', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_montero FROM vehicle_models WHERE make_id = v_mitsubishi AND name = 'Montero Sport' LIMIT 1;
  END IF;

  -- Honda models
  IF v_honda IS NOT NULL THEN
    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_honda, 'City', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_city FROM vehicle_models WHERE make_id = v_honda AND name = 'City' LIMIT 1;

    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_honda, 'BR-V', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_brv FROM vehicle_models WHERE make_id = v_honda AND name = 'BR-V' LIMIT 1;
  END IF;

  -- Ford models
  IF v_ford IS NOT NULL THEN
    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_ford, 'Ranger', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_ranger FROM vehicle_models WHERE make_id = v_ford AND name = 'Ranger' LIMIT 1;
  END IF;

  -- Hyundai models
  IF v_hyundai IS NOT NULL THEN
    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_hyundai, 'Tucson', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_tucson FROM vehicle_models WHERE make_id = v_hyundai AND name = 'Tucson' LIMIT 1;
  END IF;

  -- Geely models
  IF v_geely IS NOT NULL THEN
    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_geely, 'Coolray', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_coolray FROM vehicle_models WHERE make_id = v_geely AND name = 'Coolray' LIMIT 1;
  END IF;

  -- BYD models
  IF v_byd IS NOT NULL THEN
    INSERT INTO vehicle_models(make_id, name, is_active)
      VALUES(v_byd, 'Atto 3', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO m_atto3 FROM vehicle_models WHERE make_id = v_byd AND name = 'Atto 3' LIMIT 1;
  END IF;

  -- ── VARIANTS & YEARS ──────────────────────────────────────────────────────

  -- ── VIOS (2020-2024) ────────────────────────────────────────────
  IF m_vios IS NOT NULL THEN
    -- 1.3 Base MT
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_vios, '1.3 Base MT', 'Manual', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_vios AND name = '1.3 Base MT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    -- 1.3 XLE CVT
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_vios, '1.3 XLE CVT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_vios AND name = '1.3 XLE CVT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    -- 1.5 G CVT
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_vios, '1.5 G CVT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_vios AND name = '1.5 G CVT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── HILUX (2019-2024) ────────────────────────────────────────────
  IF m_hilux IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_hilux, '2.4 J MT', 'Manual', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_hilux AND name = '2.4 J MT' LIMIT 1;
    FOR yr IN 2019..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_hilux, '2.4 E MT', 'Manual', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_hilux AND name = '2.4 E MT' LIMIT 1;
    FOR yr IN 2019..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_hilux, '2.8 Conquest AT', 'Automatic', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_hilux AND name = '2.8 Conquest AT' LIMIT 1;
    FOR yr IN 2019..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── FORTUNER (2020-2024) ─────────────────────────────────────────
  IF m_fortuner IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_fortuner, '2.4 G AT', 'Automatic', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_fortuner AND name = '2.4 G AT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_fortuner, '2.8 V AT', 'Automatic', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_fortuner AND name = '2.8 V AT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_fortuner, '2.8 LTD AT', 'Automatic', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_fortuner AND name = '2.8 LTD AT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── MIRAGE G4 (2020-2024) ────────────────────────────────────────
  IF m_mirage IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_mirage, 'GLX MT', 'Manual', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_mirage AND name = 'GLX MT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_mirage, 'GLX CVT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_mirage AND name = 'GLX CVT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_mirage, 'GLS CVT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_mirage AND name = 'GLS CVT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── MONTERO SPORT (2020-2024) ────────────────────────────────────
  IF m_montero IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_montero, 'GLX 2WD AT', 'Automatic', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_montero AND name = 'GLX 2WD AT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_montero, 'GLS 2WD AT', 'Automatic', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_montero AND name = 'GLS 2WD AT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_montero, 'GT 4WD AT', 'Automatic', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_montero AND name = 'GT 4WD AT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── CITY (2020-2024) ─────────────────────────────────────────────
  IF m_city IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_city, 'S CVT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_city AND name = 'S CVT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_city, 'V CVT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_city AND name = 'V CVT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_city, 'RS CVT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_city AND name = 'RS CVT' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── BR-V (2022-2024) ─────────────────────────────────────────────
  IF m_brv IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_brv, 'S CVT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_brv AND name = 'S CVT' LIMIT 1;
    FOR yr IN 2022..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_brv, 'V CVT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_brv AND name = 'V CVT' LIMIT 1;
    FOR yr IN 2022..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── RANGER (2019-2024) ───────────────────────────────────────────
  IF m_ranger IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_ranger, 'XL MT', 'Manual', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_ranger AND name = 'XL MT' LIMIT 1;
    FOR yr IN 2019..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_ranger, 'XLT AT', 'Automatic', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_ranger AND name = 'XLT AT' LIMIT 1;
    FOR yr IN 2019..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_ranger, 'Wildtrak AT', 'Automatic', 'Diesel', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_ranger AND name = 'Wildtrak AT' LIMIT 1;
    FOR yr IN 2019..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── TUCSON (2021-2024) ───────────────────────────────────────────
  IF m_tucson IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_tucson, 'GLS AT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_tucson AND name = 'GLS AT' LIMIT 1;
    FOR yr IN 2021..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_tucson, 'Premium AT', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_tucson AND name = 'Premium AT' LIMIT 1;
    FOR yr IN 2021..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── COOLRAY (2020-2024) ──────────────────────────────────────────
  IF m_coolray IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_coolray, 'Comfort', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_coolray AND name = 'Comfort' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_coolray, 'Premium', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_coolray AND name = 'Premium' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_coolray, 'Sport', 'Automatic', 'Gasoline', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_coolray AND name = 'Sport' LIMIT 1;
    FOR yr IN 2020..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── ATTO 3 (2023-2024) ──────────────────────────────────────────
  IF m_atto3 IS NOT NULL THEN
    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_atto3, 'Standard Range', 'Automatic', 'Electric', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_atto3 AND name = 'Standard Range' LIMIT 1;
    FOR yr IN 2023..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO vehicle_variants(model_id, name, transmission, fuel_type, is_active)
      VALUES(m_atto3, 'Extended Range', 'Automatic', 'Electric', TRUE)
      ON CONFLICT DO NOTHING;
    SELECT id INTO vr FROM vehicle_variants WHERE model_id = m_atto3 AND name = 'Extended Range' LIMIT 1;
    FOR yr IN 2023..2024 LOOP
      INSERT INTO vehicle_years(variant_id, year_model) VALUES(vr, yr) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

END $$;
