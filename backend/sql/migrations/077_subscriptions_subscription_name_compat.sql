-- Migration 077: Ensure subscriptions.subscription_name exists for legacy-compatible queries.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS subscription_name TEXT;

-- Backfill from package/service names when available.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'subscription_packages'
  ) THEN
    UPDATE subscriptions s
    SET subscription_name = sp.name
    FROM subscription_packages sp
    WHERE s.subscription_name IS NULL
      AND sp.id = COALESCE(s.package_id, s.subscription_service_id);
  END IF;
END $$;

-- Ensure there is always a readable value.
UPDATE subscriptions
SET subscription_name = COALESCE(subscription_name, 'Subscription')
WHERE subscription_name IS NULL;
