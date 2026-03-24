const { Pool } = require('pg')
const env = require('./env')

const pool = env.dbUrl
  ? new Pool({ connectionString: env.dbUrl })
  : new Pool({
      host: env.dbHost,
      port: env.dbPort,
      user: env.dbUser,
      password: env.dbPassword,
      database: env.dbName,
    })

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
}
