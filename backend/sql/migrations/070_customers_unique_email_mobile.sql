-- Enforce customer identity uniqueness (email + mobile) and clean existing data.

-- 1) Normalize stored values
UPDATE customers
SET email = NULL
WHERE email IS NOT NULL AND BTRIM(email) = '';

UPDATE customers
SET email = LOWER(BTRIM(email))
WHERE email IS NOT NULL;

UPDATE customers
SET mobile = BTRIM(mobile)
WHERE mobile IS NOT NULL;

-- 2) Remove duplicate emails by clearing duplicates (keep 1 per email)
-- Prefer keeping the portal-enabled record when present.
WITH ranked AS (
  SELECT
    id,
    LOWER(BTRIM(email)) AS e,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(BTRIM(email))
      ORDER BY (portal_password_hash IS NOT NULL) DESC, id ASC
    ) AS rn
  FROM customers
  WHERE email IS NOT NULL AND BTRIM(email) <> ''
)
UPDATE customers c
SET email = NULL
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- 3) Unique email (case-insensitive). Partial index allows NULL emails.
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_ci
  ON customers ((LOWER(BTRIM(email))))
  WHERE email IS NOT NULL AND BTRIM(email) <> '';

-- 4) Unique mobile by digits-only (best-effort).
-- If duplicates exist after normalization, skip creating the index (migration must not fail).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT regexp_replace(mobile, '\\D', '', 'g') AS md, COUNT(*) AS cnt
      FROM customers
      GROUP BY regexp_replace(mobile, '\\D', '', 'g')
      HAVING regexp_replace(mobile, '\\D', '', 'g') <> '' AND COUNT(*) > 1
    ) d
  ) THEN
    RAISE NOTICE 'Skipping unique mobile index: duplicate mobile numbers exist (digits-only normalization).';
  ELSE
    EXECUTE $m$
      CREATE UNIQUE INDEX IF NOT EXISTS customers_mobile_unique_digits
        ON customers ((regexp_replace(mobile, '\\D', '', 'g')))
        WHERE regexp_replace(mobile, '\\D', '', 'g') <> ''
    $m$;
  END IF;
END $$;
