const app = require('./app')
const env = require('./config/env')
const { startBackupJob } = require('./utils/backupJob')
const { startAutoCancelJob } = require('./utils/autoCancelJob')

app.listen(env.port, () => {
  console.log(`MasterAuto backend running on port ${env.port}`)
})

startBackupJob()
startAutoCancelJob()
