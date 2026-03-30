// Scheduled backups have been disabled in favor of manual-only SQL downloads.

async function startBackupJob() {
  // no-op
}

async function runScheduledBackup() {
  throw new Error('Scheduled backups are disabled')
}

module.exports = {
  startBackupJob,
  runScheduledBackup,
}
