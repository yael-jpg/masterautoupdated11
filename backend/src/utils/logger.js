const env = require('../config/env')

function write(level, message, meta) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
  }

  if (meta !== undefined) {
    payload.meta = meta
  }

  // Keep logs concise in production while preserving useful context.
  const line = env.nodeEnv === 'production'
    ? JSON.stringify(payload)
    : `${payload.ts} [${level}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`

  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${line}\n`)
    return
  }

  process.stdout.write(`${line}\n`)
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
}
