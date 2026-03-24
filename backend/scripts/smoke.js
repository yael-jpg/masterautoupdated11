const app = require('../src/app')
const env = require('../src/config/env')
const db = require('../src/config/db')
const fs = require('fs')
const path = require('path')

async function bootstrapDatabase() {
  const shouldBootstrap = String(process.env.SMOKE_BOOTSTRAP_DB || 'true').toLowerCase() !== 'false'
  if (!shouldBootstrap) {
    return
  }

  const schemaPath = path.resolve(__dirname, '../sql/schema.sql')
  const seedPath = path.resolve(__dirname, '../sql/seed.sql')
  const schemaSql = fs.readFileSync(schemaPath, 'utf8')
  const seedSql = fs.readFileSync(seedPath, 'utf8')

  await db.pool.query(schemaSql)
  await db.pool.query(seedSql)
}

async function assertResponse(response, label) {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${label} failed (${response.status}): ${body}`)
  }
  return response.json().catch(() => ({}))
}

async function runSmoke() {
  await bootstrapDatabase()
  const server = app.listen(0)

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })

    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : env.port
    const baseUrl = `http://127.0.0.1:${port}`

    await assertResponse(await fetch(`${baseUrl}/health`), 'Health endpoint')
    await assertResponse(await fetch(`${baseUrl}/ready`), 'Readiness endpoint')

    const email = process.env.SMOKE_EMAIL || 'superadmin@masterauto.com'
    const password = process.env.SMOKE_PASSWORD || 'admin123'

    const login = await assertResponse(
      await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
      'Auth login',
    )

    const token = login.token
    if (!token) {
      throw new Error('Auth login did not return token')
    }

    await assertResponse(
      await fetch(`${baseUrl}/api/customers?page=1&limit=2`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Protected customers endpoint',
    )

    console.log('Smoke test passed')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await db.pool.end()
  }
}

runSmoke().catch((error) => {
  console.error('Smoke test failed:', error.message)
  process.exit(1)
})
