/**
 * Run migration 040 — reset vehicle_makes to canonical PH brand list.
 * Usage (from the backend/ directory):
 *   node scripts/runMigration040.js
 */
const fs   = require('fs')
const path = require('path')
const db   = require('../src/config/db')

const SQL_FILE = path.resolve(__dirname, '../sql/migrations/040_reset_vehicle_makes.sql')

async function run() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8')

  // Remove single-line comments, split on semicolons, drop empty
  const stripped = sql.replace(/--[^\n]*/g, '')
  const stmts = stripped
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  console.log(`Running ${stmts.length} statement(s) from 040_reset_vehicle_makes.sql …`)

  for (const stmt of stmts) {
    await db.query(stmt)
  }

  // Verify
  const result = await db.query(
    `SELECT name, category, country_origin, is_active
     FROM vehicle_makes
     ORDER BY category, name`
  )

  const active   = result.rows.filter(r => r.is_active)
  const inactive = result.rows.filter(r => !r.is_active)

  console.log(`\n✅ Done.  ${active.length} active  |  ${inactive.length} inactive\n`)
  console.log('Active brands:')
  active.forEach(r => console.log(`  • ${r.name.padEnd(18)} [${r.category}] — ${r.country_origin}`))

  if (inactive.length) {
    console.log('\nInactive (old) brands:')
    inactive.forEach(r => console.log(`  – ${r.name}`))
  }

  await db.pool.end()
}

run().catch(err => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
