const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const compression = require('compression')
const path = require('path')
const routes = require('./routes')
const db = require('./config/db')
const { notFound, errorHandler } = require('./middleware/errorHandler')
const { createRateLimiter } = require('./middleware/rateLimit')
const systemController = require('./controllers/systemController')
const env = require('./config/env')

const app = express()

function buildCorsOriginChecker() {
  const allowed = new Set(env.corsOrigins)
  const isProduction = env.nodeEnv === 'production'

  return (origin, callback) => {
    // Allow same-origin/curl/server-to-server requests without Origin header.
    if (!origin) return callback(null, true)

    if (!isProduction) {
      return callback(null, true)
    }

    if (allowed.has(origin)) {
      return callback(null, true)
    }

    return callback(new Error('Origin not allowed by CORS'))
  }
}

const corsOptions = {
  origin: buildCorsOriginChecker(),
  credentials: true,
}

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
app.use(cors(corsOptions))
app.use(compression())
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'))
app.use(express.json({ limit: '10mb' }))

// Serve static files from public directory with CORS
app.use('/uploads', cors(corsOptions), express.static(path.join(__dirname, '../public/uploads')))

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
