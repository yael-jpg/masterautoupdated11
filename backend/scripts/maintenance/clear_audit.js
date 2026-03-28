const db = require('./src/config/db');

async function clearAudit() {
  console.log('Starting truncation of Audit Logs...');
  const logs = [
    'audit_logs',
    'configuration_audit_logs',
    'config_change_logs',
    'activity_logs',
    'notification_logs'
  ];
  try {
    for (const table of logs) {
      console.log(`Truncating ${table}...`);
      await db.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
    }
    console.log('Audit logs truncated successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error during truncation:', err);
    process.exit(1);
  }
}

clearAudit();
