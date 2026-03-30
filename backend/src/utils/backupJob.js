const cron = require('node-cron')
const db = require('../config/db')
const { createJsonGzipBackup } = require('./dbBackup')

let task = null

function scheduleToCron(schedule) {
  const s = String(schedule || 'Daily').trim()
  if (s === 'Hourly') return '0 * * * *'
  if (s === 'Weekly') return '0 2 * * 0'
  return '0 2 * * *' // Daily (default)
}

async function getBackupScheduleFromDb() {
  try {
    const { rows } = await db.query(
      "SELECT value FROM system_config WHERE category = 'general' AND key = 'backup_schedule'",
    )
    return rows[0]?.value || 'Daily'
  } catch {
    return 'Daily'
  }
}

async function setLastBackupMeta({ fileName }) {
  const nowIso = new Date().toISOString()
  await db.query(
    `INSERT INTO system_config (category, key, value, value_type, updated_at)
     VALUES ('general', 'last_backup_at', $1, 'string', NOW())
     ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [nowIso],
  ).catch(() => {})

  if (fileName) {
    await db.query(
      `INSERT INTO system_config (category, key, value, value_type, updated_at)
       VALUES ('general', 'last_backup_file', $1, 'string', NOW())
       ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [fileName],
    ).catch(() => {})
  }
}

async function runScheduledBackup() {
  const result = await createJsonGzipBackup({ reason: 'scheduled', requestedByUserId: null })
  await setLastBackupMeta({ fileName: result.fileName })
  return result
}

async function startBackupJob() {
  const schedule = await getBackupScheduleFromDb()
  const cronExpr = scheduleToCron(schedule)
  if (task) {
    try { task.stop() } catch { /* ignore */ }
  }
  task = cron.schedule(cronExpr, async () => {
    try {
      await runScheduledBackup()
    } catch (err) {
      console.error('Scheduled backup failed:', err.message || err)
    }
  })
}

module.exports = {
  startBackupJob,
  runScheduledBackup,
}
