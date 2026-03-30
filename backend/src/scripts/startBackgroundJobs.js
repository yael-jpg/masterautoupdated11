const { startAutoCancelJob } = require('../utils/autoCancelJob')

function startBackgroundJobs() {
  startAutoCancelJob()
}

module.exports = {
  startBackgroundJobs,
}
