/**
 * Run migrations 049 + 050 — promo_codes table and quotations promo columns
 *
 * Usage:
 *   node scripts/runMigration049_050.js
 */
const fs   = require('fs')
const path = require('path')
const db   = require('../src/config/db')

const MIGRATIONS = [
  path.resolve(__dirname, '../sql/migrations/049_promo_codes.sql'),
  path.resolve(__dirname, '../sql/migrations/050_quotations_promo_code.sql'),
]

async function run() {
  for (const filePath of MIGRATIONS) {
    const name = path.basename(filePath)
    const sql = fs.readFileSync(filePath, 'utf8')
    const stripped = sql.replace(/--[^\n]*/g, '')
    const stmts = stripped
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)

    console.log(`\nRunning ${stmts.length} statement(s) from ${name} …`)
    for (const stmt of stmts) {
      await db.query(stmt)
      console.log('  OK:', stmt.slice(0, 80).replace(/\s+/g, ' '))
    }
    console.log(`✓ ${name} complete`)
  }

  console.log('\nAll migrations applied successfully.')
  process.exit(0)
}

run().catch((err) => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
