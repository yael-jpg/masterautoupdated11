-- Migration 077: Ensure subscriptions.subscription_name exists for legacy-compatible queries.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS subscription_name TEXT;

-- Backfill from package/service names when available.
DO $$
DECLARE
  has_package_id BOOLEAN := FALSE;
  has_subscription_service_id BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'package_id'
  ) INTO has_package_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'subscription_service_id'
  ) INTO has_subscription_service_id;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'subscription_packages'
  ) THEN
    IF has_package_id AND has_subscription_service_id THEN
      EXECUTE $sql$
        UPDATE subscriptions s
        SET subscription_name = sp.name
        FROM subscription_packages sp
        WHERE s.subscription_name IS NULL
          AND sp.id = COALESCE(s.package_id, s.subscription_service_id)
      $sql$;
    ELSIF has_package_id THEN
      EXECUTE $sql$
        UPDATE subscriptions s
        SET subscription_name = sp.name
        FROM subscription_packages sp
        WHERE s.subscription_name IS NULL
          AND sp.id = s.package_id
      $sql$;
    ELSIF has_subscription_service_id THEN
      EXECUTE $sql$
        UPDATE subscriptions s
        SET subscription_name = sp.name
        FROM subscription_packages sp
        WHERE s.subscription_name IS NULL
          AND sp.id = s.subscription_service_id
      $sql$;
    END IF;
  END IF;
END $$;

-- Ensure there is always a readable value.
UPDATE subscriptions
SET subscription_name = COALESCE(subscription_name, 'Subscription')
WHERE subscription_name IS NULL;
