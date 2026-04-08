-- Realtime core tables for cross-portal synchronization

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  key_name VARCHAR(255) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key_name
  ON system_settings (key_name);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT,
  role VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  payload JSONB,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  -- Support existing schemas that used recipient_role instead of role.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'notifications'
      AND column_name = 'recipient_role'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'notifications'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE notifications RENAME COLUMN recipient_role TO role;
  END IF;
END $$;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id INT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS role VARCHAR(20);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;

UPDATE notifications
SET role = COALESCE(role, 'admin')
WHERE role IS NULL;

UPDATE notifications
SET title = COALESCE(NULLIF(TRIM(title), ''), 'Notification')
WHERE title IS NULL OR TRIM(title) = '';

UPDATE notifications
SET message = COALESCE(NULLIF(TRIM(message), ''), title, 'Notification')
WHERE message IS NULL OR TRIM(message) = '';

ALTER TABLE notifications ALTER COLUMN role SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN title SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN message SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'notifications'
      AND column_name = 'notif_type'
  ) THEN
    ALTER TABLE notifications ALTER COLUMN notif_type SET DEFAULT 'config_updated';
    UPDATE notifications
    SET notif_type = COALESCE(NULLIF(TRIM(notif_type), ''), 'config_updated')
    WHERE notif_type IS NULL OR TRIM(notif_type) = '';
    ALTER TABLE notifications ALTER COLUMN notif_type SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_role_created
  ON notifications (role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);
