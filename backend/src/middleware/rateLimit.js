function createRateLimiter({ windowMs, max, message }) {
  const buckets = new Map()

  return (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl || req.path}`
    const now = Date.now()
    const current = buckets.get(key)

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (current.count >= max) {
      const retryAfter = Math.ceil((current.resetAt - now) / 1000)
      res.setHeader('Retry-After', retryAfter)
      return res.status(429).json({ message })
    }

    current.count += 1
    buckets.set(key, current)
    return next()
  }
}

module.exports = { createRateLimiter }
