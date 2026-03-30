const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const path = require('path')
const routes = require('./routes')
const db = require('./config/db')
const { notFound, errorHandler } = require('./middleware/errorHandler')
const { createRateLimiter } = require('./middleware/rateLimit')
const systemController = require('./controllers/systemController')

const app = express()

// Behind Render/Netlify proxies, trust X-Forwarded-* headers.
app.set('trust proxy', 1)

// In production, ensure requests come over HTTPS when behind a proxy.
// (This does not affect local dev; and should be safe on Render where x-forwarded-proto is set.)
app.use((req, res, next) => {
  try {
    const isProd = process.env.NODE_ENV === 'production'
    // req.secure will be set correctly when `trust proxy` is enabled.
    // Use a 308 redirect to preserve method/body for POST requests.
    if (isProd && !req.secure && req.headers.host) {
      return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`)
    }
  } catch (_) {
    // ignore
  }
  return next()
})

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

app.get('/health', systemController.health)
app.get('/uploads-test', systemController.uploadsTest)

app.get('/ready', systemController.ready)

app.use('/api/auth', authRateLimiter)
app.use('/api/portal/auth', authRateLimiter)
app.use('/api', apiRateLimiter)
app.use('/api/public', require('./routes/public'))
app.use('/api/portal', require('./routes/portal'))
app.use('/api', routes)
app.use(notFound)
app.use(errorHandler)

module.exports = app
