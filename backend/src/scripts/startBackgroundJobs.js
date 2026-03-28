const { startBackupJob } = require('../utils/backupJob')
const { startAutoCancelJob } = require('../utils/autoCancelJob')

function startBackgroundJobs() {
  startBackupJob()
  startAutoCancelJob()
}

module.exports = {
  startBackgroundJobs,
}
