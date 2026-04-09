const { Pool } = require('pg')
const env = require('./env')

function normalizeDbUrl(dbUrl) {
  if (!dbUrl) return dbUrl

  try {
    const parsed = new URL(dbUrl)
    const mode = parsed.searchParams.get('sslmode')
    const hasCompatFlag = parsed.searchParams.has('uselibpqcompat')

    // Keep existing behavior explicit and silence pg v9 migration warning.
    if ((mode === 'prefer' || mode === 'require' || mode === 'verify-ca') && !hasCompatFlag) {
      parsed.searchParams.set('uselibpqcompat', 'true')
    }

    return parsed.toString()
  } catch {
    return dbUrl
  }
}

const pool = env.dbUrl
  ? new Pool({
      connectionString: normalizeDbUrl(env.dbUrl),
      ssl: { rejectUnauthorized: env.dbSslRejectUnauthorized },
      max: env.dbPoolMax,
      idleTimeoutMillis: env.dbPoolIdleTimeoutMs,
      connectionTimeoutMillis: env.dbPoolConnectionTimeoutMs,
      keepAlive: true,
    })
  : new Pool({
      host: env.dbHost,
      port: env.dbPort,
      user: env.dbUser,
      password: env.dbPassword,
      database: env.dbName,
      max: env.dbPoolMax,
      idleTimeoutMillis: env.dbPoolIdleTimeoutMs,
      connectionTimeoutMillis: env.dbPoolConnectionTimeoutMs,
      keepAlive: true,
    })

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
}
