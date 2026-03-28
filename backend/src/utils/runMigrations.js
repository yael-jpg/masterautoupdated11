const fs = require('fs')
const path = require('path')
const db = require('../config/db')

const MIGRATIONS_DIR = path.resolve(__dirname, '../../sql/migrations')

async function ensureMigrationsTable() {
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `)
}

async function getAppliedMigrations() {
  const res = await db.pool.query('SELECT filename FROM schema_migrations ORDER BY filename ASC')
  return new Set(res.rows.map((r) => r.filename))
}

function listMigrationFiles() {
  const entries = fs.readdirSync(MIGRATIONS_DIR)
  return entries
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
}

async function applyMigration(filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename)
  const sql = fs.readFileSync(fullPath, 'utf8')

  // Some legacy migrations include their own explicit transaction control
  // statements (BEGIN/COMMIT/ROLLBACK). Since this runner also wraps each
  // migration in a transaction, double-wrapping can cause failures.
  //
  // If the migration file contains transaction control statements, we execute
  // it as-is and only record it in schema_migrations on success.
  const hasExplicitTx = /(^|[\r\n])\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*($|[\r\n])/i.test(sql)

  const client = await db.pool.connect()
  try {
    if (hasExplicitTx) {
      await client.query(sql)
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        [filename]
      )
      return
    }

    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        [filename]
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } catch (error) {
    // If an explicit-transaction migration fails mid-transaction, the
    // connection can remain in an aborted transaction state until rolled back.
    try {
      await client.query('ROLLBACK')
    } catch (_) {
      // ignore
    }

    throw new Error(`Migration failed: ${filename}: ${error.message}`)
  } finally {
    client.release()
  }
}

async function run() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`)
  }

  await ensureMigrationsTable()
  const applied = await getAppliedMigrations()
  const files = listMigrationFiles()

  let appliedCount = 0
  for (const filename of files) {
    if (applied.has(filename)) continue
    await applyMigration(filename)
    appliedCount += 1
    console.log(`Applied migration: ${filename}`)
  }

  console.log(`Migrations complete. Applied: ${appliedCount}. Total available: ${files.length}.`)
  await db.pool.end()
}

run().catch(async (error) => {
  console.error(error)
  await db.pool.end()
  process.exit(1)
})
