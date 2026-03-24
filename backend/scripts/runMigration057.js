/**
 * Run migration 057 — add bay (branch) column to customers table.
 * Usage (from the backend/ directory):
 *   node scripts/runMigration057.js
 */
const fs   = require('fs')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const db   = require('../src/config/db')

const SQL_FILE = path.resolve(__dirname, '../sql/migrations/057_customers_bay_column.sql')

async function run() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8')

  const stripped = sql.replace(/--[^\n]*/g, '')
  const stmts = stripped
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  console.log(`Running ${stmts.length} statement(s) from 057_customers_bay_column.sql …`)

  for (const stmt of stmts) {
    await db.query(stmt)
    console.log('  ✓', stmt.substring(0, 60))
  }

  // Verify
  const result = await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'customers' AND column_name = 'bay'`
  )
  if (result.rows.length) {
    console.log('\n✅ Column "bay" successfully added to customers table.')
  } else {
    console.log('\n❌ Column "bay" not found — something may have gone wrong.')
  }

  await db.pool.end()
}

run().catch(e => {
  console.error('\nMigration failed:', e.message)
  process.exit(1)
})
