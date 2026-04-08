const app = require('./app')
const http = require('http')
const env = require('./config/env')
const { startBackgroundJobs } = require('./scripts/startBackgroundJobs')
const { initializeRealtimeHub } = require('./realtime/hub')

const server = http.createServer(app)
initializeRealtimeHub(server)

server.listen(env.port, () => {
  console.log(`MasterAuto backend running on port ${env.port}`)
})

startBackgroundJobs()
