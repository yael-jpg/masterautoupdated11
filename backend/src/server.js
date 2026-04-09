const app = require('./app')
const http = require('http')
const env = require('./config/env')
const { startBackgroundJobs } = require('./scripts/startBackgroundJobs')
const { initializeRealtimeHub } = require('./realtime/hub')
const logger = require('./utils/logger')

const server = http.createServer(app)
initializeRealtimeHub(server)

server.listen(env.port, () => {
  logger.info(`MasterAuto backend running on port ${env.port}`)
})

startBackgroundJobs()
