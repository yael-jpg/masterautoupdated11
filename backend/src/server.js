const app = require('./app')
const env = require('./config/env')
const { startBackgroundJobs } = require('./scripts/startBackgroundJobs')

app.listen(env.port, () => {
  console.log(`MasterAuto backend running on port ${env.port}`)
})

startBackgroundJobs()
