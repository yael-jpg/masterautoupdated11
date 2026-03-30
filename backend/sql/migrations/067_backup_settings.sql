-- 067: Backup schedule settings
-- Adds general config keys used by the Admin "Database Backup" panel.

INSERT INTO system_config (category, key, value, label, description, value_type)
VALUES
  ('general', 'backup_schedule', 'Daily', 'Backup Schedule', 'Automated backup schedule: Hourly | Daily | Weekly', 'string'),
  ('general', 'last_backup_at', NULL, 'Last Backup Time', 'ISO timestamp of the last successful backup', 'string'),
  ('general', 'last_backup_file', NULL, 'Last Backup File', 'Filename of the last generated backup file', 'string')
ON CONFLICT (category, key) DO NOTHING;
