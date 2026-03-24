const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const path = require('path')
const routes = require('./routes')
const db = require('./config/db')
const { notFound, errorHandler } = require('./middleware/errorHandler')
const { createRateLimiter } = require('./middleware/rateLimit')

const app = express()

// Configure helmet with relaxed settings for development
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}))
app.use(cors())
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))

// Simple request logger for /api routes to help diagnose 404/401 issues
app.use((req, res, next) => {
  try {
    if (req.path && req.path.startsWith('/api')) {
      const auth = req.headers.authorization || ''
      console.log(`[API] ${req.method} ${req.originalUrl} Authorization:${auth ? 'yes' : 'no'}`)
    }
  } catch (err) {
    // ignore
  }
  next()
})

// Serve static files from public directory with CORS
app.use('/uploads', cors(), express.static(path.join(__dirname, '../public/uploads')))

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: 'Too many authentication attempts. Please try again later.',
})

const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 500,
  message: 'Too many requests. Please slow down.',
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'masterauto-backend' })
})

app.get('/uploads-test', (req, res) => {
  const fs = require('fs')
  const path = require('path')
  const uploadsPath = path.join(__dirname, '../public/uploads/vehicles')
  
  try {
    const files = fs.readdirSync(uploadsPath)
    res.json({ 
      message: 'Uploads directory accessible',
      path: uploadsPath,
      files: files.filter(f => !f.startsWith('.'))
    })
  } catch (error) {
    res.status(500).json({ 
      message: 'Error accessing uploads directory',
      error: error.message 
    })
  }
})

app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1 AS ok')
    return res.json({
      status: 'ready',
      service: 'masterauto-backend',
      checks: {
        database: 'ok',
      },
    })
  } catch (error) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'masterauto-backend',
      checks: {
        database: 'failed',
      },
      message: error.message,
    })
  }
})

app.use('/api/auth', authRateLimiter)
app.use('/api', apiRateLimiter)
app.use('/api/public', require('./routes/public'))
app.use('/api/portal', require('./routes/portal'))
app.use('/api', routes)
app.use(notFound)
app.use(errorHandler)

module.exports = app
